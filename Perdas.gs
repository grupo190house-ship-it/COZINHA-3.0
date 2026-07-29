/**
 * Registro de perdas com baixa obrigatória e custo.
 */
function listLosses_(params) {
  params = params || {};
  var inputs = {};
  var products = {};
  listRows_('INSUMOS', { includeInactive: true }).forEach(function(row) { inputs[row.ID] = row; });
  listRows_('PRODUTOS', { includeInactive: true }).forEach(function(row) { products[row.ID] = row; });
  var rows = listRows_('PERDAS', { includeInactive: true });
  if (params.from) rows = rows.filter(function(row) { return String(row.DATA_HORA) >= String(params.from); });
  if (params.to) rows = rows.filter(function(row) { return String(row.DATA_HORA) <= String(params.to) + 'T23:59:59'; });
  rows.forEach(function(row) {
    var item = row.TIPO_ESTOQUE === 'INSUMO' ? inputs[row.ITEM_ID] : products[row.ITEM_ID];
    row.ITEM_NOME = item ? item.NOME : '';
    row.UNIDADE = row.UNIDADE || (item ? item.UNIDADE : '');
    row.CUSTO_UNITARIO = asNumber_(row.CUSTO_UNITARIO) > 0
      ? asNumber_(row.CUSTO_UNITARIO)
      : (asNumber_(row.QUANTIDADE) > 0 ? round_(asNumber_(row.CUSTO) / asNumber_(row.QUANTIDADE), 4) : 0);
  });
  return rows.sort(function(a, b) { return String(b.DATA_HORA).localeCompare(String(a.DATA_HORA)); });
}

function registerLoss_(data, user) {
  data = sanitizeObject_(data || {});
  requireFields_(data, ['TIPO_ESTOQUE', 'ITEM_ID', 'QUANTIDADE', 'MOTIVO', 'CATEGORIA']);
  assertEnum_(data.TIPO_ESTOQUE, ['INSUMO', 'PRODUTO'], 'Tipo de estoque');
  assertEnum_(data.CATEGORIA, ENUMS.PERDA_CATEGORIA, 'Categoria de perda');
  var quantity = asNumber_(data.QUANTIDADE);
  if (quantity <= 0) throw new Error('A quantidade deve ser maior que zero.');
  var item = findById_(data.TIPO_ESTOQUE === 'INSUMO' ? 'INSUMOS' : 'PRODUTOS', data.ITEM_ID);
  if (!item) throw new Error('O item selecionado não foi encontrado ou está inativo.');
  var consumption;
  var loss;
  withLock_(function() {
    consumption = consumeStockFifo_(data.TIPO_ESTOQUE, data.ITEM_ID, quantity, {
      movementType: 'PERDA',
      referenceType: 'PERDA',
      referenceId: '',
      operatorId: data.OPERADOR_ID || user.ID,
      justification: data.MOTIVO
    });
    loss = insertRow_('PERDAS', {
      TIPO_ESTOQUE: data.TIPO_ESTOQUE,
      ITEM_ID: data.ITEM_ID,
      QUANTIDADE: quantity,
      MOTIVO: sanitizeText_(data.MOTIVO, 1000),
      CATEGORIA: data.CATEGORIA,
      FOTO: data.FOTO || '',
      OPERADOR_ID: data.OPERADOR_ID || user.ID,
      SUPERVISOR_ID: data.SUPERVISOR_ID || '',
      LOTE_ID: consumption.consumed.map(function(item) { return item.lotId; }).join(','),
      DATA_HORA: nowIso_(),
      CUSTO: consumption.totalCost,
      STATUS: 'Ativo',
      CUSTO_UNITARIO: quantity > 0 ? round_(consumption.totalCost / quantity, 4) : 0,
      UNIDADE: item.UNIDADE || ''
    });
  });
  audit_('Perda', user, 'Perdas', 'PERDAS', loss.ID, null, loss, data.MOTIVO);
  refreshAutomaticPurchaseList_(user);
  return loss;
}
