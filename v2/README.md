# rk4webaudio

ODE synthesizer playground with WASM-backed AudioWorklets and GL visualization.

## Status

This repository is still a browser-based prototype, but it now has the first real refactor foundations in place:

- normalized ODE definitions under `src/domain`
- session persistence modules under `src/app`
- starter Node tests for domain/session logic
- a Python `odeint` reference runner plus a harmonic oscillator fixture

## Run the app

You can serve the project without installing any JS dependencies:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

You can also use the shortcut:

```bash
npm run start
```

## Run tests

Node-side tests:

```bash
npm test
```

Python reference smoke test:

```bash
npm run test:python
```

Python dependencies for the reference solver are listed in `requirements.txt`.

## Project layout

- `index.html`: browser entrypoint
- `main.js`: current app bootstrap, node lifecycle, and session restore wiring
- `ode.js`: ODE compilation/runtime glue for the current app
- `odeint-generator.js`: audio worklet integrator
- `wat.js`: expression-to-WAT generator
- `audio.js`: mixer and parameter helpers
- `visual.js`: current WebGL visualization system
- `src/domain/ode-definition.js`: canonical ODE normalization
- `src/domain/session-document.js`: session document normalization
- `src/app/session-store.js`: localStorage persistence
- `tests/`: Node tests and ODE fixtures
- `scripts/reference_odeint.py`: Python numerical reference runner
- `docs.md`: architecture notes
- `todo.md`: implementation backlog

## Notes

The long-term goal is still to move more reusable runtime code into `src/` as the refactor continues.
