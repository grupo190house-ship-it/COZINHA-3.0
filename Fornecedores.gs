/**
 * Fornecedores e inteligência de preços.
 */
function listSuppliers_() {
  return listRows_('FORNECEDORES', { includeInactive: true });
}

function saveSupplier_(data, user) {
  data = sanitizeObject_(data || {});
  requireFields_(data, ['RAZAO_SOCIAL']);
  var before = data.ID ? findById_('FORNECEDORES', data.ID, true) : null;
  var cnpj = String(data.CNPJ || '').replace(/\D/g, '');
  if (cnpj && cnpj.length !== 14) throw new Error('CNPJ deve conter 14 dígitos.');
  var duplicate = cnpj ? findOne_('FORNECEDORES', function(row) {
    return String(row.CNPJ).replace(/\D/g, '') === cnpj && String(row.ID) !== String(data.ID || '');
  }, true) : null;
  if (duplicate) throw new Error('Já existe um fornecedor com este CNPJ.');
  var record = {};
  headers_('FORNECEDORES').forEach(function(header) {
    if (Object.prototype.hasOwnProperty.call(data, header)) record[header] = data[header];
  });
  record.ID = data.ID || '';
  record.CODIGO = data.CODIGO || (before && before.CODIGO) || generateCode_('FOR');
  record.RAZAO_SOCIAL = sanitizeText_(data.RAZAO_SOCIAL, 180);
  record.NOME_FANTASIA = sanitizeText_(data.NOME_FANTASIA, 160);
  record.CNPJ = cnpj;
  record.AVALIACAO = Math.min(5, Math.max(0, asNumber_(data.AVALIACAO)));
  record.PRAZO_MEDIO_DIAS = Math.max(0, asNumber_(data.PRAZO_MEDIO_DIAS));
  record.STATUS = data.STATUS || 'Ativo';
  var saved = upsertById_('FORNECEDORES', record);
  audit_(before ? 'Alteração' : 'Inclusão', user, 'Fornecedores', 'FORNECEDORES', saved.ID, before, saved, '');
  return saved;
}

function deactivateSupplier_(id, user) {
  var before = findById_('FORNECEDORES', id, true);
  if (!before) throw new Error('Fornecedor não encontrado.');
  var openOrder = findOne_('PEDIDOS', function(row) {
    return String(row.FORNECEDOR_ID) === String(id) && ['Recebido', 'Cancelado'].indexOf(row.STATUS) < 0;
  }, true);
  if (openOrder) throw new Error('Fornecedor possui pedido em aberto.');
  var after = softDelete_('FORNECEDORES', id);
  audit_('Exclusão lógica', user, 'Fornecedores', 'FORNECEDORES', id, before, after, '');
  return after;
}

function comparePrices_(params) {
  params = params || {};
  var inputId = params.insumoId;
  if (!inputId) throw new Error('Selecione um insumo.');
  var orders = listRows_('PEDIDOS', { includeInactive: true });
  var suppliers = {};
  listRows_('FORNECEDORES', { includeInactive: true }).forEach(function(row) { suppliers[row.ID] = row; });
  var orderMap = {};
  orders.forEach(function(row) { orderMap[row.ID] = row; });
  var history = listRows_('PEDIDOS_ITENS', { includeInactive: true })
    .filter(function(item) { return String(item.INSUMO_ID) === String(inputId) && asNumber_(item.PRECO) > 0; })
    .map(function(item) {
      var order = orderMap[item.PEDIDO_ID] || {};
      var supplier = suppliers[order.FORNECEDOR_ID] || {};
      return {
        supplierId: order.FORNECEDOR_ID || '',
        supplier: supplier.NOME_FANTASIA || supplier.RAZAO_SOCIAL || 'Não informado',
        price: asNumber_(item.PRECO),
        date: order.DATA || item.CRIADO_EM,
        deliveryDays: asNumber_(supplier.PRAZO_MEDIO_DIAS),
        rating: asNumber_(supplier.AVALIACAO)
      };
    });
  var grouped = {};
  history.forEach(function(entry) {
    if (!grouped[entry.supplierId]) grouped[entry.supplierId] = [];
    grouped[entry.supplierId].push(entry);
  });
  var ranking = Object.keys(grouped).map(function(id) {
    var entries = grouped[id].sort(function(a, b) { return String(a.date).localeCompare(String(b.date)); });
    var prices = entries.map(function(entry) { return entry.price; });
    var latest = entries[entries.length - 1];
    return {
      supplierId: id,
      supplier: latest.supplier,
      lastPrice: latest.price,
      averagePrice: round_(prices.reduce(function(sum, value) { return sum + value; }, 0) / prices.length, 2),
      highestPrice: Math.max.apply(null, prices),
      lowestPrice: Math.min.apply(null, prices),
      deliveryDays: latest.deliveryDays,
      rating: latest.rating,
      score: round_(latest.price * (1 + latest.deliveryDays / 100) * (1 + (5 - latest.rating) / 50), 2)
    };
  }).sort(function(a, b) { return a.score - b.score; });
  return { ranking: ranking, best: ranking[0] || null, history: history.sort(function(a, b) { return String(b.date).localeCompare(String(a.date)); }) };
}
