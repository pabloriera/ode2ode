import { normalizeOdeDefinition, slugifyName, toFiniteNumber } from "./odeLibrary.js";
import {
    RESERVED_SYMBOLS,
    assertIdentifierName,
    clampState,
    compileDefinition,
    extractIdentifiers,
    finite,
    isReservedSymbol
} from "./expressionCompiler.js";

const DEFAULT_FORMULA_TEXT = `x' = y
y' = -a*x - b*y + drive + sin(w*t)`;
const HISTORY_SIZE = 960;

function defaultDesignInput() {
    return {
        name: "Custom ODE",
        formulaText: DEFAULT_FORMULA_TEXT,
        timeScale: 80,
        oversample: 4,
        outputScale: 0.3,
        outputScales: {},
        initialValues: {},
        scopeMode: "phase"
    };
}

function stripComment(line) {
    return line
        .replace(/\s+\/\/.*$/, "")
        .replace(/\s+#.*$/, "")
        .trim();
}

function parseEquationLine(line) {
    const source = stripComment(line).replace(/;$/, "").trim();

    if (!source) {
        return null;
    }

    const patterns = [
        /^d\s*([A-Za-z_][A-Za-z0-9_]*)\s*\/\s*dt\s*=\s*(.+)$/,
        /^([A-Za-z_][A-Za-z0-9_]*)\s*'\s*=\s*(.+)$/,
        /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/,
        /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/
    ];

    for (const pattern of patterns) {
        const match = source.match(pattern);
        if (match) {
            return {
                variable: match[1],
                expression: match[2].trim()
            };
        }
    }

    throw new Error(`Cannot parse equation "${source}"`);
}

function parseDesignerEquations(formulaText) {
    const equations = {};

    String(formulaText ?? "")
        .split(/\n+/)
        .map(parseEquationLine)
        .filter(Boolean)
        .forEach(({ variable, expression }) => {
            assertIdentifierName(variable, "variable");

            if (variable in equations) {
                throw new Error(`Duplicate equation for "${variable}"`);
            }

            if (!expression) {
                throw new Error(`Equation "${variable}" needs a right side`);
            }

            equations[variable] = expression;
        });

    const variableNames = Object.keys(equations);

    if (variableNames.length === 0) {
        throw new Error("Type at least one equation");
    }

    return equations;
}

function profileParameter(name, previous) {
    if (previous) {
        return {
            value: finite(previous.value, 1),
            min: finite(previous.min, -4),
            max: finite(previous.max, 4)
        };
    }

    if (/^(w|omega|freq|frequency)$/i.test(name)) {
        return { value: 1, min: 0.01, max: 12 };
    }

    if (/^(drive|input|i)$/i.test(name)) {
        return { value: 0, min: -4, max: 4 };
    }

    return { value: 1, min: -4, max: 4 };
}

function inferParameterNames(equations, variableNames) {
    const variableSet = new Set(variableNames);
    const parameterSet = new Set();

    Object.values(equations).forEach(expression => {
        extractIdentifiers(expression).forEach(identifier => {
            if (!variableSet.has(identifier) && !RESERVED_SYMBOLS.has(identifier)) {
                assertIdentifierName(identifier, "parameter");
                parameterSet.add(identifier);
            }
        });
    });

    return [...parameterSet].sort((a, b) => a.localeCompare(b));
}

function compileDesignDefinition(input, previousParameters = {}) {
    try {
        const equations = parseDesignerEquations(input.formulaText);
        const variableNames = Object.keys(equations);
        const parameterNames = inferParameterNames(equations, variableNames);
        const parameters = Object.fromEntries(
            parameterNames.map(name => [name, profileParameter(name, previousParameters[name])])
        );
        const initialValues = Object.fromEntries(
            variableNames.map((name, index) => [
                name,
                finite(input.initialValues?.[name], index === 0 ? 0.2 : 0)
            ])
        );
        const outputScale = toFiniteNumber(input.outputScale, "outputScale", 0.3);
        const outputScales = Object.fromEntries(
            variableNames.map(name => [
                name,
                Math.max(0.001, finite(input.outputScales?.[name], outputScale))
            ])
        );
        const definition = normalizeOdeDefinition({
            id: slugifyName(input.name),
            libraryId: slugifyName(input.name),
            name: input.name,
            description: "Designed in rk4.web.audio",
            equations,
            parameters,
            initialValues,
            timeScale: toFiniteNumber(input.timeScale, "timeScale", 80),
            oversample: Math.max(1, Math.min(16, Math.round(toFiniteNumber(input.oversample, "oversample", 4)))),
            outputScale,
            outputScales,
            gain: 0.12,
            scopeMode: input.scopeMode === "scope" ? "scope" : "phase"
        });

        compileDefinition(definition);

        return {
            ok: true,
            definition,
            parameters,
            parameterNames,
            variableNames,
            message: `${variableNames.length} VAR / ${parameterNames.length} PARAM`
        };
    } catch (error) {
        return {
            ok: false,
            definition: null,
            parameters: previousParameters,
            parameterNames: Object.keys(previousParameters),
            variableNames: [],
            message: error.message
        };
    }
}

function sizeCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width * scale));
    const height = Math.max(1, Math.floor(rect.height * scale));

    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }

    return {
        width: width / scale,
        height: height / scale,
        scale
    };
}

function drawGrid(ctx, width, height) {
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(245,245,245,0.09)";
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = 0; x <= width; x += 20) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
    }

    for (let y = 0; y <= height; y += 20) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
    }

    ctx.stroke();
}

