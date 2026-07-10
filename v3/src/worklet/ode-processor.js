import { clampState, compileExpression, finite } from "../expressionCompiler.js";

function normalizeDefinition(definition = {}) {
    const equations = definition.equations ?? {};
    const variableNames = Array.isArray(definition.variableNames)
        ? definition.variableNames
        : Object.keys(equations);
    const parameterNames = Array.isArray(definition.parameterNames)
        ? definition.parameterNames
        : Object.keys(definition.parameters ?? {});
    const initialValues = definition.initialValues ?? {};
    const parameters = definition.parameters ?? {};
    const outputScales = definition.outputScales ?? {};

    return {
        id: String(definition.id ?? "ode"),
        variableNames,
        parameterNames,
        equations,
        initialState: Float64Array.from(variableNames.map(name => finite(initialValues[name], 0))),
        parameterValues: Float64Array.from(parameterNames.map(name => finite(parameters[name]?.value ?? parameters[name], 0))),
        method: definition.method === "euler" ? "euler" : "rk4",
        timeScale: finite(definition.timeScale, 1),
        oversample: Math.max(1, Math.min(32, Math.round(finite(definition.oversample, 2)))),
        outputScales: Float64Array.from(variableNames.map(name => finite(outputScales[name], 0.25)))
    };
}

class ParameterSmoother {
    constructor(value) {
        this.current = finite(value, 0);
        this.target = this.current;
        this.increment = 0;
        this.remaining = 0;
    }

    setTarget(value, frames = 128) {
        const nextTarget = finite(value, this.target);
        const rampFrames = Math.max(1, Math.round(frames));

        this.target = nextTarget;
        this.remaining = rampFrames;
        this.increment = (this.target - this.current) / rampFrames;
    }

    next() {
        if (this.remaining > 0) {
            this.current += this.increment;
            this.remaining -= 1;

            if (this.remaining === 0) {
                this.current = this.target;
                this.increment = 0;
            }
        }

        return this.current;
    }
}

class OdeProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();

        this.configure(options.processorOptions?.definition);
        this.port.onmessage = event => this.handleMessage(event.data);
    }

    configure(definition) {
        try {
            this.definition = normalizeDefinition(definition);
            this.state = new Float64Array(this.definition.initialState);
            this.parameters = Array.from(this.definition.parameterValues, value => new ParameterSmoother(value));
            this.paramsFrame = new Float64Array(this.parameters.length);
            this.work = new Float64Array(this.state.length);
            this.k1 = new Float64Array(this.state.length);
            this.k2 = new Float64Array(this.state.length);
            this.k3 = new Float64Array(this.state.length);
            this.k4 = new Float64Array(this.state.length);
            this.functions = this.definition.variableNames.map(variableName => (
                compileExpression(
                    this.definition.equations[variableName],
                    this.definition.variableNames,
                    this.definition.parameterNames
                )
            ));
            this.t = 0;
            this.error = null;
        } catch (error) {
            this.error = error;
            this.port.postMessage({ type: "error", message: error.message });
        }
    }

    handleMessage(message) {
        if (!message) {
            return;
        }

        if (message.type === "setParameter") {
            const index = this.definition.parameterNames.indexOf(message.name);
            if (index >= 0) {
                this.parameters[index].setTarget(message.value);
            }
            return;
        }

        if (message.type === "setParameters") {
            this.definition.parameterNames.forEach((name, index) => {
                if (name in message.parameters) {
                    this.parameters[index].setTarget(message.parameters[name]);
                }
            });
            return;
        }

        if (message.type === "setIntegration") {
            if ("timeScale" in message) {
                this.definition.timeScale = finite(message.timeScale, this.definition.timeScale);
            }
            if ("oversample" in message) {
                this.definition.oversample = Math.max(1, Math.min(32, Math.round(finite(message.oversample, this.definition.oversample))));
            }
            if (message.outputScales) {
                this.definition.outputScales = Float64Array.from(
                    this.definition.variableNames.map(name => finite(message.outputScales[name], this.definition.outputScales[0] ?? 0.25))
                );
            }
            return;
        }

        if (message.type === "reset") {
            this.state.set(this.definition.initialState);
            this.t = 0;
        }
    }

    readParameters(inputs, frameIndex) {
        for (let index = 0; index < this.parameters.length; index += 1) {
            const input = inputs[index]?.[0];
            const modulation = input ? finite(input[frameIndex], input[0] ?? 0) : 0;
            this.paramsFrame[index] = this.parameters[index].next() + modulation;
        }
    }

    evaluate(t, state, params, target) {
        try {
            for (let index = 0; index < this.functions.length; index += 1) {
                target[index] = clampState(this.functions[index](t, state, params));
            }
        } catch (error) {
            this.error = error;
            target.fill(0);
            this.port.postMessage({ type: "error", message: error.message });
        }
    }

    eulerStep(h) {
        this.evaluate(this.t, this.state, this.paramsFrame, this.k1);

        for (let index = 0; index < this.state.length; index += 1) {
            this.state[index] = clampState(this.state[index] + this.k1[index] * h);
        }
    }

    rk4Step(h) {
        this.evaluate(this.t, this.state, this.paramsFrame, this.k1);

        for (let index = 0; index < this.state.length; index += 1) {
            this.work[index] = this.state[index] + 0.5 * h * this.k1[index];
        }
        this.evaluate(this.t + h * 0.5, this.work, this.paramsFrame, this.k2);

        for (let index = 0; index < this.state.length; index += 1) {
            this.work[index] = this.state[index] + 0.5 * h * this.k2[index];
        }
        this.evaluate(this.t + h * 0.5, this.work, this.paramsFrame, this.k3);

        for (let index = 0; index < this.state.length; index += 1) {
            this.work[index] = this.state[index] + h * this.k3[index];
        }
        this.evaluate(this.t + h, this.work, this.paramsFrame, this.k4);

        for (let index = 0; index < this.state.length; index += 1) {
            const delta = (h / 6) * (this.k1[index] + 2 * this.k2[index] + 2 * this.k3[index] + this.k4[index]);
            this.state[index] = clampState(this.state[index] + delta);
        }
    }

    process(inputs, outputs) {
        const output = outputs[0];
        const frameCount = output?.[0]?.length ?? 128;

        if (!output || this.error) {
            this.fillSilence(outputs);
            return true;
        }

        const stepSize = this.definition.timeScale / (sampleRate * this.definition.oversample);

        for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
            this.readParameters(inputs, frameIndex);

            for (let step = 0; step < this.definition.oversample; step += 1) {
                if (this.definition.method === "euler") {
                    this.eulerStep(stepSize);
                } else {
                    this.rk4Step(stepSize);
                }
                this.t += stepSize;
            }

            for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
                const value = this.state[channelIndex] ?? 0;
                const scaled = Math.tanh(value * (this.definition.outputScales[channelIndex] ?? 0.25));
                output[channelIndex][frameIndex] = Number.isFinite(scaled) ? scaled : 0;
            }
        }

        return true;
    }

    fillSilence(outputs) {
        outputs.forEach(output => {
            output.forEach(channel => channel.fill(0));
        });
    }
}

registerProcessor("rk4-v3-ode", OdeProcessor);
