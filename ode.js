let debug = true;
let wabtInstance = null;



// Constants
const TWO_PI = Math.PI * 2;


if (debug) console.log("AssemblyScript objects:", {
    loader: window.ASLoader,
    sdk: window.AssemblyScriptSDK
});

if (debug) console.log("WABT object:", window.WabtModule);


/* Parse the equations into a string. The variable names must be 
replaced with an array using the names in initialValues. The parameters must be
replaced with an object using the names in parameters.
*/
function parseEquations(equations, initialValues, parameters) {
    const varNames = Object.keys(initialValues);
    const paramNames = Object.keys(parameters);
    const equationStrings = Object.values(equations);

    return equationStrings.map(eqn => {
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

        return expr;
    });
}


function parseExpression(expr) {

    if (debug) {
        console.log("Parsing expression:", expr);
    }
    const stack = [];

    // Split on operators but keep array access intact
    const parts = expr.split(/([+\-*/()]|\s+)/g)
        .filter(p => p.trim());

    if (debug) console.log("Parts:", parts);

    // First pass: handle unary minus and convert values
    const tokens = [];
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part === '-' && (i === 0 || parts[i - 1] === '*' || parts[i - 1] === '/')) {
            // Unary minus
            const nextPart = parts[++i];
            if (!isNaN(nextPart)) {
                tokens.push(`(f64.const ${-parseFloat(nextPart)})`);
            } else if (nextPart.includes('[')) {
                const [array, index] = nextPart.split('[');
                const offset = parseInt(index) * 8;
                const value = array === 'y' ?
                    `(f64.load (i32.add (local.get $y) (i32.const ${offset})))` :
                    `(f64.load (i32.add (local.get $p) (i32.const ${offset})))`;
                tokens.push(`(f64.neg ${value})`);
            }
        } else if (!isNaN(part)) {
            tokens.push(`(f64.const ${parseFloat(part)})`);
        } else if (part.includes('[')) {
            const [array, index] = part.split('[');
            const offset = parseInt(index) * 8;
            tokens.push(array === 'y' ?
                `(f64.load (i32.add (local.get $y) (i32.const ${offset})))` :
                `(f64.load (i32.add (local.get $p) (i32.const ${offset})))`
            );
        } else if (part === '*' || part === '/') {
            tokens.push(part);
        }
    }

    if (debug) {
        console.log("Tokens after first pass:", tokens);
    }

    // Second pass: handle multiplication and division
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token === '*' || token === '/') {
            const left = stack.pop();
            const right = tokens[i + 1];
            if (!left || !right) {
                throw new Error(`Invalid expression: missing operand for ${token}`);
            }
            const op = token === '*' ? 'f64.mul' : 'f64.div';
            stack.push(`(${op} ${left} ${right})`);
            i++; // Skip the next token since we've used it
        } else {
            stack.push(token);
        }
    }

    if (stack.length !== 1) {
        console.log("Final stack:", stack);
        throw new Error('Invalid expression: unbalanced stack');
    }

    const result = stack[0];
    console.log("Final expression:", result);
    return result;
}


// Initialize WABT synchronously
function initWABT() {
    if (!wabtInstance) {
        // Block until promise resolves
        wabtInstance = window.WabtModule().then(instance => {
            wabtInstance = instance;
            return instance;
        }).catch(error => {
            console.error("Failed to initialize WABT:", error);
            throw error;
        });
    }
    // If wabtInstance is a promise, wait for it
    if (wabtInstance instanceof Promise) {
        throw new Error("WABT not initialized yet. Please try again.");
    }
    return wabtInstance;
}

function compileEquation(equations, initialValues, parameters) {
    // First ensure WABT is initialized
    const wabt = initWABT();

    if (debug) console.log("WABT instance:", wabt);

    // Rest of the function remains the same
    const parsedEqns = parseEquations(equations, initialValues, parameters);
    if (debug) {
        console.log("Parsed equations:", parsedEqns);
    }

    const watSource = `
    (module
        (memory (export "memory") 1)
        (func (export "evaluate") (param $t f64) (param $y i32) (param $p i32) (param $result i32)
            ;; Store results
            ${parsedEqns.map((eq, i) => `
                (f64.store
                    (i32.add (local.get $result) (i32.const ${i * 8}))
                    ${parseExpression(eq)}
                )
            `).join('\n')}
        )
    )`;

    if (debug) console.log("Generated WAT source:", watSource);

    try {
        const module = wabt.parseWat("equation.wat", watSource);
        const { buffer } = module.toBinary({});
        return buffer;
    } catch (error) {
        console.error("WASM compilation error:", error);
        console.log("Parsed equations:", parsedEqns);
        throw error;
    }
}

class ODENode {
        constructor(audioContext, config) {

        // block until the compileEquation function returns the wasm bytes
        const wasmBytes = compileEquation(
            config.equations,
            config.initialValues, 
            config.parameters
        );

        // Initialize base AudioWorkletNode first
        this.odeNode = new AudioWorkletNode(audioContext, "odeint-generator", {
            processorOptions: {
                wasmBytes: wasmBytes,
                initialValues: config.initialValues,
                parameters: config.parameters,
                equations: config.equations,
                method: config.method
            },
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2]
        });

        this.init(audioContext, config);
    }

    init(audioContext, config) {

        // Create and connect gain node
        this.gainNode = audioContext.createGain();
        this.gainNode.gain.value = 0.1;

        // Connect audio chain
        this.odeNode.connect(this.gainNode);
        this.gainNode.connect(audioContext.destination);

        console.log('Audio chain connected:', {
            odeNode: this.odeNode,
            gainNode: this.gainNode,
            destination: audioContext.destination
            });
       
    }
}

// Initialize WABT immediately when the file loads
window.WabtModule().then(instance => {
    wabtInstance = instance;
    console.log("WABT initialized successfully");
}).catch(error => {
    console.error("Failed to initialize WABT:", error);
});

export {
    parseEquations,
    parseExpression,
    compileEquation,
    ODENode
       
};