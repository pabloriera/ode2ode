# ODE Synthesizer TODO

## Goal

Turn the current prototype into a stable, professional ODE synthesizer with:

- a browser-independent formula compiler
- a reliable audio engine and mixer
- a draggable panel workspace with GL scopes and cables
- a persistent session model that restores the last patch, layout, and fader state

This backlog is based on the current code plus the architecture in `docs.md`.

## Current code gaps to address first

The current prototype already proves the basic idea, but these problems need to be fixed before larger UI work will stick.

- `main.js` still mixes boot logic, patch state, DOM handling, runtime node lifecycle, and demo data in one place.
- `ode.js` still mixes formula parsing, WAT generation, WASM compilation, audio runtime creation, parameter node wiring, and GUI setup.
- The ODE config schema is inconsistent:
  - the demo uses `integrationMethod`
  - the runtime reads `method`
  - parameters can be scalar or `[value, min, max]`
- The worklet memory layout still assumes parameter count and variable count line up, which is unsafe for systems like the current Hopf example.
- The current GUI is still `dat.gui`, not the panel workspace described in `docs.md`.
- The current visualization is grid-based, not draggable-panel based.
- There is no structured patch document, no connection model, no save/restore layer, and no automated test harness.
- Too much logic is browser-only, which makes the compiler hard to test outside the UI.

## Priority order

1. Stabilize the math/compiler/runtime contract.
2. Add a test harness that can run without the browser.
3. Introduce a real patch/session document model.
4. Refactor the audio engine around that model.
5. Add session persistence with `localStorage`.
6. Replace the current GUI with the panel workspace.

## Phase 0: Project setup for maintainable development

- [ ] Add a minimal `package.json` so the repo can run tests and utility scripts.
- [ ] Pick a JS test runner for non-browser tests.
  - Recommendation: `vitest` for unit/integration tests.
- [ ] Add a Python test dependency file for numerical reference tests.
  - Recommendation: `requirements.txt` with `numpy` and `scipy`.
- [ ] Add a clear folder layout for the refactor.
  - Recommendation:
    - `src/domain`
    - `src/compiler`
    - `src/audio`
    - `src/visual`
    - `src/app`
    - `tests`
    - `scripts`
- [ ] Add `npm` scripts for:
  - `test`
  - `test:watch`
  - `test:python`
  - `lint` later

## Phase 1: Define the canonical patch and ODE schema

### Goal

Create one data model that every subsystem uses.

### Coding steps

- [ ] Create a canonical `OdeDefinition` shape.
- [ ] Create a canonical `PatchDocument` shape.
- [ ] Create a `SessionDocument` shape for layout and runtime UI state.
- [ ] Normalize the ODE config format so every node uses the same structure.
- [ ] Remove the current ambiguity between `integrationMethod` and `method`.
- [ ] Remove the current ambiguity between scalar parameters and array parameters.

### Recommended ODE definition shape

```json
{
  "id": "ode-hopf-1",
  "type": "ode",
  "name": "Hopf",
  "equations": {
    "x": "TWO_PI*w * y + (g - b*(x*x + y*y))*x",
    "y": "-TWO_PI*w * x + (g - b*(x*x + y*y))*y"
  },
  "parameters": {
    "w": { "value": 440.0, "min": 0.0, "max": 6080.0 },
    "g": { "value": 1.0, "min": -4.0, "max": 4.0 },
    "b": { "value": 10.0, "min": 0.0, "max": 30.0 }
  },
  "initialValues": {
    "x": 0.5,
    "y": 1.0
  },
  "method": "rk4",
  "timeScale": 1.0,
  "outputs": ["x", "y"]
}
```

### Done when

- Every ODE node can be created from the same normalized schema.
- UI code, compiler code, and audio code no longer guess field names.

## Phase 2: Extract the formula compiler into a browser-independent module

### Goal

Make the compiler testable without `window`, DOM APIs, `AudioContext`, or `AudioWorklet`.

### Coding steps

- [ ] Move equation normalization into `src/compiler/normalize-ode.js`.
- [ ] Move tokenization/parsing into `src/compiler/parser.js`.
- [ ] Add a semantic validation step in `src/compiler/validate.js`.
- [ ] Move WAT generation into `src/compiler/wat-generator.js`.
- [ ] Add a `compileOdeDefinition()` API that returns:
  - normalized variable order
  - normalized parameter order
  - WAT source
  - WASM bytes
  - compile hash
  - output metadata
