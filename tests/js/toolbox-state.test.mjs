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

const nomesDaBarra = (barra) =>
    barra.map((item) => (item.tipo === 'passos' ? `passos:${item.secao.id}` : item.acao.acao));

test('essenciais vao para a barra na ordem das secoes', () => {
    assert.deepEqual(nomesDaBarra(divideAcoes(SECOES).barra), ['a', 'c', 'e']);
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

const PASSOS = {
    id: 'posicao', titulo: 'POSIÇÃO', passos: true, essencial: true,
    acoes: [acao('menos'), acao('mais')],
};

test('secao de passos entra inteira na barra, no lugar dela', () => {
    const secoes = [
        { titulo: 'A', acoes: [acao('a', { essencial: true })] },
        PASSOS,
        { titulo: 'B', acoes: [acao('b', { essencial: true })] },
    ];

    assert.deepEqual(nomesDaBarra(divideAcoes(secoes).barra), ['a', 'passos:posicao', 'b']);
});

test('secao de passos nunca vai para a gaveta', () => {
    // Na gaveta o valor (02 / 03) ficaria escondido atras de um toque.
    const secoes = [{ ...PASSOS, essencial: false }];

    assert.deepEqual(divideAcoes(secoes), { barra: [], gaveta: [] });
});

test('secao de passos precisa de id e de duas acoes', () => {
    assert.throws(() => validaSecoes([{ ...PASSOS, id: undefined }]), /passos sem id/);
    assert.throws(
        () => validaSecoes([{ ...PASSOS, acoes: [acao('menos')] }]),
        /posicao precisa de duas acoes/,
    );
});
