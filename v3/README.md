# rk4webaudio v3

Standalone browser version of the modular ODE synth.

The app is a visual patching environment where each module is an ordinary differential equation system. Every state variable is an audio-rate output, every parameter is a patchable input, and cables modulate parameters as:

```text
parameter = p0 + input * gain
```

`p0` is the module's own parameter value, `input` is the source signal, and `gain` is the cable gain.

## User Guide

### Running

```bash
cd v3
python3 -m http.server 4173
```

Open:

```text
http://127.0.0.1:4173/
```

The app has no npm runtime dependencies. `package.json` only contains development checks.

### Main Views

Use the top tabs to switch between:

- `PATCH`: build and perform with modular ODE modules.
- `DESIGN`: write and test a custom ODE module, then save it into the patch module menu.

### Patch View

The patch view has a large module field and an `OBSERVATION` panel.

Right-click in the empty patch field to open the module menu. Built-in modules and saved custom modules appear there. Click a module name to place it at the pointer.

Each module contains:

- Input jacks: one per ODE parameter.
- Output jacks: one per dynamical variable.
- A square phase/scope display.
- Parameter knobs.
- A fold button to keep the module compact.
- A close button to remove the module.

Click one jack, then another compatible jack, to create a cable. Outputs connect to parameter inputs. A cable scales the source signal before it reaches the target parameter. The target parameter then receives `p0 + input * gain`.

Cable controls appear in two places:

- As a tiny gain knob next to the target input jack.
- As a row in the mixer area of `OBSERVATION`.

Those controls are linked. Changing either one changes the same cable gain. Cable min/max ranges can be edited from the mixer row.

Select a cable by clicking it. The selected cable glows. Press `Delete` or `Backspace` to remove it.

Use the mouse wheel over the patch field to zoom around the mouse pointer. Drag in empty space to pan. Drag a module header to move the module.

### Observation Panel

When a module is selected, `OBSERVATION` shows module-specific settings:

- Visualization mode: `PHASE` or `SCOPE`.
- Oversampling (`OSR`).
- Time scale.
- The system equations.
- Parameter value, min, and max fields.

Parameter value edits here are the same parameter values controlled by the module knobs. The audio worklet smooths parameter changes with a short ramp to avoid hard jumps.

The mixer area contains:

- One channel row per module.
- One cable gain row per connection.
- Master output gain.

### Design View

The Design tab creates new ODE modules.

The large left panel is a live preview. It can show a phase plot or a scope trace. The right side contains the formula editor, integration controls, state-variable controls, and inferred parameter controls.

Write one equation per line:

```text
x' = y
y' = -a*x - b*y + drive + sin(w*t)
```

Accepted left-side forms:

```text
x' = ...
dx/dt = ...
x: ...
x = ...
```

The left side names dynamical variables. These become output jacks when the model is added to the patch.

Symbols on the right side become parameters unless they are:

- A dynamical variable.
- `t`.
- Constants: `PI`, `TWO_PI`, `E`.
- Supported functions.

Supported functions include:

```text
abs acos asin atan atan2 ceil cos cosh exp floor log max min pow power sign sin sinh sqrt tan tanh sigmoid
```

For example, in:

```text
x' = y
y' = -a*x + sin(w*t)
```

the variables are `x` and `y`, and the inferred parameters are `a` and `w`.

The formula compiles on every keystroke. If compilation succeeds, parameter knobs are created or removed immediately as parameters enter or leave the formulas.

### Design Controls

`TIME SCALE` changes the integration speed in the preview and saved module.

`OSR` sets oversampling for the saved module and preview.

Each dynamical variable has:

- Initial condition input.
- Output volume slider.

The output volume slider becomes that variable's output scale. It controls how strongly the raw state value is mapped into audio/visual output.

`RST` resets the preview trajectory to the current initial conditions.

For 2D systems, click inside the phase diagram to set the first two initial conditions directly from the plot position. This is useful for exploring basins and transient behavior.

`SAVE MODEL` stores the compiled model in browser localStorage. Saved models appear in the Patch view right-click module menu.

`ADD TO PATCH` saves the model and immediately creates a module in the patch. The full ODE definition is embedded in the patch, so exported patches remain portable even if the local custom model list changes.

### Saving And Loading

The patch is automatically persisted to browser localStorage.

Use `SAVE` to download the current patch as JSON.

Use `LOAD` to import a patch JSON file.

Custom designed models are also stored in localStorage, separately from the current patch. A patch module created from a custom model embeds its own definition, so the patch itself can still be exported and loaded elsewhere.

