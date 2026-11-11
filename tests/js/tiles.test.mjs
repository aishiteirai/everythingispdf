/**
 * Regra dos ladrilhos. `node --test tests/js/`, sem dependência.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    CORES, CREME, FORMAS, atrasoDaOnda, colunasDaGrade, criaPersiana,
    marcacaoDoLadrilho, novoLadrilho,
} from '../../static/js/tiles.js';

const sequencia = (...valores) => () => (valores.length ? valores.shift() : 0);

test('fundo e creme quando o sorteio fica abaixo de 0,7', () => {
    assert.equal(novoLadrilho(sequencia(0.1, 0, 0, 0)).fundo, CREME);
});

test('fundo e cor quando o sorteio passa de 0,7', () => {
    assert.ok(CORES.includes(novoLadrilho(sequencia(0.9, 0, 0, 0)).fundo));
});

test('a cor da forma nunca e igual ao fundo', () => {
    for (let i = 0; i < 500; i++) {
        const ladrilho = novoLadrilho();
        assert.notEqual(ladrilho.cor, ladrilho.fundo);
    }
});

test('rotacao e sempre multiplo de 90', () => {
    for (let i = 0; i < 200; i++) {
        assert.ok([0, 90, 180, 270].includes(novoLadrilho().rot));
    }
});

test('sorteio no limite de 1 nao sai da lista', () => {
    const ladrilho = novoLadrilho(() => 0.9999999);
    assert.ok(FORMAS.includes(ladrilho.forma));
    assert.ok(CORES.includes(ladrilho.cor));
});

test('chanceDeForma 0 da ladrilho liso', () => {
    assert.equal(novoLadrilho(Math.random, 0).forma, null);
});

test('a marcacao de cada forma e svg sem script', () => {
    for (const forma of FORMAS) {
        const marcacao = marcacaoDoLadrilho({ fundo: CREME, cor: CORES[0], forma });
        assert.match(marcacao, /^<rect/);
        assert.ok(marcacao.length > '<rect width="100" height="100" fill="#fffef9"/>'.length);
        assert.doesNotMatch(marcacao, /script|on\w+=/i);
    }
});

test('ladrilho liso e so o fundo', () => {
    assert.equal(
        marcacaoDoLadrilho({ fundo: CREME, cor: CORES[0], forma: null }),
        `<rect width="100" height="100" fill="${CREME}"/>`,
    );
});

test('abaixo de 600px a grade tem 7 colunas', () => {
    assert.deepEqual(colunasDaGrade(375), { colunas: 7, tamanho: 53 });
});

test('no desktop o ladrilho tem 56px', () => {
    assert.deepEqual(colunasDaGrade(1000), { colunas: 18, tamanho: 56 });
});

test('onda: atraso proporcional a distancia', () => {
    assert.equal(atrasoDaOnda(30, 40), 80);
    assert.equal(atrasoDaOnda(0, 0), 0);
});

test('persiana gira uma fileira a cada 28px e guarda o resto', () => {
    const persiana = criaPersiana();
    assert.deepEqual(persiana.rola(27), []);
    assert.deepEqual(persiana.rola(1), [1]);
    assert.deepEqual(persiana.rola(-60), [-1, -1]);
    assert.deepEqual(persiana.rola(-3), []);
});
