/**
 * Decisão de quando um toque vira arrasto. `node --test tests/js/`.
 *
 * É a parte difícil de unificar bolinhas e galeria: na galeria a página rola,
 * então arrastar um cartão é ambíguo entre reordenar e rolar. Segurar resolve
 * a ambiguidade, e a regra é pura — por isso mora aqui e não no módulo de DOM.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    ESPERA_NO_TOQUE_MS,
    LIMIAR_PX,
    LIMIAR_TOQUE_PX,
    decideInicio,
    limiarDe,
    virouArrasto,
} from '../../static/js/arraste-estado.js';

const mouse = (extra) => ({ tipo: 'mouse', dx: 0, dy: 0, decorridoMs: 0, ...extra });
const toque = (extra) => ({
    tipo: 'touch', dx: 0, dy: 0, decorridoMs: 0,
    esperaNoToqueMs: ESPERA_NO_TOQUE_MS, ...extra,
});

/* ---------------- limiar ---------------- */

test('toque tem limiar maior que ponteiro fino', () => {
    // Dedo treme mais que mouse: com o mesmo limiar, tocar para navegar
    // viraria arrasto e o link nunca abriria.
    assert.ok(LIMIAR_TOQUE_PX > LIMIAR_PX);
    assert.equal(limiarDe('touch'), LIMIAR_TOQUE_PX);
    assert.equal(limiarDe('mouse'), LIMIAR_PX);
    assert.equal(limiarDe(undefined), LIMIAR_PX);
});

test('o limiar mede a distancia, nao cada eixo', () => {
    // 5 e 5 dao 7.07: passa do limiar de 6 com cada eixo abaixo dele.
    assert.equal(virouArrasto(5, 5, LIMIAR_PX), true);
    assert.equal(virouArrasto(3, 3, LIMIAR_PX), false);
});

/* ---------------- mouse: limiar de distancia ---------------- */

test('mouse parado ainda e clique', () => {
    assert.equal(decideInicio(mouse()), 'esperar');
});

test('mouse que passa do limiar comeca a arrastar', () => {
    assert.equal(decideInicio(mouse({ dx: LIMIAR_PX + 1 })), 'arrastar');
});

test('mouse nao precisa segurar', () => {
    assert.equal(decideInicio(mouse({ dx: 40, decorridoMs: 0 })), 'arrastar');
});

/* ---------------- toque sem espera: igual ao mouse ---------------- */

test('toque sem espera configurada usa so o limiar', () => {
    const semEspera = { tipo: 'touch', dx: 30, dy: 0, decorridoMs: 0 };

    assert.equal(decideInicio(semEspera), 'arrastar');
});

/* ---------------- toque com espera: segurar ---------------- */

test('toque que desliza antes de segurar e rolagem, nao arrasto', () => {
    // Nao interferir e o ponto: a pagina precisa rolar normalmente.
    const decisao = decideInicio(toque({ dy: 40, decorridoMs: 80 }));

    assert.equal(decisao, 'desistir');
});

test('toque parado antes do tempo continua esperando', () => {
    assert.equal(decideInicio(toque({ decorridoMs: 100 })), 'esperar');
});

test('toque segurado o tempo todo comeca a arrastar', () => {
    assert.equal(
        decideInicio(toque({ decorridoMs: ESPERA_NO_TOQUE_MS + 1 })), 'arrastar'
    );
});

test('tremor pequeno nao cancela a espera', () => {
    // Dedo apoiado nunca fica imovel de verdade.
    const decisao = decideInicio(toque({ dx: 2, dy: 2, decorridoMs: 100 }));

    assert.equal(decisao, 'esperar');
});

test('depois de segurar, o movimento vale mesmo passando do limiar', () => {
    const decisao = decideInicio(
        toque({ dx: 100, dy: 100, decorridoMs: ESPERA_NO_TOQUE_MS + 50 })
    );

    assert.equal(decisao, 'arrastar');
});

test('a espera e curta o bastante para nao parecer travada', () => {
    assert.ok(ESPERA_NO_TOQUE_MS <= 400, `${ESPERA_NO_TOQUE_MS}ms e demais`);
    assert.ok(ESPERA_NO_TOQUE_MS >= 150, `${ESPERA_NO_TOQUE_MS}ms dispara sem querer`);
});
