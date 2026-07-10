function initials(name) {
    return String(name)
        .split(/\s+/)
        .map(part => part[0] ?? "")
        .join("")
        .slice(0, 2)
        .toUpperCase()
        .padEnd(2, "X");
}

function formatValue(value) {
    const numericValue = Number(value);
    const absolute = Math.abs(numericValue);

    if (!Number.isFinite(numericValue)) {
        return "0.00";
    }

    if (absolute >= 100) {
        return numericValue.toFixed(0);
    }

    if (absolute >= 10) {
        return numericValue.toFixed(1);
    }

    return numericValue.toFixed(2);
}

function gainToDb(gain) {
    const numericGain = Number(gain);

    if (!Number.isFinite(numericGain) || numericGain <= 0.001) {
        return "-INF";
    }

    return `${(20 * Math.log10(numericGain)).toFixed(1)}DB`;
}

function makeButton(className, label, title) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    if (title) {
        button.title = title;
    }
    return button;
}

function makeRange({ min, max, value, step, onInput }) {
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step ?? (((Number(max) - Number(min)) / 100) || 0.01));
    input.value = String(value);
    input.addEventListener("input", event => onInput(Number(event.target.value), input));
    return input;
}

function makeNumberInput(value, onChange) {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.value = String(value);
    input.addEventListener("change", event => onChange(Number(event.target.value)));
    return input;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function quantize(value, step) {
    const numericStep = Number(step);

    if (!Number.isFinite(numericStep) || numericStep <= 0) {
        return value;
    }

    return Math.round(value / numericStep) * numericStep;
}

function normalizedPercent(value, min, max) {
    const span = max - min || 1;
    return clamp((value - min) / span, 0, 1);
}

function expressionToTex(expression) {
    return String(expression)
        .replaceAll("TWO_PI", "2\\pi")
        .replaceAll("*", "\\cdot ")
        .replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\^2\b/g, "$1^{2}")
        .replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\^3\b/g, "$1^{3}");
}

function createVerticalKnob({
    className = "knob",
    min,
    max,
    value,
    step,
    title,
    labelText,
    outputText,
    valueToAngle,
    onChange
}) {
    const control = document.createElement("label");
    control.className = className;
    if (title) {
        control.title = title;
    }

    const label = labelText ? document.createElement("span") : null;
    const output = outputText != null ? document.createElement("output") : null;
    const hit = document.createElement("span");
    let currentValue = Number(value);

    hit.className = "knob-hit";
    hit.tabIndex = 0;
    hit.role = "slider";
    hit.setAttribute("aria-valuemin", String(min));
    hit.setAttribute("aria-valuemax", String(max));

    if (label) {
        label.textContent = labelText;
        control.append(label);
    }

    control.append(hit);

    if (output) {
        output.textContent = outputText;
        control.append(output);
    }

    function setValue(nextValue, notify = true) {
        currentValue = clamp(quantize(Number(nextValue), step), min, max);
        const angle = valueToAngle
            ? valueToAngle(currentValue)
            : normalizedPercent(currentValue, min, max) * 270 - 135;
        control.style.setProperty("--knob-value", `${angle}deg`);
        control.style.setProperty("--trim-value", `${angle}deg`);
        hit.setAttribute("aria-valuenow", String(currentValue));

        if (output) {
            output.textContent = formatValue(currentValue);
        }

        if (notify) {
            onChange(currentValue, control);
        }
    }

    function beginDrag(event) {
        event.preventDefault();
        event.stopPropagation();
        const startY = event.clientY;
        const startValue = currentValue;
        const span = max - min || 1;
        const travel = Math.max(1, window.innerHeight - 1);

        hit.setPointerCapture?.(event.pointerId);
        control.classList.add("is-dragging");

        function update(clientY) {
            const delta = (startY - clientY) / travel;
            setValue(startValue + delta * span);
        }

        function onPointerMove(moveEvent) {
            update(moveEvent.clientY);
        }

        function onPointerUp(upEvent) {
            update(upEvent.clientY);
            control.classList.remove("is-dragging");
            hit.releasePointerCapture?.(event.pointerId);
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("pointercancel", onPointerUp);
        }

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerUp);
    }

    function onKeyDown(event) {
        const increment = step ?? (max - min) / 100;

        if (event.key === "ArrowUp" || event.key === "ArrowRight") {
            event.preventDefault();
            setValue(currentValue + increment);
        }

        if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
            event.preventDefault();
            setValue(currentValue - increment);
        }
    }

    hit.addEventListener("pointerdown", beginDrag);
    hit.addEventListener("keydown", onKeyDown);
    control.setControlValue = setValue;
    setValue(currentValue, false);

    return control;
}

