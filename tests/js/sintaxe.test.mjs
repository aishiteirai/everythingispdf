/**
 * Todo módulo de `static/js` precisa parsear.
 *
 * Os módulos de entrada — main.js, imgtopdf.js, bolinhas.js — não são
 * importados por nenhum outro teste, então um erro de sintaxe neles passaria
 * batido e a página quebraria em silêncio no navegador.
 *
 * `node --check` não serve: num arquivo ESM genuinamente quebrado ele devolve
 * zero. `import()` lança SyntaxError de verdade.
 *
 * Módulos que tocam DOM lançam ReferenceError no import, porque `document` não
 * existe no Node. Isso é esperado e significa que o arquivo parseou — só
 * SyntaxError reprova.
 */

import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const AQUI = dirname(fileURLToPath(import.meta.url));
const PASTA = join(AQUI, '..', '..', 'static', 'js');

const modulos = readdirSync(PASTA).filter((nome) => nome.endsWith('.js')).sort();

test('a pasta de modulos nao esta vazia', () => {
    assert.ok(modulos.length > 0, 'nenhum modulo encontrado em static/js');
});

for (const modulo of modulos) {
    test(`${modulo} parseia`, async () => {
        try {
            await import(pathToFileURL(join(PASTA, modulo)).href);
        } catch (erro) {
            assert.ok(
                !(erro instanceof SyntaxError),
                `${modulo} tem erro de sintaxe: ${erro.message}`,
            );
        }
    });
}
