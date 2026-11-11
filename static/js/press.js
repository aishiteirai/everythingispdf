/**
 * Cena da prensa: o arquivo vira forma, desliza com o upload, a prensa bate
 * enquanto o servidor converte e sai uma folha. Usada por /convert e pela
 * geração de /imgtopdf.
 *
 * Só desenho. Quem decide a ordem dos métodos é quem chama, seguindo
 * `transicao` de `press-state.js`. Tudo que vem do usuário — nome do
 * arquivo, mensagem — entra por textContent, nunca como HTML.
 *
 * Com movimento reduzido nada desliza, bate ou quica: cada método só aplica
 * o estado final.
 */

import { COR_DA_FORMA, posicaoNaEsteira } from './press-state.js';
import { criaGradeDeLadrilhos, movimentoReduzido } from './tile-grid.js';
import { CREME } from './tiles.js';

const SVG = 'http://www.w3.org/2000/svg';
const TINTA = '#000000';

const TAMANHO_DA_FORMA = 80;
const MARGEM_DA_ESTEIRA = 16;
/** Faixa do chão abaixo da forma, onde fica o rótulo. */
const ALTURA_DO_RODAPE = 40;
const ALTURA_DO_BLOCO = 90;
/** Quanto o bloco entra na forma ao bater: é o que a esmaga. */
const MORDIDA = 36;
const PANCADA_MS = 900;
const DESCIDA_MS = 250;

/* Desenho de cada forma num viewBox 80×80, por atributo. */
const DESENHOS = {
    quadrado: ['rect', { x: 2, y: 2, width: 76, height: 76 }],
    triangulo: ['polygon', { points: '40,2 78,78 2,78' }],
    circulo: ['circle', { cx: 40, cy: 40, r: 38 }],
    meio: ['path', { d: 'M2 78 A38 38 0 0 1 78 78Z' }],
};

function elemento(tag, classe, { oculto = true } = {}) {
    const el = document.createElement(tag);
    el.className = classe;
    if (oculto) el.setAttribute('aria-hidden', 'true');
    return el;
}

function desenhoDaForma(forma) {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 80 80');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.classList.add('prensa-forma');

    const [tag, atributos] = DESENHOS[forma] ?? DESENHOS.quadrado;
    const desenho = document.createElementNS(SVG, tag);
    Object.entries(atributos).forEach(([nome, valor]) => desenho.setAttribute(nome, String(valor)));
    desenho.setAttribute('fill', COR_DA_FORMA[forma] ?? COR_DA_FORMA.quadrado);
    svg.append(desenho);

    return svg;
}

