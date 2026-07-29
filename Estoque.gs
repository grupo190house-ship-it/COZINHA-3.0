/**
 * Estoque por lote com consumo PEPS/FIFO e bloqueio de saldo negativo.
 */
function stockSheetName_(stockType) {
  if (stockType === 'INSUMO') return 'ESTOQUE';
  if (stockType === 'PRODUTO') return 'ESTOQUE_PRODUTOS';
  throw new Error('Tipo de estoque inválido.');
}

function stockItemField_(stockType) {
  return stockType === 'INSUMO' ? 'INSUMO_ID' : 'PRODUTO_ID';
}

function getBalanceMap_(stockType) {
  var sheetName = stockSheetName_(stockType);
  var itemField = stockItemField_(stockType);
  var balances = {};
  listRows_(sheetName).forEach(function(lot) {
    balances[lot[itemField]] = (balances[lot[itemField]] || 0) + asNumber_(lot.QUANTIDADE_ATUAL);
  });
  return balances;
}

function getStockBalance_(stockType, itemId) {
  return round_(getBalanceMap_(stockType)[itemId] || 0, 4);
}

function stockOverview_(params) {
  params = params || {};
  var type = params.type === 'PRODUTO' ? 'PRODUTO' : 'INSUMO';
  var catalogName = type === 'INSUMO' ? 'INSUMOS' : 'PRODUTOS';
  var sheetName = stockSheetName_(type);
  var field = stockItemField_(type);
  var catalogRows = listRows_(catalogName);
  var itemMap = {};
  listRows_(catalogName, { includeInactive: true }).forEach(function(row) { itemMap[row.ID] = row; });
  var lots = listRows_(sheetName, { includeInactive: true }).map(function(lot) {
    var item = itemMap[lot[field]] || {};
    lot.ITEM_NOME = item.NOME || 'Item removido';
    lot.ITEM_CODIGO = item.CODIGO || '';
    lot.UNIDADE = item.UNIDADE || '';
    lot.ITEM_ID = lot[field];
    delete lot.CUSTO_UNITARIO;
    delete lot.VALIDADE;
    delete lot.LOCALIZACAO;
    return lot;
  }).filter(function(lot) { return params.includeEmpty === true || asNumber_(lot.QUANTIDADE_ATUAL) > 0; });
  lots.sort(function(a, b) {
    return String(b.ENTRADA_EM || '').localeCompare(String(a.ENTRADA_EM || '')) ||
      String(a.ITEM_NOME || '').localeCompare(String(b.ITEM_NOME || ''));
  });
  var balances = {};
  var lotCounts = {};
  lots.forEach(function(lot) {
    balances[lot[field]] = (balances[lot[field]] || 0) + asNumber_(lot.QUANTIDADE_ATUAL);
    lotCounts[lot[field]] = (lotCounts[lot[field]] || 0) + 1;
  });
  var itemCards = catalogRows.map(function(item) {
    var balance = round_(balances[item.ID] || 0, 4);
    var minimum = asNumber_(item.ESTOQUE_MINIMO);
    var belowMinimum = minimum > 0 && balance <= minimum;
    return {
      ID: item.ID,
      CODIGO: item.CODIGO,
      NOME: item.NOME,
      CATEGORIA: item.CATEGORIA,
      UNIDADE: item.UNIDADE,
      SALDO: balance,
      ESTOQUE_MINIMO: minimum,
      ESTOQUE_MAXIMO: asNumber_(item.ESTOQUE_MAXIMO),
      CUSTO_MEDIO: getItemReferenceUnitCost_(type, item.ID),
      LOTES: lotCounts[item.ID] || 0,
      ABAIXO_MINIMO: belowMinimum,
      SITUACAO: belowMinimum ? 'Abaixo do mínimo' : (balance > 0 ? 'Em estoque' : 'Sem saldo')
    };
  }).sort(function(a, b) {
    return Number(b.ABAIXO_MINIMO) - Number(a.ABAIXO_MINIMO) ||
      String(a.NOME).localeCompare(String(b.NOME));
  });
  return {
    type: type,
    lots: lots,
    items: itemCards,
    summary: {
      quantity: round_(lots.reduce(function(sum, lot) { return sum + asNumber_(lot.QUANTIDADE_ATUAL); }, 0), 2),
      items: itemCards.length,
      stocked: itemCards.filter(function(item) { return item.SALDO > 0; }).length,
      lowStock: itemCards.filter(function(item) { return item.ABAIXO_MINIMO; }).length,
      lots: lots.length
    }
  };
}

