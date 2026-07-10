import { createVerticalKnob, formatValue } from "./ui.js";

function makeNumberInput(doc, value, title, onChange) {
    const input = doc.createElement("input");
    input.type = "number";
    input.step = "any";
    input.value = String(value);
    input.title = title;
    input.addEventListener("change", event => onChange(Number(event.target.value)));
    return input;
}

function createDesignerUi(doc, handlers) {
    const root = doc.querySelector("[data-designer]");
    const nameInput = doc.querySelector("[data-design-name]");
    const formulaInput = doc.querySelector("[data-design-formulas]");
    const timeInput = doc.querySelector("[data-design-time-scale]");
    const timeOutput = doc.querySelector("[data-design-time-scale-value]");
    const oversampleInput = doc.querySelector("[data-design-oversample]");
    const stateReadout = doc.querySelector("[data-design-state]");
    const symbolsReadout = doc.querySelector("[data-design-symbols]");
    const variablePanel = doc.querySelector("[data-design-variables]");
    const knobPanel = doc.querySelector("[data-design-knobs]");
    const canvas = doc.querySelector("[data-design-scope]");
    const saveButton = doc.querySelector("[data-design-save]");
    const addButton = doc.querySelector("[data-design-add-to-patch]");
    const resetButton = doc.querySelector("[data-design-reset]");
    let scopeMode = "phase";
    let currentDefinition = null;
    let variableSignature = null;
    let parameterSignature = null;

    function readInput() {
        return {
            name: nameInput.value,
            formulaText: formulaInput.value,
            timeScale: Number(timeInput.value),
            oversample: Number(oversampleInput.value),
            scopeMode
        };
    }

    function setInitial(input) {
        nameInput.value = input.name;
        formulaInput.value = input.formulaText;
        timeInput.value = String(input.timeScale);
        timeOutput.textContent = formatValue(input.timeScale);
        oversampleInput.value = String(input.oversample);
        scopeMode = input.scopeMode;
        syncScopeButtons();
    }

    function notifyChange() {
        handlers.onDesignChange(readInput());
    }

    function syncScopeButtons() {
        doc.querySelectorAll("[data-design-scope-mode]").forEach(button => {
            const active = button.dataset.designScopeMode === scopeMode;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", String(active));
        });
    }

    function renderParameterControls(definition) {
        const signature = definition.parameterNames
            .map(name => {
                const parameter = definition.parameters[name];
                return `${name}:${parameter.min}:${parameter.max}`;
            })
            .join("|");

        if (signature === parameterSignature) {
            definition.parameterNames.forEach(name => {
                const parameter = definition.parameters[name];
                const valueInput = doc.querySelector(`[data-design-param-value="${name}"]`);
                const minInput = doc.querySelector(`[data-design-param-min="${name}"]`);
                const maxInput = doc.querySelector(`[data-design-param-max="${name}"]`);

                if (valueInput) {
                    valueInput.value = String(parameter.value);
                }
                if (minInput) {
                    minInput.value = String(parameter.min);
                }
                if (maxInput) {
                    maxInput.value = String(parameter.max);
                }
                doc.querySelector(`[data-design-param-knob="${name}"]:not(.is-dragging)`)
                    ?.setControlValue?.(parameter.value, false);
            });
            return;
        }

        parameterSignature = signature;
        knobPanel.replaceChildren();

        if (definition.parameterNames.length === 0) {
            const empty = doc.createElement("div");
            empty.className = "design-empty";
            empty.textContent = "NO PARAMETERS";
            knobPanel.append(empty);
            return;
        }

        definition.parameterNames.forEach(name => {
            const parameter = definition.parameters[name];
            const card = doc.createElement("div");
            card.className = "design-param";

            const label = doc.createElement("strong");
            label.textContent = name.toUpperCase();

            const knob = createVerticalKnob({
                className: "knob",
                min: parameter.min,
                max: parameter.max,
                value: parameter.value,
                outputText: formatValue(parameter.value),
                title: `${name} value`,
                onChange: value => handlers.onDesignParameterChange(name, { value })
            });
            knob.dataset.designParamKnob = name;

            const fields = doc.createElement("div");
            fields.className = "design-param-fields";

            const value = makeNumberInput(doc, parameter.value, `${name} value`, nextValue => {
                handlers.onDesignParameterChange(name, { value: nextValue });
            });
            value.dataset.designParamValue = name;

            const min = makeNumberInput(doc, parameter.min, `${name} min`, nextValue => {
                handlers.onDesignParameterChange(name, { min: nextValue });
            });
            min.dataset.designParamMin = name;

            const max = makeNumberInput(doc, parameter.max, `${name} max`, nextValue => {
                handlers.onDesignParameterChange(name, { max: nextValue });
            });
            max.dataset.designParamMax = name;

            fields.append(value, min, max);
            card.append(label, knob, fields);
            knobPanel.append(card);
        });
    }

    function renderVariableControls(definition) {
        const signature = definition.variableNames.join("|");

        if (signature === variableSignature) {
            definition.variableNames.forEach(name => {
                const initial = doc.querySelector(`[data-design-initial="${name}"]`);
                const output = doc.querySelector(`[data-design-output="${name}"]`);
                const outputValue = doc.querySelector(`[data-design-output-value="${name}"]`);

                if (initial) {
                    initial.value = String(definition.initialValues[name]);
                }
                if (output) {
                    output.value = String(definition.outputScales[name]);
                }
                if (outputValue) {
                    outputValue.textContent = formatValue(definition.outputScales[name]);
                }
            });
            return;
        }

        variableSignature = signature;
        variablePanel.replaceChildren();

        definition.variableNames.forEach(name => {
            const row = doc.createElement("div");
            row.className = "design-variable";

            const label = doc.createElement("strong");
            label.textContent = name.toUpperCase();

            const initial = makeNumberInput(doc, definition.initialValues[name], `${name} initial condition`, value => {
                handlers.onDesignInitialConditionChange(name, value);
            });
            initial.dataset.designInitial = name;

            const output = doc.createElement("input");
            output.type = "range";
            output.min = "0.001";
            output.max = "1.5";
            output.step = "0.001";
            output.value = String(definition.outputScales[name]);
            output.title = `${name} output volume`;
            output.dataset.designOutput = name;

            const outputValue = doc.createElement("output");
            outputValue.dataset.designOutputValue = name;
            outputValue.textContent = formatValue(definition.outputScales[name]);

            output.addEventListener("input", event => {
                outputValue.textContent = formatValue(Number(event.target.value));
                handlers.onDesignOutputScaleChange(name, Number(event.target.value));
            });

            row.append(label, initial, output, outputValue);
            variablePanel.append(row);
        });
    }

    function renderCompile(result) {
        const ok = Boolean(result.ok);
        root.dataset.designOk = String(ok);
        currentDefinition = result.definition;
        stateReadout.textContent = ok ? "COMPILED" : "ERROR";
        symbolsReadout.textContent = result.message;
        saveButton.disabled = !ok;
        addButton.disabled = !ok;

        if (ok) {
            renderVariableControls(result.definition);
            renderParameterControls(result.definition);
        }
    }

    [nameInput, formulaInput, timeInput, oversampleInput].forEach(input => {
        input.addEventListener("input", () => {
            if (input === timeInput) {
                timeOutput.textContent = formatValue(Number(timeInput.value));
            }
            notifyChange();
        });
    });

    doc.querySelectorAll("[data-design-scope-mode]").forEach(button => {
        button.addEventListener("click", () => {
            scopeMode = button.dataset.designScopeMode === "scope" ? "scope" : "phase";
            syncScopeButtons();
            notifyChange();
        });
    });

    saveButton.addEventListener("click", () => handlers.onDesignSave());
    addButton.addEventListener("click", () => handlers.onDesignAddToPatch());
    resetButton.addEventListener("click", () => handlers.onDesignReset());
    canvas.addEventListener("pointerdown", event => {
        if (
            scopeMode !== "phase"
            || currentDefinition?.variableNames.length !== 2
        ) {
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        const normalizedX = (x - 0.5) / 0.42;
        const normalizedY = (0.5 - y) / 0.42;

        handlers.onDesignPhaseInitialClick({
            x: Math.max(-0.98, Math.min(0.98, normalizedX)),
            y: Math.max(-0.98, Math.min(0.98, normalizedY)),
            variables: currentDefinition.variableNames,
            outputScales: currentDefinition.outputScales
        });
    });

    return {
        getCanvas() {
            return canvas;
        },
        getScopeMode() {
            return scopeMode;
        },
        readInput,
        renderCompile,
        setInitial
    };
}

export { createDesignerUi };