export function criaPrensa(palco) {
    const chao = elemento('div', 'prensa-chao');
    const bloco = elemento('div', 'prensa-bloco');
    const folha = elemento('div', 'prensa-folha oculto');
    const marcaDaFolha = elemento('span', 'prensa-folha-marca');
    marcaDaFolha.textContent = 'PDF';
    folha.append(marcaDaFolha);

    // O convite é o nome acessível da área de soltar: fica legível para o
    // leitor de tela. O resto da cena é decoração.
    const convite = elemento('span', 'prensa-convite', { oculto: false });
    const conviteTitulo = elemento('strong', 'prensa-convite-titulo', { oculto: false });
    const conviteDica = elemento('small', 'prensa-convite-dica mono', { oculto: false });
    convite.append(conviteTitulo, conviteDica);

    const estado = elemento('span', 'prensa-estado mono');
    const rotulo = elemento('span', 'prensa-rotulo mono');

    palco.classList.add('prensa');
    palco.append(chao, bloco, folha, convite, estado, rotulo);

    const grade = criaGradeDeLadrilhos(chao, {
        chanceDeForma: 0.28,
        medida: (largura) => ({ colunas: Math.ceil(largura / 40), tamanho: 40 }),
    });

    let forma = null;
    const relogios = new Set();
    let pancadas = null;

    const calmo = movimentoReduzido;

    function depois(acao, ms) {
        if (calmo()) {
            acao();
            return;
        }
        const relogio = setTimeout(() => {
            relogios.delete(relogio);
            acao();
        }, ms);
        relogios.add(relogio);
    }

    function para() {
        relogios.forEach(clearTimeout);
        relogios.clear();
        if (pancadas !== null) clearInterval(pancadas);
        pancadas = null;
        grade.para();
    }

    const linhaDoChao = () => palco.clientHeight - ALTURA_DO_RODAPE;
    const centro = () => palco.clientWidth / 2;
    const fimDaEsteira = () => centro() - TAMANHO_DA_FORMA / 2;

    function recolhe() {
        bloco.style.transform = '';
    }

    function desce() {
        const fundo = linhaDoChao() - TAMANHO_DA_FORMA + MORDIDA;
        bloco.style.transform = `translateY(${fundo - ALTURA_DO_BLOCO}px)`;
    }

    function poeForma(x) {
        if (!forma) return;
        forma.style.left = `${x}px`;
        forma.style.top = `${linhaDoChao() - TAMANHO_DA_FORMA}px`;
    }

    function tiraForma() {
        forma?.remove();
        forma = null;
    }

    /** Reinicia uma animação de classe: tirar, forçar layout e pôr de novo. */
    function anima(alvo, classe) {
        if (!alvo || calmo()) return;
        alvo.classList.remove(classe);
        void alvo.getBoundingClientRect();
        alvo.classList.add(classe);
    }

    function pancada() {
        desce();
        depois(() => {
            anima(forma, 'esmaga');
            // Cada pancada solta um tremor no chão a partir do impacto.
            grade.onda(centro(), linhaDoChao(), (celula) => grade.gira(celula), 1.2);
            depois(recolhe, 120);
        }, DESCIDA_MS);
    }

    function mostraEstado(nome, texto) {
        palco.dataset.cena = nome;
        estado.textContent = texto;
    }

    return {
        espera(textoDoConvite = 'SOLTE AQUI') {
            para();
            tiraForma();
            grade.refaz();
            recolhe();
            folha.classList.add('oculto');
            folha.classList.remove('sobe');
            conviteTitulo.textContent = textoDoConvite;
            conviteDica.textContent = 'ou toque para escolher';
            convite.classList.remove('oculto');
            rotulo.textContent = '';
            mostraEstado('esperando', 'ESPERANDO');
        },

        chegou({ forma: tipo, rotulo: texto }) {
            para();
            tiraForma();
            grade.refaz();
            recolhe();
            folha.classList.add('oculto');
            folha.classList.remove('sobe');
            convite.classList.add('oculto');

            forma = desenhoDaForma(tipo);
            palco.append(forma);
            poeForma(MARGEM_DA_ESTEIRA);

            rotulo.textContent = texto;
            mostraEstado('enviando', 'ENVIANDO 0%');
        },

        progresso(pct) {
            poeForma(posicaoNaEsteira(pct, MARGEM_DA_ESTEIRA, fimDaEsteira()));
            mostraEstado('enviando', `ENVIANDO ${Math.round(pct)}%`);
        },

        /** Upload acabou: a forma já está debaixo da prensa, mesmo que o
         *  progresso tenha ido de 0% direto ao fim. */
        convertendo() {
            poeForma(fimDaEsteira());
            mostraEstado('convertendo', 'CONVERTENDO…');
            if (pancadas !== null) return;

            if (calmo()) {
                desce();
                return;
            }
            pancada();
            pancadas = setInterval(pancada, PANCADA_MS);
        },

        pronto(texto) {
            para();
            recolhe();
            if (forma) forma.style.transform = 'scale(1.6, .08)';

            // A última onda deixa o chão liso, e a folha sobe dele.
            grade.onda(centro(), linhaDoChao(), (celula) => {
                grade.pinta(celula, { fundo: CREME, cor: TINTA, forma: null });
            }, 1.6);

            depois(() => {
                tiraForma();
                folha.classList.remove('oculto');
                // Dois quadros: a folha precisa ser pintada embaixo antes de
                // a transição levar ela para cima.
                if (calmo()) folha.classList.add('sobe');
                else requestAnimationFrame(() => requestAnimationFrame(() => folha.classList.add('sobe')));
            }, 600);

            rotulo.textContent = texto;
            mostraEstado('pronto', 'PRONTO');
        },

        erro(texto) {
            para();
            recolhe();
            grade.onda(centro(), linhaDoChao(), (celula) => {
                grade.pinta(celula, { fundo: TINTA, cor: CREME, forma: null });
            }, 2);
            // A forma se debate e não achata.
            anima(forma, 'debate');

            rotulo.textContent = texto;
            mostraEstado('erro', 'ERRO');
        },

        para,
    };
}
