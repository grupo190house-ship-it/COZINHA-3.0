/**
 * Solicitações, pedidos e recebimento de compras.
 */
function listPurchaseRequests_() {
  var inputs = {};
  var suppliers = {};
  listRows_('INSUMOS', { includeInactive: true }).forEach(function(row) { inputs[row.ID] = row; });
  listRows_('FORNECEDORES', { includeInactive: true }).forEach(function(row) { suppliers[row.ID] = row; });
  return listRows_('COMPRAS', { includeInactive: true }).map(function(row) {
    var input = inputs[row.INSUMO_ID] || {};
    row.INSUMO_NOME = input.NOME || '';
    row.UNIDADE = input.UNIDADE || '';
    row.ESTOQUE_MAXIMO = asNumber_(input.ESTOQUE_MAXIMO);
    row.QUANTIDADE_COMPRAR = asNumber_(row.QUANTIDADE_APROVADA) > 0
      ? asNumber_(row.QUANTIDADE_APROVADA)
      : asNumber_(row.QUANTIDADE_SUGERIDA);
    row.STATUS_RESUMO = row.STATUS === 'Recebido' ? 'Recebido' :
      (row.STATUS === 'Comprado' ? 'Comprado' :
        (row.STATUS === 'Cancelado' ? 'Cancelado' : 'Pendente'));
    row.FORNECEDOR_NOME = suppliers[row.FORNECEDOR_ID] ? (suppliers[row.FORNECEDOR_ID].NOME_FANTASIA || suppliers[row.FORNECEDOR_ID].RAZAO_SOCIAL) : '';
    return row;
  }).sort(function(a, b) { return String(b.CRIADO_EM).localeCompare(String(a.CRIADO_EM)); });
}

function refreshAutomaticPurchaseList_(user) {
  return withLock_(function() {
    var balances = getBalanceMap_('INSUMO');
    var created = 0;
    var updated = 0;
    listRows_('INSUMOS').forEach(function(input) {
    var balance = round_(balances[input.ID] || 0, 4);
    var minimum = asNumber_(input.ESTOQUE_MINIMO);
    var maximum = asNumber_(input.ESTOQUE_MAXIMO);
    if (minimum <= 0 || balance > minimum) return;
    var open = findOne_('COMPRAS', function(row) {
      return String(row.INSUMO_ID) === String(input.ID) && ['Recebido', 'Cancelado'].indexOf(row.STATUS) < 0;
    }, true);
    var suggestion = Math.max(0, round_(maximum - balance, 4));
    if (open) {
      updateRow_('COMPRAS', open.ID, {
        ESTOQUE_ATUAL: balance,
        ESTOQUE_MINIMO: minimum,
        QUANTIDADE_SUGERIDA: suggestion
      });
      updated += 1;
    } else {
      insertRow_('COMPRAS', {
        CODIGO: generateCode_('SOL'),
        INSUMO_ID: input.ID,
        CATEGORIA: input.CATEGORIA,
        FORNECEDOR_ID: input.FORNECEDOR_PREFERENCIAL || '',
        ESTOQUE_ATUAL: balance,
        ESTOQUE_MINIMO: minimum,
        QUANTIDADE_SUGERIDA: suggestion,
        QUANTIDADE_APROVADA: 0,
        STATUS: 'Solicitado',
        SOLICITANTE_ID: user && user.ID ? user.ID : 'SYSTEM',
        APROVADOR_ID: '',
        DATA: todayIso_(),
        OBSERVACOES: 'Gerado automaticamente por estoque mínimo'
      });
      created += 1;
    }
    });
    if (created) audit_('Inclusão automática', user, 'Compras', 'COMPRAS', '', null, { created: created }, 'Itens abaixo do estoque mínimo');
    return { created: created, updated: updated };
  });
}

