/**
 * Indicadores gerenciais e pesquisa global.
 */
function resolvePeriod_(params) {
  params = params || {};
  var end = dateValue_(params.to) || new Date();
  var start = dateValue_(params.from);
  var period = params.period || 'month';
  if (!start) {
    start = new Date(end.getTime());
    if (period === 'today') {
      // Mesmo dia.
    } else if (period === 'week') {
      start.setDate(start.getDate() - 6);
    } else if (period === 'year') {
      start.setMonth(0, 1);
    } else {
      start.setDate(1);
    }
  }
  return {
    from: Utilities.formatDate(start, APP_CONFIG.TIMEZONE, 'yyyy-MM-dd'),
    to: Utilities.formatDate(end, APP_CONFIG.TIMEZONE, 'yyyy-MM-dd')
  };
}

function inPeriod_(value, period) {
  var date = String(value || '').substring(0, 10);
  return date >= period.from && date <= period.to;
}

function getDashboardData_(params) {
  return cacheGetOrLoad_('dashboard', function() {
    var inputs = listRows_('INSUMOS');
    var products = listRows_('PRODUTOS');
    var productions = listRows_('PRODUCOES', { includeInactive: true });
    var losses = listRows_('PERDAS');
    var purchases = listRows_('COMPRAS', { includeInactive: true });
    var inventories = listRows_('INVENTARIOS', { includeInactive: true });
    var inputBalance = getBalanceMap_('INSUMO');
    var productBalance = getBalanceMap_('PRODUTO');
    var today = todayIso_();
    var lowStock = inputs.filter(function(item) {
      return asNumber_(item.ESTOQUE_MINIMO) > 0 && asNumber_(inputBalance[item.ID] || 0) <= asNumber_(item.ESTOQUE_MINIMO);
    });
    var finalizedToday = productions.filter(function(row) {
      return row.STATUS === 'Finalizada' && String(row.HORA_FIM || row.CRIADO_EM).substring(0, 10) === today;
    });
    var activeProductions = productions.filter(function(row) { return row.STATUS === 'Em produção'; });
    var productionToday = finalizedToday
      .reduce(function(sum, row) { return sum + asNumber_(row.QTD_PRODUZIDA); }, 0);
    var lossQuantityToday = losses.filter(function(row) {
      return String(row.DATA_HORA).substring(0, 10) === today;
    }).reduce(function(sum, row) { return sum + asNumber_(row.QUANTIDADE); }, 0);
    var lossCostToday = losses.filter(function(row) {
      return String(row.DATA_HORA).substring(0, 10) === today;
    }).reduce(function(sum, row) { return sum + asNumber_(row.CUSTO); }, 0);
    var purchasePending = purchases.filter(function(row) {
      return ['Recebido', 'Cancelado'].indexOf(row.STATUS) < 0;
    });
    var inventoryPending = inventories.filter(function(row) { return row.STATUS === 'Pendente'; }).length;
    var productsInStock = products.filter(function(item) { return asNumber_(productBalance[item.ID] || 0) > 0; }).length;
    var productMap = {};
    products.forEach(function(row) { productMap[row.ID] = row.NOME; });
    var operatorMap = {};
    listRows_('OPERADORES', { includeInactive: true }).forEach(function(row) { operatorMap[row.ID] = row.NOME; });
    listRows_('USUARIOS', { includeInactive: true }).forEach(function(row) { operatorMap[row.ID] = row.NOME; });

    var onboardingSteps = [
      { key: 'inputs', label: 'Cadastrar insumos', module: 'insumos', complete: inputs.length > 0 },
      {
        key: 'levels',
        label: 'Definir estoques mínimo e máximo',
        module: 'insumos',
        complete: inputs.length > 0 && inputs.every(function(item) {
          return asNumber_(item.ESTOQUE_MINIMO) > 0 && asNumber_(item.ESTOQUE_MAXIMO) >= asNumber_(item.ESTOQUE_MINIMO);
        })
      },
      { key: 'products', label: 'Cadastrar produtos produzidos', module: 'produtos', complete: products.length > 0 },
      { key: 'operators', label: 'Cadastrar operadores', module: 'operadores', complete: listRows_('OPERADORES').length > 0 },
      {
        key: 'stock',
        label: 'Registrar a primeira entrada de estoque',
        module: 'estoque',
        complete: listRows_('ESTOQUE').some(function(lot) { return asNumber_(lot.QUANTIDADE_INICIAL) > 0; })
      }
    ];

    return {
      date: today,
      cards: {
        lowStock: lowStock.length,
        productionToday: round_(productionToday, 2),
        productionsInProgress: activeProductions.length,
        productsInStock: productsInStock,
        pendingPurchases: purchasePending.length,
        lossesToday: round_(lossCostToday, 2),
        lossQuantityToday: round_(lossQuantityToday, 2),
        pendingInventories: inventoryPending,
      },
      lowStock: lowStock.slice(0, 8).map(function(item) {
        return {
          id: item.ID,
          name: item.NOME,
          balance: round_(inputBalance[item.ID] || 0, 4),
          minimum: asNumber_(item.ESTOQUE_MINIMO),
          unit: item.UNIDADE
        };
      }),
      activeProductions: activeProductions.sort(function(a, b) {
        return String(b.HORA_INICIO).localeCompare(String(a.HORA_INICIO));
      }).slice(0, 6).map(function(row) {
        return {
          id: row.ID,
          code: row.CODIGO,
          product: productMap[row.PRODUTO_ID] || 'Produto',
          operator: operatorMap[row.OPERADOR_ID] || 'Não informado',
          startedAt: row.HORA_INICIO
        };
      }),
      alerts: lowStock.slice(0, 5).map(function(item) {
        return { type: 'warning', title: item.NOME, message: 'Saldo ' + round_(inputBalance[item.ID] || 0, 2) + ' / mínimo ' + item.ESTOQUE_MINIMO };
      }),
      onboarding: {
        complete: onboardingSteps.every(function(step) { return step.complete; }),
        completed: onboardingSteps.filter(function(step) { return step.complete; }).length,
        total: onboardingSteps.length,
        steps: onboardingSteps
      }
    };
  }, 60);
}

