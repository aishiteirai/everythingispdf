/**
 * Regra do painel de ferramentas. Sem DOM.
 *
 * Quem usa o painel descreve as seções como dados:
 *
 *   { titulo: 'ESTA PÁGINA', acoes: [
 *       { acao: 'giraDireita', icone: 'rotate-cw', rotulo: 'DIREITA',
 *         descricao: 'Girar esta página para a direita', essencial: true },
 *   ] }
 *
 * - `acao` identifica o botão: é o nome que chega em `aoAcionar` e o que
 *   devolve o foco depois de redesenhar, então não pode repetir
 * - `rotulo` aparece escrito no desktop e na gaveta
 * - `descricao` é o nome acessível; na barra do celular o botão é só ícone
 * - `essencial` põe a ação na barra do celular; o resto vai para a gaveta
 */

export function validaSecoes(secoes) {
    const vistas = new Set();

    secoes.forEach(({ acoes }) => acoes.forEach(({ acao, descricao }) => {
        if (vistas.has(acao)) throw new Error(`acao ${acao} repetida`);
        if (!descricao) throw new Error(`acao ${acao} sem descricao`);
        vistas.add(acao);
    }));
}

/**
 * Separa o que vai na barra do celular do que fica na gaveta. Na gaveta não
 * há cabeçalho de seção, então cada ação leva o título junto, para
 * "↺ ESQUERDA" de ESTA PÁGINA não se confundir com o de TODAS.
 */
export function divideAcoes(secoes) {
    const todas = secoes.flatMap(({ titulo, acoes }) =>
        acoes.map((acao) => ({ ...acao, secao: titulo }))
    );

    return {
        essenciais: todas.filter((acao) => acao.essencial),
        gaveta: todas.filter((acao) => !acao.essencial),
    };
}