function stockEntry_(data, user) {
  data = sanitizeObject_(data || {});
  var type = 'INSUMO';
  requireFields_(data, ['ITEM_ID', 'QUANTIDADE', 'DATA_ENTRADA']);
  var quantity = asNumber_(data.QUANTIDADE);
  var item = findById_('INSUMOS', data.ITEM_ID);
  if (!item) throw new Error('Insumo não encontrado ou inativo.');
  var hasInformedCost = Object.prototype.hasOwnProperty.call(data, 'CUSTO_UNITARIO') &&
    String(data.CUSTO_UNITARIO).trim() !== '';
  var unitCost = hasInformedCost
    ? Math.max(0, asNumber_(data.CUSTO_UNITARIO))
    : getItemReferenceUnitCost_('INSUMO', item.ID);
  if (quantity <= 0) throw new Error('A quantidade deve ser maior que zero.');
  var entryDate = dateValue_(data.DATA_ENTRADA);
  if (!entryDate) throw new Error('Informe uma data de chegada válida.');
  var entryTimestamp = Utilities.formatDate(entryDate, APP_CONFIG.TIMEZONE, "yyyy-MM-dd'T'12:00:00");
  var result;
  withLock_(function() {
    result = addStockLot_(type, {
      itemId: data.ITEM_ID,
      lot: data.LOTE || generateCode_('LOTE'),
      quantity: quantity,
      unitCost: unitCost,
      supplierId: '',
      location: '',
      entryAt: entryTimestamp,
      dateTime: entryTimestamp,
      referenceType: 'ENTRADA_FORNECEDOR',
      referenceId: '',
      operatorId: user.ID,
      justification: data.OBSERVACOES || 'Entrada recebida do fornecedor'
    });
    updateInputAverageCost_(item.ID, unitCost);
  });
  audit_('Entrada de estoque', user, 'Estoque', stockSheetName_(type), result.lot.ID, null, result, data.OBSERVACOES || '');
  refreshAutomaticPurchaseList_(user);
  return result;
}

function addStockLot_(type, data) {
  var sheetName = stockSheetName_(type);
  var field = stockItemField_(type);
  var before = getStockBalance_(type, data.itemId);
  var record = {
    LOTE: sanitizeText_(data.lot, 80),
    VALIDADE: '',
    QUANTIDADE_INICIAL: round_(data.quantity, 4),
    QUANTIDADE_ATUAL: round_(data.quantity, 4),
    CUSTO_UNITARIO: round_(data.unitCost, 4),
    LOCALIZACAO: sanitizeText_(data.location, 120),
    ENTRADA_EM: data.entryAt || nowIso_(),
    STATUS: 'Ativo'
  };
  record[field] = data.itemId;
  if (type === 'INSUMO') record.FORNECEDOR_ID = data.supplierId || '';
  var lot = insertRow_(sheetName, record);
  insertRow_('MOVIMENTACOES', {
    TIPO_ESTOQUE: type,
    ITEM_ID: data.itemId,
    LOTE_ID: lot.ID,
    TIPO: 'ENTRADA',
    QUANTIDADE: round_(data.quantity, 4),
    VALOR_UNITARIO: round_(data.unitCost, 4),
    SALDO_ANTES: before,
    SALDO_DEPOIS: round_(before + data.quantity, 4),
    REFERENCIA_TIPO: data.referenceType || '',
    REFERENCIA_ID: data.referenceId || '',
    OPERADOR_ID: data.operatorId || '',
    JUSTIFICATIVA: data.justification || '',
    DATA_HORA: data.dateTime || data.entryAt || nowIso_()
  });
  return { lot: lot, balanceBefore: before, balanceAfter: round_(before + data.quantity, 4) };
}