function groupSum_(rows, keyFn, valueFn) {
  var grouped = {};
  rows.forEach(function(row) {
    var key = keyFn(row);
    grouped[key] = (grouped[key] || 0) + valueFn(row);
  });
  return grouped;
}

function chartSeries_(grouped) {
  var labels = Object.keys(grouped).sort();
  return { labels: labels, values: labels.map(function(label) { return round_(grouped[label], 2); }) };
}

function getLookups_() {
  return cacheGetOrLoad_('lookups:v2', function() {
    function compact(name, label) {
      return listRows_(name).map(function(row) {
        return { id: row.ID, code: row.CODIGO || row.NUMERO || '', name: row[label] || row.NOME || '' };
      });
    }
    var operatorLookup = listRows_('OPERADORES').map(function(row) { return { id: row.ID, name: row.NOME }; });
    listRows_('USUARIOS').forEach(function(row) {
      if (!operatorLookup.some(function(item) { return String(item.id) === String(row.ID); })) {
        operatorLookup.push({ id: row.ID, name: row.NOME });
      }
    });
    return {
      inputs: compact('INSUMOS', 'NOME'),
      products: compact('PRODUTOS', 'NOME'),
      suppliers: listRows_('FORNECEDORES').map(function(row) { return { id: row.ID, code: row.CODIGO, name: row.NOME_FANTASIA || row.RAZAO_SOCIAL }; }),
      operators: operatorLookup,
      units: ENUMS.UNIDADES,
      roles: ROLES
    };
  });
}

function globalSearch_(params) {
  var query = sanitizeText_(params && params.query, 100).toLowerCase();
  if (query.length < 2) return [];
  var definitions = [
    { sheet: 'INSUMOS', type: 'Insumo', fields: ['CODIGO', 'NOME', 'CATEGORIA', 'CODIGO_BARRAS'] },
    { sheet: 'PRODUTOS', type: 'Produto', fields: ['CODIGO', 'NOME', 'CATEGORIA', 'CODIGO_BARRAS'] },
    { sheet: 'FORNECEDORES', type: 'Fornecedor', fields: ['CODIGO', 'RAZAO_SOCIAL', 'NOME_FANTASIA', 'CNPJ'] },
    { sheet: 'PEDIDOS', type: 'Pedido', fields: ['NUMERO', 'NOTA_FISCAL', 'STATUS'] },
    { sheet: 'OPERADORES', type: 'Operador', fields: ['NOME', 'EMAIL', 'CARGO'] },
    { sheet: 'ESTOQUE', type: 'Lote', fields: ['LOTE', 'LOCALIZACAO'] }
  ];
  var results = [];
  definitions.some(function(definition) {
    listRows_(definition.sheet, { includeInactive: true }).some(function(row) {
      var match = definition.fields.some(function(field) { return String(row[field] || '').toLowerCase().indexOf(query) >= 0; });
      if (match) {
        results.push({
          id: row.ID,
          type: definition.type,
          title: row.NOME || row.NOME_FANTASIA || row.RAZAO_SOCIAL || row.NUMERO || row.LOTE || row.CODIGO,
          subtitle: row.CATEGORIA || row.STATUS || row.EMAIL || '',
          module: definition.sheet.toLowerCase()
        });
      }
      return results.length >= 20;
    });
    return results.length >= 20;
  });
  return results;
}
