/**
 * Autenticação por email/senha, sessão opaca e perfis de acesso.
 * As senhas nunca são armazenadas em texto puro.
 */
function publicLogin(credentials) {
  try {
    credentials = sanitizeObject_(credentials || {});
    requireFields_(credentials, ['email', 'password']);
    var email = normalizeEmail_(credentials.email);
    var attemptKey = 'LOGIN_ATTEMPTS_' + digest_(email);
    var authCache = CacheService.getScriptCache();
    var attempts = asNumber_(authCache.get(attemptKey));
    if (attempts >= 5) {
      var throttled = new Error('Muitas tentativas. Aguarde 10 minutos antes de tentar novamente.');
      throttled.code = 'RATE_LIMITED';
      throw throttled;
    }
    var user = findOne_('USUARIOS', function(row) {
      return normalizeEmail_(row.EMAIL) === email;
    }, true);
    if (!user || user.STATUS !== 'Ativo' || hashPassword_(credentials.password, user.SALT) !== user.SENHA_HASH) {
      authCache.put(attemptKey, String(attempts + 1), 600);
      Utilities.sleep(350);
      throw new Error('Email ou senha inválidos.');
    }
    authCache.remove(attemptKey);
    var token = createSession_(user, credentials.remember === true);
    updateRow_('USUARIOS', user.ID, { ULTIMO_ACESSO: nowIso_() });
    audit_('Login', user, 'Login', 'USUARIOS', user.ID, null, null, 'Acesso autorizado');
    return success_({ token: token, user: publicUser_(user), remember: credentials.remember === true }, 'Bem-vindo!');
  } catch (error) {
    return failure_(error);
  }
}

function publicSetup(options) {
  try {
    if (PropertiesService.getScriptProperties().getProperty('INSTALLED') === 'true') {
      throw new Error('O sistema já foi configurado.');
    }
    options = sanitizeObject_(options || {});
    requireFields_(options, ['companyName', 'adminName', 'adminEmail', 'adminPassword']);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail_(options.adminEmail))) {
      throw new Error('Informe um email válido.');
    }
    validatePassword_(options.adminPassword);
    options.initialOnly = true;
    return success_(setupSystem(options), 'Sistema configurado com sucesso.');
  } catch (error) {
    return failure_(error);
  }
}

function publicForgotPassword(data) {
  try {
    data = sanitizeObject_(data || {});
    var email = normalizeEmail_(data.email);
    var resetKey = 'PASSWORD_RESET_' + digest_(email || 'empty');
    var resetCache = CacheService.getScriptCache();
    if (resetCache.get(resetKey)) {
      return success_(null, 'Se o email estiver cadastrado, a administração receberá a solicitação.');
    }
    resetCache.put(resetKey, '1', 600);
    if (email && PropertiesService.getScriptProperties().getProperty('INSTALLED') === 'true') {
      var user = findOne_('USUARIOS', function(row) { return normalizeEmail_(row.EMAIL) === email; }, true);
      if (user && user.STATUS === 'Ativo') {
        insertRow_('NOTIFICACOES', {
          TIPO: 'RECUPERACAO_SENHA',
          TITULO: 'Solicitação de redefinição de senha',
          MENSAGEM: user.NOME + ' solicitou redefinição de senha. Um administrador deve cadastrar uma nova senha.',
          SEVERIDADE: 'warning',
          REFERENCIA_TIPO: 'USUARIOS',
          REFERENCIA_ID: user.ID,
          LIDA: false,
          USUARIO_ID: '',
          CRIADO_EM: nowIso_()
        });
      }
    }
    return success_(null, 'Se o email estiver cadastrado, a administração receberá a solicitação.');
  } catch (error) {
    return failure_(error);
  }
}

function createSession_(user, remember) {
  var rawToken = uuid_() + uuid_() + new Date().getTime();
  var token = digest_(rawToken);
  var ttl = remember ? APP_CONFIG.REMEMBER_TTL_SECONDS : APP_CONFIG.SESSION_TTL_SECONDS;
  var session = {
    userId: user.ID,
    role: user.PERFIL,
    name: user.NOME,
    email: user.EMAIL,
    createdAt: new Date().getTime(),
    expiresAt: new Date().getTime() + ttl * 1000,
    remember: remember
  };
  var key = 'SESSION_' + digest_(token);
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(session));
  CacheService.getScriptCache().put(key, JSON.stringify(session), Math.min(ttl, 21600));
  return token;
}

