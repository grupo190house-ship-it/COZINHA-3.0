/**
 * Utilitários sem estado.
 */
function nowIso_() {
  return Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
}

function todayIso_() {
  return Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

function uuid_() {
  return Utilities.getUuid();
}

function asNumber_(value, fallback) {
  var parsed = Number(String(value == null ? '' : value).replace(',', '.'));
  return isFinite(parsed) ? parsed : (fallback == null ? 0 : fallback);
}

function round_(value, decimals) {
  var factor = Math.pow(10, decimals == null ? 4 : decimals);
  return Math.round((asNumber_(value) + Number.EPSILON) * factor) / factor;
}

function normalizeUnit_(unit) {
  var value = String(unit || '').trim();
  var map = { KG: 'kg', G: 'g', L: 'L', ML: 'mL', UN: 'un', CX: 'cx', PCT: 'pct', 'PORÇÃO': 'porção', PORCAO: 'porção' };
  return map[value.toUpperCase()] || value;
}

function convertQuantity_(quantity, fromUnit, toUnit) {
  var from = normalizeUnit_(fromUnit);
  var to = normalizeUnit_(toUnit);
  var value = asNumber_(quantity);
  if (from === to) return value;
  var baseFactors = { kg: 1000, g: 1, L: 1000, mL: 1 };
  var sameDimension = (['kg', 'g'].indexOf(from) >= 0 && ['kg', 'g'].indexOf(to) >= 0) ||
    (['L', 'mL'].indexOf(from) >= 0 && ['L', 'mL'].indexOf(to) >= 0);
  if (!sameDimension) throw new Error('Não é possível converter ' + from + ' para ' + to + '. Ajuste a unidade da receita.');
  return value * baseFactors[from] / baseFactors[to];
}

function normalizeEmail_(email) {
  return String(email || '').trim().toLowerCase();
}

function sanitizeText_(value, maxLength) {
  var text = String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim();
  text = text.substring(0, maxLength || 5000);
  return /^[=+@]/.test(text) ? "'" + text : text;
}

function sanitizeObject_(input) {
  if (input == null) return {};
  if (Array.isArray(input)) return input.map(sanitizeObject_);
  if (Object.prototype.toString.call(input) === '[object Date]') return input.toISOString();
  if (typeof input === 'object') {
    var output = {};
    Object.keys(input).forEach(function(key) {
      var safeKey = String(key).replace(/[^\wÀ-ÿ-]/g, '').substring(0, 80);
      if (safeKey) output[safeKey] = sanitizeObject_(input[key]);
    });
    return output;
  }
  return typeof input === 'string' ? sanitizeText_(input) : input;
}

function requireFields_(data, fields) {
  fields.forEach(function(field) {
    if (data[field] == null || String(data[field]).trim() === '') {
      throw new Error('Campo obrigatório: ' + field);
    }
  });
}

function assertEnum_(value, allowed, label) {
  if (allowed.indexOf(value) === -1) {
    throw new Error((label || 'Valor') + ' inválido.');
  }
  return value;
}

function digest_(value) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8);
  return bytes.map(function(byte) {
    var normalized = byte < 0 ? byte + 256 : byte;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}

function hashPassword_(password, salt) {
  var hash = String(password);
  for (var i = 0; i < 1200; i += 1) hash = digest_(salt + ':' + hash + ':' + i);
  return hash;
}

function generateCode_(prefix) {
  var stamp = Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, 'yyyyMMddHHmmss');
  return String(prefix || 'REG') + '-' + stamp + '-' + Math.floor(100 + Math.random() * 900);
}

function dateValue_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]') return value;
  var normalized = String(value).substring(0, 10) + 'T12:00:00';
  var date = new Date(normalized);
  return isNaN(date.getTime()) ? null : date;
}

function daysBetween_(from, to) {
  var start = dateValue_(from);
  var end = dateValue_(to);
  if (!start || !end) return null;
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
}

function jsonSafe_(value) {
  return JSON.parse(JSON.stringify(value, function(key, current) {
    if (Object.prototype.toString.call(current) === '[object Date]') {
      return Utilities.formatDate(current, APP_CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
    }
    return current;
  }));
}

function withLock_(callback) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(APP_CONFIG.LOCK_TIMEOUT_MS)) {
    throw new Error('O sistema está processando outra operação. Tente novamente em instantes.');
  }
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function parseJson_(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

function success_(data, message) {
  return { ok: true, data: jsonSafe_(data == null ? null : data), message: message || '' };
}

function failure_(error) {
  console.error(error && error.stack ? error.stack : error);
  return {
    ok: false,
    error: sanitizeText_(error && error.message ? error.message : 'Erro inesperado.', 500),
    code: error && error.code ? error.code : 'APP_ERROR'
  };
}
