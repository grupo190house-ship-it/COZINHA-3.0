/**
 * Camada de persistência sobre Google Sheets.
 * Os nomes dos campos seguem os cabeçalhos declarados em SHEETS.
 */
function getDatabase_() {
  var id = PropertiesService.getScriptProperties().getProperty('DATABASE_ID');
  if (!id) throw new Error('Sistema ainda não configurado. Execute setupSystem ou use a configuração inicial.');
  return SpreadsheetApp.openById(id);
}

function getSheet_(name) {
  var sheet = getDatabase_().getSheetByName(name);
  if (!sheet) throw new Error('Aba de dados não encontrada: ' + name);
  return sheet;
}

function headers_(name) {
  if (!SHEETS[name]) throw new Error('Entidade inválida: ' + name);
  return SHEETS[name].slice();
}

function rowToObject_(headers, row, rowNumber) {
  var object = {};
  headers.forEach(function(header, index) {
    object[header] = row[index] == null ? '' : row[index];
  });
  if (rowNumber) Object.defineProperty(object, '_row', { value: rowNumber, enumerable: false });
  return object;
}

function listRows_(name, options) {
  options = options || {};
  var sheet = getSheet_(name);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var headers = headers_(name);
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var records = values.map(function(row, index) {
    return rowToObject_(headers, row, index + 2);
  });
  if (options.includeInactive !== true && headers.indexOf('STATUS') >= 0) {
    records = records.filter(function(record) { return record.STATUS !== 'Inativo'; });
  }
  if (options.filter) {
    records = records.filter(function(record) {
      return Object.keys(options.filter).every(function(key) {
        var expected = options.filter[key];
        return Array.isArray(expected) ? expected.indexOf(record[key]) >= 0 : String(record[key]) === String(expected);
      });
    });
  }
  return records;
}

function findById_(name, id, includeInactive) {
  if (!id) return null;
  var records = listRows_(name, { includeInactive: includeInactive === true });
  return records.find(function(record) { return String(record.ID) === String(id); }) || null;
}

function findOne_(name, predicate, includeInactive) {
  return listRows_(name, { includeInactive: includeInactive === true }).find(predicate) || null;
}

function insertRow_(name, data) {
  var sheet = getSheet_(name);
  var headers = headers_(name);
  var record = {};
  headers.forEach(function(header) {
    record[header] = data[header] == null ? '' : data[header];
  });
  if (headers.indexOf('ID') >= 0 && !record.ID) record.ID = uuid_();
  if (headers.indexOf('CRIADO_EM') >= 0 && !record.CRIADO_EM) record.CRIADO_EM = nowIso_();
  if (headers.indexOf('ATUALIZADO_EM') >= 0) record.ATUALIZADO_EM = nowIso_();
  if (headers.indexOf('STATUS') >= 0 && !record.STATUS) record.STATUS = 'Ativo';
  sheet.appendRow(headers.map(function(header) { return record[header]; }));
  clearAppCache_();
  return record;
}

function updateRow_(name, id, changes) {
  var current = findById_(name, id, true);
  if (!current) throw new Error('Registro não encontrado em ' + name + '.');
  var sheet = getSheet_(name);
  var headers = headers_(name);
  var merged = {};
  headers.forEach(function(header) {
    merged[header] = Object.prototype.hasOwnProperty.call(changes, header) ? changes[header] : current[header];
  });
  if (headers.indexOf('ATUALIZADO_EM') >= 0) merged.ATUALIZADO_EM = nowIso_();
  sheet.getRange(current._row, 1, 1, headers.length).setValues([
    headers.map(function(header) { return merged[header]; })
  ]);
  clearAppCache_();
  return merged;
}

function upsertById_(name, data) {
  return data.ID && findById_(name, data.ID, true) ? updateRow_(name, data.ID, data) : insertRow_(name, data);
}

function softDelete_(name, id) {
  if (headers_(name).indexOf('STATUS') < 0) {
    throw new Error('Esta entidade não permite exclusão lógica.');
  }
  return updateRow_(name, id, { STATUS: 'Inativo' });
}

function writeRows_(name, records) {
  if (!records.length) return [];
  var sheet = getSheet_(name);
  var headers = headers_(name);
  var prepared = records.map(function(data) {
    var record = {};
    headers.forEach(function(header) {
      record[header] = data[header] == null ? '' : data[header];
    });
    if (headers.indexOf('ID') >= 0 && !record.ID) record.ID = uuid_();
    if (headers.indexOf('CRIADO_EM') >= 0 && !record.CRIADO_EM) record.CRIADO_EM = nowIso_();
    if (headers.indexOf('ATUALIZADO_EM') >= 0) record.ATUALIZADO_EM = nowIso_();
    if (headers.indexOf('STATUS') >= 0 && !record.STATUS) record.STATUS = 'Ativo';
    return record;
  });
  var start = sheet.getLastRow() + 1;
  sheet.getRange(start, 1, prepared.length, headers.length).setValues(
    prepared.map(function(record) { return headers.map(function(header) { return record[header]; }); })
  );
  clearAppCache_();
  return prepared;
}

function clearAppCache_() {
  CacheService.getScriptCache().removeAll(['dashboard', 'lookups', 'lookups:v2']);
}

function cacheGetOrLoad_(key, loader, ttl) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(key);
  if (cached) return parseJson_(cached, null);
  var value = loader();
  try {
    cache.put(key, JSON.stringify(jsonSafe_(value)), ttl || APP_CONFIG.CACHE_TTL_SECONDS);
  } catch (ignored) {}
  return value;
}

function applySheetStyle_(sheet, columnCount) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, columnCount)
    .setBackground('#172033')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
  sheet.setRowHeight(1, 36);
  sheet.getBandings().forEach(function(banding) { banding.remove(); });
  if (sheet.getMaxRows() > 1) {
    sheet.getRange(2, 1, sheet.getMaxRows() - 1, columnCount)
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
  }
  sheet.autoResizeColumns(1, Math.min(columnCount, 12));
}
