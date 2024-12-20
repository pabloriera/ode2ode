let debug = false;

/*
This website is a playground for playing with ODEs in the browser.

The main idea is to use the AudioWorklet API to generate audio from ODEs.

The user can define an ODE using the following syntax:

{
    equations: {x: f(x,y,t), y: g(x,y,t)}, 
    parameters: {p1: value1, p2: value2},
    initialValues: [x0, y0]
}

This will instantiate an AudioWorkletNode with the given equations, parameters, and initial values.

The AudioWorkletNode will output the values of x and y as a stereo audio signal.

*/

import {
    ODENode
} from './ode.js';

import {

    OdeNodeVisualizer,
    VisualizationSystem
} from './visual.js';

import {
    addPlayPauseButton,
    createOdeGui,
    addMainVolumeControl
} from './gui.js';

import {
    AudioMixer
} from './audio.js';

// Create audio context, mixer and worklet node
let audioContext = null;
let audioMixer = null;

async function initAudio() {
    if (!audioContext) {
        try {
            audioContext = new AudioContext();
            audioMixer = new AudioMixer(audioContext);
            await audioContext.audioWorklet.addModule('odeint-generator.js');
        } catch (e) {
            console.error("Failed to initialize audio:", e);
            return false;
        }
    }
    return true;
}

let wabtInstance = null;
async function initWABT() {
    if (!wabtInstance) {
        wabtInstance = await window.WabtModule();
    }
    return wabtInstance;
}

// Example usage
const oscillatorConfig = {
    name: "Oscillator",
    equations: {
        x: "-TWO_PI*w * y", // dx/dt = -w*y
        y: "TWO_PI*w * x" // dy/dt = w*x
    },
    parameters: {
        w: 220
    },
    initialValues: { x: 0.5, y: 1.0 },
    method: 'rk4'
};


const lorenzConfig = {
    name: "Lorenz",
    equations: {
        x: "sigma * y - sigma * x",
        y: "x * (rho - z) - y",
        z: "x * y - beta * z"
    },
    parameters: {
        sigma: 10,
        rho: 28,
        beta: 8 / 3,
    },
    initialValues: { x: 0.1, y: 0.1, z: 0.1 },
    timeScale: 100
}

const vanDerPolConfig = {
    name: "Van der Pol",
    equations: {
        x: "y",
        y: "mu * (1.0 - x*x) * y - x"
    },
    parameters: {
        mu: 1.0 // damping parameter
    },
    initialValues: { x: 2.0, y: 0.0 },
    timeScale: 500 // slowed down to better observe the oscillations
};

// wait for audio context and wabt instance to be initialized
await initAudio();
await initWABT();


// Stop audio context from starting automatically
audioContext.suspend();

let mainguiconfig = {
    play: false,
    mainVolume: 0.5 // Default main volume
};
addPlayPauseButton(mainguiconfig, audioContext);
addMainVolumeControl(mainguiconfig, audioMixer);

const visSystem = new VisualizationSystem(audioContext);

const oscillatorNode = new ODENode(audioContext, wabtInstance, oscillatorConfig);
audioMixer.addNode('oscillator', oscillatorNode.gainNode);

const lorenzNode = new ODENode(audioContext, wabtInstance, lorenzConfig);
audioMixer.addNode('lorenz', lorenzNode.gainNode);

const vanDerPolNode = new ODENode(audioContext, wabtInstance, vanDerPolConfig);
audioMixer.addNode('vanderpol', vanDerPolNode.gainNode);

// Add ODE nodes to visualize
visSystem.addOdeNode(oscillatorNode);
visSystem.addOdeNode(lorenzNode);
visSystem.addOdeNode(vanDerPolNode);

// Start visualization
visSystem.startVisualization();