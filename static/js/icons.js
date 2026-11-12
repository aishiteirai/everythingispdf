/**
 * Ícones do Lucide, servidos daqui mesmo como sprite (static/icons/lucide.svg).
 *
 * Sprite com <use> e não SVG colado em cada botão: um arquivo, cacheado uma
 * vez, e o nome do ícone é a única coisa que o código precisa saber. CDN não
 * serve: a CSP só aceita a própria origem.
 */

const SPRITE = '/static/icons/lucide.svg';
const SVG = 'http://www.w3.org/2000/svg';

/**
 * Elemento <svg> com o ícone `nome`. Decorativo: o nome acessível é do
 * botão que o contém, então o ícone fica fora da árvore de acessibilidade.
 */
export function icone(nome) {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'icone');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const uso = document.createElementNS(SVG, 'use');
    uso.setAttribute('href', `${SPRITE}#${nome}`);
    svg.append(uso);

    return svg;
}
