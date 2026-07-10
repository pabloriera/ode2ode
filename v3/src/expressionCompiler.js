const MAX_ABS_STATE = 1e6;
const IDENTIFIER_PATTERN = /[A-Za-z_][A-Za-z0-9_]*/g;
const IDENTIFIER_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SAFE_EXPRESSION_PATTERN = /^[A-Za-z0-9_\s+\-*/%^(),.]+$/;

const MATH_FUNCTIONS = new Set([
    "abs",
    "acos",
    "asin",
    "atan",
    "atan2",
    "ceil",
    "cos",
    "cosh",
    "exp",
    "floor",
    "log",
    "max",
    "min",
    "pow",
    "sign",
    "sin",
    "sinh",
    "sqrt",
    "tan",
    "tanh"
]);
const CUSTOM_FUNCTIONS = new Set(["power", "sigmoid"]);
const ALLOWED_FUNCTIONS = new Set([...MATH_FUNCTIONS, ...CUSTOM_FUNCTIONS]);
const ALLOWED_CONSTANTS = new Set(["PI", "TWO_PI", "E"]);
const RESERVED_SYMBOLS = new Set([...ALLOWED_FUNCTIONS, ...ALLOWED_CONSTANTS, "t"]);

function finite(value, fallback = 0) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
}

function clampState(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.max(-MAX_ABS_STATE, Math.min(MAX_ABS_STATE, value));
}

function isIdentifierName(name) {
    return IDENTIFIER_NAME_PATTERN.test(String(name ?? ""));
}

function assertIdentifierName(name, label = "symbol") {
    if (!isIdentifierName(name)) {
        throw new Error(`Invalid ${label} "${name}"`);
    }

    if (RESERVED_SYMBOLS.has(name)) {
        throw new Error(`${label} "${name}" is reserved`);
    }
}

function extractIdentifiers(expression) {
    return Array.from(new Set(String(expression ?? "").match(IDENTIFIER_PATTERN) ?? []));
}

function isReservedSymbol(name) {
    return RESERVED_SYMBOLS.has(name);
}

function sanitizeExpression(expression, knownSymbols) {
    const source = String(expression ?? "").trim();

    if (!source || !SAFE_EXPRESSION_PATTERN.test(source)) {
        throw new Error(`Unsupported expression syntax: ${source}`);
    }

    extractIdentifiers(source).forEach(identifier => {
        if (!knownSymbols.has(identifier) && !RESERVED_SYMBOLS.has(identifier)) {
            throw new Error(`Unknown symbol "${identifier}" in "${source}"`);
        }
    });

    return source.replace(/\^/g, "**");
}

function compileExpression(expression, variableNames, parameterNames) {
    variableNames.forEach(name => assertIdentifierName(name, "variable"));
    parameterNames.forEach(name => assertIdentifierName(name, "parameter"));

    const knownSymbols = new Set([...variableNames, ...parameterNames, "t"]);
    const jsExpression = sanitizeExpression(expression, knownSymbols);
    const variableBindings = variableNames
        .map((name, index) => `const ${name}=state[${index}];`)
        .join("");
    const parameterBindings = parameterNames
        .map((name, index) => `const ${name}=params[${index}];`)
        .join("");
    const mathBindings = `const {${Array.from(MATH_FUNCTIONS).join(",")}}=Math;`;
    const customBindings = "const power=Math.pow;const sigmoid=(x)=>1/(1+Math.exp(-x));";
    const constantBindings = "const PI=Math.PI;const TWO_PI=Math.PI*2;const E=Math.E;";

    return new Function(
        "t",
        "state",
        "params",
        `"use strict";${mathBindings}${customBindings}${constantBindings}${variableBindings}${parameterBindings}return (${jsExpression});`
    );
}

function compileDefinition(definition) {
    const variableNames = definition.variableNames ?? Object.keys(definition.equations ?? {});
    const parameterNames = definition.parameterNames ?? Object.keys(definition.parameters ?? {});
    const params = Float64Array.from(parameterNames.map(name => finite(definition.parameters?.[name]?.value, 0)));
    const state = Float64Array.from(variableNames.map(name => finite(definition.initialValues?.[name], 0)));
    const functions = variableNames.map(variableName => (
        compileExpression(definition.equations[variableName], variableNames, parameterNames)
    ));

    functions.forEach(fn => {
        const value = fn(0, state, params);
        if (!Number.isFinite(value)) {
            throw new Error("Compiled expression produced a non-finite value");
        }
    });

    return {
        variableNames,
        parameterNames,
        functions,
        evaluate(t, currentState, currentParams, target) {
            for (let index = 0; index < functions.length; index += 1) {
                target[index] = clampState(functions[index](t, currentState, currentParams));
            }
        }
    };
}

function getAllowedFunctionNames() {
    return [...ALLOWED_FUNCTIONS].sort();
}

export {
    ALLOWED_CONSTANTS,
    ALLOWED_FUNCTIONS,
    RESERVED_SYMBOLS,
    assertIdentifierName,
    clampState,
    compileDefinition,
    compileExpression,
    extractIdentifiers,
    finite,
    getAllowedFunctionNames,
    isIdentifierName,
    isReservedSymbol
};
