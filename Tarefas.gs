/**
 * Quadro de tarefas livres da equipe.
 * O administrador define o texto da atividade e o operador comprova a conclusão
 * com confirmação explícita e uma foto armazenada na pasta privada do sistema.
 */
function listTasks_(params, user) {
  params = params || {};
  var rows = listRows_('TAREFAS', { includeInactive: true });
  if (user.PERFIL !== 'Administrador') {
    rows = rows.filter(function(row) {
      return String(row.RESPONSAVEL_ID) === String(user.ID);
    });
  }
  if (params.status) {
    rows = rows.filter(function(row) { return row.STATUS === params.status; });
  }
  var statusOrder = { 'Aguardando aprovação': 0, 'Em andamento': 1, 'A fazer': 2, 'Concluída': 3, 'Cancelada': 4 };
  var priorityOrder = { 'Urgente': 0, 'Alta': 1, 'Normal': 2, 'Baixa': 3 };
  rows.sort(function(a, b) {
    var byStatus = (statusOrder[a.STATUS] == null ? 9 : statusOrder[a.STATUS]) -
      (statusOrder[b.STATUS] == null ? 9 : statusOrder[b.STATUS]);
    if (byStatus) return byStatus;
    var byPriority = (priorityOrder[a.PRIORIDADE] == null ? 9 : priorityOrder[a.PRIORIDADE]) -
      (priorityOrder[b.PRIORIDADE] == null ? 9 : priorityOrder[b.PRIORIDADE]);
    if (byPriority) return byPriority;
    var aDeadline = a.PRAZO || '9999-12-31T23:59';
    var bDeadline = b.PRAZO || '9999-12-31T23:59';
    return String(aDeadline).localeCompare(String(bDeadline)) ||
      String(b.CRIADO_EM).localeCompare(String(a.CRIADO_EM));
  });
  return rows.map(publicTask_);
}

function listTaskAssignees_(params, user) {
  requireTaskAdmin_(user);
  return listRows_('USUARIOS', { includeInactive: true }).filter(function(row) {
    return row.STATUS === 'Ativo' && ['Operador', 'Supervisor'].indexOf(row.PERFIL) >= 0;
  }).sort(function(a, b) {
    return String(a.NOME).localeCompare(String(b.NOME), 'pt-BR');
  }).map(function(row) {
    return {
      id: row.ID,
      name: row.NOME,
      email: row.EMAIL,
      role: row.PERFIL,
      label: row.NOME + ' · ' + row.PERFIL
    };
  });
}

