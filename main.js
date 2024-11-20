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




// Example usage
const defaultConfig = {
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

window.addEventListener('load', async() => {
    // Create control box for sliders
    const controlBox = document.createElement('div');
    controlBox.className = 'control-box';

    // Create gain slider
    const gainControl = document.createElement('div');
    gainControl.className = 'control';

    const gainLabel = document.createElement('span');
    gainLabel.className = 'control-label';
    gainLabel.innerHTML = '<label for="gain">Gain:</label>';

    const gainSlider = document.createElement('input');
    gainSlider.type = 'range';
    gainSlider.id = 'gain';
    gainSlider.min = '0';
    gainSlider.max = '1';
    gainSlider.step = '0.01';
    gainSlider.value = defaultConfig.gain || '0.8';

    const gainValue = document.createElement('span');
    gainValue.id = 'gain-value';
    gainValue.textContent = defaultConfig.gain || '0.8';

    gainControl.appendChild(gainLabel);
    gainControl.appendChild(gainSlider);
    gainControl.appendChild(gainValue);
    controlBox.appendChild(gainControl);

    // Create sliders for parameters
    for (const [name, value] of Object.entries(defaultConfig.parameters)) {
        const control = document.createElement('div');
        control.className = 'control';

        const label = document.createElement('span');
        label.className = 'control-label';
        label.innerHTML = `<label for="${name}">${name}:</label>`;

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.id = name;
        slider.min = value / 2;
        slider.max = value * 2;
        slider.step = value / 100;
        slider.value = value;

        const valueDisplay = document.createElement('span');
        valueDisplay.id = `${name}-value`;
        valueDisplay.textContent = value;

        control.appendChild(label);
        control.appendChild(slider);
        control.appendChild(valueDisplay);
        controlBox.appendChild(control);
    }

    // Insert control box after play button
    playButton = document.getElementById('play');
    playButton.parentNode.insertBefore(controlBox, playButton.nextSibling);

    // Add play button click handler
    // Play button toggles between playing and pausing  
    // only create the node if it's not already created
    playButton.addEventListener('click', async() => {
        if (!audioContext) {
            if (await initAudio()) {
                const node = new ODENode(audioContext, defaultConfig);
                if (node) {

                    // Update gain slider and display
                    gainSlider.addEventListener('input', (e) => {
                        gainNode.gain.value = e.target.value;
                        document.getElementById('gain-value').textContent = e.target.value;
                    });

                    // Update parameter sliders and displays
                    for (const [name, value] of Object.entries(defaultConfig.parameters)) {
                        const slider = document.getElementById(name);
                        slider.addEventListener('input', (e) => {
                            node.port.postMessage({
                                type: 'parameterChange',
                                name: name,
                                value: parseFloat(e.target.value)
                            });
                            document.getElementById(`${name}-value`).textContent = e.target.value;
                        });
                    }
                }
                audioContext.resume();
            }
        } else if (audioContext.state === 'suspended') {
            audioContext.resume();
        } else if (audioContext.state === 'running') {
            audioContext.suspend();
        }
    });
});