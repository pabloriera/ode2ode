import { AudioEngine } from "./audioEngine.js";
import {
    addCableToPatch,
    addModuleDefinitionToPatch,
    createDefaultPatch,
    exportPatch,
    importPatchText,
    loadPatch,
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
} from "./patch.js";
import { ODE_LIBRARY, cloneDefinition, normalizeOdeDefinition, slugifyName } from "./odeLibrary.js";
import { compileDesignDefinition, createDesignerPreview, defaultDesignInput } from "./designer.js";
import { createDesignerUi } from "./designerUi.js";
import { createUi } from "./ui.js";
import { createVisualSystem } from "./visuals.js";

const SAVE_DEBOUNCE_MS = 250;
const CUSTOM_LIBRARY_KEY = "rk4webaudio:v3-custom-odes";
const MIN_RACK_ZOOM = 0.35;
const MAX_RACK_ZOOM = 1.7;
const RACK_BASE_WIDTH = 1760;
const RACK_BASE_HEIGHT = 1240;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function loadCustomLibrary() {
    try {
        const stored = JSON.parse(localStorage.getItem(CUSTOM_LIBRARY_KEY) ?? "[]");
        return Array.isArray(stored)
            ? stored.map(definition => normalizeOdeDefinition(definition))
            : [];
    } catch {
        return [];
    }
}

function saveCustomLibrary(definitions) {
    localStorage.setItem(CUSTOM_LIBRARY_KEY, JSON.stringify(definitions.map(cloneDefinition), null, 2));
}

function findLibraryDefinition(library, libraryId) {
    const definition = library.find(item => item.libraryId === libraryId || item.id === libraryId);
    return definition ? cloneDefinition(definition) : null;
}

function normalizeCustomDefinition(definition) {
    const baseSlug = slugifyName(definition.name);
    const collidesWithBuiltin = ODE_LIBRARY.some(item => item.libraryId === baseSlug || item.id === baseSlug);
    const libraryId = collidesWithBuiltin ? `custom-${baseSlug}` : baseSlug;

    return normalizeOdeDefinition({
        ...definition,
        id: libraryId,
        libraryId,
        description: definition.description || "Designed in rk4.web.audio"
    });
}

