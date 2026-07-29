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
  var statusOrder = { 'Em andamento': 0, 'A fazer': 1, 'Concluída': 2, 'Cancelada': 3 };
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
    CONCLUIDO_EM: before ? before.CONCLUIDO_EM : '',
    CONFIRMADO: before ? before.CONFIRMADO : false,
    FOTO_ID: before ? before.FOTO_ID : '',
    FOTO_URL: before ? before.FOTO_URL : '',
    OBSERVACAO_CONCLUSAO: before ? before.OBSERVACAO_CONCLUSAO : ''
  };
  var saved = upsertById_('TAREFAS', record);
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
    STATUS: 'Concluída',
    CONCLUIDO_EM: nowIso_(),
    CONFIRMADO: true,
    FOTO_ID: evidence.id,
    FOTO_URL: evidence.url,
    OBSERVACAO_CONCLUSAO: sanitizeText_(data.OBSERVACAO_CONCLUSAO, 1000)
  });
  audit_('Conclusão', user, 'Tarefas', 'TAREFAS', after.ID, before, after,
    'Conclusão confirmada com foto');
  createTaskCompletionNotification_(after);
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
    CONCLUIDO_EM: '',
    CONFIRMADO: false,
    FOTO_ID: '',
    FOTO_URL: '',
    OBSERVACAO_CONCLUSAO: ''
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
  if (!task.FOTO_ID || task.STATUS !== 'Concluída') throw new Error('Esta tarefa não possui evidência disponível.');
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

function createTaskCompletionNotification_(task) {
  if (!task.CRIADO_POR_ID || String(task.CRIADO_POR_ID) === String(task.RESPONSAVEL_ID)) return;
  insertRow_('NOTIFICACOES', {
    TIPO: 'TAREFA_CONCLUIDA',
    TITULO: 'Tarefa concluída',
    MENSAGEM: task.RESPONSAVEL_NOME + ' concluiu: ' + task.TITULO,
    SEVERIDADE: 'success',
    REFERENCIA_TIPO: 'TAREFAS',
    REFERENCIA_ID: task.ID,
    LIDA: false,
    USUARIO_ID: task.CRIADO_POR_ID,
    CRIADO_EM: nowIso_()
  });
}
