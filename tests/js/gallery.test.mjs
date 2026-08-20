/**
 * Testes do estado da galeria. `node --test tests/js/`, sem dependência.
 *
 * gallery.js não toca DOM nem rede de propósito, então reordenar e girar são
 * verificáveis aqui, sem navegador.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { criaGaleria } from '../../static/js/gallery.js';

/** Coleta as URLs criadas e revogadas, para provar que nada vaza. */
function urlsDeTeste() {
    const criadas = [];
    const revogadas = [];

    return {
        criadas,
        revogadas,
        cria: (arquivo) => {
            const url = `blob:${arquivo.name}`;
            criadas.push(url);
            return url;
        },
        revoga: (url) => revogadas.push(url),
    };
}

const arquivo = (nome, tamanho = 1024) => ({ name: nome, size: tamanho });

function galeriaCom(nomes, maxImagens = 20) {
    const urls = urlsDeTeste();
    const galeria = criaGaleria({ maxImagens, urls });
    galeria.adiciona(nomes.map((nome) => arquivo(nome)));

    return { galeria, urls };
}

const nomes = (galeria) => galeria.itens().map((item) => item.arquivo.name);
const idDe = (galeria, nome) =>
    galeria.itens().find((item) => item.arquivo.name === nome).id;

test('adiciona no fim, mantendo a ordem de entrada', () => {
    const { galeria } = galeriaCom(['a', 'b']);

    galeria.adiciona([arquivo('c')]);

    assert.deepEqual(nomes(galeria), ['a', 'b', 'c']);
});

test('adiciona recusa o que passa do teto e diz quantos ficaram fora', () => {
    const { galeria } = galeriaCom([], 2);

    const primeiro = galeria.adiciona([arquivo('a'), arquivo('b')]);
    const segundo = galeria.adiciona([arquivo('c'), arquivo('d')]);

    assert.deepEqual(primeiro, { adicionados: 2, recusados: 0 });
    assert.deepEqual(segundo, { adicionados: 0, recusados: 2 });
    assert.deepEqual(nomes(galeria), ['a', 'b']);
});

test('move troca com o vizinho', () => {
    const { galeria } = galeriaCom(['a', 'b', 'c']);

    assert.equal(galeria.move(idDe(galeria, 'b'), 1), true);

    assert.deepEqual(nomes(galeria), ['a', 'c', 'b']);
});

test('move no primeiro item para tras nao sai do array', () => {
    const { galeria } = galeriaCom(['a', 'b']);

    assert.equal(galeria.move(idDe(galeria, 'a'), -1), false);

    assert.deepEqual(nomes(galeria), ['a', 'b']);
});

test('move no ultimo item para frente nao sai do array', () => {
    const { galeria } = galeriaCom(['a', 'b']);

    assert.equal(galeria.move(idDe(galeria, 'b'), 1), false);

    assert.deepEqual(nomes(galeria), ['a', 'b']);
});

test('reordena empurra o resto em vez de trocar', () => {
    const { galeria } = galeriaCom(['a', 'b', 'c', 'd']);

    galeria.reordena(idDe(galeria, 'd'), idDe(galeria, 'b'));

    assert.deepEqual(nomes(galeria), ['a', 'd', 'b', 'c']);
});

test('reordena para a propria posicao nao muda nada', () => {
    const { galeria } = galeriaCom(['a', 'b']);

    assert.equal(galeria.reordena(idDe(galeria, 'a'), idDe(galeria, 'a')), false);

    assert.deepEqual(nomes(galeria), ['a', 'b']);
});

test('gira acumula em modulo 360', () => {
    const { galeria } = galeriaCom(['a']);
    const id = idDe(galeria, 'a');

    for (let volta = 0; volta < 4; volta += 1) galeria.gira(id, 90);

    assert.equal(galeria.itens()[0].rotacao, 0);
});

test('girar para a esquerda a partir de zero da 270', () => {
    const { galeria } = galeriaCom(['a']);

    galeria.gira(idDe(galeria, 'a'), -90);

    assert.equal(galeria.itens()[0].rotacao, 270);
});

test('gira so a pagina pedida', () => {
    const { galeria } = galeriaCom(['a', 'b']);

    galeria.gira(idDe(galeria, 'b'), 90);

    assert.deepEqual(galeria.itens().map((item) => item.rotacao), [0, 90]);
});

test('remove revoga a URL que criou', () => {
    const { galeria, urls } = galeriaCom(['a', 'b']);

    galeria.remove(idDe(galeria, 'a'));

    assert.deepEqual(nomes(galeria), ['b']);
    assert.deepEqual(urls.revogadas, ['blob:a']);
});

test('limpa revoga todas as URLs', () => {
    const { galeria, urls } = galeriaCom(['a', 'b']);

    galeria.limpa();

    assert.equal(galeria.total(), 0);
    assert.deepEqual(urls.revogadas.sort(), ['blob:a', 'blob:b']);
});

test('operacao em id inexistente nao altera a lista', () => {
    const { galeria } = galeriaCom(['a']);

    assert.equal(galeria.move(999, 1), false);
    assert.equal(galeria.gira(999, 90), false);
    assert.equal(galeria.remove(999), false);
    assert.deepEqual(nomes(galeria), ['a']);
});

test('vagas conta o que ainda cabe', () => {
    const { galeria } = galeriaCom(['a'], 3);

    assert.equal(galeria.vagas(), 2);
});

test('itens devolve copia: mexer no retorno nao mexe no estado', () => {
    const { galeria } = galeriaCom(['a', 'b']);

    galeria.itens().pop();

    assert.equal(galeria.total(), 2);
});
