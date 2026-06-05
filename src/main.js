const path = require('node:path')
const dotenv = require('dotenv')
const { app: electronApp } = require('electron')

if (electronApp.isPackaged) {
  dotenv.config({ path: path.join(process.resourcesPath, '.env') })
} else {
  dotenv.config()
}
const os = require('node:os')
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  Notification,
  ipcMain,
  nativeImage,
  globalShortcut,
  screen,
  shell,
  powerMonitor,
} = require('electron')
const Store = require('electron-store').default
const api = require('./api')
const {
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
} = require('./features')

const APP_ID = 'mx.teiker.broadcast'

// Debe ir antes de whenReady. La 2ª instancia no debe registrar atajos ni IPC de arranque.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

function shortcutLabels() {
  const mod = process.platform === 'darwin' ? '⌘' : 'Ctrl+'
  return { toggle: `${mod}⇧T`, ackFirst: `${mod}⇧A`, goalInc: `${mod}⇧G` }
}

const POLL_INTERVAL_MS = 30_000
const POLL_FAST_MS = 12_000
const POLL_SLOW_MS = 60_000
const POLL_IDLE_MS = 90_000
const PEEK_INTERVAL_MS = 3 * 60_000
const PEEK_DURATION_MS = 5_000
const FULL_IDLE_MS = 4 * 60_000
const FULL_IDLE_CHECK_MS = 30_000
const URGENT_RENOTIFY_INTERVAL_MS = 5 * 60_000
const URGENT_RENOTIFY_MAX = 2
const MODES = {
  pill: { width: 200, height: 48 },
  mini: { width: 340, height: 200 },
  full: { width: 440, height: 680 },
}

function applyWindowMaterial() {
  if (!mainWindow || mainWindow.isDestroyed() || process.platform !== 'darwin') return
  // Vibrancy + ventana transparente dejan un halo claro en todos los tamaños.
  try {
    mainWindow.setVibrancy(null)
  } catch {}
  try {
    mainWindow.setHasShadow(false)
  } catch {}
}
const store = new Store({
  defaults: {
    user: null,
    lastSeenMessageAt: null,
    mode: 'pill',
    floatingPosition: null,
    floatingCorner: { right: true, bottom: false }, // default: top-right
    theme: process.platform === 'win32' ? 'solid' : 'glass',
    clientToken: null,
    pendingAcks: [],
    launchAtLogin: true,
    soundEnabled: true,
    dndEnabled: false,
    dndStart: '22:00',
    dndEnd: '08:00',
    backendUrlOverride: null,
    messageHistory: [],
    snoozedAcks: {},
    quietUntil: null,
    meetingMode: false,
    lastMorningSummaryDate: null,
    lastHiddenAt: null,
    urgentNotifyLog: {},
    pendingAckReplies: {},
  },
})

api.initBackend(store)

