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

function clearElement(element) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

function drawGrid(ctx, width, height, step = 16) {
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(245, 245, 245, 0.11)";
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = 0; x <= width; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
    }

    for (let y = 0; y <= height; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
    }

    ctx.stroke();
}

function bufferFor(canvas, key, size) {
    canvas.__buffers ??= new Map();

    const current = canvas.__buffers.get(key);
    if (current?.length === size) {
        return current;
    }

    const next = new Float32Array(size);
    canvas.__buffers.set(key, next);
    return next;
}

function getAnalyserBuffer(canvas, analyser, key) {
    const buffer = bufferFor(canvas, key, analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);
    return buffer;
}

function drawIdle(ctx, width, height, time, seed = 1) {
    drawGrid(ctx, width, height, 14);
    ctx.strokeStyle = "rgba(245, 245, 245, 0.82)";
    ctx.lineWidth = 1.15;
    ctx.beginPath();

    for (let x = 0; x < width; x += 2) {
        const phase = (x / width) * Math.PI * 8 + time * 0.002 + seed;
        const y = height / 2 + Math.sin(phase) * height * 0.18 + Math.sin(phase * 0.37) * height * 0.08;
        if (x === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    ctx.stroke();
}

function drawScope(canvas, module, runtime, time) {
    const { width, height, scale } = sizeCanvas(canvas);
    const ctx = canvas.getContext("2d");

    ctx.save();
    ctx.scale(scale, scale);

    if (!runtime || runtime.analysers.size === 0) {
        drawIdle(ctx, width, height, time, module.colorIndex + 1);
        ctx.restore();
        return 0;
    }

    drawGrid(ctx, width, height, 14);
    const variables = module.definition.variableNames;
    const first = runtime.analysers.get(variables[0]);
    const second = runtime.analysers.get(variables[1]);

    if (module.scopeMode === "phase" && first && second) {
        const xBuffer = getAnalyserBuffer(canvas, first, `${module.id}:x`);
        const yBuffer = getAnalyserBuffer(canvas, second, `${module.id}:y`);
        const length = Math.min(xBuffer.length, yBuffer.length);
        let peak = 0;

        ctx.strokeStyle = "#f5f5f5";
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        for (let index = 0; index < length; index += 2) {
            const xValue = xBuffer[index];
            const yValue = yBuffer[index];
            const x = width / 2 + xValue * width * 0.42;
            const y = height / 2 - yValue * height * 0.42;
            peak = Math.max(peak, Math.abs(xValue), Math.abs(yValue));

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
        ctx.restore();
        return peak;
    }

    let peak = 0;
    variables.slice(0, 3).forEach((variableName, variableIndex) => {
        const analyser = runtime.analysers.get(variableName);
        if (!analyser) {
            return;
        }

        const buffer = getAnalyserBuffer(canvas, analyser, `${module.id}:${variableName}`);
        const lane = height / (Math.min(variables.length, 3) + 1);
        const yOffset = lane * (variableIndex + 1);

        ctx.strokeStyle = variableIndex === 0 ? "#f5f5f5" : `rgba(245, 245, 245, ${0.72 - variableIndex * 0.18})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        for (let index = 0; index < buffer.length; index += 2) {
            const x = (index / (buffer.length - 1)) * width;
            const value = buffer[index];
            const y = yOffset - value * lane * 0.42;
            peak = Math.max(peak, Math.abs(value));

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
    });

    ctx.restore();
    return peak;
}

function drawGlobalWaveform(canvas, patch, engine, time) {
    const { width, height, scale } = sizeCanvas(canvas);
    const ctx = canvas.getContext("2d");
    const analyser = engine.getMasterAnalyser?.();

    ctx.save();
    ctx.scale(scale, scale);

    if (!analyser) {
        drawIdle(ctx, width, height, time, patch.modules.length);
        ctx.restore();
        return 0;
    }

    drawGrid(ctx, width, height, 16);
    const buffer = getAnalyserBuffer(canvas, analyser, "master");
    let peak = 0;
    ctx.strokeStyle = "#f5f5f5";
    ctx.lineWidth = 1.4;
    ctx.beginPath();

    for (let index = 0; index < buffer.length; index += 1) {
        const value = buffer[index];
        const x = (index / (buffer.length - 1)) * width;
        const y = height / 2 - value * height * 0.45;
        peak = Math.max(peak, Math.abs(value));

        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    ctx.stroke();
    ctx.restore();
    return peak;
}

function drawGlobalTrajectory(canvas, patch, engine, time) {
    const { width, height, scale } = sizeCanvas(canvas);
    const ctx = canvas.getContext("2d");
    const runtime = engine.getModuleRuntime?.(patch.modules[0]?.id);

    ctx.save();
    ctx.scale(scale, scale);

    if (!runtime || runtime.analysers.size < 2) {
        drawIdle(ctx, width, height, time, 4);
        ctx.restore();
        return;
    }

    drawGrid(ctx, width, height, 20);
    const variables = runtime.definition.variableNames;
    const xBuffer = getAnalyserBuffer(canvas, runtime.analysers.get(variables[0]), "global-x");
    const yBuffer = getAnalyserBuffer(canvas, runtime.analysers.get(variables[1]), "global-y");
    const length = Math.min(xBuffer.length, yBuffer.length);

    ctx.strokeStyle = "#f5f5f5";
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    for (let index = 0; index < length; index += 2) {
        const x = width / 2 + xBuffer[index] * width * 0.38;
        const y = height / 2 - yBuffer[index] * height * 0.38;

        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();
    ctx.restore();
}

function getRackZoom(stage) {
    return Number(stage.dataset.zoom ?? 1) || 1;
}

function getJackCenter(doc, stage, content, moduleId, kind, name) {
    const jack = doc.querySelector(`[data-jack="${moduleId}:${kind}:${name}"]`);

    if (!jack) {
        return null;
    }

    const contentRect = content.getBoundingClientRect();
    const rect = jack.getBoundingClientRect();
    const zoom = getRackZoom(stage);

    return {
        x: (rect.left + rect.width / 2 - contentRect.left) / zoom,
        y: (rect.top + rect.height / 2 - contentRect.top) / zoom
    };
}

function drawCables(doc, svg, stage, content, patch, selectedCableId) {
    clearElement(svg);
    svg.setAttribute("viewBox", `0 0 ${content.offsetWidth} ${content.offsetHeight}`);
    svg.setAttribute("width", String(content.offsetWidth));
    svg.setAttribute("height", String(content.offsetHeight));

    patch.cables.forEach(cable => {
        const from = getJackCenter(doc, stage, content, cable.fromModuleId, "output", cable.fromOutput);
        const to = getJackCenter(doc, stage, content, cable.toModuleId, "input", cable.toInput);

        if (!from || !to) {
            return;
        }

        const bend = Math.max(52, Math.abs(to.x - from.x) * 0.42);
        const pathData = `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`;
        const hitPath = doc.createElementNS("http://www.w3.org/2000/svg", "path");
        const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");

        hitPath.setAttribute("d", pathData);
        hitPath.setAttribute("class", "cable-hit");
        hitPath.dataset.cableId = cable.id;
        hitPath.addEventListener("pointerdown", event => {
            event.stopPropagation();
            doc.dispatchEvent(new CustomEvent("rk4-cable-select", {
                detail: { cableId: cable.id }
            }));
        });

        path.setAttribute("d", pathData);
        path.setAttribute("class", `cable-path${selectedCableId === cable.id ? " is-selected" : ""}`);
        path.dataset.cableId = cable.id;
        svg.append(hitPath, path);
    });
}

function createVisualSystem(doc, engine) {
    const cableLayer = doc.querySelector("[data-cable-layer]");
    const waveformCanvas = doc.querySelector('[data-scope="waveform"]');
    const trajectoryCanvas = doc.querySelector('[data-scope="trajectory"]');
    const stage = doc.querySelector("[data-rack-stage]");
    const content = doc.querySelector("[data-rack-content]");
    let latestPatch = null;
    let latestView = {};

    function resize() {
        [waveformCanvas, trajectoryCanvas, ...doc.querySelectorAll("[data-module-scope]")]
            .forEach(canvas => sizeCanvas(canvas));
        if (latestPatch) {
            render(latestPatch, latestView);
        }
    }

    window.addEventListener("resize", resize);
    window.addEventListener("rk4-rack-layout", resize);

    function render(patch, view = latestView) {
        latestPatch = patch;
        latestView = view;
        drawCables(doc, cableLayer, stage, content, patch, view.selectedCableId);
    }

    function tick(patch, time, view = latestView) {
        latestPatch = patch;
        latestView = view;
        drawCables(doc, cableLayer, stage, content, patch, view.selectedCableId);
        const masterPeak = drawGlobalWaveform(waveformCanvas, patch, engine, time);
        drawGlobalTrajectory(trajectoryCanvas, patch, engine, time);

        patch.modules.forEach(module => {
            const canvas = doc.querySelector(`[data-module-scope="${module.id}"]`);
            const runtime = engine.getModuleRuntime?.(module.id);

            if (!canvas) {
                return;
            }

            const peak = drawScope(canvas, module, runtime, time);
            const panel = doc.querySelector(`[data-module-id="${module.id}"]`);
            panel?.style.setProperty("--activity", String(Math.min(1, peak)));
            panel?.style.setProperty("--activity-percent", `${Math.min(100, peak * 100)}%`);
        });

        return masterPeak;
    }

    resize();

    return {
        render,
        tick
    };
}

export { createVisualSystem };
