const DEFAULT_METHOD = 'rk4';
const DEFAULT_TIME_SCALE = 1;
const DEFAULT_NODE_GAIN = 0.1;
const DEFAULT_DETUNING = 1;
const DEFAULT_VISUALIZATION_TYPE = 'oscilloscope';

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value, label) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        throw new Error(`Invalid numeric value for ${label}`);
    }
    return numericValue;
}

function createDefaultRange(value) {
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

function normalizeParameterDefinition(name, input) {
    if (Array.isArray(input)) {
        if (input.length === 0) {
            throw new Error(`Parameter ${name} must include at least a value`);
        }

        const value = toFiniteNumber(input[0], `${name}.value`);
        const range = createDefaultRange(value);

        return {
            value,
            min: input.length > 1 ? toFiniteNumber(input[1], `${name}.min`) : range.min,
            max: input.length > 2 ? toFiniteNumber(input[2], `${name}.max`) : range.max
        };
    }

    if (isPlainObject(input)) {
        if (!('value' in input)) {
            throw new Error(`Parameter ${name} must include a value field`);
        }

        const value = toFiniteNumber(input.value, `${name}.value`);
        const range = createDefaultRange(value);
        const min = 'min' in input ? toFiniteNumber(input.min, `${name}.min`) : range.min;
        const max = 'max' in input ? toFiniteNumber(input.max, `${name}.max`) : range.max;

        return {
            value,
            min: Math.min(min, max),
            max: Math.max(min, max)
        };
    }

    const value = toFiniteNumber(input, `${name}.value`);
    const range = createDefaultRange(value);
    return {
        value,
        min: range.min,
        max: range.max
    };
}

function normalizeParameterMap(parameters = {}) {
    if (!isPlainObject(parameters) || Object.keys(parameters).length === 0) {
        throw new Error('ODE definition must include at least one parameter');
    }

    return Object.fromEntries(
        Object.entries(parameters).map(([name, value]) => [name, normalizeParameterDefinition(name, value)])
    );
}

function normalizeInitialValues(initialValues = {}) {
    if (!isPlainObject(initialValues) || Object.keys(initialValues).length === 0) {
        throw new Error('ODE definition must include initialValues');
    }

    return Object.fromEntries(
        Object.entries(initialValues).map(([name, value]) => [name, toFiniteNumber(value, `initialValues.${name}`)])
    );
}

function normalizeEquations(equations = {}) {
    if (!isPlainObject(equations) || Object.keys(equations).length === 0) {
        throw new Error('ODE definition must include equations');
    }

    return Object.fromEntries(
        Object.entries(equations).map(([name, value]) => {
            if (typeof value !== 'string' || !value.trim()) {
                throw new Error(`Equation ${name} must be a non-empty string`);
            }
            return [name, value.trim()];
        })
    );
}

function slugifyName(name) {
    return String(name)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'ode-node';
}

function normalizeOutputs(outputs, equationNames) {
    if (outputs == null) {
        return [...equationNames];
    }

    if (!Array.isArray(outputs) || outputs.length === 0) {
        throw new Error('outputs must be an array of equation names');
    }

    const normalizedOutputs = outputs.map(output => String(output));
    normalizedOutputs.forEach(output => {
        if (!equationNames.includes(output)) {
            throw new Error(`Output ${output} is not defined in equations`);
        }
    });

    return normalizedOutputs;
}

function normalizeMethod(input) {
    const method = input.method ?? input.integrationMethod ?? DEFAULT_METHOD;
    if (method !== 'rk4' && method !== 'euler') {
        throw new Error(`Unsupported integration method: ${method}`);
    }
    return method;
}

function normalizeTimeScale(input) {
    const value = input.timeScale ?? DEFAULT_TIME_SCALE;
    return toFiniteNumber(value, 'timeScale');
}

function normalizeNodeGain(input) {
    const value = input.gain ?? DEFAULT_NODE_GAIN;
    return toFiniteNumber(value, 'gain');
}

function normalizeDetuning(input) {
    const value = input.detuning ?? DEFAULT_DETUNING;
    return toFiniteNumber(value, 'detuning');
}

function normalizeVisualizationType(input) {
    return typeof input.visualizationType === 'string' && input.visualizationType
        ? input.visualizationType
        : DEFAULT_VISUALIZATION_TYPE;
}

function normalizeOdeDefinition(input, { defaultId } = {}) {
    if (!isPlainObject(input)) {
        throw new Error('ODE definition must be an object');
    }

    const equations = normalizeEquations(input.equations);
    const initialValues = normalizeInitialValues(input.initialValues);
    const parameters = normalizeParameterMap(input.parameters);
    const name = String(input.name ?? 'Untitled ODE').trim() || 'Untitled ODE';
    const id = String(input.id ?? defaultId ?? slugifyName(name));
    const equationNames = Object.keys(equations);

    equationNames.forEach(variableName => {
        if (!(variableName in initialValues)) {
            throw new Error(`Missing initial value for equation variable ${variableName}`);
        }
    });

    return {
        id,
        type: 'ode',
        name,
        equations,
        parameters,
        initialValues,
        method: normalizeMethod(input),
        timeScale: normalizeTimeScale(input),
        outputs: normalizeOutputs(input.outputs, equationNames),
        gain: normalizeNodeGain(input),
        detuning: normalizeDetuning(input),
        visualizationType: normalizeVisualizationType(input)
    };
}

function getParameterValue(parameterDefinition) {
    return normalizeParameterDefinition('parameter', parameterDefinition).value;
}

function createExampleOdeDefinition() {
    return normalizeOdeDefinition({
        id: 'ode-hopf-1',
        name: 'Hopf',
        equations: {
            x: 'TWO_PI*w * y + (g - b*(x*x + y*y))*x',
            y: '-TWO_PI*w * x + (g - b*(x*x + y*y))*y'
        },
        parameters: {
            w: { value: 440.0, min: 0.0, max: 6080.0 },
            g: { value: 1.0, min: -4.0, max: 4.0 },
            b: { value: 10.0, min: 0.0, max: 30.0 }
        },
        initialValues: { x: 0.5, y: 1.0 },
        method: DEFAULT_METHOD,
        timeScale: DEFAULT_TIME_SCALE,
        outputs: ['x', 'y'],
        gain: DEFAULT_NODE_GAIN,
        detuning: DEFAULT_DETUNING,
        visualizationType: DEFAULT_VISUALIZATION_TYPE
    });
}

export {
    DEFAULT_DETUNING,
    DEFAULT_METHOD,
    DEFAULT_NODE_GAIN,
    DEFAULT_TIME_SCALE,
    DEFAULT_VISUALIZATION_TYPE,
    createExampleOdeDefinition,
    getParameterValue,
    normalizeOdeDefinition,
    normalizeParameterDefinition,
    normalizeParameterMap,
    slugifyName,
    toFiniteNumber
};
