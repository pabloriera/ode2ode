/**
 * Session JSON contract
 *
 * localStorage key: rk4webaudio.lastSession.v1
 *
 * Shape:
 * {
 *   version: 1,
 *   savedAt: string | null,
 *   patch: {
 *     nodes: [],
 *     connections: [],
 *     mixer: {
 *       masterGain: number,
 *       channels: {
 *         [nodeId]: { gain: number, mute: boolean, solo: boolean }
 *       }
 *     }
 *   },
 *   session: {
 *     panels: {
 *       [panelId]: { x, y, width, height, zIndex, collapsed }
 *     },
 *     visualization: {
 *       [panelId]: { mode, xVar, yVar, timeVars: string[] }
 *     },
 *     ui: {
 *       selectedPanelId: string | null,
 *       workspace: { panX, panY, zoom }
 *     }
 *   }
 * }
 */

const SESSION_STORAGE_KEY = 'rk4webaudio.lastSession.v1';
const SESSION_SCHEMA_VERSION = 1;

function isPlainObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function createDefaultPatchState() {
    return {
        nodes: [],
        connections: [],
        mixer: {
            masterGain: 0.5,
            channels: {}
        }
    };
}

function createDefaultSessionState() {
    return {
        panels: {},
        visualization: {},
        ui: {
            selectedPanelId: null,
            workspace: {
                panX: 0,
                panY: 0,
                zoom: 1
            }
        }
    };
}

function createDefaultSessionDocument() {
    return {
        version: SESSION_SCHEMA_VERSION,
        savedAt: null,
        patch: createDefaultPatchState(),
        session: createDefaultSessionState()
    };
}

function normalizeNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
}

function normalizeBoolean(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
}

function normalizeString(value, fallback) {
    return typeof value === 'string' ? value : fallback;
}

function normalizePanelState(panel) {
    const safePanel = isPlainObject(panel) ? panel : {};

    return {
        x: normalizeNumber(safePanel.x, 0),
        y: normalizeNumber(safePanel.y, 0),
        width: normalizeNumber(safePanel.width, 320),
        height: normalizeNumber(safePanel.height, 240),
        zIndex: normalizeNumber(safePanel.zIndex, 0),
        collapsed: normalizeBoolean(safePanel.collapsed, false)
    };
}

function normalizeMixerChannel(channel) {
    const safeChannel = isPlainObject(channel) ? channel : {};

    return {
        gain: normalizeNumber(safeChannel.gain, 1),
        mute: normalizeBoolean(safeChannel.mute, false),
        solo: normalizeBoolean(safeChannel.solo, false)
    };
}

function normalizeVisualizationState(config) {
    const safeConfig = isPlainObject(config) ? config : {};

    return {
        mode: normalizeString(safeConfig.mode, 'oscilloscope'),
        xVar: normalizeString(safeConfig.xVar, null),
        yVar: normalizeString(safeConfig.yVar, null),
        timeVars: Array.isArray(safeConfig.timeVars)
            ? safeConfig.timeVars.filter((value) => typeof value === 'string')
            : []
    };
}

function normalizeSessionDocument(raw) {
    const defaults = createDefaultSessionDocument();
    const safe = isPlainObject(raw) ? raw : {};

    const patchSource = isPlainObject(safe.patch) ? safe.patch : {};
    const sessionSource = isPlainObject(safe.session) ? safe.session : {};
    const mixerSource = isPlainObject(patchSource.mixer) ? patchSource.mixer : {};
    const uiSource = isPlainObject(sessionSource.ui) ? sessionSource.ui : {};
    const workspaceSource = isPlainObject(uiSource.workspace) ? uiSource.workspace : {};

    const panels = {};
    if (isPlainObject(sessionSource.panels)) {
        for (const [panelId, panelState] of Object.entries(sessionSource.panels)) {
            if (typeof panelId === 'string' && panelId) {
                panels[panelId] = normalizePanelState(panelState);
            }
        }
    }

    const visualization = {};
    if (isPlainObject(sessionSource.visualization)) {
        for (const [panelId, visualizationState] of Object.entries(sessionSource.visualization)) {
            if (typeof panelId === 'string' && panelId) {
                visualization[panelId] = normalizeVisualizationState(visualizationState);
            }
        }
    }

    const channels = {};
    if (isPlainObject(mixerSource.channels)) {
        for (const [channelId, channelState] of Object.entries(mixerSource.channels)) {
            if (typeof channelId === 'string' && channelId) {
                channels[channelId] = normalizeMixerChannel(channelState);
            }
        }
    }

    return {
        version: SESSION_SCHEMA_VERSION,
        savedAt: normalizeString(safe.savedAt, null),
        patch: {
            nodes: Array.isArray(patchSource.nodes) ? patchSource.nodes : defaults.patch.nodes,
            connections: Array.isArray(patchSource.connections) ? patchSource.connections : defaults.patch.connections,
            mixer: {
                masterGain: normalizeNumber(mixerSource.masterGain, defaults.patch.mixer.masterGain),
                channels
            }
        },
        session: {
            panels,
            visualization,
            ui: {
                selectedPanelId: normalizeString(uiSource.selectedPanelId, null),
                workspace: {
                    panX: normalizeNumber(workspaceSource.panX, 0),
                    panY: normalizeNumber(workspaceSource.panY, 0),
                    zoom: normalizeNumber(workspaceSource.zoom, 1)
                }
            }
        }
    };
}

