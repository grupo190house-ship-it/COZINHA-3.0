/**
 * Execute esta função manualmente uma única vez no editor do Apps Script.
 * Ela solicita e testa as permissões necessárias para o Google Drive e
 * para as chamadas externas usadas na validação do Firebase.
 */
function autorizarGoogleDrive() {
  var testFolder = DriveApp.createFolder('CozinhaFlow — Teste de autorização');
  var folderId = testFolder.getId();
  testFolder.setTrashed(true);

  var response = UrlFetchApp.fetch('https://www.googleapis.com/discovery/v1/apis', {
    method: 'get',
    muteHttpExceptions: true
  });

  var result = {
    ok: true,
    message: 'Google Drive autorizado com sucesso.',
    testFolderId: folderId,
    externalRequestStatus: response.getResponseCode(),
    authorizedAt: new Date().toISOString()
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Permite abrir a URL /exec no navegador e confirmar que a implantação está ativa.
 */
function doGet() {
  var result = {
    ok: true,
    service: 'CozinhaFlow Google Drive Bridge',
    message: 'Ponte do Google Drive ativa.',
    deployedAt: new Date().toISOString()
  };

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
