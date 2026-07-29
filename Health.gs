/**
 * Diagnóstico manual para validar a instalação após a publicação.
 * Execute healthCheck() no editor e confira o log/retorno.
 */
function healthCheck() {
  var report = {
    version: APP_CONFIG.VERSION,
    installed: PropertiesService.getScriptProperties().getProperty('INSTALLED') === 'true',
    databaseId: PropertiesService.getScriptProperties().getProperty('DATABASE_ID') || '',
    checkedAt: nowIso_(),
    sheets: {},
    errors: []
  };
  try {
    var database = getDatabase_();
    Object.keys(SHEETS).forEach(function(name) {
      var sheet = database.getSheetByName(name);
      var currentHeaders = sheet ? sheet.getRange(1, 1, 1, SHEETS[name].length).getDisplayValues()[0] : [];
      var valid = !!sheet && SHEETS[name].every(function(header, index) { return currentHeaders[index] === header; });
      report.sheets[name] = { exists: !!sheet, validHeaders: valid, rows: sheet ? Math.max(0, sheet.getLastRow() - 1) : 0 };
      if (!valid) report.errors.push('Estrutura inválida: ' + name);
    });
    var users = listRows_('USUARIOS', { includeInactive: true });
    if (!users.some(function(user) { return user.STATUS === 'Ativo' && user.PERFIL === 'Administrador'; })) {
      report.errors.push('Nenhum administrador ativo.');
    }
    report.ok = report.errors.length === 0;
  } catch (error) {
    report.ok = false;
    report.errors.push(error.message);
  }
  console.log(JSON.stringify(report, null, 2));
  return report;
}

/**
 * Reaplica cabeçalhos, estilos e gatilhos sem apagar dados.
 */
function repairInstallation() {
  var properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('DATABASE_ID')) throw new Error('Instalação não encontrada.');
  return setupSystem({});
}
