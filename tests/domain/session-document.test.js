import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createDefaultSessionDocument,
    normalizeSessionDocument
} from '../../src/domain/session-document.js';

test('createDefaultSessionDocument returns a bootable session', () => {
    const session = createDefaultSessionDocument();

    assert.equal(session.version, 1);
    assert.equal(session.mainVolume, 0.5);
    assert.equal(session.nodes.length, 1);
    assert.match(session.editorText, /Hopf/);
});

test('normalizeSessionDocument keeps persisted node state', () => {
    const session = normalizeSessionDocument({
        mainVolume: 0.8,
        editorText: '{"name":"Saved"}',
        nodes: [
            {
                definition: {
                    name: 'Saved',
                    equations: {
                        x: 'y',
                        y: '-x'
                    },
                    parameters: {
                        amount: [2, 0, 3]
                    },
                    initialValues: {
                        x: 1,
                        y: 0
                    },
                    integrationMethod: 'rk4'
                },
                gain: 0.25,
                detuning: 1.1,
                visualizationMode: 'oscilloscope',
                visualizationSize: 1.5
            }
        ]
    });

    assert.equal(session.mainVolume, 0.8);
    assert.equal(session.nodes[0].definition.method, 'rk4');
    assert.equal(session.nodes[0].gain, 0.25);
    assert.equal(session.nodes[0].visualizationMode, 'oscilloscope');
    assert.equal(session.nodes[0].definition.parameters.amount.value, 2);
});
