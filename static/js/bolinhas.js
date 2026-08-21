/**
 * Arrastar e arremessar as bolinhas do hub.
 *
 * Pointer events cobrem mouse e toque num caminho só, com limiar de arrasto
 * maior no toque. A posição de repouso vai para um cookie que o Flask lê e
 * renderiza em --dx e --dy no style do elemento, então a bolinha nasce onde
 * ficou em vez de saltar quando o JavaScript roda.
 *
 * Arrastar é enriquecimento: o link continua focável e ativável por teclado, e
 * mover a bolinha não muda a ordem de tabulação.
 */

import { tornaArrastavel } from './arraste.js';
import {
    VELOCIDADE_DE_REPOUSO,
    emRepouso,
    limitaNaCaixa,
    move,
    passo,
    serializa,
    velocidadeDoArremesso,
} from './bolinhas-estado.js';

const UM_ANO_EM_SEGUNDOS = 60 * 60 * 24 * 365;

/** Aba em segundo plano volta com um intervalo enorme: sem teto, a bolinha
 *  daria um salto de tela inteira no primeiro quadro. */
const INTERVALO_MAXIMO_MS = 48;

/** Amostras de ponteiro guardadas para medir o arremesso. */
const AMOSTRAS_MAXIMAS = 12;

const caixaDaTela = document.querySelector('.tela');
const semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)');

const bolinhas = [...document.querySelectorAll('[data-bolinha]')].map((elemento) => {
    const eixo = (nome) =>
        Number.parseInt(elemento.style.getPropertyValue(nome), 10) || 0;

    return { elemento, x: eixo('--dx'), y: eixo('--dy'), vx: 0, vy: 0, caixa: null };
});

function aplica(bolinha) {
    bolinha.elemento.style.setProperty('--dx', `${Math.round(bolinha.x)}px`);
    bolinha.elemento.style.setProperty('--dy', `${Math.round(bolinha.y)}px`);
}

/**
 * Limites do deslocamento desta bolinha dentro da tela, em pixels.
 *
 * O retângulo do elemento já inclui o deslocamento atual, então ele é
 * subtraído para achar o lugar de origem. Os limites são forçados a conter o
 * zero: numa tela mais estreita que a bolinha, o cálculo se inverteria e ela
 * ficaria presa fora do lugar.
 */
function mede(bolinha, telaMedida = null) {
    const tela = telaMedida ?? caixaDaTela.getBoundingClientRect();
    const atual = bolinha.elemento.getBoundingClientRect();
    const origemEsquerda = atual.left - bolinha.x;
    const origemTopo = atual.top - bolinha.y;

    return {
        minX: Math.min(tela.left - origemEsquerda, 0),
        maxX: Math.max(tela.right - (origemEsquerda + atual.width), 0),
        minY: Math.min(tela.top - origemTopo, 0),
        maxY: Math.max(tela.bottom - (origemTopo + atual.height), 0),
    };
}

function grava() {
    const posicoes = bolinhas.map(({ x, y }) => ({
        x: Math.round(x),
        y: Math.round(y),
    }));

    // Sem httpOnly de propósito: o servidor precisa ler e este arquivo precisa
    // escrever. Não guarda nada sensível — é onde a bolinha ficou.
    document.cookie = `bolinhas=${serializa(posicoes)}; path=/; ` +
        `max-age=${UM_ANO_EM_SEGUNDOS}; samesite=lax`;
}

/* ----------------------------------------------------------------
   Simulação
   ---------------------------------------------------------------- */

let animando = false;
let instanteAnterior = 0;

function quadro(instante) {
    const dt = Math.min(instante - instanteAnterior, INTERVALO_MAXIMO_MS);
    instanteAnterior = instante;

    let alguemSeMove = false;

    bolinhas.forEach((bolinha) => {
    let inicial = null;
    let amostras = [];

    // Aqui o arrasto comeca no primeiro movimento, sem exigir que o dedo
    // segure: no hub arrastar e a interacao principal e a pagina nao rola,
    // entao a espera que a galeria precisa pareceria travamento.
    tornaArrastavel(bolinha.elemento, {
        aoComecar: ({ evento }) => {
            // Pegar a bolinha no ar a para.
            bolinha.vx = 0;
            bolinha.vy = 0;
            bolinha.caixa = mede(bolinha);

            inicial = { x: bolinha.x, y: bolinha.y };
            amostras = [{ x: bolinha.x, y: bolinha.y, t: evento.timeStamp }];
        },

        aoMover: ({ dx, dy, evento }) => {
            const alvo = limitaNaCaixa(move(inicial, { x: dx, y: dy }), bolinha.caixa);
            bolinha.x = alvo.x;
            bolinha.y = alvo.y;
            aplica(bolinha);

            amostras.push({ x: alvo.x, y: alvo.y, t: evento.timeStamp });
            if (amostras.length > AMOSTRAS_MAXIMAS) amostras.shift();
        },

        aoSoltar: ({ cancelado }) => {
            if (cancelado) return;

            // Quem pediu menos movimento recebe a bolinha onde soltou, sem
            // inercia.
            if (semMovimento.matches) {
                grava();
                return;
            }

            const { vx, vy } = velocidadeDoArremesso(amostras);
            if (Math.hypot(vx, vy) < VELOCIDADE_DE_REPOUSO) {
                grava();
                return;
            }

            bolinha.vx = vx;
            bolinha.vy = vy;
            anima();
        },
    });
});

/* ----------------------------------------------------------------
   Responsivo
   ---------------------------------------------------------------- */

function reenquadra() {
    let mudou = false;

    // Uma medicao da tela para as duas bolinhas: getBoundingClientRect forca
    // recalculo de layout, e nao ha motivo para pagar isso duas vezes.
    const tela = caixaDaTela.getBoundingClientRect();

    bolinhas.forEach((bolinha) => {
        bolinha.caixa = mede(bolinha, tela);
        const dentro = limitaNaCaixa(bolinha, bolinha.caixa);

        if (dentro.x !== bolinha.x || dentro.y !== bolinha.y) {
            bolinha.x = dentro.x;
            bolinha.y = dentro.y;
            aplica(bolinha);
            mudou = true;
        }
    });

    if (mudou) grava();
}

/**
 * Reenquadra no maximo uma vez por quadro.
 *
 * `resize` dispara continuamente enquanto se arrasta a janela ou se gira o
 * aparelho, e cada passada forca recalculo de layout. Sem o freio, dezenas de
 * medicoes por segundo para um resultado que so importa no fim.
 */
let reenquadramentoPendente = false;

function agendaReenquadramento() {
    if (reenquadramentoPendente) return;

    reenquadramentoPendente = true;
    requestAnimationFrame(() => {
        reenquadramentoPendente = false;
        reenquadra();
    });
}

// Girar o celular ou redimensionar a janela muda a caixa. Sem reenquadrar, uma
// posicao salva numa tela larga deixa a bolinha fora da tela estreita e o link
// inalcancavel.
window.addEventListener('resize', agendaReenquadramento);
reenquadra();
