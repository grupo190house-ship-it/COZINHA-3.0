/**
 * Relatórios em PDF, Google Sheets, XLSX e CSV.
 */
var REPORT_DEFINITIONS_ = {
  ESTOQUE: { sheet: 'ESTOQUE', title: 'Estoque de insumos' },
  ESTOQUE_PRODUTOS: { sheet: 'ESTOQUE_PRODUTOS', title: 'Estoque de produtos acabados' },
  COMPRAS: { sheet: 'COMPRAS', title: 'Solicitações de compra' },
  PEDIDOS: { sheet: 'PEDIDOS', title: 'Pedidos de compra' },
  PRODUCOES: { sheet: 'PRODUCOES', title: 'Produção' },
  PERDAS: { sheet: 'PERDAS', title: 'Perdas' },
  INVENTARIOS: { sheet: 'INVENTARIOS', title: 'Inventários' },
  OPERADORES: { sheet: 'OPERADORES', title: 'Operadores' },
  MOVIMENTACOES: { sheet: 'MOVIMENTACOES', title: 'Consumo e movimentações' },
  PRODUTOS: { sheet: 'PRODUTOS', title: 'Custos e margens' },
  FORNECEDORES: { sheet: 'FORNECEDORES', title: 'Fornecedores' },
  AUDITORIA: { sheet: 'AUDITORIA', title: 'Auditoria' }
};

function reportData_(params) {
  params = params || {};
  var definition = REPORT_DEFINITIONS_[params.type || 'ESTOQUE'];
  if (!definition) throw new Error('Tipo de relatório inválido.');
  var hiddenHeaders = ['SENHA_HASH', 'SALT', 'PIN_HASH'];
  if (['ESTOQUE', 'ESTOQUE_PRODUTOS'].indexOf(params.type || 'ESTOQUE') >= 0) hiddenHeaders.push('CUSTO_UNITARIO', 'VALIDADE');
  if ((params.type || 'ESTOQUE') === 'MOVIMENTACOES') hiddenHeaders.push('VALOR_UNITARIO');
  if ((params.type || 'ESTOQUE') === 'PRODUTOS') hiddenHeaders.push('VALIDADE_PADRAO');
  var headers = headers_(definition.sheet).filter(function(header) {
    return hiddenHeaders.indexOf(header) < 0;
  });
  var rows = listRows_(definition.sheet, { includeInactive: true });
  if (params.from) {
    rows = rows.filter(function(row) {
      var date = row.DATA_HORA || row.DATA || row.CRIADO_EM || row.ENTRADA_EM || '';
      return String(date) >= String(params.from);
    });
  }
  if (params.to) {
    rows = rows.filter(function(row) {
      var date = row.DATA_HORA || row.DATA || row.CRIADO_EM || row.ENTRADA_EM || '';
      return String(date) <= String(params.to) + 'T23:59:59';
    });
  }
  if (params.status) rows = rows.filter(function(row) { return row.STATUS === params.status; });
  return {
    title: definition.title,
    headers: headers,
    rows: rows.map(function(row) { return headers.map(function(header) { return row[header] == null ? '' : row[header]; }); })
  };
}

function generateReport_(params, user) {
  params = sanitizeObject_(params || {});
  var report = reportData_(params);
  var format = String(params.format || 'PDF').toUpperCase();
  var filename = report.title.replace(/[^\wÀ-ÿ-]+/g, '_') + '_' + todayIso_();
  var result;
  if (format === 'PDF') {
    result = createPdfReport_(report, filename);
  } else if (format === 'GOOGLE_SHEETS') {
    result = createSpreadsheetReport_(report, filename, false);
  } else if (format === 'XLSX') {
    result = createSpreadsheetReport_(report, filename, true);
  } else if (format === 'CSV') {
    result = createCsvReport_(report, filename);
  } else {
    throw new Error('Formato de relatório inválido.');
  }
  audit_('Exportação', user, 'Relatórios', params.type, '', null, result, format);
  return result;
}

