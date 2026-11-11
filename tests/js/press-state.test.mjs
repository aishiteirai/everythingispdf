/**
 * Estados da prensa e forma por tipo. `node --test tests/js/`.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    COR_DA_FORMA, aceitaArquivo, formaDoArquivo, posicaoNaEsteira, transicao,
} from '../../static/js/press-state.js';

test('forma por tipo, sem diferenciar maiuscula', () => {
    assert.equal(formaDoArquivo('RELATORIO.DOCX'), 'quadrado');
    assert.equal(formaDoArquivo('contas.xls'), 'triangulo');
    assert.equal(formaDoArquivo('aula.odp'), 'circulo');
    assert.equal(formaDoArquivo('FOTO.JPG'), 'meio');
    assert.equal(formaDoArquivo('sem-extensao'), 'quadrado');
});

test('toda forma tem cor', () => {
    for (const nome of ['a.docx', 'a.xlsx', 'a.pptx', 'a.png']) {
        assert.ok(COR_DA_FORMA[formaDoArquivo(nome)]);
    }
});

test('fluxo feliz', () => {
    let estado = 'esperando';
    for (const [evento, esperado] of [
        ['escolheu', 'enviando'], ['progresso', 'enviando'],
        ['servidor', 'convertendo'], ['sucesso', 'pronto'],
    ]) {
        estado = transicao(estado, evento);
        assert.equal(estado, esperado);
    }
});

test('upload instantaneo vai de enviando direto a convertendo', () => {
    assert.equal(transicao('enviando', 'servidor'), 'convertendo');
});

test('falha no envio ou na conversao leva a erro', () => {
    assert.equal(transicao('enviando', 'falha'), 'erro');
    assert.equal(transicao('convertendo', 'falha'), 'erro');
});

test('arquivo novo so entra fora do trabalho', () => {
    assert.deepEqual(
        ['esperando', 'enviando', 'convertendo', 'pronto', 'erro'].map(aceitaArquivo),
        [true, false, false, true, true],
    );
});

test('soltar outro depois do fim recomeca o envio', () => {
    assert.equal(transicao('pronto', 'escolheu'), 'enviando');
    assert.equal(transicao('erro', 'escolheu'), 'enviando');
});

test('reinicia volta a esperar so do fim', () => {
    assert.equal(transicao('pronto', 'reinicia'), 'esperando');
    assert.equal(transicao('erro', 'reinicia'), 'esperando');
    assert.equal(transicao('convertendo', 'reinicia'), null);
});

test('evento fora de hora nao muda nada', () => {
    assert.equal(transicao('esperando', 'sucesso'), null);
    assert.equal(transicao('pronto', 'progresso'), null);
});

test('posicao na esteira e limitada', () => {
    assert.equal(posicaoNaEsteira(50, 0, 200), 100);
    assert.equal(posicaoNaEsteira(100, 16, 300), 300);
    assert.equal(posicaoNaEsteira(140, 0, 200), 200);
    assert.equal(posicaoNaEsteira(-5, 0, 200), 0);
});
