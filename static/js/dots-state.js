/**
 * Física das bolinhas: arremesso, rebote e repouso.
 *
 * A decisão de quando um ponteiro vira arrasto mora em `drag-state.js`,
 * compartilhada com a galeria.
 *
 * Sem DOM e sem cookie de propósito — é o que torna a física verificável no
 * runner do Node, sem navegador (ver tests/js/bolinhas.test.mjs).
 *
 * Posições em pixels de deslocamento a partir do lugar de origem.
 * Velocidades em pixels por milissegundo.
 */

/**
 * Faixa máxima de deslocamento. O mesmo número existe no backend
 * (LIMITE_ARRASTO_PX): é só a rede de segurança do cookie, porque o limite
 * real de cada tela é a caixa medida em tempo de execução.
 */
export const LIMITE_PX = 400;

/** Quadro de referência a 60Hz, em milissegundos. */
export const QUADRO_MS = 1000 / 60;

/** Fração da velocidade que sobrevive a cada quadro de referência. */
export const ATRITO = 0.94;

/** Fração da velocidade que sobrevive a um rebote na parede. */
export const RESTITUICAO = 0.7;

/** Abaixo disso a bolinha para de vez e o loop de animação desliga. */
export const VELOCIDADE_DE_REPOUSO = 0.05;

/** Janela usada para medir o arremesso, em milissegundos. */
export const JANELA_DE_ARREMESSO_MS = 80;

export function limita(valor, limite = LIMITE_PX) {
    return Math.max(-limite, Math.min(limite, Math.round(valor)));
}

/** Nova posição a partir da inicial mais o deslocamento, já limitada. */
export function move(posicao, deslocamento, limite = LIMITE_PX) {
    return {
        x: limita(posicao.x + deslocamento.x, limite),
        y: limita(posicao.y + deslocamento.y, limite),
    };
}

/**
 * Prende a posição dentro da caixa. Usado ao carregar e ao redimensionar: uma
 * posição salva num desktop largo não pode jogar a bolinha para fora da tela
 * no celular, onde o link ficaria inalcançável.
 */
export function limitaNaCaixa(posicao, caixa) {
    return {
        x: Math.max(caixa.minX, Math.min(caixa.maxX, posicao.x)),
        y: Math.max(caixa.minY, Math.min(caixa.maxY, posicao.y)),
    };
}

export function emRepouso(estado) {
    return estado.vx === 0 && estado.vy === 0;
}

/**
 * Velocidade do arremesso a partir das amostras do ponteiro.
 *
 * Usa a janela final e não o último par de pontos: um tremor no fim do arrasto
 * daria arremesso torto. E amostras velhas são descartadas, senão arrastar,
 * parar com o dedo na tela e soltar arremessaria com a velocidade de antes da
 * parada.
 */
export function velocidadeDoArremesso(amostras, janela = JANELA_DE_ARREMESSO_MS) {
    if (amostras.length < 2) return { vx: 0, vy: 0 };

    const ultima = amostras[amostras.length - 1];
    const recentes = amostras.filter((amostra) => ultima.t - amostra.t <= janela);
    if (recentes.length < 2) return { vx: 0, vy: 0 };

    const primeira = recentes[0];
    const intervalo = ultima.t - primeira.t;
    if (intervalo <= 0) return { vx: 0, vy: 0 };

    return {
        vx: (ultima.x - primeira.x) / intervalo,
        vy: (ultima.y - primeira.y) / intervalo,
    };
}

/**
 * Um quadro de simulação: aplica atrito, anda, rebate nas paredes.
 *
 * O atrito é elevado a `dt / QUADRO_MS` para depender do tempo e não da taxa
 * de quadros — sem isso a bolinha pararia mais rápido numa tela de 120Hz que
 * numa de 60Hz.
 */
export function passo(estado, caixa, dt = QUADRO_MS) {
    const atrito = ATRITO ** (dt / QUADRO_MS);

    let vx = estado.vx * atrito;
    let vy = estado.vy * atrito;
    let x = estado.x + vx * dt;
    let y = estado.y + vy * dt;

    if (x <= caixa.minX) {
        x = caixa.minX;
        vx = Math.abs(vx) * RESTITUICAO;
    } else if (x >= caixa.maxX) {
        x = caixa.maxX;
        vx = -Math.abs(vx) * RESTITUICAO;
    }

    if (y <= caixa.minY) {
        y = caixa.minY;
        vy = Math.abs(vy) * RESTITUICAO;
    } else if (y >= caixa.maxY) {
        y = caixa.maxY;
        vy = -Math.abs(vy) * RESTITUICAO;
    }

    if (Math.hypot(vx, vy) < VELOCIDADE_DE_REPOUSO) {
        vx = 0;
        vy = 0;
    }

    return { x, y, vx, vy };
}

export function naOrigem(posicoes) {
    return posicoes.every((posicao) => posicao.x === 0 && posicao.y === 0);
}

/**
 * Separadores do cookie: "x_y|x_y". Não dá para usar ';' nem ',': em cabeçalho
 * HTTP o ';' separa cookies, e a RFC 6265 também exclui ',', '"', espaço e '\'
 * do valor — o navegador cortaria o valor no separador e a posição voltaria à
 * origem a cada carregamento. O backend espera exatamente este formato.
 */
export const SEPARADOR_DE_BOLINHAS = '|';
export const SEPARADOR_DE_EIXOS = '_';

export function serializa(posicoes) {
    return posicoes
        .map(({ x, y }) => `${x}${SEPARADOR_DE_EIXOS}${y}`)
        .join(SEPARADOR_DE_BOLINHAS);
}
