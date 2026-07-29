/**
 * Histórico imutável de ações relevantes.
 */
function audit_(action, user, screen, recordType, recordId, before, after, observation) {
  try {
    return insertRow_('AUDITORIA', {
      ACAO: action,
      USUARIO_ID: user && user.ID ? user.ID : 'SYSTEM',
      USUARIO_NOME: user && user.NOME ? user.NOME : 'Sistema',
      TELA: screen || '',
      REGISTRO_TIPO: recordType || '',
      REGISTRO_ID: recordId || '',
      DADOS_ANTES: before ? JSON.stringify(jsonSafe_(before)).substring(0, 45000) : '',
      DADOS_DEPOIS: after ? JSON.stringify(jsonSafe_(after)).substring(0, 45000) : '',
      OBSERVACAO: sanitizeText_(observation || '', 2000),
      DATA_HORA: nowIso_()
    });
  } catch (error) {
    console.error('Falha ao registrar auditoria: ' + (error.stack || error));
    return null;
  }
}

function listAudit_(params) {
  params = params || {};
  var rows = listRows_('AUDITORIA', { includeInactive: true });
  if (params.action) rows = rows.filter(function(row) { return row.ACAO === params.action; });
  if (params.userId) rows = rows.filter(function(row) { return String(row.USUARIO_ID) === String(params.userId); });
  if (params.from) rows = rows.filter(function(row) { return String(row.DATA_HORA) >= String(params.from); });
  if (params.to) rows = rows.filter(function(row) { return String(row.DATA_HORA) <= String(params.to) + 'T23:59:59'; });
  rows.sort(function(a, b) { return String(b.DATA_HORA).localeCompare(String(a.DATA_HORA)); });
  return rows.slice(0, Math.min(asNumber_(params.limit, 250), 1000));
}