function saveTask_(data, user) {
  requireTaskAdmin_(user);
  data = sanitizeObject_(data || {});
  requireFields_(data, ['TITULO', 'RESPONSAVEL_ID']);
  var before = data.ID ? findById_('TAREFAS', data.ID, true) : null;
  if (data.ID && !before) throw new Error('Tarefa não encontrada.');
  if (before && ['Concluída', 'Cancelada'].indexOf(before.STATUS) >= 0) {
    throw new Error('Reabra a tarefa antes de editá-la.');
  }
  var responsible = findById_('USUARIOS', data.RESPONSAVEL_ID, true);
  if (!responsible || responsible.STATUS !== 'Ativo' ||
      ['Operador', 'Supervisor'].indexOf(responsible.PERFIL) < 0) {
    throw new Error('Selecione um operador com acesso ativo ao sistema.');
  }
  var priority = data.PRIORIDADE || 'Normal';
  assertEnum_(priority, ENUMS.PRIORIDADE_TAREFA, 'Prioridade');
  var reassigned = before && String(before.RESPONSAVEL_ID) !== String(responsible.ID);
  var record = {
    ID: data.ID || '',
    TITULO: sanitizeText_(data.TITULO, 160),
    DESCRICAO: sanitizeText_(data.DESCRICAO, 1500),
    RESPONSAVEL_ID: responsible.ID,
    RESPONSAVEL_NOME: responsible.NOME,
    RESPONSAVEL_EMAIL: responsible.EMAIL,
    PRIORIDADE: priority,
    PRAZO: normalizeTaskDeadline_(data.PRAZO),
    STATUS: before ? (reassigned ? 'A fazer' : before.STATUS) : 'A fazer',
    CRIADO_POR_ID: before ? before.CRIADO_POR_ID : user.ID,
    CRIADO_POR_NOME: before ? before.CRIADO_POR_NOME : user.NOME,
    INICIADO_EM: before && !reassigned ? before.INICIADO_EM : '',
    ENVIADO_REVISAO_EM: before ? before.ENVIADO_REVISAO_EM : '',
    CONCLUIDO_EM: before ? before.CONCLUIDO_EM : '',
    CONFIRMADO: before ? before.CONFIRMADO : false,
    FOTO_ID: before ? before.FOTO_ID : '',
    FOTO_URL: before ? before.FOTO_URL : '',
    OBSERVACAO_CONCLUSAO: before ? before.OBSERVACAO_CONCLUSAO : '',
    REVISAO_STATUS: before ? before.REVISAO_STATUS : '',
    MOTIVO_REVISAO: before ? before.MOTIVO_REVISAO : '',
    APROVADO_POR_NOME: before ? before.APROVADO_POR_NOME : '',
    APROVADO_EM: before ? before.APROVADO_EM : '',
    RECORRENCIA: sanitizeText_(data.RECORRENCIA || (before && before.RECORRENCIA) || 'Nenhuma', 40),
    RECORRENCIA_DIAS: normalizeTaskWeekdays_(data.RECORRENCIA_DIAS != null ? data.RECORRENCIA_DIAS : (before && before.RECORRENCIA_DIAS)),
    TURNO: sanitizeText_(data.TURNO || (before && before.TURNO) || '', 40),
    RECORRENCIA_HORA: sanitizeText_(data.RECORRENCIA_HORA || (before && before.RECORRENCIA_HORA) || '', 5),
    SERIE_ID: before ? before.SERIE_ID : '',
    OCORRENCIA_DATA: normalizeTaskOccurrenceDate_(data.OCORRENCIA_DATA || (before && before.OCORRENCIA_DATA) || String(data.PRAZO || '').substring(0, 10)),
    ORIENTACAO_FOTO: sanitizeText_(data.ORIENTACAO_FOTO || (before && before.ORIENTACAO_FOTO) || '', 300)
  };
  var saved = upsertById_('TAREFAS', record);
  if (saved.RECORRENCIA !== 'Nenhuma' && !saved.SERIE_ID) {
    saved = updateRow_('TAREFAS', saved.ID, { SERIE_ID: saved.ID });
  }
  audit_(before ? 'Alteração' : 'Inclusão', user, 'Tarefas', 'TAREFAS', saved.ID, before, saved,
    reassigned ? 'Tarefa reatribuída' : '');
  if (!before || reassigned) createTaskAssignmentNotification_(saved);
  return publicTask_(saved);
}

function startTask_(data, user) {
  data = sanitizeObject_(data || {});
  var before = requireOwnedTask_(data.id, user);
  if (before.STATUS !== 'A fazer') throw new Error('Somente tarefas a fazer podem ser iniciadas.');
  var after = updateRow_('TAREFAS', before.ID, {
    STATUS: 'Em andamento',
    INICIADO_EM: nowIso_()
  });
  audit_('Início', user, 'Tarefas', 'TAREFAS', after.ID, before, after, 'Operador iniciou a atividade');
  return publicTask_(after);
}

function completeTask_(data, user) {
  data = sanitizeObject_(data || {});
  var before = requireOwnedTask_(data.id, user);
  if (before.STATUS !== 'Em andamento') throw new Error('Inicie a tarefa antes de concluí-la.');
  if (data.CONFIRMADO !== true) throw new Error('Marque a confirmação de que a tarefa foi executada.');
  requireFields_(data, ['FOTO_ID']);
  var evidence = validateTaskEvidence_(data.FOTO_ID);
  var after = updateRow_('TAREFAS', before.ID, {
    STATUS: 'Aguardando aprovação',
    ENVIADO_REVISAO_EM: nowIso_(),
    CONCLUIDO_EM: '',
    CONFIRMADO: true,
    FOTO_ID: evidence.id,
    FOTO_URL: evidence.url,
    OBSERVACAO_CONCLUSAO: sanitizeText_(data.OBSERVACAO_CONCLUSAO, 1000),
    REVISAO_STATUS: 'Pendente',
    MOTIVO_REVISAO: '',
    APROVADO_POR_NOME: '',
    APROVADO_EM: ''
  });
  audit_('Conclusão', user, 'Tarefas', 'TAREFAS', after.ID, before, after,
    'Conclusão confirmada com foto');
  createTaskReviewNotification_(after);
  return publicTask_(after);
}