function savePurchaseRequest_(data, user) {
  data = sanitizeObject_(data || {});
  var before = data.ID ? findById_('COMPRAS', data.ID, true) : null;
  if (!before) {
    requireFields_(data, ['INSUMO_ID']);
    var input = findById_('INSUMOS', data.INSUMO_ID);
    if (!input) throw new Error('Insumo não encontrado.');
    data.CODIGO = generateCode_('SOL');
    data.CATEGORIA = input.CATEGORIA;
    data.ESTOQUE_ATUAL = getStockBalance_('INSUMO', input.ID);
    data.ESTOQUE_MINIMO = input.ESTOQUE_MINIMO;
    data.QUANTIDADE_SUGERIDA = Math.max(0, asNumber_(input.ESTOQUE_MAXIMO) - asNumber_(data.ESTOQUE_ATUAL));
    data.SOLICITANTE_ID = user.ID;
    data.DATA = todayIso_();
  }
  var status = data.STATUS || (before && before.STATUS) || 'Solicitado';
  assertEnum_(status, ENUMS.STATUS_COMPRA, 'Status da compra');
  if (['Aprovado', 'Comprado'].indexOf(status) >= 0 && asNumber_(data.QUANTIDADE_APROVADA || (before && before.QUANTIDADE_APROVADA)) <= 0) {
    throw new Error('Informe a quantidade aprovada.');
  }
  if (status === 'Aprovado') data.APROVADOR_ID = user.ID;
  var saved = upsertById_('COMPRAS', data);
  audit_(before ? 'Alteração' : 'Inclusão', user, 'Compras', 'COMPRAS', saved.ID, before, saved, '');
  return saved;
}

function receivePurchaseList_(data, user) {
  data = sanitizeObject_(data || {});
  var items = Array.isArray(data.ITENS) ? data.ITENS : [];
  if (!items.length) throw new Error('Selecione ao menos um item para receber.');
  var arrivalDate = dateValue_(data.DATA_ENTRADA || todayIso_());
  if (!arrivalDate) throw new Error('Informe uma data de chegada válida.');
  if (arrivalDate.getTime() > dateValue_(todayIso_()).getTime()) throw new Error('A data de chegada não pode ser futura.');
  var arrivalTimestamp = Utilities.formatDate(arrivalDate, APP_CONFIG.TIMEZONE, "yyyy-MM-dd'T'12:00:00");
  var received = [];
  withLock_(function() {
    items.forEach(function(itemData) {
      var request = findById_('COMPRAS', itemData.ID, true);
      if (!request || ['Recebido', 'Cancelado'].indexOf(request.STATUS) >= 0) {
        throw new Error('Um item selecionado não está mais disponível para recebimento.');
      }
      var input = findById_('INSUMOS', request.INSUMO_ID);
      if (!input) throw new Error('Insumo da lista de compras não encontrado.');
      var quantity = asNumber_(itemData.QUANTIDADE_RECEBIDA || request.QUANTIDADE_APROVADA || request.QUANTIDADE_SUGERIDA);
      if (quantity <= 0) throw new Error('Informe a quantidade recebida de ' + input.NOME + '.');
      var result = addStockLot_('INSUMO', {
        itemId: input.ID,
        lot: itemData.LOTE || generateCode_('LOTE'),
        quantity: quantity,
        unitCost: asNumber_(input.PRECO_MEDIO || input.PRECO_ATUAL),
        supplierId: itemData.FORNECEDOR_ID || request.FORNECEDOR_ID || '',
        location: '',
        entryAt: arrivalTimestamp,
        dateTime: arrivalTimestamp,
        referenceType: 'LISTA_COMPRAS',
        referenceId: request.ID,
        operatorId: data.OPERADOR_ID || user.ID,
        justification: 'Recebimento pela lista de compras'
      });
      var after = updateRow_('COMPRAS', request.ID, {
        QUANTIDADE_APROVADA: quantity,
        FORNECEDOR_ID: itemData.FORNECEDOR_ID || request.FORNECEDOR_ID || '',
        STATUS: 'Recebido',
        OBSERVACOES: sanitizeText_(itemData.OBSERVACOES || request.OBSERVACOES, 2000)
      });
      received.push({ request: after, stock: result });
    });
  });
  audit_('Recebimento pela lista', user, 'Compras', 'COMPRAS', '', null, { items: received.length }, 'Entrada direta no estoque');
  refreshAutomaticPurchaseList_(user);
  return { received: received.length };
}

function listOrders_() {
  var suppliers = {};
  var inputs = {};
  listRows_('FORNECEDORES', { includeInactive: true }).forEach(function(row) { suppliers[row.ID] = row; });
  listRows_('INSUMOS', { includeInactive: true }).forEach(function(row) { inputs[row.ID] = row; });
  var items = listRows_('PEDIDOS_ITENS', { includeInactive: true });
  return listRows_('PEDIDOS', { includeInactive: true }).map(function(order) {
    order.FORNECEDOR_NOME = suppliers[order.FORNECEDOR_ID] ? (suppliers[order.FORNECEDOR_ID].NOME_FANTASIA || suppliers[order.FORNECEDOR_ID].RAZAO_SOCIAL) : '';
    order.ITENS = items.filter(function(item) { return String(item.PEDIDO_ID) === String(order.ID); }).map(function(item) {
      item.INSUMO_NOME = inputs[item.INSUMO_ID] ? inputs[item.INSUMO_ID].NOME : '';
      return item;
    });
    return order;
  }).sort(function(a, b) { return String(b.CRIADO_EM).localeCompare(String(a.CRIADO_EM)); });
}

