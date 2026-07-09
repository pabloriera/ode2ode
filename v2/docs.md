# ODE Synthesizer Project Notes

## Project intent

This project is an ODE synthesizer with GL visualization.

The core idea is:

- A user defines a dynamical system as equations plus parameters and initial conditions.
- The system is compiled into a WASM-backed `AudioWorklet` so it can run as a real-time audio instrument.
- Each instrument appears as a draggable panel in a patching workspace.
- Panels expose audio and control ports, visual feedback, parameter controls, and routing.
- A mixer panel collects outputs from many ODE instruments and routes the final signal to the soundcard.

The target is to evolve the current prototype into a stable, professional, modular instrument-building environment.

## Product goals

- Make the audio engine predictable, low-latency, and safe for live editing.
- Separate the formula compiler, audio graph, visualization, and UI state into clean modules.
- Support multiple ODE instruments at once.
- Make routing explicit through ports, cables, gain controls, and a mixer.
- Keep the workspace visual and playful, but engineer it like a reliable audio tool.
- Allow the same ODE to be seen both as sound and as geometry.

## What "more stable and professional" means

- Runtime compilation failures must be isolated and reported clearly.
- Invalid equations must not crash the audio engine or freeze the UI.
- Audio graph state and UI state must be synchronized by a single source of truth.
- The system must support save/load of patches.
- The panel layout must be deterministic and restorable.
- Visualization must never interfere with audio timing.
- Debug logging, ad hoc wiring, and hidden side effects should be removed from production paths.
- Each subsystem should be testable in isolation.

## High-level system model

The product should be designed as five cooperating systems:

1. Formula compiler
2. Audio synthesis and routing engine
3. Workspace graph and patch model
4. GL visualization system
5. UI shell and panel interaction layer

Each system should have a narrow responsibility and communicate through explicit data contracts.

## Ideal code design

The codebase should move toward this separation:

### 1. Domain layer

Owns the project data model and patch definitions.

Responsibilities:

- Define `Patch`, `Node`, `Port`, `Cable`, `PanelLayout`, `MixerChannel`, and `OdeDefinition`.
- Define serializable schemas for save/load.
- Keep naming and IDs stable.
- Validate patch documents before runtime objects are created.

Suggested concepts:

- `PatchDocument`
- `OdeNodeDefinition`
- `MixerNodeDefinition`
- `ConnectionDefinition`
- `PanelState`
- `VisualizationConfig`

### 2. Compiler layer

Owns equation parsing, semantic validation, and WASM generation.

Responsibilities:

- Parse ODE equations, parameters, initial values, and integration options.
- Validate variable references, parameter references, and reserved names.
- Produce a deterministic intermediate representation before WAT/WASM generation.
- Compile to WASM bytecode for use by an `AudioWorkletProcessor`.
- Cache compiled modules by normalized definition hash.
- Provide rich error messages with equation and field context.

Important rule:

The compiler should not know anything about panels, dragging, cables, or rendering.

### 3. Audio engine layer

Owns real-time node creation, routing, gain staging, and hardware output.

Responsibilities:

- Instantiate ODE instruments from compiled modules.
- Expose outputs per dynamic variable or per instrument bus.
- Route signals through gain nodes and mixer channels.
- Support mute, solo, main output, and per-node attenuation.
- Keep UI-driven parameter changes sample-safe.
- Recover cleanly from node removal or recompilation.

Important rule:

The audio engine should treat the patch graph as input, not as its own internal source of truth.

### 4. Visualization layer

Owns oscilloscope rendering and workspace visuals.

Responsibilities:

- Render panel-local oscilloscopes efficiently with WebGL.
- Support `x(t)` mode and `x-y` mode.
- Let the user choose which dynamic variables feed the display.
- Render cables, ports, hover states, and selection states.
- Decouple render frame rate from audio processing rate.

Important rule:

Visualization reads state from the app model and analyzers, but never owns business logic for audio routing.

### 5. UI application layer

Owns user interaction and orchestration.

Responsibilities:

- Create, delete, rename, move, and focus panels.
- Open editors for equations and parameters.
- Manage selection, cable dragging, snapping, and inspector panels.
- Dispatch user intent into domain actions.
- Coordinate compiler jobs and engine updates.

## Core module plans

## Formula compiler

This module is the heart of the ODE instrument system.

### It needs to be capable of:

- Accepting a structured ODE definition:
  - equations
  - parameters
  - initial conditions
  - integration method
  - time scaling
  - channel/output mapping
- Validating that equations reference only known state variables, parameters, constants, and supported functions.
- Supporting a safe expression grammar instead of relying on ad hoc string replacement.
- Producing deterministic generated code from the same input.
- Emitting WASM bytes for the audio worklet.
- Returning clear compile diagnostics:
  - parse error
  - unknown symbol
  - unsupported operation
  - type/arity mismatch
  - invalid configuration
