//Visualize the output of the ode using webgl
//Use the webgl 2d canvas api
//Buffer the output of the odeNode and draw the trajectory as a line
//Use the line method to draw the trajectory
//Use the point method to draw the trajectory
//Use the points method to draw the trajectory

//Initialize the visualizer
//create a canvas element
//create a webgl context
//create a buffer of the output of the odeNode
//draw the trajectory as a line
function initVisualizer(audioContext) {
    const canvas = document.getElementById('visualizer');
    if (!canvas) {
        throw new Error('Canvas element with id "visualizer" not found');
    }

    const gl = canvas.getContext('webgl');
    if (!gl) {
        throw new Error('WebGL not supported');
    }

    // Make canvas fullscreen
    function resizeCanvas() { // sq
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
    }

    // Initial resize and add listener
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return { canvas, gl };
}

//run a thread to make a loop draw


//OdeNodeVisualizer class
class OdeNodeVisualizer {
    constructor(gl, analysers, options = {}) {
        this.gl = gl;
        this.analysers = analysers;
        this.numberOfVariables = analysers.length;
        //Create a buffer for each analyser with int index
        this.buffers = [];
        for (let i = 0; i < this.numberOfVariables; i++) {
            this.buffers.push(new Float32Array(analysers[i].frequencyBinCount));
        }

        console.log('analysers', analysers);
        console.log('buffers', this.buffers);
        this.viewport = { x: 0, y: 0, width: 0, height: 0 };

        // Default options with custom overrides
        this.options = {
            lineColor: [0.0, 0.0, 0.0, 1.0],
            lineWidth: 2.0,
            type: 'lissajous', // default type
            size: 1.0,
            variables: ['x', 'y'], // default to single variable
            ...options
        };



        this.setupGL();
    }

    setViewport(x, y, width, height) {
        this.viewport = { x, y, width, height };
    }


    setupGL() {
        const gl = this.gl;

        // vertex shader to handle viewport transformation
        const vertexShaderSource = `
            attribute vec2 position;
            
            void main() {
                // Transform position to fit in the viewport
                gl_Position = vec4(position, 0.0, 1.0);
            }
        `;

        const fragmentShaderSource = `
            precision mediump float;
            uniform vec4 lineColor;
            void main() {
                gl_FragColor = lineColor;
            }
        `;

        // Create and compile vertex shader
        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertexShader, vertexShaderSource);
        gl.compileShader(vertexShader);

        // Create and compile fragment shader
        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragmentShader, fragmentShaderSource);
        gl.compileShader(fragmentShader);

        // Create shader program
        this.program = gl.createProgram();
        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);

        // Get position attribute location
        this.positionLocation = gl.getAttribLocation(this.program, 'position');
        this.regionLocation = gl.getUniformLocation(this.program, 'region');

        // Create buffer
        this.vertexBuffer = gl.createBuffer();

        // Enable attribute
        gl.enableVertexAttribArray(this.positionLocation);

        // Get line color location
        this.lineColorLocation = gl.getUniformLocation(this.program, 'lineColor');

        // Set initial line color
        gl.useProgram(this.program);
        gl.uniform4fv(this.lineColorLocation, this.options.lineColor);
    }

    draw() {
        const gl = this.gl;
        gl.viewport(
            this.viewport.x,
            this.viewport.y,
            this.viewport.width,
            this.viewport.height
        );

        gl.useProgram(this.program);

        // Get current audio data
        this.analysers.forEach((analyser, index) => {
            analyser.getFloatTimeDomainData(this.buffers[index]);
        });

        if (this.options.type === 'lissajous') {
            this.drawLissajous();
        } else {
            this.drawOscilloscope();
        }
    }

    drawLissajous() {
        const gl = this.gl;
        const vertices = new Float32Array(this.buffers[0].length * 2);

        // For Lissajous, we use pairs of samples as x,y coordinates
        for (let i = 0; i < this.buffers[0].length / 2; i++) {
            vertices[i * 2] = this.buffers[0][i] * 0.5 * this.options.size; // X coordinate
            vertices[i * 2 + 1] = this.buffers[1][i] * 0.5 * this.options.size; // Y coordinate
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINE_STRIP, 0, this.buffers[0].length / 2);
    }

    drawOscilloscope() {
        const gl = this.gl;
        const numVariables = this.options.variables.length;
        const verticesPerVariable = this.buffers[0].length / numVariables;
        const vertices = new Float32Array(this.buffers[0].length * 2);

        // Calculate spacing between variables
        const spacing = 2 / (numVariables + 1);

        for (let v = 0; v < numVariables; v++) {
            const yOffset = -1 + spacing * (v + 1); // Evenly space variables vertically

            for (let i = 0; i < verticesPerVariable; i++) {
                const bufferIndex = v * verticesPerVariable + i;
                const vertexIndex = bufferIndex * 2;

                vertices[vertexIndex] = (i / verticesPerVariable) * 2 - 1; // X coordinate
                vertices[vertexIndex + 1] = this.buffers[v][bufferIndex] * 0.5 * this.options.size + yOffset; // Y coordinate with offset
            }

            // Draw this variable's waveform
            gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, vertices.subarray(v * verticesPerVariable * 2, (v + 1) * verticesPerVariable * 2), gl.DYNAMIC_DRAW);
            gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.LINE_STRIP, 0, verticesPerVariable);
        }
    }

    setLineColor(r, g, b, a = 1.0) {
        this.options.lineColor = [r, g, b, a];
        // Update uniform in shader
        const gl = this.gl;
        gl.useProgram(this.program);
        gl.uniform4fv(this.lineColorLocation, this.options.lineColor);
    }


}

