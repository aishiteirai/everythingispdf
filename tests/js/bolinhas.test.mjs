/**
 * Estado do arrasto das bolinhas. `node --test tests/js/`, sem dependência.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    LIMIAR_DE_ARRASTO_PX,
    LIMITE_PX,
    limita,
    move,
    naOrigem,
    serializa,
    virouArrasto,
} from '../../static/js/bolinhas-estado.js';

test('limita mantem o valor dentro da faixa', () => {
    assert.equal(limita(120), 120);
    assert.equal(limita(LIMITE_PX + 1000), LIMITE_PX);
    assert.equal(limita(-LIMITE_PX - 1000), -LIMITE_PX);
});

test('limita arredonda para inteiro', () => {
    // O backend converte o cookie com int(): um decimal invalidaria tudo e
    // as duas bolinhas voltariam para a origem.
    assert.equal(limita(12.4), 12);
    assert.equal(limita(12.6), 13);
    assert.equal(Number.isInteger(limita(-0.5)), true);
});

test('movimento menor que o limiar ainda e clique', () => {
    assert.equal(virouArrasto(0, 0), false);
    assert.equal(virouArrasto(3, 3), false);
    assert.equal(virouArrasto(LIMIAR_DE_ARRASTO_PX, 0), false);
});

test('movimento acima do limiar e arrasto', () => {
    assert.equal(virouArrasto(LIMIAR_DE_ARRASTO_PX + 1, 0), true);
    assert.equal(virouArrasto(0, -20), true);
});

test('o limiar mede a distancia, nao cada eixo', () => {
    // 5 e 5 dao 7.07 de distancia: passa do limiar de 6 mesmo com cada eixo
    // abaixo dele.
    assert.equal(virouArrasto(5, 5), true);
});

test('move soma o deslocamento a posicao inicial', () => {
    assert.deepEqual(move({ x: 10, y: -5 }, { x: 30, y: 15 }), { x: 40, y: 10 });
});

test('move nao deixa a bolinha sair da faixa', () => {
    const longe = move({ x: 0, y: 0 }, { x: 99999, y: -99999 });

    assert.deepEqual(longe, { x: LIMITE_PX, y: -LIMITE_PX });
});

test('naOrigem so e verdade quando todas estao no lugar', () => {
    assert.equal(naOrigem([{ x: 0, y: 0 }, { x: 0, y: 0 }]), true);
    assert.equal(naOrigem([{ x: 0, y: 0 }, { x: 1, y: 0 }]), false);
    assert.equal(naOrigem([{ x: 0, y: -2 }, { x: 0, y: 0 }]), false);
});

test('serializa no formato que o backend espera', () => {
    assert.equal(serializa([{ x: 80, y: -12 }, { x: 0, y: 40 }]), '80_-12|0_40');
});

test('o formato nao usa caractere proibido em valor de cookie', () => {
    // ';' separa cookies no cabecalho e a RFC 6265 exclui ',' '"' espaco e
    // '\\'. Um deles como separador faz o navegador cortar o valor.
    const serializado = serializa([{ x: 80, y: -12 }, { x: 0, y: 40 }]);

    for (const proibido of [';', ',', '"', ' ', '\\']) {
        assert.equal(serializado.includes(proibido), false, `usa ${proibido}`);
    }
});

test('serializa nunca emite decimal', () => {
    const posicoes = [
        move({ x: 0, y: 0 }, { x: 12.4, y: -7.6 }),
        move({ x: 0, y: 0 }, { x: 0.5, y: 0 }),
    ];

    assert.match(serializa(posicoes), /^-?\d+_-?\d+\|-?\d+_-?\d+$/);
});
