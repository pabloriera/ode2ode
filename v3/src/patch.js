import {
    ODE_LIBRARY,
    createModuleFromDefinition,
    getLibraryDefinition,
    makeId,
    normalizeOdeDefinition,
    parameterValueMap,
    toFiniteNumber
} from "./odeLibrary.js";

const PATCH_VERSION = 3;
const STORAGE_KEY = "rk4webaudio:v3-patch";

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max, fallback = min) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return fallback;
    }

    return Math.min(max, Math.max(min, numericValue));
}

function normalizeRange(min, max, fallbackMin, fallbackMax) {
    const nextMin = toFiniteNumber(min, "parameter.min", fallbackMin);
    const nextMax = toFiniteNumber(max, "parameter.max", fallbackMax);

    return {
        min: Math.min(nextMin, nextMax),
        max: Math.max(nextMin, nextMax)
    };
}

function createCable(options) {
    const gainRange = {
        min: toFiniteNumber(options.gainMin ?? options.gainRange?.min, "connection.gainMin", -4),
        max: toFiniteNumber(options.gainMax ?? options.gainRange?.max, "connection.gainMax", 4)
    };
    const gainMin = Math.min(gainRange.min, gainRange.max);
    const gainMax = Math.max(gainRange.min, gainRange.max);

    return {
        id: options.id ?? makeId("cable"),
        fromModuleId: String(options.fromModuleId),
        fromOutput: String(options.fromOutput),
        toModuleId: String(options.toModuleId),
        toInput: String(options.toInput),
        gain: clamp(toFiniteNumber(options.gain, "connection.gain", 0.25), gainMin, gainMax, 0.25),
        gainMin,
        gainMax,
        muted: Boolean(options.muted)
    };
}

function createMixerState(modules = [], mixer = {}) {
    const channels = {};

    modules.forEach(module => {
        const existing = mixer.channels?.[module.id] ?? {};
        channels[module.id] = {
            gain: clamp(existing.gain, 0, 1.5, module.gain),
            mute: Boolean(existing.mute ?? module.mute),
            solo: Boolean(existing.solo ?? module.solo)
        };
    });

    return {
        masterGain: clamp(mixer.masterGain, 0, 1.5, 0.72),
        channels
    };
}

function normalizeModule(rawModule, index = 0) {
    const libraryId = rawModule?.libraryId ?? rawModule?.definition?.libraryId ?? rawModule?.definition?.id ?? ODE_LIBRARY[0].libraryId;
    const baseDefinition = rawModule?.definition
        ? normalizeOdeDefinition(rawModule.definition)
        : getLibraryDefinition(libraryId);

    return createModuleFromDefinition(baseDefinition, {
        id: rawModule?.id,
        x: rawModule?.position?.x ?? rawModule?.x ?? 80 + index * 42,
        y: rawModule?.position?.y ?? rawModule?.y ?? 80 + index * 38,
        z: rawModule?.z ?? index + 1,
        parameters: rawModule?.parameters,
        inputGains: rawModule?.inputGains,
        gain: rawModule?.gain,
        mute: rawModule?.mute,
        solo: rawModule?.solo,
        folded: rawModule?.folded,
        scopeMode: rawModule?.scopeMode,
        colorIndex: rawModule?.colorIndex ?? index
    });
}

function normalizeCable(rawCable, modulesById) {
    if (!rawCable) {
        return null;
    }

    const fromModuleId = rawCable.fromModuleId ?? rawCable.from?.moduleId ?? rawCable.sourceId;
    const fromOutput = rawCable.fromOutput ?? rawCable.from?.variable ?? rawCable.output;
    const toModuleId = rawCable.toModuleId ?? rawCable.to?.moduleId ?? rawCable.targetId;
    const toInput = rawCable.toInput ?? rawCable.to?.input ?? rawCable.input;
    const sourceModule = modulesById.get(fromModuleId);
    const targetModule = modulesById.get(toModuleId);

    if (!sourceModule || !targetModule) {
        return null;
    }

    const outputName = sourceModule.definition.variableNames.includes(fromOutput)
        ? fromOutput
        : sourceModule.definition.variableNames[0];
    const inputName = targetModule.definition.parameterNames.includes(toInput)
        ? toInput
        : targetModule.definition.parameterNames[0];

    return createCable({
        id: rawCable.id,
        fromModuleId: sourceModule.id,
        fromOutput: outputName,
        toModuleId: targetModule.id,
        toInput: inputName,
        gain: rawCable.gain,
        gainMin: rawCable.gainMin,
        gainMax: rawCable.gainMax,
        gainRange: rawCable.gainRange,
        muted: rawCable.muted
    });
}

