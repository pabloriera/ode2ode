"""Reference ODE solver for fixture-based trajectory tests."""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

try:
    import numpy as np
    from scipy.integrate import odeint
except ImportError as error:  # pragma: no cover - runtime dependency check
    print(json.dumps({"error": f"Missing dependency: {error}"}))
    raise SystemExit(1)

SAFE_GLOBALS = {
    "__builtins__": {},
    "abs": abs,
    "cos": math.cos,
    "exp": math.exp,
    "log": math.log,
    "sin": math.sin,
    "sqrt": math.sqrt,
    "tan": math.tan,
    "TWO_PI": math.tau,
}


def normalize_parameter_value(parameter):
    if isinstance(parameter, dict):
        return float(parameter["value"])
    if isinstance(parameter, list):
        return float(parameter[0])
    return float(parameter)


def build_derivative(fixture):
    equations = fixture["equations"]
    variable_names = list(equations.keys())
    parameter_values = {
        name: normalize_parameter_value(value)
        for name, value in fixture.get("parameters", {}).items()
    }
    compiled_expressions = {
        name: compile(expression, f"<{name}>", "eval")
        for name, expression in equations.items()
    }

    def derivative(state, time_value):
        scope = {name: float(state[index]) for index, name in enumerate(variable_names)}
        scope.update(parameter_values)
        scope["t"] = float(time_value)
        return [
            float(eval(compiled_expressions[name], SAFE_GLOBALS, scope))
            for name in variable_names
        ]

    return derivative, variable_names


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python3 scripts/reference_odeint.py <fixture.json>"}))
        return 1

    fixture_path = Path(sys.argv[1])
    fixture = json.loads(fixture_path.read_text())
    derivative, variable_names = build_derivative(fixture)

    initial_state = [float(fixture["initialValues"][name]) for name in variable_names]
    sample_count = int(fixture.get("sampleCount", 256))
    t_start = float(fixture.get("tStart", 0.0))
    t_end = float(fixture.get("tEnd", 1.0))
    time_values = np.linspace(t_start, t_end, sample_count)
    trajectory = odeint(derivative, initial_state, time_values)

    print(
        json.dumps(
            {
                "name": fixture.get("name", fixture_path.stem),
                "variables": variable_names,
                "times": time_values.tolist(),
                "states": trajectory.tolist(),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