function approveTask_(data, user) {
  requireTaskAdmin_(user);
  data = sanitizeObject_(data || {});
  var before = findById_('TAREFAS', data.id, true);
  if (!before || before.STATUS !== 'Aguardando aprovação') {
    throw new Error('Esta tarefa não está aguardando aprovação.');
  }
  var now = nowIso_();
  var after = updateRow_('TAREFAS', before.ID, {
    STATUS: 'Concluída',
    CONCLUIDO_EM: now,
    REVISAO_STATUS: 'Aprovada',
    MOTIVO_REVISAO: '',
    APROVADO_POR_NOME: user.NOME,
    APROVADO_EM: now
  });
  audit_('Aprovação', user, 'Tarefas', 'TAREFAS', after.ID, before, after, 'Foto aprovada pelo administrador');
  createTaskApprovalNotification_(after, true);
  createNextRecurringTask_(after, user);
  return publicTask_(after);
}

function rejectTask_(data, user) {
  requireTaskAdmin_(user);
  data = sanitizeObject_(data || {});
  var before = findById_('TAREFAS', data.id, true);
  if (!before || before.STATUS !== 'Aguardando aprovação') {
    throw new Error('Esta tarefa não está aguardando aprovação.');
  }
  var reason = sanitizeText_(data.reason, 300);
  if (!reason) throw new Error('Informe por que uma nova foto é necessária.');
  var after = updateRow_('TAREFAS', before.ID, {
    STATUS: 'Em andamento',
    REVISAO_STATUS: 'Devolvida',
    MOTIVO_REVISAO: reason,
    APROVADO_POR_NOME: '',
    APROVADO_EM: ''
  });
  audit_('Devolução', user, 'Tarefas', 'TAREFAS', after.ID, before, after, reason);
  createTaskApprovalNotification_(after, false);
  return publicTask_(after);
}

function cancelTask_(data, user) {
  requireTaskAdmin_(user);
  data = sanitizeObject_(data || {});
  var before = findById_('TAREFAS', data.id, true);
  if (!before) throw new Error('Tarefa não encontrada.');
  if (before.STATUS === 'Concluída') throw new Error('Uma tarefa concluída deve ser reaberta antes do cancelamento.');
  if (before.STATUS === 'Cancelada') return publicTask_(before);
  var after = updateRow_('TAREFAS', before.ID, { STATUS: 'Cancelada' });
  audit_('Cancelamento', user, 'Tarefas', 'TAREFAS', after.ID, before, after,
    sanitizeText_(data.reason, 300));
  return publicTask_(after);
}

function reopenTask_(data, user) {
  requireTaskAdmin_(user);
  data = sanitizeObject_(data || {});
  var before = findById_('TAREFAS', data.id, true);
  if (!before) throw new Error('Tarefa não encontrada.');
  if (['Concluída', 'Cancelada'].indexOf(before.STATUS) < 0) {
    throw new Error('A tarefa já está aberta.');
  }
  var after = updateRow_('TAREFAS', before.ID, {
    STATUS: 'A fazer',
    INICIADO_EM: '',
    ENVIADO_REVISAO_EM: '',
    CONCLUIDO_EM: '',
    CONFIRMADO: false,
    FOTO_ID: '',
    FOTO_URL: '',
    OBSERVACAO_CONCLUSAO: '',
    REVISAO_STATUS: '',
    MOTIVO_REVISAO: '',
    APROVADO_POR_NOME: '',
    APROVADO_EM: ''
  });
  audit_('Reabertura', user, 'Tarefas', 'TAREFAS', after.ID, before, after,
    'Nova execução e nova evidência serão exigidas');
  createTaskAssignmentNotification_(after);
  return publicTask_(after);
}

