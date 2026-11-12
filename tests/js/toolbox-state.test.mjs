/**
 * Regra do painel de ferramentas. `node --test tests/js/`, sem dependência.
 *
 * O painel serve à galeria hoje e ao editor de PDF depois: quem usa descreve
 * as seções como dados, e esta parte decide o que vai para a barra do celular
 * e o que fica na gaveta.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { divideAcoes, validaSecoes } from '../../static/js/toolbox-state.js';

const acao = (id, extra = {}) => ({
    acao: id, icone: 'x', rotulo: id.toUpperCase(), descricao: `faz ${id}`, ...extra,
});

const SECOES = [
    { titulo: 'ESTA PÁGINA', acoes: [
        acao('a', { essencial: true }), acao('b'), acao('c', { essencial: true }),
    ] },
    { titulo: 'TODAS', acoes: [acao('d'), acao('e', { essencial: true })] },
];

test('essenciais vao para a barra na ordem das secoes', () => {
    assert.deepEqual(divideAcoes(SECOES).essenciais.map((a) => a.acao), ['a', 'c', 'e']);
});

test('o resto vai para a gaveta, levando o titulo da secao', () => {
    const { gaveta } = divideAcoes(SECOES);

    assert.deepEqual(gaveta.map((a) => [a.acao, a.secao]), [
        ['b', 'ESTA PÁGINA'],
        ['d', 'TODAS'],
    ]);
});

test('sem nada fora da barra a gaveta fica vazia', () => {
    const secoes = [{ titulo: 'X', acoes: [acao('a', { essencial: true })] }];

    assert.deepEqual(divideAcoes(secoes).gaveta, []);
});

test('secoes validas passam', () => {
    assert.doesNotThrow(() => validaSecoes(SECOES));
});

test('acao repetida em duas secoes e erro', () => {
    // O foco volta ao botao pelo id da acao: dois iguais seriam ambiguos.
    const secoes = [{ titulo: 'A', acoes: [acao('a')] }, { titulo: 'B', acoes: [acao('a')] }];

    assert.throws(() => validaSecoes(secoes), /a repetida/);
});

test('acao sem descricao e erro', () => {
    // Sem descricao o botao so de icone na barra do celular fica mudo para
    // o leitor de tela.
    const secoes = [{ titulo: 'A', acoes: [acao('a', { descricao: '' })] }];

    assert.throws(() => validaSecoes(secoes), /a sem descricao/);
});
