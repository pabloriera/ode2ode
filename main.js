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
    addMainVolumeControl,
    removeFolder
} from './gui.js';

import {
    AudioMixer
} from './audio.js';

async function initAudio() {
    if (!audioContext) {
        try {
            audioContext = new AudioContext();
            audioMixer = new AudioMixer(audioContext);
            await audioContext.audioWorklet.addModule('parameter-generator.js');
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

// Replace the hardcoded configs section with a nodes management system
let odeNodes = new Map(); // Store active ODE nodes

// Initialize basic audio and visualization systems
let audioContext = null;
let audioMixer = null;
let visSystem = null;

async function initSystems() {
    await initAudio();
    await initWABT();

    audioContext.suspend();

    let mainguiconfig = {
        play: false,
        mainVolume: 0.5
    };

    addPlayPauseButton(mainguiconfig, audioContext);
    addMainVolumeControl(mainguiconfig, audioMixer);

    visSystem = new VisualizationSystem(audioContext);
    visSystem.startVisualization();
}

function addOdeNode(config) {
    // Remove existing node with same name if it exists
    if (odeNodes.has(config.name)) {
        const oldNode = odeNodes.get(config.name);
        // Remove GUI folder
        // gui.removeFolder(oldNode.gui);
        removeFolder(oldNode.gui);
        // Remove from audio and visualization
        audioMixer.removeNode(config.name);
        visSystem.removeOdeNode(oldNode);
        odeNodes.delete(config.name);
    }

    // Create new node
    const node = new ODENode(audioContext, wabtInstance, config);
    audioMixer.addNode(config.name, node.gainNode);
    visSystem.addOdeNode(node);
    odeNodes.set(config.name, node);
}

// Add event listener for ctrl+click on textarea
document.addEventListener('DOMContentLoaded', () => {
    const editor = document.getElementById('ode-config-editor');

    editor.addEventListener('keydown', (event) => {
        if (event.ctrlKey && event.key === 'Enter') {
            try {
                const configText = editor.value;
                const config = JSON.parse(configText);
                addOdeNode(config);
            } catch (error) {
                console.error('Failed to parse ODE configuration:', error);
            }
        }
    });

    // Initialize systems
    initSystems();
});

// Example configuration to show in textarea:
const exampleConfig = `{
    "name": "Hopf",
    "equations": {
        "x": "TWO_PI*w * y + (g - b*(x*x + y*y))*x",
        "y": "-TWO_PI*w * x + (g - b*(x*x + y*y))*y"
    },
    "parameters": {
        "w": [440.0, 0.0, 6080.0],
        "g": [1.0, -4.0, 4.0],
        "b": [10.0, 0.0, 30.0]
    },
    "initialValues": { "x": 0.5, "y": 1.0 },
    "integrationMethod": "rk4"
}`;

document.getElementById('ode-config-editor').value = exampleConfig;