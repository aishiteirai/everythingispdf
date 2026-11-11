/**
 * Grade de ladrilhos na tela. Usada pelo banner da home, pelo chão da prensa
 * e pelo bloco "+ SOLTE MAIS" da galeria.
 *
 * Só desenho e geometria de célula: quem decide quando girar é quem usa. O
 * sorteio e a matemática vêm de `tiles.js`, que tem teste.
 */

import { atrasoDaOnda, colunasDaGrade, marcacaoDoLadrilho, novoLadrilho } from './tiles.js';

const SVG = 'http://www.w3.org/2000/svg';

export function movimentoReduzido() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Preenche `raiz` com ladrilhos e se refaz quando ela muda de tamanho.
 *
 * - `chanceDeForma`: parte dos ladrilhos com forma (o resto é liso)
 * - `medida(largura) -> { colunas, tamanho }`: o padrão é o do banner, com 7
 *   colunas no celular e ladrilho de 56px no desktop
 *
 * Cada célula é `{ el, ladrilho, x, y, linha, coluna, ultimoGiroMs }`, com
 * `x` e `y` no centro, relativos a `raiz`.
 */
export function criaGradeDeLadrilhos(raiz, { chanceDeForma = 1, medida = colunasDaGrade } = {}) {
    let celulas = [];
    let colunas = 0;
    let linhas = 0;
    let tamanho = 0;
    let largura = -1;
    let altura = -1;
    const relogios = new Set();

    raiz.classList.add('grade-ladrilhos');

    function agenda(acao, atrasoMs) {
        if (!atrasoMs || movimentoReduzido()) {
            acao();
            return;
        }

        const relogio = setTimeout(() => {
            relogios.delete(relogio);
            acao();
        }, atrasoMs);
        relogios.add(relogio);
    }

    function desenha(celula) {
        // A marcação só leva cores e formas das constantes de tiles.js: nada
        // do usuário passa por aqui.
        celula.svg.innerHTML = marcacaoDoLadrilho(celula.ladrilho);
        celula.svg.style.transform = `rotate(${celula.ladrilho.rot}deg)`;
    }

    function novaCelula(indice) {
        const el = document.createElement('div');
        el.className = 'ladrilho';

        const svg = document.createElementNS(SVG, 'svg');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        el.append(svg);

        const coluna = indice % colunas;
        const linha = Math.floor(indice / colunas);
        const celula = {
            el,
            svg,
            ladrilho: novoLadrilho(Math.random, chanceDeForma),
            x: coluna * tamanho + tamanho / 2,
            y: linha * tamanho + tamanho / 2,
            linha,
            coluna,
            ultimoGiroMs: -Infinity,
        };
        desenha(celula);
        return celula;
    }

    function refaz() {
        relogios.forEach(clearTimeout);
        relogios.clear();

        largura = raiz.clientWidth;
        altura = raiz.clientHeight;
        ({ colunas, tamanho } = medida(largura));
        tamanho = Math.max(1, tamanho);
        linhas = Math.max(1, Math.ceil(altura / tamanho));

        raiz.style.gridTemplateColumns = `repeat(${colunas}, ${tamanho}px)`;
        raiz.style.gridTemplateRows = `repeat(${linhas}, ${tamanho}px)`;

        celulas = Array.from({ length: colunas * linhas }, (_, i) => novaCelula(i));
        raiz.replaceChildren(...celulas.map((celula) => celula.el));
    }

    function gira(celula, sentido = 1, atrasoMs = 0) {
        if (!celula) return;

        agenda(() => {
            celula.ladrilho = { ...celula.ladrilho, rot: celula.ladrilho.rot + 90 * sentido };
            celula.svg.style.transform = `rotate(${celula.ladrilho.rot}deg)`;
        }, atrasoMs);
    }

    /** Troca o desenho. Sem `rot`, mantém o giro atual: voltar ao zero
     *  faria o ladrilho desgirar na frente de quem olha. */
    function pinta(celula, ladrilho) {
        celula.ladrilho = { rot: celula.ladrilho.rot, ...ladrilho };
        desenha(celula);
    }

    refaz();

    // Girar o celular ou redimensionar a janela muda as colunas. Só refaz se
    // o tamanho mudou de fato: o observador também dispara na primeira vez.
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(() => {
            if (raiz.clientWidth !== largura || raiz.clientHeight !== altura) refaz();
        }).observe(raiz);
    }

    return {
        celulaEm(x, y) {
            const coluna = Math.floor(x / tamanho);
            const linha = Math.floor(y / tamanho);
            if (coluna < 0 || linha < 0 || coluna >= colunas || linha >= linhas) return null;

            return celulas[linha * colunas + coluna];
        },

        gira,

        /** Aplica `acao` em toda célula, com atraso proporcional à distância. */
        onda(x, y, acao = (celula) => gira(celula), msPorPx = 1.6) {
            celulas.forEach((celula) => {
                agenda(() => acao(celula), atrasoDaOnda(celula.x - x, celula.y - y, msPorPx));
            });
        },

        pinta,
        fileira: (indice) => celulas.filter((celula) => celula.linha === indice),
        linhas: () => linhas,
        todas: () => celulas.slice(),
        refaz,

        /** Cancela giros e ondas agendados. */
        para() {
            relogios.forEach(clearTimeout);
            relogios.clear();
        },
    };
}
