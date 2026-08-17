import { buildPushHTTPRequest } from '@pushforge/builder';

const FIREBASE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const MAX_REQUEST_BYTES = 8192;
const MAX_RECIPIENTS = 20;
const MAX_DEVICES = 50;
const MAX_NOTIFICATION_AGE_MS = 15 * 60 * 1000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function responseHeaders(origin, env) {
  const allowedOrigin = origin === env.APP_ORIGIN ? origin : env.APP_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin'
  };
}

function json(data, status, origin, env) {
  return new Response(JSON.stringify(data), { status, headers: responseHeaders(origin, env) });
}

function base64UrlBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function parseJwtSegment(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlBytes(value)));
}

async function readJsonBody(request) {
  if (!request.body) throw new HttpError(400, 'Corpo da solicitação ausente.');
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new HttpError(413, 'Solicitação muito grande.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

async function verifyFirebaseToken(token, env) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new HttpError(401, 'Sessão inválida.');
  let header;
  let payload;
  try {
    header = parseJwtSegment(parts[0]);
    payload = parseJwtSegment(parts[1]);
  } catch {
    throw new HttpError(401, 'Sessão inválida.');
  }
  if (header.alg !== 'RS256' || !header.kid) throw new HttpError(401, 'Assinatura inválida.');
  const jwksResponse = await fetch(FIREBASE_JWKS_URL, { cf: { cacheEverything: true, cacheTtl: 3600 } });
  if (!jwksResponse.ok) throw new HttpError(503, 'Não foi possível validar a sessão.');
  const jwks = await jwksResponse.json();
  const jwk = Array.isArray(jwks.keys) ? jwks.keys.find(key => key.kid === header.kid) : null;
  if (!jwk) throw new HttpError(401, 'Chave de sessão desconhecida.');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const validSignature = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    base64UrlBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  const now = Math.floor(Date.now() / 1000);
  const validClaims = validSignature
    && payload.aud === env.FIREBASE_PROJECT_ID
    && payload.iss === `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`
    && typeof payload.sub === 'string'
    && payload.sub.length > 0
    && Number(payload.exp) > now - 60
    && Number(payload.iat) < now + 60;
  if (!validClaims) throw new HttpError(401, 'Sessão expirada ou inválida.');
  return payload;
}

function databasePath(path) {
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

async function databaseRequest(env, token, method, path, body) {
  const response = await fetch(`${env.FIREBASE_DATABASE_URL}/${databasePath(path)}.json`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (!response.ok) throw new HttpError(response.status === 401 || response.status === 403 ? 403 : 502, 'O Firebase recusou a operação.');
  if (response.status === 204) return null;
  return response.json();
}

function validPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') return false;
    return url.hostname === 'fcm.googleapis.com'
      || url.hostname === 'updates.push.services.mozilla.com'
      || url.hostname === 'web.push.apple.com';
  } catch {
    return false;
  }
}

function normalizeSubscription(value) {
  const endpoint = String(value?.endpoint || '');
  const p256dh = String(value?.keys?.p256dh || '');
  const auth = String(value?.keys?.auth || '');
  if (!validPushEndpoint(endpoint) || p256dh.length < 40 || auth.length < 12) return null;
  return { endpoint, keys: { p256dh, auth } };
}

async function sendToDevice(device, notification, env) {
  const subscription = normalizeSubscription(device.record?.SUBSCRIPTION);
  if (!subscription) return { status: 'ignored', uid: device.uid, deviceId: device.deviceId };
  const { endpoint, headers, body } = await buildPushHTTPRequest({
    privateJWK: JSON.parse(env.VAPID_PRIVATE_JWK),
    subscription,
    message: {
      payload: {
        title: String(notification.TITULO || 'CozinhaFlow').slice(0, 100),
        body: String(notification.MENSAGEM || 'Você recebeu uma atualização.').slice(0, 240),
        icon: `${env.APP_URL}app-icon-192.png`,
        badge: `${env.APP_URL}app-icon-192.png`,
        tag: String(notification.TIPO || 'cozinhaflow').slice(0, 32),
        data: { url: env.APP_URL, notificationId: notification.ID }
      },
      adminContact: env.VAPID_CONTACT,
      options: {
        ttl: 86400,
        urgency: notification.SEVERIDADE === 'danger' ? 'high' : 'normal',
        topic: String(notification.ID).replace(/[^a-zA-Z0-9_-]/g, '').slice(-32)
      }
    }
  });
  const pushResponse = await fetch(endpoint, { method: 'POST', headers, body });
  if (pushResponse.ok) return { status: 'sent', uid: device.uid, deviceId: device.deviceId };
  if (pushResponse.status === 404 || pushResponse.status === 410) return { status: 'expired', uid: device.uid, deviceId: device.deviceId };
  return { status: 'failed', uid: device.uid, deviceId: device.deviceId, code: pushResponse.status };
}

async function handleSend(request, origin, env) {
  if (origin !== env.APP_ORIGIN) throw new HttpError(403, 'Origem não autorizada.');
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Faça login novamente.');
  const identity = await verifyFirebaseToken(token, env);
  const input = await readJsonBody(request);
  const notificationId = String(input.notificationId || '');
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(notificationId)) throw new HttpError(400, 'Notificação inválida.');

  const [profile, notification, queue] = await Promise.all([
    databaseRequest(env, token, 'GET', `cozinhaflow/v1/users/${identity.sub}`),
    databaseRequest(env, token, 'GET', `cozinhaflow/v1/notificacoes/${notificationId}`),
    databaseRequest(env, token, 'GET', `cozinhaflow/v1/push_queue/${notificationId}`)
  ]);
  if (!profile || profile.STATUS !== 'Ativo') throw new HttpError(403, 'Usuário sem permissão.');
  if (!notification || notification.ID !== notificationId || !queue) throw new HttpError(404, 'Notificação não encontrada.');
  if (queue.STATUS !== 'Pendente') return json({ ok: true, duplicate: true }, 200, origin, env);
  const createdAt = new Date(notification.CRIADO_EM).getTime();
  if (!Number.isFinite(createdAt) || Math.abs(Date.now() - createdAt) > MAX_NOTIFICATION_AGE_MS) throw new HttpError(409, 'Notificação fora do prazo de envio.');
  const recipients = [...new Set((Array.isArray(notification.DESTINATARIOS) ? notification.DESTINATARIOS : []).map(String).filter(Boolean))];
  if (!recipients.length || recipients.length > MAX_RECIPIENTS) throw new HttpError(400, 'Lista de destinatários inválida.');

  const deviceGroups = await Promise.all(recipients.map(async uid => ({
    uid,
    records: await databaseRequest(env, token, 'GET', `cozinhaflow/v1/push_tokens/${uid}`)
  })));
  const devices = deviceGroups.flatMap(group => Object.entries(group.records || {}).map(([deviceId, record]) => ({ uid: group.uid, deviceId, record }))).slice(0, MAX_DEVICES);
  const results = await Promise.all(devices.map(device => sendToDevice(device, notification, env)));
  const expired = results.filter(result => result.status === 'expired');
  await Promise.all(expired.map(result => databaseRequest(env, token, 'DELETE', `cozinhaflow/v1/push_tokens/${result.uid}/${result.deviceId}`)));
  const summary = {
    sent: results.filter(result => result.status === 'sent').length,
    expired: expired.length,
    failed: results.filter(result => result.status === 'failed').length,
    ignored: results.filter(result => result.status === 'ignored').length
  };
  await databaseRequest(env, token, 'PATCH', `cozinhaflow/v1/push_queue/${notificationId}`, {
    STATUS: summary.failed > 0 && summary.sent === 0 ? 'Erro' : 'Enviado',
    ENVIADO_EM: new Date().toISOString(),
    TENTATIVAS: Number(queue.TENTATIVAS || 0) + 1,
    RESULTADO: summary
  });
  console.log(JSON.stringify({ event: 'push_delivery', notificationId, actorUid: identity.sub, ...summary }));
  return json({ ok: true, ...summary }, 200, origin, env);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') {
      if (origin !== env.APP_ORIGIN) return json({ ok: false }, 403, origin, env);
      return new Response(null, { status: 204, headers: responseHeaders(origin, env) });
    }
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/') {
      return json({ ok: true, service: 'CozinhaFlow Push', plan: 'free' }, 200, origin, env);
    }
    try {
      if (request.method === 'POST' && url.pathname === '/send') return await handleSend(request, origin, env);
      throw new HttpError(404, 'Rota não encontrada.');
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      console.error(JSON.stringify({ event: 'push_error', status, message: error instanceof Error ? error.message : 'Erro inesperado' }));
      return json({ ok: false, error: status >= 500 ? 'Não foi possível enviar a notificação.' : error.message }, status, origin, env);
    }
  }
};
