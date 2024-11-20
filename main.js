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

// Create audio context and worklet node
let audioContext = null;

// UI elements
let playButton;

async function initAudio() {
    if (!audioContext) {
        try {
            audioContext = new AudioContext();
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
const defaultConfig = {
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


// wait for audio context and wabt instance to be initialized
await initAudio();
await initWABT();

// Stop audio context from starting automatically
audioContext.suspend();


const node = new ODENode(audioContext, wabtInstance, defaultConfig);

playButton = document.getElementById('play');
// Use play button to toggle audio context
playButton.addEventListener('click', () => {
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    } else {
        audioContext.suspend();
    }
});