function createApp() {
    let patch = loadPatch();
    let selectedModuleId = patch.modules[0]?.id ?? null;
    let selectedCableId = null;
    let rackZoom = 0.82;
    let activeView = "patch";
    let customLibrary = loadCustomLibrary();
    let designInput = defaultDesignInput();
    let designParameters = {};
    let designResult = null;
    const engine = new AudioEngine();
    const ui = createUi(document, {
        onAddModule(libraryId, position = null) {
            const definition = findLibraryDefinition(getLibrary(), libraryId);

            if (!definition) {
                ui.setStatus("MODULE NOT FOUND");
                return;
            }

            patch = addModuleDefinitionToPatch(patch, definition, position);
            selectedModuleId = patch.modules[patch.modules.length - 1]?.id ?? selectedModuleId;
            selectedCableId = null;
            commit("MODULE ADDED");
        },
        onViewChange(view) {
            setActiveView(view);
        },
        async onToggleRun() {
            try {
                let running;

                if (engine.isRunning()) {
                    await engine.suspend();
                    running = false;
                } else {
                    running = await engine.startFromGesture();
                    await engine.syncPatch(patch);
                }

                ui.setRunning(running);
                ui.setStatus(running ? "AUDIO RUNNING" : "AUDIO HELD");
            } catch (error) {
                ui.setStatus(`AUDIO ERROR / ${error.message}`);
            }
        },
        onReset() {
            patch = createDefaultPatch();
            engine.resetAll();
            commit("PATCH RESET");
        },
        onSave() {
            savePatch(patch);
            exportPatch(patch);
            ui.setStatus("PATCH SAVED");
        },
        onLoadFile(file) {
            file.text()
                .then(text => {
                    patch = importPatchText(text);
                    commit("PATCH LOADED");
                })
                .catch(() => ui.setStatus("LOAD FAILED / INVALID JSON"));
        },
        onAutoPatch() {
            patch = autoPatch(patch);
            commit("CABLES ROUTED");
        },
        onClearCables() {
            patch = { ...patch, cables: [] };
            selectedCableId = null;
            commit("CABLES CLEARED");
        },
        onParamChange(moduleId, parameterName, value) {
            patch = updateModuleParameter(patch, moduleId, parameterName, value);
            engine.setParameter(moduleId, parameterName, value);
            commit("PARAMETER WRITTEN", { render: false });
        },
        onInputGain(moduleId, inputName, value) {
            patch = updateModuleInputGain(patch, moduleId, inputName, value);
            commit("INPUT GAIN WRITTEN", { render: false, sync: true });
        },
        onMixerChannel(moduleId, updates) {
            patch = updateMixerChannel(patch, moduleId, updates);
            commit("MIXER WRITTEN", {
                render: "mute" in updates || "solo" in updates,
                sync: true
            });
        },
        onCableGain(cableId, value) {
            patch = updateCableGain(patch, cableId, value);
            engine.setCableGain(cableId, value);
            commit("CABLE GAIN WRITTEN", { render: false });
        },
        onCableGainRange(cableId, range) {
            patch = updateCableGainRange(patch, cableId, range);
            const cable = patch.cables.find(candidate => candidate.id === cableId);
            if (cable) {
                engine.setCableGain(cableId, cable.gain);
            }
            commit("CABLE GAIN RANGE WRITTEN", { render: true, sync: true });
        },
        onRemoveCable(cableId) {
            patch = removeCableFromPatch(patch, cableId);
            if (selectedCableId === cableId) {
                selectedCableId = null;
            }
            commit("CABLE REMOVED");
        },
        onMasterGain(value) {
            patch = updateMasterGain(patch, value);
            engine.setMasterGain(patch.mixer.masterGain);
            commit("MASTER WRITTEN", { render: false });
        },
        onPatchCable(start, end) {
            const source = start.kind === "output" ? start : end.kind === "output" ? end : null;
            const target = start.kind === "input" ? start : end.kind === "input" ? end : null;

            if (!source || !target || source.moduleId === target.moduleId) {
                ui.setStatus("PATCH REJECTED");
                return;
            }

            patch = addCableToPatch(patch, {
                fromModuleId: source.moduleId,
                fromOutput: source.name,
                toModuleId: target.moduleId,
                toInput: target.name,
                gain: 0.25
            });
            selectedCableId = patch.cables[patch.cables.length - 1]?.id ?? selectedCableId;
            commit("CABLE PATCHED");
        },
        onRemoveModule(moduleId) {
            patch = removeModuleFromPatch(patch, moduleId);
            if (selectedModuleId === moduleId) {
                selectedModuleId = patch.modules[0]?.id ?? null;
            }
            commit("MODULE REMOVED");
        },
        onSelectModule(moduleId) {
            selectedModuleId = moduleId;
            selectedCableId = null;
            commit("MODULE SELECTED", { sync: false });
        },
        onToggleFold(moduleId) {
            const module = patch.modules.find(candidate => candidate.id === moduleId);
            patch = updateModuleFolded(patch, moduleId, !module?.folded);
            commit(module?.folded ? "PANEL OPENED" : "PANEL FOLDED", { sync: false });
        },
        onToggleFoldAll() {
            const shouldFold = patch.modules.some(module => !module.folded);
            patch = {
                ...patch,
                modules: patch.modules.map(module => ({ ...module, folded: shouldFold }))
            };
            commit(shouldFold ? "ALL PANELS FOLDED" : "ALL PANELS OPENED", { sync: false });
        },
        onResetModule(moduleId) {
            engine.resetModule(moduleId);
            ui.setStatus("MODULE RESET");
        },
        onScopeMode(moduleId, scopeMode) {
            patch = updateModuleScopeMode(patch, moduleId, scopeMode);
            commit("SCOPE MODE WRITTEN");
        },
        onTimeScale(moduleId, value) {
            patch = updateModuleInPatch(patch, moduleId, module => ({
                ...module,
                definition: {
                    ...module.definition,
                    timeScale: value
                }
            }));
            commit("TIME SCALE WRITTEN", { render: false, sync: true });
        },
        onOversample(moduleId, value) {
            patch = updateModuleInPatch(patch, moduleId, module => ({
                ...module,
                definition: {
                    ...module.definition,
                    oversample: Math.round(value)
                }
            }));
            commit("OVERSAMPLE WRITTEN", { render: false, sync: true });
        },
        onParameterRange(moduleId, parameterName, range) {
            patch = updateModuleParameterRange(patch, moduleId, parameterName, range);
            engine.setParameter(moduleId, parameterName, patch.modules
                .find(module => module.id === moduleId)
                ?.parameters[parameterName]);
            commit("PARAMETER RANGE WRITTEN", { render: true, sync: true });
        }
    });
    const visuals = createVisualSystem(document, engine);
    const designerPreview = createDesignerPreview();
    const designerUi = createDesignerUi(document, {
        onDesignChange(nextInput) {
            designInput = {
                ...designInput,
                ...nextInput
            };
            compileDesigner();
        },
        onDesignInitialConditionChange(variableName, value) {
            designInput = {
                ...designInput,
                initialValues: {
                    ...designInput.initialValues,
                    [variableName]: Number(value)
                }
            };
            compileDesigner();
        },
        onDesignOutputScaleChange(variableName, value) {
            designInput = {
                ...designInput,
                outputScales: {
                    ...designInput.outputScales,
                    [variableName]: Number(value)
                }
            };
            compileDesigner();
        },
        onDesignPhaseInitialClick({ x, y, variables, outputScales }) {
            const [xName, yName] = variables;
            const xScale = Math.max(0.001, Number(outputScales[xName] ?? 0.25));
            const yScale = Math.max(0.001, Number(outputScales[yName] ?? 0.25));
            const nextInitialValues = {
                ...designInput.initialValues,
                [xName]: Math.atanh(x) / xScale,
                [yName]: Math.atanh(y) / yScale
            };

            designInput = {
                ...designInput,
                initialValues: nextInitialValues
            };
            compileDesigner();
            designerPreview.reset();
            ui.setStatus("INITIAL CONDITION SET");
        },
        onDesignReset() {
            designerPreview.reset();
            ui.setStatus("DESIGN TRAJECTORY RESET");
        },
        onDesignParameterChange(parameterName, updates) {
            const current = designParameters[parameterName] ?? { value: 1, min: -4, max: 4 };
            const min = Number(updates.min ?? current.min);
            const max = Number(updates.max ?? current.max);
            const rangeMin = Math.min(min, max);
            const rangeMax = Math.max(min, max);
            const nextValue = Number(updates.value ?? current.value);

            designParameters = {
                ...designParameters,
                [parameterName]: {
                    value: clamp(Number.isFinite(nextValue) ? nextValue : current.value, rangeMin, rangeMax),
                    min: rangeMin,
                    max: rangeMax
                }
            };
            compileDesigner();
        },
        onDesignSave() {
            const savedDefinition = saveCurrentDesignDefinition();

            if (savedDefinition) {
                ui.render(patch, getViewState());
                ui.setActiveView(activeView);
                ui.setStatus(`MODEL SAVED / ${savedDefinition.name.toUpperCase()}`);
            }
        },
        onDesignAddToPatch() {
            const savedDefinition = saveCurrentDesignDefinition();

            if (!savedDefinition) {
                return;
            }

            patch = addModuleDefinitionToPatch(patch, savedDefinition);
            selectedModuleId = patch.modules[patch.modules.length - 1]?.id ?? selectedModuleId;
            selectedCableId = null;
            setActiveView("patch");
            commit("DESIGN MODULE ADDED");
        }
    });
    let saveHandle = null;
    let dragState = null;

    function getLibrary() {
        return [...ODE_LIBRARY, ...customLibrary];
    }

    function compileDesigner() {
        designResult = compileDesignDefinition(designInput, designParameters);

        if (designResult.ok) {
            designInput = {
                ...designInput,
                initialValues: {
                    ...designInput.initialValues,
                    ...designResult.definition.initialValues
                },
                outputScales: {
                    ...designInput.outputScales,
                    ...designResult.definition.outputScales
                }
            };
            designParameters = Object.fromEntries(
                designResult.definition.parameterNames.map(parameterName => [
                    parameterName,
                    { ...designResult.definition.parameters[parameterName] }
                ])
            );
            designerPreview.setDefinition(designResult.definition);
        } else {
            designerPreview.setDefinition(null);
        }

        designerUi.renderCompile(designResult);
    }

    function saveCurrentDesignDefinition() {
        if (!designResult?.ok) {
            ui.setStatus(`DESIGN ERROR / ${designResult?.message ?? "INVALID"}`);
            return null;
        }

        const definition = normalizeCustomDefinition(designResult.definition);
        customLibrary = [
            ...customLibrary.filter(item => item.libraryId !== definition.libraryId && item.id !== definition.id),
            definition
        ];
        saveCustomLibrary(customLibrary);
        return definition;
    }

    function setActiveView(view) {
        activeView = view === "design" ? "design" : "patch";
        ui.setActiveView(activeView);
        ui.setStatus(activeView === "design" ? "DESIGN VIEW" : "PATCH VIEW");

        if (activeView === "patch") {
            window.dispatchEvent(new CustomEvent("rk4-rack-layout"));
            visuals.render(patch, getViewState());
        }
    }

    function scheduleSave() {
        window.clearTimeout(saveHandle);
        saveHandle = window.setTimeout(() => savePatch(patch), SAVE_DEBOUNCE_MS);
    }

    function commit(status, options = {}) {
        const render = options.render ?? true;
        const sync = options.sync ?? true;
        scheduleSave();

        if (render) {
            ui.render(patch, getViewState());
            ui.setActiveView(activeView);
            visuals.render(patch, getViewState());
        }

        if (sync) {
            engine.syncPatch(patch).catch(error => ui.setStatus(`ENGINE ERROR / ${error.message}`));
        }

        ui.setStatus(status);
    }

    function getViewState() {
        return {
            patch,
            library: getLibrary(),
            activeView,
            selectedModuleId,
            selectedCableId,
            rackZoom
        };
    }

    function autoPatch(currentPatch) {
        const modules = currentPatch.modules;

        if (modules.length < 2) {
            return currentPatch;
        }

        let nextPatch = { ...currentPatch, cables: [] };

        for (let index = 0; index < modules.length - 1; index += 1) {
            nextPatch = addCableToPatch(nextPatch, {
                fromModuleId: modules[index].id,
                fromOutput: modules[index].definition.variableNames[0],
                toModuleId: modules[index + 1].id,
                toInput: modules[index + 1].definition.parameterNames[0],
                gain: 0.25
            });
        }

        return nextPatch;
    }

    function wireDragging() {
        const stage = document.querySelector("[data-rack-stage]");
        const content = document.querySelector("[data-rack-content]");
        const rack = document.querySelector("[data-module-rack]");
        let panState = null;

        function getVisibleRackBounds() {
            const visibleWidth = stage.clientWidth / rackZoom;
            const visibleHeight = stage.clientHeight / rackZoom;

            return {
                width: Math.max(RACK_BASE_WIDTH, visibleWidth),
                height: Math.max(RACK_BASE_HEIGHT, visibleHeight)
            };
        }

        function syncRackSize() {
            const bounds = getVisibleRackBounds();
            stage.style.setProperty("--rack-width", `${bounds.width}px`);
            stage.style.setProperty("--rack-height", `${bounds.height}px`);
        }

        function applyRackZoom(nextZoom, anchorEvent = null) {
            const previousZoom = rackZoom;
            let anchor = null;

            if (anchorEvent) {
                const rect = stage.getBoundingClientRect();
                const mouseX = anchorEvent.clientX - rect.left;
                const mouseY = anchorEvent.clientY - rect.top;
                anchor = {
                    mouseX,
                    mouseY,
                    x: (stage.scrollLeft + mouseX) / previousZoom,
                    y: (stage.scrollTop + mouseY) / previousZoom
                };
            }

            rackZoom = clamp(nextZoom, MIN_RACK_ZOOM, MAX_RACK_ZOOM);
            stage.dataset.zoom = String(rackZoom);
            content.style.setProperty("--rack-zoom", rackZoom);
            syncRackSize();

            if (anchor) {
                stage.scrollLeft = anchor.x * rackZoom - anchor.mouseX;
                stage.scrollTop = anchor.y * rackZoom - anchor.mouseY;
            }

            visuals.render(patch, getViewState());
        }

        rack.addEventListener("pointerdown", event => {
            if (event.target.closest("button, input, select, label, .jack")) {
                return;
            }

            const dragHandle = event.target.closest("[data-drag-module]");
            const selectedPanel = event.target.closest(".ode-module");
            if (selectedPanel?.dataset.moduleId) {
                selectedModuleId = selectedPanel.dataset.moduleId;
                selectedCableId = null;
                if (!dragHandle) {
                    commit("MODULE SELECTED", { sync: false });
                } else {
                    document.querySelectorAll(".ode-module.is-selected").forEach(panel => panel.classList.remove("is-selected"));
                    selectedPanel.classList.add("is-selected");
                }
            }

            if (!dragHandle) {
                return;
            }

            const moduleId = dragHandle.dataset.dragModule;
            const panel = event.target.closest(".ode-module");
            const module = patch.modules.find(candidate => candidate.id === moduleId);

            if (!panel || !module) {
                return;
            }

            const maxZ = Math.max(0, ...patch.modules.map(candidate => candidate.z));
            dragState = {
                moduleId,
                panel,
                startX: event.clientX,
                startY: event.clientY,
                startLeft: module.position.x,
                startTop: module.position.y,
                nextZ: maxZ + 1
            };
            rack.setPointerCapture(event.pointerId);
            panel.style.zIndex = String(dragState.nextZ);
        });

        rack.addEventListener("pointermove", event => {
            if (!dragState) {
                return;
            }

            const bounds = getVisibleRackBounds();
            const panelWidth = dragState.panel.offsetWidth || 286;
            const panelHeight = dragState.panel.offsetHeight || 320;
            const maxX = Math.max(12, bounds.width - panelWidth - 12);
            const maxY = Math.max(12, bounds.height - panelHeight - 12);
            const nextX = clamp(dragState.startLeft + (event.clientX - dragState.startX) / rackZoom, 12, maxX);
            const nextY = clamp(dragState.startTop + (event.clientY - dragState.startY) / rackZoom, 12, maxY);
            dragState.panel.style.left = `${nextX}px`;
            dragState.panel.style.top = `${nextY}px`;
            visuals.render(patch, getViewState());
        });

        rack.addEventListener("pointerup", event => {
            if (!dragState) {
                return;
            }

            const nextX = Number.parseFloat(dragState.panel.style.left);
            const nextY = Number.parseFloat(dragState.panel.style.top);
            patch = updateModulePosition(patch, dragState.moduleId, {
                x: nextX,
                y: nextY,
                z: dragState.nextZ
            });
            rack.releasePointerCapture(event.pointerId);
            dragState = null;
            commit("LAYOUT WRITTEN", { render: true, sync: false });
            visuals.render(patch, getViewState());
        });

        rack.addEventListener("pointercancel", event => {
            if (!dragState) {
                return;
            }

            rack.releasePointerCapture(event.pointerId);
            dragState = null;
            ui.render(patch, getViewState());
            visuals.render(patch, getViewState());
        });

        stage.addEventListener("pointerdown", event => {
            if (
                event.button !== 0
                || event.target.closest(".ode-module, .cable-hit, button, input, select, label, .module-context-menu")
            ) {
                return;
            }

            panState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                startScrollLeft: stage.scrollLeft,
                startScrollTop: stage.scrollTop
            };
            stage.classList.add("is-panning");
            stage.setPointerCapture(event.pointerId);
        });

        stage.addEventListener("pointermove", event => {
            if (!panState) {
                return;
            }

            stage.scrollLeft = panState.startScrollLeft - (event.clientX - panState.startX);
            stage.scrollTop = panState.startScrollTop - (event.clientY - panState.startY);
            visuals.render(patch, getViewState());
        });

        stage.addEventListener("pointerup", event => {
            if (!panState) {
                return;
            }

            stage.releasePointerCapture(event.pointerId);
            stage.classList.remove("is-panning");
            panState = null;
        });

        stage.addEventListener("pointercancel", event => {
            if (!panState) {
                return;
            }

            stage.releasePointerCapture(event.pointerId);
            stage.classList.remove("is-panning");
            panState = null;
        });

        stage.addEventListener("wheel", event => {
            event.preventDefault();
            const direction = Math.sign(event.deltaY);
            const factor = direction > 0 ? 0.92 : 1.08;
            applyRackZoom(rackZoom * factor, event);
        }, { passive: false });

        stage.addEventListener("scroll", () => visuals.render(patch, getViewState()), { passive: true });
        window.addEventListener("resize", () => {
            syncRackSize();
            visuals.render(patch, getViewState());
        });
        document.addEventListener("rk4-cable-select", event => {
            selectedCableId = event.detail?.cableId ?? null;
            selectedModuleId = null;
            ui.render(patch, getViewState());
            visuals.render(patch, getViewState());
            ui.setStatus("CABLE SELECTED");
        });
        document.addEventListener("keydown", event => {
            if (event.target.closest?.("input, textarea, select, [contenteditable='true']")) {
                return;
            }

            if ((event.key === "Delete" || event.key === "Backspace") && selectedCableId) {
                event.preventDefault();
                patch = removeCableFromPatch(patch, selectedCableId);
                selectedCableId = null;
                commit("CABLE REMOVED");
            }
        });
        applyRackZoom(rackZoom);
    }

    function frame(time) {
        const masterPeak = visuals.tick(patch, time, getViewState());
        if (activeView === "design") {
            designerPreview.tick(designerUi.getCanvas(), designerUi.getScopeMode());
        }
        ui.updateReadouts(patch, time, masterPeak);
        requestAnimationFrame(frame);
    }

    window.addEventListener("beforeunload", () => savePatch(patch));
    ui.render(patch, getViewState());
    ui.setActiveView(activeView);
    designerUi.setInitial(designInput);
    compileDesigner();
    ui.setRunning(engine.isRunning());
    ui.setStatus("READY / ENGINE STANDBY");
    visuals.render(patch, getViewState());
    wireDragging();
    engine.syncPatch(patch).catch(error => ui.setStatus(`ENGINE ERROR / ${error.message}`));
    requestAnimationFrame(frame);
}

document.addEventListener("DOMContentLoaded", createApp);
