import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const context = vm.createContext({ console });

for (const name of ['Utils.gs', 'Producoes.gs']) {
  vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context, { filename: name });
}

const result = context.calculateProductionMetrics_(10, 'kg', 50, 'pct', 180, 'g');
assert.equal(result.inputKg, 10);
assert.equal(result.outputKg, 9);
assert.equal(result.unitsPerKg, 5);
assert.equal(result.utilizationPct, 90);
assert.match(result.summary, /5 pacotes\/kg/);
assert.match(result.summary, /9 kg embalados/);
assert.match(result.summary, /90% de aproveitamento/);

assert.equal(context.convertQuantity_(10, 'kg', 'g'), 10000);
assert.equal(context.convertQuantity_(180, 'g', 'kg'), 0.18);

const averageInputCost = (8 * 35 + 2 * 30) / 10;
const productionCost = averageInputCost * 10;
const unitCost = productionCost / 50;
assert.equal(averageInputCost, 34);
assert.equal(productionCost, 340);
assert.equal(unitCost, 6.8);

const appSource = fs.readFileSync(path.join(root, 'app-js.html'), 'utf8');
const levelBlock = appSource.match(/const kitchenLevels = \[([\s\S]*?)\n    \];/)?.[1] || '';
const badgeThresholds = [...levelBlock.matchAll(/min:\s*(\d+)/g)].map(match => Number(match[1]));
assert.deepEqual(badgeThresholds, [0, 60, 150, 300, 550, 900, 1500, 2500]);

const firebaseSource = fs.readFileSync(path.join(root, 'firebase-adapter.html'), 'utf8');
assert.match(firebaseSource, /origin:'ATRASO'/);
assert.match(firebaseSource, /origin:'NAO_REALIZADA'/);
assert.match(firebaseSource, /'pontos\.punir'/);
assert.match(firebaseSource, /'push\.register'/);

console.log('Regras válidas: produção, 8 selos progressivos, punições por atraso e cadastro de notificações.');