let mainWindow = null
let setupWindow = null
let tray = null
let pollTimer = null
let peekTimer = null
let collapseTimer = null
let highlightMessageId = null
let lastPollAt = null
let lastPollError = null
let lastPendingCount = 0
let lastNewContentCount = 0
let trayClickTimer = null
let lastTrayClickAt = 0
let userManualMode = false
// True while the mini is showing as a transient auto-peek from pill (not a
// mode the user explicitly chose). Lets us snap back to pill after the user
// resolves whatever triggered the peek.
let autoPeekActive = false
let syncInFlight = false
let fullIdleTimer = null
let lastFullActivityAt = 0
let urgentRenotifyTimer = null
let autoUpdaterRef = null
const UPDATE_CHECK_MS = 60 * 60_000
let syncCache = {
  messages: [],
  goals: [],
  goalsDate: null,
  messagesHash: '',
  goalsHash: '',
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function dataHash(data) {
  return JSON.stringify(data)
}

function pendingAckCount() {
  return (store.get('pendingAcks') || []).length
}

function syncStatusPayload() {
  return {
    lastPollAt,
    lastPollError,
    pendingAcks: pendingAckCount(),
    backendUrl: api.getBackendUrl(),
    newContentCount: lastNewContentCount,
    meetingMode: !!store.get('meetingMode'),
    quietUntil: store.get('quietUntil') || null,
    snoozedIds: Object.entries(cleanExpiredSnoozes(store))
      .filter(([, until]) => until > Date.now())
      .map(([id]) => id),
  }
}

function refreshCounts(messages = syncCache.messages) {
  const userId = store.get('user')?.id
  if (!userId) {
    lastPendingCount = 0
    lastNewContentCount = 0
    return
  }
  lastPendingCount = pendingAckMessages(store, messages, userId).length
  lastNewContentCount = countNewSinceHidden(store, messages, userId)
}

function pushAppState() {
  pushToRenderer('app:state', syncStatusPayload())
  pushToRenderer('pending:count', lastPendingCount)
}

function pushToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

function updateCacheMessages(messages) {
  syncCache.messages = messages
  syncCache.messagesHash = dataHash(messages)
  refreshCounts(messages)
}

function updateCacheGoals(goals, date = todayISO()) {
  syncCache.goals = goals
  syncCache.goalsDate = date
  syncCache.goalsHash = dataHash(goals)
}

function markMessageSeen(messageId) {
  const next = syncCache.messages.map((m) =>
    m.id === messageId ? { ...m, seen: true } : m
  )
  updateCacheMessages(next)
  pushToRenderer('messages:updated', next)
  pushToRenderer('pending:count', lastPendingCount)
  updateTrayBadge(next)
}

function wasStartedAtLogin() {
  if (process.argv.includes('--hidden')) return true
  try {
    return app.getLoginItemSettings().wasOpenedAtLogin === true
  } catch {
    return false
  }
}

function ensureLaunchAtLogin() {
  const wantLogin = store.get('launchAtLogin') !== false

  if (!wantLogin) {
    app.setLoginItemSettings({ openAtLogin: false })
    return { enabled: false, active: false }
  }

  // openAsHidden: false → la pastilla aparece al encender (sin robar foco).
  const settings = {
    openAtLogin: true,
    openAsHidden: false,
    path: process.execPath,
    args: ['--launched-at-login'],
  }

  try {
    app.setLoginItemSettings(settings)
  } catch (err) {
    console.error('No se pudo registrar inicio automático:', err)
    return { enabled: true, active: false, error: err.message }
  }

  const active = app.getLoginItemSettings().openAtLogin === true
  return { enabled: true, active }
}

function updateTrayVisual(messages = syncCache.messages) {
  if (!tray) return
  tray.setImage(createTrayImage(nativeImage, !!lastPollError))
  updateTrayBadge(messages)
}

function createMainWindow({ focus = true, show = true } = {}) {
  if (mainWindow) {
    if (show) {
      if (focus) {
        mainWindow.show()
        mainWindow.focus()
      } else {
        mainWindow.showInactive()
      }
    }
    return
  }
  const mode = store.get('mode') || 'pill'
  const dims = MODES[mode]
  let saved = store.get('floatingPosition')
  const isFloating = mode !== 'full'

  // First launch: anchor near the top-right of the primary display.
  if (isFloating && !saved) {
    const wa = screen.getPrimaryDisplay().workArea
    const margin = 16
    saved = {
      x: wa.x + wa.width - dims.width - margin,
      y: wa.y + margin,
    }
    store.set('floatingPosition', saved)
  }
  // Clamp the saved position to whatever display contains it, in case
  // the previous monitor was disconnected.
  if (isFloating && saved) {
    const display = screen.getDisplayMatching({
      x: saved.x, y: saved.y, width: dims.width, height: dims.height,
    })
    const wa = display.workArea
    const margin = 8
    saved.x = Math.max(wa.x + margin, Math.min(saved.x, wa.x + wa.width - dims.width - margin))
    saved.y = Math.max(wa.y + margin, Math.min(saved.y, wa.y + wa.height - dims.height - margin))
  }

  mainWindow = new BrowserWindow({
    width: dims.width,
    height: dims.height,
    minWidth: isFloating ? dims.width : 380,
    minHeight: isFloating ? dims.height : 520,
    maxWidth: isFloating ? dims.width : undefined,
    maxHeight: isFloating ? dims.height : undefined,
    x: isFloating && saved ? saved.x : undefined,
    y: isFloating && saved ? saved.y : undefined,
    frame: false,
    resizable: !isFloating,
    movable: true,
    skipTaskbar: true,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    vibrancy: null,
    visualEffectState: process.platform === 'darwin' ? 'followWindow' : undefined,
    hasShadow: false,
    roundedCorners: true,
    alwaysOnTop: isFloating,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  if (isFloating) mainWindow.setAlwaysOnTop(true, 'floating')
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  mainWindow.once('ready-to-show', () => {
    mainWindow.webContents.send('mode:set', {
      mode,
      corner: store.get('floatingCorner') || { right: true, bottom: false },
      expanding: true,
    })
    if (show) {
      if (focus) {
        mainWindow.show()
        mainWindow.focus()
      } else {
        mainWindow.showInactive()
      }
    }
    scheduleAutoPeek()
  })
  let moveSaveTimer = null
  let moveHintTimer = null
  mainWindow.on('moved', () => {
    if (!mainWindow || store.get('mode') === 'full') return
    if (!moveHintTimer) {
      moveHintTimer = setTimeout(() => {
        moveHintTimer = null
        emitSnapHint()
      }, 60)
    }
    if (moveSaveTimer) clearTimeout(moveSaveTimer)
    moveSaveTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      const [x, y] = mainWindow.getPosition()
      const [w, h] = mainWindow.getSize()
      const display = screen.getDisplayMatching({ x, y, width: w, height: h })
      store.set('floatingPosition', { x, y })
      store.set('floatingCorner', cornerFor(x, y, w, h, display))
      pushToRenderer('snap:hint', null)
    }, 200)
  })
  mainWindow.on('hide', () => {
    store.set('lastHiddenAt', new Date().toISOString())
    refreshCounts()
    pushAppState()
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function emitSnapHint() {
  if (!mainWindow || mainWindow.isDestroyed() || store.get('mode') === 'full') return
  const [x, y] = mainWindow.getPosition()
  const [w, h] = mainWindow.getSize()
  const display = screen.getDisplayMatching({ x, y, width: w, height: h })
  const wa = display.workArea
  const threshold = 28
  pushToRenderer('snap:hint', {
    top: y - wa.y <= threshold,
    bottom: wa.y + wa.height - (y + h) <= threshold,
    left: x - wa.x <= threshold,
    right: wa.x + wa.width - (x + w) <= threshold,
  })
}

// Which screen corner does a given window-position-and-size sit closest to?
function cornerFor(x, y, w, h, display) {
  const wa = display.workArea
  const winCx = x + w / 2
  const winCy = y + h / 2
  const screenCx = wa.x + wa.width / 2
  const screenCy = wa.y + wa.height / 2
  return {
    right: winCx > screenCx,
    bottom: winCy > screenCy,
  }
}

// Place a window of `targetDims` snugly against `corner` on `display`.
function placeAtCorner(corner, targetDims, display) {
  const wa = display.workArea
  const margin = 16
  return {
    x: corner.right ? wa.x + wa.width - targetDims.width - margin : wa.x + margin,
    y: corner.bottom ? wa.y + wa.height - targetDims.height - margin : wa.y + margin,
    width: targetDims.width,
    height: targetDims.height,
  }
}

// Resize the *current* window keeping the closest corner stable — used when
// transitioning between two floating modes (pill ↔ mini) so the window
// grows/shrinks toward its existing corner.
function cornerAnchoredBounds(targetDims) {
  if (!mainWindow || mainWindow.isDestroyed()) return null
  const [curX, curY] = mainWindow.getPosition()
  const [curW, curH] = mainWindow.getSize()
  const display = screen.getDisplayMatching({ x: curX, y: curY, width: curW, height: curH })
  const corner = cornerFor(curX, curY, curW, curH, display)

  // Keep the chosen corner fixed: derive the new top-left from it.
  let newX = corner.right ? curX + curW - targetDims.width : curX
  let newY = corner.bottom ? curY + curH - targetDims.height : curY

  const wa = display.workArea
  const margin = 8
  newX = Math.max(wa.x + margin, Math.min(newX, wa.x + wa.width - targetDims.width - margin))
  newY = Math.max(wa.y + margin, Math.min(newY, wa.y + wa.height - targetDims.height - margin))

  return { x: Math.round(newX), y: Math.round(newY), width: targetDims.width, height: targetDims.height, corner }
}

function setWindowMode(mode, { manual = true } = {}) {
  if (!MODES[mode]) return
  const previousMode = store.get('mode')
  store.set('mode', mode)
  if (manual) {
    userManualMode = true
    cancelAutoPeek()
    scheduleAutoPeek()
  }
  if (!mainWindow || mainWindow.isDestroyed()) return
  const dims = MODES[mode]
  const prevDims = MODES[previousMode] || dims
  const expanding = dims.width * dims.height > prevDims.width * prevDims.height
  const animateResize = process.platform === 'darwin' && expanding
  const isFloating = mode !== 'full'
  const wasFloating = previousMode !== 'full'

  // Lift size constraints temporarily so setBounds can shrink/grow freely.
  mainWindow.setResizable(true)
  mainWindow.setMinimumSize(1, 1)
  mainWindow.setMaximumSize(100000, 100000)

  if (isFloating) {
    let target
    if (wasFloating) {
      // Floating → floating: anchor to the nearest screen corner so the
      // resize visually grows/shrinks toward where the user expects.
      target = cornerAnchoredBounds(dims)
      if (target?.corner) store.set('floatingCorner', target.corner)
    } else {
      // Coming back from full mode → snap to the user's preferred corner.
      // Picking a corner (instead of restoring a top-left) makes pill /
      // mini land flush against the edge regardless of the size delta.
      const corner = store.get('floatingCorner') || { right: true, bottom: false }
      const [curX, curY] = mainWindow.getPosition()
      const [curW, curH] = mainWindow.getSize()
      const display = screen.getDisplayMatching({ x: curX, y: curY, width: curW, height: curH })
      target = placeAtCorner(corner, dims, display)
    }
    if (target) {
      mainWindow.setBounds(
        { x: target.x, y: target.y, width: target.width, height: target.height },
        animateResize
      )
      store.set('floatingPosition', { x: target.x, y: target.y })
    } else {
      mainWindow.setSize(dims.width, dims.height, animateResize)
    }
    // Re-apply size constraints after the move.
    mainWindow.setMinimumSize(dims.width, dims.height)
    mainWindow.setMaximumSize(dims.width, dims.height)
    mainWindow.setResizable(false)
    mainWindow.setAlwaysOnTop(true, 'floating')
  } else {
    mainWindow.setAlwaysOnTop(false)
    mainWindow.setResizable(true)
    mainWindow.setMinimumSize(380, 520)
    mainWindow.setSize(dims.width, dims.height, animateResize)
    mainWindow.center()
  }
  applyWindowMaterial()
  const corner =
    store.get('floatingCorner') || { right: true, bottom: false }
  mainWindow.webContents.send('mode:set', { mode, corner, expanding })
  if (mode === 'full') {
    touchFullActivity()
    scheduleFullIdleCheck()
  } else {
    stopFullIdleCheck()
  }
}

function touchFullActivity() {
  lastFullActivityAt = Date.now()
}

function stopFullIdleCheck() {
  if (fullIdleTimer) clearInterval(fullIdleTimer)
  fullIdleTimer = null
}

function scheduleFullIdleCheck() {
  stopFullIdleCheck()
  fullIdleTimer = setInterval(() => {
    if (store.get('mode') !== 'full') return
    if (!lastFullActivityAt || Date.now() - lastFullActivityAt < FULL_IDLE_MS) return
    setWindowMode('pill', { manual: false })
    userManualMode = false
  }, FULL_IDLE_CHECK_MS)
}

function cancelAutoPeek() {
  if (peekTimer) clearTimeout(peekTimer)
  if (collapseTimer) clearTimeout(collapseTimer)
  peekTimer = null
  collapseTimer = null
}

function scheduleAutoPeek() {
  cancelAutoPeek()
  peekTimer = setTimeout(() => {
    autoPeek()
  }, PEEK_INTERVAL_MS)
}

function autoPeek() {
  // Only peek when in pill mode AND there's something pending worth showing.
  if (!mainWindow || mainWindow.isDestroyed()) {
    scheduleAutoPeek()
    return
  }
  const mode = store.get('mode')
  if (mode !== 'pill') {
    scheduleAutoPeek()
    return
  }
  if (lastPendingCount === 0) {
    scheduleAutoPeek()
    return
  }
  // Expand to mini, then auto-collapse after PEEK_DURATION_MS.
  setWindowMode('mini', { manual: false })
  collapseTimer = setTimeout(() => {
    // Only auto-collapse if the user hasn't manually changed mode meanwhile.
    if (!userManualMode && store.get('mode') === 'mini') {
      setWindowMode('pill', { manual: false })
    }
    userManualMode = false
    scheduleAutoPeek()
  }, PEEK_DURATION_MS)
}

function createSetupWindow() {
  setupWindow = new BrowserWindow({
    width: 360,
    height: 280,
    resizable: false,
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  setupWindow.loadFile(path.join(__dirname, 'renderer', 'setup.html'))
  setupWindow.on('closed', () => {
    setupWindow = null
  })
}

function resetUserSession() {
  store.set('user', null)
  store.set('clientToken', null)
  store.set('lastSeenMessageAt', null)
  store.set('pendingAcks', [])
  api.setToken(null)
  syncCache = {
    messages: [],
    goals: [],
    goalsDate: null,
    messagesHash: '',
    goalsHash: '',
  }
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = null
  cancelAutoPeek()
  lastPendingCount = 0
  updateTrayBadge([])
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close()
    mainWindow = null
  }
  tray?.setContextMenu(buildTrayMenu())
  createSetupWindow()
}

async function ensureClientToken() {
  const user = store.get('user')
  if (!user?.id) return

  const saved = store.get('clientToken')
  if (saved) {
    api.setToken(saved)
    return
  }

  // Existing install without a token — refresh silently via hostname lookup.
  try {
    const { user: refreshed, token } = await api.registerUser({
      name: user.name,
      hostname: os.hostname(),
    })
    if (refreshed) store.set('user', refreshed)
    if (token) {
      store.set('clientToken', token)
      api.setToken(token)
    }
  } catch (err) {
    console.error('No se pudo renovar el token del cliente:', err)
  }
}

function queueAck(messageId, replyText) {
  const pending = store.get('pendingAcks') || []
  if (!pending.includes(messageId)) {
    store.set('pendingAcks', [...pending, messageId])
  }
  if (replyText) {
    const replies = store.get('pendingAckReplies') || {}
    replies[messageId] = replyText
    store.set('pendingAckReplies', replies)
  }
}

function clearUrgentNotifyLog(messageId) {
  const log = store.get('urgentNotifyLog') || {}
  if (!log[messageId]) return
  delete log[messageId]
  store.set('urgentNotifyLog', log)
}

function recordMessageNotify(messageId) {
  const log = store.get('urgentNotifyLog') || {}
  const entry = log[messageId] || { count: 0, lastAt: null }
  entry.count += 1
  entry.lastAt = new Date().toISOString()
  log[messageId] = entry
  store.set('urgentNotifyLog', log)
}

function urgentPendingMessages(messages) {
  const user = store.get('user')
  if (!user?.id) return []
  return pendingAckMessages(store, messages, user.id).filter((m) => m.type === 'urgent')
}

function isWindowHidden() {
  return (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    !mainWindow.isVisible() ||
    mainWindow.isMinimized()
  )
}

function checkUrgentRenotify() {
  if (isDndActive(store) || isQuietActive(store) || store.get('meetingMode')) return
  if (!isWindowHidden()) return

  const pending = urgentPendingMessages(syncCache.messages)
  if (!pending.length) return

  const log = store.get('urgentNotifyLog') || {}
  const now = Date.now()

  for (const m of pending) {
    const entry = log[m.id]
    if (!entry) {
      notifyMessage(m, { isRetry: false })
      continue
    }
    if (entry.count >= URGENT_RENOTIFY_MAX) continue
    const elapsed = now - new Date(entry.lastAt).getTime()
    if (elapsed < URGENT_RENOTIFY_INTERVAL_MS) continue
    notifyMessage(m, { isRetry: true })
  }
}

async function flushAckQueue() {
  const user = store.get('user')
  if (!user?.id) return

  const pending = store.get('pendingAcks') || []
  if (!pending.length) return

  const replies = store.get('pendingAckReplies') || {}
  const remaining = []
  const nextReplies = { ...replies }
  for (const messageId of pending) {
    try {
      const replyText = replies[messageId]
      await api.ack({
        messageId,
        userId: user.id,
        ...(replyText ? { replyText } : {}),
      })
      delete nextReplies[messageId]
    } catch {
      remaining.push(messageId)
    }
  }
  store.set('pendingAcks', remaining)
  store.set('pendingAckReplies', nextReplies)
}

async function ackMessage(messageId, replyText) {
  const user = store.get('user')
  if (!user?.id) throw new Error('No user registered')
  const note =
    typeof replyText === 'string' && replyText.trim()
      ? replyText.trim().slice(0, 120)
      : undefined
  try {
    await api.ack({ messageId, userId: user.id, ...(note ? { replyText: note } : {}) })
    const pending = store.get('pendingAcks') || []
    if (pending.includes(messageId)) {
      store.set('pendingAcks', pending.filter((id) => id !== messageId))
    }
    const replies = store.get('pendingAckReplies') || {}
    if (replies[messageId]) {
      delete replies[messageId]
      store.set('pendingAckReplies', replies)
    }
    clearUrgentNotifyLog(messageId)
    markMessageSeen(messageId)
    pushToRenderer('sync:status', syncStatusPayload())
  } catch (err) {
    if (api.isNetworkError(err) || !err?.status || err.status >= 500) {
      queueAck(messageId, note)
      clearUrgentNotifyLog(messageId)
      markMessageSeen(messageId)
      pushToRenderer('sync:status', syncStatusPayload())
      return
    }
    throw err
  }
}

function buildTrayMenu() {
  const user = store.get('user')
  const queued = pendingAckCount()
  const statusLabel = lastPollError
    ? 'Sin conexión'
    : lastPendingCount > 0
      ? `${lastPendingCount} pendiente${lastPendingCount === 1 ? '' : 's'}`
      : 'Al día'
  return Menu.buildFromTemplate([
    { label: user ? `${user.name}` : 'Sin registrar', enabled: false },
    { label: `Estado: ${statusLabel}`, enabled: false },
    ...(queued > 0 ? [{ label: `Cola offline: ${queued} ack${queued === 1 ? '' : 's'}`, enabled: false }] : []),
    { type: 'separator' },
    { label: 'Abrir panel', click: () => createMainWindow({ focus: true }) },
    { label: 'Sincronizar ahora', click: () => syncAll({ force: true }).catch(console.error) },
    { type: 'separator' },
    { label: 'Cambiar usuario', enabled: !!user, click: resetUserSession },
    { type: 'separator' },
    { label: 'Salir', click: () => { app.isQuitting = true; app.quit() } },
  ])
}

function cycleFloatingMode() {
  const mode = store.get('mode') || 'pill'
  if (mode === 'full') setWindowMode('mini')
  else if (mode === 'mini') setWindowMode('pill')
  else setWindowMode('mini')
  createMainWindow({ focus: true, show: true })
}

function setupTray() {
  tray = new Tray(createTrayImage(nativeImage, false))
  tray.setToolTip('Teiker Broadcast')
  tray.setContextMenu(buildTrayMenu())
  tray.on('click', () => {
    const now = Date.now()
    if (now - lastTrayClickAt < 380) {
      if (trayClickTimer) clearTimeout(trayClickTimer)
      trayClickTimer = null
      lastTrayClickAt = 0
      cycleFloatingMode()
      return
    }
    lastTrayClickAt = now
    if (trayClickTimer) clearTimeout(trayClickTimer)
    trayClickTimer = setTimeout(() => {
      trayClickTimer = null
      toggleWindow()
      lastTrayClickAt = 0
    }, 380)
  })
}

function updateTrayBadge(messages) {
  if (!tray) return
  const pendingCount = (messages || []).filter((m) => m.requires_ack && !m.seen).length
  if (process.platform === 'darwin') {
    if (pendingCount > 0) tray.setTitle(` ${pendingCount}`)
    else if (lastPollError) tray.setTitle(' !')
    else tray.setTitle('')
  }
  let tip = 'Teiker Broadcast'
  if (lastPollError) tip = `Teiker Broadcast — sin conexión`
  else if (pendingCount > 0) {
    tip = `Teiker Broadcast — ${pendingCount} pendiente${pendingCount === 1 ? '' : 's'}`
  }
  tray.setToolTip(tip)
}

function toggleWindow() {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    createMainWindow({ focus: true })
  }
}

async function fetchRemoteData(userId) {
  const date = todayISO()
  return Promise.all([
    api.getMessages(userId),
    api.getGoals({ userId, date }),
  ])
}

async function syncAll({ force = false } = {}) {
  const user = store.get('user')
  if (!user?.id) return { ok: false }
  if (syncInFlight) return { ok: false, skipped: true }
  syncInFlight = true

  let messages
  let goals
  const date = todayISO()

  try {
    try {
      ;[{ messages }, { goals }] = await fetchRemoteData(user.id)
      lastPollError = null
    } catch (err) {
      if (err?.status === 401) {
        await ensureClientToken()
        ;[{ messages }, { goals }] = await fetchRemoteData(user.id)
        lastPollError = null
      } else {
        throw err
      }
    }
  } catch (err) {
    lastPollError = err?.message || 'Error de red'
    const offline = loadOfflineMessages(store)
    if (offline.length) {
      const userId = user.id
      const filtered = filterMessagesForUser(offline, userId)
      updateCacheMessages(filtered)
      pushToRenderer('messages:updated', filtered)
    }
    pushToRenderer('sync:status', syncStatusPayload())
    tray?.setContextMenu(buildTrayMenu())
    updateTrayVisual(syncCache.messages)
    syncInFlight = false
    return { ok: false, error: lastPollError, offline: true }
  }

  lastPollAt = new Date().toISOString()
  const messagesHash = dataHash(messages)
  const goalsHash = dataHash(goals)
  const messagesChanged = force || messagesHash !== syncCache.messagesHash
  const goalsChanged = force || goalsHash !== syncCache.goalsHash

  const userId = user.id
  messages = filterMessagesForUser(messages, userId)

  const lastSeen = store.get('lastSeenMessageAt')
  const fresh = messages
    .filter((m) => !lastSeen || m.created_at > lastSeen)
    .filter((m) => !m.seen)

  if (messages.length > 0) {
    store.set('lastSeenMessageAt', messages[0].created_at)
  }
  persistMessageHistory(store, messages)
  updateCacheMessages(messages)
  updateCacheGoals(goals, date)
  api.heartbeat(userId).catch(() => {})

  const windowVisible =
    mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized()

  for (const m of fresh) {
    if (windowVisible && (m.type === 'urgent' || m.requires_ack)) continue
    notifyMessage(m)
  }

  updateTrayVisual(messages)
  pushAppState()
  maybeMorningSummary()

  const shouldAutoOpen = fresh.some(
    (m) =>
      m.type === 'urgent' ||
      (m.requires_ack && !isMessageSnoozed(store, m.id))
  )
  if (shouldAutoOpen) {
    const firstUrgent =
      fresh.find((m) => m.requires_ack) ?? fresh.find((m) => m.type === 'urgent')
    if (firstUrgent) highlightMessageId = firstUrgent.id
    if (!mainWindow || mainWindow.isDestroyed()) {
      store.set('mode', 'mini')
      createMainWindow({ focus: false })
    } else {
      setWindowMode('mini', { manual: false })
      if (collapseTimer) clearTimeout(collapseTimer)
      collapseTimer = setTimeout(() => {
        if (!userManualMode) setWindowMode('pill', { manual: false })
        userManualMode = false
      }, PEEK_DURATION_MS * 1.6)
    }
    if (mainWindow) {
      mainWindow.setAlwaysOnTop(true, 'floating')
      mainWindow.showInactive()
    }
  }

  if (messagesChanged) pushToRenderer('messages:updated', messages)
  if (goalsChanged) pushToRenderer('goals:updated', goals)
  pushToRenderer('sync:status', syncStatusPayload())
  if (shouldAutoOpen && highlightMessageId) {
    pushToRenderer('messages:highlight', highlightMessageId)
  }

  tray?.setContextMenu(buildTrayMenu())
  checkUrgentRenotify()

  const queuedBefore = pendingAckCount()
  await flushAckQueue()
  const acksFlushed = queuedBefore > 0 && pendingAckCount() < queuedBefore

  syncInFlight = false

  if (acksFlushed) {
    setImmediate(() => syncAll({ force: true }).catch(console.error))
  }

  return { ok: true, messages, goals }
}

function getPollIntervalMs() {
  const hidden =
    !mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()
  if (lastPollError || lastPendingCount > 0 || pendingAckCount() > 0) return POLL_FAST_MS
  if (hidden) return POLL_IDLE_MS
  if (lastPollAt) return POLL_SLOW_MS
  return POLL_INTERVAL_MS
}

function scheduleNextPoll() {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = setTimeout(async () => {
    await syncAll().catch(console.error)
    scheduleNextPoll()
  }, getPollIntervalMs())
}

function openMessageHighlight(messageId) {
  highlightMessageId = messageId
  createMainWindow({ focus: true, show: true })
  if (mainWindow && !mainWindow.isDestroyed()) {
    setWindowMode('full', { manual: true })
    const send = () => mainWindow?.webContents.send('messages:highlight', messageId)
    mainWindow.webContents.once('did-finish-load', send)
    setTimeout(send, 150)
  }
}

function ackFirstPending() {
  const userId = store.get('user')?.id
  if (!userId) return false
  const pending = pendingAckMessages(store, syncCache.messages, userId)[0]
  if (!pending) return false
  ackMessage(pending.id).catch(console.error)
  return true
}

async function incrementFirstGoal() {
  const goal = syncCache.goals.find((g) => g.type === 'numeric')
  if (!goal) {
    pushToRenderer('toast:show', { message: 'Sin meta numérica hoy', ms: 2500 })
    return false
  }
  const user = store.get('user')
  if (!user?.id) return false
  try {
    const { goal: updated } = await api.patchGoal({ goalId: goal.id, delta: 1 })
    const nextGoals = syncCache.goals.map((g) => (g.id === goal.id ? updated : g))
    updateCacheGoals(nextGoals, syncCache.goalsDate || todayISO())
    pushToRenderer('goals:updated', nextGoals)
    const cur = Number(updated.current_value || 0)
    const tgt = Number(updated.target_value || 0)
    pushToRenderer('toast:show', {
      message: tgt > 0 ? `Meta · ${cur}/${tgt}` : `Meta · ${cur}`,
      ms: 2200,
    })
    if (tgt > 0 && cur >= tgt) {
      pushToRenderer('goal:complete', { goalId: goal.id })
    }
    return true
  } catch (err) {
    pushToRenderer('toast:show', { message: `Error en meta: ${err?.message || 'sin conexión'}`, ms: 3000 })
    return false
  }
}

function maybeMorningSummary() {
  if (!shouldShowMorningSummary(store)) return
  const user = store.get('user')
  if (!user?.id) return
  markMorningSummaryShown(store)
  const pending = pendingAckMessages(store, syncCache.messages, user.id).length
  const numericGoal = syncCache.goals.find((g) => g.type === 'numeric')
  pushToRenderer('morning:summary', {
    pending,
    goalTitle: numericGoal?.title || null,
    goalCurrent: numericGoal ? Number(numericGoal.current_value || 0) : null,
    goalTarget: numericGoal ? Number(numericGoal.target_value || 0) : null,
  })
  if (store.get('mode') === 'pill') {
    setWindowMode('mini', { manual: false })
    collapseTimer = setTimeout(() => {
      if (!userManualMode && store.get('mode') === 'mini') {
        setWindowMode('pill', { manual: false })
      }
      userManualMode = false
    }, PEEK_DURATION_MS * 1.2)
  }
}

function notifyMessage(m, { isRetry = false } = {}) {
  if (isDndActive(store) || isQuietActive(store)) return

  const silent = !store.get('soundEnabled') || m.type === 'info'
  playNotificationSound(store, m.type)

  const options = {
    title: isRetry ? `Recordatorio: ${m.title}` : m.title,
    body: isRetry
      ? `Aún sin confirmar · ${m.body.slice(0, 100)}`
      : m.body.slice(0, 120),
    silent,
    urgency: m.type === 'urgent' ? 'critical' : 'normal',
  }

  if (m.requires_ack && process.platform === 'darwin') {
    options.actions = [{ type: 'button', text: 'Confirmar lectura' }]
    options.closeButtonText = 'Cerrar'
  }

  const n = new Notification(options)

  if (m.requires_ack) {
    n.on('action', (_event, index) => {
      if (index === 0) ackMessage(m.id).catch(console.error)
    })
    n.on('reply', () => ackMessage(m.id).catch(console.error))
  }

  n.on('click', () => openMessageHighlight(m.id))
  n.show()
  if (m.type === 'urgent' && m.requires_ack) {
    recordMessageNotify(m.id)
  }
}

function registerGlobalShortcuts() {
  if (!app.isReady()) return
  try {
    const accels = [
      'CommandOrControl+Shift+T',
      'CommandOrControl+Shift+A',
      'CommandOrControl+Shift+G',
    ]
    for (const accel of accels) {
      try {
        globalShortcut.unregister(accel)
      } catch {}
    }
    globalShortcut.register('CommandOrControl+Shift+T', () => toggleWindow())
    globalShortcut.register('CommandOrControl+Shift+A', () => {
      if (!ackFirstPending()) toggleWindow()
    })
    globalShortcut.register('CommandOrControl+Shift+G', () => {
      incrementFirstGoal().catch(console.error)
    })
  } catch (err) {
    console.error('Atajos globales no disponibles:', err)
    setTimeout(() => {
      if (app.isReady()) registerGlobalShortcuts()
    }, 800)
  }
}

function checkForAppUpdates() {
  autoUpdaterRef?.checkForUpdatesAndNotify().catch(() => {})
}

function setupAutoUpdater() {
  if (!app.isPackaged) return
  try {
    const { autoUpdater } = require('electron-updater')
    autoUpdaterRef = autoUpdater
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('update-downloaded', (info) => {
      const ver = info?.version ? `v${info.version}` : 'nueva'
      const n = new Notification({
        title: 'Actualización lista',
        body: `${ver} — clic aquí para reiniciar e instalar ahora.`,
      })
      n.on('click', () => {
        try {
          autoUpdater.quitAndInstall(false, true)
        } catch (err) {
          console.error('quitAndInstall:', err)
        }
      })
      n.show()
      pushToRenderer('toast:show', {
        message: `Actualización ${ver} lista. Clic en la notificación para reiniciar.`,
        ms: 10_000,
      })
    })
    checkForAppUpdates()
    setInterval(checkForAppUpdates, UPDATE_CHECK_MS)
  } catch (err) {
    console.error('Auto-updater no disponible:', err)
  }
}

function startPolling() {
  if (pollTimer) clearTimeout(pollTimer)
  if (urgentRenotifyTimer) clearInterval(urgentRenotifyTimer)
  syncAll({ force: true }).catch(console.error)
  scheduleNextPoll()
  urgentRenotifyTimer = setInterval(() => {
    checkUrgentRenotify()
  }, 60_000)
}

// ---------- IPC ----------

ipcMain.handle('user:get', () => store.get('user'))

ipcMain.handle('user:reset', () => {
  resetUserSession()
  return true
})

ipcMain.handle('user:register', async (_evt, { name, backendUrl }) => {
  if (backendUrl && typeof backendUrl === 'string' && backendUrl.trim()) {
    const normalized = backendUrl.trim().replace(/\/$/, '')
    store.set('backendUrlOverride', normalized)
    api.setBackendUrl(normalized)
  }
  const hostname = os.hostname()
  const { user, token } = await api.registerUser({ name, hostname })
  store.set('user', user)
  if (token) {
    store.set('clientToken', token)
    api.setToken(token)
  }
  if (setupWindow) {
    setupWindow.close()
    setupWindow = null
  }
  tray?.setContextMenu(buildTrayMenu())
  ensureLaunchAtLogin()
  createMainWindow({ focus: true, show: true })
  startPolling()
  return user
})

ipcMain.handle('messages:list', () => syncCache.messages)

ipcMain.handle('messages:ack', async (_evt, payload) => {
  const messageId = typeof payload === 'string' ? payload : payload?.messageId
  const replyText = typeof payload === 'object' ? payload?.replyText : undefined
  if (!messageId) throw new Error('messageId required')
  await ackMessage(messageId, replyText)
  return true
})

ipcMain.on('activity:ping', () => {
  if (store.get('mode') === 'full') touchFullActivity()
})

ipcMain.handle('messages:snooze', (_evt, { messageId, minutes = 15 }) => {
  if (!messageId) return { ok: false }
  snoozeMessage(store, messageId, minutes)
  refreshCounts()
  pushAppState()
  pushToRenderer('messages:updated', syncCache.messages)
  return { ok: true }
})

ipcMain.handle('messages:history', () => store.get('messageHistory') || [])

ipcMain.handle('goals:list', (_evt, date) => {
  const wanted = date || todayISO()
  if (syncCache.goalsDate === wanted) return syncCache.goals
  return syncCache.goals
})

ipcMain.handle('goals:increment', async (_evt, { goalId, delta }) => {
  const user = store.get('user')
  if (!user?.id) throw new Error('No user registered')
  const { goal: updated } = await api.patchGoal({ goalId, delta })
  const nextGoals = syncCache.goals.map((g) => (g.id === goalId ? updated : g))
  updateCacheGoals(nextGoals, syncCache.goalsDate || todayISO())
  pushToRenderer('goals:updated', nextGoals)
  const tgt = Number(updated.target_value || 0)
  const cur = Number(updated.current_value || 0)
  if (tgt > 0 && cur >= tgt) pushToRenderer('goal:complete', { goalId })
  return updated
})

ipcMain.handle('goals:setValue', async (_evt, { goalId, value }) => {
  const user = store.get('user')
  if (!user?.id) throw new Error('No user registered')
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('Valor inválido')
  }
  const { goal: updated } = await api.patchGoal({ goalId, currentValue: value })
  const nextGoals = syncCache.goals.map((g) => (g.id === goalId ? updated : g))
  updateCacheGoals(nextGoals, syncCache.goalsDate || todayISO())
  pushToRenderer('goals:updated', nextGoals)
  const tgt = Number(updated.target_value || 0)
  const cur = Number(updated.current_value || 0)
  if (tgt > 0 && cur >= tgt) pushToRenderer('goal:complete', { goalId })
  return updated
})

ipcMain.handle('app:open-url', (_evt, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    shell.openExternal(url)
    return true
  }
  return false
})

ipcMain.handle('app:quiet-for', (_evt, minutes = 60) => {
  const m = Number(minutes)
  if (!Number.isFinite(m) || m <= 0) return { ok: false }
  store.set('quietUntil', Date.now() + m * 60_000)
  pushAppState()
  return { ok: true, quietUntil: store.get('quietUntil') }
})

ipcMain.handle('window:close', () => mainWindow?.hide())
ipcMain.handle('window:get-highlight', () => {
  const id = highlightMessageId
  highlightMessageId = null
  return id
})
ipcMain.handle('sync:status', () => syncStatusPayload())
ipcMain.handle('sync:snapshot', () => ({
  messages: syncCache.messages,
  goals: syncCache.goals,
  ...syncStatusPayload(),
}))
ipcMain.handle('sync:refresh', async () => {
  await syncAll({ force: true })
  return {
    messages: syncCache.messages,
    goals: syncCache.goals,
    ...syncStatusPayload(),
  }
})
ipcMain.handle('app:info', () => {
  let launchAtLogin = false
  try {
    launchAtLogin = app.getLoginItemSettings().openAtLogin === true
  } catch {}
  return {
    backendUrl: api.getBackendUrl(),
    version: app.getVersion(),
    pendingAcks: pendingAckCount(),
    isPackaged: app.isPackaged,
    launchAtLogin,
    launchAtLoginRequested: store.get('launchAtLogin') !== false,
    soundEnabled: store.get('soundEnabled') !== false,
    dndEnabled: store.get('dndEnabled') === true,
    dndStart: store.get('dndStart') || '22:00',
    dndEnd: store.get('dndEnd') || '08:00',
    backendUrlOverride: store.get('backendUrlOverride') || '',
    platform: process.platform,
    shortcuts: shortcutLabels(),
    meetingMode: !!store.get('meetingMode'),
    quietUntil: store.get('quietUntil') || null,
  }
})

const SETTINGS_SCHEMA = {
  soundEnabled: (v) => typeof v === 'boolean',
  dndEnabled: (v) => typeof v === 'boolean',
  dndStart: (v) => typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v),
  dndEnd: (v) => typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v),
  backendUrlOverride: (v) => v === null || v === '' || (typeof v === 'string' && /^https?:\/\//.test(v)),
  launchAtLogin: (v) => typeof v === 'boolean',
  meetingMode: (v) => typeof v === 'boolean',
  quietUntil: (v) => v === null || (typeof v === 'number' && Number.isFinite(v)),
}

ipcMain.handle('settings:get', () => ({
  soundEnabled: store.get('soundEnabled') !== false,
  dndEnabled: store.get('dndEnabled') === true,
  dndStart: store.get('dndStart') || '22:00',
  dndEnd: store.get('dndEnd') || '08:00',
  backendUrlOverride: store.get('backendUrlOverride') || '',
  launchAtLogin: store.get('launchAtLogin') !== false,
  meetingMode: !!store.get('meetingMode'),
  quietUntil: store.get('quietUntil') || null,
}))

ipcMain.handle('settings:set', async (_evt, { key, value }) => {
  if (!SETTINGS_SCHEMA[key]?.(value)) {
    return { ok: false, error: 'Valor inválido' }
  }
  if (key === 'backendUrlOverride') {
    const normalized = value && String(value).trim() ? String(value).trim().replace(/\/$/, '') : null
    store.set('backendUrlOverride', normalized)
    api.setBackendUrl(normalized)
    lastPollError = null
    await syncAll({ force: true }).catch(() => {})
    return { ok: true, backendUrl: api.getBackendUrl() }
  }
  if (key === 'launchAtLogin') {
    store.set('launchAtLogin', value)
    const login = ensureLaunchAtLogin()
    return { ok: true, launchAtLogin: login.active }
  }
  store.set(key, value)
  if (key === 'meetingMode' || key === 'quietUntil') pushAppState()
  return { ok: true }
})

ipcMain.handle('app:open-admin', () => {
  const url = api.getBackendUrl()
  if (url) shell.openExternal(url)
  return url
})
ipcMain.handle('mode:get', () => store.get('mode') || 'pill')
ipcMain.handle('mode:set', (_evt, mode) => {
  setWindowMode(mode)
  return mode
})

const VALID_THEMES = new Set(['glass', 'solid', 'orange'])

ipcMain.handle('theme:get', () => store.get('theme') || 'glass')
ipcMain.handle('theme:set', (_evt, theme) => {
  if (!VALID_THEMES.has(theme)) return store.get('theme')
  store.set('theme', theme)
  // Toggle native macOS vibrancy to match the chosen theme.
  if (mainWindow && !mainWindow.isDestroyed()) {
    applyWindowMaterial()
  }
  return theme
})

// ---------- App lifecycle ----------

if (gotSingleInstanceLock) {
  app.on('second-instance', () => createMainWindow())

  app.whenReady().then(() => {
    if (process.platform === 'win32') {
      // Necesario para que las notificaciones del sistema funcionen en Windows 10+.
      app.setAppUserModelId(APP_ID)
    }
    if (process.platform === 'darwin') app.dock?.hide()

    const loginBoot = wasStartedAtLogin()
    ensureLaunchAtLogin()

    setupTray()
    registerGlobalShortcuts()
    setupAutoUpdater()

    powerMonitor.on('resume', () => {
      syncAll({ force: true }).catch(console.error)
      scheduleNextPoll()
      checkForAppUpdates()
    })
    powerMonitor.on('suspend', () => {
      if (pollTimer) clearTimeout(pollTimer)
      pollTimer = null
    })

    const user = store.get('user')
    if (!user?.id) {
      // Primera vez: mostrar setup aunque arranque con el sistema.
      createSetupWindow()
    } else {
      ensureClientToken()
        .then(() => {
          startPolling()
          createMainWindow({ focus: !loginBoot, show: true })
          if (loginBoot) {
            syncAll({ force: true }).catch(console.error)
          }
        })
        .catch(console.error)
    }
  })

  app.on('will-quit', () => {
    if (app.isReady()) {
      try {
        globalShortcut.unregisterAll()
      } catch {}
    }
    cancelAutoPeek()
    if (pollTimer) clearTimeout(pollTimer)
  })

  app.on('window-all-closed', (e) => {
    // Stay alive in tray.
    e.preventDefault?.()
  })
}
