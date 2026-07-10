import { buildRuntimeDefinition, getModuleParameterValues, normalizePatch } from "./patch.js";

function safeDisconnect(node) {
    try {
        node?.disconnect();
    } catch {
        /* Disconnect is best-effort for stale Web Audio edges. */
    }
}

function getAudioContextClass() {
    return globalThis.AudioContext ?? globalThis.webkitAudioContext;
}

class AudioEngine {
    constructor(options = {}) {
        this.audioContext = options.audioContext ?? null;
        this.workletUrl = options.workletUrl ?? new URL("./worklet/ode-processor.js", import.meta.url).href;
        this.processorName = "rk4-v3-ode";
        this.masterGain = null;
        this.limiter = null;
        this.masterAnalyser = null;
        this.masterSplitter = null;
        this.masterLeftAnalyser = null;
        this.masterRightAnalyser = null;
        this.modules = new Map();
        this.connections = new Map();
        this.patch = null;
        this.ready = false;
        this.workletLoaded = false;
    }

    createBaseContext() {
        if (!this.audioContext) {
            const AudioContextClass = getAudioContextClass();

            if (!AudioContextClass) {
                throw new Error("Web Audio API is not available in this browser.");
            }

            this.audioContext = new AudioContextClass();

            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 0.72;

            this.limiter = this.audioContext.createDynamicsCompressor();
            this.limiter.threshold.value = -10;
            this.limiter.knee.value = 10;
            this.limiter.ratio.value = 8;
            this.limiter.attack.value = 0.004;
            this.limiter.release.value = 0.12;

            this.masterAnalyser = this.audioContext.createAnalyser();
            this.masterAnalyser.fftSize = 2048;
            this.masterSplitter = this.audioContext.createChannelSplitter(2);
            this.masterLeftAnalyser = this.audioContext.createAnalyser();
            this.masterRightAnalyser = this.audioContext.createAnalyser();
            this.masterLeftAnalyser.fftSize = 2048;
            this.masterRightAnalyser.fftSize = 2048;

            this.masterGain.connect(this.limiter);
            this.limiter.connect(this.masterAnalyser);
            this.limiter.connect(this.masterSplitter);
            this.masterSplitter.connect(this.masterLeftAnalyser, 0);
            this.masterSplitter.connect(this.masterRightAnalyser, 1);
            this.limiter.connect(this.audioContext.destination);
        }
    }

    async ensure() {
        this.createBaseContext();

        if (!this.workletLoaded) {
            await this.audioContext.audioWorklet.addModule(this.workletUrl);
            this.workletLoaded = true;
        }

        this.ready = true;
        return this;
    }

    async startFromGesture() {
        this.createBaseContext();
        await this.audioContext.resume();
        await this.ensure();
        return this.isRunning();
    }

    async resume() {
        await this.ensure();
        await this.audioContext.resume();
    }

    async suspend() {
        if (this.audioContext) {
            await this.audioContext.suspend();
        }
    }

    isRunning() {
        return this.audioContext?.state === "running";
    }

    async toggle() {
        if (this.isRunning()) {
            await this.suspend();
        } else {
            await this.startFromGesture();
        }

        return this.isRunning();
    }

    async syncPatch(patch) {
        this.patch = normalizePatch(patch);

        if (!this.ready) {
            return;
        }

        await this.ensure();
        this.removeMissingModules(this.patch);
        this.patch.modules.forEach(module => this.upsertModule(module));
        this.applyMixerState(this.patch);
        this.rebuildConnections(this.patch);
    }

    removeMissingModules(patch) {
        const activeIds = new Set(patch.modules.map(module => module.id));

        for (const [moduleId, runtime] of this.modules) {
            if (!activeIds.has(moduleId)) {
                this.disposeRuntime(runtime);
                this.modules.delete(moduleId);
            }
        }
    }

    upsertModule(module) {
        const existing = this.modules.get(module.id);
        const definition = buildRuntimeDefinition(module);
        const signature = this.getRuntimeSignature(definition);

        if (existing?.signature === signature) {
            existing.module = module;
            existing.node.port.postMessage({
                type: "setParameters",
                parameters: getModuleParameterValues(module)
            });
            existing.node.port.postMessage({
                type: "setIntegration",
                timeScale: definition.timeScale,
                oversample: definition.oversample,
                outputScales: definition.outputScales
            });
            return existing;
        }

        if (existing) {
            this.disposeRuntime(existing);
        }

        const runtime = this.createRuntime(module, definition, signature);
        this.modules.set(module.id, runtime);
        return runtime;
    }

    getRuntimeSignature(definition) {
        return JSON.stringify({
            variables: definition.variableNames,
            parameters: definition.parameterNames,
            equations: definition.equations,
            method: definition.method
        });
    }

