const DEFAULT_METHOD = "rk4";
const DEFAULT_TIME_SCALE = 1;
const DEFAULT_OVERSAMPLE = 2;
const DEFAULT_GAIN = 0.16;

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toFiniteNumber(value, label, fallback = null) {
    const numericValue = Number(value);

    if (Number.isFinite(numericValue)) {
        return numericValue;
    }

    if (fallback !== null) {
        return fallback;
    }

    throw new Error(`Invalid numeric value for ${label}`);
}

function createRange(value) {
    if (value === 0) {
        return { min: -1, max: 1 };
    }

    const lower = value * 0.25;
    const upper = value * 4;

    return {
        min: Math.min(lower, upper),
        max: Math.max(lower, upper)
    };
}

function normalizeParameter(name, input) {
    if (Array.isArray(input)) {
        if (input.length === 0) {
            throw new Error(`Parameter ${name} must include a value`);
        }

        const value = toFiniteNumber(input[0], `${name}.value`);
        const range = createRange(value);

        return {
            value,
            min: input.length > 1 ? toFiniteNumber(input[1], `${name}.min`) : range.min,
            max: input.length > 2 ? toFiniteNumber(input[2], `${name}.max`) : range.max
        };
    }

    if (isPlainObject(input)) {
        if (!("value" in input)) {
            throw new Error(`Parameter ${name} must include a value`);
        }

        const value = toFiniteNumber(input.value, `${name}.value`);
        const range = createRange(value);
        const min = "min" in input ? toFiniteNumber(input.min, `${name}.min`) : range.min;
        const max = "max" in input ? toFiniteNumber(input.max, `${name}.max`) : range.max;

        return {
            value,
            min: Math.min(min, max),
            max: Math.max(min, max)
        };
    }

    const value = toFiniteNumber(input, `${name}.value`);
    const range = createRange(value);

    return {
        value,
        min: range.min,
        max: range.max
    };
}

function normalizeParameters(parameters = {}) {
    if (!isPlainObject(parameters)) {
        throw new Error("ODE definition parameters must be an object");
    }

    return Object.fromEntries(
        Object.entries(parameters).map(([name, value]) => [name, normalizeParameter(name, value)])
    );
}

function normalizeEquationMap(equations = {}) {
    if (!isPlainObject(equations) || Object.keys(equations).length === 0) {
        throw new Error("ODE definition must include equations");
    }

    return Object.fromEntries(
        Object.entries(equations).map(([name, expression]) => {
            if (typeof expression !== "string" || !expression.trim()) {
                throw new Error(`Equation ${name} must be a non-empty string`);
            }

            return [String(name), expression.trim()];
        })
    );
}

function normalizeInitialValues(initialValues = {}, variableNames) {
    if (!isPlainObject(initialValues)) {
        throw new Error("ODE definition must include initialValues");
    }

    return Object.fromEntries(
        variableNames.map(variableName => [
            variableName,
            toFiniteNumber(initialValues[variableName], `initialValues.${variableName}`, 0)
        ])
    );
}

function normalizeOutputs(outputs, variableNames) {
    if (outputs == null) {
        return [...variableNames];
    }

    if (!Array.isArray(outputs) || outputs.length === 0) {
        throw new Error("outputs must be an array of variable names");
    }

    const normalized = outputs.map(String);

    normalized.forEach(outputName => {
        if (!variableNames.includes(outputName)) {
            throw new Error(`Output ${outputName} is not an ODE variable`);
        }
    });

    return normalized;
}

function normalizeOutputScales(outputScales, variableNames, fallback = 0.25) {
    return Object.fromEntries(
        variableNames.map(variableName => [
            variableName,
            toFiniteNumber(outputScales?.[variableName], `outputScales.${variableName}`, fallback)
        ])
    );
}

function slugifyName(name) {
    return String(name)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "ode";
}

function makeId(prefix = "ode") {
    const entropy = Math.random().toString(36).slice(2, 7);
    return `${prefix}-${Date.now().toString(36)}-${entropy}`;
}

function cloneDefinition(definition) {
    return JSON.parse(JSON.stringify(definition));
}

