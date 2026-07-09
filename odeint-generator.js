const debug = false;

function rungeKutta4(f, y, t, h, parameters) {
    const yCurrent = new Float64Array(y.length);
    const k1 = f(t, y, parameters);

    for (let index = 0; index < y.length; index += 1) {
        yCurrent[index] = y[index] + k1[index] * 0.5 * h;
    }

    const k2 = f(t + h / 2, yCurrent, parameters);

    for (let index = 0; index < y.length; index += 1) {
        yCurrent[index] = y[index] + k2[index] * 0.5 * h;
    }

    const k3 = f(t + h / 2, yCurrent, parameters);

    for (let index = 0; index < y.length; index += 1) {
        yCurrent[index] = y[index] + k3[index] * h;
    }

    const k4 = f(t + h, yCurrent, parameters);

    for (let index = 0; index < y.length; index += 1) {
        y[index] += h * (k1[index] + 2 * k2[index] + 2 * k3[index] + k4[index]) / 6;
    }
}

function euler(f, y, t, h, parameters) {
    const k1 = f(t, y, parameters);
    for (let index = 0; index < y.length; index += 1) {
        y[index] += k1[index] * h;
    }
}

class ODEIntProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();

        const processorOptions = options.processorOptions;
        this.initialized = false;
        this.variableNames = Object.keys(processorOptions.equations);
        this.numVariables = this.variableNames.length;
        this.parameterValues = Float64Array.from(processorOptions.parameters || []);
        this.parameterCount = this.parameterValues.length;
        this.integrationMethod = processorOptions.method === 'euler' ? euler : rungeKutta4;
        this.initialValuesArray = this.variableNames.map(variableName => {
            const value = Number(processorOptions.initialValues[variableName]);
            if (!Number.isFinite(value)) {
                throw new Error(`Invalid initial value for ${variableName}: ${processorOptions.initialValues[variableName]}`);
            }
            return value;
        });

        this.y = new Float64Array(this.initialValuesArray);
        this.sampleRate = globalThis.sampleRate || 44100;
        this.numChannels = 2;
        this.detuning = 1;
        this.t = 0;
        this.h = (processorOptions.timeScale ?? 1) / this.sampleRate;
        this.reset = false;

        this.port.onmessage = event => {
            if (debug) console.log('Received message:', event.data);

            if (event.data.type === 'updateParameters') {
                if (Array.isArray(event.data.parameters)) {
                    this.parameterValues = Float64Array.from(event.data.parameters);
                    this.parameterCount = this.parameterValues.length;
                }
                this.detuning = event.data.detuning ?? this.detuning;
            }

            if (event.data.type === 'resetInitialConditions') {
                if (event.data.initialValues) {
                    this.initialValuesArray = this.variableNames.map(variableName => {
                        const value = Number(event.data.initialValues[variableName]);
                        if (!Number.isFinite(value)) {
                            throw new Error(`Invalid reset initial value for ${variableName}`);
                        }
                        return value;
                    });
                }
                this.reset = true;
            }
        };

        (async () => {
            try {
                await this.initializeWasm(processorOptions.wasmBytes);
            } catch (error) {
                console.error('Initialization error:', error);
                this.port.postMessage({
                    type: 'error',
                    message: 'Initialization failed: ' + error.message
                });
            }
        })();
    }

    refreshMemoryViews() {
        if (!this._memoryView || this._memoryView.buffer !== this.memory.buffer) {
            this._memoryView = new Float64Array(this.memory.buffer);
            this._resultView = new Float64Array(this.memory.buffer, this.resultOffset, this.numVariables);
        }
    }

    async initializeWasm(wasmBytes) {
        const wasmModule = await WebAssembly.instantiate(wasmBytes, { env: {} });
        this.memory = wasmModule.instance.exports.memory;
        this.equationWasm = wasmModule.instance.exports.evaluate;
        this.yOffset = 0;
        this.paramOffset = this.yOffset + this.numVariables * 8;
        this.resultOffset = this.paramOffset + this.parameterCount * 8;

        this.equationFn = (t, y, p) => {
            this.refreshMemoryViews();
            this._memoryView.set(y, this.yOffset / 8);
            this._memoryView.set(p, this.paramOffset / 8);
            this.equationWasm(t, this.yOffset, this.paramOffset, this.resultOffset);
            return new Float64Array(this._resultView);
        };

        this.initialized = true;
        this.port.postMessage({ type: 'ready' });
    }

    fillSilence(outputs) {
        for (let outputIndex = 0; outputIndex < outputs.length; outputIndex += 1) {
            for (let channelIndex = 0; channelIndex < outputs[outputIndex].length; channelIndex += 1) {
                outputs[outputIndex][channelIndex].fill(0);
            }
        }
    }

    process(inputs, outputs) {
        if (!this.initialized || !this.equationFn) {
            this.fillSilence(outputs);
            return true;
        }

        if (this.reset) {
            this.y = new Float64Array(this.initialValuesArray);
            this.t = 0;
            this.reset = false;
        }

        for (let inputIndex = 0; inputIndex < inputs.length; inputIndex += 1) {
            if (inputs[inputIndex] && inputs[inputIndex][0]) {
                this.parameterValues[inputIndex] = inputs[inputIndex][0][0];
            }
        }

        const h = this.h * this.detuning;
        const frameCount = outputs[0]?.[0]?.length ?? 0;

        for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
            this.integrationMethod(this.equationFn, this.y, this.t, h, this.parameterValues);
            this.t += h;

            for (let outputIndex = 0; outputIndex < outputs.length; outputIndex += 1) {
                for (let channelIndex = 0; channelIndex < this.numChannels; channelIndex += 1) {
                    outputs[outputIndex][channelIndex][frameIndex] = this.y[outputIndex] ?? 0;
                }
            }
        }

        return true;
    }
}

registerProcessor('odeint-generator', ODEIntProcessor);