function normalizePatch(input = {}) {
    const rawModules = Array.isArray(input.modules) ? input.modules : [];
    const modules = rawModules.length > 0
        ? rawModules.map(normalizeModule)
        : createDefaultPatch().modules;
    const modulesById = new Map(modules.map(module => [module.id, module]));
    const cables = (input.cables ?? input.connections ?? [])
        .map(cable => normalizeCable(cable, modulesById))
        .filter(Boolean);

    return {
        version: PATCH_VERSION,
        id: String(input.id ?? "P-003"),
        name: String(input.name ?? "NULL ATTRACTOR"),
        modules,
        cables,
        mixer: createMixerState(modules, input.mixer ?? { masterGain: input.masterGain })
    };
}

function createDefaultPatch() {
    const hopf = createModuleFromDefinition(getLibraryDefinition("hopf"), {
        id: "voice-hopf",
        x: 72,
        y: 82,
        z: 1,
        colorIndex: 0
    });
    const duffing = createModuleFromDefinition(getLibraryDefinition("duffing"), {
        id: "voice-duffing",
        x: 520,
        y: 168,
        z: 2,
        colorIndex: 1
    });
    const lorenz = createModuleFromDefinition(getLibraryDefinition("lorenz"), {
        id: "voice-lorenz",
        x: 968,
        y: 88,
        z: 3,
        colorIndex: 2
    });

    return {
        version: PATCH_VERSION,
        id: "P-003",
        name: "NULL ATTRACTOR",
        modules: [hopf, duffing, lorenz],
        cables: [
            createCable({
                id: "hopf-x-to-duffing-drive",
                fromModuleId: hopf.id,
                fromOutput: "x",
                toModuleId: duffing.id,
                toInput: "drive",
                gain: 0.35
            }),
            createCable({
                id: "duffing-x-to-lorenz-rho",
                fromModuleId: duffing.id,
                fromOutput: "x",
                toModuleId: lorenz.id,
                toInput: "rho",
                gain: 2.2
            })
        ],
        mixer: createMixerState([hopf, duffing, lorenz], {
            masterGain: 0.72,
            channels: {
                [hopf.id]: { gain: 0.68 },
                [duffing.id]: { gain: 0.62 },
                [lorenz.id]: { gain: 0.55 }
            }
        })
    };
}

function addModuleToPatch(patch, libraryId, position = null) {
    return addModuleDefinitionToPatch(patch, getLibraryDefinition(libraryId), position);
}

function addModuleDefinitionToPatch(patch, definitionInput, position = null) {
    const normalized = normalizePatch(patch);
    const definition = normalizeOdeDefinition(definitionInput);
    const count = normalized.modules.length;
    const module = createModuleFromDefinition(definition, {
        x: position?.x ?? 96 + (count % 3) * 320,
        y: position?.y ?? 104 + Math.floor(count / 3) * 250,
        z: count + 1,
        colorIndex: count
    });
    const modules = [...normalized.modules, module];

    return normalizePatch({
        ...normalized,
        modules,
        mixer: createMixerState(modules, normalized.mixer)
    });
}

function updateModuleParameterRange(patch, moduleId, parameterName, rangeInput) {
    return updateModuleInPatch(patch, moduleId, module => {
        const parameter = module.definition.parameters[parameterName];

        if (!parameter) {
            return module;
        }

        const range = normalizeRange(rangeInput.min, rangeInput.max, parameter.min, parameter.max);
        const value = clamp(module.parameters[parameterName], range.min, range.max, parameter.value);

        module.definition = {
            ...module.definition,
            parameters: {
                ...module.definition.parameters,
                [parameterName]: {
                    ...parameter,
                    min: range.min,
                    max: range.max,
                    value
                }
            }
        };
        module.parameters[parameterName] = value;
        return module;
    });
}

function removeModuleFromPatch(patch, moduleId) {
    const normalized = normalizePatch(patch);
    const modules = normalized.modules.filter(module => module.id !== moduleId);

    return normalizePatch({
        ...normalized,
        modules,
        cables: normalized.cables.filter(cable => cable.fromModuleId !== moduleId && cable.toModuleId !== moduleId),
        mixer: createMixerState(modules, normalized.mixer)
    });
}

function updateModuleInPatch(patch, moduleId, updater) {
    const normalized = normalizePatch(patch);
    const modules = normalized.modules.map(module => (
        module.id === moduleId ? normalizeModule(updater(clone(module))) : module
    ));

    return normalizePatch({
        ...normalized,
        modules,
        mixer: createMixerState(modules, normalized.mixer)
    });
}

function updateModuleParameter(patch, moduleId, parameterName, value) {
    return updateModuleInPatch(patch, moduleId, module => {
        module.parameters[parameterName] = toFiniteNumber(value, `parameters.${parameterName}`, module.parameters[parameterName]);
        return module;
    });
}

function updateModuleInputGain(patch, moduleId, inputName, value) {
    return updateModuleInPatch(patch, moduleId, module => {
        module.inputGains[inputName] = toFiniteNumber(value, `inputGains.${inputName}`, module.inputGains[inputName]);
        return module;
    });
}

