class OdeNodeVisualizer3D {
    constructor(gl, analysers, options = {}) {
        // Initialize Three.js components
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });

        // Set default options
        this.options = {
            lineColor: 0x00ff00,
            lineWidth: 2.0,
            type: 'trajectory', // 'trajectory' or 'phase'
            size: 1.0,
            maxPoints: 1000,
            variables: ['x', 'y', 'z'],
            ...options
        };

        // Initialize visualization components
        this.initializeScene();
        this.analysers = analysers;
        this.buffers = analysers.map(analyser => new Float32Array(analyser.frequencyBinCount));

        // Create line geometry for trajectory
        this.positions = new Float32Array(this.options.maxPoints * 3);
        this.lineGeometry = new THREE.BufferGeometry();
        this.lineGeometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

        // Create line material
        this.lineMaterial = new THREE.LineBasicMaterial({
            color: this.options.lineColor,
            linewidth: this.options.lineWidth
        });

        // Create line mesh
        this.line = new THREE.Line(this.lineGeometry, this.lineMaterial);
        this.scene.add(this.line);

        // Initialize point index for trajectory
        this.currentPoint = 0;
    }

    initializeScene() {
        // Setup renderer
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);

        // Setup camera position
        this.camera.position.z = 5;

        // Add grid helper
        const gridHelper = new THREE.GridHelper(10, 10);
        this.scene.add(gridHelper);

        // Add orbit controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);

        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
    }

    updateTrajectory() {
        // Get current audio data from analysers
        this.analysers.forEach((analyser, index) => {
            analyser.getFloatTimeDomainData(this.buffers[index]);
        });

        // Update position in the trajectory
        const index = this.currentPoint * 3;
        this.positions[index] = this.buffers[0][0] * this.options.size;
        this.positions[index + 1] = this.buffers[1][0] * this.options.size;
        this.positions[index + 2] = this.buffers[2][0] * this.options.size;

        // Update the geometry
        this.lineGeometry.attributes.position.needsUpdate = true;

        // Increment point counter
        this.currentPoint = (this.currentPoint + 1) % this.options.maxPoints;
    }

    draw() {
        this.updateTrajectory();
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    setLineColor(color) {
        this.lineMaterial.color.setHex(color);
    }

    setSize(size) {
        this.options.size = size;
    }

    dispose() {
        this.renderer.dispose();
        this.lineGeometry.dispose();
        this.lineMaterial.dispose();
        this.controls.dispose();
    }
}

class VisualizationSystem3D {
    constructor(audioContext, options = {}) {
        this.audioContext = audioContext;
        this.visualizers = new Map();
        this.isRunning = false;

        this.options = {
            backgroundColor: 0x000000,
            ...options
        };
    }

    addOdeNode(odeNode) {
        const analysers = [];
        const numberOfVariables = odeNode.odeWorkletNode.numberOfOutputs;

        for (let i = 0; i < numberOfVariables; i++) {
            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = 2048;
            analysers.push(analyser);
            odeNode.odeWorkletNode.connect(analyser, i);
        }

        const visualizer = new OdeNodeVisualizer3D(null, analysers, this.options);
        this.visualizers.set(odeNode, visualizer);
        return visualizer;
    }

    removeOdeNode(odeNode) {
        const visualizer = this.visualizers.get(odeNode);
        if (visualizer) {
            visualizer.dispose();
            this.visualizers.delete(odeNode);
        }
    }

    startVisualization() {
        this.isRunning = true;
        this.animate();
    }

    stopVisualization() {
        this.isRunning = false;
    }

    animate() {
        if (!this.isRunning) return;

        for (const visualizer of this.visualizers.values()) {
            visualizer.draw();
        }

        requestAnimationFrame(() => this.animate());
    }
}

export { VisualizationSystem3D, OdeNodeVisualizer3D };