function normalizeOdeDefinition(input, options = {}) {
    if (!isPlainObject(input)) {
        throw new Error("ODE definition must be an object");
    }

    const equations = normalizeEquationMap(input.equations);
    const variableNames = Object.keys(equations);
    const parameters = normalizeParameters(input.parameters);
    const parameterNames = Object.keys(parameters);
    const name = String(input.name ?? "Untitled ODE").trim() || "Untitled ODE";
    const id = String(input.id ?? options.defaultId ?? slugifyName(name));
    const method = input.method === "euler" ? "euler" : DEFAULT_METHOD;
    const timeScale = toFiniteNumber(input.timeScale, "timeScale", DEFAULT_TIME_SCALE);
    const oversample = Math.max(1, Math.round(toFiniteNumber(input.oversample, "oversample", DEFAULT_OVERSAMPLE)));
    const outputScale = toFiniteNumber(input.outputScale, "outputScale", 0.25);

    return {
        id,
        libraryId: input.libraryId ?? id,
        type: "ode",
        name,
        description: String(input.description ?? ""),
        equations,
        variableNames,
        parameterNames,
        parameters,
        initialValues: normalizeInitialValues(input.initialValues, variableNames),
        method,
        timeScale,
        oversample,
        outputs: normalizeOutputs(input.outputs, variableNames),
        outputScales: normalizeOutputScales(input.outputScales, variableNames, outputScale),
        gain: toFiniteNumber(input.gain, "gain", DEFAULT_GAIN),
        scopeMode: input.scopeMode === "scope" ? "scope" : "phase"
    };
}

function parameterValueMap(definition, overrides = {}) {
    return Object.fromEntries(
        definition.parameterNames.map(parameterName => [
            parameterName,
            toFiniteNumber(overrides[parameterName], `parameters.${parameterName}`, definition.parameters[parameterName].value)
        ])
    );
}

function inputGainMap(definition, overrides = {}) {
    return Object.fromEntries(
        definition.parameterNames.map(parameterName => [
            parameterName,
            toFiniteNumber(overrides[parameterName], `inputGains.${parameterName}`, 1)
        ])
    );
}

function createModuleFromDefinition(definitionInput, options = {}) {
    const definition = normalizeOdeDefinition(definitionInput);
    const id = options.id ?? makeId(slugifyName(definition.name));
    const x = toFiniteNumber(options.x, "module.x", 80);
    const y = toFiniteNumber(options.y, "module.y", 80);

    return {
        id,
        type: "ode",
        libraryId: definition.libraryId,
        name: definition.name,
        definition: {
            ...definition,
            id
        },
        parameters: parameterValueMap(definition, options.parameters),
        inputGains: inputGainMap(definition, options.inputGains),
        position: { x, y },
        z: Math.round(toFiniteNumber(options.z, "module.z", 1)),
        gain: toFiniteNumber(options.gain, "module.gain", definition.gain),
        mute: Boolean(options.mute),
        solo: Boolean(options.solo),
        folded: Boolean(options.folded),
        scopeMode: options.scopeMode === "scope" || options.scopeMode === "phase"
            ? options.scopeMode
            : definition.scopeMode,
        colorIndex: Math.max(0, Math.round(toFiniteNumber(options.colorIndex, "module.colorIndex", 0)))
    };
}

