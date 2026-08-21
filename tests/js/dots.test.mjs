/**
 * Estado e física das bolinhas. `node --test tests/js/`, sem dependência.
 *
 * dots-state.js não toca DOM: rebote, atrito e repouso são verificáveis
 * aqui, sem navegador. É o único lugar onde a física é testada.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    ATRITO,
    LIMITE_PX,
    QUADRO_MS,
    RESTITUICAO,
    VELOCIDADE_DE_REPOUSO,
    emRepouso,
    limita,
    limitaNaCaixa,
    move,
    naOrigem,
    passo,
    serializa,
    velocidadeDoArremesso,
} from '../../static/js/dots-state.js';

const CAIXA = { minX: -100, maxX: 100, minY: -80, maxY: 80 };
const rapido = (extra) => ({ x: 0, y: 0, vx: 0, vy: 0, ...extra });

/* ----------------------------------------------------------------
   Arrasto
   ---------------------------------------------------------------- */

test('limita mantem o valor dentro da faixa', () => {
    assert.equal(limita(120), 120);
    assert.equal(limita(LIMITE_PX + 1000), LIMITE_PX);
    assert.equal(limita(-LIMITE_PX - 1000), -LIMITE_PX);
});

test('limita arredonda para inteiro', () => {
    // O backend converte o cookie com int(): um decimal invalidaria tudo e as
    // duas bolinhas voltariam para a origem.
    assert.equal(limita(12.4), 12);
    assert.equal(limita(12.6), 13);
});

test('move soma o deslocamento a posicao inicial', () => {
    assert.deepEqual(move({ x: 10, y: -5 }, { x: 30, y: 15 }), { x: 40, y: 10 });
});

/* ----------------------------------------------------------------
   Caixa
   ---------------------------------------------------------------- */

test('limitaNaCaixa prende a bolinha dentro dos limites', () => {
    assert.deepEqual(limitaNaCaixa({ x: 500, y: -500 }, CAIXA), { x: 100, y: -80 });
    assert.deepEqual(limitaNaCaixa({ x: 20, y: 10 }, CAIXA), { x: 20, y: 10 });
});

test('limitaNaCaixa serve para reenquadrar em tela menor', () => {
    // Posicao salva num desktop largo nao pode jogar a bolinha para fora da
    // tela no celular.
    const estreita = { minX: -20, maxX: 20, minY: -30, maxY: 30 };

    assert.deepEqual(limitaNaCaixa({ x: 380, y: 0 }, estreita), { x: 20, y: 0 });
});

/* ----------------------------------------------------------------
   Fisica
   ---------------------------------------------------------------- */

test('sem velocidade a bolinha nao anda', () => {
    const depois = passo(rapido({ x: 10, y: 10 }), CAIXA);

    assert.deepEqual([depois.x, depois.y], [10, 10]);
    assert.equal(emRepouso(depois), true);
});

test('anda na direcao da velocidade', () => {
    const depois = passo(rapido({ vx: 1, vy: -0.5 }), CAIXA, QUADRO_MS);

    assert.ok(depois.x > 0, 'deveria andar para a direita');
    assert.ok(depois.y < 0, 'deveria andar para cima');
});

test('o atrito reduz a velocidade a cada quadro', () => {
    const depois = passo(rapido({ vx: 2 }), CAIXA, QUADRO_MS);

    assert.ok(Math.abs(depois.vx) < 2);
    assert.ok(ATRITO < 1, 'atrito precisa ser menor que 1 para haver perda');
});

test('rebate na parede direita invertendo so o eixo x', () => {
    const depois = passo({ x: CAIXA.maxX, y: 0, vx: 2, vy: 1 }, CAIXA, QUADRO_MS);

    assert.ok(depois.vx < 0, 'vx deveria inverter');
    assert.ok(depois.vy > 0, 'vy nao deveria inverter');
    assert.equal(depois.x, CAIXA.maxX);
});

test('rebate na parede esquerda invertendo so o eixo x', () => {
    const depois = passo({ x: CAIXA.minX, y: 0, vx: -2, vy: 1 }, CAIXA, QUADRO_MS);

    assert.ok(depois.vx > 0);
    assert.ok(depois.vy > 0);
    assert.equal(depois.x, CAIXA.minX);
});

test('rebate no topo invertendo so o eixo y', () => {
    const depois = passo({ x: 0, y: CAIXA.minY, vx: 1, vy: -2 }, CAIXA, QUADRO_MS);

    assert.ok(depois.vy > 0);
    assert.ok(depois.vx > 0);
    assert.equal(depois.y, CAIXA.minY);
});

test('rebate na base invertendo so o eixo y', () => {
    const depois = passo({ x: 0, y: CAIXA.maxY, vx: 1, vy: 2 }, CAIXA, QUADRO_MS);

    assert.ok(depois.vy < 0);
    assert.equal(depois.y, CAIXA.maxY);
});

test('o rebote perde energia', () => {
    const antes = { x: CAIXA.maxX, y: 0, vx: 2, vy: 0 };

    const depois = passo(antes, CAIXA, QUADRO_MS);

    assert.ok(Math.abs(depois.vx) < Math.abs(antes.vx), 'deveria perder energia');
    assert.ok(RESTITUICAO < 1);
});

