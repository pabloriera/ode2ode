// Example usage
const oscillatorConfig = {
    name: "Oscillator",
    equations: {
        x: "-TWO_PI*w * y", // dx/dt = -w*y
        y: "TWO_PI*w * x" // dy/dt = w*x
    },
    parameters: {
        w: 220
    },
    initialValues: { x: 0.5, y: 1.0 },
    method: 'rk4'
};


const lorenzConfig = {
    name: "Lorenz",
    equations: {
        x: "sigma * y - sigma * x",
        y: "x * (rho - z) - y",
        z: "x * y - beta * z"
    },
    parameters: {
        sigma: 10,
        rho: 28,
        beta: 8 / 3,
    },
    initialValues: { x: 0.1, y: 0.1, z: 0.1 },
    timeScale: 100
}

const vanDerPolConfig = {
    name: "Van der Pol",
    equations: {
        x: "y",
        y: "mu * (1.0 - x*x) * y - x"
    },
    parameters: {
        mu: 1.0 // damping parameter
    },
    initialValues: { x: 2.0, y: 0.0 },
    timeScale: 500 // slowed down to better observe the oscillations
};