const debug = true;

function generateWATModule(expressions) {
    const watModuleParts = [
        `(module
    (memory (export "memory") 1)
    (func (export "evaluate") (param $t f64) (param $y i32) (param $p i32) (param $result i32)`
    ];

    let offset = 0;
    for (let expr of expressions) {
        // Tokenize the expression
        const tokens = tokenize(expr);
        if (debug) console.log("Tokens:", tokens);
        // Convert tokens to Reverse Polish Notation (RPN)
        const rpn = shuntingYard(tokens);
        if (debug) console.log("RPN:", rpn);
        // Build Abstract Syntax Tree (AST) from RPN
        const ast = buildAST(rpn);
        if (debug) console.log("AST:", ast);
        // Generate WAT code from AST
        const watCode = generateWATFromAST(ast);
        // Append WAT code for the current expression
        watModuleParts.push(`
        (f64.store
            (i32.add (local.get $result) (i32.const ${offset}))
            ${watCode}
        )`);
        offset += 8; // Assuming each f64 takes 8 bytes
    }

    // Close the function and module
    watModuleParts.push(`)
)`);
    if (debug) console.log("WAT Module Parts:", watModuleParts);
    return watModuleParts.join('\n');
}

function tokenize(expression) {
    const tokens = [];
    let index = 0;
    const length = expression.length;

    while (index < length) {
        let char = expression[index];

        if (/\s/.test(char)) {
            index++;
        } else if (char === '(' || char === ')') {
            tokens.push({ type: 'PAREN', value: char });
            index++;
        } else if (char === '-' && /[0-9.]/.test(expression[index + 1])) {
            // Handle negative numbers
            let number = char;
            index++;
            while (/[0-9.eE]/.test(expression[index])) {
                number += expression[index++];
            }
            tokens.push({ type: 'NUMBER', value: number });
        } else if (/[0-9.]/.test(char)) {
            let number = '';
            while (/[0-9.eE]/.test(expression[index])) {
                number += expression[index++];
            }
            tokens.push({ type: 'NUMBER', value: number });
        } else if ('+-*/^,'.includes(char)) {
            tokens.push({ type: 'OPERATOR', value: char });
            index++;
        } else if (/[a-zA-Z_]/.test(char)) {
            let identifier = '';
            // Read the base identifier
            while (index < length && /[a-zA-Z0-9_]/.test(expression[index])) {
                identifier += expression[index++];
            }

            // Check for array access
            if (index < length && expression[index] === '[') {
                identifier += expression[index++]; // add '['
                while (index < length && expression[index] !== ']') {
                    identifier += expression[index++];
                }
                if (index < length && expression[index] === ']') {
                    identifier += expression[index++]; // add ']'
                }
            }

            tokens.push({ type: 'IDENTIFIER', value: identifier });
        } else {
            throw new Error(`Unrecognized character at index ${index}: ${char}`);
        }
    }
    return tokens;
}

// Shunting Yard Algorithm: Converts tokens to RPN
function shuntingYard(tokens) {
    const outputQueue = [];
    const operatorStack = [];
    const operators = {
        '+': { precedence: 2, associativity: 'Left', arity: 2 },
        '-': { precedence: 2, associativity: 'Left', arity: 2 },
        '*': { precedence: 3, associativity: 'Left', arity: 2 },
        '/': { precedence: 3, associativity: 'Left', arity: 2 },
        '^': { precedence: 4, associativity: 'Right', arity: 2 },
        'u-': { precedence: 5, associativity: 'Right', arity: 1 }, // Unary minus
    };
    const functions = ['sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'abs'];

    tokens.forEach(token => {
        if (token.type === 'NUMBER' || token.type === 'IDENTIFIER') {
            outputQueue.push(token);
        } else if (functions.includes(token.value)) {
            operatorStack.push({ type: 'FUNCTION', value: token.value });
        } else if (token.type === 'OPERATOR') {
            let o1 = token.value;
            while (operatorStack.length > 0) {
                let o2 = operatorStack[operatorStack.length - 1];
                if ((o2.type === 'OPERATOR' &&
                        ((operators[o1].associativity === 'Left' && operators[o1].precedence <= operators[o2.value].precedence) ||
                            (operators[o1].associativity === 'Right' && operators[o1].precedence < operators[o2.value].precedence))) ||
                    o2.type === 'FUNCTION') {
                    outputQueue.push(operatorStack.pop());
                } else {
                    break;
                }
            }
            operatorStack.push(token);
        } else if (token.value === '(') {
            operatorStack.push(token);
        } else if (token.value === ')') {
            while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1].value !== '(') {
                outputQueue.push(operatorStack.pop());
            }
            operatorStack.pop(); // Pop the '('
            if (operatorStack.length > 0 && operatorStack[operatorStack.length - 1].type === 'FUNCTION') {
                outputQueue.push(operatorStack.pop());
            }
        }
    });

    while (operatorStack.length > 0) {
        outputQueue.push(operatorStack.pop());
    }

    return outputQueue;
}

