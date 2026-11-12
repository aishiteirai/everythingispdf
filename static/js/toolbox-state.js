/**
 * Regra do painel de ferramentas. Sem DOM.
 *
 * Quem usa o painel descreve as seções como dados. Seção comum:
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
 *
 * Seção de passos: um valor entre dois botões, como "‹ 02 / 03 ›". Tem `id`
 * (para atualizar o valor), `passos: true`, exatamente duas ações (menos e
 * mais) e `essencial` na própria seção. Opcional: `dica`, uma linha embaixo.
 */

export function validaSecoes(secoes) {
    const vistas = new Set();

    secoes.forEach(({ id, passos, acoes }) => {
        if (passos) {
            if (!id) throw new Error('secao de passos sem id');
            if (acoes.length !== 2) throw new Error(`${id} precisa de duas acoes`);
        }

        acoes.forEach(({ acao, descricao }) => {
            if (vistas.has(acao)) throw new Error(`acao ${acao} repetida`);
            if (!descricao) throw new Error(`acao ${acao} sem descricao`);
            vistas.add(acao);
        });
    });
}

/**
 * O que vai na barra do celular e o que fica na gaveta.
 *
 * `barra` é uma lista de `{ tipo: 'acao', acao }` e `{ tipo: 'passos', secao }`,
 * na ordem das seções. Seção de passos vai inteira para a barra ou some do
 * celular: na gaveta o valor ficaria escondido atrás de um toque.
 *
 * Na gaveta não há cabeçalho de seção, então cada ação leva o título junto,
 * para "ESQUERDA" de ESTA PÁGINA não se confundir com o de TODAS.
 */
export function divideAcoes(secoes) {
    const barra = [];
    const gaveta = [];

    secoes.forEach((secao) => {
        if (secao.passos) {
            if (secao.essencial) barra.push({ tipo: 'passos', secao });
            return;
        }

        secao.acoes.forEach((acao) => {
            if (acao.essencial) barra.push({ tipo: 'acao', acao });
            else gaveta.push({ ...acao, secao: secao.titulo });
        });
    });

    return { barra, gaveta };
}
