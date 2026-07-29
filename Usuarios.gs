/**
 * Usuários de acesso ao ERP.
 */
function createUserInternal_(data, actor) {
  requireFields_(data, ['NOME', 'EMAIL', 'SENHA', 'PERFIL']);
  var email = normalizeEmail_(data.EMAIL);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email inválido.');
  assertEnum_(data.PERFIL, ROLES, 'Perfil');
  if (findOne_('USUARIOS', function(row) { return normalizeEmail_(row.EMAIL) === email; }, true)) {
    throw new Error('Já existe um usuário com este email.');
  }
  validatePassword_(data.SENHA);
  var salt = uuid_();
  var created = insertRow_('USUARIOS', {
    NOME: sanitizeText_(data.NOME, 120),
    EMAIL: email,
    SENHA_HASH: hashPassword_(data.SENHA, salt),
    SALT: salt,
    PERFIL: data.PERFIL,
    STATUS: data.STATUS || 'Ativo'
  });
  audit_('Inclusão', actor, 'Usuários', 'USUARIOS', created.ID, null, publicUser_(created), '');
  return publicUser_(created);
}

function saveUser_(data, actor) {
  if (!actor || actor.PERFIL !== 'Administrador') throw new Error('Somente administradores podem gerenciar usuários.');
  data = sanitizeObject_(data || {});
  if (!data.ID) return createUserInternal_(data, actor);
  var before = findById_('USUARIOS', data.ID, true);
  if (!before) throw new Error('Usuário não encontrado.');
  var changes = {
    NOME: sanitizeText_(data.NOME || before.NOME, 120),
    EMAIL: normalizeEmail_(data.EMAIL || before.EMAIL),
    PERFIL: data.PERFIL || before.PERFIL,
    STATUS: data.STATUS || before.STATUS
  };
  assertEnum_(changes.PERFIL, ROLES, 'Perfil');
  var duplicate = findOne_('USUARIOS', function(row) {
    return normalizeEmail_(row.EMAIL) === changes.EMAIL && String(row.ID) !== String(data.ID);
  }, true);
  if (duplicate) throw new Error('Já existe outro usuário com este email.');
  if (data.SENHA) {
    validatePassword_(data.SENHA);
    changes.SALT = uuid_();
    changes.SENHA_HASH = hashPassword_(data.SENHA, changes.SALT);
  }
  var after = updateRow_('USUARIOS', data.ID, changes);
  audit_('Alteração', actor, 'Usuários', 'USUARIOS', data.ID, publicUser_(before), publicUser_(after), '');
  return publicUser_(after);
}

function listUsers_(params, actor) {
  if (!actor || actor.PERFIL !== 'Administrador') throw new Error('Somente administradores podem consultar usuários.');
  return listRows_('USUARIOS', { includeInactive: true }).map(publicUser_);
}

function updateOwnProfile_(data, user) {
  data = sanitizeObject_(data || {});
  var changes = { NOME: sanitizeText_(data.name || user.NOME, 120) };
  if (data.currentPassword || data.newPassword) {
    if (hashPassword_(String(data.currentPassword || ''), user.SALT) !== user.SENHA_HASH) {
      throw new Error('Senha atual incorreta.');
    }
    validatePassword_(data.newPassword);
    changes.SALT = uuid_();
    changes.SENHA_HASH = hashPassword_(data.newPassword, changes.SALT);
  }
  var updated = updateRow_('USUARIOS', user.ID, changes);
  audit_('Alteração', user, 'Perfil', 'USUARIOS', user.ID, publicUser_(user), publicUser_(updated), 'Perfil próprio');
  return publicUser_(updated);
}