function createDesignerPreview() {
    let definition = null;
    let compiled = null;
    let state = new Float64Array(0);
    let params = new Float64Array(0);
    let work = new Float64Array(0);
    let k1 = new Float64Array(0);
    let k2 = new Float64Array(0);
    let k3 = new Float64Array(0);
    let k4 = new Float64Array(0);
    let history = [];
    let cursor = 0;
    let filled = 0;
    let signature = "";
    let t = 0;

    function resetBuffers() {
        state = Float64Array.from(compiled.variableNames.map(name => finite(definition.initialValues[name], 0)));
        work = new Float64Array(state.length);
        k1 = new Float64Array(state.length);
        k2 = new Float64Array(state.length);
        k3 = new Float64Array(state.length);
        k4 = new Float64Array(state.length);
        history = compiled.variableNames.map(() => new Float32Array(HISTORY_SIZE));
        cursor = 0;
        filled = 0;
        t = 0;
    }

    function reset() {
        if (!compiled) {
            return;
        }

        resetBuffers();
    }

    function setDefinition(nextDefinition) {
        if (!nextDefinition) {
            definition = null;
            compiled = null;
            return;
        }

        const nextCompiled = compileDefinition(nextDefinition);
        const nextSignature = JSON.stringify({
            equations: nextDefinition.equations,
            variables: nextDefinition.variableNames,
            parameters: nextDefinition.parameterNames,
            initialValues: nextDefinition.initialValues
        });

        definition = nextDefinition;
        compiled = nextCompiled;
        params = Float64Array.from(
            compiled.parameterNames.map(name => finite(definition.parameters[name]?.value, 0))
        );

        if (nextSignature !== signature) {
            signature = nextSignature;
            resetBuffers();
        }
    }

    function evaluate(currentT, currentState, target) {
        compiled.evaluate(currentT, currentState, params, target);
    }

    function step(h) {
        evaluate(t, state, k1);

        for (let index = 0; index < state.length; index += 1) {
            work[index] = state[index] + k1[index] * h * 0.5;
        }
        evaluate(t + h * 0.5, work, k2);

        for (let index = 0; index < state.length; index += 1) {
            work[index] = state[index] + k2[index] * h * 0.5;
        }
        evaluate(t + h * 0.5, work, k3);

        for (let index = 0; index < state.length; index += 1) {
            work[index] = state[index] + k3[index] * h;
        }
        evaluate(t + h, work, k4);

        for (let index = 0; index < state.length; index += 1) {
            const delta = (h / 6) * (k1[index] + 2 * k2[index] + 2 * k3[index] + k4[index]);
            state[index] = clampState(state[index] + delta);
        }

        t += h;
    }

    function record() {
        compiled.variableNames.forEach((name, index) => {
            const scale = finite(definition.outputScales[name], 0.25);
            history[index][cursor] = Math.tanh(state[index] * scale);
        });
        cursor = (cursor + 1) % HISTORY_SIZE;
        filled = Math.min(HISTORY_SIZE, filled + 1);
    }

    function simulate() {
        if (!definition || !compiled) {
            return;
        }

        const oversample = Math.max(1, Math.round(definition.oversample));
        const h = definition.timeScale / (48000 * oversample);

        for (let sample = 0; sample < 36; sample += 1) {
            for (let stepIndex = 0; stepIndex < oversample; stepIndex += 1) {
                step(h);
            }
            record();
        }
    }

    function sampleAt(channel, offset) {
        const index = (cursor - filled + offset + HISTORY_SIZE) % HISTORY_SIZE;
        return history[channel]?.[index] ?? 0;
    }

    function draw(canvas, mode = "phase") {
        const { width, height, scale } = sizeCanvas(canvas);
        const ctx = canvas.getContext("2d");

        ctx.save();
        ctx.scale(scale, scale);
        drawGrid(ctx, width, height);

        if (!compiled || filled < 2) {
            ctx.strokeStyle = "rgba(245,245,245,0.75)";
            ctx.beginPath();
            ctx.moveTo(width * 0.36, height * 0.5);
            ctx.lineTo(width * 0.64, height * 0.5);
            ctx.stroke();
            ctx.restore();
            return;
        }

        ctx.strokeStyle = "#f5f5f5";
        ctx.lineWidth = 1.2;

        if (mode === "phase" && compiled.variableNames.length > 1) {
            ctx.beginPath();
            for (let index = 0; index < filled; index += 1) {
                const x = width * 0.5 + sampleAt(0, index) * width * 0.42;
                const y = height * 0.5 - sampleAt(1, index) * height * 0.42;

                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
            ctx.restore();
            return;
        }

        const lanes = Math.min(compiled.variableNames.length, 3);
        for (let channel = 0; channel < lanes; channel += 1) {
            const lane = height / (lanes + 1);
            const yOffset = lane * (channel + 1);
            ctx.strokeStyle = channel === 0 ? "#f5f5f5" : `rgba(245,245,245,${0.72 - channel * 0.18})`;
            ctx.beginPath();
            for (let index = 0; index < filled; index += 1) {
                const x = (index / Math.max(1, filled - 1)) * width;
                const y = yOffset - sampleAt(channel, index) * lane * 0.44;

                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }

        ctx.restore();
    }

    function tick(canvas, mode) {
        if (!canvas) {
            return;
        }

        try {
            simulate();
            draw(canvas, mode);
        } catch {
            definition = null;
            compiled = null;
        }
    }

    return {
        reset,
        setDefinition,
        tick
    };
}

export {
    DEFAULT_FORMULA_TEXT,
    compileDesignDefinition,
    createDesignerPreview,
    defaultDesignInput,
    inferParameterNames,
    isReservedSymbol,
    parseDesignerEquations
};
