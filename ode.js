import { Parameter } from './audio.js';
import { createOdeGui } from './gui.js';
import { generateWATModule } from './wat.js';
import { normalizeOdeDefinition } from './src/domain/ode-definition.js';

const debug = false;

function parseEquations(equations, initialValues, parameters) {
    const variableNames = Object.keys(equations);
    const parameterNames = Object.keys(parameters);
    const equationStrings = Object.values(equations);

    if (debug) {
        console.log('Equation strings:', equationStrings);
        console.log('Variable names:', variableNames);
        console.log('Parameter names:', parameterNames);
    }

    return equationStrings.map(equation => {
        let expression = equation.replace(/TWO_PI/g, (2 * Math.PI).toString());

        variableNames.forEach((name, index) => {
            expression = expression.replace(new RegExp(`\\b${name}\\b`, 'g'), `__VAR_${index}__`);
        });

        variableNames.forEach((name, index) => {
            expression = expression.replace(new RegExp(`__VAR_${index}__`, 'g'), `y[${index}]`);
        });

        parameterNames.forEach((name, index) => {
            expression = expression.replace(new RegExp(`\\b${name}\\b`, 'g'), `p[${index}]`);
        });

        return expression;
    });
}

function compileEquation(wabtInstance, equations, initialValues, parameters) {
    const parsedEquations = parseEquations(equations, initialValues, parameters);
    const watSource = generateWATModule(parsedEquations);

    if (debug) {
        console.log('Generated WAT source:', watSource);
    }

    try {
        const module = wabtInstance.parseWat('equation.wat', watSource);
        const { buffer } = module.toBinary({});
        return buffer;
    } catch (error) {
        console.error('WASM compilation error:', error);
        console.error('Parsed equations:', parsedEquations);
        throw error;
    }
}

class ODENode {
    constructor(audioContext, wabtInstance, config, onStateChange = null) {
        this.audioContext = audioContext;
        this.onStateChange = onStateChange;
        this.config = normalizeOdeDefinition(config);
        this.config.resetInitialConditions = () => this.resetInitialConditions();
        this.config.changeVisualization = () => this.cycleVisualization?.();
        this.config.gui_parameters = Object.fromEntries(
            Object.entries(this.config.parameters).map(([name, parameterDefinition]) => [name, parameterDefinition.value])
        );

        const wasmBytes = compileEquation(
            wabtInstance,
            this.config.equations,
            this.config.initialValues,
            this.config.parameters
        );

        this.parameterNodes = new Map();
        Object.entries(this.config.parameters).forEach(([name, parameterDefinition]) => {
            this.parameterNodes.set(name, new Parameter(audioContext, parameterDefinition));
        });

        this.odeWorkletNode = new AudioWorkletNode(audioContext, 'odeint-generator', {
            processorOptions: {
                wasmBytes,
                initialValues: this.config.initialValues,
                parameters: this.getParameterValues(),
                equations: this.config.equations,
                method: this.config.method,
                timeScale: this.config.timeScale
            },
            numberOfInputs: this.parameterNodes.size,
            numberOfOutputs: Object.keys(this.config.equations).length,
            outputChannelCount: Array(Object.keys(this.config.equations).length).fill(2)
        });

        Array.from(this.parameterNodes.values()).forEach((parameterNode, index) => {
            parameterNode.connect(this.odeWorkletNode, index);
        });

        this.init(audioContext);
        this.gui = createOdeGui(
            this.config,
            () => this.updateParameters(),
            () => this.resetInitialConditions()
        );
    }

    getParameterValues() {
        return Object.values(this.config.parameters).map(parameterDefinition => parameterDefinition.value);
    }

    getSerializableDefinition() {
        return normalizeOdeDefinition({
            ...this.config,
            parameters: this.config.parameters
        });
    }

    notifyStateChange() {
        this.onStateChange?.(this.getSerializableDefinition());
    }

    updateParameters = () => {
        for (const [name, value] of Object.entries(this.config.gui_parameters)) {
            const parameterNode = this.parameterNodes.get(name);
            if (parameterNode) {
                parameterNode.setValue(value);
            }
            this.config.parameters[name] = {
                ...this.config.parameters[name],
                value
            };
        }

        this.odeWorkletNode.port.postMessage({
            type: 'updateParameters',
            parameters: this.getParameterValues(),
            detuning: this.config.detuning
        });

        this.gainNode.gain.value = this.config.gain;
        this.notifyStateChange();
    };

    resetInitialConditions = () => {
        this.odeWorkletNode.port.postMessage({
            type: 'resetInitialConditions',
            initialValues: this.config.initialValues
        });
    };

    setVisualizationChangeCallback(callback) {
        this.onVisualizationChange = callback;
    }

    init(audioContext) {
        this.gainNode = audioContext.createGain();
        this.gainNode.gain.value = this.config.gain;
        this.odeWorkletNode.connect(this.gainNode);
    }
}

export { parseEquations, compileEquation, ODENode };
