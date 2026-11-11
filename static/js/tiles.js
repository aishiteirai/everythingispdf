/**
 * Regra dos ladrilhos: sorteio, desenho e a geometria dos gestos.
 *
 * O ladrilho é a unidade visual do site — banner, chão da prensa, "solte
 * mais". Sem DOM de propósito: o sorteio e a matemática da onda e da
 * persiana ficam testáveis em `node --test` (ver tests/js/tiles.test.mjs).
 * Quem põe na tela é `tile-grid.js`.
 */

export const CREME = '#fffef9';

/** Cores de forma. Creme fica de fora: é o fundo, não a forma. */
export const CORES = ['#e8452c', '#f2b705', '#2453d6', '#000000'];

export const FORMAS = ['cheio', 'circulo', 'quarto', 'meio', 'triangulo', 'metade', 'anel'];

/** Parte dos ladrilhos com fundo creme; o resto é cor chapada. */
const CHANCE_DE_CREME = 0.7;

/** Ladrilho grande o bastante para o dedo, no celular. */
const COLUNAS_NO_CELULAR = 7;
const LARGURA_DO_CELULAR = 600;
const TAMANHO_NO_DESKTOP = 56;

const sorteia = (lista, aleatorio) =>
    lista[Math.min(lista.length - 1, Math.floor(aleatorio() * lista.length))];

/**
 * Sorteia um ladrilho. `aleatorio` é injetável para o teste; `chanceDeForma`
 * abaixo de 1 deixa parte dos ladrilhos lisos (o chão da prensa usa 0,28).
 *
 * A cor da forma nunca repete o fundo: forma da cor do fundo some.
 */
export function novoLadrilho(aleatorio = Math.random, chanceDeForma = 1) {
    const fundo = aleatorio() < CHANCE_DE_CREME ? CREME : sorteia(CORES, aleatorio);
    const cor = sorteia(CORES.filter((c) => c !== fundo), aleatorio);
    const forma = aleatorio() < chanceDeForma ? sorteia(FORMAS, aleatorio) : null;
    const rot = 90 * Math.floor(aleatorio() * 4) % 360;

    return { fundo, cor, forma, rot };
}

/*
 * Desenhos no espaço 0..100. Só recebem cores das constantes acima: nada que
 * venha do usuário chega aqui, então montar a marcação em texto é seguro.
 */
const DESENHOS = {
    cheio: (c) => `<rect width="100" height="100" fill="${c}"/>`,
    circulo: (c) => `<circle cx="50" cy="50" r="42" fill="${c}"/>`,
    quarto: (c) => `<path d="M0 100 A100 100 0 0 1 100 0 L100 100Z" fill="${c}"/>`,
    meio: (c) => `<path d="M0 50 A50 50 0 0 0 100 50Z" fill="${c}"/>`,
    triangulo: (c) => `<polygon points="0,100 100,100 100,0" fill="${c}"/>`,
    metade: (c) => `<rect width="50" height="100" fill="${c}"/>`,
    anel: (c) => `<circle cx="50" cy="50" r="42" fill="none" stroke="${c}" stroke-width="14"/>`,
};

/** Miolo de um `<svg viewBox="0 0 100 100">`: o fundo e, se houver, a forma. */
export function marcacaoDoLadrilho({ fundo, cor, forma }) {
    const base = `<rect width="100" height="100" fill="${fundo}"/>`;
    const desenho = DESENHOS[forma];

    return desenho ? base + desenho(cor) : base;
}

/**
 * Quantas colunas e de que tamanho. No celular são sempre 7, para o
 * ladrilho caber o dedo; no desktop o ladrilho é fixo e as colunas cobrem a
 * largura (a última pode sobrar para fora e é cortada pelo contêiner).
 */
export function colunasDaGrade(largura) {
    if (largura < LARGURA_DO_CELULAR) {
        return { colunas: COLUNAS_NO_CELULAR, tamanho: Math.floor(largura / COLUNAS_NO_CELULAR) };
    }

    return { colunas: Math.ceil(largura / TAMANHO_NO_DESKTOP), tamanho: TAMANHO_NO_DESKTOP };
}

/** Atraso de cada ladrilho numa onda: proporcional à distância do ponto. */
export function atrasoDaOnda(dx, dy, msPorPx = 1.6) {
    return Math.hypot(dx, dy) * msPorPx;
}

/**
 * Persiana: a cada `passoPx` rolados, uma fileira gira. Devolve o sentido de
 * cada fileira que deve girar agora (1 descendo, -1 subindo) e guarda o
 * resto, para rolagem lenta também chegar lá.
 */
export function criaPersiana(passoPx = 28) {
    let acumulado = 0;

    return {
        rola(delta) {
            acumulado += delta;
            const giros = [];

            while (Math.abs(acumulado) >= passoPx) {
                const sentido = Math.sign(acumulado);
                acumulado -= passoPx * sentido;
                giros.push(sentido);
            }

            return giros;
        },
    };
}
