/**
 * Configurações editáveis do aplicativo.
 */
function getPublicConfig_() {
  var output = {};
  listRows_('CONFIG', { includeInactive: true }).forEach(function(row) {
    if (['APP_NAME', 'COMPANY_NAME', 'CURRENCY', 'VERSION'].indexOf(row.CHAVE) >= 0) output[row.CHAVE] = row.VALOR;
  });
  return output;
}

function getConfigValue_(key, fallback) {
  try {
    var row = findOne_('CONFIG', function(item) { return item.CHAVE === key; }, true);
    return row && row.VALOR !== '' ? row.VALOR : fallback;
  } catch (ignored) {
    return fallback;
  }
}

function saveConfig_(data, user) {
  if (user.PERFIL !== 'Administrador') throw new Error('Somente administradores podem alterar configurações.');
  data = sanitizeObject_(data || {});
  var allowed = ['APP_NAME', 'COMPANY_NAME', 'CURRENCY'];
  Object.keys(data).forEach(function(key) {
    if (allowed.indexOf(key) < 0) return;
    var row = findOne_('CONFIG', function(item) { return item.CHAVE === key; }, true);
    if (!row) throw new Error('Configuração não encontrada: ' + key);
    var value = sanitizeText_(data[key], 200);
    getSheet_('CONFIG').getRange(row._row, 2).setValue(value);
    getSheet_('CONFIG').getRange(row._row, 4).setValue(nowIso_());
  });
  clearAppCache_();
  audit_('Alteração', user, 'Configurações', 'CONFIG', '', null, data, '');
  return getPublicConfig_();
}
