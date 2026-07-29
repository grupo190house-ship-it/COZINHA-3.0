/**
 * Fichas técnicas, itens e custo automático.
 */
function listRecipes_() {
  var products = {};
  listRows_('PRODUTOS', { includeInactive: true }).forEach(function(row) { products[row.ID] = row; });
  return listRows_('RECEITAS', { includeInactive: true }).map(function(recipe) {
    recipe.PRODUTO_NOME = products[recipe.PRODUTO_ID] ? products[recipe.PRODUTO_ID].NOME : '';
    recipe.ITENS_QTD = listRows_('RECEITAS_ITENS', { filter: { RECEITA_ID: recipe.ID } }).length;
    return recipe;
  });
}

function getRecipe_(id) {
  var recipe = findById_('RECEITAS', id, true);
  if (!recipe) throw new Error('Receita não encontrada.');
  recipe.ITENS = listRows_('RECEITAS_ITENS', { filter: { RECEITA_ID: id } });
  return recipe;
}

function saveRecipe_(data, user) {
  data = sanitizeObject_(data || {});
  requireFields_(data, ['PRODUTO_ID', 'NOME', 'RENDIMENTO']);
  if (!Array.isArray(data.ITENS) || !data.ITENS.length) throw new Error('Adicione ao menos um ingrediente.');
  var product = findById_('PRODUTOS', data.PRODUTO_ID);
  if (!product) throw new Error('Produto da receita não encontrado.');
  var before = data.ID ? getRecipe_(data.ID) : null;
  var inputs = {};
  listRows_('INSUMOS').forEach(function(row) { inputs[row.ID] = row; });
  var normalizedItems = data.ITENS.map(function(item) {
    if (!inputs[item.INSUMO_ID]) throw new Error('Ingrediente inválido na receita.');
    var quantity = asNumber_(item.QUANTIDADE);
    if (quantity <= 0) throw new Error('A quantidade de cada ingrediente deve ser maior que zero.');
    var unitCost = asNumber_(inputs[item.INSUMO_ID].PRECO_MEDIO || inputs[item.INSUMO_ID].PRECO_ATUAL);
    var recipeUnit = item.UNIDADE || inputs[item.INSUMO_ID].UNIDADE;
    var stockQuantity = convertQuantity_(quantity, recipeUnit, inputs[item.INSUMO_ID].UNIDADE);
    var adjustedUnitCost = quantity > 0 ? unitCost * stockQuantity / quantity : 0;
    return {
      INSUMO_ID: item.INSUMO_ID,
      QUANTIDADE: quantity,
      UNIDADE: recipeUnit,
      CUSTO_UNITARIO: round_(adjustedUnitCost, 6),
      CUSTO_TOTAL: round_(stockQuantity * unitCost, 4)
    };
  });
  var totalCost = round_(normalizedItems.reduce(function(sum, item) { return sum + item.CUSTO_TOTAL; }, 0), 4);
  var yieldQuantity = asNumber_(data.RENDIMENTO);
  if (yieldQuantity <= 0) throw new Error('O rendimento deve ser maior que zero.');
  var saved;
  withLock_(function() {
    saved = upsertById_('RECEITAS', {
      ID: data.ID || '',
      PRODUTO_ID: data.PRODUTO_ID,
      NOME: sanitizeText_(data.NOME, 160),
      MODO_PREPARO: sanitizeText_(data.MODO_PREPARO, 10000),
      TEMPO_MIN: Math.max(0, asNumber_(data.TEMPO_MIN)),
      RENDIMENTO: yieldQuantity,
      UNIDADE_RENDIMENTO: data.UNIDADE_RENDIMENTO || product.UNIDADE,
      PERDA_PREVISTA_PCT: Math.min(100, Math.max(0, asNumber_(data.PERDA_PREVISTA_PCT))),
      CUSTO_TOTAL: totalCost,
      CUSTO_UNIDADE: round_(totalCost / yieldQuantity, 4),
      STATUS: data.STATUS || 'Ativo'
    });
    if (before) {
      listRows_('RECEITAS_ITENS', { filter: { RECEITA_ID: saved.ID } }).forEach(function(oldItem) {
        updateRow_('RECEITAS_ITENS', oldItem.ID, { STATUS: 'Inativo' });
      });
    }
    writeRows_('RECEITAS_ITENS', normalizedItems.map(function(item) {
      item.RECEITA_ID = saved.ID;
      item.STATUS = 'Ativo';
      return item;
    }));
    updateRow_('PRODUTOS', product.ID, {
      RECEITA_ID: saved.ID,
      CUSTO: saved.CUSTO_UNIDADE,
      MARGEM: asNumber_(product.PRECO_VENDA) > 0 ? round_((asNumber_(product.PRECO_VENDA) - saved.CUSTO_UNIDADE) / asNumber_(product.PRECO_VENDA) * 100, 2) : 0
    });
  });
  var after = getRecipe_(saved.ID);
  audit_(before ? 'Alteração' : 'Inclusão', user, 'Receitas', 'RECEITAS', saved.ID, before, after, 'Custo recalculado automaticamente');
  return after;
}

