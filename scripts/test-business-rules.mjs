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

console.log('Regras válidas: rendimento 10 kg → 50 pacotes de 180 g e custo médio R$ 6,80/pacote.');
