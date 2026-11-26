/**
 * Regressão dos cálculos de dimensionamento (CTOs, access points, rack, eventos).
 * test/fixtures/dimensionamento.json foi gerado rodando o código ORIGINAL (arquivo único)
 * com as mesmas entradas: a refatoração não pode mudar nenhum resultado.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as calc from '../web/src/portal/visitas/dimensionamento.js';
import { S } from '../web/src/portal/estado.js';

const { casos } = JSON.parse(fs.readFileSync(new URL('./fixtures/dimensionamento.json', import.meta.url), 'utf8'));

test(`${casos.length} casos de dimensionamento iguais aos do sistema original`, () => {
  S.cfg = {};
  for (const [i, c] of casos.entries()) {
    const args = JSON.parse(JSON.stringify(c.args));
    const out = JSON.parse(JSON.stringify(calc[c.fn](...args)));
    assert.deepEqual(out, c.out, `caso ${i}: ${c.fn}(${JSON.stringify(c.args).slice(0, 120)})`);
  }
});
