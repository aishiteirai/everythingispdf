/**
 * Fiação de arrasto por ponteiro, compartilhada pelas duas dinâmicas do site.
 *
 * Pointer Events cobrem mouse, caneta e toque num caminho só. A decisão de
 * quando um ponteiro pressionado vira arrasto está em `arraste-estado.js`, que
 * não toca DOM e tem teste.
 *
 * Antes existiam duas implementações: as bolinhas usavam Pointer Events e a
 * galeria usava drag-and-drop HTML5, que não dispara em toque.
 */

import { ESPERA_NO_TOQUE_MS, decideInicio } from './arraste-estado.js';

export { ESPERA_NO_TOQUE_MS };

/**
 * Torna `elemento` arrastável.
 *
 * - `aoComecar`, `aoMover`, `aoSoltar` recebem `{ dx, dy, evento }`
 * - `esperaNoToqueMs` exige segurar antes de começar, no toque. Use em lista
 *   que rola, onde deslizar o dedo precisa continuar rolando a página
 * - `ignorar` é um seletor: ponteiro que desce sobre ele não arrasta nada
 *
 * Devolve uma função que desliga os ouvintes.
 */
export function tornaArrastavel(elemento, opcoes = {}) {
    const {
        aoComecar,
        aoMover,
        aoSoltar,
        esperaNoToqueMs = 0,
        ignorar = null,
    } = opcoes;

    let partida = null;
    let ultimo = null;
    let estado = 'inativo';
    let arrastou = false;
    let relogio = null;

    const delta = () => ({
        dx: ultimo.x - partida.x,
        dy: ultimo.y - partida.y,
    });

    function cancelaRelogio() {
        if (relogio === null) return;
        clearTimeout(relogio);
        relogio = null;
    }

    function inicia(evento) {
        estado = 'arrastando';
        arrastou = true;
        cancelaRelogio();
        elemento.classList.add('arrastando');

        aoComecar?.({ ...delta(), evento });
        aoMover?.({ ...delta(), evento });
    }

    function encerra(evento, cancelado) {
        cancelaRelogio();

        const arrastava = estado === 'arrastando';
        const ultimoDelta = partida ? delta() : { dx: 0, dy: 0 };

        estado = 'inativo';
        partida = null;
        elemento.classList.remove('arrastando');

        if (arrastava) aoSoltar?.({ ...ultimoDelta, evento, cancelado });
    }

    function aoPressionar(evento) {
        if (evento.button !== 0) return;
        if (ignorar && evento.target.closest(ignorar)) return;

        partida = { x: evento.clientX, y: evento.clientY, t: evento.timeStamp };
        ultimo = { x: evento.clientX, y: evento.clientY };
        estado = 'esperando';
        arrastou = false;

        elemento.setPointerCapture(evento.pointerId);

        // Sem evento de movimento, segurar parado nao gera decisao nenhuma:
        // e o relogio que faz o arrasto comecar com o dedo imovel.
        if (evento.pointerType === 'touch' && esperaNoToqueMs) {
            relogio = setTimeout(() => {
                relogio = null;
                if (estado === 'esperando') inicia(evento);
            }, esperaNoToqueMs);
        }
    }

    function aoMoverPonteiro(evento) {
        if (estado === 'inativo') return;

        ultimo = { x: evento.clientX, y: evento.clientY };

        if (estado === 'arrastando') {
            aoMover?.({ ...delta(), evento });
            return;
        }

        const decisao = decideInicio({
            tipo: evento.pointerType,
            ...delta(),
            decorridoMs: evento.timeStamp - partida.t,
            esperaNoToqueMs,
        });

        if (decisao === 'arrastar') inicia(evento);
        // 'desistir' e rolagem da pagina: soltamos o ponteiro e nao
        // interferimos em nada.
        else if (decisao === 'desistir') encerra(evento, true);
    }

    // O clique vem depois do pointerup. Se houve arrasto, agir no clique seria
    // o oposto do que o usuario pediu -- navegar, ou disparar um botao.
    function aoClicar(evento) {
        if (!arrastou) return;

        evento.preventDefault();
        evento.stopPropagation();
        arrastou = false;
    }

    // Ancora e imagem sao nativamente arrastaveis: sem isso o navegador comeca
    // o proprio drag e o nosso nunca recebe pointermove.
    const aoArrastarNativo = (evento) => evento.preventDefault();

    /**
     * Impede a rolagem enquanto arrasta, e so enquanto arrasta.
     *
     * `touch-action: none` no CSS resolveria, mas teria de valer antes do
     * gesto comecar -- e ai a lista nunca rolaria. Cancelar o touchmove com
     * `passive: false` e o que permite deixar a rolagem funcionando ate o
     * momento em que o arrasto assume.
     */
    function aoMoverToque(evento) {
        if (estado === 'arrastando') evento.preventDefault();
    }

    elemento.addEventListener('pointerdown', aoPressionar);
    elemento.addEventListener('pointermove', aoMoverPonteiro);
    elemento.addEventListener('pointerup', (evento) => encerra(evento, false));
    elemento.addEventListener('pointercancel', (evento) => encerra(evento, true));
    elemento.addEventListener('click', aoClicar, true);
    elemento.addEventListener('dragstart', aoArrastarNativo);
    elemento.addEventListener('touchmove', aoMoverToque, { passive: false });

    return function desliga() {
        cancelaRelogio();
        elemento.removeEventListener('pointerdown', aoPressionar);
        elemento.removeEventListener('pointermove', aoMoverPonteiro);
        elemento.removeEventListener('click', aoClicar, true);
        elemento.removeEventListener('dragstart', aoArrastarNativo);
        elemento.removeEventListener('touchmove', aoMoverToque);
    };
}
