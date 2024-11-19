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

// Create audio context and worklet node
let audioContext = null;
let workletNode = null;
let gainNode = null;

// UI elements
let playButton;
let parameterInputs = {};

async function initAudio() {
    if (!audioContext) {
        try {
            audioContext = new AudioContext();
            await audioContext.audioWorklet.addModule('rk4-generator.js');
        } catch (e) {
            console.error("Failed to initialize audio:", e);
            return false;
        }
    }
    return true;
}

/* Parse the equations into a string. The variable names must be 
replaced with an array using the names in initialValues. The parameters must be
replaced with an object using the names in parameters.
*/
function parseEquations(equations, initialValues, parameters) {
    const varNames = Object.keys(initialValues);
    const paramNames = Object.keys(parameters);
    const equationStrings = Object.values(equations);

    let arrayExpr = '[';
    equationStrings.forEach((eqn, i) => {
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

        arrayExpr += expr;
        if (i < equationStrings.length - 1) arrayExpr += ', ';
    });
    arrayExpr += ']';

    return arrayExpr;
}

function createODENode(config) {
    const options = {
        processorOptions: {
            equationString: parseEquations(config.equations, config.initialValues, config.parameters),
            initialValues: config.initialValues,
            parameters: config.parameters
        },
        outputChannelCount: [2]
    };

    try {
        workletNode = new AudioWorkletNode(audioContext, "rk4-generator", options);
        gainNode = audioContext.createGain();
        gainNode.gain.value = 0.1; // Set initial gain to 0.1

        workletNode
            .connect(gainNode)
            .connect(audioContext.destination);
        return workletNode;
    } catch (e) {
        console.error("Failed to create ODE node:", e);
        return null;
    }
}

const TWO_PI = Math.PI * 2;

// Example usage
const defaultConfig = {
    equations: {
        x: "-TWO_PI*w * y", // dx/dt = -w*y
        y: "TWO_PI*w * x" // dy/dt = w*x
    },
    parameters: {
        w: 440 // 440 Hz
    },
    initialValues: { x: 0, y: 1 }
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
    gainSlider.step = '0.1';
    gainSlider.value = '0.1';

    const gainValue = document.createElement('span');
    gainValue.id = 'gain-value';
    gainValue.textContent = '0.1';

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
    playButton.addEventListener('click', async() => {
        if (await initAudio()) {
            const node = createODENode(defaultConfig);
            if (node) {
                // Update gain slider and display
                gainSlider.addEventListener('input', (e) => {
                    gainNode.gain.value = e.target.value;
                    document.getElementById('gain-value').textContent = e.target.value;
                });

                // Update parameter sliders and displays
                for (const [name, value] of Object.entries(defaultConfig.parameters)) {
                    console.log(name, value);
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

                audioContext.resume();
            }
        }
    });
});