- [ ] Remove direct `window.WabtModule()` assumptions from compiler core.
- [ ] Create a thin browser adapter for WABT and a thin Node adapter for tests.
- [ ] Add compile errors with source context so the UI can show usable diagnostics.

### Important cleanup items from the current code

- [ ] Replace string replacement tricks with a real parse/validate pipeline.
- [ ] Make symbol ordering deterministic.
- [ ] Ensure constants like `TWO_PI` are handled in a principled way.
- [ ] Ensure unsupported operators/functions fail fast with good messages.
- [ ] Decide whether power and advanced functions are truly supported in the WAT target.

### Done when

- The compiler can run in Node tests with no browser.
- A bad formula produces a structured error instead of a crash.

## Phase 3: Create a numerical reference layer for testing

### Goal

Verify that generated formulas and the integrator behave correctly against a trusted reference.

### Test strategy overview

Use three test layers:

1. Pure compiler tests
2. JS/WASM evaluation tests
3. Python `odeint` trajectory comparison tests

### 3.1 Pure compiler tests

- [ ] Add parser tests for:
  - literals
  - variables
  - parameters
  - unary minus
  - operator precedence
  - parentheses
  - supported functions
- [ ] Add normalization tests for variable ordering and parameter ordering.
- [ ] Add validation tests for:
  - unknown variable
  - unknown parameter
  - invalid initial value
  - unsupported function
  - unsupported operator
- [ ] Add WAT golden tests for a few stable cases.

### 3.2 JS/WASM evaluation tests

- [ ] Add a small Node test helper that:
  - compiles an ODE definition
  - instantiates the generated WASM
  - evaluates derivatives at chosen `t`, `y`, and `p`
- [ ] Compare WASM derivative outputs with a JS reference evaluator for known formulas.
- [ ] Add fixed-point tests for simple systems:
  - harmonic oscillator
  - damped oscillator
  - Van der Pol
  - Hopf oscillator

### 3.3 Python `odeint` comparison tests

Design the compiler/integrator tests so formulas can be written as plain text fixtures and compared against Python results.

#### Files to add

- [ ] `tests/fixtures/odes/*.json`
- [ ] `scripts/reference_odeint.py`
- [ ] `tests/integration/ode-trajectory.test.js`

#### Fixture format

Each fixture should contain:

```json
{
  "name": "harmonic_oscillator",
  "equations": {
    "x": "y",
    "y": "-(w*w) * x"
  },
  "parameters": {
    "w": { "value": 2.0, "min": 0.0, "max": 10.0 }
  },
  "initialValues": {
    "x": 1.0,
    "y": 0.0
  },
  "method": "rk4",
  "timeScale": 1.0,
  "tStart": 0.0,
  "tEnd": 1.0,
  "sampleCount": 256,
  "tolerance": 1e-4
}
```

#### Python reference script design

- [ ] Read a fixture JSON file.
- [ ] Build a Python derivative function from the normalized equation order.
- [ ] Use `scipy.integrate.odeint` to compute the reference trajectory.
- [ ] Return a JSON result with:
  - time grid
  - state vectors
  - metadata
- [ ] Exit non-zero on malformed fixtures.

#### JS test design

- [ ] Load the same fixture.
- [ ] Run the project integrator with the same time grid.
- [ ] Compare every state variable at every sampled time.
- [ ] Use per-fixture tolerances.
- [ ] Keep chaotic systems like Lorenz to short horizons and looser tolerances.

#### Recommended fixture set

- [ ] Harmonic oscillator
- [ ] Damped harmonic oscillator
- [ ] Van der Pol oscillator
- [ ] Hopf oscillator
- [ ] Lorenz system with short horizon only

### Done when

- Formula tests run outside the browser.
- The integrator matches Python `odeint` within agreed tolerances.
- Regressions in parsing or integration show up automatically.

## Phase 4: Separate the integrator/runtime from the worklet shell

### Goal

Make the numerical engine testable and make the worklet a thin adapter.

### Coding steps

- [ ] Extract RK4 and Euler into a shared module that can run both in tests and in the worklet.
- [ ] Define a small runtime contract:
  - derivative function
  - state vector
  - parameter vector
  - step size
- [ ] Keep the `AudioWorkletProcessor` focused on:
  - reading inputs
  - stepping the integrator
  - writing outputs
- [ ] Fix the current WASM memory layout bug by sizing memory offsets from:
  - variable count
  - parameter count
  - result count
