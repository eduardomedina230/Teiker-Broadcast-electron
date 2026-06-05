const { exec } = require('node:child_process')
const path = require('node:path')
const { app } = require('electron')

const HISTORY_MAX = 50

function parseTimeToMinutes(hhmm, fallback) {
  if (!hhmm || typeof hhmm !== 'string') return fallback
  const [h, m] = hhmm.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback
  return h * 60 + m
}

function isDndActive(store) {
  if (!store.get('dndEnabled')) return false
  const start = parseTimeToMinutes(store.get('dndStart'), 22 * 60)
  const end = parseTimeToMinutes(store.get('dndEnd'), 8 * 60)
  const now = new Date()
  const cur = now.getHours() * 60 + now.getMinutes()
  if (start === end) return false
  if (start < end) return cur >= start && cur < end
  return cur >= start || cur < end
}

function isQuietActive(store) {
  if (store.get('meetingMode')) return true
  const until = store.get('quietUntil')
  return typeof until === 'number' && Date.now() < until
}

function cleanExpiredSnoozes(store) {
  const snoozed = store.get('snoozedAcks') || {}
  const now = Date.now()
  const next = {}
  let changed = false
  for (const [id, until] of Object.entries(snoozed)) {
    if (until > now) next[id] = until
    else changed = true
  }
  if (changed) store.set('snoozedAcks', next)
  return next
}

function isMessageSnoozed(store, messageId) {
  cleanExpiredSnoozes(store)
  const until = (store.get('snoozedAcks') || {})[messageId]
  return typeof until === 'number' && Date.now() < until
}

function snoozeMessage(store, messageId, minutes = 15) {
  const snoozed = { ...(store.get('snoozedAcks') || {}) }
  snoozed[messageId] = Date.now() + minutes * 60_000
  store.set('snoozedAcks', snoozed)
}

function playNotificationSound(store, type) {
  if (!store.get('soundEnabled')) return
  if (process.platform === 'darwin') {
    const sound = type === 'urgent' ? 'Basso' : type === 'warning' ? 'Ping' : 'Pop'
    exec(`afplay /System/Library/Sounds/${sound}.aiff`, { timeout: 3000 }, () => {})
  } else if (process.platform === 'win32') {
    const tones = {
      urgent: [520, 280],
      warning: [740, 200],
      goal: [920, 160],
      info: [1100, 120],
    }
    const [freq, dur] = tones[type] || tones.info
    exec(
      `powershell -NoProfile -c "[console]::beep(${freq},${dur})"`,
      { timeout: 3000, windowsHide: true },
      () => {}
    )
  }
}

function filterMessagesForUser(messages, userId) {
  return (messages || []).filter(
    (m) => !m.target_user_id || m.target_user_id === userId
  )
}

function pendingAckMessages(store, messages, userId) {
  cleanExpiredSnoozes(store)
  return filterMessagesForUser(messages, userId).filter(
    (m) => m.requires_ack && !m.seen && !isMessageSnoozed(store, m.id)
  )
}

function countNewSinceHidden(store, messages, userId) {
  const since = store.get('lastHiddenAt')
  if (!since) return 0
  return filterMessagesForUser(messages, userId).filter((m) => {
    if (m.requires_ack && !m.seen) return false
    return m.created_at > since
  }).length
}

function shouldShowMorningSummary(store) {
  const today = new Date().toISOString().slice(0, 10)
  if (store.get('lastMorningSummaryDate') === today) return false
  const hour = new Date().getHours()
  return hour >= 8 && hour < 12
}

function markMorningSummaryShown(store) {
  store.set('lastMorningSummaryDate', new Date().toISOString().slice(0, 10))
}

function persistMessageHistory(store, messages) {
  const byId = new Map()
  for (const m of [...(store.get('messageHistory') || []), ...(messages || [])]) {
    if (m?.id) byId.set(m.id, m)
  }
  const list = Array.from(byId.values())
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, HISTORY_MAX)
  store.set('messageHistory', list)
  return list
}

function loadOfflineMessages(store) {
  return store.get('messageHistory') || []
}

function trayIconPath(offline) {
  const base = path.join(__dirname, '..', 'assets')
  if (offline) return path.join(base, 'tray-offlineTemplate.png')
  return path.join(base, 'tray-iconTemplate.png')
}

function createTrayImage(nativeImage, offline) {
  const iconPath = trayIconPath(offline)
  let img = nativeImage.createFromPath(iconPath)
  if (img.isEmpty()) {
    img = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray-iconTemplate.png'))
  }
  if (process.platform === 'darwin') img.setTemplateImage(!offline)
  return img
}

module.exports = {
  HISTORY_MAX,
  isDndActive,
  isQuietActive,
  isMessageSnoozed,
  snoozeMessage,
  cleanExpiredSnoozes,
  playNotificationSound,
  filterMessagesForUser,
  pendingAckMessages,
  countNewSinceHidden,
  shouldShowMorningSummary,
  markMorningSummaryShown,
  persistMessageHistory,
  loadOfflineMessages,
  createTrayImage,
}
