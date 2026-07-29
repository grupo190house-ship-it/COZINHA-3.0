/**
 * Transformação direta de um insumo em um produto produzido.
 * A produção é aberta com o insumo previsto e finalizada após a apuração
 * da quantidade produzida. A movimentação de estoque acontece na finalização.
 */
function listProductions_(params) {
  params = params || {};
  var inputs = {};
  var products = {};
  var operators = {};
  var itemsByProduction = {};
  listRows_('INSUMOS', { includeInactive: true }).forEach(function(row) { inputs[row.ID] = row; });
  listRows_('PRODUTOS', { includeInactive: true }).forEach(function(row) { products[row.ID] = row; });
  listRows_('OPERADORES', { includeInactive: true }).forEach(function(row) { operators[row.ID] = row; });
  listRows_('USUARIOS', { includeInactive: true }).forEach(function(row) { operators[row.ID] = row; });
  listRows_('PRODUCAO_ITENS', { includeInactive: true }).forEach(function(item) {
    if (!itemsByProduction[item.PRODUCAO_ID]) itemsByProduction[item.PRODUCAO_ID] = {};
    if (!itemsByProduction[item.PRODUCAO_ID][item.INSUMO_ID]) {
      itemsByProduction[item.PRODUCAO_ID][item.INSUMO_ID] = { planned: 0, consumed: 0 };
    }
    itemsByProduction[item.PRODUCAO_ID][item.INSUMO_ID].planned = Math.max(
      itemsByProduction[item.PRODUCAO_ID][item.INSUMO_ID].planned,
      asNumber_(item.QTD_PREVISTA)
    );
    itemsByProduction[item.PRODUCAO_ID][item.INSUMO_ID].consumed += asNumber_(item.QTD_CONSUMIDA);
  });
  var rows = listRows_('PRODUCOES', { includeInactive: true });
  if (params.status) rows = rows.filter(function(row) { return row.STATUS === params.status; });
  if (params.from) rows = rows.filter(function(row) { return String(row.CRIADO_EM) >= String(params.from); });
  if (params.to) rows = rows.filter(function(row) { return String(row.CRIADO_EM) <= String(params.to) + 'T23:59:59'; });
  rows.forEach(function(row) {
    var consumed = itemsByProduction[row.ID] || {};
    var inputIds = Object.keys(consumed);
    var summaries = inputIds.map(function(inputId) {
      var input = inputs[inputId] || {};
      var quantities = consumed[inputId] || {};
      return {
        name: input.NOME || 'Insumo não encontrado',
        quantity: round_(asNumber_(quantities.consumed) > 0 ? quantities.consumed : quantities.planned, 4),
        planned: round_(quantities.planned, 4),
        consumed: round_(quantities.consumed, 4),
        unit: input.UNIDADE || '',
        unitCost: getItemReferenceUnitCost_('INSUMO', inputId)
      };
    });
    var product = products[row.PRODUTO_ID] || {};
    row.PRODUTO_NOME = product.NOME || '';
    row.UNIDADE_PRODUTO = product.UNIDADE || '';
    row.PESO_UNITARIO_PRODUTO = asNumber_(row.PESO_UNITARIO_PRODUTO) > 0
      ? asNumber_(row.PESO_UNITARIO_PRODUTO)
      : asNumber_(product.PESO_UNITARIO);
    row.UNIDADE_PESO_PRODUTO = row.UNIDADE_PESO_PRODUTO || product.UNIDADE_PESO || '';
    row.OPERADOR_NOME = operators[row.OPERADOR_ID] ? operators[row.OPERADOR_ID].NOME : '';
    row.INSUMO_NOME = summaries.map(function(item) { return item.name; }).join(', ');
    row.QTD_INSUMO = summaries.length === 1 ? summaries[0].quantity : '';
    row.UNIDADE_INSUMO = summaries.length === 1 ? summaries[0].unit : '';
    row.CONSUMO_INSUMO = summaries.map(function(item) {
      return item.quantity + (item.unit ? ' ' + item.unit : '');
    }).join(' + ');
    row.CUSTO_ESTIMADO_INSUMOS = round_(summaries.reduce(function(sum, item) {
      return sum + item.quantity * item.unitCost;
    }, 0), 4);
    row.CUSTO_UNITARIO_PRODUZIDO = asNumber_(row.QTD_PRODUZIDA) > 0
      ? round_(asNumber_(row.CUSTO_TOTAL) / asNumber_(row.QTD_PRODUZIDA), 4)
      : 0;
    row.RENDIMENTO_INSUMO = '';
    row.RENDIMENTO_RESUMO = '';
    if (row.STATUS === 'Finalizada' && summaries.length === 1 && summaries[0].quantity > 0) {
      var metrics = calculateProductionMetrics_(
        summaries[0].quantity,
        summaries[0].unit,
        row.QTD_PRODUZIDA,
        row.UNIDADE_PRODUTO,
        row.PESO_UNITARIO_PRODUTO,
        row.UNIDADE_PESO_PRODUTO
      );
      row.RENDIMENTO_INSUMO = metrics.genericYield;
      row.PESO_TOTAL_PRODUZIDO_KG = asNumber_(row.PESO_TOTAL_PRODUZIDO_KG) > 0
        ? asNumber_(row.PESO_TOTAL_PRODUZIDO_KG)
        : metrics.outputKg;
      row.RENDIMENTO_PACOTES_KG = asNumber_(row.RENDIMENTO_PACOTES_KG) > 0
        ? asNumber_(row.RENDIMENTO_PACOTES_KG)
        : metrics.unitsPerKg;
      row.APROVEITAMENTO_PCT = asNumber_(row.APROVEITAMENTO_PCT) > 0
        ? asNumber_(row.APROVEITAMENTO_PCT)
        : metrics.utilizationPct;
      row.RENDIMENTO_RESUMO = metrics.summary;
    }
  });
  return rows.sort(function(a, b) { return String(b.CRIADO_EM).localeCompare(String(a.CRIADO_EM)); });
}