    createRuntime(module, definition, signature) {
        const variableCount = Math.max(1, definition.variableNames.length);
        const parameterCount = Math.max(0, definition.parameterNames.length);
        const node = new AudioWorkletNode(this.audioContext, this.processorName, {
            numberOfInputs: parameterCount,
            numberOfOutputs: 1,
            outputChannelCount: [variableCount],
            channelCountMode: "explicit",
            processorOptions: {
                definition
            }
        });
        const splitter = this.audioContext.createChannelSplitter(variableCount);
        const stereoMerger = this.audioContext.createChannelMerger(2);
        const leftGain = this.audioContext.createGain();
        const rightGain = this.audioContext.createGain();
        const channelGain = this.audioContext.createGain();
        const meterAnalyser = this.audioContext.createAnalyser();
        const analysers = new Map();

        meterAnalyser.fftSize = 512;
        node.connect(splitter);

        definition.variableNames.forEach((variableName, index) => {
            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = 2048;
            splitter.connect(analyser, index);
            analysers.set(variableName, analyser);
        });

        splitter.connect(leftGain, 0);
        splitter.connect(rightGain, Math.min(1, variableCount - 1));
        leftGain.connect(stereoMerger, 0, 0);
        rightGain.connect(stereoMerger, 0, 1);
        stereoMerger.connect(channelGain);
        channelGain.connect(meterAnalyser);
        channelGain.connect(this.masterGain);

        node.port.onmessage = event => {
            if (event.data?.type === "error") {
                console.warn(`ODE processor error in ${module.name}:`, event.data.message);
            }
        };

        return {
            module,
            definition,
            signature,
            node,
            splitter,
            stereoMerger,
            leftGain,
            rightGain,
            channelGain,
            meterAnalyser,
            analysers
        };
    }

    disposeRuntime(runtime) {
        safeDisconnect(runtime.node);
        safeDisconnect(runtime.splitter);
        safeDisconnect(runtime.stereoMerger);
        safeDisconnect(runtime.leftGain);
        safeDisconnect(runtime.rightGain);
        safeDisconnect(runtime.channelGain);
        safeDisconnect(runtime.meterAnalyser);
        runtime.analysers?.forEach(analyser => safeDisconnect(analyser));
    }

    applyMixerState(patch) {
        const soloIds = new Set(
            Object.entries(patch.mixer.channels)
                .filter(([, channel]) => channel.solo)
                .map(([moduleId]) => moduleId)
        );

        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(patch.mixer.masterGain, this.audioContext.currentTime, 0.012);
        }

        for (const [moduleId, runtime] of this.modules) {
            const channel = patch.mixer.channels[moduleId] ?? {};
            const soloActive = soloIds.size > 0;
            const audible = !channel.mute && (!soloActive || channel.solo);
            const gain = audible ? Number(channel.gain ?? runtime.module.gain ?? 0) : 0;
            runtime.channelGain.gain.setTargetAtTime(gain, this.audioContext.currentTime, 0.012);
        }
    }

    rebuildConnections(patch) {
        for (const runtime of this.connections.values()) {
            safeDisconnect(runtime.gainNode);
        }
        this.connections.clear();

        patch.cables.forEach(cable => {
            if (cable.muted || cable.fromModuleId === cable.toModuleId) {
                return;
            }

            const source = this.modules.get(cable.fromModuleId);
            const target = this.modules.get(cable.toModuleId);

            if (!source || !target) {
                return;
            }

            const sourceIndex = source.definition.variableNames.indexOf(cable.fromOutput);
            const targetIndex = target.definition.parameterNames.indexOf(cable.toInput);

            if (sourceIndex < 0 || targetIndex < 0) {
                return;
            }

            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = cable.gain;
            try {
                source.splitter.connect(gainNode, sourceIndex, 0);
                gainNode.connect(target.node, 0, targetIndex);
                this.connections.set(cable.id, { cable, gainNode });
            } catch (error) {
                console.warn("Unable to connect cable", cable, error);
                safeDisconnect(gainNode);
            }
        });
    }

    setParameter(moduleId, parameterName, value) {
        const runtime = this.modules.get(moduleId);
        runtime?.node.port.postMessage({
            type: "setParameter",
            name: parameterName,
            value
        });
    }

    setCableGain(cableId, value) {
        const runtime = this.connections.get(cableId);

        if (runtime) {
            runtime.gainNode.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.01);
        }
    }

    setMasterGain(value) {
        if (this.masterGain && this.audioContext) {
            this.masterGain.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.012);
        }
    }

    resetModule(moduleId) {
        this.modules.get(moduleId)?.node.port.postMessage({ type: "reset" });
    }

    resetAll() {
        for (const runtime of this.modules.values()) {
            runtime.node.port.postMessage({ type: "reset" });
        }
    }

    getModuleRuntime(moduleId) {
        return this.modules.get(moduleId) ?? null;
    }

    getMasterAnalyser() {
        return this.masterAnalyser;
    }

    getMasterAnalysers() {
        return {
            left: this.masterLeftAnalyser ?? this.masterAnalyser,
            right: this.masterRightAnalyser ?? this.masterAnalyser
        };
    }

    destroy() {
        for (const runtime of this.modules.values()) {
            this.disposeRuntime(runtime);
        }
        this.modules.clear();

        for (const runtime of this.connections.values()) {
            safeDisconnect(runtime.gainNode);
        }
        this.connections.clear();

        safeDisconnect(this.masterGain);
        safeDisconnect(this.limiter);
        safeDisconnect(this.masterAnalyser);
        safeDisconnect(this.masterSplitter);
        safeDisconnect(this.masterLeftAnalyser);
        safeDisconnect(this.masterRightAnalyser);
        this.masterGain = null;
        this.limiter = null;
        this.masterAnalyser = null;
        this.masterSplitter = null;
        this.masterLeftAnalyser = null;
        this.masterRightAnalyser = null;
        this.ready = false;
        this.workletLoaded = false;
    }
}

export { AudioEngine };
