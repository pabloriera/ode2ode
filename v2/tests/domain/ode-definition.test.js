import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeOdeDefinition } from '../../src/domain/ode-definition.js';

test('normalizeOdeDefinition supports integrationMethod aliases and scalar parameters', () => {
    const definition = normalizeOdeDefinition({
        name: 'Oscillator',
        equations: {
            x: 'y',
            y: '-w * x'
        },
        parameters: {
            w: 2
        },
        initialValues: {
            x: 1,
            y: 0
        },
        integrationMethod: 'euler'
    });

    assert.equal(definition.method, 'euler');
    assert.equal(definition.parameters.w.value, 2);
    assert.deepEqual(definition.outputs, ['x', 'y']);
});

test('normalizeOdeDefinition preserves object parameter ranges', () => {
    const definition = normalizeOdeDefinition({
        name: 'Hopf',
        equations: {
            x: 'y',
            y: '-x'
        },
        parameters: {
            gain: {
                value: 1,
                min: -2,
                max: 2
            }
        },
        initialValues: {
            x: 0.5,
            y: 0.25
        }
    });

    assert.deepEqual(definition.parameters.gain, {
        value: 1,
        min: -2,
        max: 2
    });
});