function createUi(doc, handlers) {
    const root = doc.querySelector("#app");
    const palette = doc.querySelector("[data-module-palette]");
    const rack = doc.querySelector("[data-module-rack]");
    const stage = doc.querySelector("[data-rack-stage]");
    const content = doc.querySelector("[data-rack-content]");
    const mixerChannels = doc.querySelector("[data-mixer-channels]");
    const masterGain = doc.querySelector("[data-master-gain]");
    const loadFile = doc.querySelector("[data-load-file]");
    const status = doc.querySelector("[data-status]");
    const inspector = doc.querySelector("[data-inspector]");
    const transportButton = doc.querySelector('[data-action="toggle-run"]');
    const selectedPort = { current: null };
    const contextMenu = doc.createElement("div");
    let libraryDefinitions = [];

    contextMenu.className = "module-context-menu";
    contextMenu.hidden = true;
    doc.body.append(contextMenu);
    renderPalette();
    wireStaticControls();

    function renderPalette() {
        if (!palette) {
            return;
        }

        palette.replaceChildren(...libraryDefinitions.map(definition => {
            const button = doc.createElement("button");
            button.type = "button";
            button.className = "module-add";
            button.dataset.moduleType = definition.libraryId;

            const code = doc.createElement("span");
            code.textContent = initials(definition.name);
            const name = doc.createElement("strong");
            name.textContent = definition.name;
            const detail = doc.createElement("small");
            detail.textContent = `${definition.variableNames.length} OUT / ${definition.parameterNames.length} IN`;

            button.append(code, name, detail);
            button.addEventListener("click", () => handlers.onAddModule(definition.libraryId));
            return button;
        }));
    }

    function wireStaticControls() {
        transportButton.addEventListener("click", handlers.onToggleRun);
        doc.querySelector('[data-action="reset"]')?.addEventListener("click", handlers.onReset);
        doc.querySelector('[data-action="save"]')?.addEventListener("click", handlers.onSave);
        doc.querySelector('[data-action="load"]')?.addEventListener("click", () => loadFile.click());
        doc.querySelector('[data-action="auto-patch"]')?.addEventListener("click", handlers.onAutoPatch);
        doc.querySelector('[data-action="clear-cables"]')?.addEventListener("click", handlers.onClearCables);
        doc.querySelector('[data-action="toggle-fold-all"]')?.addEventListener("click", handlers.onToggleFoldAll);
        doc.querySelectorAll("[data-view-tab]").forEach(button => {
            button.addEventListener("click", () => handlers.onViewChange?.(button.dataset.viewTab));
        });
        masterGain.addEventListener("input", event => handlers.onMasterGain(Number(event.target.value)));
        loadFile.addEventListener("change", event => {
            const [file] = event.target.files;
            if (file) {
                handlers.onLoadFile(file);
            }
            event.target.value = "";
        });
        stage.addEventListener("contextmenu", event => {
            event.preventDefault();
            showModuleMenu(event);
        });
        doc.addEventListener("pointerdown", event => {
            if (!contextMenu.hidden && !event.target.closest(".module-context-menu")) {
                contextMenu.hidden = true;
            }
        });
    }

    function render(patch, view = {}) {
        root.dataset.uiReady = "true";
        libraryDefinitions = view.library ?? libraryDefinitions;
        renderPalette();
        doc.querySelector('[data-readout="patch-id"]').textContent = patch.id;
        doc.querySelector('[data-readout="patch-name"]').textContent = patch.name;
        const foldAll = doc.querySelector('[data-action="toggle-fold-all"]');
        if (foldAll) {
            foldAll.textContent = patch.modules.some(module => !module.folded) ? "FOLD ALL" : "OPEN ALL";
        }
        masterGain.value = String(patch.mixer.masterGain);
        rack.replaceChildren(...patch.modules.map(module => renderModule(module, view)));
        mixerChannels.replaceChildren(
            ...patch.modules.map(module => renderMixerChannel(module, patch.mixer.channels[module.id])),
            ...renderCableRows(patch)
        );
        renderInspector(patch, view);
        markSelectedPort();
        updateReadouts(patch, performance.now(), 0);
        queueMicrotask(() => window.dispatchEvent(new CustomEvent("rk4-rack-layout")));
    }

    function renderModule(module, view) {
        const article = doc.createElement("article");
        article.className = `ode-module${module.folded ? " is-folded" : ""}${view.selectedModuleId === module.id ? " is-selected" : ""}`;
        article.dataset.moduleId = module.id;
        article.style.left = `${module.position.x}px`;
        article.style.top = `${module.position.y}px`;
        article.style.zIndex = String(module.z);
        article.style.setProperty("--activity", "0.25");
        article.style.setProperty("--activity-percent", "25%");

        article.append(renderModuleHeader(module));
        article.append(renderJackBank("input", module, module.definition.parameterNames, view.patch));
        article.append(renderModuleScope(module));

        if (!module.folded) {
            article.append(renderKnobs(module));
        }

        article.append(renderJackBank("output", module, module.definition.variableNames, view.patch));

        return article;
    }

    function renderModuleHeader(module) {
        const header = doc.createElement("header");
        header.className = "module-header module-drag";
        header.dataset.dragModule = module.id;

        const code = doc.createElement("span");
        code.textContent = initials(module.name);

        const name = doc.createElement("strong");
        name.textContent = module.name;

        const fold = makeButton("mini-button", module.folded ? "+" : "-", module.folded ? "Open panel" : "Fold panel");
        fold.addEventListener("pointerdown", event => event.stopPropagation());
        fold.addEventListener("click", event => {
            event.stopPropagation();
            handlers.onToggleFold(module.id);
        });

        const remove = makeButton("mini-button", "X", "Remove module");
        remove.addEventListener("pointerdown", event => event.stopPropagation());
        remove.addEventListener("click", event => {
            event.stopPropagation();
            handlers.onRemoveModule(module.id);
        });

        header.append(code, name, fold, remove);
        return header;
    }

    function renderJackBank(kind, module, names, patch) {
        const bank = doc.createElement("div");
        bank.className = `jack-bank ${kind}`;
        bank.dataset.kind = kind;

        names.forEach(name => {
            const port = doc.createElement("div");
            port.className = `port-cell ${kind}`;

            const button = doc.createElement("button");
            button.type = "button";
            button.className = "jack";
            button.dataset.jack = `${module.id}:${kind}:${name}`;
            button.dataset.moduleId = module.id;
            button.dataset.kind = kind;
            button.dataset.name = name;
            button.title = `${module.name} ${kind} ${name}`;

            const glyph = doc.createElement("span");
            const label = doc.createElement("small");
            label.textContent = name.toUpperCase();
            button.append(glyph, label);
            button.addEventListener("click", event => {
                event.stopPropagation();
                selectPort({ moduleId: module.id, kind, name });
            });

            port.append(button);

            if (kind === "input") {
                const cable = patch?.cables.find(candidate => candidate.toModuleId === module.id && candidate.toInput === name);
                const gainValue = cable ? cable.gain : module.inputGains?.[name] ?? 1;
                const min = cable ? cable.gainMin : 0;
                const max = cable ? cable.gainMax : 2;
                const trim = createVerticalKnob({
                    className: "input-trim",
                    min,
                    max,
                    value: gainValue,
                    step: 0.01,
                    title: cable ? `${cable.fromOutput} > ${name} cable gain` : `${name} input gain`,
                    onChange: value => {
                        if (cable) {
                            syncCableControls(cable.id, value);
                            handlers.onCableGain(cable.id, value);
                        } else {
                            handlers.onInputGain(module.id, name, value);
                        }
                    }
                });
                if (cable) {
                    trim.dataset.cableGainKnob = cable.id;
                }
                port.append(trim);
            }

            bank.append(port);
        });

        return bank;
    }

    function renderModuleScope(module) {
        const wrap = doc.createElement("div");
        wrap.className = "module-scope-wrap";

        const head = doc.createElement("div");
        head.className = "scope-head";

        const label = doc.createElement("span");
        label.textContent = module.scopeMode === "scope" ? "X/T" : "X/Y";

        const canvas = doc.createElement("canvas");
        canvas.className = "module-scope";
        canvas.dataset.moduleScope = module.id;

        head.append(label);
        wrap.append(head, canvas);
        return wrap;
    }

    function renderKnobs(module) {
        const knobs = doc.createElement("div");
        knobs.className = "knob-grid";

        module.definition.parameterNames.forEach(parameterName => {
            const parameter = module.definition.parameters[parameterName];
            const value = module.parameters[parameterName];
            const knob = createVerticalKnob({
                className: "knob",
                min: parameter.min,
                max: parameter.max,
                value,
                labelText: parameterName.toUpperCase(),
                outputText: formatValue(value),
                title: `${module.name} ${parameterName}`,
                onChange: nextValue => {
                    handlers.onParamChange(module.id, parameterName, nextValue);
                }
            });
            knobs.append(knob);
        });

        return knobs;
    }

    function renderModuleControls(module) {
        const controls = doc.createElement("div");
        controls.className = "module-gain";

        const reset = makeButton("mini-button", "RST", "Reset initial conditions");
        reset.addEventListener("click", () => handlers.onResetModule(module.id));

        const time = doc.createElement("label");
        time.innerHTML = "<span>TIME</span>";
        time.append(makeRange({
            min: 0.05,
            max: 180,
            value: module.definition.timeScale,
            step: 0.05,
            onInput: value => handlers.onTimeScale(module.id, value)
        }));

        const over = doc.createElement("label");
        over.className = "input-gain";
        over.innerHTML = "<span>OSR</span>";
        over.append(makeRange({
            min: 1,
            max: 8,
            value: module.definition.oversample,
            step: 1,
            onInput: value => handlers.onOversample(module.id, value)
        }));

        controls.append(reset, time, over);
        return controls;
    }

    function renderMixerChannel(module, channel) {
        const row = doc.createElement("div");
        row.className = "mixer-channel";

        const code = doc.createElement("span");
        code.textContent = initials(module.name);

        const input = makeRange({
            min: 0,
            max: 1.5,
            value: channel?.gain ?? module.gain,
            step: 0.01,
            onInput: value => {
                output.textContent = gainToDb(value);
                handlers.onMixerChannel(module.id, { gain: value });
            }
        });

        const output = doc.createElement("output");
        output.textContent = gainToDb(channel?.gain ?? module.gain);

        const mute = makeButton("mini-button", channel?.mute ? "ON" : "M", "Mute channel");
        mute.setAttribute("aria-pressed", String(Boolean(channel?.mute)));
        mute.addEventListener("click", () => handlers.onMixerChannel(module.id, { mute: !channel?.mute }));

        const solo = makeButton("mini-button", channel?.solo ? "ON" : "S", "Solo channel");
        solo.setAttribute("aria-pressed", String(Boolean(channel?.solo)));
        solo.addEventListener("click", () => handlers.onMixerChannel(module.id, { solo: !channel?.solo }));

        row.append(code, input, output, mute, solo);
        return row;
    }

    function renderCableRows(patch) {
        if (patch.cables.length === 0) {
            const empty = doc.createElement("div");
            empty.className = "cable-row empty";
            empty.textContent = "NO CABLES";
            return [empty];
        }

        return patch.cables.map(cable => {
            const row = doc.createElement("div");
            row.className = "cable-row";

            const label = doc.createElement("span");
            label.textContent = `${shortModuleName(patch, cable.fromModuleId)}.${cable.fromOutput} > ${shortModuleName(patch, cable.toModuleId)}.${cable.toInput}`;

            const input = makeRange({
                min: cable.gainMin,
                max: cable.gainMax,
                value: cable.gain,
                step: 0.01,
                onInput: value => {
                    output.textContent = formatValue(value);
                    syncCableControls(cable.id, value);
                    handlers.onCableGain(cable.id, value);
                }
            });
            input.dataset.cableGainSlider = cable.id;
            const output = doc.createElement("output");
            output.dataset.cableGainOutput = cable.id;
            output.textContent = formatValue(cable.gain);

            const remove = makeButton("mini-button", "X", "Remove cable");
            remove.addEventListener("click", () => handlers.onRemoveCable(cable.id));

            const min = makeNumberInput(cable.gainMin, value => {
                handlers.onCableGainRange(cable.id, { min: value, max: cable.gainMax });
            });
            const max = makeNumberInput(cable.gainMax, value => {
                handlers.onCableGainRange(cable.id, { min: cable.gainMin, max: value });
            });
            min.title = "Cable gain min";
            max.title = "Cable gain max";

            row.append(label, input, output, min, max, remove);
            return row;
        });
    }

    function syncCableControls(cableId, value) {
        doc.querySelectorAll(`[data-cable-gain-slider="${cableId}"]`).forEach(input => {
            input.value = String(value);
        });
        doc.querySelectorAll(`[data-cable-gain-output="${cableId}"]`).forEach(output => {
            output.textContent = formatValue(value);
        });
        doc.querySelectorAll(`[data-cable-gain-knob="${cableId}"]`).forEach(knob => {
            knob.setControlValue?.(value, false);
        });
    }

    function showModuleMenu(event) {
        const zoom = Number(stage.dataset.zoom ?? 1) || 1;
        const contentRect = content.getBoundingClientRect();
        const position = {
            x: (event.clientX - contentRect.left) / zoom,
            y: (event.clientY - contentRect.top) / zoom
        };

        contextMenu.replaceChildren(...libraryDefinitions.map(definition => {
            const button = doc.createElement("button");
            button.type = "button";
            button.textContent = definition.name;
            button.addEventListener("click", () => {
                handlers.onAddModule(definition.libraryId, position);
                contextMenu.hidden = true;
            });
            return button;
        }));

        contextMenu.style.left = `${event.clientX}px`;
        contextMenu.style.top = `${event.clientY}px`;
        contextMenu.hidden = false;
    }

    function renderInspector(patch, view) {
        const module = patch.modules.find(candidate => candidate.id === view.selectedModuleId);
        inspector.replaceChildren();

        if (!module) {
            const empty = doc.createElement("div");
            empty.className = "inspector-empty";
            empty.textContent = view.selectedCableId ? "CABLE SELECTED / DEL REMOVES" : "SELECT MODULE";
            inspector.append(empty);
            return;
        }

        const title = doc.createElement("div");
        title.className = "inspector-title";
        title.innerHTML = `<span>MODULE</span><strong>${module.name}</strong>`;

        const actions = doc.createElement("div");
        actions.className = "inspector-actions";

        const reset = makeButton("mini-button", "RST", "Reset selected module");
        reset.addEventListener("click", () => handlers.onResetModule(module.id));

        const fold = makeButton("mini-button", module.folded ? "OPEN" : "FOLD", "Fold selected module");
        fold.addEventListener("click", () => handlers.onToggleFold(module.id));
        actions.append(reset, fold);

        const scope = doc.createElement("label");
        scope.className = "inspector-row";
        scope.innerHTML = "<span>VIS</span>";
        const scopeSelect = doc.createElement("select");
        scopeSelect.className = "scope-select";
        scopeSelect.value = module.scopeMode;
        [["phase", "PHASE"], ["scope", "SCOPE"]].forEach(([value, text]) => {
            const option = doc.createElement("option");
            option.value = value;
            option.textContent = text;
            scopeSelect.append(option);
        });
        scopeSelect.addEventListener("change", event => handlers.onScopeMode(module.id, event.target.value));
        scope.append(scopeSelect);

        const osr = doc.createElement("label");
        osr.className = "inspector-row";
        osr.innerHTML = "<span>OSR</span>";
        const osrOutput = doc.createElement("output");
        osrOutput.textContent = String(module.definition.oversample);
        osr.append(makeRange({
            min: 1,
            max: 8,
            value: module.definition.oversample,
            step: 1,
            onInput: value => {
                osrOutput.textContent = String(Math.round(value));
                handlers.onOversample(module.id, value);
            }
        }), osrOutput);

        const time = doc.createElement("label");
        time.className = "inspector-row";
        time.innerHTML = "<span>TIME</span>";
        const timeOutput = doc.createElement("output");
        timeOutput.textContent = formatValue(module.definition.timeScale);
        time.append(makeRange({
            min: 0.05,
            max: 180,
            value: module.definition.timeScale,
            step: 0.05,
            onInput: value => {
                timeOutput.textContent = formatValue(value);
                handlers.onTimeScale(module.id, value);
            }
        }), timeOutput);

        const equations = doc.createElement("div");
        equations.className = "equation-list";
        const equationTitle = doc.createElement("span");
        equationTitle.textContent = "EQUATIONS";
        equations.append(equationTitle);
        Object.entries(module.definition.equations).forEach(([variable, expression]) => {
            const line = doc.createElement("div");
            line.className = "equation-line";
            line.textContent = `\\(\\dot{${variable}} = ${expressionToTex(expression)}\\)`;
            equations.append(line);
        });

        const ranges = doc.createElement("div");
        ranges.className = "range-editor";
        const rangesTitle = doc.createElement("span");
        rangesTitle.textContent = "PARAMETER VALUE MIN MAX";
        ranges.append(rangesTitle);
        module.definition.parameterNames.forEach(parameterName => {
            const parameter = module.definition.parameters[parameterName];
            const row = doc.createElement("div");
            row.className = "range-row";
            const label = doc.createElement("strong");
            label.textContent = parameterName.toUpperCase();
            const value = makeNumberInput(module.parameters[parameterName], nextValue => {
                handlers.onParamChange(module.id, parameterName, nextValue);
            });
            value.title = `${parameterName} value`;
            const min = makeNumberInput(parameter.min, value => {
                handlers.onParameterRange(module.id, parameterName, {
                    min: value,
                    max: module.definition.parameters[parameterName].max
                });
            });
            const max = makeNumberInput(parameter.max, value => {
                handlers.onParameterRange(module.id, parameterName, {
                    min: module.definition.parameters[parameterName].min,
                    max: value
                });
            });
            min.title = `${parameterName} min`;
            max.title = `${parameterName} max`;
            row.append(label, value, min, max);
            ranges.append(row);
        });

        inspector.append(title, actions, scope, osr, time, equations, ranges);
        window.MathJax?.typesetPromise?.([inspector]).catch(() => {});
    }

    function selectPort(port) {
        if (!selectedPort.current) {
            selectedPort.current = port;
            markSelectedPort();
            setStatus(`${port.kind.toUpperCase()} SELECTED / ${port.name.toUpperCase()}`);
            return;
        }

        const start = selectedPort.current;
        selectedPort.current = null;
        clearSelectedPorts();
        handlers.onPatchCable(start, port);
    }

    function markSelectedPort() {
        clearSelectedPorts();

        if (!selectedPort.current) {
            return;
        }

        doc.querySelector(`[data-jack="${selectedPort.current.moduleId}:${selectedPort.current.kind}:${selectedPort.current.name}"]`)
            ?.classList.add("is-selected");
    }

    function clearSelectedPorts() {
        doc.querySelectorAll(".jack.is-selected").forEach(jack => jack.classList.remove("is-selected"));
    }

    function shortModuleName(patch, moduleId) {
        const module = patch.modules.find(candidate => candidate.id === moduleId);
        return module ? initials(module.name) : "??";
    }

    function updateReadouts(patch, time, masterLevel = 0) {
        const cpu = Math.round(4 + patch.modules.length * 2 + patch.cables.length * 0.7).toString().padStart(2, "0");
        doc.querySelector('[data-readout="cpu"]').textContent = `${cpu}%`;
        doc.querySelector('[data-readout="nodes"]').textContent = `${String(patch.modules.length).padStart(2, "0")}N`;
        doc.querySelector('[data-readout="master-db"]').textContent = gainToDb(patch.mixer.masterGain);
    }

    function setRunning(running) {
        root.dataset.running = String(running);
        transportButton.setAttribute("aria-pressed", String(running));
    }

    function setStatus(message) {
        status.textContent = message;
    }

    function setActiveView(activeView) {
        doc.querySelectorAll("[data-view-panel]").forEach(panel => {
            panel.classList.toggle("is-active", panel.dataset.viewPanel === activeView);
        });
        doc.querySelectorAll("[data-view-tab]").forEach(button => {
            const pressed = button.dataset.viewTab === activeView;
            button.classList.toggle("is-active", pressed);
            button.setAttribute("aria-pressed", String(pressed));
        });
    }

    return {
        render,
        setActiveView,
        setRunning,
        setStatus,
        updateReadouts
    };
}

export { createUi, createVerticalKnob, formatValue, gainToDb };