- [ ] Add tests specifically for offset calculation and memory packing.
- [ ] Make reset behavior deterministic.
- [ ] Make time scaling and detuning explicit and tested.

### Done when

- The worklet is mostly glue code.
- Numerical correctness no longer depends on browser-only execution.

## Phase 5: Build the real audio engine and mixer model

### Goal

Replace the current ad hoc node handling with a runtime that follows the patch document.

### Coding steps

- [ ] Create `AudioEngine` as the top-level audio orchestrator.
- [ ] Create `InstrumentRuntime` for one compiled ODE instrument.
- [ ] Create `MixerRuntime` for channels and master output.
- [ ] Create a clean `addInstrument`, `removeInstrument`, `replaceInstrument`, and `applyPatchDiff` API.
- [ ] Give each instrument its own output gain before the mixer.
- [ ] Make channel state explicit:
  - gain
  - mute
  - solo later
  - output meter later
- [ ] Ensure parameter updates happen through explicit APIs, not hidden GUI mutation.
- [ ] Keep analyzers separate from the actual audio routing graph.

### Minimum first version

- [ ] One mixer channel per ODE instrument.
- [ ] One master channel.
- [ ] Instrument gain and master gain.
- [ ] Later: per-variable outputs and patchable gain nodes.

### Done when

- Audio routing is derived from patch state.
- Removing or recompiling a node does not leave dangling connections.

## Phase 6: Replace `dat.gui` with the panel-based UI model

### Goal

Move from a prototype control panel to the workspace shown in the design.

### Coding steps

- [ ] Create a `WorkspaceModel` that owns:
  - panels
  - selection
  - drag state
  - connections
  - z-order
- [ ] Create an `OdeInstrumentPanel` UI component.
- [ ] Create a `MixerPanel` docked at the bottom.
- [ ] Add panel dragging.
- [ ] Add panel focus and z-order behavior.
- [ ] Add panel-local controls for:
  - equation editing
  - parameter sliders
  - gain
  - visualization mode
  - variable selection
- [ ] Add typed input/output ports on panel edges.
- [ ] Add cable preview while dragging.
- [ ] Add connection validation rules.

### Recommended interaction order

- [ ] First make panels draggable and restorable.
- [ ] Then add panel-local scopes.
- [ ] Then add ports.
- [ ] Then add cables.
- [ ] Then add gain panel or per-connection gain if still desired.

### Done when

- The main editing experience matches the design direction in `docs.md`.

## Phase 7: Upgrade the GL visualization system

### Goal

Turn the current grid renderer into a panel-local visualization system.

### Coding steps

- [ ] Split workspace rendering from oscilloscope rendering.
- [ ] Keep a lightweight GL or canvas layer for cables and panel chrome if useful.
- [ ] Keep a separate scope renderer for panel-local signal display.
- [ ] Add `x(t)` mode.
- [ ] Add `x-y` mode.
- [ ] Add variable selectors for scope inputs.
- [ ] Define how analyzers feed each scope.
- [ ] Ensure visualization frame rate is independent from audio stepping.
- [ ] Stop relying on the current auto-grid layout.

### Done when

- Every ODE panel can show its own scope and restore its own visual mode.

## Phase 8: Add session persistence with JSON + `localStorage`

### Goal

Restore the last workspace state automatically, including layout and fader values.

### Requirements

The persistence layer should save:

- patch structure
- ODE definitions
- current parameter values
- panel positions and sizes
- panel z-order
- visualization mode and selected variables
- mixer channel gains
- master gain
- selected/focused panel if useful

The persistence layer should not save:

- live `AudioNode` objects
- live `AudioContext` state
- analyzer instances
- compiled WASM bytes in the first version

### Storage design

Use one versioned JSON document in `localStorage`.

Recommended key:

- `rk4webaudio.lastSession.v1`

Recommended shape:

