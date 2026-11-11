/**
 * Testes do estado da galeria. `node --test tests/js/`, sem dependência.
 *
 * gallery.js não toca DOM nem rede de propósito, então reordenar e girar são
 * verificáveis aqui, sem navegador.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { criaGaleria, margemEmFracao, proporcaoDaFolha } from '../../static/js/gallery.js';

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

/* ----------------------------------------------------------------
   Foco depois de uma ação

   A grade é redesenhada inteira a cada ação, então o botão clicado é
   destruído e o foco do teclado se perde — quem usa teclado ou leitor de
   tela volta ao topo a cada rotação. `focoDepoisDe` decide para onde o foco
   vai, e é lógica pura sobre a lista antes e depois.
   ---------------------------------------------------------------- */

import { focoDepoisDe } from '../../static/js/gallery.js';

const lista = (...ids) => ids.map((id) => ({ id }));

test('girar mantem o foco no mesmo botao', () => {
    const itens = lista(1, 2, 3);

    assert.deepEqual(focoDepoisDe('giraDireita', 2, itens, itens), {
        id: 2, acao: 'giraDireita',
    });
});

test('mover no meio mantem o foco no mesmo botao', () => {
    const antes = lista(1, 2, 3, 4);
    const depois = lista(1, 3, 2, 4);

    assert.deepEqual(focoDepoisDe('moveFrente', 2, antes, depois), {
        id: 2, acao: 'moveFrente',
    });
});

test('mover para o fim passa o foco ao botao oposto', () => {
    // O botao clicado fica desabilitado no extremo: manter o foco nele
    // deixaria o teclado preso num controle inerte.
    const antes = lista(1, 2, 3);
    const depois = lista(1, 3, 2);

    assert.deepEqual(focoDepoisDe('moveFrente', 2, antes, depois), {
        id: 2, acao: 'moveTras',
    });
});

test('mover para o inicio passa o foco ao botao oposto', () => {
    const antes = lista(1, 2, 3);
    const depois = lista(2, 1, 3);

    assert.deepEqual(focoDepoisDe('moveTras', 2, antes, depois), {
        id: 2, acao: 'moveFrente',
    });
});

test('remover foca uma acao nao destrutiva do item que tomou o lugar', () => {
    // Focar o proprio remover deixaria uma sequencia de Enter apagando tudo.
    const antes = lista(1, 2, 3, 4);
    const depois = lista(1, 3, 4);

    assert.deepEqual(focoDepoisDe('remove', 2, antes, depois), {
        id: 3, acao: 'giraEsquerda',
    });
});

test('remover o ultimo foca o novo ultimo', () => {
    const antes = lista(1, 2, 3);
    const depois = lista(1, 2);

    assert.deepEqual(focoDepoisDe('remove', 3, antes, depois), {
        id: 2, acao: 'giraEsquerda',
    });
});

test('remover o unico item nao tem onde focar', () => {
    assert.equal(focoDepoisDe('remove', 1, lista(1), []), null);
});

test('id que nao existe mais e nao foi substituido nao foca nada', () => {
    assert.equal(focoDepoisDe('giraDireita', 9, lista(1, 2), lista(1, 2)), null);
});

/* ----------------------------------------------------------------
   Selecao: a pagina em foco no palco
   ---------------------------------------------------------------- */

test('adicionar numa galeria vazia seleciona o primeiro adicionado', () => {
    const { galeria } = galeriaCom(['a', 'b']);

    assert.equal(galeria.selecionado(), idDe(galeria, 'a'));
});

test('adicionar mais nao muda a selecao', () => {
    const { galeria } = galeriaCom(['a', 'b']);
    galeria.seleciona(idDe(galeria, 'b'));

    galeria.adiciona([arquivo('c')]);

    assert.equal(galeria.selecionado(), idDe(galeria, 'b'));
});

test('remover a selecionada passa para a seguinte', () => {
    const { galeria } = galeriaCom(['a', 'b', 'c']);
    galeria.seleciona(idDe(galeria, 'b'));

    galeria.remove(idDe(galeria, 'b'));

    assert.equal(galeria.selecionado(), idDe(galeria, 'c'));
});

test('remover a ultima selecionada passa para a anterior', () => {
    const { galeria } = galeriaCom(['a', 'b', 'c']);
    galeria.seleciona(idDe(galeria, 'c'));

    galeria.remove(idDe(galeria, 'c'));

    assert.equal(galeria.selecionado(), idDe(galeria, 'b'));
});

test('remover outra que nao a selecionada mantem a selecao', () => {
    const { galeria } = galeriaCom(['a', 'b', 'c']);
    galeria.seleciona(idDe(galeria, 'c'));

    galeria.remove(idDe(galeria, 'a'));

    assert.equal(galeria.selecionado(), idDe(galeria, 'c'));
});

test('remover a unica deixa a selecao nula', () => {
    const { galeria } = galeriaCom(['a']);

    galeria.remove(idDe(galeria, 'a'));

    assert.equal(galeria.selecionado(), null);
});

test('limpa zera a selecao', () => {
    const { galeria } = galeriaCom(['a', 'b']);

    galeria.limpa();

    assert.equal(galeria.selecionado(), null);
});

test('depois de limpar, adicionar seleciona de novo', () => {
    const { galeria } = galeriaCom(['a']);
    galeria.limpa();

    galeria.adiciona([arquivo('z')]);

    assert.equal(galeria.selecionado(), idDe(galeria, 'z'));
});

test('seleciona id inexistente devolve false e nao muda', () => {
    const { galeria } = galeriaCom(['a', 'b']);
    const antes = galeria.selecionado();

    assert.equal(galeria.seleciona(999), false);
    assert.equal(galeria.selecionado(), antes);
});

test('mover e girar nao mudam a selecao', () => {
    const { galeria } = galeriaCom(['a', 'b']);
    const id = idDe(galeria, 'a');

    galeria.move(id, 1);
    galeria.gira(id, 90);

    assert.equal(galeria.selecionado(), id);
});

/* ----------------------------------------------------------------
   Geometria da folha
   ---------------------------------------------------------------- */

test('folha A4 e carta em pe tem proporcao fixa', () => {
    assert.equal(proporcaoDaFolha({ tamanho: 'a4', largura: 3000, altura: 4000, rotacao: 0 }), 210 / 297);
    assert.equal(proporcaoDaFolha({ tamanho: 'letter', largura: 1, altura: 1, rotacao: 0 }), 215.9 / 279.4);
});

test('imagem deitada deita a folha A4, como o servidor faz', () => {
    assert.equal(proporcaoDaFolha({ tamanho: 'a4', largura: 4000, altura: 3000, rotacao: 0 }), 297 / 210);
});

test('girar 90 levanta a folha de uma imagem deitada', () => {
    assert.equal(proporcaoDaFolha({ tamanho: 'a4', largura: 4000, altura: 3000, rotacao: 90 }), 210 / 297);
});

test('folha no tamanho da imagem segue a imagem e a rotacao', () => {
    assert.equal(proporcaoDaFolha({ tamanho: 'image', largura: 400, altura: 300, rotacao: 0 }), 400 / 300);
    assert.equal(proporcaoDaFolha({ tamanho: 'image', largura: 400, altura: 300, rotacao: 90 }), 300 / 400);
});

test('margem em fracao da largura e zero no tamanho da imagem', () => {
    assert.equal(margemEmFracao(21, 'a4'), 0.1);
    assert.ok(Math.abs(margemEmFracao(29.7, 'a4', true) - 0.1) < 1e-9);
    assert.equal(margemEmFracao(21, 'image'), 0);
});
