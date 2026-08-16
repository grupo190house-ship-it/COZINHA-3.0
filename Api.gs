/**
 * Fachada única usada pela SPA via google.script.run.
 */
function apiRequest(action, payload, token) {
  try {
    action = sanitizeText_(action, 100);
    if (action === 'media.upload') {
      payload = payload || {};
      payload = {
        name: sanitizeText_(payload.name, 150),
        mimeType: sanitizeText_(payload.mimeType, 100),
        base64: String(payload.base64 || '')
      };
    } else {
      payload = sanitizeObject_(payload || {});
    }
    var user = getCurrentUser_(token);
    var route = API_ROUTES_[action];
    if (!route) throw new Error('Ação de API desconhecida: ' + action);
    requireAccess_(user, route.resource, route.mutate === true);
    var result = route.handler(payload, user, token);
    return success_(result, route.message || '');
  } catch (error) {
    return failure_(error);
  }
}

var API_ROUTES_ = {
  'session.me': { resource: 'tarefas', handler: function(p, user) { return getApplicationBootstrap_(user); } },
  'session.logout': { resource: 'tarefas', mutate: true, handler: function(p, user, token) { logout_(token, user); return null; } },
  'profile.save': { resource: 'tarefas', mutate: true, handler: updateOwnProfile_ },
  'dashboard.get': { resource: 'dashboard', handler: function(p) { return getDashboardData_(p); } },
  'lookups.get': { resource: 'tarefas', handler: getLookups_ },
  'search.global': { resource: 'dashboard', handler: globalSearch_ },

  'insumos.list': { resource: 'insumos', handler: function() { return listCatalog_('INSUMOS'); } },
  'insumos.save': { resource: 'insumos', mutate: true, handler: function(p, u) { return saveCatalog_('INSUMOS', p, u); } },
  'insumos.delete': { resource: 'insumos', mutate: true, handler: function(p, u) { return deactivateCatalog_('INSUMOS', p.id, u); } },
  'produtos.list': { resource: 'produtos', handler: function() { return listCatalog_('PRODUTOS'); } },
  'produtos.save': { resource: 'produtos', mutate: true, handler: function(p, u) { return saveCatalog_('PRODUTOS', p, u); } },
  'produtos.delete': { resource: 'produtos', mutate: true, handler: function(p, u) { return deactivateCatalog_('PRODUTOS', p.id, u); } },
  'fornecedores.list': { resource: 'fornecedores', handler: listSuppliers_ },
  'fornecedores.save': { resource: 'fornecedores', mutate: true, handler: saveSupplier_ },
  'fornecedores.delete': { resource: 'fornecedores', mutate: true, handler: function(p, u) { return deactivateSupplier_(p.id, u); } },

  'estoque.overview': { resource: 'estoque', handler: stockOverview_ },
  'estoque.movements': { resource: 'estoque', handler: listMovements_ },
  'estoque.entry': { resource: 'estoque', mutate: true, handler: stockEntry_ },
  'estoque.exit': { resource: 'estoque', mutate: true, handler: stockExitManual_ },

  'producoes.list': { resource: 'producoes', handler: listProductions_ },
  'producoes.start': { resource: 'producoes', mutate: true, handler: startProduction_ },
  'producoes.finish': { resource: 'producoes', mutate: true, handler: finishProduction_ },
  'producoes.cancel': { resource: 'producoes', mutate: true, handler: cancelProduction_ },

  'tarefas.list': { resource: 'tarefas', handler: listTasks_ },
  'tarefas.assignees': { resource: 'tarefas', handler: listTaskAssignees_ },
  'tarefas.save': { resource: 'tarefas', mutate: true, handler: saveTask_ },
  'tarefas.start': { resource: 'tarefas', mutate: true, handler: startTask_ },
  'tarefas.complete': { resource: 'tarefas', mutate: true, handler: completeTask_ },
  'tarefas.cancel': { resource: 'tarefas', mutate: true, handler: cancelTask_ },
  'tarefas.reopen': { resource: 'tarefas', mutate: true, handler: reopenTask_ },
  'tarefas.evidence': { resource: 'tarefas', handler: getTaskEvidence_ },

  'perdas.list': { resource: 'perdas', handler: listLosses_ },
  'perdas.save': { resource: 'perdas', mutate: true, handler: registerLoss_ },
  'inventarios.list': { resource: 'inventarios', handler: listInventories_ },
  'inventarios.create': { resource: 'inventarios', mutate: true, handler: createInventory_ },
  'inventarios.count': { resource: 'inventarios', mutate: true, handler: countInventory_ },
  'inventarios.quick': { resource: 'inventarios', mutate: true, handler: quickInventory_ },

  'compras.list': { resource: 'compras', handler: listPurchaseRequests_ },
  'compras.refresh': { resource: 'compras', mutate: true, handler: function(p, u) { return refreshAutomaticPurchaseList_(u); } },
  'compras.save': { resource: 'compras', mutate: true, handler: savePurchaseRequest_ },
  'compras.receive': { resource: 'compras', mutate: true, handler: receivePurchaseList_ },
  'pedidos.list': { resource: 'compras', handler: listOrders_ },
  'pedidos.create': { resource: 'compras', mutate: true, handler: createOrder_ },
  'pedidos.receive': { resource: 'compras', mutate: true, handler: receiveOrder_ },
  'pedidos.pdf': { resource: 'compras', handler: generateOrderPdf_ },
  'precos.compare': { resource: 'fornecedores', handler: comparePrices_ },

  'operadores.list': { resource: 'operadores', handler: listOperators_ },
  'operadores.save': { resource: 'operadores', mutate: true, handler: saveOperator_ },
  'operadores.delete': { resource: 'operadores', mutate: true, handler: function(p, u) { return deactivateOperator_(p.id, u); } },
  'usuarios.list': { resource: 'operadores', handler: listUsers_ },
  'usuarios.save': { resource: 'operadores', mutate: true, handler: saveUser_ },

  'auditoria.list': { resource: 'auditoria', handler: listAudit_ },
  'notificacoes.list': { resource: 'notificacoes', handler: listNotifications_ },
  'notificacoes.read': { resource: 'notificacoes', mutate: true, handler: markNotificationRead_ },
  'notificacoes.refresh': { resource: 'notificacoes', mutate: true, handler: function(p, u) { return refreshNotifications_(u); } },
  'relatorios.generate': { resource: 'relatorios', handler: generateReport_ },
  'fechamento.get': { resource: 'relatorios', handler: getDayClosing_ },
  'fechamento.save': { resource: 'relatorios', mutate: true, handler: saveDayClosing_ },
  'fechamento.pdf': { resource: 'relatorios', handler: generateDayClosingPdf_ },
  'media.upload': { resource: 'tarefas', mutate: true, handler: uploadMedia_ },
  'config.get': { resource: 'dashboard', handler: getPublicConfig_ },
  'config.save': { resource: 'dashboard', mutate: true, handler: saveConfig_ }
};

function getApplicationBootstrap_(user) {
  return {
    user: publicUser_(user),
    acl: ACL[user.PERFIL] || [],
    config: getPublicConfig_(),
    enums: ENUMS,
    notifications: listNotifications_({ unreadOnly: true, limit: 8 }, user)
  };
}