function getTaskEvidence_(data, user) {
  data = sanitizeObject_(data || {});
  var task = findById_('TAREFAS', data.id, true);
  if (!task) throw new Error('Tarefa não encontrada.');
  if (user.PERFIL !== 'Administrador' && String(task.RESPONSAVEL_ID) !== String(user.ID)) {
    throw new Error('Você não possui acesso a esta evidência.');
  }
  if (!task.FOTO_ID || ['Aguardando aprovação', 'Concluída'].indexOf(task.STATUS) < 0) throw new Error('Esta tarefa não possui evidência disponível.');
  var evidence = validateTaskEvidence_(task.FOTO_ID);
  var blob = evidence.file.getBlob();
  return {
    taskId: task.ID,
    title: task.TITULO,
    operator: task.RESPONSAVEL_NOME,
    completedAt: task.CONCLUIDO_EM,
    observation: task.OBSERVACAO_CONCLUSAO || '',
    name: evidence.file.getName(),
    mimeType: blob.getContentType(),
    dataUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes())
  };
}

function publicTask_(row) {
  var output = {};
  Object.keys(row).forEach(function(key) {
    if (key !== 'FOTO_ID' && key !== 'FOTO_URL') output[key] = row[key];
  });
  output.TEM_FOTO = !!row.FOTO_ID;
  return output;
}

function requireTaskAdmin_(user) {
  if (!user || user.PERFIL !== 'Administrador') {
    throw new Error('Somente administradores podem distribuir ou alterar tarefas.');
  }
}

function requireOwnedTask_(id, user) {
  var task = findById_('TAREFAS', id, true);
  if (!task) throw new Error('Tarefa não encontrada.');
  if (String(task.RESPONSAVEL_ID) !== String(user.ID)) {
    throw new Error('Somente o operador responsável pode executar esta tarefa.');
  }
  return task;
}

function normalizeTaskDeadline_(value) {
  var deadline = String(value || '').trim();
  if (!deadline) return '';
  deadline = deadline.substring(0, 16);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(deadline) || isNaN(new Date(deadline).getTime())) {
    throw new Error('Informe um prazo válido.');
  }
  return deadline;
}

function normalizeTaskWeekdays_(value) {
  var values = Array.isArray(value) ? value : String(value || '').split(',');
  return values.map(function(item) { return String(item).trim(); })
    .filter(function(item) { return /^[0-6]$/.test(item); }).join(',');
}