function massQuantityToKg_(quantity, unit) {
  var normalized = String(unit || '').trim().toLowerCase();
  if (normalized === 'kg') return asNumber_(quantity);
  if (normalized === 'g') return asNumber_(quantity) / 1000;
  return 0;
}

function productionUnitLabel_(unit) {
  var normalized = String(unit || '').trim().toLowerCase();
  if (normalized === 'pct') return 'pacotes';
  if (normalized === 'un') return 'unidades';
  if (normalized === 'porção' || normalized === 'porcao') return 'porções';
  return unit || 'unidades';
}

function calculateProductionMetrics_(inputQuantity, inputUnit, outputQuantity, outputUnit, unitWeight, weightUnit) {
  var input = asNumber_(inputQuantity);
  var output = asNumber_(outputQuantity);
  var inputKg = massQuantityToKg_(input, inputUnit);
  var directOutputKg = massQuantityToKg_(output, outputUnit);
  var packageWeightKg = massQuantityToKg_(unitWeight, weightUnit);
  var outputKg = directOutputKg > 0 ? directOutputKg : (packageWeightKg > 0 ? output * packageWeightKg : 0);
  var isPackagedUnit = directOutputKg <= 0;
  var unitsPerKg = inputKg > 0 && isPackagedUnit ? round_(output / inputKg, 4) : 0;
  var utilizationPct = inputKg > 0 && outputKg > 0 ? round_(outputKg / inputKg * 100, 2) : 0;
  var genericYield = input > 0 ? round_(output / input, 4) : 0;
  var summary = '';
  if (inputKg > 0 && isPackagedUnit) {
    summary = round_(unitsPerKg, 2) + ' ' + productionUnitLabel_(outputUnit) + '/kg';
    if (outputKg > 0) {
      summary += ' · ' + round_(outputKg, 3) + ' kg embalados · ' + utilizationPct + '% de aproveitamento';
    }
  } else if (inputKg > 0 && outputKg > 0) {
    summary = utilizationPct + '% de aproveitamento · ' + round_(outputKg, 3) + ' kg produzidos';
  } else if (String(outputUnit || '').toLowerCase() === String(inputUnit || '').toLowerCase()) {
    summary = round_(genericYield * 100, 2) + '%';
  } else {
    summary = round_(genericYield, 4) + ' ' + (outputUnit || 'unidade produzida') +
      ' por ' + (inputUnit || 'unidade de insumo');
  }
  return {
    inputKg: round_(inputKg, 4),
    outputKg: round_(outputKg, 4),
    unitsPerKg: unitsPerKg,
    utilizationPct: utilizationPct,
    genericYield: genericYield,
    summary: summary
  };
}

