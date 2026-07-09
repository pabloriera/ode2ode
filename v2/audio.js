function normalizeParameterValue(paramConfig) {
    if (Array.isArray(paramConfig)) {
        return Number(paramConfig[0] ?? 0);
    }

    if (paramConfig && typeof paramConfig === 'object' && 'value' in paramConfig) {
        return Number(paramConfig.value);
    }

    return Number(paramConfig ?? 0);
}

class AudioMixer {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.nodes = new Map();
        this.mainGainNode = audioContext.createGain();
        this.mainGainNode.gain.value = 0.5;
        this.mainGainNode.connect(audioContext.destination);
    }

    addNode(nodeId, node) {
        const gainNode = this.audioContext.createGain();
        gainNode.connect(this.mainGainNode);

        this.nodes.set(nodeId, {
            node,
            gain: gainNode
        });

        node.disconnect();
        node.connect(gainNode);
        return gainNode;
    }

    removeNode(nodeId) {
        const nodeData = this.nodes.get(nodeId);
        if (!nodeData) {
            return;
        }

        nodeData.node.disconnect();
        nodeData.gain.disconnect();
        this.nodes.delete(nodeId);
    }

    setNodeVolume(nodeId, volume) {
        const nodeData = this.nodes.get(nodeId);
        if (!nodeData) {
            return;
        }

        nodeData.gain.gain.setValueAtTime(volume, this.audioContext.currentTime);
    }

    setMainVolume(volume) {
        this.mainGainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
    }

    getMainVolume() {
        return this.mainGainNode.gain.value;
    }

    disconnectAll() {
        for (const nodeData of this.nodes.values()) {
            nodeData.node.disconnect();
            nodeData.gain.disconnect();
        }

        this.nodes.clear();
        this.mainGainNode.disconnect();
    }
}

class Parameter {
    constructor(audioContext, paramConfig) {
        this.audioContext = audioContext;
        this.value = normalizeParameterValue(paramConfig);

        this.parameterNode = new AudioWorkletNode(audioContext, 'parameter-generator', {
            processorOptions: {
                value: this.value,
                downsampleFactor: 100
            }
        });
    }

    setValue(value) {
        this.value = Number(value);
        this.parameterNode.port.postMessage({
            type: 'setValue',
            value: this.value
        });
    }

    connect(destination, index) {
        this.parameterNode.connect(destination, 0, index);
    }

    disconnect() {
        this.parameterNode.disconnect();
    }
}

export { AudioMixer, Parameter, normalizeParameterValue };
