class AudioMixer {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.nodes = new Map(); // Map to store all input nodes
        this.mainGainNode = audioContext.createGain();
        this.mainGainNode.connect(audioContext.destination);

        // Default main volume
        this.mainGainNode.gain.value = 0.5;
    }

    // Add a node to the mixer
    addNode(nodeId, node) {
        // Create a gain node for this input
        const gainNode = this.audioContext.createGain();
        gainNode.connect(this.mainGainNode);

        // Store the node and its gain
        this.nodes.set(nodeId, {
            node: node,
            gain: gainNode
        });

        // Connect the node to its gain node
        node.disconnect(); // Disconnect from any previous connections
        node.connect(gainNode);

        return gainNode;
    }

    // Remove a node from the mixer
    removeNode(nodeId) {
        const nodeData = this.nodes.get(nodeId);
        if (nodeData) {
            nodeData.node.disconnect();
            nodeData.gain.disconnect();
            this.nodes.delete(nodeId);
        }
    }

    // Set individual node volume
    setNodeVolume(nodeId, volume) {
        const nodeData = this.nodes.get(nodeId);
        if (nodeData) {
            nodeData.gain.gain.setValueAtTime(volume, this.audioContext.currentTime);
        }
    }

    // Set main output volume
    setMainVolume(volume) {
        this.mainGainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
    }

    // Get main output volume
    getMainVolume() {
        return this.mainGainNode.gain.value;
    }

    // Disconnect all nodes
    disconnectAll() {
        for (const [nodeId, nodeData] of this.nodes) {
            nodeData.node.disconnect();
            nodeData.gain.disconnect();
        }
        this.nodes.clear();
        this.mainGainNode.disconnect();
    }
}

export { AudioMixer };