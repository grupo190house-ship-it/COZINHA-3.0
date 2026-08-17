/**
 * Ponte de upload entre o GitHub Pages/Firebase e o Google Drive.
 *
 * Publique este projeto como Aplicativo da Web:
 * - Executar como: proprietário do script
 * - Quem pode acessar: qualquer pessoa
 *
 * O acesso não fica aberto: cada upload valida o Firebase ID Token antes
 * de aceitar e gravar a imagem no Drive.
 */
var DRIVE_BRIDGE_FIREBASE_API_KEY_ = 'AIzaSyDD8Uco12pmiuR68h9Icu9kkCBfGxaCcy8';
var DRIVE_BRIDGE_DATABASE_URL_ = 'https://cozinha-1cc2b-default-rtdb.firebaseio.com';
var DRIVE_BRIDGE_ROOT_ = 'cozinhaflow/v1';
var DRIVE_BRIDGE_MAX_BYTES_ = 5 * 1024 * 1024;

function doPost(e) {
  var requestId = String(e && e.parameter && e.parameter.requestId || '');
  try {
    var data = e && e.parameter ? e.parameter : {};
    if (String(data.action || '') !== 'driveUpload') {
      throw new Error('Ação de upload inválida.');
    }
    var result = driveBridgeUpload_(data);
    return driveBridgeHtmlResponse_(requestId, true, result, '');
  } catch (error) {
    return driveBridgeHtmlResponse_(requestId, false, null, error && error.message ? error.message : String(error));
  }
}

function driveBridgeUpload_(data) {
  var token = String(data.idToken || '');
  if (!token) throw new Error('Sessão do Firebase ausente. Faça login novamente.');

  var identity = driveBridgeVerifyFirebaseToken_(token);
  var uid = String(identity.localId || '');
  if (!uid) throw new Error('Não foi possível identificar o usuário.');

  var profile = driveBridgeGetFirebaseUser_(uid, token);
  if (!profile || profile.STATUS !== 'Ativo') {
    throw new Error('Usuário inativo ou não cadastrado.');
  }
  if (profile.PERFIL === 'Consulta') {
    throw new Error('Seu perfil não permite enviar fotos.');
  }

  var mimeType = String(data.mimeType || '');
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(mimeType) < 0) {
    throw new Error('Use uma imagem JPG, PNG ou WEBP.');
  }

  var encoded = String(data.base64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!encoded) throw new Error('A imagem não foi recebida.');
  if (encoded.length > 7 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 5 MB.');

  var bytes = Utilities.base64Decode(encoded);
  if (bytes.length > DRIVE_BRIDGE_MAX_BYTES_) throw new Error('A imagem deve ter no máximo 5 MB.');

  var folder = driveBridgeGetUserFolder_(uid, profile.NOME || profile.EMAIL || uid);
  var safeName = driveBridgeSafeFileName_(String(data.name || 'foto.jpg'));
  var stampedName = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyyMMdd-HHmmss') + '-' + safeName;
  var file = folder.createFile(Utilities.newBlob(bytes, mimeType, stampedName));

  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (sharingError) {
    file.setTrashed(true);
    throw new Error('A conta Google bloqueou o compartilhamento por link. Libere essa opção no Drive e tente novamente.');
  }

  var fileId = file.getId();
  var directUrl = 'https://drive.usercontent.google.com/download?id=' + encodeURIComponent(fileId) + '&export=view&confirm=t';
  var media = {
    ID: fileId,
    provider: 'google-drive',
    fileId: fileId,
    name: file.getName(),
    mimeType: mimeType,
    url: directUrl,
    driveUrl: file.getUrl(),
    userId: uid,
    userName: profile.NOME || '',
    createdAt: new Date().toISOString()
  };

  driveBridgeWriteFirebase_('media/' + fileId, media, token);
  return {
    id: fileId,
    name: media.name,
    url: media.url,
    driveUrl: media.driveUrl,
    provider: media.provider
  };
}

function driveBridgeVerifyFirebaseToken_(token) {
  var url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(DRIVE_BRIDGE_FIREBASE_API_KEY_);
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ idToken: token }),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) {
    throw new Error('Sessão expirada ou inválida. Faça login novamente.');
  }
  var body = JSON.parse(response.getContentText() || '{}');
  if (!body.users || !body.users.length) throw new Error('Usuário do Firebase não encontrado.');
  return body.users[0];
}

function driveBridgeGetFirebaseUser_(uid, token) {
  var path = DRIVE_BRIDGE_ROOT_ + '/users/' + encodeURIComponent(uid) + '.json?auth=' + encodeURIComponent(token);
  var response = UrlFetchApp.fetch(DRIVE_BRIDGE_DATABASE_URL_ + '/' + path, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    throw new Error('Não foi possível validar o perfil no banco de dados.');
  }
  return JSON.parse(response.getContentText() || 'null');
}

function driveBridgeWriteFirebase_(path, value, token) {
  var url = DRIVE_BRIDGE_DATABASE_URL_ + '/' + DRIVE_BRIDGE_ROOT_ + '/' + path + '.json?auth=' + encodeURIComponent(token);
  var response = UrlFetchApp.fetch(url, {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(value),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error('A foto foi enviada ao Drive, mas o registro não pôde ser salvo no Firebase.');
  }
}

function driveBridgeGetUserFolder_(uid, label) {
  var properties = PropertiesService.getScriptProperties();
  var rootId = properties.getProperty('DRIVE_MEDIA_ROOT_ID');
  var root;
  if (rootId) {
    try { root = DriveApp.getFolderById(rootId); } catch (ignored) { root = null; }
  }
  if (!root) {
    root = DriveApp.createFolder('CozinhaFlow — Fotos');
    properties.setProperty('DRIVE_MEDIA_ROOT_ID', root.getId());
  }

  var propertyKey = 'DRIVE_MEDIA_USER_' + uid;
  var userFolderId = properties.getProperty(propertyKey);
  var userFolder;
  if (userFolderId) {
    try { userFolder = DriveApp.getFolderById(userFolderId); } catch (ignored2) { userFolder = null; }
  }
  if (!userFolder) {
    userFolder = root.createFolder(driveBridgeSafeFileName_(label) + ' — ' + uid.substring(0, 8));
    properties.setProperty(propertyKey, userFolder.getId());
  }
  return userFolder;
}

function driveBridgeSafeFileName_(name) {
  var cleaned = String(name || 'arquivo')
    .replace(/[\\/:*?"<>|#%{}~&]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.substring(0, 120) || 'arquivo';
}

function driveBridgeHtmlResponse_(requestId, ok, data, error) {
  var payload = JSON.stringify({
    type: 'cozinhaflow-drive-upload',
    requestId: requestId,
    ok: ok,
    data: data,
    error: error
  }).replace(/</g, '\\u003c');

  return HtmlService.createHtmlOutput(
    '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
    '<script>window.parent.postMessage(' + payload + ', "*");<\/script>' +
    '</body></html>'
  ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