function startProduction_(data, user) {
  data = sanitizeObject_(data || {});
  requireFields_(data, ['INSUMO_ID', 'QUANTIDADE_INSUMO', 'PRODUTO_ID', 'DATA_PRODUCAO', 'OPERADOR_ID']);
  var input = findById_('INSUMOS', data.INSUMO_ID);
  var product = findById_('PRODUTOS', data.PRODUTO_ID);
  if (!input) throw new Error('O insumo de origem não foi encontrado ou está inativo.');
  if (!product) throw new Error('O produto produzido não foi encontrado ou está inativo.');
  var plannedInputQuantity = asNumber_(data.QUANTIDADE_INSUMO);
  if (plannedInputQuantity <= 0) throw new Error('A quantidade separada para a produção deve ser maior que zero.');
  var productionDate = dateValue_(data.DATA_PRODUCAO);
  if (!productionDate) throw new Error('Informe uma data de produção válida.');
  if (productionDate.getTime() > dateValue_(todayIso_()).getTime()) throw new Error('A produção não pode ter uma data futura.');
  var productionTimestamp = Utilities.formatDate(productionDate, APP_CONFIG.TIMEZONE, "yyyy-MM-dd'T'12:00:00");
  var balance = getStockBalance_('INSUMO', input.ID);
  if (balance + 0.00001 < plannedInputQuantity) {
    throw new Error('Estoque insuficiente de ' + input.NOME + '. Disponível: ' + balance + '; separado: ' + plannedInputQuantity + '.');
  }

  var production;
  withLock_(function() {
    production = insertRow_('PRODUCOES', {
      CODIGO: generateCode_('PRD'),
      PRODUTO_ID: product.ID,
      RECEITA_ID: '',
      QTD_PLANEJADA: 0,
      QTD_PRODUZIDA: 0,
      QTD_PERDIDA: 0,
      LOTE: sanitizeText_(data.LOTE || generateCode_('LOTE'), 80),
      OPERADOR_ID: data.OPERADOR_ID,
      HORA_INICIO: productionTimestamp,
      HORA_FIM: '',
      TEMPO_MIN: 0,
      OBSERVACOES: sanitizeText_(data.OBSERVACOES, 2000),
      STATUS: 'Em produção',
      CUSTO_TOTAL: 0,
      CRIADO_EM: productionTimestamp,
      PESO_UNITARIO_PRODUTO: asNumber_(product.PESO_UNITARIO),
      UNIDADE_PESO_PRODUTO: product.UNIDADE_PESO || '',
      PESO_TOTAL_PRODUZIDO_KG: 0,
      RENDIMENTO_PACOTES_KG: 0,
      APROVEITAMENTO_PCT: 0
    });
    insertRow_('PRODUCAO_ITENS', {
      PRODUCAO_ID: production.ID,
      INSUMO_ID: input.ID,
      LOTE_ID: '',
      QTD_PREVISTA: plannedInputQuantity,
      QTD_CONSUMIDA: 0,
      CUSTO_UNITARIO: 0,
      CUSTO_TOTAL: 0,
      CRIADO_EM: productionTimestamp
    });
  });
  audit_(
    'Início de produção',
    user,
    'Produção',
    'PRODUCOES',
    production.ID,
    null,
    production,
    plannedInputQuantity + ' ' + input.UNIDADE + ' de ' + input.NOME + ' separado para produzir ' + product.NOME
  );
  return production;
}

