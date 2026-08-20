/**
 * Ciclo da preferência de tema. Sem DOM, sem cookie — só a ordem.
 */

export const ORDEM = ['auto', 'claro', 'escuro'];

/**
 * Próximo estado do ciclo. Valor desconhecido — cookie adulterado, atributo
 * ausente — recomeça em 'auto', que é o comportamento padrão do site.
 */
export function proximoTema(atual) {
    const posicao = ORDEM.indexOf(atual);
    if (posicao === -1) return ORDEM[0];

    return ORDEM[(posicao + 1) % ORDEM.length];
}
