let debug = true;
let wabtInstance = null;
// Constants
const TWO_PI = Math.PI * 2;


if (debug) console.log("AssemblyScript objects:", {
    loader: window.ASLoader,
    sdk: window.AssemblyScriptSDK
});

if (debug) console.log("WABT object:", window.WabtModule);


/* Parse the equations into a string. The variable names must be 
replaced with an array using the names in initialValues. The parameters must be
replaced with an object using the names in parameters.
*/
function parseEquations(equations, initialValues, parameters) {
    const varNames = Object.keys(initialValues);
    const paramNames = Object.keys(parameters);
    const equationStrings = Object.values(equations);
    if (debug) console.log("Equation strings:", equationStrings);
    if (debug) console.log("Var names:", varNames);
    if (debug) console.log("Param names:", paramNames);

    return equationStrings.map(eqn => {
        let expr = eqn;
        // Replace TWO_PI with actual value
        expr = expr.replace(/TWO_PI/g, (2 * Math.PI).toString());

        // First replace variables with unique tokens
        varNames.forEach((name, j) => {
            expr = expr.replace(new RegExp('\\b' + name + '\\b', 'g'), `__VAR_${j}__`);
        });

        // Then replace tokens with array indices
        varNames.forEach((name, j) => {
            expr = expr.replace(new RegExp(`__VAR_${j}__`, 'g'), `y[${j}]`);
        });

        // Replace parameter names with array indices
        paramNames.forEach((name, j) => {
            expr = expr.replace(new RegExp('\\b' + name + '\\b', 'g'), `p[${j}]`);
        });

        return expr;
    });
}



// Initialize WABT synchronously
function initWABT() {
    if (!wabtInstance) {
        // Block until promise resolves
        wabtInstance = window.WabtModule().then(instance => {
            wabtInstance = instance;
            return instance;
        }).catch(error => {
            console.error("Failed to initialize WABT:", error);
            throw error;
        });
    }
    // If wabtInstance is a promise, wait for it
    if (wabtInstance instanceof Promise) {
        throw new Error("WABT not initialized yet. Please try again.");
    }
    return wabtInstance;
}

import { generateWATModule } from './wat.js';

function compileEquation(wabtInstance, equations, initialValues, parameters) {
    // First ensure WABT is initialized
    if (debug) console.log("WABT instance:", wabtInstance);

    // Rest of the function remains the same
    const parsedEqns = parseEquations(equations, initialValues, parameters);
    if (debug) {
        console.log("Parsed equations:", parsedEqns);
    }

    const watSource = generateWATModule(parsedEqns);


    if (debug) console.log("Generated WAT source:", watSource);

    try {
        const module = wabtInstance.parseWat("equation.wat", watSource);
        const { buffer } = module.toBinary({});
        return buffer;
    } catch (error) {
        console.error("WASM compilation error:", error);
        console.log("Parsed equations:", parsedEqns);
        throw error;
    }
}

import { Parameter } from './audio.js';

// Create GUI
import { createOdeGui } from './gui.js';

class ODENode {
    constructor(audioContext, wabtInstance, config) {
        this.config = config;
        this.audioContext = audioContext;

        this.initialGain = 0.1;

        // Add visualization type and detuning to config
        this.config.visualizationType = 'oscilloscope';
        this.config.gain = this.initialGain;
        this.config.detuning = 1.0;
        this.config.timeScale = (this.config.timeScale || 1);

        // Add reset and visualization change methods to config for GUI
        this.config.resetInitialConditions = () => this.resetInitialConditions();
        this.config.changeVisualization = () => this.cycleVisualization();

        // Prepare parameter values for WASM compilation
        this.config.paramValues = Object.values(config.parameters).map(p =>
            Array.isArray(p) ? p[0] : p
        );

        const wasmBytes = compileEquation(
            wabtInstance,
            config.equations,
            config.initialValues,
            config.parameters
        );

        // Create parameter nodes
        this.parameterNodes = new Map();
        Object.entries(config.parameters).forEach(([name, value], index) => {
            const param = new Parameter(audioContext, value[0]);
            this.parameterNodes.set(name, param);
        });

        // Initialize worklet node with inputs for parameters
        this.odeWorkletNode = new AudioWorkletNode(audioContext, "odeint-generator", {
            processorOptions: {
                wasmBytes: wasmBytes,
                initialValues: this.config.initialValues,
                parameters: this.config.paramValues,
                equations: this.config.equations,
                method: this.config.method,
                timeScale: this.config.timeScale
            },
            numberOfInputs: Object.keys(this.config.parameters).length,
            numberOfOutputs: Object.keys(this.config.equations).length,
            outputChannelCount: Array(Object.keys(this.config.equations).length).fill(2)
        });

        // Connect parameter nodes to worklet inputs
        Array.from(this.parameterNodes.values()).forEach((param, index) => {
            param.connect(this.odeWorkletNode, index);
        });

        if (debug) console.log('Initializing ODENode', this.odeWorkletNode);
        this.init(audioContext);

        // Create a copy of the parameters for the GUI
        this.config.gui_parameters = {};
        for (const [name, value] of Object.entries(this.config.parameters)) {
            this.config.gui_parameters[name] = Array.isArray(value) ? value[0] : value;
        }

        // Create GUI with all callback functions
        this.gui = createOdeGui(
            this.config,
            () => this.updateParameters(),
            () => this.resetInitialConditions(),
        );
    }

    updateParameters = () => {
        // Update parameter node values instead of sending message
        for (const [name, value] of Object.entries(this.config.gui_parameters)) {
            const param = this.parameterNodes.get(name);
            if (param) {
                param.setValue(value);
            }
        }

        this.odeWorkletNode.port.postMessage({
            type: 'updateParameters',
            detuning: this.config.detuning
        });

        this.gainNode.gain.value = this.config.gain;
    }

    resetInitialConditions = () => {
        this.odeWorkletNode.port.postMessage({
            type: 'resetInitialConditions',
            initialValues: this.config.initialValues,
        });
    }


    setVisualizationChangeCallback(callback) {
        this.onVisualizationChange = callback;
    }

    init(audioContext) {
        // Create and connect gain node
        this.gainNode = audioContext.createGain();
        this.gainNode.gain.value = this.config.gain;

        // Connect to worklet node only
        this.odeWorkletNode.connect(this.gainNode);

        if (debug) console.log('Audio chain connected:', {
            odeWorkletNode: this.odeWorkletNode,
            gainNode: this.gainNode,
            destination: audioContext.destination
        });
    }
}


export {
    parseEquations,
    compileEquation,
    ODENode

};