function normalizeTaskOccurrenceDate_(value) {
  var date = String(value || '').substring(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

function nextTaskOccurrence_(task) {
  if (!task.PRAZO || !task.RECORRENCIA || task.RECORRENCIA === 'Nenhuma') return null;
  var next = new Date(String(task.PRAZO));
  if (isNaN(next.getTime())) return null;
  if (task.RECORRENCIA === 'Diária') {
    next.setDate(next.getDate() + 1);
  } else {
    var allowed = normalizeTaskWeekdays_(task.RECORRENCIA_DIAS).split(',').filter(Boolean).map(Number);
    if (!allowed.length) return null;
    do { next.setDate(next.getDate() + 1); } while (allowed.indexOf(next.getDay()) < 0);
  }
  var local = Utilities.formatDate(next, APP_CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm");
  return { deadline: local, date: local.substring(0, 10) };
}

function createNextRecurringTask_(task, user) {
  var occurrence = nextTaskOccurrence_(task);
  if (!occurrence) return null;
  var seriesId = task.SERIE_ID || task.ID;
  var exists = findOne_('TAREFAS', function(row) {
    return String(row.SERIE_ID) === String(seriesId) && row.OCORRENCIA_DATA === occurrence.date && row.STATUS !== 'Cancelada';
  }, true);
  if (exists) return exists;
  var next = insertRow_('TAREFAS', {
    TITULO: task.TITULO,
    DESCRICAO: task.DESCRICAO,
    RESPONSAVEL_ID: task.RESPONSAVEL_ID,
    RESPONSAVEL_NOME: task.RESPONSAVEL_NOME,
    RESPONSAVEL_EMAIL: task.RESPONSAVEL_EMAIL,
    PRIORIDADE: task.PRIORIDADE,
    PRAZO: occurrence.deadline,
    STATUS: 'A fazer',
    CRIADO_POR_ID: task.CRIADO_POR_ID || user.ID,
    CRIADO_POR_NOME: task.CRIADO_POR_NOME || user.NOME,
    RECORRENCIA: task.RECORRENCIA,
    RECORRENCIA_DIAS: task.RECORRENCIA_DIAS,
    TURNO: task.TURNO,
    RECORRENCIA_HORA: task.RECORRENCIA_HORA,
    SERIE_ID: seriesId,
    OCORRENCIA_DATA: occurrence.date,
    ORIENTACAO_FOTO: task.ORIENTACAO_FOTO
  });
  createTaskAssignmentNotification_(next);
  return next;
}

function validateTaskEvidence_(fileId) {
  var folderId = PropertiesService.getScriptProperties().getProperty('MEDIA_FOLDER_ID');
  if (!folderId) throw new Error('A pasta de imagens do sistema não foi configurada.');
  var file;
  try {
    file = DriveApp.getFileById(String(fileId));
  } catch (error) {
    throw new Error('A foto enviada não foi encontrada.');
  }
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(file.getMimeType()) < 0) {
    throw new Error('A evidência deve ser uma imagem JPG, PNG ou WEBP.');
  }
  var parents = file.getParents();
  var belongsToSystem = false;
  while (parents.hasNext()) {
    if (String(parents.next().getId()) === String(folderId)) {
      belongsToSystem = true;
      break;
    }
  }
  if (!belongsToSystem) throw new Error('A foto não pertence à pasta protegida do sistema.');
  return { id: file.getId(), url: file.getUrl(), file: file };
}

function createTaskAssignmentNotification_(task) {
  insertRow_('NOTIFICACOES', {
    TIPO: 'TAREFA_ATRIBUIDA',
    TITULO: 'Nova tarefa para você',
    MENSAGEM: task.TITULO + (task.PRAZO ? ' · prazo ' + task.PRAZO.replace('T', ' ') : ''),
    SEVERIDADE: task.PRIORIDADE === 'Urgente' ? 'danger' : task.PRIORIDADE === 'Alta' ? 'warning' : 'info',
    REFERENCIA_TIPO: 'TAREFAS',
    REFERENCIA_ID: task.ID,
    LIDA: false,
    USUARIO_ID: task.RESPONSAVEL_ID,
    CRIADO_EM: nowIso_()
  });
}

function createTaskReviewNotification_(task) {
  if (!task.CRIADO_POR_ID || String(task.CRIADO_POR_ID) === String(task.RESPONSAVEL_ID)) return;
  insertRow_('NOTIFICACOES', {
    TIPO: 'TAREFA_AGUARDANDO_APROVACAO',
    TITULO: 'Foto aguardando conferência',
    MENSAGEM: task.RESPONSAVEL_NOME + ' enviou a foto de: ' + task.TITULO,
    SEVERIDADE: 'warning',
    REFERENCIA_TIPO: 'TAREFAS',
    REFERENCIA_ID: task.ID,
    LIDA: false,
    USUARIO_ID: task.CRIADO_POR_ID,
    CRIADO_EM: nowIso_()
  });
}

function createTaskApprovalNotification_(task, approved) {
  insertRow_('NOTIFICACOES', {
    TIPO: approved ? 'TAREFA_APROVADA' : 'TAREFA_DEVOLVIDA',
    TITULO: approved ? 'Tarefa aprovada' : 'Envie uma nova foto',
    MENSAGEM: approved ? task.TITULO + ' foi aprovada.' : task.TITULO + ': ' + task.MOTIVO_REVISAO,
    SEVERIDADE: approved ? 'success' : 'danger',
    REFERENCIA_TIPO: 'TAREFAS',
    REFERENCIA_ID: task.ID,
    LIDA: false,
    USUARIO_ID: task.RESPONSAVEL_ID,
    CRIADO_EM: nowIso_()
  });
}
