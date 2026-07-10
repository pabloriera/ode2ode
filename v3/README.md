# rk4webaudio v3

Standalone browser version of the modular ODE synth.

## Run

```bash
cd v3
python3 -m http.server 4173
```

Open:

```text
http://127.0.0.1:4173/
```

## What is included

- draggable modular rack with patch cables
- ODE library: Hopf, Lorenz, Duffing, Van der Pol, Hindmarsh-Rose
- normalized serializable patch document with localStorage and JSON import/export
- AudioWorklet RK4 integration with oversampling
- one named output signal per ODE variable
- routable output-to-parameter modulation through cable gain nodes
- mixer channels with mute, solo, channel gain, and master gain
- module-local scopes plus global oscilloscope and trajectory views
- Design tab for live custom ODE authoring and preview

## Designer Formula Syntax

Use one equation per line:

```text
x' = y
y' = -a*x - b*y + drive + sin(w*t)
```

The left side names output variables. Symbols on the right side that are not variables, `t`, constants, or functions become parameters automatically. Supported functions include `sin`, `cos`, `pow`, `power`, and `sigmoid`. Save a compiled model to make it appear in the patch view right-click module menu.

The implementation has no npm dependencies and is meant to run from any static file server.