```json
{
  "version": 1,
  "savedAt": "2026-03-28T12:00:00.000Z",
  "patch": {
    "nodes": [
      {
        "id": "ode-hopf-1",
        "type": "ode",
        "name": "Hopf",
        "definition": {
          "equations": {
            "x": "TWO_PI*w * y + (g - b*(x*x + y*y))*x",
            "y": "-TWO_PI*w * x + (g - b*(x*x + y*y))*y"
          },
          "parameters": {
            "w": { "value": 440, "min": 0, "max": 6080 },
            "g": { "value": 1, "min": -4, "max": 4 },
            "b": { "value": 10, "min": 0, "max": 30 }
          },
          "initialValues": { "x": 0.5, "y": 1.0 },
          "method": "rk4",
          "timeScale": 1.0,
          "outputs": ["x", "y"]
        }
      }
    ],
    "connections": [],
    "mixer": {
      "masterGain": 0.7,
      "channels": {
        "ode-hopf-1": {
          "gain": 0.4,
          "mute": false,
          "solo": false
        }
      }
    }
  },
  "session": {
    "panels": {
      "ode-hopf-1": {
        "x": 120,
        "y": 90,
        "width": 300,
        "height": 420,
        "zIndex": 3,
        "collapsed": false
      }
    },
    "visualization": {
      "ode-hopf-1": {
        "mode": "xy",
        "xVar": "x",
        "yVar": "y",
        "timeVars": ["x"]
      }
    },
    "ui": {
      "selectedPanelId": "ode-hopf-1",
      "workspace": {
        "panX": 0,
        "panY": 0,
        "zoom": 1
      }
    }
  }
}
```

### Coding steps

- [ ] Create `src/app/session-store.js`.
- [ ] Add APIs:
  - `loadLastSession()`
  - `saveLastSession(sessionDocument)`
  - `clearLastSession()`
  - `migrateSession(raw)`
- [ ] Validate the loaded JSON before using it.
- [ ] If validation fails, fall back to a safe default session.
- [ ] Autosave with a debounce.
  - Recommendation: 250 to 500 ms.
- [ ] Save on these triggers:
  - panel move end
  - slider change end
  - node add/remove
  - compile success
  - connection add/remove
  - mixer change
  - before page unload
- [ ] On startup:
  - load session
  - validate/migrate
  - restore patch document
  - rebuild audio graph from definitions
  - restore panel layout
  - restore mixer gains and parameter values
  - keep audio suspended until the user hits play

### Done when

- Reloading the page restores the last session.
- Layout, visual mode, and gains come back reliably.
- Invalid storage data does not break startup.

## Phase 9: Add browser and app-level smoke tests

### Goal

Verify the end-to-end app behavior once the panel UI exists.

### Coding steps

- [ ] Add a lightweight browser smoke test layer later.
- [ ] Cover:
  - app boot
  - load last session
  - create ODE panel
  - edit equation and recompile
  - move panel and reload page
  - change gain and reload page
  - connect node to mixer
- [ ] Keep browser tests small and put most math verification in Node/Python tests.

## Phase 10: Remove prototype-only behavior

- [ ] Remove noisy debug logs from production paths.
- [ ] Remove implicit globals and one-off browser assumptions.
- [ ] Remove dead experimental code after the new architecture lands.
- [ ] Replace temporary HTML text areas and ad hoc demos with proper panel editors.
- [ ] Replace fragile helper calls like direct GUI folder removal hacks with owned panel lifecycle APIs.

## Suggested execution sequence for the actual coding work

- [ ] Step 1: add package/test/python scaffolding
- [ ] Step 2: define normalized schemas
- [ ] Step 3: extract compiler core
- [ ] Step 4: add parser and WAT tests
- [ ] Step 5: add Python `odeint` comparison tests
- [ ] Step 6: extract shared integrator/runtime logic
- [ ] Step 7: fix audio engine and mixer around patch state
- [ ] Step 8: implement `localStorage` session store
- [ ] Step 9: restore the current app from the saved session document
- [ ] Step 10: replace `dat.gui` with draggable panel UI
- [ ] Step 11: add cables and typed connections
- [ ] Step 12: add bottom mixer panel

## Acceptance criteria for the first serious milestone

The project reaches the first stable milestone when all of these are true:

- [ ] ODE definitions use one canonical schema.
- [ ] The compiler runs and is tested outside the browser.
- [ ] Generated derivatives and trajectories match Python `odeint` within tolerances.
- [ ] The worklet runtime has correct memory layout and deterministic stepping.
- [ ] The audio engine can create, replace, and remove instruments safely.
- [ ] The app restores the last saved layout and fader state from `localStorage`.
- [ ] The UI has draggable ODE panels with local scope mode selection.
- [ ] The bottom mixer restores instrument gains and master gain after reload.

## Notes for implementation

- Keep the first persistence feature focused on "restore last session", not a full preset browser.
- Recompile formulas on restore instead of storing WASM blobs in `localStorage`.
- Treat the Python comparison harness as a correctness oracle, not as part of runtime.
- Keep chaotic systems in short-horizon tests only.
- Prefer one explicit patch document over many disconnected UI state objects.