function recalculateRecipesForIngredient_(inputId) {
  var recipeIds = listRows_('RECEITAS_ITENS').filter(function(item) {
    return String(item.INSUMO_ID) === String(inputId);
  }).map(function(item) { return item.RECEITA_ID; });
  recipeIds.filter(function(id, index, all) { return all.indexOf(id) === index; }).forEach(function(recipeId) {
    try {
      recalculateRecipeCost_(recipeId);
    } catch (error) {
      console.error('Falha ao recalcular receita ' + recipeId + ': ' + (error.stack || error));
    }
  });
}

function recalculateRecipeCost_(recipeId) {
  var recipe = findById_('RECEITAS', recipeId);
  if (!recipe) return null;
  var inputs = {};
  listRows_('INSUMOS').forEach(function(row) { inputs[row.ID] = row; });
  var items = listRows_('RECEITAS_ITENS', { filter: { RECEITA_ID: recipeId } });
  var total = 0;
  items.forEach(function(item) {
    var input = inputs[item.INSUMO_ID] || {};
    var cost = asNumber_(input.PRECO_MEDIO || input.PRECO_ATUAL);
    var stockQuantity = convertQuantity_(asNumber_(item.QUANTIDADE), item.UNIDADE || input.UNIDADE, input.UNIDADE);
    var adjustedCost = asNumber_(item.QUANTIDADE) > 0 ? cost * stockQuantity / asNumber_(item.QUANTIDADE) : 0;
    var itemTotal = round_(stockQuantity * cost, 4);
    updateRow_('RECEITAS_ITENS', item.ID, { CUSTO_UNITARIO: round_(adjustedCost, 6), CUSTO_TOTAL: itemTotal });
    total += itemTotal;
  });
  var unitCost = asNumber_(recipe.RENDIMENTO) > 0 ? round_(total / asNumber_(recipe.RENDIMENTO), 4) : 0;
  var updated = updateRow_('RECEITAS', recipeId, { CUSTO_TOTAL: round_(total, 4), CUSTO_UNIDADE: unitCost });
  var product = findById_('PRODUTOS', recipe.PRODUTO_ID);
  if (product) {
    updateRow_('PRODUTOS', product.ID, {
      CUSTO: unitCost,
      MARGEM: asNumber_(product.PRECO_VENDA) > 0 ? round_((asNumber_(product.PRECO_VENDA) - unitCost) / asNumber_(product.PRECO_VENDA) * 100, 2) : 0
    });
  }
  return updated;
}

function deactivateRecipe_(id, user) {
  var before = getRecipe_(id);
  var activeProduction = findOne_('PRODUCOES', function(row) {
    return String(row.RECEITA_ID) === String(id) && ['Planejada', 'Em produção'].indexOf(row.STATUS) >= 0;
  }, true);
  if (activeProduction) throw new Error('Há uma produção ativa vinculada a esta receita.');
  var after = softDelete_('RECEITAS', id);
  listRows_('RECEITAS_ITENS', { filter: { RECEITA_ID: id } }).forEach(function(item) {
    updateRow_('RECEITAS_ITENS', item.ID, { STATUS: 'Inativo' });
  });
  var product = findById_('PRODUTOS', before.PRODUTO_ID, true);
  if (product && String(product.RECEITA_ID) === String(id)) updateRow_('PRODUTOS', product.ID, { RECEITA_ID: '' });
  audit_('Exclusão lógica', user, 'Receitas', 'RECEITAS', id, before, after, '');
  return after;
}
