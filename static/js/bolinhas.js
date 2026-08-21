/**
 * Arrastar as bolinhas do hub e guardar onde ficaram.
 *
 * Pointer events cobrem mouse e toque num caminho só. Quem aplica a posição
 * no carregamento é o servidor, que lê o cookie e renderiza --dx e --dy no
 * style do elemento; aqui só movemos durante o arrasto e gravamos no fim.
 *
 * Arrastar é enriquecimento: o link continua focável e ativável por teclado,
 * e mover a bolinha não muda a ordem de tabulação.
 */

import {
    LIMITE_PX,
    move,
    naOrigem,
    serializa,
    virouArrasto,
} from './bolinhas-estado.js';

const UM_ANO_EM_SEGUNDOS = 60 * 60 * 24 * 365;

const bolinhas = [...document.querySelectorAll('[data-bolinha]')];
const botaoVoltar = document.getElementById('voltar-bolinhas');

/** Lê o que o servidor escreveu no style inline. */
function posicaoDe(elemento) {
    const eixo = (nome) =>
        Number.parseInt(elemento.style.getPropertyValue(nome), 10) || 0;

    return { x: eixo('--dx'), y: eixo('--dy') };
}

function aplica(elemento, posicao) {
    elemento.style.setProperty('--dx', `${posicao.x}px`);
    elemento.style.setProperty('--dy', `${posicao.y}px`);
}

function posicoes() {
    return bolinhas.map(posicaoDe);
}

function grava() {
    const atuais = posicoes();

    document.cookie = `bolinhas=${serializa(atuais)}; path=/; ` +
        `max-age=${UM_ANO_EM_SEGUNDOS}; samesite=lax`;

    botaoVoltar?.classList.toggle('oculto', naOrigem(atuais));
}

bolinhas.forEach((elemento) => {
    let inicial = null;
    let partida = null;
    let arrastou = false;

    // Ancora e nativamente arrastavel: sem isso o navegador comeca o seu
    // proprio drag de link e o nosso nunca recebe pointermove.
    elemento.addEventListener('dragstart', (evento) => evento.preventDefault());

    elemento.addEventListener('pointerdown', (evento) => {
        if (evento.button !== 0) return;

        inicial = posicaoDe(elemento);
        partida = { x: evento.clientX, y: evento.clientY };
        arrastou = false;
        elemento.setPointerCapture(evento.pointerId);
    });

    elemento.addEventListener('pointermove', (evento) => {
        if (!partida) return;

        const deslocamento = {
            x: evento.clientX - partida.x,
            y: evento.clientY - partida.y,
        };

        if (!arrastou) {
            if (!virouArrasto(deslocamento.x, deslocamento.y)) return;
            arrastou = true;
            elemento.classList.add('arrastando');
        }

        aplica(elemento, move(inicial, deslocamento, LIMITE_PX));
    });

    elemento.addEventListener('pointerup', () => {
        if (!partida) return;

        partida = null;
        elemento.classList.remove('arrastando');
        if (arrastou) grava();
    });

    elemento.addEventListener('pointercancel', () => {
        partida = null;
        elemento.classList.remove('arrastando');
    });

    // O clique vem depois do pointerup. Se houve arrasto, navegar seria o
    // oposto do que o usuario pediu.
    elemento.addEventListener('click', (evento) => {
        if (!arrastou) return;

        evento.preventDefault();
        arrastou = false;
    });
});

botaoVoltar?.addEventListener('click', () => {
    bolinhas.forEach((elemento) => aplica(elemento, { x: 0, y: 0 }));
    grava();
});