function finishProduction_(data, user) {
  data = sanitizeObject_(data || {});
  requireFields_(data, ['ID', 'QUANTIDADE_PRODUZIDA']);
  var before = findById_('PRODUCOES', data.ID, true);
  if (!before || before.STATUS !== 'Em produção') throw new Error('Produção não encontrada ou já finalizada.');
  var produced = asNumber_(data.QUANTIDADE_PRODUZIDA);
  var lost = Math.max(0, asNumber_(data.QUANTIDADE_PERDIDA));
  if (produced <= 0) throw new Error('A quantidade produzida deve ser maior que zero.');
  var product = findById_('PRODUTOS', before.PRODUTO_ID);
  if (!product) throw new Error('Produto final não encontrado.');
  var plannedItems = listRows_('PRODUCAO_ITENS', { filter: { PRODUCAO_ID: before.ID } });
  if (!plannedItems.length) throw new Error('O insumo separado para esta produção não foi encontrado.');
  var finishedAt = new Date();
  var startedAt = new Date(before.HORA_INICIO);
  var minutes = Math.max(0, Math.round((finishedAt.getTime() - startedAt.getTime()) / 60000));
  var after;
  var totalCost = 0;
  var primaryPlannedItem = plannedItems[0] || {};
  var primaryInput = findById_('INSUMOS', primaryPlannedItem.INSUMO_ID, true) || {};
  var primaryInputQuantity = plannedItems.filter(function(item) {
    return String(item.INSUMO_ID) === String(primaryPlannedItem.INSUMO_ID);
  }).reduce(function(maximum, item) {
    return Math.max(maximum, asNumber_(item.QTD_PREVISTA));
  }, 0);
  var productionMetrics = calculateProductionMetrics_(
    primaryInputQuantity,
    primaryInput.UNIDADE,
    produced,
    product.UNIDADE,
    asNumber_(before.PESO_UNITARIO_PRODUTO || product.PESO_UNITARIO),
    before.UNIDADE_PESO_PRODUTO || product.UNIDADE_PESO
  );
  withLock_(function() {
    var current = findById_('PRODUCOES', before.ID, true);
    if (!current || current.STATUS !== 'Em produção') throw new Error('A produção foi alterada por outra operação.');
    before = current;
    plannedItems = listRows_('PRODUCAO_ITENS', { filter: { PRODUCAO_ID: before.ID } });
    var grouped = {};
    plannedItems.forEach(function(item) {
      if (!grouped[item.INSUMO_ID]) grouped[item.INSUMO_ID] = { rows: [], planned: 0, consumed: 0, cost: 0 };
      grouped[item.INSUMO_ID].rows.push(item);
      grouped[item.INSUMO_ID].planned = Math.max(grouped[item.INSUMO_ID].planned, asNumber_(item.QTD_PREVISTA));
      grouped[item.INSUMO_ID].consumed += asNumber_(item.QTD_CONSUMIDA);
      grouped[item.INSUMO_ID].cost += asNumber_(item.CUSTO_TOTAL);
    });
    Object.keys(grouped).forEach(function(inputId) {
      var group = grouped[inputId];
      if (group.consumed > 0) {
        totalCost += group.cost;
        return;
      }
      if (group.planned <= 0) throw new Error('Quantidade de insumo inválida nesta produção.');
      var input = findById_('INSUMOS', inputId, true) || {};
      var available = getStockBalance_('INSUMO', inputId);
      if (available + 0.00001 < group.planned) {
        throw new Error('Estoque insuficiente de ' + (input.NOME || 'insumo') + '. Disponível: ' + available + '; necessário: ' + group.planned + '.');
      }
      var averageInputCost = getItemReferenceUnitCost_('INSUMO', inputId);
      var consumption = consumeStockFifo_('INSUMO', inputId, group.planned, {
        movementType: 'SAIDA_PRODUCAO',
        referenceType: 'PRODUCAO',
        referenceId: before.ID,
        operatorId: before.OPERADOR_ID,
        justification: 'Insumo consumido na produção ' + before.CODIGO
      });
      var productionUnitCost = averageInputCost > 0
        ? averageInputCost
        : (group.planned > 0 ? consumption.totalCost / group.planned : 0);
      totalCost += round_(group.planned * productionUnitCost, 4);
      consumption.consumed.forEach(function(lot, index) {
        var record = {
          PRODUCAO_ID: before.ID,
          INSUMO_ID: inputId,
          LOTE_ID: lot.lotId,
          QTD_PREVISTA: group.planned,
          QTD_CONSUMIDA: lot.quantity,
          CUSTO_UNITARIO: round_(productionUnitCost, 4),
          CUSTO_TOTAL: round_(lot.quantity * productionUnitCost, 4)
        };
        if (index === 0) updateRow_('PRODUCAO_ITENS', group.rows[0].ID, record);
        else insertRow_('PRODUCAO_ITENS', record);
      });
    });
    var allocatedUnitCost = produced > 0 ? totalCost / produced : 0;
    addStockLot_('PRODUTO', {
      itemId: product.ID,
      lot: before.LOTE,
      quantity: produced,
      unitCost: allocatedUnitCost,
      location: '',
      referenceType: 'PRODUCAO',
      referenceId: before.ID,
      operatorId: before.OPERADOR_ID,
      justification: 'Entrada automática da produção finalizada'
    });
    var productLots = listRows_('ESTOQUE_PRODUTOS').filter(function(lot) {
      return String(lot.PRODUTO_ID) === String(product.ID) && asNumber_(lot.QUANTIDADE_ATUAL) > 0;
    });
    var productStockQuantity = productLots.reduce(function(sum, lot) {
      return sum + asNumber_(lot.QUANTIDADE_ATUAL);
    }, 0);
    var productStockValue = productLots.reduce(function(sum, lot) {
      return sum + asNumber_(lot.QUANTIDADE_ATUAL) * asNumber_(lot.CUSTO_UNITARIO);
    }, 0);
    var averageProductCost = productStockQuantity > 0 ? round_(productStockValue / productStockQuantity, 4) : round_(allocatedUnitCost, 4);
    updateRow_('PRODUTOS', product.ID, {
      CUSTO: averageProductCost,
      MARGEM: asNumber_(product.PRECO_VENDA) > 0
        ? round_((asNumber_(product.PRECO_VENDA) - averageProductCost) / asNumber_(product.PRECO_VENDA) * 100, 2)
        : 0
    });
    after = updateRow_('PRODUCOES', before.ID, {
      QTD_PLANEJADA: produced,
      QTD_PRODUZIDA: produced,
      QTD_PERDIDA: lost,
      HORA_FIM: nowIso_(),
      TEMPO_MIN: minutes,
      OBSERVACOES: sanitizeText_(data.OBSERVACOES || before.OBSERVACOES, 2000),
      STATUS: 'Finalizada',
      CUSTO_TOTAL: round_(totalCost, 4),
      PESO_UNITARIO_PRODUTO: asNumber_(before.PESO_UNITARIO_PRODUTO || product.PESO_UNITARIO),
      UNIDADE_PESO_PRODUTO: before.UNIDADE_PESO_PRODUTO || product.UNIDADE_PESO || '',
      PESO_TOTAL_PRODUZIDO_KG: productionMetrics.outputKg,
      RENDIMENTO_PACOTES_KG: productionMetrics.unitsPerKg,
      APROVEITAMENTO_PCT: productionMetrics.utilizationPct
    });
    if (lost > 0) {
      insertRow_('PERDAS', {
        TIPO_ESTOQUE: 'PRODUTO',
        ITEM_ID: product.ID,
        QUANTIDADE: lost,
        MOTIVO: 'Perda registrada na finalização da produção',
        CATEGORIA: data.CATEGORIA_PERDA || 'Sobras',
        OPERADOR_ID: before.OPERADOR_ID,
        SUPERVISOR_ID: user.ID,
        DATA_HORA: nowIso_(),
        CUSTO: round_(lost * allocatedUnitCost, 2),
        STATUS: 'Ativo',
        CUSTO_UNITARIO: round_(allocatedUnitCost, 4),
        UNIDADE: product.UNIDADE || ''
      });
    }
  });
  audit_('Finalização de produção', user, 'Produção', 'PRODUCOES', before.ID, before, after, 'Insumo baixado e produto produzido incluído no estoque');
  refreshAutomaticPurchaseList_(user);
  return after;
}

