/**
 * Entrada do Web App e instalação inicial.
 */
function doGet() {
  var template = HtmlService.createTemplateFromFile('webapp');
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
