const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000'
const DEFAULT_TIMEOUT_MS = 15_000

let authToken = null
let backendOverride = null

function setToken(token) {
  authToken = token || null
}

function initBackend(store) {
  const saved = store?.get?.('backendUrlOverride')
  if (typeof saved === 'string' && saved.trim()) backendOverride = saved.trim()
}

function setBackendUrl(url) {
  backendOverride = url && url.trim() ? url.trim().replace(/\/$/, '') : null
}

function getBackendUrl() {
  return backendOverride || BACKEND_URL
}

function buildHeaders(body) {
  const headers = {}
  if (body) headers['content-type'] = 'application/json'
  if (authToken) headers.authorization = `Bearer ${authToken}`
  return headers
}

function isNetworkError(err) {
  if (!err) return true
  if (err.name === 'AbortError') return true
  if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
    return true
  }
  const msg = String(err.message || '').toLowerCase()
  return msg.includes('fetch') || msg.includes('network') || msg.includes('abort') || msg.includes('conexión')
}

async function request(method, path, body, { timeoutMs = DEFAULT_TIMEOUT_MS, extraHeaders = {} } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${getBackendUrl()}${path}`, {
      method,
      headers: { ...buildHeaders(body), ...extraHeaders },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    const text = await res.text()
    let json
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      throw new Error(`Bad JSON from ${path}: ${text.slice(0, 200)}`)
    }
    if (!res.ok) {
      const err = new Error(json?.error || `HTTP ${res.status}`)
      err.status = res.status
      throw err
    }
    return json
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('Tiempo de espera agotado')
      timeoutErr.status = 408
      throw timeoutErr
    }
    if (isNetworkError(err) && !err.status) {
      const netErr = new Error('Sin conexión al servidor')
      netErr.status = 0
      throw netErr
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

module.exports = {
  setToken,
  initBackend,
  setBackendUrl,
  getBackendUrl,
  isNetworkError,
  registerUser: ({ name, hostname }) => {
    const headers = {}
    const registerSecret = process.env.REGISTER_SECRET
    if (registerSecret) headers['x-register-secret'] = registerSecret
    return request('POST', '/api/users', { name, hostname }, { extraHeaders: headers })
  },
  heartbeat: (userId) => request('POST', '/api/users/heartbeat', { user_id: userId }),
  getMessages: (userId) => request('GET', `/api/messages?user_id=${encodeURIComponent(userId)}`),
  ack: ({ messageId, userId, replyText }) =>
    request('POST', '/api/acks', {
      message_id: messageId,
      user_id: userId,
      ...(replyText ? { reply_text: replyText } : {}),
    }),
  getGoals: ({ userId, date }) =>
    request('GET', `/api/goals?user_id=${encodeURIComponent(userId)}&date=${encodeURIComponent(date)}`),
  patchGoal: ({ goalId, currentValue, delta }) =>
    request('PATCH', `/api/goals/${goalId}`, {
      ...(typeof delta === 'number' ? { delta } : { current_value: currentValue }),
    }),
}
