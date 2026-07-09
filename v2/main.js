import { AudioMixer } from './audio.js';
import { addMainVolumeControl, addPlayPauseButton, removeFolder } from './gui.js';
import { ODENode } from './ode.js';
import { VisualizationSystem } from './visual.js';
import { loadLastSession, saveLastSession } from './src/app/session-store.js';
import { createExampleOdeDefinition, normalizeOdeDefinition } from './src/domain/ode-definition.js';
import { createEmptyPatchDocument, removeNodeFromPatch, upsertOdeNodeInPatch } from './src/domain/patch-document.js';

const SESSION_SAVE_DEBOUNCE_MS = 300;

let audioContext = null;
let audioMixer = null;
let visSystem = null;
let wabtInstance = null;
let odeNodes = new Map();
let patchDocument = createEmptyPatchDocument();
let sessionState = loadLastSession().session;
let sessionSaveHandle = null;
let isRestoringSession = false;

function normalizeLoadedPatchDocument(loadedPatch) {
    const defaultPatch = createEmptyPatchDocument();
    const safePatch = loadedPatch ?? {};

    return {
        ...defaultPatch,
        ...safePatch,
        mixer: {
            ...defaultPatch.mixer,
            ...(safePatch.mixer ?? {}),
            channels: {
                ...(safePatch.mixer?.channels ?? {})
            }
        },
        nodes: Array.isArray(safePatch.nodes) ? safePatch.nodes : defaultPatch.nodes,
        connections: Array.isArray(safePatch.connections) ? safePatch.connections : defaultPatch.connections
    };
}

function buildSessionDocument() {
    return {
        version: 1,
        savedAt: new Date().toISOString(),
        patch: patchDocument,
        session: sessionState
    };
}

function flushSessionSave() {
    if (sessionSaveHandle) {
        clearTimeout(sessionSaveHandle);
        sessionSaveHandle = null;
    }

    if (!isRestoringSession) {
        saveLastSession(buildSessionDocument());
    }
}

function scheduleSessionSave() {
    if (isRestoringSession) {
        return;
    }

    if (sessionSaveHandle) {
        clearTimeout(sessionSaveHandle);
    }

    sessionSaveHandle = window.setTimeout(() => {
        sessionSaveHandle = null;
        saveLastSession(buildSessionDocument());
    }, SESSION_SAVE_DEBOUNCE_MS);
}

async function initAudio() {
    if (!audioContext) {
        try {
            audioContext = new AudioContext();
            audioMixer = new AudioMixer(audioContext);
            await audioContext.audioWorklet.addModule('parameter-generator.js');
            await audioContext.audioWorklet.addModule('odeint-generator.js');
        } catch (error) {
            console.error('Failed to initialize audio:', error);
            return false;
        }
    }

    return true;
}

async function initWABT() {
    if (!wabtInstance) {
        wabtInstance = await window.WabtModule();
    }
    return wabtInstance;
}

async function initSystems() {
    await initAudio();
    await initWABT();

    audioContext.suspend();

    const mainGuiConfig = {
        play: false,
        mainVolume: patchDocument.mixer.masterGain
    };

    addPlayPauseButton(mainGuiConfig, audioContext);
    addMainVolumeControl(mainGuiConfig, audioMixer, mainVolume => {
        patchDocument = {
            ...patchDocument,
            mixer: {
                ...patchDocument.mixer,
                masterGain: mainVolume
            }
        };
        scheduleSessionSave();
    });

    audioMixer.setMainVolume(mainGuiConfig.mainVolume);

    visSystem = new VisualizationSystem(audioContext);
    visSystem.startVisualization();
}

function disposeOdeRuntime(nodeId, { removeFromPatch = true } = {}) {
    const oldNode = odeNodes.get(nodeId);
    if (!oldNode) {
        return;
    }

    removeFolder(oldNode.gui);
    audioMixer.removeNode(nodeId);
    visSystem.removeOdeNode(oldNode);
    odeNodes.delete(nodeId);

    if (removeFromPatch) {
        patchDocument = removeNodeFromPatch(patchDocument, nodeId);
        scheduleSessionSave();
    }
}

function addOdeNode(rawConfig) {
    const config = normalizeOdeDefinition(rawConfig);

    if (odeNodes.has(config.id)) {
        disposeOdeRuntime(config.id, { removeFromPatch: false });
    }

    patchDocument = upsertOdeNodeInPatch(patchDocument, config);

    const node = new ODENode(audioContext, wabtInstance, config, nextDefinition => {
        patchDocument = upsertOdeNodeInPatch(patchDocument, nextDefinition);
        scheduleSessionSave();
    });

    const channelState = patchDocument.mixer.channels[config.id];
    audioMixer.addNode(config.id, node.gainNode, channelState.gain);
    visSystem.addOdeNode(node);
    odeNodes.set(config.id, node);
    scheduleSessionSave();

    return node;
}

function createExampleConfigText() {
    return JSON.stringify(createExampleOdeDefinition(), null, 2);
}

function restorePatch(editor) {
    const storedNodes = patchDocument.nodes.filter(node => node?.type === 'ode' && node.definition);

    if (storedNodes.length === 0) {
        editor.value = createExampleConfigText();
        return;
    }

    isRestoringSession = true;
    try {
        storedNodes.forEach(node => addOdeNode(node.definition));
        editor.value = JSON.stringify(storedNodes[storedNodes.length - 1].definition, null, 2);
    } finally {
        isRestoringSession = false;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const editor = document.getElementById('ode-config-editor');
    const storedSession = loadLastSession();
    patchDocument = normalizeLoadedPatchDocument(storedSession.patch);
    sessionState = storedSession.session;

    await initSystems();

    if (editor) {
        restorePatch(editor);

        editor.addEventListener('keydown', event => {
            if (event.ctrlKey && event.key === 'Enter') {
                try {
                    const rawConfig = JSON.parse(editor.value);
                    const node = addOdeNode(rawConfig);
                    editor.value = JSON.stringify(node.getSerializableDefinition(), null, 2);
                } catch (error) {
                    console.error('Failed to parse ODE configuration:', error);
                }
            }
        });
    }

    window.addEventListener('beforeunload', flushSessionSave);
});