class VisualizationSystem {
    constructor(audioContext, options = {}) {
        const { canvas, gl } = initVisualizer(audioContext);
        this.gl = gl;
        this.canvas = canvas;
        this.audioContext = audioContext;
        this.visualizers = new Map();
        this.isRunning = false;

        // Default options
        this.options = {
            backgroundColor: [1.0, 1.0, 1.0, 1.0],
            gridSize: 200, // Size of each square visualizer in pixels
            padding: 20, // Padding between visualizers
            ...options
        };

        // Add fullscreen styles to canvas
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.zIndex = '-1';
        this.visgui = {};
    }

    calculateGridPositions() {
        const totalSize = this.options.gridSize + this.options.padding;
        const cols = Math.floor(this.canvas.width / totalSize);
        const rows = Math.floor(this.canvas.height / totalSize);

        const startX = (this.canvas.width - (cols * totalSize)) / 2;
        const startY = (this.canvas.height - (rows * totalSize)) / 2;

        return { cols, rows, startX, startY, totalSize };
    }

    updateViewports() {
        const { startX, startY, totalSize } = this.calculateGridPositions();
        let index = 0;

        for (const visualizer of this.visualizers.values()) {
            const row = Math.floor(index / this.gridCols);
            const col = index % this.gridCols;

            const x = startX + (col * totalSize);
            const y = startY + (row * totalSize);

            // Convert pixel coordinates to WebGL coordinates (-1 to 1)
            const normalizedX = (x / this.canvas.width) * 2 - 1;
            const normalizedY = 1 - (y / this.canvas.height) * 2;
            const normalizedSize = this.options.gridSize / Math.min(this.canvas.width, this.canvas.height) * 2;

            visualizer.setViewport(
                x,
                y,
                this.options.gridSize,
                this.options.gridSize
            );


            index++;
        }
    }

    updateGridLayout() {

        // Calculate grid dimensions
        const totalVisualizers = this.visualizers.size;
        this.gridCols = Math.ceil(Math.sqrt(totalVisualizers));
        this.gridRows = Math.ceil(totalVisualizers / this.gridCols);

        // Update viewport for each visualizer
        this.updateViewports();
    }

    setSize(visualizer, size) {
        visualizer.options.size = size;
    }

    setVisualizationType(visualizer, type) {
        visualizer.options.type = type;
    }

    addOdeNode(odeNode) {
        // Create an analyzer per variable for this node 
        const analysers = [];
        const numberOfVariables = odeNode.odeNode.numberOfOutputs;

        for (let i = 0; i < numberOfVariables; i++) {
            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = 2048 * 4;
            analysers.push(analyser);
        }


        // Connect the ODE node variables to channel selector and then to the corresponding  analyzers

        // print number of outputs of odeNode
        console.log('odeNode.numberOfOutputs', odeNode);

        for (let i = 0; i < analysers.length; i++) {
            odeNode.odeNode.connect(analysers[i], i);
        }

        // Create visualizer with its own analyzer
        const visualizer = new OdeNodeVisualizer(this.gl, analysers, this.options);
        this.visualizers.set(odeNode, visualizer);

        let folder = odeNode.gui;
        this.visgui[odeNode.config.name] = { 'visualizationType': 'lissajous', 'size': 1.0 };

        folder.add(this.visgui[odeNode.config.name], 'visualizationType', ['oscilloscope', 'lissajous'])
            .name('Visualization').onChange((type) => this.setVisualizationType(visualizer, type));

        //add size slider 
        folder.add(this.visgui[odeNode.config.name], 'size', 0.1, 2, 0.1).name('Size').onChange((size) => this.setSize(visualizer, size));

        this.updateGridLayout();

        return visualizer;
    }

    removeOdeNode(odeNode) {
        const visualizer = this.visualizers.get(odeNode);
        if (visualizer) {
            this.visualizers.delete(odeNode);
            this.updateGridLayout();
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

        // Clear with custom background color
        const bg = this.options.backgroundColor;
        this.gl.clearColor(bg[0], bg[1], bg[2], bg[3]);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        // Draw each visualizer in its viewport
        for (const visualizer of this.visualizers.values()) {
            visualizer.draw();
        }

        requestAnimationFrame(() => this.animate());
    }

    setVisualizer(visualizer, type, options = {}) {
        if (!visualizer) return;

        visualizer.options = {
            ...visualizer.options,
            type,
            ...options
        };
    }
}

export { VisualizationSystem, OdeNodeVisualizer };