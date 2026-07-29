/**
 * Cadastros de insumos e produtos acabados.
 */
function listCatalog_(entity) {
  var rows = listRows_(entity, { includeInactive: true });
  var stockType = entity === 'INSUMOS' ? 'INSUMO' : 'PRODUTO';
  var balances = getBalanceMap_(stockType);
  return rows.map(function(row) {
    row.ESTOQUE_ATUAL = round_(balances[row.ID] || 0, 4);
    return row;
  });
}

function saveCatalog_(entity, data, user) {
  data = sanitizeObject_(data || {});
  if (['INSUMOS', 'PRODUTOS'].indexOf(entity) < 0) throw new Error('Cadastro inválido.');
  requireFields_(data, ['NOME', 'UNIDADE']);
  var before = data.ID ? findById_(entity, data.ID, true) : null;
  var isInput = entity === 'INSUMOS';
  var code = sanitizeText_(data.CODIGO || (before && before.CODIGO) || generateCode_(isInput ? 'INS' : 'PRO'), 40);
  var duplicate = findOne_(entity, function(row) {
    return String(row.CODIGO).toLowerCase() === code.toLowerCase() && String(row.ID) !== String(data.ID || '');
  }, true);
  if (duplicate) throw new Error('Já existe um cadastro com o código ' + code + '.');

  var record = {};
  headers_(entity).forEach(function(header) {
    if (['ID', 'CRIADO_EM', 'ATUALIZADO_EM'].indexOf(header) < 0 && Object.prototype.hasOwnProperty.call(data, header)) {
      record[header] = data[header];
    }
  });
  record.ID = data.ID || '';
  record.CODIGO = code;
  record.QR_CODE = data.QR_CODE || (before && before.QR_CODE) || ('https://quickchart.io/qr?size=180&text=' + encodeURIComponent(code));
  record.NOME = sanitizeText_(data.NOME, 160);
  record.CATEGORIA = sanitizeText_(data.CATEGORIA, 100);
  record.UNIDADE = sanitizeText_(data.UNIDADE, 20);
  record.STATUS = data.STATUS || 'Ativo';
  ['ESTOQUE_MINIMO', 'ESTOQUE_MAXIMO'].forEach(function(field) {
    if (Object.prototype.hasOwnProperty.call(record, field)) record[field] = Math.max(0, asNumber_(record[field]));
  });
  if (record.ESTOQUE_MAXIMO && record.ESTOQUE_MINIMO > record.ESTOQUE_MAXIMO) {
    throw new Error('O estoque mínimo não pode ser maior que o estoque máximo.');
  }
  if (isInput) {
    var hasCurrentPrice = Object.prototype.hasOwnProperty.call(data, 'PRECO_ATUAL') &&
      String(data.PRECO_ATUAL).trim() !== '';
    var currentPrice = hasCurrentPrice
      ? Math.max(0, asNumber_(data.PRECO_ATUAL))
      : Math.max(0, asNumber_(before ? before.PRECO_ATUAL : 0));
    var previousCurrentPrice = Math.max(0, asNumber_(before ? before.PRECO_ATUAL : 0));
    var previousAveragePrice = Math.max(0, asNumber_(before ? before.PRECO_MEDIO : 0));
    record.PRECO_ANTERIOR = before && currentPrice !== previousCurrentPrice
      ? previousCurrentPrice
      : Math.max(0, asNumber_(before ? before.PRECO_ANTERIOR : 0));
    record.PRECO_ATUAL = currentPrice;
    record.PRECO_MEDIO = previousAveragePrice > 0 ? previousAveragePrice : currentPrice;
  } else {
    record.PRECO_VENDA = Math.max(0, asNumber_(
      Object.prototype.hasOwnProperty.call(data, 'PRECO_VENDA') && String(data.PRECO_VENDA).trim() !== ''
        ? data.PRECO_VENDA
        : (before ? before.PRECO_VENDA : 0)
    ));
    record.CUSTO = Math.max(0, asNumber_(
      Object.prototype.hasOwnProperty.call(data, 'CUSTO') && String(data.CUSTO).trim() !== ''
        ? data.CUSTO
        : (before ? before.CUSTO : 0)
    ));
    record.PESO_UNITARIO = Math.max(0, asNumber_(
      Object.prototype.hasOwnProperty.call(data, 'PESO_UNITARIO') && String(data.PESO_UNITARIO).trim() !== ''
        ? data.PESO_UNITARIO
        : (before ? before.PESO_UNITARIO : 0)
    ));
    record.UNIDADE_PESO = record.PESO_UNITARIO > 0
      ? assertEnum_(data.UNIDADE_PESO || (before && before.UNIDADE_PESO) || 'g', ['g', 'kg'], 'Unidade do peso')
      : '';
    record.MARGEM = record.PRECO_VENDA > 0 ? round_((record.PRECO_VENDA - record.CUSTO) / record.PRECO_VENDA * 100, 2) : 0;
  }
  var saved = upsertById_(entity, record);
  if (isInput && asNumber_(saved.PRECO_ATUAL) > 0) {
    applyInputReferenceCostToUnpricedLots_(saved.ID, saved.PRECO_ATUAL);
    saved = findById_(entity, saved.ID, true) || saved;
  }
  audit_(before ? 'Alteração' : 'Inclusão', user, isInput ? 'Insumos' : 'Produtos', entity, saved.ID, before, saved, '');
  if (isInput) refreshAutomaticPurchaseList_(user);
  return saved;
}

function deactivateCatalog_(entity, id, user) {
  var before = findById_(entity, id, true);
  if (!before) throw new Error('Registro não encontrado.');
  var stockType = entity === 'INSUMOS' ? 'INSUMO' : 'PRODUTO';
  if (getStockBalance_(stockType, id) > 0) {
    throw new Error('Não é possível inativar um item com saldo em estoque.');
  }
  var after = softDelete_(entity, id);
  audit_('Exclusão lógica', user, entity === 'INSUMOS' ? 'Insumos' : 'Produtos', entity, id, before, after, '');
  return after;
}
