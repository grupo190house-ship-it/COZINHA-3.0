/**
 * Entrada do Web App e instalação inicial.
 */
function doGet() {
  var template = HtmlService.createTemplateFromFile('index');
  template.appName = APP_CONFIG.APP_NAME;
  template.version = APP_CONFIG.VERSION;
  return template.evaluate()
    .setTitle(APP_CONFIG.APP_NAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Cria ou atualiza o banco. Pode ser executado manualmente ou pela tela inicial.
 */
function setupSystem(options) {
  options = sanitizeObject_(options || {});
  return withLock_(function() {
    var properties = PropertiesService.getScriptProperties();
    if (options.initialOnly === true && properties.getProperty('INSTALLED') === 'true') {
      throw new Error('O sistema já foi configurado.');
    }
    var spreadsheet;
    var existingId = properties.getProperty('DATABASE_ID');
    if (existingId) {
      spreadsheet = SpreadsheetApp.openById(existingId);
    } else if (options.spreadsheetId) {
      spreadsheet = SpreadsheetApp.openById(options.spreadsheetId);
      properties.setProperty('DATABASE_ID', spreadsheet.getId());
    } else {
      spreadsheet = SpreadsheetApp.create(APP_CONFIG.APP_NAME + ' — Banco de Dados');
      properties.setProperty('DATABASE_ID', spreadsheet.getId());
    }

    Object.keys(SHEETS).forEach(function(name) {
      var sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
      var expected = SHEETS[name];
      if (sheet.getMaxColumns() < expected.length) {
        sheet.insertColumnsAfter(sheet.getMaxColumns(), expected.length - sheet.getMaxColumns());
      }
      sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
      applySheetStyle_(sheet, expected.length);
    });

    var defaultSheet = spreadsheet.getSheetByName('Sheet1') || spreadsheet.getSheetByName('Página1');
    if (defaultSheet && !SHEETS[defaultSheet.getName()] && spreadsheet.getSheets().length > 1) {
      spreadsheet.deleteSheet(defaultSheet);
    }

    seedConfiguration_(options);
    var users = listRows_('USUARIOS', { includeInactive: true });
    if (!users.length) {
      requireFields_(options, ['adminName', 'adminEmail', 'adminPassword']);
      validatePassword_(options.adminPassword);
      createUserInternal_({
        NOME: options.adminName,
        EMAIL: options.adminEmail,
        SENHA: options.adminPassword,
        PERFIL: 'Administrador',
        STATUS: 'Ativo'
      }, { ID: 'SYSTEM', NOME: 'Instalação' });
    }
    installTriggers_();
    properties.setProperties({
      INSTALLED: 'true',
      APP_VERSION: APP_CONFIG.VERSION,
      INSTALLED_AT: properties.getProperty('INSTALLED_AT') || nowIso_()
    });
    return {
      installed: true,
      spreadsheetId: spreadsheet.getId(),
      spreadsheetUrl: spreadsheet.getUrl(),
      version: APP_CONFIG.VERSION
    };
  });
}

function seedConfiguration_(options) {
  var defaults = {
    APP_NAME: APP_CONFIG.APP_NAME,
    COMPANY_NAME: APP_CONFIG.COMPANY_NAME,
    CURRENCY: 'BRL',
    NEGATIVE_STOCK: 'false',
    VERSION: APP_CONFIG.VERSION
  };
  var explicit = {
    APP_NAME: options.appName,
    COMPANY_NAME: options.companyName
  };
  Object.keys(defaults).forEach(function(key) {
    var existing = findOne_('CONFIG', function(row) { return row.CHAVE === key; }, true);
    var value = key === 'VERSION'
      ? APP_CONFIG.VERSION
      : (explicit[key] || (existing && existing.VALOR) || defaults[key]);
    var data = { CHAVE: key, VALOR: value, DESCRICAO: 'Configuração do sistema', ATUALIZADO_EM: nowIso_() };
    if (existing) {
      getSheet_('CONFIG').getRange(existing._row, 1, 1, SHEETS.CONFIG.length)
        .setValues([[data.CHAVE, data.VALOR, data.DESCRICAO, data.ATUALIZADO_EM]]);
    } else {
      getSheet_('CONFIG').appendRow(SHEETS.CONFIG.map(function(header) { return data[header] || ''; }));
    }
  });
}

function installTriggers_() {
  var handlers = ScriptApp.getProjectTriggers().map(function(trigger) { return trigger.getHandlerFunction(); });
  if (handlers.indexOf('scheduledMaintenance') < 0) {
    ScriptApp.newTrigger('scheduledMaintenance').timeBased().everyDays(1).atHour(6).create();
  }
}

function scheduledMaintenance() {
  try {
    refreshAutomaticPurchaseList_({ ID: 'SYSTEM', NOME: 'Rotina automática' });
    refreshNotifications_({ ID: 'SYSTEM', NOME: 'Rotina automática' });
    purgeExpiredSessions_();
  } catch (error) {
    console.error(error.stack || error);
  }
}

function publicBootstrap() {
  var properties = PropertiesService.getScriptProperties();
  var installed = properties.getProperty('INSTALLED') === 'true' && !!properties.getProperty('DATABASE_ID');
  var config = {};
  if (installed) {
    try {
      listRows_('CONFIG', { includeInactive: true }).forEach(function(row) { config[row.CHAVE] = row.VALOR; });
    } catch (ignored) {}
  }
  return {
    ok: true,
    data: {
      installed: installed,
      appName: config.APP_NAME || APP_CONFIG.APP_NAME,
      companyName: config.COMPANY_NAME || APP_CONFIG.COMPANY_NAME,
      version: APP_CONFIG.VERSION
    }
  };
}
