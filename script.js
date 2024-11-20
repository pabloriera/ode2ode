let audioContext = null;
let hissGainRange;
let oscGainRange;
let hissGenNode;
let gainNode;
let hissGainParam;

async function createHissProcessor() {
    if (!audioContext) {
        try {
            audioContext = new AudioContext();
        } catch (e) {
            console.log("** Error: Unable to create audio context");
            return null;
        }
    }

    let processorNode;

    options = {
        outputChannelCount: [2]
    }

    // Example usage:
    // Define your function f(t, y) representing the ordinary differential equation dy/dt = f(t, y)
    function oscillator(t, y, parameters) {
        return [-parameters.w * y[1], parameters.w * y[0]]; // Example function: dy0/dt = t*y0, dy1/dt = t*y1
    }

    try {
        // processorNode = new AudioWorkletNode(audioContext, "hiss-generator");
        processorNode = new AudioWorkletNode(audioContext, "rk4-generator", {
            processorOptions: { equationString: oscillator.toString(), initialValues: [0.0, 0.2] },
            outputChannelCount: [2]
        });

    } catch (e) {
        try {
            console.log("adding...");
            // await audioContext.audioWorklet.addModule("hiss-generator.js");
            // processorNode = new AudioWorkletNode(audioContext, "hiss-generator");
            await audioContext.audioWorklet.addModule("rk4-generator.js");

            processorNode = new AudioWorkletNode(audioContext, "rk4-generator", {
                processorOptions: { equationString: oscillator.toString(), initialValues: [0.0, 0.2] },
                outputChannelCount: [2]
            });

        } catch (e) {
            console.log(`** Error: Unable to create worklet node: ${e}`);
            return null;
        }
    }

    await audioContext.resume();
    return processorNode;
}

async function audioDemoStart() {
    soundSource = await createHissProcessor();
    if (!soundSource) {
        console.log("** Error: unable to create hiss processor");
        return;
    }
    // const soundSource = new OscillatorNode(audioContext);
    gainNode = audioContext.createGain();

    // Configure the oscillator node

    // soundSource.type = "square";
    // soundSource.frequency.setValueAtTime(440, audioContext.currentTime); // (A4)

    // Configure the gain for the oscillator

    // gainNode.gain.setValueAtTime(oscGainRange.value, audioContext.currentTime);

    // Connect and start

    soundSource
        .connect(gainNode)
        .connect(audioContext.destination);

    // Get access to the worklet's gain parameter

    // hissGainParam = hissGenNode.parameters.get("gain");
    // hissGainParam.setValueAtTime(hissGainRange.value, audioContext.currentTime);
}

window.addEventListener("load", (event) => {
    document.getElementById("toggle").addEventListener("click", toggleSound);

    hissGainRange = document.getElementById("hiss-gain");
    oscGainRange = document.getElementById("osc-gain");

    hissGainRange.oninput = updateHissGain;
    oscGainRange.oninput = updateOscGain;

    hissGainRange.disabled = true;
    oscGainRange.disabled = true;
});

async function toggleSound(event) {
    if (!audioContext) {
        audioDemoStart();

        hissGainRange.disabled = false;
        oscGainRange.disabled = false;
    } else {
        hissGainRange.disabled = true;
        oscGainRange.disabled = true;

        await audioContext.close();
        audioContext = null;
    }
}

function updateHissGain(event) {
    hissGainParam.setValueAtTime(event.target.value, audioContext.currentTime);
}

function updateOscGain(event) {
    gainNode.gain.setValueAtTime(event.target.value, audioContext.currentTime);
}