function validateSessionDocument(sessionDocument) {
    const errors = [];

    if (!isPlainObject(sessionDocument)) {
        return {
            valid: false,
            errors: ['Session document must be an object.']
        };
    }

    if (sessionDocument.version !== SESSION_SCHEMA_VERSION) {
        errors.push(`Unsupported session version: ${sessionDocument.version}`);
    }

    if (!isPlainObject(sessionDocument.patch)) {
        errors.push('patch must be an object.');
    }

    if (!isPlainObject(sessionDocument.session)) {
        errors.push('session must be an object.');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

function migrateSessionDocument(raw) {
    return clone(normalizeSessionDocument(raw));
}

function serializeSessionDocument(sessionDocument) {
    return JSON.stringify(migrateSessionDocument(sessionDocument));
}

function getDefaultStorage() {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
        return globalThis.localStorage;
    }

    return null;
}

function loadSession(storage = getDefaultStorage()) {
    if (!storage) {
        return {
            ok: false,
            session: createDefaultSessionDocument(),
            errors: ['No storage backend available.']
        };
    }

    const rawText = storage.getItem(SESSION_STORAGE_KEY);
    if (!rawText) {
        return {
            ok: true,
            session: createDefaultSessionDocument(),
            errors: []
        };
    }

    try {
        const parsed = JSON.parse(rawText);
        const session = migrateSessionDocument(parsed);
        const validation = validateSessionDocument(session);

        if (!validation.valid) {
            return {
                ok: false,
                session: createDefaultSessionDocument(),
                errors: validation.errors
            };
        }

        return {
            ok: true,
            session,
            errors: []
        };
    } catch (error) {
        return {
            ok: false,
            session: createDefaultSessionDocument(),
            errors: [error instanceof Error ? error.message : String(error)]
        };
    }
}

function saveSession(storage = getDefaultStorage(), sessionDocument) {
    if (!storage) {
        return {
            ok: false,
            error: 'No storage backend available.'
        };
    }

    const session = migrateSessionDocument(sessionDocument);
    const validation = validateSessionDocument(session);
    if (!validation.valid) {
        return {
            ok: false,
            error: validation.errors.join(' ')
        };
    }

    try {
        storage.setItem(SESSION_STORAGE_KEY, serializeSessionDocument(session));
        return { ok: true };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

function clearSession(storage = getDefaultStorage()) {
    if (!storage) {
        return {
            ok: false,
            error: 'No storage backend available.'
        };
    }

    try {
        storage.removeItem(SESSION_STORAGE_KEY);
        return { ok: true };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

function createSessionStorageAdapter(storage = getDefaultStorage()) {
    return {
        key: SESSION_STORAGE_KEY,
        load: () => loadSession(storage),
        save: (sessionDocument) => saveSession(storage, sessionDocument),
        clear: () => clearSession(storage)
    };
}

function loadLastSession(storage = getDefaultStorage()) {
    const result = loadSession(storage);
    return result.session;
}

function saveLastSession(sessionDocument, storage = getDefaultStorage()) {
    const result = saveSession(storage, sessionDocument);
    return result.ok ? migrateSessionDocument(sessionDocument) : createDefaultSessionDocument();
}

export {
    SESSION_STORAGE_KEY,
    SESSION_SCHEMA_VERSION,
    clearSession,
    createDefaultSessionDocument,
    createSessionStorageAdapter,
    getDefaultStorage,
    loadLastSession,
    loadSession,
    migrateSessionDocument,
    normalizeSessionDocument,
    saveLastSession,
    saveSession,
    serializeSessionDocument,
    validateSessionDocument
};
