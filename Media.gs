/**
 * Upload seguro de imagens para uma pasta privada do sistema no Drive.
 */
function uploadMedia_(data, user) {
  if (user.PERFIL === 'Consulta') throw new Error('Seu perfil não permite enviar arquivos.');
  data = data || {};
  requireFields_(data, ['name', 'mimeType', 'base64']);
  var mimeType = String(data.mimeType);
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(mimeType) < 0) {
    throw new Error('Formato de imagem não permitido. Use JPG, PNG ou WEBP.');
  }
  var base64 = String(data.base64).replace(/^data:[^;]+;base64,/, '');
  if (base64.length > 7 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 5 MB.');
  var bytes = Utilities.base64Decode(base64);
  if (bytes.length > 5 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 5 MB.');
  var properties = PropertiesService.getScriptProperties();
  var folderId = properties.getProperty('MEDIA_FOLDER_ID');
  var folder;
  if (folderId) {
    folder = DriveApp.getFolderById(folderId);
  } else {
    folder = DriveApp.createFolder(APP_CONFIG.APP_NAME + ' — Arquivos');
    properties.setProperty('MEDIA_FOLDER_ID', folder.getId());
  }
  var safeName = generateCode_('IMG') + '-' + sanitizeText_(data.name, 100).replace(/[^\wÀ-ÿ.-]/g, '_');
  var file = folder.createFile(Utilities.newBlob(bytes, mimeType, safeName));
  audit_('Upload', user, 'Arquivos', 'DRIVE_FILE', file.getId(), null, { name: safeName, url: file.getUrl() }, '');
  return { id: file.getId(), name: file.getName(), url: file.getUrl() };
}
