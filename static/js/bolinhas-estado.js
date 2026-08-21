/**
 * Estado do arrasto das bolinhas: posição, limite e limiar. Sem DOM, sem
 * cookie — só a aritmética, para ser testável sem navegador.
 */

/**
 * Faixa em que a bolinha pode andar. O mesmo número existe no backend
 * (LIMITE_ARRASTO_PX): sem limite, uma posição adulterada joga a bolinha para
 * fora da tela e o link fica inalcançável.
 */
export const LIMITE_PX = 400;

/**
 * Quanto o ponteiro precisa andar para deixar de ser clique e virar arrasto.
 * Sem esse limiar, qualquer tremor de mão durante o clique arrastaria a
 * bolinha — ou, pior, arrastar sempre acabaria navegando.
 */
export const LIMIAR_DE_ARRASTO_PX = 6;

export function limita(valor, limite = LIMITE_PX) {
    return Math.max(-limite, Math.min(limite, Math.round(valor)));
}

export function virouArrasto(dx, dy, limiar = LIMIAR_DE_ARRASTO_PX) {
    return Math.hypot(dx, dy) > limiar;
}

/** Nova posição a partir da inicial mais o deslocamento, já limitada. */
export function move(posicao, deslocamento, limite = LIMITE_PX) {
    return {
        x: limita(posicao.x + deslocamento.x, limite),
        y: limita(posicao.y + deslocamento.y, limite),
    };
}

export function naOrigem(posicoes) {
    return posicoes.every((posicao) => posicao.x === 0 && posicao.y === 0);
}

/**
 * Separadores do cookie: "x_y|x_y". Não dá para usar ';' nem ',': em cabeçalho
 * HTTP o ';' separa cookies, e a RFC 6265 também exclui ',', '"', espaço e '\\'
 * do valor — o navegador cortaria o valor no separador e a posição voltaria à
 * origem a cada carregamento. O backend espera exatamente este formato e
 * recusa qualquer outro.
 */
export const SEPARADOR_DE_BOLINHAS = '|';
export const SEPARADOR_DE_EIXOS = '_';

export function serializa(posicoes) {
    return posicoes
        .map(({ x, y }) => `${x}${SEPARADOR_DE_EIXOS}${y}`)
        .join(SEPARADOR_DE_BOLINHAS);
}