function getCurrentUser_(token) {
  if (!token) {
    var error = new Error('Sua sessão expirou. Entre novamente.');
    error.code = 'UNAUTHENTICATED';
    throw error;
  }
  var key = 'SESSION_' + digest_(String(token));
  var cache = CacheService.getScriptCache();
  var stored = cache.get(key) || PropertiesService.getScriptProperties().getProperty(key);
  var session = parseJson_(stored, null);
  if (!session || session.expiresAt <= new Date().getTime()) {
    PropertiesService.getScriptProperties().deleteProperty(key);
    cache.remove(key);
    var sessionError = new Error('Sua sessão expirou. Entre novamente.');
    sessionError.code = 'UNAUTHENTICATED';
    throw sessionError;
  }
  var user = findById_('USUARIOS', session.userId, true);
  if (!user || user.STATUS !== 'Ativo') {
    PropertiesService.getScriptProperties().deleteProperty(key);
    cache.remove(key);
    var disabledError = new Error('Usuário inativo ou não encontrado.');
    disabledError.code = 'UNAUTHENTICATED';
    throw disabledError;
  }
  session.role = user.PERFIL;
  session.name = user.NOME;
  if (!session.remember && session.expiresAt - new Date().getTime() < 3600000) {
    session.expiresAt = new Date().getTime() + APP_CONFIG.SESSION_TTL_SECONDS * 1000;
    PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(session));
    cache.put(key, JSON.stringify(session), Math.min(APP_CONFIG.SESSION_TTL_SECONDS, 21600));
  }
  user._sessionKey = key;
  return user;
}

function logout_(token, user) {
  var key = 'SESSION_' + digest_(String(token || ''));
  PropertiesService.getScriptProperties().deleteProperty(key);
  CacheService.getScriptCache().remove(key);
  audit_('Logout', user, 'Perfil', 'USUARIOS', user.ID, null, null, 'Sessão encerrada');
}

function purgeExpiredSessions_() {
  var properties = PropertiesService.getScriptProperties();
  var all = properties.getProperties();
  var now = new Date().getTime();
  Object.keys(all).filter(function(key) { return key.indexOf('SESSION_') === 0; }).forEach(function(key) {
    var session = parseJson_(all[key], null);
    if (!session || session.expiresAt <= now) properties.deleteProperty(key);
  });
}

function publicUser_(user) {
  return {
    id: user.ID,
    name: user.NOME,
    email: user.EMAIL,
    role: user.PERFIL,
    status: user.STATUS,
    lastAccess: user.ULTIMO_ACESSO || ''
  };
}

function validatePassword_(password) {
  var value = String(password || '');
  if (value.length < APP_CONFIG.PASSWORD_MIN_LENGTH || !/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    throw new Error('A senha deve ter ao menos 8 caracteres, com letras e números.');
  }
}

function canAccess_(user, resource) {
  var allowed = ACL[user.PERFIL] || [];
  return allowed.indexOf('*') >= 0 || allowed.indexOf(resource) >= 0;
}

function requireAccess_(user, resource, mutate) {
  if (!canAccess_(user, resource)) {
    var accessError = new Error('Seu perfil não possui acesso a este módulo.');
    accessError.code = 'FORBIDDEN';
    throw accessError;
  }
  if (!mutate || user.PERFIL === 'Administrador') return true;
  var writeAcl = {
    Supervisor: ['dashboard', 'tarefas', 'estoque', 'insumos', 'produtos', 'producoes', 'perdas', 'inventarios', 'compras', 'fornecedores', 'operadores', 'relatorios', 'notificacoes'],
    Operador: ['tarefas', 'producoes', 'perdas', 'inventarios'],
    Comprador: ['dashboard', 'compras', 'fornecedores', 'notificacoes'],
    Financeiro: ['dashboard', 'compras', 'notificacoes'],
    Consulta: ['dashboard']
  };
  if ((writeAcl[user.PERFIL] || []).indexOf(resource) < 0) {
    var writeError = new Error('Seu perfil possui acesso somente para consulta nesta operação.');
    writeError.code = 'FORBIDDEN';
    throw writeError;
  }
  return true;
}
