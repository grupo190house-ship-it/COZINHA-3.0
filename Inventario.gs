/**
 * Inventários e ajustes rastreáveis. O saldo nunca é sobrescrito diretamente.
 */
function listInventories_(params) {
  params = params || {};
  var inputs = {};
  var products = {};
  listRows_('INSUMOS', { includeInactive: true }).forEach(function(row) { inputs[row.ID] = row; });
  listRows_('PRODUTOS', { includeInactive: true }).forEach(function(row) { products[row.ID] = row; });
  var rows = listRows_('INVENTARIOS', { includeInactive: true });
  if (params.status) rows = rows.filter(function(row) { return row.STATUS === params.status; });
  if (params.number) rows = rows.filter(function(row) { return row.NUMERO === params.number; });
  rows.sort(function(a, b) { return String(b.DATA_HORA).localeCompare(String(a.DATA_HORA)); });
  return rows.map(function(row) {
    var item = row.TIPO_ESTOQUE === 'INSUMO' ? inputs[row.ITEM_ID] : products[row.ITEM_ID];
    row.ITEM_NOME = item ? item.NOME : '';
    row.ITEM_CODIGO = item ? item.CODIGO : '';
    row.UNIDADE = item ? item.UNIDADE : '';
    if (row.TIPO === 'Cego' && row.STATUS === 'Pendente') row.SALDO_ESPERADO = '';
    return row;
  });
}

function createInventory_(data, user) {
  data = sanitizeObject_(data || {});
  var type = data.TIPO || 'Diário';
  var stockType = data.TIPO_ESTOQUE || 'TODOS';
  assertEnum_(type, ENUMS.INVENTARIO_TIPO, 'Tipo de inventário');
  if (['TODOS', 'INSUMO', 'PRODUTO'].indexOf(stockType) < 0) throw new Error('Tipo de estoque inválido.');
  var stockTypes = stockType === 'TODOS' ? ['INSUMO', 'PRODUTO'] : [stockType];
  var items = [];
  stockTypes.forEach(function(currentType) {
    stockSheetName_(currentType);
    var catalog = currentType === 'INSUMO' ? 'INSUMOS' : 'PRODUTOS';
    listRows_(catalog).forEach(function(item) {
      if (!data.ITEM_ID || String(item.ID) === String(data.ITEM_ID)) {
        items.push({ stockType: currentType, item: item });
      }
    });
  });
  if (!items.length) throw new Error('Nenhum item disponível para inventário.');
  var number = generateCode_('INV');
  var records = items.map(function(entry) {
    var item = entry.item;
    return {
      NUMERO: number,
      TIPO: type,
      TIPO_ESTOQUE: entry.stockType,
      ITEM_ID: item.ID,
      SALDO_ESPERADO: getStockBalance_(entry.stockType, item.ID),
      QUANTIDADE_CONTADA: '',
      DIFERENCA: '',
      OPERADOR_ID: data.OPERADOR_ID || user.ID,
      SUPERVISOR_ID: data.SUPERVISOR_ID || '',
      MOTIVO: sanitizeText_(data.MOTIVO, 1000),
      FOTO: '',
      ASSINATURA: '',
      DATA_HORA: nowIso_(),
      STATUS: 'Pendente'
    };
  });
  var saved = writeRows_('INVENTARIOS', records);
  audit_('Inventário', user, 'Inventário', 'INVENTARIOS', number, null, { numero: number, tipo: type, itens: saved.length }, 'Inventário criado');
  if (type === 'Cego') {
    return saved.map(function(row) {
      var copy = jsonSafe_(row);
      copy.SALDO_ESPERADO = '';
      return copy;
    });
  }
  return saved;
}

function quickInventory_(data, user) {
  data = sanitizeObject_(data || {});
  requireFields_(data, ['TIPO_ESTOQUE', 'ITEM_ID', 'QUANTIDADE_CONTADA']);
  stockSheetName_(data.TIPO_ESTOQUE);
  var counted = asNumber_(data.QUANTIDADE_CONTADA);
  if (counted < 0) throw new Error('A contagem não pode ser negativa.');
  var expected = getStockBalance_(data.TIPO_ESTOQUE, data.ITEM_ID);
  if (round_(counted - expected, 4) !== 0 && !sanitizeText_(data.MOTIVO)) {
    throw new Error('Informe a justificativa da diferença.');
  }
  if (round_(counted - expected, 4) !== 0 && !data.SUPERVISOR_ID && user.PERFIL === 'Operador') {
    throw new Error('Informe o supervisor responsável pelo ajuste.');
  }
  var created = createInventory_({
    TIPO: 'Diário',
    TIPO_ESTOQUE: data.TIPO_ESTOQUE,
    ITEM_ID: data.ITEM_ID,
    OPERADOR_ID: data.OPERADOR_ID || user.ID,
    SUPERVISOR_ID: data.SUPERVISOR_ID || '',
    MOTIVO: data.MOTIVO || ''
  }, user);
  if (!created.length) throw new Error('Não foi possível iniciar a contagem rápida.');
  return countInventory_({
    ID: created[0].ID,
    QUANTIDADE_CONTADA: data.QUANTIDADE_CONTADA,
    SUPERVISOR_ID: data.SUPERVISOR_ID || '',
    MOTIVO: data.MOTIVO || '',
    FOTO: data.FOTO || '',
    ASSINATURA: data.ASSINATURA || ''
  }, user);
}

