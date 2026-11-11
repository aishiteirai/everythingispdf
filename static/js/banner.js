/**
 * Banner da home: ladrilhos que giram com o ponteiro, o toque e a rolagem.
 *
 * Tudo que se mexe reage a algo. A única exceção é a vida própria — um
 * ladrilho por vez, de tempos em tempos — e ela pausa fora da tela, com a
 * aba oculta e para quem pediu menos movimento.
 */

import { criaGradeDeLadrilhos, movimentoReduzido } from './tile-grid.js';
import { criaPersiana } from './tiles.js';

/** Um ladrilho só gira de novo depois disso, senão o mouse parado treme. */
const INTERVALO_POR_LADRILHO_MS = 300;
const VIDA_PROPRIA_MS = 900;
const ATRASO_ENTRE_COLUNAS_MS = 22;

const banner = document.getElementById('banner');
const raiz = banner.querySelector('.grade-ladrilhos');
const grade = criaGradeDeLadrilhos(raiz);

function local(evento) {
    const caixa = raiz.getBoundingClientRect();
    return [evento.clientX - caixa.left, evento.clientY - caixa.top];
}

/* ----------------------------------------------------------------
   Passar por cima (mouse) e riscar com o dedo (toque)

   No toque não existe "passar por cima": só gira enquanto o dedo está na
   tela. O banner tem touch-action: pan-y, então deslizar na vertical
   continua rolando a página e só o gesto horizontal chega aqui.
   ---------------------------------------------------------------- */

let sobAgora = null;
let dedoNaTela = false;

banner.addEventListener('pointerdown', (evento) => {
    if (evento.pointerType !== 'mouse') dedoNaTela = true;
});

banner.addEventListener('pointermove', (evento) => {
    if (evento.pointerType !== 'mouse' && !dedoNaTela) return;

    const celula = grade.celulaEm(...local(evento));
    if (!celula || celula === sobAgora) return;
    sobAgora = celula;

    const agora = performance.now();
    if (agora - celula.ultimoGiroMs < INTERVALO_POR_LADRILHO_MS) return;

    celula.ultimoGiroMs = agora;
    grade.gira(celula);
});

const solta = () => {
    dedoNaTela = false;
    sobAgora = null;
};
['pointerup', 'pointercancel', 'pointerleave'].forEach((tipo) => {
    banner.addEventListener(tipo, solta);
});

/* ----------------------------------------------------------------
   Clique ou toque: onda a partir do ponto
   ---------------------------------------------------------------- */

banner.addEventListener('click', (evento) => grade.onda(...local(evento)));

/* ----------------------------------------------------------------
   Visibilidade: a persiana e a vida própria só rodam com o banner à vista
   ---------------------------------------------------------------- */

let visivel = true;
if (typeof IntersectionObserver !== 'undefined') {
    new IntersectionObserver(([entrada]) => {
        visivel = entrada.isIntersecting;
    }).observe(banner);
}

if (!movimentoReduzido()) {
    /* Rolar: as fileiras giram em cascata, como uma persiana. Descer gira
       num sentido e subir no outro. */
    const persiana = criaPersiana();
    let ultimaRolagem = window.scrollY;
    let fileira = 0;

    window.addEventListener('scroll', () => {
        const delta = window.scrollY - ultimaRolagem;
        ultimaRolagem = window.scrollY;
        if (!visivel) return;

        persiana.rola(delta).forEach((sentido) => {
            grade.fileira(fileira).forEach((celula, coluna) => {
                grade.gira(celula, sentido, coluna * ATRASO_ENTRE_COLUNAS_MS);
            });
            fileira = (fileira + 1) % grade.linhas();
        });
    }, { passive: true });

    /* Vida própria. */
    setInterval(() => {
        if (!visivel || document.hidden) return;

        const todas = grade.todas();
        grade.gira(todas[Math.floor(Math.random() * todas.length)]);
    }, VIDA_PROPRIA_MS);
}