function cancelProduction_(data, user) {
  data = sanitizeObject_(data || {});
  requireFields_(data, ['id', 'justification']);
  var before = findById_('PRODUCOES', data.id, true);
  if (!before || before.STATUS !== 'Em produção') throw new Error('Somente produções em andamento podem ser canceladas.');
  var productionItems = listRows_('PRODUCAO_ITENS', { filter: { PRODUCAO_ID: before.ID } });
  var lots = {};
  listRows_('ESTOQUE', { includeInactive: true }).forEach(function(lot) { lots[lot.ID] = lot; });
  var grouped = {};
  productionItems.forEach(function(item) {
    if (asNumber_(item.QTD_CONSUMIDA) <= 0) return;
    var key = item.INSUMO_ID + '|' + item.LOTE_ID;
    if (!grouped[key]) grouped[key] = { inputId: item.INSUMO_ID, lotId: item.LOTE_ID, quantity: 0, unitCost: asNumber_(item.CUSTO_UNITARIO) };
    grouped[key].quantity += asNumber_(item.QTD_CONSUMIDA);
  });
  var after;
  withLock_(function() {
    var current = findById_('PRODUCOES', before.ID, true);
    if (!current || current.STATUS !== 'Em produção') throw new Error('A produção foi alterada por outra operação.');
    before = current;
    Object.keys(grouped).forEach(function(key) {
      var item = grouped[key];
      if (item.quantity <= 0) return;
      var originalLot = lots[item.lotId] || {};
      addStockLot_('INSUMO', {
        itemId: item.inputId,
        lot: originalLot.LOTE || ('ESTORNO-' + before.CODIGO),
        quantity: item.quantity,
        unitCost: item.unitCost,
        supplierId: originalLot.FORNECEDOR_ID || '',
        location: originalLot.LOCALIZACAO || '',
        referenceType: 'CANCELAMENTO_PRODUCAO',
        referenceId: before.ID,
        operatorId: user.ID,
        justification: data.justification
      });
    });
    after = updateRow_('PRODUCOES', before.ID, {
      STATUS: 'Cancelada',
      HORA_FIM: nowIso_(),
      OBSERVACOES: sanitizeText_((before.OBSERVACOES ? before.OBSERVACOES + '\n' : '') + 'Cancelamento: ' + data.justification, 2000)
    });
  });
  audit_('Cancelamento', user, 'Produção', 'PRODUCOES', before.ID, before, after, data.justification);
  return after;
}