function createPdfReport_(report, filename) {
  var document = DocumentApp.create(filename + '_temp');
  var body = document.getBody();
  body.appendParagraph(getPublicConfig_().COMPANY_NAME || APP_CONFIG.COMPANY_NAME)
    .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(report.title).setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('Gerado em ' + Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm'));
  var displayedRows = report.rows.slice(0, 1000);
  if (displayedRows.length) {
    for (var columnStart = 0; columnStart < report.headers.length; columnStart += 8) {
      var columnEnd = Math.min(columnStart + 8, report.headers.length);
      if (columnStart > 0) body.appendParagraph('Continuação — campos ' + (columnStart + 1) + ' a ' + columnEnd).setHeading(DocumentApp.ParagraphHeading.HEADING3);
      var tableRows = [report.headers.slice(columnStart, columnEnd)].concat(displayedRows.map(function(row) {
        return row.slice(columnStart, columnEnd).map(function(value) { return String(value == null ? '' : value).substring(0, 100); });
      }));
      var table = body.appendTable(tableRows);
      for (var cellIndex = 0; cellIndex < table.getRow(0).getNumCells(); cellIndex += 1) {
        table.getRow(0).getCell(cellIndex).editAsText().setBold(true);
      }
    }
  } else {
    body.appendParagraph('Nenhum registro encontrado para os filtros informados.');
  }
  if (report.rows.length > 1000) body.appendParagraph('Exibindo os primeiros 1.000 de ' + report.rows.length + ' registros.');
  document.saveAndClose();
  var tempFile = DriveApp.getFileById(document.getId());
  var pdfFile = DriveApp.createFile(tempFile.getAs(MimeType.PDF).setName(filename + '.pdf'));
  tempFile.setTrashed(true);
  return { format: 'PDF', name: pdfFile.getName(), url: pdfFile.getUrl(), id: pdfFile.getId(), rows: report.rows.length };
}

function createSpreadsheetReport_(report, filename, exportXlsx) {
  var spreadsheet = SpreadsheetApp.create(filename);
  var sheet = spreadsheet.getSheets()[0];
  sheet.setName('Relatório');
  var values = [report.headers].concat(report.rows);
  if (values.length) sheet.getRange(1, 1, values.length, report.headers.length).setValues(values);
  applySheetStyle_(sheet, report.headers.length);
  if (!exportXlsx) {
    return { format: 'GOOGLE_SHEETS', name: filename, url: spreadsheet.getUrl(), id: spreadsheet.getId(), rows: report.rows.length };
  }
  SpreadsheetApp.flush();
  var exportUrl = 'https://docs.google.com/spreadsheets/d/' + spreadsheet.getId() + '/export?format=xlsx';
  var response = UrlFetchApp.fetch(exportUrl, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: false
  });
  var file = DriveApp.createFile(response.getBlob().setName(filename + '.xlsx'));
  DriveApp.getFileById(spreadsheet.getId()).setTrashed(true);
  return { format: 'XLSX', name: file.getName(), url: file.getUrl(), id: file.getId(), rows: report.rows.length };
}