function countInventory_(data, user) {
  data = sanitizeObject_(data || {});
  requireFields_(data, ['ID', 'QUANTIDADE_CONTADA']);
  var before = findById_('INVENTARIOS', data.ID, true);
  if (!before || before.STATUS !== 'Pendente') throw new Error('Item de inventário não encontrado ou já conferido.');
  var counted = asNumber_(data.QUANTIDADE_CONTADA);
  if (counted < 0) throw new Error('A contagem não pode ser negativa.');
  var expected;
  var difference;
  var after;
  withLock_(function() {
    var current = findById_('INVENTARIOS', before.ID, true);
    if (!current || current.STATUS !== 'Pendente') throw new Error('A contagem foi concluída por outra operação.');
    before = current;
    expected = getStockBalance_(before.TIPO_ESTOQUE, before.ITEM_ID);
    difference = round_(counted - expected, 4);
    if (difference !== 0 && !sanitizeText_(data.MOTIVO)) throw new Error('Informe a justificativa da diferença.');
    if (difference !== 0 && !data.SUPERVISOR_ID && user.PERFIL === 'Operador') throw new Error('Informe o supervisor responsável pelo ajuste.');
    var adjustmentLotId = '';
    if (difference > 0) {
      var catalog = before.TIPO_ESTOQUE === 'INSUMO' ? 'INSUMOS' : 'PRODUTOS';
      var item = findById_(catalog, before.ITEM_ID, true) || {};
      var entry = addStockLot_(before.TIPO_ESTOQUE, {
        itemId: before.ITEM_ID,
        lot: 'AJUSTE-' + before.NUMERO,
        quantity: difference,
        unitCost: asNumber_(item.PRECO_MEDIO || item.CUSTO),
        location: item.LOCALIZACAO || '',
        referenceType: 'INVENTARIO',
        referenceId: before.ID,
        operatorId: user.ID,
        justification: data.MOTIVO
      });
      adjustmentLotId = entry.lot.ID;
    } else if (difference < 0) {
      var exit = consumeStockFifo_(before.TIPO_ESTOQUE, before.ITEM_ID, Math.abs(difference), {
        movementType: 'AJUSTE_INVENTARIO',
        referenceType: 'INVENTARIO',
        referenceId: before.ID,
        operatorId: user.ID,
        justification: data.MOTIVO
      });
      adjustmentLotId = exit.consumed.map(function(item) { return item.lotId; }).join(',');
    }
    if (difference !== 0) {
      insertRow_('AJUSTES', {
        INVENTARIO_ID: before.ID,
        TIPO_ESTOQUE: before.TIPO_ESTOQUE,
        ITEM_ID: before.ITEM_ID,
        LOTE_ID: adjustmentLotId,
        QUANTIDADE: difference,
        JUSTIFICATIVA: data.MOTIVO,
        RESPONSAVEL_ID: user.ID,
        DATA_HORA: nowIso_()
      });
    }
    after = updateRow_('INVENTARIOS', before.ID, {
      SALDO_ESPERADO: expected,
      QUANTIDADE_CONTADA: counted,
      DIFERENCA: difference,
      SUPERVISOR_ID: data.SUPERVISOR_ID || before.SUPERVISOR_ID || user.ID,
      MOTIVO: sanitizeText_(data.MOTIVO || before.MOTIVO, 1000),
      FOTO: data.FOTO || '',
      ASSINATURA: data.ASSINATURA || '',
      STATUS: 'Concluído'
    });
  });
  audit_('Ajuste de inventário', user, 'Inventário', 'INVENTARIOS', before.ID, before, after, data.MOTIVO || 'Sem diferença');
  refreshAutomaticPurchaseList_(user);
  return after;
}
