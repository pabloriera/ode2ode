function rungeKutta4(f, y, t, h, parameters, debug = false) {
    const y_curr = [];

    // Compute k1, k2, k3, k4 and update y simultaneously
    // log array as string
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

    // for (let i = 0; i < y.length; i++) {
    //     y[i] += h * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6;
    // }
    for (let i = 0; i < y.length; i++) {
        // Break down the calculation to see intermediate values
        const sum = k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i];
        const factor = h / 6;
        const delta = sum * factor;
        const oldY = y[i];
        y[i] += delta;

        if (debug) console.log(`${i}:`, {
            k1: k1[i],
            k2: k2[i],
            k3: k3[i],
            k4: k4[i],
            sum,
            factor,
            delta,
            oldY,
            newY: y[i]
        });
    }

    if (debug) console.log('y:', Array.from(y).join(', '));

}

// Example usage:
// Define your function f(t, y) representing the ordinary differential equation dy/dt = f(t, y)
function equations(t, y, parameters) {
    return [-parameters[0] * y[1], parameters[0] * y[0]]; // Example function: dy0/dt = t*y0, dy1/dt = t*y1
}


class RK4Processor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [{
            name: 'gain',
            defaultValue: 0.1
        }, {
            name: 'w',
            defaultValue: 2.0 * Math.PI * 220.0
        }];
    }

    constructor(options) {
        super();

        console.log(options)

        // can't actually query this until this.getContextInfo() is implemented
        // update manually if you need it
        this.sampleRate = 44100;
        this.y = [0.5, 1.0]

        // Print o of equation
        const parameters = [2 * Math.PI * 220];
        const result = equations(0, this.y, parameters);
        console.log(Array.from(result).join(', '));
        console.log("--------------------------------");


        // Execute 10 steps to initialize the state
        for (let i = 0; i < 10; i++) {
            rungeKutta4(equations, this.y, 0, 1 / this.sampleRate, parameters);
            console.log(Array.from(this.y).join(', '));
        }

        this.t = 0;
        this.firstTime = true;
        this.y = [0.5, 1.0]

    }

    process(inputs, outputs, parameters) {
        const speakers = outputs[0];
        const h = 1 / this.sampleRate;
        const t = 0;

        for (let i = 0; i < speakers[0].length; i++) {
            const noise = Math.random() * 2 - 1;
            const gain = parameters.gain;

            // debug first 10 steps
            let debug = false;
            if (this.firstTime) {
                debug = true;
            } else {
                debug = false;
            }
            const array_parameters = [2.0 * Math.PI * 220.0];
            rungeKutta4(equations, this.y, this.t, h, array_parameters, debug);
            this.t += h;

            if (i === 10) {
                this.firstTime = false;
                console.log("--------------------------------");
            }

            speakers[0][i] = noise * gain + this.y[0];
            speakers[1][i] = noise * gain + this.y[1];
        }

        return true;
    }
}

registerProcessor("rk4-generator", RK4Processor);