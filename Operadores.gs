/**
 * Cadastro operacional separado das credenciais administrativas.
 */
function listOperators_() {
  return listRows_('OPERADORES', { includeInactive: true }).map(function(row) {
    delete row.PIN_HASH;
    return row;
  });
}

function saveOperator_(data, user) {
  data = sanitizeObject_(data || {});
  requireFields_(data, ['NOME', 'CARGO']);
  var before = data.ID ? findById_('OPERADORES', data.ID, true) : null;
  var record = {
    ID: data.ID || '',
    FOTO: data.FOTO || '',
    NOME: sanitizeText_(data.NOME, 120),
    TELEFONE: sanitizeText_(data.TELEFONE, 30),
    EMAIL: normalizeEmail_(data.EMAIL),
    CARGO: sanitizeText_(data.CARGO, 80),
    FUNCAO: sanitizeText_(data.FUNCAO, 120),
    PERMISSAO: data.PERMISSAO || 'Operador',
    STATUS: data.STATUS || 'Ativo'
  };
  if (data.PIN) {
    if (!/^\d{4,8}$/.test(String(data.PIN))) throw new Error('O PIN deve conter de 4 a 8 números.');
    record.PIN_HASH = digest_(String(data.PIN));
  } else if (before) {
    record.PIN_HASH = before.PIN_HASH;
  }
  var saved = upsertById_('OPERADORES', record);
  audit_(before ? 'Alteração' : 'Inclusão', user, 'Operadores', 'OPERADORES', saved.ID, before, saved, '');
  delete saved.PIN_HASH;
  return saved;
}

function deactivateOperator_(id, user) {
  var before = findById_('OPERADORES', id, true);
  var after = softDelete_('OPERADORES', id);
  audit_('Exclusão lógica', user, 'Operadores', 'OPERADORES', id, before, after, '');
  delete after.PIN_HASH;
  return after;
}
