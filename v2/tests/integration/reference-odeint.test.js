import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('python reference solver returns a valid harmonic oscillator trajectory', async () => {
    const { stdout } = await execFileAsync('python3', [
        'scripts/reference_odeint.py',
        'tests/fixtures/odes/harmonic_oscillator.json'
    ]);

    const result = JSON.parse(stdout);

    assert.equal(result.name, 'harmonic_oscillator');
    assert.deepEqual(result.variables, ['x', 'y']);
    assert.equal(result.times.length, 128);
    assert.equal(result.states.length, 128);
    assert.deepEqual(result.states[0], [1, 0]);
});