function createCsvReport_(report, filename) {
  var escape = function(value) {
    var text = String(value == null ? '' : value).replace(/"/g, '""');
    return '"' + text + '"';
  };
  var content = [report.headers].concat(report.rows).map(function(row) {
    return row.map(escape).join(';');
  }).join('\r\n');
  var blob = Utilities.newBlob('\uFEFF' + content, 'text/csv', filename + '.csv');
  var file = DriveApp.createFile(blob);
  return { format: 'CSV', name: file.getName(), url: file.getUrl(), id: file.getId(), rows: report.rows.length };
}

function getDayClosing_(params) {
  params = params || {};
  var date = params.date || todayIso_();
  var productions = listRows_('PRODUCOES', { includeInactive: true }).filter(function(row) {
    return row.STATUS === 'Finalizada' && String(row.HORA_FIM).substring(0, 10) === date;
  });
  var movements = listRows_('MOVIMENTACOES', { includeInactive: true }).filter(function(row) {
    return String(row.DATA_HORA).substring(0, 10) === date;
  });
  var losses = listRows_('PERDAS').filter(function(row) { return String(row.DATA_HORA).substring(0, 10) === date; });
  var inventories = listRows_('INVENTARIOS', { includeInactive: true }).filter(function(row) {
    return String(row.DATA_HORA).substring(0, 10) === date;
  });
  return {
    date: date,
    productionQuantity: round_(productions.reduce(function(sum, row) { return sum + asNumber_(row.QTD_PRODUZIDA); }, 0), 2),
    productionCost: round_(productions.reduce(function(sum, row) { return sum + asNumber_(row.CUSTO_TOTAL); }, 0), 2),
    consumptionQuantity: round_(movements.filter(function(row) { return row.TIPO_ESTOQUE === 'INSUMO' && asNumber_(row.QUANTIDADE) < 0; }).reduce(function(sum, row) { return sum + Math.abs(asNumber_(row.QUANTIDADE)); }, 0), 2),
    lossQuantity: round_(losses.reduce(function(sum, row) { return sum + asNumber_(row.QUANTIDADE); }, 0), 2),
    lossCost: round_(losses.reduce(function(sum, row) { return sum + asNumber_(row.CUSTO); }, 0), 2),
    expectedBalance: round_(inventories.reduce(function(sum, row) { return sum + asNumber_(row.SALDO_ESPERADO); }, 0), 2),
    countedBalance: round_(inventories.reduce(function(sum, row) { return sum + asNumber_(row.QUANTIDADE_CONTADA); }, 0), 2),
    difference: round_(inventories.reduce(function(sum, row) { return sum + asNumber_(row.DIFERENCA); }, 0), 2),
    pendingCounts: inventories.filter(function(row) { return row.STATUS === 'Pendente'; }).length,
    productions: productions,
    losses: losses,
    inventories: inventories
  };
}

function saveDayClosing_(data, user) {
  data = sanitizeObject_(data || {});
  requireFields_(data, ['date', 'responsibleId', 'supervisorId']);
  var closing = getDayClosing_({ date: data.date });
  if (closing.pendingCounts > 0 && data.confirmPending !== true) {
    throw new Error('Existem contagens pendentes. Conclua o inventário ou confirme o fechamento com pendências.');
  }
  var existing = findOne_('FECHAMENTOS', function(row) { return String(row.DATA) === String(data.date); }, true);
  var record = {
    ID: existing ? existing.ID : '',
    DATA: data.date,
    RESPONSAVEL_ID: data.responsibleId,
    SUPERVISOR_ID: data.supervisorId,
    PRODUCAO_QTD: closing.productionQuantity,
    PRODUCAO_CUSTO: closing.productionCost,
    CONSUMO_QTD: closing.consumptionQuantity,
    PERDAS_QTD: closing.lossQuantity,
    PERDAS_CUSTO: closing.lossCost,
    SALDO_ESPERADO: closing.expectedBalance,
    SALDO_CONTADO: closing.countedBalance,
    DIFERENCA: closing.difference,
    OBSERVACOES: sanitizeText_(data.observations, 3000),
    STATUS: closing.pendingCounts > 0 ? 'Fechado com pendências' : 'Fechado'
  };
  var saved = upsertById_('FECHAMENTOS', record);
  audit_(existing ? 'Alteração' : 'Fechamento do dia', user, 'Relatórios', 'FECHAMENTOS', saved.ID, existing, saved, data.observations || '');
  return saved;
}

function generateDayClosingPdf_(params, user) {
  var closing = getDayClosing_(params);
  var report = {
    title: 'Fechamento do dia ' + closing.date.split('-').reverse().join('/'),
    headers: ['INDICADOR', 'VALOR'],
    rows: [
      ['Produção', closing.productionQuantity],
      ['Custo de produção', closing.productionCost],
      ['Consumo', closing.consumptionQuantity],
      ['Perdas', closing.lossQuantity],
      ['Custo das perdas', closing.lossCost],
      ['Saldo esperado', closing.expectedBalance],
      ['Saldo contado', closing.countedBalance],
      ['Diferença', closing.difference],
      ['Contagens pendentes', closing.pendingCounts]
    ]
  };
  var result = createPdfReport_(report, 'Fechamento_' + closing.date);
  audit_('Fechamento do dia', user, 'Relatórios', 'FECHAMENTO', closing.date, null, closing, 'PDF gerado');
  return result;
}

function generateOrderPdf_(params, user) {
  var order = findById_('PEDIDOS', params.id, true);
  if (!order) throw new Error('Pedido não encontrado.');
  var supplier = findById_('FORNECEDORES', order.FORNECEDOR_ID, true) || {};
  var inputs = {};
  listRows_('INSUMOS', { includeInactive: true }).forEach(function(row) { inputs[row.ID] = row; });
  var rows = listRows_('PEDIDOS_ITENS', { filter: { PEDIDO_ID: order.ID } }).map(function(item) {
    return [
      inputs[item.INSUMO_ID] ? inputs[item.INSUMO_ID].NOME : item.INSUMO_ID,
      item.QUANTIDADE,
      item.PRECO,
      item.VALOR_TOTAL,
      item.STATUS
    ];
  });
  rows.unshift(['Pedido: ' + order.NUMERO, 'Fornecedor: ' + (supplier.NOME_FANTASIA || supplier.RAZAO_SOCIAL || ''), '', '', '']);
  var result = createPdfReport_({
    title: 'Pedido de compra ' + order.NUMERO,
    headers: ['ITEM', 'QUANTIDADE', 'PREÇO', 'TOTAL', 'STATUS'],
    rows: rows
  }, 'Pedido_' + order.NUMERO);
  audit_('Exportação', user, 'Compras', 'PEDIDOS', order.ID, null, result, 'PDF do pedido');
  return result;
}
