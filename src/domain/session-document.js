import {
    createExampleOdeDefinition,
    normalizeOdeDefinition,
    toFiniteNumber
} from './ode-definition.js';

const SESSION_VERSION = 1;
const DEFAULT_MAIN_VOLUME = 0.5;
const DEFAULT_GAIN = 0.1;
const DEFAULT_DETUNING = 1;
const DEFAULT_VISUALIZATION_MODE = 'lissajous';
const DEFAULT_VISUALIZATION_SIZE = 1;

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringifyDefinition(definition) {
    return `${JSON.stringify(definition, null, 4)}\n`;
}

function normalizeNodeSession(input, index) {
    if (!isPlainObject(input)) {
        throw new Error(`Invalid node session at index ${index}`);
    }

    const definition = normalizeOdeDefinition(input.definition ?? input, {
        defaultId: `ode-node-${index + 1}`
    });

    return {
        definition,
        gain: 'gain' in input ? toFiniteNumber(input.gain, `nodes[${index}].gain`) : DEFAULT_GAIN,
        detuning: 'detuning' in input ? toFiniteNumber(input.detuning, `nodes[${index}].detuning`) : DEFAULT_DETUNING,
        visualizationMode: typeof input.visualizationMode === 'string' && input.visualizationMode.trim()
            ? input.visualizationMode
            : DEFAULT_VISUALIZATION_MODE,
        visualizationSize: 'visualizationSize' in input
            ? toFiniteNumber(input.visualizationSize, `nodes[${index}].visualizationSize`)
            : DEFAULT_VISUALIZATION_SIZE
    };
}

function createDefaultSessionDocument() {
    const definition = createExampleOdeDefinition();

    return {
        version: SESSION_VERSION,
        editorText: stringifyDefinition(definition),
        mainVolume: DEFAULT_MAIN_VOLUME,
        nodes: [
            {
                definition,
                gain: DEFAULT_GAIN,
                detuning: DEFAULT_DETUNING,
                visualizationMode: DEFAULT_VISUALIZATION_MODE,
                visualizationSize: DEFAULT_VISUALIZATION_SIZE
            }
        ],
        layout: {
            panels: {}
        }
    };
}

function normalizeSessionDocument(input) {
    if (!isPlainObject(input)) {
        return createDefaultSessionDocument();
    }

    const fallback = createDefaultSessionDocument();
    const nodes = Array.isArray(input.nodes) && input.nodes.length > 0
        ? input.nodes.map((node, index) => normalizeNodeSession(node, index))
        : fallback.nodes;

    return {
        version: SESSION_VERSION,
        editorText: typeof input.editorText === 'string' && input.editorText.trim()
            ? input.editorText
            : fallback.editorText,
        mainVolume: 'mainVolume' in input
            ? toFiniteNumber(input.mainVolume, 'mainVolume')
            : fallback.mainVolume,
        nodes,
        layout: isPlainObject(input.layout) ? input.layout : fallback.layout
    };
}

export {
    DEFAULT_DETUNING,
    DEFAULT_GAIN,
    DEFAULT_MAIN_VOLUME,
    DEFAULT_VISUALIZATION_MODE,
    DEFAULT_VISUALIZATION_SIZE,
    SESSION_VERSION,
    createDefaultSessionDocument,
    normalizeSessionDocument,
    stringifyDefinition
};