- Supporting hot recompilation when the user edits equations.
- Recompiling without popping audio or corrupting graph state.
- Providing a normalization layer so equivalent formulas compile to the same cache key.

### Ideal internal pipeline

1. Normalize input definition.
2. Parse formulas into an AST.
3. Run semantic validation.
4. Produce an intermediate math representation.
5. Generate WAT or another low-level target.
6. Compile to WASM.
7. Hand compiled bytes plus metadata to the audio engine.

### Design notes

- The compiler should return metadata describing:
  - ordered state variables
  - ordered parameters
  - output channels
  - compile hash
  - supported visualization variables
- Compile results should be immutable.
- A failed compile should not destroy the last known good running node unless the user confirms replacement behavior.

## Audio modular synth / mixer

This module should feel like a small modular environment, not just a flat list of gain nodes.

### It needs to be capable of:

- Creating one audio node graph per ODE instrument.
- Exposing named outputs for dynamic variables such as `x`, `y`, `z`.
- Supporting instrument output gain before mixer insertion.
- Supporting mixer channels with:
  - input gain
  - mute
  - solo
  - pan if needed later
  - level meters
  - master bus routing
- Routing many instruments into a single hardware output stage.
- Allowing future effect nodes between instruments and the master bus.
- Supporting explicit connections through the workspace graph.
- Managing node lifecycle cleanly:
  - create
  - replace after recompilation
  - disconnect
  - destroy

### Desired architectural shape

- `AudioEngine`
- `InstrumentRuntime`
- `MixerRuntime`
- `ConnectionRuntime`
- `MasterOutputRuntime`

### Design notes

- Graph creation should be declarative from patch state.
- UI sliders should not directly mutate graph internals.
- Parameter automation and live edits should go through stable message/update APIs.
- Audio output routing should remain simple at first:
  - ODE node output
  - gain stage
  - mixer channel
  - master
  - destination

## GL visualization and workspace system

This system has two jobs:

1. Draw the patching workspace with panels, ports, and cables.
2. Draw the signal/trajectory visualization inside each ODE panel.

### It needs to be capable of:

- Rendering a 2D workspace with draggable floating panels.
- Showing ports on panel edges.
- Drawing cables between compatible ports.
- Showing cable preview while dragging.
- Showing selection, hover, and invalid connection states.
- Rendering oscilloscope content inside each ODE panel without blocking interaction.
- Supporting two display modes:
  - `x(t)` mode
  - `x-y` mode
- Allowing variable selection for each mode:
  - `x(t)`: choose one or more variables over time
  - `x-y`: choose x-axis variable and y-axis variable
- Supporting panel collapse/expand later.
- Supporting saved panel positions and z-order.

### Visual separation

- Workspace rendering concerns:
  - panel frames
  - titles
  - ports
  - cables
  - drag states
- Scope rendering concerns:
  - waveform buffers
  - trajectory buffers
  - axis mode
  - variable selection

These should be separate rendering components even if both use WebGL.

## UI logic from the desired panel layout

The mockup suggests a workspace built around self-contained instrument cards plus a bottom mixer.

### Main UI pieces

#### 1. ODE instrument panel

Each ODE panel should include:

- A title bar with the node name.
- An editable ODE definition area.
- One oscilloscope/trajectory preview area.
- Parameter sliders for the exposed parameters.
- Input ports on the left edge.
- Output ports on the right edge.
- A local gain or output attenuation control.
- A mode selector for visualization.
- Variable selectors for display axes.

### ODE panel behavior

- Clicking a panel focuses it.
- Dragging the panel body moves it.
- Dragging from an output port starts cable creation.
- Dropping on a compatible input port creates a connection.
- Double-clicking the equation area enters edit mode.
- If compilation succeeds, the panel updates the instrument runtime.
- If compilation fails, the panel shows an error state but the last valid runtime can remain active.

#### 2. Gain control as an inline routing concept

The sketch shows a gain control between an output and another panel. In the product this can be handled in one of two ways:

- A dedicated gain node panel inserted into the cable path.
- A lightweight per-connection gain handle attached to the cable.

For the first stable version, prefer a dedicated gain node or per-panel output gain. It is easier to reason about, save, and test.

#### 3. Scope panel / instrument monitor panel

The mockup also suggests a panel that can be used mainly as a visual monitor with controls.

This panel type can evolve in two directions:

- A normal ODE instrument panel that simply shows a richer scope section.
- A separate monitor panel that subscribes to outputs from one or more ODE nodes.

Recommended first step:

Keep scope visualization inside the ODE panel and add a separate monitor panel later only if needed.

#### 4. Bottom mixer strip

The mixer should be anchored or docked at the bottom of the workspace, like in the image.

It should contain:

- One channel strip per active instrument or exposed bus.
- Channel labels.
- One or more sliders per selected output if multi-output mixing is exposed.
- A master channel at the far right.
- Visual meters later.

### Mixer behavior

