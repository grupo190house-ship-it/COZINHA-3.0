/**
 * Alertas persistentes e notificações.
 */
function listNotifications_(params, user) {
  params = params || {};
  var rows = listRows_('NOTIFICACOES', { includeInactive: true }).filter(function(row) {
    return ['PRODUTO_VENCIDO', 'PRODUTO_VENCENDO'].indexOf(row.TIPO) < 0 &&
      (!row.USUARIO_ID || !user || String(row.USUARIO_ID) === String(user.ID));
  });
  if (params.unreadOnly) rows = rows.filter(function(row) { return String(row.LIDA).toLowerCase() !== 'true'; });
  rows.sort(function(a, b) { return String(b.CRIADO_EM).localeCompare(String(a.CRIADO_EM)); });
  return rows.slice(0, Math.min(asNumber_(params.limit, 50), 200));
}

function markNotificationRead_(data, user) {
  if (data.all === true) {
    listNotifications_({ unreadOnly: true, limit: 200 }, user).forEach(function(row) {
      updateRow_('NOTIFICACOES', row.ID, { LIDA: true });
    });
    return { all: true };
  }
  var notification = findById_('NOTIFICACOES', data.id, true);
  if (!notification) throw new Error('Notificação não encontrada.');
  if (notification.USUARIO_ID && String(notification.USUARIO_ID) !== String(user.ID)) throw new Error('Notificação inválida.');
  return updateRow_('NOTIFICACOES', notification.ID, { LIDA: true });
}

function createNotificationOnce_(data) {
  var exists = findOne_('NOTIFICACOES', function(row) {
    return row.TIPO === data.TIPO &&
      String(row.REFERENCIA_ID) === String(data.REFERENCIA_ID) &&
      String(row.LIDA).toLowerCase() !== 'true';
  }, true);
  return exists || insertRow_('NOTIFICACOES', data);
}

function refreshNotifications_(user) {
  var created = 0;
  var balances = getBalanceMap_('INSUMO');
  listRows_('INSUMOS').forEach(function(input) {
    if (asNumber_(input.ESTOQUE_MINIMO) > 0 && asNumber_(balances[input.ID] || 0) <= asNumber_(input.ESTOQUE_MINIMO)) {
      if (!findOne_('NOTIFICACOES', function(row) { return row.TIPO === 'ESTOQUE_BAIXO' && String(row.REFERENCIA_ID) === String(input.ID) && String(row.LIDA).toLowerCase() !== 'true'; }, true)) created += 1;
      createNotificationOnce_({
        TIPO: 'ESTOQUE_BAIXO',
        TITULO: 'Estoque baixo',
        MENSAGEM: input.NOME + ' atingiu o estoque mínimo.',
        SEVERIDADE: 'warning',
        REFERENCIA_TIPO: 'INSUMOS',
        REFERENCIA_ID: input.ID,
        LIDA: false,
        USUARIO_ID: '',
        CRIADO_EM: nowIso_()
      });
    }
  });
  var today = todayIso_();
  listRows_('PEDIDOS', { includeInactive: true }).filter(function(row) {
    return ['Aprovado', 'Enviado', 'Parcial'].indexOf(row.STATUS) >= 0;
  }).forEach(function(order) {
    if (!findOne_('NOTIFICACOES', function(row) { return row.TIPO === 'PEDIDO_PENDENTE' && String(row.REFERENCIA_ID) === String(order.ID) && String(row.LIDA).toLowerCase() !== 'true'; }, true)) created += 1;
    createNotificationOnce_({
      TIPO: 'PEDIDO_PENDENTE',
      TITULO: 'Pedido de compra pendente',
      MENSAGEM: order.NUMERO + ' aguarda recebimento.',
      SEVERIDADE: 'info',
      REFERENCIA_TIPO: 'PEDIDOS',
      REFERENCIA_ID: order.ID,
      LIDA: false,
      USUARIO_ID: '',
      CRIADO_EM: nowIso_()
    });
  });
  listRows_('COMPRAS', { includeInactive: true }).filter(function(row) {
    return ['Solicitado', 'Em análise', 'Aprovado'].indexOf(row.STATUS) >= 0;
  }).forEach(function(request) {
    createNotificationOnce_({
      TIPO: 'COMPRA_PENDENTE',
      TITULO: 'Compra pendente',
      MENSAGEM: request.CODIGO + ' aguarda andamento.',
      SEVERIDADE: 'warning',
      REFERENCIA_TIPO: 'COMPRAS',
      REFERENCIA_ID: request.ID,
      LIDA: false,
      USUARIO_ID: '',
      CRIADO_EM: nowIso_()
    });
  });
  var pendingInventories = {};
  listRows_('INVENTARIOS', { includeInactive: true }).filter(function(row) {
    return row.STATUS === 'Pendente';
  }).forEach(function(inventory) { pendingInventories[inventory.NUMERO] = inventory; });
  Object.keys(pendingInventories).forEach(function(number) {
    createNotificationOnce_({
      TIPO: 'INVENTARIO_PENDENTE',
      TITULO: 'Inventário pendente',
      MENSAGEM: number + ' possui contagens em aberto.',
      SEVERIDADE: 'warning',
      REFERENCIA_TIPO: 'INVENTARIOS',
      REFERENCIA_ID: number,
      LIDA: false,
      USUARIO_ID: '',
      CRIADO_EM: nowIso_()
    });
  });
  var currentMinute = nowIso_().substring(0, 16);
  listRows_('TAREFAS', { includeInactive: true }).filter(function(row) {
    return row.PRAZO && ['A fazer', 'Em andamento'].indexOf(row.STATUS) >= 0 &&
      String(row.PRAZO).substring(0, 16) < currentMinute;
  }).forEach(function(task) {
    createNotificationOnce_({
      TIPO: 'TAREFA_ATRASADA',
      TITULO: 'Tarefa atrasada',
      MENSAGEM: task.TITULO + ' ultrapassou o prazo definido.',
      SEVERIDADE: 'danger',
      REFERENCIA_TIPO: 'TAREFAS',
      REFERENCIA_ID: task.ID,
      LIDA: false,
      USUARIO_ID: task.RESPONSAVEL_ID,
      CRIADO_EM: nowIso_()
    });
  });
  var todayLoss = listRows_('PERDAS').filter(function(row) {
    return String(row.DATA_HORA).substring(0, 10) === today;
  }).reduce(function(sum, row) { return sum + asNumber_(row.CUSTO); }, 0);
  var todayProductionCost = listRows_('PRODUCOES', { includeInactive: true }).filter(function(row) {
    return row.STATUS === 'Finalizada' && String(row.HORA_FIM).substring(0, 10) === today;
  }).reduce(function(sum, row) { return sum + asNumber_(row.CUSTO_TOTAL); }, 0);
  if (todayLoss > 0 && (todayProductionCost === 0 || todayLoss / todayProductionCost >= 0.05)) {
    createNotificationOnce_({
      TIPO: 'PERDA_ELEVADA',
      TITULO: 'Perda elevada',
      MENSAGEM: 'As perdas do dia somam R$ ' + round_(todayLoss, 2) + '.',
      SEVERIDADE: 'danger',
      REFERENCIA_TIPO: 'PERDAS',
      REFERENCIA_ID: today,
      LIDA: false,
      USUARIO_ID: '',
      CRIADO_EM: nowIso_()
    });
  }
  audit_('Atualização', user, 'Notificações', 'NOTIFICACOES', '', null, { created: created }, 'Alertas verificados');
  return { created: created };
}