function createOrder_(data, user) {
  data = sanitizeObject_(data || {});
  requireFields_(data, ['FORNECEDOR_ID']);
  var supplier = findById_('FORNECEDORES', data.FORNECEDOR_ID);
  if (!supplier) throw new Error('Fornecedor não encontrado ou inativo.');
  var requestIds = Array.isArray(data.REQUEST_IDS) ? data.REQUEST_IDS : [];
  var items = Array.isArray(data.ITENS) ? data.ITENS : [];
  if (requestIds.length) {
    items = requestIds.map(function(id) {
      var request = findById_('COMPRAS', id, true);
      if (!request || ['Aprovado', 'Em análise', 'Solicitado'].indexOf(request.STATUS) < 0) throw new Error('Solicitação inválida para o pedido.');
      return {
        requestId: request.ID,
        INSUMO_ID: request.INSUMO_ID,
        QUANTIDADE: asNumber_(request.QUANTIDADE_APROVADA || request.QUANTIDADE_SUGERIDA),
        PRECO: asNumber_(request.PRECO || 0)
      };
    });
  }
  if (!items.length) throw new Error('Adicione ao menos um item ao pedido.');
  items.forEach(function(item) {
    if (!findById_('INSUMOS', item.INSUMO_ID)) throw new Error('Insumo inválido no pedido.');
    if (asNumber_(item.QUANTIDADE) <= 0) throw new Error('Quantidade inválida no pedido.');
  });
  var total = round_(items.reduce(function(sum, item) { return sum + asNumber_(item.QUANTIDADE) * asNumber_(item.PRECO); }, 0), 2);
  var order;
  withLock_(function() {
    order = insertRow_('PEDIDOS', {
      NUMERO: generateCode_('PC'),
      FORNECEDOR_ID: data.FORNECEDOR_ID,
      VALOR_TOTAL: total,
      RESPONSAVEL_ID: user.ID,
      DATA: data.DATA || todayIso_(),
      PREVISAO_ENTREGA: data.PREVISAO_ENTREGA || '',
      NOTA_FISCAL: '',
      OBSERVACOES: sanitizeText_(data.OBSERVACOES, 2000),
      STATUS: 'Aprovado'
    });
    writeRows_('PEDIDOS_ITENS', items.map(function(item) {
      return {
        PEDIDO_ID: order.ID,
        INSUMO_ID: item.INSUMO_ID,
        QUANTIDADE: asNumber_(item.QUANTIDADE),
        QUANTIDADE_RECEBIDA: 0,
        PRECO: asNumber_(item.PRECO),
        VALOR_TOTAL: round_(asNumber_(item.QUANTIDADE) * asNumber_(item.PRECO), 2),
        LOTE: '',
        VALIDADE: '',
        DIVERGENCIA: '',
        STATUS: 'Pendente'
      };
    }));
    items.forEach(function(item) {
      if (item.requestId) updateRow_('COMPRAS', item.requestId, { STATUS: 'Comprado', FORNECEDOR_ID: data.FORNECEDOR_ID });
    });
  });
  audit_('Pedido de compra', user, 'Compras', 'PEDIDOS', order.ID, null, order, '');
  return order;
}

