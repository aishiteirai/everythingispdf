/**
 * Tudo que toca o DOM na página de conversão. Nada de rede, nada de
 * validação, nada de regra de estado — essa mora em press-state.js.
 *
 * Nome de arquivo vem do usuário: entra por textContent e atributo, nunca
 * como HTML.
 */

import { criaFeedback } from './feedback.js';
import { criaPrensa } from './press.js';

const ELEMENTOS = {
    area: 'area',
    entrada: 'entrada',
    barra: 'barra',
    preenchimento: 'preenchimento',
    recado: 'recado',
    acoes: 'acoes',
};

function botao(texto, classes) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = classes;
    el.textContent = texto;
    return el;
}

export function criaInterface() {
    const el = Object.fromEntries(
        Object.entries(ELEMENTOS).map(([chave, id]) => [chave, document.getElementById(id)])
    );

    const feedback = criaFeedback({
        barra: el.barra,
        preenchimento: el.preenchimento,
        recado: el.recado,
    });

    return {
        el,
        ...feedback,
        prensa: criaPrensa(el.area),

        // Nome próprio desta página para o estado indeterminado da barra.
        mostraConvertendo: feedback.mostraTrabalhando,

        /**
         * O download já começou sozinho. BAIXAR fica de reserva para quando o
         * navegador bloqueia o download automático.
         */
        mostraFim({ url, nome }) {
            const baixar = document.createElement('a');
            baixar.className = 'botao botao-vermelho';
            baixar.href = url;
            baixar.download = nome;
            baixar.textContent = 'BAIXAR ↓';

            const outro = botao('CONVERTER OUTRO', 'botao botao-creme');
            outro.id = 'outro';

            el.acoes.replaceChildren(baixar, outro);
        },

        mostraTentarOutro() {
            const outro = botao('TENTAR OUTRO', 'botao botao-creme');
            outro.id = 'outro';
            el.acoes.replaceChildren(outro);
            outro.focus();
        },

        limpaAcoes() {
            el.acoes.replaceChildren();
        },

        /** Com a prensa batendo, o palco não abre o seletor. */
        travaEntrada(travada) {
            el.entrada.disabled = travada;
            el.area.classList.toggle('travada', travada);
        },

        marcaArrastando(arrastando) {
            el.area.classList.toggle('arrastando', arrastando);
        },
    };
}