function updateModulePosition(patch, moduleId, position) {
    return updateModuleInPatch(patch, moduleId, module => {
        module.position = {
            x: toFiniteNumber(position.x, "position.x", module.position.x),
            y: toFiniteNumber(position.y, "position.y", module.position.y)
        };
        module.z = Math.round(toFiniteNumber(position.z, "position.z", module.z));
        return module;
    });
}

function updateModuleFolded(patch, moduleId, folded) {
    return updateModuleInPatch(patch, moduleId, module => {
        module.folded = Boolean(folded);
        return module;
    });
}

function updateModuleScopeMode(patch, moduleId, scopeMode) {
    return updateModuleInPatch(patch, moduleId, module => {
        module.scopeMode = scopeMode === "scope" ? "scope" : "phase";
        return module;
    });
}

function addCableToPatch(patch, cableOptions) {
    const normalized = normalizePatch(patch);
    const exists = normalized.cables.some(cable => (
        cable.fromModuleId === cableOptions.fromModuleId
        && cable.fromOutput === cableOptions.fromOutput
        && cable.toModuleId === cableOptions.toModuleId
        && cable.toInput === cableOptions.toInput
    ));

    if (exists || cableOptions.fromModuleId === cableOptions.toModuleId) {
        return normalized;
    }

    return normalizePatch({
        ...normalized,
        cables: [...normalized.cables, createCable(cableOptions)]
    });
}

function removeCableFromPatch(patch, cableId) {
    const normalized = normalizePatch(patch);

    return normalizePatch({
        ...normalized,
        cables: normalized.cables.filter(cable => cable.id !== cableId)
    });
}

function updateCableGain(patch, cableId, value) {
    const normalized = normalizePatch(patch);

    return normalizePatch({
        ...normalized,
        cables: normalized.cables.map(cable => (
            cable.id === cableId
                ? { ...cable, gain: toFiniteNumber(value, "connection.gain", cable.gain) }
                : cable
        ))
    });
}

function updateCableGainRange(patch, cableId, rangeInput) {
    const normalized = normalizePatch(patch);

    return normalizePatch({
        ...normalized,
        cables: normalized.cables.map(cable => {
            if (cable.id !== cableId) {
                return cable;
            }

            const range = normalizeRange(rangeInput.min, rangeInput.max, cable.gainMin, cable.gainMax);
            return {
                ...cable,
                gainMin: range.min,
                gainMax: range.max,
                gain: clamp(cable.gain, range.min, range.max, cable.gain)
            };
        })
    });
}

function updateMixerChannel(patch, moduleId, updates) {
    const normalized = normalizePatch(patch);

    return normalizePatch({
        ...normalized,
        mixer: {
            ...normalized.mixer,
            channels: {
                ...normalized.mixer.channels,
                [moduleId]: {
                    ...normalized.mixer.channels[moduleId],
                    ...updates
                }
            }
        }
    });
}

function updateMasterGain(patch, value) {
    const normalized = normalizePatch(patch);

    return normalizePatch({
        ...normalized,
        mixer: {
            ...normalized.mixer,
            masterGain: clamp(value, 0, 1.5, normalized.mixer.masterGain)
        }
    });
}

function buildRuntimeDefinition(module) {
    const definition = normalizeOdeDefinition(module.definition);

    return {
        ...definition,
        id: module.id,
        parameters: Object.fromEntries(
            definition.parameterNames.map(parameterName => [
                parameterName,
                {
                    ...definition.parameters[parameterName],
                    value: module.parameters[parameterName] ?? definition.parameters[parameterName].value
                }
            ])
        )
    };
}

function getModuleParameterValues(module) {
    return parameterValueMap(module.definition, module.parameters);
}

function savePatch(patch) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizePatch(patch), null, 2));
}

function loadPatch() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? normalizePatch(JSON.parse(stored)) : createDefaultPatch();
    } catch {
        return createDefaultPatch();
    }
}

function exportPatch(patch) {
    const blob = new Blob([JSON.stringify(normalizePatch(patch), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${normalizePatch(patch).id.toLowerCase()}-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

function importPatchText(text) {
    return normalizePatch(JSON.parse(text));
}

export {
    PATCH_VERSION,
    STORAGE_KEY,
    addModuleDefinitionToPatch,
    addCableToPatch,
    addModuleToPatch,
    buildRuntimeDefinition,
    createCable,
    createDefaultPatch,
    exportPatch,
    getModuleParameterValues,
    importPatchText,
    loadPatch,
    normalizePatch,
    removeCableFromPatch,
    removeModuleFromPatch,
    savePatch,
    updateCableGain,
    updateCableGainRange,
    updateMasterGain,
    updateMixerChannel,
    updateModuleFolded,
    updateModuleInputGain,
    updateModuleInPatch,
    updateModuleParameter,
    updateModuleParameterRange,
    updateModulePosition,
    updateModuleScopeMode
};