## Code Design Summary

### File Map

```text
index.html                     App shell and view markup
style.css                      Minimal monochrome UI, rack, designer, mixer layout
src/app.js                     Main state owner and event coordinator
src/ui.js                      Patch view DOM rendering and patch interactions
src/designerUi.js              Design tab DOM rendering and designer controls
src/designer.js                Formula parsing, parameter inference, preview RK4 renderer
src/expressionCompiler.js      Shared safe expression compiler
src/odeLibrary.js              Built-in ODE definitions and definition normalization
src/patch.js                   Patch document normalization and immutable patch updates
src/audioEngine.js             Web Audio graph and module/cable runtime management
src/worklet/ode-processor.js   AudioWorklet RK4/Euler processor
src/visuals.js                 Canvas scopes and SVG cable rendering
```

### Data Model

A patch contains:

- `modules`: normalized ODE module instances.
- `cables`: output-to-parameter connections.
- `mixer`: module channel gain, mute/solo, and master gain.

Each module embeds a full `definition`. That is intentional. A module does not need its library entry to exist after it has been created.

An ODE definition contains:

- `equations`: map of variable name to expression.
- `variableNames`: state variables and output names.
- `parameterNames`: parameter inputs.
- `parameters`: value/min/max for each parameter.
- `initialValues`: starting state.
- `outputScales`: per-variable output volume/scaling.
- `timeScale`, `oversample`, `method`.

`patch.js` is written in immutable-update style: helpers return a new normalized patch instead of mutating the current patch in place.

### Library And Custom Models

Built-ins live in `ODE_LIBRARY` inside `odeLibrary.js`.

Custom designed models are owned by `app.js` and stored under:

```text
rk4webaudio:v3-custom-odes
```

The active module menu is:

```text
built-in library + custom library
```

When adding a module, `app.js` resolves the selected library entry and calls `addModuleDefinitionToPatch`. That keeps `patch.js` independent from UI-owned custom-library state.

### Expression Compiler

`expressionCompiler.js` is shared by:

- The Design tab preview.
- The AudioWorklet processor.

It only allows a narrow expression grammar:

- identifiers
- numbers
- arithmetic operators
- parentheses and commas
- whitelisted constants and functions

It rejects unknown symbols and unsupported syntax before building a `Function`. This keeps formula authoring flexible while avoiding arbitrary JavaScript syntax in ODE expressions.

Adding future custom functions should usually happen in `expressionCompiler.js` by:

1. Adding the function name to `CUSTOM_FUNCTIONS`.
2. Adding its binding in `compileExpression`.

### Design Tab Flow

Formula text is parsed in `designer.js`.

The parser extracts equation left sides as variables. It scans right-side identifiers and infers parameters by excluding variables, constants, supported functions, and `t`.

On every edit:

1. `designerUi.js` emits a design change.
2. `app.js` updates design state.
3. `compileDesignDefinition` normalizes and compiles the definition.
4. `designerUi.js` redraws variable controls and parameter knobs.
5. `createDesignerPreview` receives the compiled definition and continues preview integration.

The preview is separate from the audio graph. It uses the shared compiler but integrates in the main thread only for visualization.

### Audio Runtime Flow

`audioEngine.js` owns the Web Audio graph.

Each module becomes:

- One `AudioWorkletNode`.
- A channel splitter for variable outputs.
- Per-variable analyser nodes for scopes.
- A channel gain feeding the master bus.

Each cable becomes:

- A Web Audio `GainNode`.
- A connection from a source module variable channel to a target module parameter input.

The cable gain node applies `input * gain`. Inside `ode-processor.js`, each frame computes:

```text
effectiveParameter = smoothedBaseParameter + incomingModulation
```

Together, this implements:

```text
p0 + input * gain
```

### Parameter Smoothing

The AudioWorklet uses a `ParameterSmoother` class. When parameter values change, the processor ramps from the current value to the new target over a short number of frames. This prevents hard discontinuities when dragging knobs or typing parameter values.

### Visual System

`visuals.js` draws:

- Global oscilloscope.
- Global trajectory view.
- Per-module phase/scope canvases.
- SVG patch cables.

Cable selection is handled through a transparent wide SVG hit path layered over the visible cable path. The selected cable gets a stronger stroke and glow.

### Development Checks

Run:

```bash
npm run check
```

This performs JavaScript syntax checks for all source files.

There is currently no browser automation dependency in this folder. Visual regressions should be checked manually in a browser unless a test runner is added later.
