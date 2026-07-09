import { normalizeOdeDefinition } from './ode-definition.js';

const PATCH_DOCUMENT_VERSION = 1;
const DEFAULT_MASTER_GAIN = 0.5;
const DEFAULT_CHANNEL_GAIN = 0.1;

function createMixerChannelState(overrides = {}) {
    return {
        gain: Number.isFinite(Number(overrides.gain)) ? Number(overrides.gain) : DEFAULT_CHANNEL_GAIN,
        mute: Boolean(overrides.mute),
        solo: Boolean(overrides.solo)
    };
}

function createEmptyPatchDocument() {
    return {
        version: PATCH_DOCUMENT_VERSION,
        nodes: [],
        connections: [],
        mixer: {
            masterGain: DEFAULT_MASTER_GAIN,
            channels: {}
        }
    };
}

function createPatchNode(odeDefinition) {
    const definition = normalizeOdeDefinition(odeDefinition);

    return {
        id: definition.id,
        type: 'ode',
        name: definition.name,
        definition
    };
}

function upsertOdeNodeInPatch(patchDocument, odeDefinition) {
    const basePatch = patchDocument ?? createEmptyPatchDocument();
    const patchNode = createPatchNode(odeDefinition);
    const nextNodes = basePatch.nodes.filter(node => node.id !== patchNode.id);
    nextNodes.push(patchNode);

    return {
        ...basePatch,
        nodes: nextNodes,
        mixer: {
            ...basePatch.mixer,
            channels: {
                ...basePatch.mixer.channels,
                [patchNode.id]: basePatch.mixer.channels[patchNode.id] ?? createMixerChannelState()
            }
        }
    };
}

function removeNodeFromPatch(patchDocument, nodeId) {
    if (!patchDocument) {
        return createEmptyPatchDocument();
    }

    const { [nodeId]: _removedChannel, ...remainingChannels } = patchDocument.mixer.channels;

    return {
        ...patchDocument,
        nodes: patchDocument.nodes.filter(node => node.id !== nodeId),
        connections: patchDocument.connections.filter(connection =>
            connection.fromNodeId !== nodeId && connection.toNodeId !== nodeId
        ),
        mixer: {
            ...patchDocument.mixer,
            channels: remainingChannels
        }
    };
}

function getPatchNodeById(patchDocument, nodeId) {
    return patchDocument?.nodes.find(node => node.id === nodeId) ?? null;
}

export {
    DEFAULT_CHANNEL_GAIN,
    DEFAULT_MASTER_GAIN,
    PATCH_DOCUMENT_VERSION,
    createEmptyPatchDocument,
    createMixerChannelState,
    createPatchNode,
    getPatchNodeById,
    removeNodeFromPatch,
    upsertOdeNodeInPatch
};
