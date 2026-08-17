const { onValueCreated } = require('firebase-functions/v2/database');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

const ROOT = 'cozinhaflow/v1';
const APP_URL = 'https://grupo190house-ship-it.github.io/COZINHA-3.0/';
const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered'
]);

exports.sendPushNotification = onValueCreated({
  ref: `/${ROOT}/push_queue/{queueId}`,
  instance: 'cozinha-1cc2b-default-rtdb',
  region: 'us-central1',
  memory: '256MiB',
  maxInstances: 10,
  retry: false
}, async event => {
  const queueId = event.params.queueId;
  const queue = event.data.val() || {};
  const recipients = [...new Set((queue.DESTINATARIOS || []).map(String).filter(Boolean))];
  const db = getDatabase();
  const queueRef = db.ref(`${ROOT}/push_queue/${queueId}`);

  try {
    const tokenRows = [];
    for (const userId of recipients) {
      const snapshot = await db.ref(`${ROOT}/push_tokens/${userId}`).get();
      snapshot.forEach(child => {
        const value = child.val() || {};
        if (value.TOKEN) tokenRows.push({ userId, deviceId: child.key, token: value.TOKEN });
      });
    }

    if (!tokenRows.length) {
      await queueRef.update({ STATUS: 'Sem dispositivos', PROCESSADO_EM: new Date().toISOString(), ENVIADOS: 0 });
      return;
    }

    let sent = 0;
    let failed = 0;
    const invalidRows = [];
    for (let offset = 0; offset < tokenRows.length; offset += 500) {
      const chunk = tokenRows.slice(offset, offset + 500);
      const response = await getMessaging().sendEachForMulticast({
        tokens: chunk.map(item => item.token),
        notification: {
          title: String(queue.TITULO || 'CozinhaFlow'),
          body: String(queue.MENSAGEM || 'Você recebeu uma atualização.')
        },
        data: {
          notificationId: String(queueId),
          type: String(queue.TIPO || 'TAREFA'),
          url: APP_URL
        },
        webpush: {
          notification: {
            icon: `${APP_URL}app-icon-192.png`,
            badge: `${APP_URL}app-icon-192.png`,
            tag: `cozinhaflow-${queueId}`,
            renotify: true,
            vibrate: [120, 60, 120]
          },
          fcmOptions: { link: APP_URL }
        }
      });
      sent += response.successCount;
      failed += response.failureCount;
      response.responses.forEach((result, index) => {
        if (!result.success && INVALID_TOKEN_CODES.has(result.error?.code)) invalidRows.push(chunk[index]);
      });
    }

    await Promise.all(invalidRows.map(item => db.ref(`${ROOT}/push_tokens/${item.userId}/${item.deviceId}`).remove()));
    await queueRef.update({ STATUS: failed ? 'Enviado parcialmente' : 'Enviado', PROCESSADO_EM: new Date().toISOString(), ENVIADOS: sent, FALHAS: failed });
  } catch (error) {
    await queueRef.update({ STATUS: 'Erro', PROCESSADO_EM: new Date().toISOString(), ERRO: String(error.message || error).slice(0, 500) });
    throw error;
  }
});
