function rungeKutta4(f, y, t, h, parameters) {
    const y_curr = [];

    // Compute k1, k2, k3, k4 and update y simultaneously
    const k1 = f(t, y, parameters);
    for (let i = 0; i < y.length; i++)
        y_curr[i] = y[i] + k1[i] * 0.5 * h;

    const k2 = f(t + h / 2, y_curr, parameters);

    for (let i = 0; i < y.length; i++)
        y_curr[i] = y[i] + k2[i] * 0.5 * h;

    const k3 = f(t + h / 2, y_curr, parameters);

    for (let i = 0; i < y.length; i++)
        y_curr[i] = y[i] + k3[i] * h;

    const k4 = f(t + h, y_curr, parameters);
    for (let i = 0; i < y.length; i++) {
        y[i] += h * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6;
    }

}


class RK4Processor extends AudioWorkletProcessor {


    constructor(options) {
        super();

        // Create a function that returns an array from the equation string
        const equationStr = options.processorOptions.equationString;
        console.log(equationStr);
        this.equation = (t, y, p) => {
            // Evaluate the equation string in the context of t, y, and p
            return eval(equationStr);
        };

        this.customParameters = options.processorOptions.parameters || {};
        this.parameterValues = [];
        Object.entries(this.customParameters).forEach(([name, value]) => {
            this.parameterValues.push(value);
        });

        console.log(this.parameterValues);

        this.sampleRate = 44100;
        // get values only, not keys
        this.y = Object.values(options.processorOptions.initialValues);
        console.log(this.y);

        // evaluate equation once
        const out = this.equation(0, this.y, this.parameterValues);
        console.log(out);
    }

    process(inputs, outputs, parameters) {
        const speakers = outputs[0];
        const h = 1 / this.sampleRate;
        const t = 0;

        // Update parameter values from AudioParams

        // Object.entries(this.customParameters).forEach(([name, _], i) => {
        //     this.parameterValues[i] = parameters[name];
        // });


        for (let i = 0; i < speakers[0].length; i++) {
            rungeKutta4(this.equation, this.y, t, h, this.parameterValues)

            speakers[0][i] = this.y[0];
            speakers[1][i] = this.y[1];
        }

        return true;
    }
}

registerProcessor("rk4-generator", RK4Processor);