const ODE_LIBRARY = [
    normalizeOdeDefinition({
        id: "hopf",
        libraryId: "hopf",
        name: "Hopf Core",
        description: "Two-variable limit cycle for direct tone work.",
        equations: {
            x: "TWO_PI*w*y + (g - b*(x*x + y*y))*x",
            y: "-TWO_PI*w*x + (g - b*(x*x + y*y))*y"
        },
        parameters: {
            w: { value: 110, min: 20, max: 1200 },
            g: { value: 1.2, min: -4, max: 4 },
            b: { value: 8, min: 0.1, max: 30 }
        },
        initialValues: { x: 0.5, y: 0.1 },
        timeScale: 1,
        oversample: 2,
        outputScale: 0.42,
        gain: 0.16,
        scopeMode: "phase"
    }),
    normalizeOdeDefinition({
        id: "lorenz",
        libraryId: "lorenz",
        name: "Lorenz Field",
        description: "Chaotic attractor with three routable variables.",
        equations: {
            x: "sigma*(y - x)",
            y: "x*(rho - z) - y",
            z: "x*y - beta*z"
        },
        parameters: {
            sigma: { value: 10, min: 1, max: 30 },
            rho: { value: 28, min: 0, max: 60 },
            beta: { value: 2.6667, min: 0.5, max: 8 }
        },
        initialValues: { x: 0.1, y: 0, z: 0 },
        timeScale: 14,
        oversample: 4,
        outputScales: { x: 0.035, y: 0.035, z: 0.025 },
        gain: 0.11,
        scopeMode: "phase"
    }),
    normalizeOdeDefinition({
        id: "duffing",
        libraryId: "duffing",
        name: "Duffing Drive",
        description: "Forced nonlinear oscillator with a modulation input.",
        equations: {
            x: "y",
            y: "-delta*y - alpha*x - beta*x*x*x + gamma*cos(omega*t) + drive"
        },
        parameters: {
            delta: { value: 0.22, min: 0, max: 1 },
            alpha: { value: -1, min: -3, max: 3 },
            beta: { value: 1, min: 0.1, max: 4 },
            gamma: { value: 0.34, min: 0, max: 1.5 },
            omega: { value: 1.2, min: 0.1, max: 12 },
            drive: { value: 0, min: -4, max: 4 }
        },
        initialValues: { x: 0.2, y: 0 },
        timeScale: 120,
        oversample: 4,
        outputScale: 0.28,
        gain: 0.12,
        scopeMode: "phase"
    }),
    normalizeOdeDefinition({
        id: "vanderpol",
        libraryId: "vanderpol",
        name: "Van der Pol",
        description: "Relaxation oscillator with a voltage-like mu input.",
        equations: {
            x: "y",
            y: "mu*(1 - x*x)*y - freq*x"
        },
        parameters: {
            mu: { value: 1.7, min: 0, max: 8 },
            freq: { value: 1, min: 0.05, max: 8 }
        },
        initialValues: { x: 1.2, y: 0 },
        timeScale: 90,
        oversample: 4,
        outputScale: 0.34,
        gain: 0.13,
        scopeMode: "phase"
    }),
    normalizeOdeDefinition({
        id: "hindmarsh-rose",
        libraryId: "hindmarsh-rose",
        name: "Hindmarsh Rose",
        description: "Three-variable spiking neuron model.",
        equations: {
            x: "y - a*x*x*x + b*x*x - z + I",
            y: "c - d*x*x - y",
            z: "r*(s*(x - xr) - z)"
        },
        parameters: {
            a: { value: 1, min: 0.2, max: 3 },
            b: { value: 3, min: 0.5, max: 6 },
            c: { value: 1, min: -3, max: 4 },
            d: { value: 5, min: 0.5, max: 9 },
            r: { value: 0.006, min: 0.001, max: 0.05 },
            s: { value: 4, min: 1, max: 8 },
            xr: { value: -1.6, min: -4, max: 2 },
            I: { value: 3.1, min: 0, max: 6 }
        },
        initialValues: { x: -1.2, y: -7, z: 3 },
        timeScale: 35,
        oversample: 4,
        outputScales: { x: 0.35, y: 0.08, z: 0.18 },
        gain: 0.1,
        scopeMode: "phase"
    })
];

function getLibraryDefinition(libraryId) {
    const definition = ODE_LIBRARY.find(item => item.libraryId === libraryId || item.id === libraryId);

    if (!definition) {
        throw new Error(`Unknown ODE library entry: ${libraryId}`);
    }

    return cloneDefinition(definition);
}

export {
    DEFAULT_GAIN,
    DEFAULT_METHOD,
    DEFAULT_OVERSAMPLE,
    DEFAULT_TIME_SCALE,
    ODE_LIBRARY,
    cloneDefinition,
    createModuleFromDefinition,
    getLibraryDefinition,
    inputGainMap,
    makeId,
    normalizeOdeDefinition,
    normalizeParameter,
    parameterValueMap,
    slugifyName,
    toFiniteNumber
};