function consumeStockFifo_(type, itemId, quantity, metadata) {
  quantity = round_(quantity, 4);
  if (quantity <= 0) throw new Error('A quantidade de saída deve ser maior que zero.');
  var available = getStockBalance_(type, itemId);
  if (available + 0.00001 < quantity) {
    throw new Error('Estoque insuficiente. Disponível: ' + available + '; necessário: ' + quantity + '.');
  }
  var sheetName = stockSheetName_(type);
  var field = stockItemField_(type);
  var lots = listRows_(sheetName).filter(function(lot) {
    return String(lot[field]) === String(itemId) && asNumber_(lot.QUANTIDADE_ATUAL) > 0;
  }).sort(function(a, b) {
    var entryCompare = String(a.ENTRADA_EM).localeCompare(String(b.ENTRADA_EM));
    return entryCompare || String(a.ID).localeCompare(String(b.ID));
  });
  var remaining = quantity;
  var balance = available;
  var consumed = [];
  var referenceUnitCost = getItemReferenceUnitCost_(type, itemId);
  lots.forEach(function(lot) {
    if (remaining <= 0) return;
    var lotBalance = asNumber_(lot.QUANTIDADE_ATUAL);
    var take = Math.min(lotBalance, remaining);
    var recordedUnitCost = asNumber_(lot.CUSTO_UNITARIO);
    var effectiveUnitCost = recordedUnitCost > 0 ? recordedUnitCost : referenceUnitCost;
    var before = balance;
    balance = round_(balance - take, 4);
    updateRow_(sheetName, lot.ID, {
      QUANTIDADE_ATUAL: round_(lotBalance - take, 4),
      CUSTO_UNITARIO: round_(effectiveUnitCost, 4),
      STATUS: round_(lotBalance - take, 4) <= 0 ? 'Esgotado' : 'Ativo'
    });
    insertRow_('MOVIMENTACOES', {
      TIPO_ESTOQUE: type,
      ITEM_ID: itemId,
      LOTE_ID: lot.ID,
      TIPO: metadata.movementType || 'SAIDA',
      QUANTIDADE: round_(-take, 4),
      VALOR_UNITARIO: round_(effectiveUnitCost, 4),
      SALDO_ANTES: before,
      SALDO_DEPOIS: balance,
      REFERENCIA_TIPO: metadata.referenceType || '',
      REFERENCIA_ID: metadata.referenceId || '',
      OPERADOR_ID: metadata.operatorId || '',
      JUSTIFICATIVA: metadata.justification || '',
      DATA_HORA: metadata.dateTime || nowIso_()
    });
    consumed.push({ lotId: lot.ID, lot: lot.LOTE, quantity: take, unitCost: round_(effectiveUnitCost, 4), totalCost: round_(take * effectiveUnitCost, 4) });
    remaining = round_(remaining - take, 4);
  });
  if (type === 'INSUMO') {
    var input = findById_('INSUMOS', itemId, true) || {};
    updateInputAverageCost_(itemId, asNumber_(input.PRECO_ATUAL || referenceUnitCost));
  }
  return {
    consumed: consumed,
    quantity: quantity,
    totalCost: round_(consumed.reduce(function(sum, item) { return sum + item.totalCost; }, 0), 4),
    balanceBefore: available,
    balanceAfter: balance
  };
}

