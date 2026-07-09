const debug = true;

class ParameterProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.value = options.processorOptions.value || 0;
        this.sampleRate = 44100;
        this.downsampleFactor = options.processorOptions.downsampleFactor || 100;

        if (debug) console.log("ParameterProcessor constructor:", options.processorOptions);

        // Allow value updates through messages
        this.port.onmessage = (event) => {
            if (event.data.type === 'setValue') {
                this.value = event.data.value;
                if (debug) console.log("ParameterProcessor setValue:", this.value);
            }
        };
    }

    process(inputs, outputs) {
        const output = outputs[0][0];

        // Output the same value for downsampleFactor samples
        for (let i = 0; i < output.length; i++) {
            output[i] = this.value;
        }

        return true;
    }
}

registerProcessor('parameter-generator', ParameterProcessor);