- New instruments auto-create mixer channels.
- Renaming an instrument updates the mixer label.
- Deleting an instrument removes or disables its channel.
- A channel can represent:
  - the whole instrument mix
  - or each exported variable separately

Recommended first step:

Start with one mixer channel per instrument plus a single master channel. Add per-variable channels later if that proves musically useful.

## UI state model

The UI should operate on explicit state rather than implicit DOM state.

### State that must be tracked

- Panel positions
- Panel sizes
- Panel z-order
- Focused panel
- Selected cable or node
- Dragging state
- Cable preview state
- Compile status per ODE node
- Runtime health per ODE node
- Visualization mode per panel
- Variable selection per panel
- Mixer channel state

### Important interaction rule

Dragging panels and drawing cables should be controlled by a workspace interaction state machine. This avoids messy event handling spread across unrelated components.

## Recommended panel types

For a stable product shape, define a small number of panel types:

- `OdeInstrumentPanel`
- `GainPanel`
- `MixerPanel`
- `MonitorPanel` later
- `InspectorPanel` later

The first milestone does not need all of them to ship, but the model should reserve room for them.

## Connection model

Connections should be typed.

### Suggested connection categories

- Audio-rate signal
- Control-rate modulation
- Monitoring tap

### Port examples

- ODE input ports:
  - external forcing input
  - parameter modulation input
- ODE output ports:
  - `x`
  - `y`
  - `z`
  - summed output
- Mixer input ports:
  - channel in
  - master in

### Connection rules

- Only compatible port types can connect.
- Invalid drops should be rejected visually.
- A connection should exist in the patch document before it exists in the audio runtime.

## Capability checklist by system

### Formula compiler

- Parse equations robustly
- Validate symbols and configuration
- Generate deterministic WASM
- Cache results
- Report compile diagnostics
- Support hot recompilation

### Audio engine

- Create/destroy instruments cleanly
- Support live parameter updates
- Route instruments through gain and mixer stages
- Avoid audio glitches on graph edits
- Expose analyzers for visualization

### Visualization engine

- Draw panel-local scopes efficiently
- Draw workspace cables and ports
- Support axis mode selection
- Support variable selection
- Maintain smooth interaction during audio playback

### Patch/workspace model

- Save and restore graph state
- Save and restore panel layout
- Represent nodes and cables explicitly
- Keep runtime and UI synced through one document model

### UI layer

- Panel dragging
- Cable drawing
- Focus and selection
- Inline editing
- Error display
- Mixer control

## Phased implementation plan

## Phase 1: Stabilize the foundations

- Define the patch document schema.
- Separate compiler logic from UI logic.
- Separate audio graph management from visualization.
- Define typed node and connection models.
- Standardize ODE definitions and compile metadata.
- Add a clear error/reporting path.

Outcome:

A stable architecture that can host the panel UI without constant rewrites.

## Phase 2: Ship a clean single-panel ODE instrument

- Build one professional ODE instrument panel.
- Support equation editing, parameter sliders, compile status, and local visualization.
- Support `x(t)` and `x-y` display modes.
- Support one output gain control.

Outcome:

One panel can stand on its own as a usable instrument.

## Phase 3: Add workspace patching

- Add panel dragging and z-order management.
- Add ports and cable creation.
- Add explicit node connections.
- Add connection validation and cable preview.

Outcome:

The product starts behaving like a patchable visual synth environment.

## Phase 4: Add the mixer strip

- Add a bottom-docked mixer panel.
- Auto-create channels for instruments.
- Add master output control.
- Add mute/solo later if needed.

Outcome:

Multiple instruments can be managed as a coherent performance setup.

## Phase 5: Persistence and polish

- Save/load patches.
- Restore workspace layout.
- Add compile cache.
- Add performance profiling.
- Add user-facing diagnostics.
- Remove prototype-only logging and debug switches from production code paths.

Outcome:

The project becomes a reusable instrument authoring environment rather than a demo.

## Recommended first UX plan based on the sketch

The first professional version of the UI should work like this:

1. The user creates an ODE instrument panel.
2. The user edits equations and parameters inside that panel.
3. The panel shows compile status and a live scope.
4. The user chooses the visualization mode:
   - `x(t)`
   - `x-y`
5. The user selects which variables feed the visualization.
6. The user drags the panel anywhere in the workspace.
7. The user patches the instrument output to gain or mixer targets using cables.
8. The bottom mixer shows one channel per instrument and a master slider.

This keeps the product close to the drawing while giving us a realistic implementation path.

## Future extensions

- Dedicated modulation sources
- Effects panels
- Preset browser
- Patch browser
- Multi-monitor scope panels
- Record/export audio
- Record/export trajectories
- Collaborative patch sharing

## Decision summary

The target design should be:

- Compiler-centric but not compiler-coupled
- Patch-document driven
- Audio-safe
- GL-rendered
- Panel-based
- Cable-routed
- Mixer-backed
- Easy to expand without rewriting core systems

This document should be treated as the starting architecture brief for the next stabilization pass.