function getItemReferenceUnitCost_(type, itemId) {
  var entity = type === 'INSUMO' ? 'INSUMOS' : 'PRODUTOS';
  var item = findById_(entity, itemId, true);
  if (!item) return 0;
  return type === 'INSUMO'
    ? Math.max(0, asNumber_(item.PRECO_MEDIO || item.PRECO_ATUAL))
    : Math.max(0, asNumber_(item.CUSTO));
}

function stockExitManual_(data, user) {
  data = sanitizeObject_(data || {});
  var type = data.TIPO_ESTOQUE || 'INSUMO';
  requireFields_(data, ['ITEM_ID', 'JUSTIFICATIVA']);
  var result;
  withLock_(function() {
    result = consumeStockFifo_(type, data.ITEM_ID, asNumber_(data.QUANTIDADE), {
      movementType: data.TIPO || 'SAIDA',
      referenceType: 'SAIDA_MANUAL',
      referenceId: '',
      operatorId: data.OPERADOR_ID || user.ID,
      justification: data.JUSTIFICATIVA
    });
  });
  audit_('Saída de estoque', user, 'Estoque', stockSheetName_(type), data.ITEM_ID, null, result, data.JUSTIFICATIVA);
  refreshAutomaticPurchaseList_(user);
  return result;
}

function listMovements_(params) {
  params = params || {};
  var rows = listRows_('MOVIMENTACOES', { includeInactive: true });
  if (params.type) rows = rows.filter(function(row) { return row.TIPO_ESTOQUE === params.type; });
  if (params.itemId) rows = rows.filter(function(row) { return String(row.ITEM_ID) === String(params.itemId); });
  if (params.from) rows = rows.filter(function(row) { return String(row.DATA_HORA) >= String(params.from); });
  if (params.to) rows = rows.filter(function(row) { return String(row.DATA_HORA) <= String(params.to) + 'T23:59:59'; });
  rows.sort(function(a, b) { return String(b.DATA_HORA).localeCompare(String(a.DATA_HORA)); });
  return rows.slice(0, Math.min(asNumber_(params.limit, 500), 2000));
}

function updateInputAverageCost_(inputId, latestCost) {
  var input = findById_('INSUMOS', inputId, true);
  if (!input) return;
  var lots = listRows_('ESTOQUE').filter(function(lot) {
    return String(lot.INSUMO_ID) === String(inputId) && asNumber_(lot.QUANTIDADE_ATUAL) > 0;
  });
  var quantity = lots.reduce(function(sum, lot) { return sum + asNumber_(lot.QUANTIDADE_ATUAL); }, 0);
  var value = lots.reduce(function(sum, lot) { return sum + asNumber_(lot.QUANTIDADE_ATUAL) * asNumber_(lot.CUSTO_UNITARIO); }, 0);
  var normalizedLatestCost = Math.max(0, asNumber_(latestCost));
  var currentPrice = Math.max(0, asNumber_(input.PRECO_ATUAL));
  updateRow_('INSUMOS', inputId, {
    PRECO_ANTERIOR: normalizedLatestCost !== currentPrice ? currentPrice : (input.PRECO_ANTERIOR || 0),
    PRECO_ATUAL: normalizedLatestCost,
    PRECO_MEDIO: quantity > 0 ? round_(value / quantity, 4) : normalizedLatestCost
  });
}

function applyInputReferenceCostToUnpricedLots_(inputId, unitCost) {
  unitCost = Math.max(0, asNumber_(unitCost));
  if (unitCost <= 0) return;
  listRows_('ESTOQUE', { includeInactive: true }).filter(function(lot) {
    return String(lot.INSUMO_ID) === String(inputId) &&
      asNumber_(lot.QUANTIDADE_ATUAL) > 0 &&
      asNumber_(lot.CUSTO_UNITARIO) <= 0;
  }).forEach(function(lot) {
    updateRow_('ESTOQUE', lot.ID, { CUSTO_UNITARIO: round_(unitCost, 4) });
  });
  updateInputAverageCost_(inputId, unitCost);
}