// Builds an AST from the RPN tokens
function buildAST(rpn) {
    const stack = [];
    if (debug) console.log("Building AST from RPN:", rpn);

    rpn.forEach(token => {
        if (debug) console.log("Processing token:", token);

        if (token.type === 'NUMBER' || token.type === 'IDENTIFIER') {
            if (token.type === 'IDENTIFIER' && token.value.includes('[')) {
                const match = token.value.match(/([a-zA-Z]+)\[(\d+)\]/);
                if (match) {
                    stack.push({
                        type: 'ArrayAccess',
                        array: match[1],
                        index: parseInt(match[2], 10)
                    });
                } else {
                    stack.push({ type: 'Literal', value: token.value });
                }
            } else {
                stack.push({ type: 'Literal', value: token.value });
            }
        } else if (token.type === 'OPERATOR') {
            const operator = token.value;
            const arity = operator === 'u-' ? 1 : 2;
            if (stack.length < arity) {
                throw new Error(`Not enough operands for operator ${operator}`);
            }
            if (arity === 1) {
                let operand = stack.pop();
                stack.push({
                    type: 'UnaryExpression',
                    operator: operator,
                    argument: operand
                });
            } else {
                let right = stack.pop();
                let left = stack.pop();
                stack.push({
                    type: 'BinaryExpression',
                    operator: operator,
                    left: left,
                    right: right
                });
            }
        }
        if (debug) console.log("Stack after token:", stack);
    });

    if (debug) console.log("Final stack:", stack);
    if (stack.length !== 1) {
        throw new Error(`Invalid expression: expected 1 item on stack, got ${stack.length}. Stack: ${JSON.stringify(stack)}`);
    }
    return stack[0];
}

// Generates WAT code from the AST
function generateWATFromAST(node) {
    if (node.type === 'Literal') {
        if (/^-?\d/.test(node.value)) { // Modified to better handle negative numbers
            return `(f64.const ${node.value})`;
        } else if (node.value === 't') {
            return `(local.get $t)`;
        }
        throw new Error(`Unknown variable: ${node.value}`);
    } else if (node.type === 'ArrayAccess') {
        const index = node.index * 8;
        if (node.array === 'p') {
            return `(f64.load (i32.add (local.get $p) (i32.const ${index})))`;
        } else if (node.array === 'y') {
            return `(f64.load (i32.add (local.get $y) (i32.const ${index})))`;
        }
        throw new Error(`Unknown array access: ${node.array}`);
    } else if (node.type === 'BinaryExpression') {
        const left = generateWATFromAST(node.left);
        const right = generateWATFromAST(node.right);
        const opMap = {
            '+': 'f64.add',
            '-': 'f64.sub',
            '*': 'f64.mul',
            '/': 'f64.div',
            '^': 'f64.pow', // Note: f64.pow may need to be defined or imported
        };
        const op = opMap[node.operator];
        if (!op) throw new Error(`Unsupported operator: ${node.operator}`);
        return `(${op} ${left} ${right})`;
    } else if (node.type === 'UnaryExpression') {
        const arg = generateWATFromAST(node.argument);
        if (node.operator === 'u-') {
            return `(f64.neg ${arg})`;
        } else {
            throw new Error(`Unsupported unary operator: ${node.operator}`);
        }
    } else if (node.type === 'FunctionCall') {
        const arg = generateWATFromAST(node.argument);
        const funcMap = {
            'sin': 'f64.sin',
            'cos': 'f64.cos',
            'tan': 'f64.tan',
            'exp': 'f64.exp',
            'log': 'f64.log',
            'sqrt': 'f64.sqrt',
            'abs': 'f64.abs',
        };
        const func = funcMap[node.name];
        if (!func) throw new Error(`Unsupported function: ${node.name}`);
        return `(${func} ${arg})`;
    }
}

// // Example usage:
// const expressions = [
//     '-6.283185307179586*p[0] * y[1]',
//     '6.283185307179586*p[0] * y[0]'
// ];

// const watModule = generateWATModule(expressions);
// console.log('Generated WAT source:', watModule);

export { generateWATModule };