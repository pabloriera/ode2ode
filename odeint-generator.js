let debug = true;

function rungeKutta4(f, y, t, h, parameters, debug = false) {
    const y_curr = new Float64Array(y.length);

    // Debug output
    if (debug) console.log('parameters:', Array.from(parameters).join(', '));
    if (debug) console.log('h:', h);

    if (debug) console.log('Before k1:', Array.from(y).join(', '));
    const k1 = f(t, y, parameters);
    if (debug) console.log('k1:', Array.from(k1).join(', '));

    for (let i = 0; i < y.length; i++)
        y_curr[i] = y[i] + k1[i] * 0.5 * h;

    if (debug) console.log('Before k2:', Array.from(y_curr).join(', '));
    const k2 = f(t + h / 2, y_curr, parameters);
    if (debug) console.log('k2:', Array.from(k2).join(', '));

    for (let i = 0; i < y.length; i++)
        y_curr[i] = y[i] + k2[i] * 0.5 * h;

    if (debug) console.log('Before k3:', Array.from(y_curr).join(', '));
    const k3 = f(t + h / 2, y_curr, parameters);
    if (debug) console.log('k3:', Array.from(k3).join(', '));

    for (let i = 0; i < y.length; i++)
        y_curr[i] = y[i] + k3[i] * h;

    if (debug) console.log('Before k4:', Array.from(y_curr).join(', '));
    const k4 = f(t + h, y_curr, parameters);
    if (debug) console.log('k4:', Array.from(k4).join(', '));

    for (let i = 0; i < y.length; i++) {
        y[i] += h * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6;
    }

    if (debug) console.log('y:', Array.from(y).join(', '));
}

//Euler integration
function euler(f, y, t, h, parameters) {
    const k1 = f(t, y, parameters);
    for (let i = 0; i < y.length; i++)
        y[i] += k1[i] * h;
}


class ODEIntProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();

        // Initialize WebAssembly
        (async() => {
            try {
                await this.initializeWasm(options.processorOptions.wasmBytes);

                // Test the equation 5 times with proper buffer access
                if (debug) {
                    console.log(Array.from(this.y).join(', '));
                    console.log(Array.from(this.parameterValues).join(', '));
                    const result = this.equation_fn(0, this.y, this.parameterValues);
                    console.log(Array.from(result).join(', '));


                    // Test 10 times the equation with selected integration method
                    // Use copy of y to avoid modifying the original state
                    const yCopy = new Float64Array(this.y);
                    for (let i = 0; i < 10; i++) {
                        this.integrationMethod(this.equation_fn, yCopy, 0, 1 / this.sampleRate, this.parameterValues);
                        console.log(Array.from(yCopy).join(', '));
                    }

                    // Log debugging info
                    console.log('WASM debug:', {
                        yValues: Array.from(this.y),
                        paramValues: Array.from(this.parameterValues),
                        result: Array.from(result)
                    });
                }

            } catch (error) {
                console.error('Initialization error:', error);
                this.port.postMessage({
                    type: 'error',
                    message: 'Initialization failed: ' + error.message
                });
            }
        })();

        console.log(options.processorOptions);

        this.initialized = false;
        // Initialize basic properties
        this.customParameters = options.processorOptions.parameters || {};
        this.parameterValues = new Float64Array(Object.values(this.customParameters));

        // Set integration method (default to RK4)
        this.integrationMethod = options.processorOptions.method === 'euler' ? euler : rungeKutta4;

        const varNames = Object.keys(options.processorOptions.equations);
        this.numVariables = varNames.length;

        // Convert initialValues dictionary to array using equation keys to maintain order
        this.initialValuesArray = varNames.map(varName => {
            const value = Number(options.processorOptions.initialValues[varName]);
            if (isNaN(value)) {
                throw new Error(`Invalid initial value for ${varName}: ${initialValues[varName]}`);
            }
            return value;
        });
        this.y = new Float64Array(this.initialValuesArray);

        this.sampleRate = 44100;
        this.numChannels = 2;

        this.port.onmessage = (event) => {
            if (debug) console.log('Received message:', event.data);
            if (event.data.type === 'updateParameters') {
                this.parameterValues = new Float64Array(Object.values(event.data.parameters));
                this.detuning = event.data.detuning;
                if (debug) console.log('Updated parameters:', Array.from(this.parameterValues).join(', '));
            }
            if (event.data.type === 'resetInitialConditions') {
                if (debug) console.log('Reset initial conditions:', Array.from(event.data.initialValues).join(', '));
                this.reset = true;

            }
        };



        // Log initialization values
        console.log('Initializing ODEIntProcessor with:', {
            parameters: this.customParameters,
            parameterValues: this.parameterValues,
            y: this.y,
            sampleRate: this.sampleRate,
            integrationMethod: this.integrationMethod === euler ? 'euler' : 'rk4',
            timeScale: options.processorOptions.timeScale
        });


        this.firstTime = true;
        this.t = 0;
        this.h = options.processorOptions.timeScale / this.sampleRate;
        this.detuning = 1;

    }

    async initializeWasm(wasmBytes) {
        try {
            const wasmModule = await WebAssembly.instantiate(wasmBytes, {
                env: {}
            });

            this.memory = wasmModule.instance.exports.memory;
            this.equation_wasm = wasmModule.instance.exports.evaluate;

            // Allocate space in WebAssembly memory
            const yOffset = 0;
            const paramOffset = this.numVariables * 8;
            const resultOffset = paramOffset + this.numVariables * 8;

            //Wrapper to equation_fn that manage input and output memory seting and reading
            this.equation_fn = (t, y, p) => {
                // Reuse the same views instead of creating new ones each time
                if (!this._memoryView) {
                    this._memoryView = new Float64Array(this.memory.buffer);
                    this._resultView = new Float64Array(this.memory.buffer, resultOffset, this.y.length);
                }

                // Copy input values into WebAssembly memory
                this._memoryView.set(y, yOffset / 8);
                this._memoryView.set(p, paramOffset / 8);

                // Call the equation function
                this.equation_wasm(t, yOffset, paramOffset, resultOffset);

                // Return a copy of the pre-created view of result
                return new Float64Array(this._resultView);
            }


            this.initialized = true;
            console.log('WebAssembly initialized successfully');
            this.port.postMessage({ type: 'ready' });
        } catch (error) {
            console.error('WASM initialization failed:', error);
            this.port.postMessage({ type: 'error', message: error.toString() });
        }

    }

    process(inputs, outputs, parameters) {
        if (!this.initialized || !this.equation_fn) {
            // Fill all outputs with zeros until initialized, for outputs, for channels
            for (let i = 0; i < outputs.length; i++) {
                for (let j = 0; j < outputs[i].length; j++) {
                    outputs[i][j].fill(0);
                }
            }
            return true;
        }

        if (this.reset) {
            this.y = new Float64Array(this.initialValuesArray);
            this.reset = false;
        }

        // Get the current h value based on detuning
        const h = this.h * this.detuning;

        for (let i = 0; i < outputs[0][0].length; i++) {
            if (debug && this.firstTime) {
                console.log("y:", Array.from(this.y).join(', '));
                if (i === 10) {
                    this.firstTime = false;
                }
            }

            this.integrationMethod(this.equation_fn, this.y, this.t, h, this.parameterValues);
            this.t += h;

            // Copy each variable to its corresponding channel
            for (let k = 0; k < outputs.length; k++) {
                for (let channel = 0; channel < this.numChannels; channel++) {
                    outputs[k][channel][i] = this.y[k];
                }
            }
        }

        return true;
    }
}

registerProcessor('odeint-generator', ODEIntProcessor);