function receiveOrder_(data, user) {
  data = sanitizeObject_(data || {});
  requireFields_(data, ['ID', 'NOTA_FISCAL']);
  var order = findById_('PEDIDOS', data.ID, true);
  if (!order || ['Recebido', 'Cancelado'].indexOf(order.STATUS) >= 0) throw new Error('Pedido não disponível para recebimento.');
  var orderItems = listRows_('PEDIDOS_ITENS', { filter: { PEDIDO_ID: order.ID } });
  var receivedData = Array.isArray(data.ITENS) ? data.ITENS : [];
  if (!receivedData.length) throw new Error('Informe os itens recebidos.');
  var received = [];
  withLock_(function() {
    order = findById_('PEDIDOS', data.ID, true);
    if (!order || ['Recebido', 'Cancelado'].indexOf(order.STATUS) >= 0) throw new Error('O pedido foi alterado por outra operação.');
    orderItems = listRows_('PEDIDOS_ITENS', { filter: { PEDIDO_ID: order.ID } });
    receivedData.forEach(function(receipt) {
      var item = orderItems.find(function(row) { return String(row.ID) === String(receipt.ID); });
      if (!item) throw new Error('Item não pertence ao pedido.');
      var quantity = asNumber_(receipt.QUANTIDADE_RECEBIDA);
      var remaining = Math.max(0, asNumber_(item.QUANTIDADE) - asNumber_(item.QUANTIDADE_RECEBIDA));
      if (remaining <= 0) throw new Error('O item já foi recebido integralmente.');
      if (quantity <= 0 || quantity > remaining * 2) throw new Error('Quantidade recebida inválida para ' + item.INSUMO_ID + '.');
      requireFields_(receipt, ['LOTE']);
    });
    receivedData.forEach(function(receipt) {
      var item = orderItems.find(function(row) { return String(row.ID) === String(receipt.ID); });
      if (!item) throw new Error('Item não pertence ao pedido.');
      var quantity = asNumber_(receipt.QUANTIDADE_RECEBIDA);
      var alreadyReceived = asNumber_(item.QUANTIDADE_RECEBIDA);
      var remaining = Math.max(0, asNumber_(item.QUANTIDADE) - alreadyReceived);
      if (remaining <= 0) throw new Error('O item já foi recebido integralmente.');
      if (quantity <= 0 || (remaining > 0 && quantity > remaining * 2)) throw new Error('Quantidade recebida inválida para ' + item.INSUMO_ID + '.');
      requireFields_(receipt, ['LOTE']);
      var price = asNumber_(receipt.PRECO || item.PRECO);
      var entry = addStockLot_('INSUMO', {
        itemId: item.INSUMO_ID,
        lot: receipt.LOTE,
        quantity: quantity,
        unitCost: price,
        supplierId: order.FORNECEDOR_ID,
        location: receipt.LOCALIZACAO || '',
        referenceType: 'PEDIDO',
        referenceId: order.ID,
        operatorId: data.OPERADOR_ID || user.ID,
        justification: 'Recebimento da NF ' + data.NOTA_FISCAL
      });
      var totalReceived = round_(alreadyReceived + quantity, 4);
      var quantityDivergence = round_(totalReceived - asNumber_(item.QUANTIDADE), 4);
      var priceDivergence = round_(price - asNumber_(item.PRECO), 4);
      var divergenceParts = [];
      if (quantityDivergence > 0) divergenceParts.push('Quantidade: +' + quantityDivergence);
      if (priceDivergence !== 0) divergenceParts.push('Preço: ' + (priceDivergence > 0 ? '+' : '') + priceDivergence);
      updateRow_('PEDIDOS_ITENS', item.ID, {
        QUANTIDADE_RECEBIDA: totalReceived,
        PRECO: price,
        VALOR_TOTAL: round_(asNumber_(item.QUANTIDADE) * price, 2),
        LOTE: receipt.LOTE,
        VALIDADE: '',
        DIVERGENCIA: divergenceParts.join('; '),
        STATUS: totalReceived >= asNumber_(item.QUANTIDADE) ? 'Recebido' : 'Parcial'
      });
      updateInputAverageCost_(item.INSUMO_ID, price);
      received.push(entry);
    });
    var refreshedItems = listRows_('PEDIDOS_ITENS', { filter: { PEDIDO_ID: order.ID } });
    var complete = refreshedItems.every(function(item) { return asNumber_(item.QUANTIDADE_RECEBIDA) >= asNumber_(item.QUANTIDADE); });
    updateRow_('PEDIDOS', order.ID, {
      NOTA_FISCAL: sanitizeText_(data.NOTA_FISCAL, 80),
      STATUS: complete ? 'Recebido' : 'Parcial'
    });
    refreshedItems.forEach(function(item) {
      if (asNumber_(item.QUANTIDADE_RECEBIDA) > 0) {
        listRows_('COMPRAS', { includeInactive: true }).filter(function(request) {
          return String(request.INSUMO_ID) === String(item.INSUMO_ID) && request.STATUS === 'Comprado';
        }).forEach(function(request) { updateRow_('COMPRAS', request.ID, { STATUS: complete ? 'Recebido' : 'Comprado' }); });
      }
    });
  });
  audit_('Recebimento de compra', user, 'Compras', 'PEDIDOS', order.ID, order, findById_('PEDIDOS', order.ID, true), 'NF ' + data.NOTA_FISCAL);
  refreshAutomaticPurchaseList_(user);
  return { order: findById_('PEDIDOS', order.ID, true), received: received };
}