test('nunca sai da caixa, mesmo com velocidade absurda', () => {
    let estado = { x: 0, y: 0, vx: 500, vy: -500 };

    for (let quadro = 0; quadro < 200; quadro += 1) {
        estado = passo(estado, CAIXA, QUADRO_MS);
        assert.ok(estado.x >= CAIXA.minX && estado.x <= CAIXA.maxX, `x=${estado.x}`);
        assert.ok(estado.y >= CAIXA.minY && estado.y <= CAIXA.maxY, `y=${estado.y}`);
    }
});

test('converge para o repouso em numero finito de quadros', () => {
    // Trava o risco de alguem mexer no atrito e o loop de animacao virar
    // eterno, queimando bateria no celular.
    let estado = { x: 0, y: 0, vx: 8, vy: -6 };
    let quadros = 0;

    while (!emRepouso(estado) && quadros < 2000) {
        estado = passo(estado, CAIXA, QUADRO_MS);
        quadros += 1;
    }

    assert.equal(emRepouso(estado), true, `nao parou em ${quadros} quadros`);
    assert.ok(quadros < 600, `demorou ${quadros} quadros para parar`);
});

test('velocidade abaixo do limiar de repouso e zerada', () => {
    const depois = passo(rapido({ vx: VELOCIDADE_DE_REPOUSO / 4 }), CAIXA, QUADRO_MS);

    assert.equal(emRepouso(depois), true);
});

test('a distancia total nao depende da taxa de quadros', () => {
    // O atrito e por unidade de tempo, nao por quadro. Se fosse por quadro, a
    // bolinha andaria bem menos numa tela de 120Hz que numa de 60Hz. Um
    // quadro so nao revela isso -- a diferenca aparece na trajetoria inteira,
    // por isso o teste simula o mesmo tempo total nas duas taxas.
    const SEM_PAREDE = { minX: -1e9, maxX: 1e9, minY: -1e9, maxY: 1e9 };

    const percorre = (dt, quadros) => {
        let estado = { x: 0, y: 0, vx: 3, vy: 0 };
        for (let i = 0; i < quadros; i += 1) estado = passo(estado, SEM_PAREDE, dt);
        return estado.x;
    };

    const a60 = percorre(QUADRO_MS, 120);
    const a120 = percorre(QUADRO_MS / 2, 240);

    assert.ok(
        Math.abs(a60 - a120) / a60 < 0.02,
        `60Hz andou ${a60.toFixed(1)}px e 120Hz andou ${a120.toFixed(1)}px`,
    );
});

/* ----------------------------------------------------------------
   Arremesso
   ---------------------------------------------------------------- */

test('velocidade do arremesso vem das amostras recentes', () => {
    const amostras = [
        { x: 0, y: 0, t: 0 },
        { x: 10, y: 0, t: 10 },
        { x: 20, y: 0, t: 20 },
    ];

    const velocidade = velocidadeDoArremesso(amostras);

    assert.ok(Math.abs(velocidade.vx - 1) < 0.01, `vx=${velocidade.vx}`);
    assert.equal(velocidade.vy, 0);
});

test('uma amostra so nao gera arremesso', () => {
    assert.deepEqual(velocidadeDoArremesso([{ x: 0, y: 0, t: 0 }]), { vx: 0, vy: 0 });
    assert.deepEqual(velocidadeDoArremesso([]), { vx: 0, vy: 0 });
});

test('amostras velhas nao contam', () => {
    // Arrastar, parar com o dedo na tela e soltar tem que largar a bolinha
    // parada -- nao arremessar com a velocidade de dois segundos atras.
    const amostras = [
        { x: 0, y: 0, t: 0 },
        { x: 300, y: 0, t: 20 },
        { x: 300, y: 0, t: 900 },
    ];

    const velocidade = velocidadeDoArremesso(amostras);

    assert.equal(velocidade.vx, 0, 'nao deveria arremessar');
});

/* ----------------------------------------------------------------
   Cookie
   ---------------------------------------------------------------- */

test('naOrigem so e verdade quando todas estao no lugar', () => {
    assert.equal(naOrigem([{ x: 0, y: 0 }, { x: 0, y: 0 }]), true);
    assert.equal(naOrigem([{ x: 0, y: 0 }, { x: 1, y: 0 }]), false);
});

test('serializa no formato que o backend espera', () => {
    assert.equal(serializa([{ x: 80, y: -12 }, { x: 0, y: 40 }]), '80_-12|0_40');
});

test('o formato nao usa caractere proibido em valor de cookie', () => {
    const serializado = serializa([{ x: 80, y: -12 }, { x: 0, y: 40 }]);

    for (const proibido of [';', ',', '"', ' ', '\\']) {
        assert.equal(serializado.includes(proibido), false, `usa ${proibido}`);
    }
});

test('serializa nunca emite decimal', () => {
    const posicoes = [
        move({ x: 0, y: 0 }, { x: 12.4, y: -7.6 }),
        move({ x: 0, y: 0 }, { x: 0.5, y: 0 }),
    ];

    assert.match(serializa(posicoes), /^-?\d+_-?\d+\|-?\d+_-?\d+$/);
});
