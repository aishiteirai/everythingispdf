/**
 * Ciclo da preferência de tema. `node --test tests/js/`, sem dependência.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ORDEM, proximoTema } from '../../static/js/tema-estado.js';

test('o ciclo comeca no automatico', () => {
    assert.equal(ORDEM[0], 'auto');
});

test('avanca automatico para claro para escuro', () => {
    assert.equal(proximoTema('auto'), 'claro');
    assert.equal(proximoTema('claro'), 'escuro');
});

test('do escuro volta para o automatico', () => {
    assert.equal(proximoTema('escuro'), 'auto');
});

test('tres cliques voltam ao estado inicial', () => {
    let estado = 'auto';
    for (let clique = 0; clique < ORDEM.length; clique += 1) {
        estado = proximoTema(estado);
    }

    assert.equal(estado, 'auto');
});

test('valor desconhecido recomeca no automatico', () => {
    for (const lixo of ['roxo', '', undefined, null, 'ESCURO']) {
        assert.equal(proximoTema(lixo), 'auto', `falhou em ${JSON.stringify(lixo)}`);
    }
});
