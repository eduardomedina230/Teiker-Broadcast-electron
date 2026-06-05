const $goals = document.getElementById('goals')
const $messages = document.getElementById('messages')
const $messageCount = document.getElementById('messageCount')
const $pendingSection = document.getElementById('pendingSection')
const $pendingList = document.getElementById('pendingList')
const $pendingCount = document.getElementById('pendingCount')
const $closeBtn = document.getElementById('closeBtn')
const $refreshBtn = document.getElementById('refreshBtn')
const $refreshFooter = document.getElementById('refreshFooter')
const $collapseBtn = document.getElementById('collapseBtn')
const $syncLabel = document.getElementById('syncLabel')
const $statusDot = document.getElementById('statusDot')
const $footerDot = document.getElementById('footerDot')

// Mini-mode
const $miniBody = document.getElementById('miniBody')
const $miniStatusDot = document.getElementById('miniStatusDot')
const $miniUserName = document.getElementById('miniUserName')
const $fullUserName = document.getElementById('fullUserName')
const $expandBtn = document.getElementById('expandBtn')
const $shrinkBtn = document.getElementById('shrinkBtn')
const $shrinkFullBtn = document.getElementById('shrinkFullBtn')
const $miniCloseBtn = document.getElementById('miniCloseBtn')
const $miniPager = document.getElementById('miniPager')
const $pagerPrev = document.getElementById('pagerPrev')
const $pagerNext = document.getElementById('pagerNext')
const $pagerLabel = document.getElementById('pagerLabel')

// Pill-mode
const $pillCard = document.getElementById('pillCard')
const $pillDot = document.getElementById('pillDot')
const $pillLabel = document.getElementById('pillLabel')
const $pillBadge = document.getElementById('pillBadge')
const $pillExpand = document.getElementById('pillExpand')

// Settings
const $settingsBtn = document.getElementById('settingsBtn')
const $settingsBack = document.getElementById('settingsBack')
const $mainScroll = document.getElementById('mainScroll')
const $settingsScroll = document.getElementById('settingsScroll')
const $themeGlass = document.getElementById('themeGlass')
const $themeSolid = document.getElementById('themeSolid')
const $settingsUserName = document.getElementById('settingsUserName')
const $settingsHostname = document.getElementById('settingsHostname')
const $settingsBackend = document.getElementById('settingsBackend')
const $settingsLaunchAtLogin = document.getElementById('settingsLaunchAtLogin')
const $settingsUpdater = document.getElementById('settingsUpdater')
const $resetUserBtn = document.getElementById('resetUserBtn')
const $settingSound = document.getElementById('settingSound')
const $settingDnd = document.getElementById('settingDnd')
const $settingDndStart = document.getElementById('settingDndStart')
const $settingDndEnd = document.getElementById('settingDndEnd')
const $dndScheduleRow = document.getElementById('dndScheduleRow')
const $settingBackendUrl = document.getElementById('settingBackendUrl')
const $shortcutToggle = document.getElementById('shortcutToggle')
const $shortcutAck = document.getElementById('shortcutAck')
const $settingLaunchAtLogin = document.getElementById('settingLaunchAtLogin')
const $openAdminBtn = document.getElementById('openAdminBtn')
const $historyToggle = document.getElementById('historyToggle')
const $messageHistory = document.getElementById('messageHistory')
const $feedDivider = document.getElementById('feedDivider')
const $miniGoalStrip = document.getElementById('miniGoalStrip')
const $bootSkeleton = document.getElementById('bootSkeleton')
const $toastRoot = document.getElementById('toastRoot')
const $confettiRoot = document.getElementById('confettiRoot')
const $miniCard = document.getElementById('miniCard')
const $settingMeeting = document.getElementById('settingMeeting')
const $quietHourBtn = document.getElementById('quietHourBtn')
const $shortcutGoal = document.getElementById('shortcutGoal')

let backendSaveTimer = null

const TYPE_LABELS = { info: 'Info', warning: 'Aviso', goal: 'Meta', urgent: 'Urgente' }
const SNOOZE_OPTS = [15, 30, 60]
const QUICK_PRESETS = ['Recibido ✓', 'Ok', 'En camino']

let fullActivityBound = false
let activityPingTimer = null

function initChrome() {
  if (!window.TbIcons) return
  document.querySelectorAll('.icon-slot[data-icon]').forEach((el) => {
    const name = el.getAttribute('data-icon')
    const size = el.classList.contains('pager-btn') ? 14 : 16
    const svg = window.TbIcons.icon(name, size)
    if (el.id === 'settingsBack') el.innerHTML = svg + ' Volver'
    else el.innerHTML = svg
  })
  document.querySelectorAll('.settings-icon[data-icon]').forEach((el) => {
    el.innerHTML = window.TbIcons.icon(el.getAttribute('data-icon'), 16)
  })
  ;[
    ['pillBrand', 18],
    ['miniBrand', 18],
    ['fullBrand', 20],
    ['settingsBrand', 22],
  ].forEach(([id, size]) => {
    const el = document.getElementById(id)
    if (el) el.innerHTML = window.TbIcons.brandMark(size)
  })
}
initChrome()

function emptyState(iconName, title, sub) {
  const ico = window.TbIcons?.icon(iconName, 20) || ''
  return `<div class="empty">
    <div class="empty-icon">${ico}</div>
    <div class="empty-title">${escapeHtml(title)}</div>
    <div>${escapeHtml(sub)}</div>
  </div>`
}

function showTransientStatus(msg, ms = 4000) {
  const prev = $syncLabel.textContent
  $syncLabel.textContent = msg
  setTimeout(() => {
    if ($syncLabel.textContent === msg) renderSyncStatus(lastSyncStatus)
  }, ms)
}

let userDisplayName = 'Teiker'
let pendingCount = 0
let currentTheme = 'glass'

let lastMessages = []
let lastGoals = []
let lastHighlight = null
let lastSyncStatus = { lastPollAt: null, lastPollError: null }
let busyRefresh = false
let currentMode = 'mini'
let pendingIndex = 0
const celebratedGoals = new Set()
let newContentCount = 0
let meetingMode = false
let currentUserId = null
let showHistory = false
let pillCelebrationUntil = 0
let hasUrgentPending = false
let snoozedIds = new Set()

$closeBtn.addEventListener('click', () => window.api.closeWindow())
$miniCloseBtn.addEventListener('click', () => window.api.closeWindow())
$refreshBtn.addEventListener('click', refresh)
$refreshFooter.addEventListener('click', refresh)
$expandBtn.addEventListener('click', () => window.api.setMode('full'))
$collapseBtn.addEventListener('click', () => window.api.setMode('mini'))
$shrinkBtn.addEventListener('click', () => window.api.setMode('pill'))
$shrinkFullBtn.addEventListener('click', () => window.api.setMode('pill'))
$pillCard.addEventListener('click', () => window.api.setMode('mini'))
$pillExpand.addEventListener('click', (e) => {
  e.stopPropagation()
  window.api.setMode('mini')
})

$settingsBtn.addEventListener('click', () => openSettings())
$settingsBack.addEventListener('click', () => closeSettings())
$themeGlass.addEventListener('click', () => applyTheme('glass', true))
$themeSolid.addEventListener('click', () => applyTheme('solid', true))
$resetUserBtn.addEventListener('click', async () => {
  if (confirm('¿Cambiar usuario? Tendrás que volver a registrar este equipo.')) {
    await window.api.resetUser()
  }
})

function updateDndScheduleVisibility() {
  $dndScheduleRow.style.display = $settingDnd.checked ? '' : 'none'
}

$settingSound.addEventListener('change', async () => {
  await window.api.setSetting('soundEnabled', $settingSound.checked)
})

$settingDnd.addEventListener('change', async () => {
  updateDndScheduleVisibility()
  await window.api.setSetting('dndEnabled', $settingDnd.checked)
})

async function saveDndTime() {
  await window.api.setSetting('dndStart', $settingDndStart.value)
  await window.api.setSetting('dndEnd', $settingDndEnd.value)
}
$settingDndStart.addEventListener('change', saveDndTime)
$settingDndEnd.addEventListener('change', saveDndTime)

$settingLaunchAtLogin.addEventListener('change', async () => {
  const res = await window.api.setSetting('launchAtLogin', $settingLaunchAtLogin.checked)
  if ($settingLaunchAtLogin.checked && res?.launchAtLogin) {
    $settingsLaunchAtLogin.textContent = 'Activo — se abre al encender el equipo'
  } else if ($settingLaunchAtLogin.checked) {
    $settingsLaunchAtLogin.textContent = 'Activado — puede requerir permiso del sistema'
  } else {
    $settingsLaunchAtLogin.textContent = 'Desactivado'
  }
})

$openAdminBtn.addEventListener('click', () => window.api.openAdminPanel())

$settingMeeting?.addEventListener('change', async () => {
  meetingMode = $settingMeeting.checked
  document.body.classList.toggle('meeting-mode', meetingMode)
  await window.api.setSetting('meetingMode', meetingMode)
})

$quietHourBtn?.addEventListener('click', async () => {
  await window.api.quietFor(60)
  showToast('Silenciado 1 hora')
})

$historyToggle?.addEventListener('click', async () => {
  showHistory = !showHistory
  if (showHistory) {
    const history = await window.api.getMessageHistory()
    renderHistory(history)
    $messageHistory.style.display = ''
    $historyToggle.textContent = 'Ocultar historial'
  } else {
    $messageHistory.style.display = 'none'
    $historyToggle.textContent = 'Ver historial completo'
  }
})

document.addEventListener('click', (e) => {
  const a = e.target.closest('a.msg-link')
  if (a) {
    e.preventDefault()
    window.api.openUrl(a.getAttribute('data-href') || a.getAttribute('href'))
  }
})

$settingBackendUrl.addEventListener('input', () => {
  clearTimeout(backendSaveTimer)
  backendSaveTimer = setTimeout(async () => {
    const url = $settingBackendUrl.value.trim()
    const res = await window.api.setSetting('backendUrlOverride', url || null)
    if (res?.backendUrl) {
      $settingsBackend.textContent = `v${(await window.api.getAppInfo())?.version || '—'} · ${res.backendUrl}`
    }
  }, 800)
})

function applySettingsFromInfo(info, settings) {
  $settingSound.checked = settings?.soundEnabled !== false
  $settingDnd.checked = settings?.dndEnabled === true
  $settingDndStart.value = settings?.dndStart || '22:00'
  $settingDndEnd.value = settings?.dndEnd || '08:00'
  $settingBackendUrl.value = settings?.backendUrlOverride || ''
  if ($settingLaunchAtLogin) {
    $settingLaunchAtLogin.checked = settings?.launchAtLogin !== false
  }
  updateDndScheduleVisibility()
  if (info?.shortcuts?.toggle) $shortcutToggle.textContent = info.shortcuts.toggle
  if (info?.shortcuts?.ackFirst) $shortcutAck.textContent = info.shortcuts.ackFirst
  if (info?.shortcuts?.goalInc) $shortcutGoal.textContent = info.shortcuts.goalInc
  if ($settingMeeting) {
    $settingMeeting.checked = settings?.meetingMode === true
    meetingMode = $settingMeeting.checked
    document.body.classList.toggle('meeting-mode', meetingMode)
  }
  if (info?.isPackaged) {
    $settingsUpdater.textContent = 'Automáticas al reiniciar (electron-updater)'
  } else if (info?.platform === 'win32') {
    $settingsUpdater.textContent = 'Solo en la app instalada (.exe)'
  } else {
    $settingsUpdater.textContent = 'Solo en la app instalada (.dmg / .pkg)'
  }
}

function openSettings() {
  $mainScroll.style.display = 'none'
  $settingsScroll.style.display = ''
}
function closeSettings() {
  $settingsScroll.style.display = 'none'
  $mainScroll.style.display = ''
}

async function applyTheme(theme, persist) {
  currentTheme = theme
  document.body.classList.toggle('theme-glass', theme === 'glass')
  document.body.classList.toggle('theme-solid', theme === 'solid')
  $themeGlass.classList.toggle('active', theme === 'glass')
  $themeSolid.classList.toggle('active', theme === 'solid')
  if (persist) await window.api.setTheme(theme)
}

$pagerPrev.addEventListener('click', () => {
  pendingIndex = Math.max(0, pendingIndex - 1)
  renderMini()
})
$pagerNext.addEventListener('click', () => {
  pendingIndex = pendingIndex + 1
  renderMini()
})

// Cmd/Ctrl+Enter inside the window confirms the current pending ack (if any).
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    const btn = document.querySelector('button[data-action="mini-ack"], button[data-action="ack"]')
    if (btn) btn.click()
  }
})

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function shortDisplayName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return 'Teiker'
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0]}`
}

function linkifyBody(text) {
  const escaped = escapeHtml(text)
  return escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" class="msg-link" data-href="$1">$1</a>'
  )
}

function showToast(msg, ms = 2200) {
  if (!$toastRoot) return
  const el = document.createElement('div')
  el.className = 'toast-item'
  el.textContent = msg
  $toastRoot.appendChild(el)
  setTimeout(() => el.remove(), ms)
}

function spawnConfetti(originEl) {
  if (!$confettiRoot || !originEl) return
  const rect = originEl.getBoundingClientRect()
  const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#fff']
  for (let i = 0; i < 16; i++) {
    const p = document.createElement('span')
    p.className = 'confetti-piece'
    p.style.left = `${rect.left + rect.width / 2 + (Math.random() - 0.5) * 60}px`
    p.style.top = `${rect.top + rect.height / 2}px`
    p.style.background = colors[i % colors.length]
    p.style.animationDelay = `${Math.random() * 120}ms`
    $confettiRoot.appendChild(p)
    setTimeout(() => p.remove(), 1000)
  }
}

function triggerGoalCelebration(goalId) {
  spawnConfetti($goals.querySelector(`[data-goal-id="${goalId}"]`) || $pillCard)
  const bar = $goals.querySelector(`[data-goal-id="${goalId}"] .goal-bar-fill`)
  bar?.classList.add('flash-complete')
  setTimeout(() => bar?.classList.remove('flash-complete'), 700)
  pillCelebrationUntil = Date.now() + 3000
  if (currentMode === 'pill') renderPill()
}

function hideBootSkeleton() {
  $bootSkeleton?.classList.add('hidden')
}

function renderMiniGoalStrip() {
  if (!$miniGoalStrip) return
  const g = lastGoals.find((x) => x.type === 'numeric')
  if (!g || currentMode !== 'mini') {
    $miniGoalStrip.style.display = 'none'
    return
  }
  const target = Number(g.target_value || 0)
  const current = Number(g.current_value || 0)
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0
  $miniGoalStrip.style.display = ''
  $miniGoalStrip.innerHTML = `
    <div class="mini-goal-strip-inner">
      <span>Meta</span>
      <div class="mini-goal-strip-bar">
        <div class="mini-goal-strip-fill" style="width:${pct}%"></div>
      </div>
      <span class="mini-goal-strip-val">${current}/${target}${g.unit ? ` ${escapeHtml(g.unit)}` : ''}</span>
    </div>`
}

function applySnapHint(hint) {
  if (!$pillCard) return
  $pillCard.classList.toggle('snap-hint-top', !!hint?.top)
  $pillCard.classList.toggle('snap-hint-bottom', !!hint?.bottom)
  $pillCard.classList.toggle('snap-hint-left', !!hint?.left)
  $pillCard.classList.toggle('snap-hint-right', !!hint?.right)
}

function snoozeButtonsHtml(messageId) {
  return `<div class="snooze-row">
    ${SNOOZE_OPTS.map((m) => `<button type="button" data-action="snooze" data-id="${messageId}" data-min="${m}">${m} min</button>`).join('')}
  </div>`
}

function attachSnoozeHandlers(container) {
  container.querySelectorAll('button[data-action="snooze"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id')
      const min = Number(btn.getAttribute('data-min'))
      await window.api.snoozeMessage(id, min)
      showToast(`Pospuesto ${min} min`)
    })
  })
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// Returns 0-1: how far through the work day (9am-6pm) we are.
function workdayProgress() {
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  const start = 9 * 60
  const end = 18 * 60
  if (minutes <= start) return 0
  if (minutes >= end) return 1
  return (minutes - start) / (end - start)
}

function paceFor(goal) {
  if (goal.type !== 'numeric') return null
  const target = Number(goal.target_value || 0)
  const current = Number(goal.current_value || 0)
  if (target <= 0) return null
  const progress = workdayProgress()
  if (progress === 0) return { state: 'early', expected: 0, diff: 0 }
  if (progress === 1 && current >= target) return { state: 'ontrack', expected: target, diff: 0 }
  const expected = Math.round(target * progress)
  const diff = current - expected
  let state = 'ontrack'
  if (diff <= -2) state = 'behind'
  else if (diff >= 2) state = 'ahead'
  return { state, expected, diff, progress }
}

function fmtTime(iso) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now - d
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'ahora'
  if (diffMin < 60) return `hace ${diffMin}m`
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const sameYear = d.getFullYear() === now.getFullYear()
  return sameYear
    ? d.toLocaleDateString([], { month: 'short', day: 'numeric' })
    : d.toLocaleDateString()
}

function fmtRelativeShort(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const sec = Math.floor(diffMs / 1000)
  if (sec < 5) return 'justo ahora'
  if (sec < 60) return `hace ${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `hace ${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `hace ${hr}h`
  return d.toLocaleDateString()
}

// ============================================================
// Render: Goals
// ============================================================
function renderGoals(goals) {
  if (!goals.length) {
    $goals.innerHTML = emptyState('target', 'Sin meta hoy', 'El admin asignará objetivos desde el panel.')
    return
  }
  $goals.innerHTML = goals
    .map((g) => {
      if (g.type === 'numeric') {
        const target = Number(g.target_value || 0)
        const current = Number(g.current_value || 0)
        const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0
        const complete = target > 0 && current >= target
        const isCelebrating = complete && !celebratedGoals.has(g.id)
        if (complete) celebratedGoals.add(g.id)
        const pace = paceFor(g)
        const pacePct = pace ? Math.min(100, pace.progress * 100) : 0
        let paceText = ''
        if (pace) {
          if (complete) {
            paceText = `<span class="pace-value ahead">¡Completada! 🎉</span>`
          } else if (pace.state === 'ahead') {
            paceText = `<span class="pace-value ahead">+${pace.diff} adelante</span>`
          } else if (pace.state === 'behind') {
            paceText = `<span class="pace-value behind">${pace.diff} atrás</span>`
          } else if (pace.state === 'early') {
            paceText = `<span class="pace-value ontrack">Empezando el día</span>`
          } else {
            paceText = `<span class="pace-value ontrack">A tiempo</span>`
          }
        }
        return `
          <div class="goal-card numeric" data-goal-id="${g.id}">
            <div class="goal-title">${escapeHtml(g.title)}</div>
            <div class="goal-progress ${isCelebrating ? 'celebrating' : ''}">
              <span class="current goal-current-edit" data-goal-id="${g.id}" title="Clic para editar">${current}</span>
              <span class="separator">/</span>
              <span class="target">${target}</span>
              ${g.unit ? `<span class="unit">${escapeHtml(g.unit)}</span>` : ''}
            </div>
            <div class="goal-bar">
              <div class="goal-bar-fill ${complete ? 'complete' : ''}" style="width:${pct}%"></div>
              ${pace && !complete ? `<div class="goal-pace-marker" style="left:${pacePct}%"></div>` : ''}
            </div>
            ${pace ? `<div class="goal-pace">
              <span class="pace-label">Ritmo del día</span>
              ${paceText}
            </div>` : ''}
            <div class="goal-controls">
              <button data-action="dec" data-goal-id="${g.id}">−1</button>
              <button data-action="inc" data-goal-id="${g.id}">+1</button>
              <button data-action="inc5" data-goal-id="${g.id}">+5</button>
            </div>
          </div>`
      }
      return `
        <div class="goal-card text">
          <div class="goal-title">${escapeHtml(g.title)}</div>
        </div>`
    })
    .join('')

  $goals.querySelectorAll('button[data-goal-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-goal-id')
      const action = btn.getAttribute('data-action')
      const delta = action === 'dec' ? -1 : action === 'inc5' ? 5 : 1
      btn.disabled = true
      try {
        await window.api.incrementGoal(id, delta)
        const curEl = $goals.querySelector(`[data-goal-id="${id}"].goal-current-edit`)
        curEl?.classList.add('number-bump')
        setTimeout(() => curEl?.classList.remove('number-bump'), 350)
      } catch (err) {
        showTransientStatus(`Error en meta: ${err?.message || 'sin conexión'}`)
      } finally {
        btn.disabled = false
      }
    })
  })

  $goals.querySelectorAll('.goal-current-edit').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-goal-id')
      const prev = el.textContent
      const input = document.createElement('input')
      input.type = 'number'
      input.min = '0'
      input.className = 'goal-inline-input'
      input.value = prev
      el.replaceWith(input)
      input.focus()
      input.select()
      const commit = async () => {
        const val = Number(input.value)
        if (!Number.isFinite(val) || val < 0) {
          input.replaceWith(el)
          return
        }
        try {
          await window.api.setGoalValue(id, val)
        } catch (err) {
          showTransientStatus(`Error: ${err?.message || 'sin conexión'}`)
          input.replaceWith(el)
        }
      }
      input.addEventListener('blur', commit)
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur()
        if (e.key === 'Escape') {
          input.replaceWith(el)
        }
      })
    })
  })
}

// ============================================================
// Render: Messages
// ============================================================
function messageHtml(m, isHighlight) {
  const cls = ['message', m.type]
  if (isHighlight) cls.push('highlight')

  const badges = []
  const tl = TYPE_LABELS[m.type] || m.type
  badges.push(`<span class="badge type-${m.type}">${tl}</span>`)
  if (m.target_user_id && currentUserId && m.target_user_id === currentUserId) {
    badges.push('<span class="badge for-you">Para ti</span>')
  }
  if (m.requires_ack) badges.push('<span class="badge ack">Confirmar</span>')

  let ackBlock = ''
  if (m.requires_ack) {
    ackBlock = m.seen
      ? `<div class="message-ack"><span class="ack-done">✓ Confirmado</span></div>`
      : `<div class="message-ack">
           <button class="success" data-action="ack" data-id="${m.id}">Confirmar lectura</button>
           <span class="ack-pending">Pendiente</span>
         </div>
        ${quickReplyHtml(m.id)}
        ${snoozeButtonsHtml(m.id)}`
  }

  return `
    <div class="${cls.join(' ')}" data-id="${m.id}">
      <div class="message-header">
        <span class="message-title">${escapeHtml(m.title)}${badges.join('')}</span>
        <span class="message-time">${fmtTime(m.created_at)}</span>
      </div>
      <div class="message-body">${linkifyBody(m.body)}</div>
      ${ackBlock}
    </div>`
}

function quickReplyHtml(messageId, compact = false) {
  const presets = QUICK_PRESETS.map(
    (text) =>
      `<button type="button" class="quick-preset" data-id="${messageId}" data-text="${escapeHtml(text)}">${escapeHtml(text)}</button>`
  ).join('')
  if (compact) {
    return `<div class="quick-reply quick-reply-compact" data-id="${messageId}">
      <div class="quick-reply-presets">${presets}</div>
    </div>`
  }
  return `<div class="quick-reply" data-id="${messageId}">
    <div class="quick-reply-presets">${presets}</div>
    <div class="quick-reply-row">
      <input type="text" class="quick-reply-input" placeholder="Nota opcional…" maxlength="120" />
      <button type="button" class="quick-reply-send" data-action="quick-reply" data-id="${messageId}">Enviar</button>
    </div>
  </div>`
}

async function submitAck(messageId, replyText, card) {
  await window.api.ackMessage(messageId, replyText || undefined)
  if (card) {
    card.classList.add('ack-dismiss')
    setTimeout(() => card.remove(), 420)
  } else {
    renderCurrentView()
  }
}

function attachQuickReplyHandlers(container) {
  container.querySelectorAll('.quick-reply').forEach((block) => {
    const messageId = block.getAttribute('data-id')
    block.querySelectorAll('.quick-preset').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = block.closest('.message')
        btn.disabled = true
        try {
          await submitAck(messageId, btn.getAttribute('data-text'), card)
          if (!card) renderCurrentView()
        } catch (e) {
          btn.disabled = false
          console.error(e)
        }
      })
    })
    const input = block.querySelector('.quick-reply-input')
    const sendBtn = block.querySelector('[data-action="quick-reply"]')
    if (sendBtn) {
      const runSend = async () => {
        const card = block.closest('.message')
        const note = input?.value?.trim() || ''
        sendBtn.disabled = true
        if (input) input.disabled = true
        try {
          await submitAck(messageId, note || undefined, card)
        } catch (e) {
          sendBtn.disabled = false
          if (input) input.disabled = false
          console.error(e)
        }
      }
      sendBtn.addEventListener('click', runSend)
      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          runSend()
        }
      })
    }
  })
}

function attachAckHandlers(container) {
  container.querySelectorAll('button[data-action="ack"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id')
      const card = btn.closest('.message')
      const note = card?.querySelector('.quick-reply-input')?.value?.trim() || ''
      btn.disabled = true
      btn.classList.add('acking')
      btn.textContent = '✓ Confirmado'
      try {
        await window.api.ackMessage(id, note || undefined)
        if (card) {
          card.classList.add('ack-dismiss')
          setTimeout(() => card.remove(), 420)
        }
      } catch (e) {
        btn.disabled = false
        btn.classList.remove('acking')
        btn.textContent = 'Confirmar lectura'
        console.error(e)
      }
    })
  })
  attachQuickReplyHandlers(container)
  attachSnoozeHandlers(container)
}

function renderMessages(messages, highlightId) {
  // Pending acks first.
  const pending = filterPending(messages)
  if (pending.length > 0) {
    $pendingSection.style.display = ''
    $pendingCount.textContent = String(pending.length)
    $pendingList.innerHTML = pending.map((m) => messageHtml(m, m.id === highlightId)).join('')
    attachAckHandlers($pendingList)
  } else {
    $pendingSection.style.display = 'none'
  }

  // Recent feed (excluding the pending acks already shown above).
  const pendingIds = new Set(pending.map((m) => m.id))
  const recent = messages.filter((m) => !pendingIds.has(m.id)).slice(0, 10)

  $messageCount.textContent = String(messages.length)
  $feedDivider.style.display = pending.length > 0 && recent.length > 0 ? '' : 'none'
  $historyToggle.style.display = messages.length > 0 ? '' : 'none'

  if (recent.length === 0 && pending.length === 0) {
    $messages.innerHTML = emptyState('inbox', 'Sin mensajes', 'Los avisos del equipo aparecerán aquí.')
    return
  }
  if (recent.length === 0) {
    $messages.innerHTML = `<div class="empty">Sin más mensajes recientes</div>`
    return
  }
  $messages.innerHTML = recent.map((m) => messageHtml(m, m.id === highlightId)).join('')
  attachAckHandlers($messages)
  if (showHistory) window.api.getMessageHistory().then(renderHistory)

  if (highlightId) {
    setTimeout(() => {
      const el = document.querySelector(`[data-id="${highlightId}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }
}

function renderHistory(history) {
  if (!$messageHistory) return
  const recentIds = new Set(
    lastMessages.filter((m) => !m.requires_ack || m.seen).slice(0, 10).map((m) => m.id)
  )
  const older = (history || []).filter((m) => !recentIds.has(m.id))
  if (!older.length) {
    $messageHistory.innerHTML = `<div class="empty">Sin mensajes anteriores en caché</div>`
    return
  }
  $messageHistory.innerHTML = older.map((m) => messageHtml(m, false)).join('')
  attachAckHandlers($messageHistory)
}

// ============================================================
// Render: Mini mode
// ============================================================
function filterPending(messages) {
  return messages.filter(
    (m) => m.requires_ack && !m.seen && !snoozedIds.has(m.id)
  )
}

function renderMini() {
  $miniCard?.classList.remove('variant-urgent', 'variant-goal', 'variant-morning')
  renderMiniGoalStrip()
  // Priority 1: pending ack (most recent first).
  const pending = filterPending(lastMessages)
  if (pending.length > 0) {
    // Clamp pendingIndex to range.
    if (pendingIndex >= pending.length) pendingIndex = pending.length - 1
    if (pendingIndex < 0) pendingIndex = 0

    if (pending.length > 1) {
      $miniPager.style.display = ''
      $pagerLabel.textContent = `${pendingIndex + 1} de ${pending.length}`
      $pagerPrev.disabled = pendingIndex === 0
      $pagerNext.disabled = pendingIndex === pending.length - 1
    } else {
      $miniPager.style.display = 'none'
    }

    const m = pending[pendingIndex]
    const isUrgent = m.type === 'urgent'
    if (isUrgent) $miniCard?.classList.add('variant-urgent')
    $miniBody.innerHTML = `
      <div class="mini-pending">
        <div class="badge-row">
          ${isUrgent
            ? '<span class="dot-urgent"></span><span class="label-urgent">URGENTE</span>'
            : '<span class="dot-ack"></span><span class="label-ack">REQUIERE CONFIRMACIÓN</span>'}
        </div>
        <div class="mini-title">${escapeHtml(m.title)}</div>
        <div class="mini-bod">${linkifyBody(m.body)}</div>
        <div class="mini-action">
          <button class="${isUrgent ? 'primary-urgent' : 'success'}" data-action="mini-ack" data-id="${m.id}">${isUrgent ? 'Confirmar ahora' : 'Confirmar lectura'}</button>
        </div>
        ${quickReplyHtml(m.id, true)}
        ${snoozeButtonsHtml(m.id)}
      </div>`
    attachSnoozeHandlers($miniBody)
    attachQuickReplyHandlers($miniBody)
    $miniBody.querySelector('[data-action="mini-ack"]').addEventListener('click', async (e) => {
      const btn = e.currentTarget
      btn.disabled = true
      btn.classList.add('acking')
      btn.textContent = '✓ Confirmado'
      try {
        await window.api.ackMessage(btn.getAttribute('data-id'))
        if (pendingIndex >= pending.length - 1) pendingIndex = Math.max(0, pendingIndex - 1)
        renderMini()
      } catch {
        btn.disabled = false
        btn.classList.remove('acking')
        btn.textContent = 'Confirmar lectura'
      }
    })
    return
  }
  $miniPager.style.display = 'none'

  // Priority 2: latest urgent unconfirmed (no requires_ack but type=urgent and recent)
  const urgent = lastMessages.find((m) => m.type === 'urgent')
  const urgentIsFresh =
    urgent && Date.now() - new Date(urgent.created_at).getTime() < 30 * 60_000
  if (urgentIsFresh) {
    $miniCard?.classList.add('variant-urgent')
    $miniBody.innerHTML = `
      <div class="mini-pending">
        <div class="badge-row">
          <span class="dot-urgent"></span><span class="label-urgent">URGENTE</span>
        </div>
        <div class="mini-title">${escapeHtml(urgent.title)}</div>
        <div class="mini-bod">${linkifyBody(urgent.body)}</div>
        <div class="mini-action">
          <button data-action="mini-expand">Ver detalles</button>
        </div>
      </div>`
    $miniBody
      .querySelector('[data-action="mini-expand"]')
      .addEventListener('click', () => window.api.setMode('full'))
    return
  }

  // Priority 3: numeric goal in progress.
  const numericGoal = lastGoals.find((g) => g.type === 'numeric')
  if (numericGoal) {
    const target = Number(numericGoal.target_value || 0)
    const current = Number(numericGoal.current_value || 0)
    const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0
    const complete = target > 0 && current >= target
    const isCelebrating = complete && !celebratedGoals.has(numericGoal.id)
    if (complete) celebratedGoals.add(numericGoal.id)
    $miniCard?.classList.add('variant-goal')
    const pace = paceFor(numericGoal)
    let paceText = ''
    if (pace) {
      if (complete) paceText = `<span class="pace-value ahead">¡Completada!</span>`
      else if (pace.state === 'ahead') paceText = `<span class="pace-value ahead">+${pace.diff} adelante</span>`
      else if (pace.state === 'behind') paceText = `<span class="pace-value behind">${pace.diff} atrás</span>`
      else if (pace.state === 'early') paceText = `<span class="pace-value ontrack">—</span>`
      else paceText = `<span class="pace-value ontrack">A tiempo</span>`
    }
    $miniBody.innerHTML = `
      <div class="mini-goal">
        <div class="mini-goal-title">
          <span class="mini-goal-name">${escapeHtml(numericGoal.title)}</span>
          ${paceText}
        </div>
        <div class="mini-goal-numbers ${isCelebrating ? 'celebrating' : ''}">
          <span class="current">${current}</span>
          <span class="target">/ ${target}</span>
          ${numericGoal.unit ? `<span class="unit">${escapeHtml(numericGoal.unit)}</span>` : ''}
        </div>
        <div class="mini-goal-bar">
          <div class="mini-goal-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="mini-goal-controls">
          <button data-action="mini-dec" data-goal-id="${numericGoal.id}">−1</button>
          <button data-action="mini-inc" data-goal-id="${numericGoal.id}">+1</button>
          <button data-action="mini-inc5" data-goal-id="${numericGoal.id}">+5</button>
        </div>
      </div>`
    $miniBody.querySelectorAll('button[data-goal-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-goal-id')
        const action = btn.getAttribute('data-action')
        const delta = action === 'mini-dec' ? -1 : action === 'mini-inc5' ? 5 : 1
        btn.disabled = true
        try {
          await window.api.incrementGoal(id, delta)
        } catch (err) {
          showTransientStatus(`Error en meta: ${err?.message || 'sin conexión'}`)
        } finally {
          btn.disabled = false
        }
      })
    })
    return
  }

  // Priority 4: text goal.
  const textGoal = lastGoals.find((g) => g.type === 'text')
  if (textGoal) {
    $miniBody.innerHTML = `
      <div class="mini-goal">
        <div class="mini-goal-title">
          <span>Meta del día</span>
        </div>
        <div class="mini-goal-name">${escapeHtml(textGoal.title)}</div>
      </div>`
    return
  }

  // Priority 5: idle.
  const sub = lastSyncStatus.lastPollError
    ? `Sin conexión`
    : `Sincronizado · ${fmtRelativeShort(lastSyncStatus.lastPollAt)}`
  const checkIco = window.TbIcons?.icon('check', 22) || '✓'
  $miniBody.innerHTML = `
    <div class="mini-idle">
      <div class="mini-idle-icon">${checkIco}</div>
      <div class="mini-idle-text">Sin pendientes</div>
      <div class="mini-idle-sub">${sub}</div>
    </div>`
}

function renderMorningSummary(data) {
  $miniCard?.classList.add('variant-morning')
  const goalLine =
    data.goalTitle && data.goalTarget
      ? `Meta: ${data.goalCurrent ?? 0}/${data.goalTarget} · ${data.goalTitle}`
      : 'Sin meta numérica hoy'
  $miniBody.innerHTML = `
    <div class="mini-idle">
      <div class="mini-idle-icon">${window.TbIcons?.icon('target', 22) || ''}</div>
      <div class="mini-idle-text">Buenos días</div>
      <div class="mini-idle-sub">${data.pending ? `${data.pending} pendiente${data.pending === 1 ? '' : 's'}` : 'Sin pendientes'} · ${escapeHtml(goalLine)}</div>
    </div>`
  renderMiniGoalStrip()
}

function renderCurrentView() {
  if (currentMode === 'pill') renderPill()
  else if (currentMode === 'mini') renderMini()
  else {
    renderMessages(lastMessages, lastHighlight)
    renderGoals(lastGoals)
  }
  applySyncDot()
}

function applyGoals(goals) {
  lastGoals = goals
  for (const g of goals) {
    const target = Number(g.target_value || 0)
    const current = Number(g.current_value || 0)
    if (target > 0 && current >= target && !celebratedGoals.has(g.id)) {
      celebratedGoals.add(g.id)
      triggerGoalCelebration(g.id)
    }
    if (target > 0 && current < target) celebratedGoals.delete(g.id)
  }
  renderCurrentView()
}

function applyMessages(messages, highlightId) {
  lastMessages = messages
  if (highlightId !== undefined) lastHighlight = highlightId
  pendingCount = filterPending(messages).length
  renderCurrentView()
}

function deployOrigin(corner) {
  const y = corner?.bottom ? 'bottom' : 'top'
  const x = corner?.right ? 'right' : 'left'
  return `${y} ${x}`
}

function playDeployAnimation(mode, { corner, expanding = true } = {}) {
  if (!expanding || mode === 'pill') return
  document.documentElement.style.setProperty('--deploy-origin', deployOrigin(corner))
  const el =
    mode === 'mini'
      ? document.getElementById('miniCard')
      : mode === 'full'
        ? document.querySelector('.app')
        : null
  if (!el) return
  el.classList.remove('is-deploying')
  void el.offsetWidth
  el.classList.add('is-deploying')
  el.addEventListener('animationend', () => el.classList.remove('is-deploying'), { once: true })
}

function applyMode(payload) {
  const isBoot = typeof payload === 'string'
  const mode = isBoot ? payload : payload?.mode
  const corner = isBoot ? null : payload?.corner
  const expanding = isBoot ? false : payload?.expanding !== false

  currentMode = mode
  document.body.classList.toggle('mode-pill', mode === 'pill')
  document.body.classList.toggle('mode-mini', mode === 'mini')
  document.body.classList.toggle('mode-full', mode === 'full')
  if (mode !== 'full') closeSettings()
  bindFullActivityTracking(mode === 'full')
  playDeployAnimation(mode, { corner, expanding })
  renderCurrentView()
}

function pingActivityDebounced() {
  if (activityPingTimer) return
  activityPingTimer = setTimeout(() => {
    activityPingTimer = null
    window.api.pingActivity?.()
  }, 800)
}

function bindFullActivityTracking(active) {
  if (active && !fullActivityBound) {
    document.addEventListener('mousedown', pingActivityDebounced, { passive: true })
    document.addEventListener('keydown', pingActivityDebounced, { passive: true })
    document.addEventListener('wheel', pingActivityDebounced, { passive: true })
    document.addEventListener('touchstart', pingActivityDebounced, { passive: true })
    fullActivityBound = true
    window.api.pingActivity?.()
  } else if (!active && fullActivityBound) {
    document.removeEventListener('mousedown', pingActivityDebounced)
    document.removeEventListener('keydown', pingActivityDebounced)
    document.removeEventListener('wheel', pingActivityDebounced)
    document.removeEventListener('touchstart', pingActivityDebounced)
    fullActivityBound = false
    if (activityPingTimer) {
      clearTimeout(activityPingTimer)
      activityPingTimer = null
    }
  }
}

function renderPill() {
  const offline = !!lastSyncStatus.lastPollError
  const hasPending = pendingCount > 0
  const urgentPending = filterPending(lastMessages).some((m) => m.type === 'urgent')
  const celebrating = Date.now() < pillCelebrationUntil
  const $pillBrand = document.getElementById('pillBrand')

  $pillCard?.classList.remove(
    'state-ok',
    'state-pending',
    'state-urgent',
    'state-offline',
    'state-new',
    'state-goal',
    'has-alert',
    'has-new-dot'
  )

  $pillDot.classList.toggle('pending', hasPending)
  $pillDot.classList.toggle('warning', !hasPending && offline)

  if (celebrating) {
    $pillCard?.classList.add('state-goal')
    if ($pillBrand) $pillBrand.style.display = ''
    $pillDot.style.display = 'none'
    $pillLabel.textContent = '¡META!'
    $pillBadge.style.display = 'none'
    return
  }

  if (offline) {
    $pillCard?.classList.add('state-offline')
    if ($pillBrand) $pillBrand.style.display = 'none'
    $pillDot.style.display = ''
    $pillLabel.textContent = 'SIN CONEXIÓN'
    $pillBadge.style.display = 'none'
  } else if (urgentPending) {
    $pillCard?.classList.add('state-urgent', 'has-alert')
    if ($pillBrand) $pillBrand.style.display = 'none'
    $pillDot.style.display = ''
    $pillLabel.textContent = 'URGENTE'
    $pillBadge.style.display = ''
    $pillBadge.textContent = String(pendingCount)
  } else if (hasPending) {
    $pillCard?.classList.add('state-pending', 'has-alert')
    if ($pillBrand) $pillBrand.style.display = 'none'
    $pillDot.style.display = ''
    $pillLabel.textContent = pendingCount === 1 ? 'PENDIENTE' : 'PENDIENTES'
    $pillBadge.style.display = ''
    $pillBadge.textContent = String(pendingCount)
  } else {
    $pillCard?.classList.add('state-ok')
    if ($pillBrand) $pillBrand.style.display = ''
    $pillDot.style.display = 'none'
    $pillLabel.textContent = (userDisplayName || 'Teiker').toUpperCase()
    $pillBadge.style.display = 'none'
    if (newContentCount > 0) {
      $pillCard?.classList.add('state-new', 'has-new-dot')
    }
  }
}

function applySyncDot() {
  const offline = !!lastSyncStatus.lastPollError
  $statusDot?.classList.toggle('offline', offline)
  $miniStatusDot?.classList.toggle('offline', offline)
  $footerDot?.classList.toggle('error', offline)
}

// ============================================================
// Sync status
// ============================================================
function applyAppState(status) {
  if (!status) return
  if (Array.isArray(status.snoozedIds)) snoozedIds = new Set(status.snoozedIds)
  if (typeof status.newContentCount === 'number') newContentCount = status.newContentCount
  if (typeof status.meetingMode === 'boolean') {
    meetingMode = status.meetingMode
    document.body.classList.toggle('meeting-mode', meetingMode)
    if ($settingMeeting) $settingMeeting.checked = meetingMode
  }
}

function renderSyncStatus(status) {
  lastSyncStatus = status
  applyAppState(status)
  const { lastPollAt, lastPollError, pendingAcks = 0 } = status
  if (lastPollError) {
    $syncLabel.textContent = `Sin conexión · ${lastPollError}`
  } else if (pendingAcks > 0) {
    $syncLabel.textContent = `Cola offline · ${pendingAcks} ack${pendingAcks === 1 ? '' : 's'}`
  } else {
    $syncLabel.textContent = lastPollAt
      ? `Sincronizado · ${fmtRelativeShort(lastPollAt)}`
      : 'Conectando...'
  }
  applySyncDot()
}

// ============================================================
// Data loaders
// ============================================================
async function refresh() {
  if (busyRefresh) return
  busyRefresh = true
  $refreshBtn.disabled = true
  $refreshFooter.disabled = true
  try {
    const snap = await window.api.refresh()
    renderSyncStatus(snap)
    applyMessages(snap.messages || lastMessages)
    applyGoals(snap.goals || lastGoals)
  } catch (err) {
    showTransientStatus(`Error al actualizar: ${err?.message || 'sin conexión'}`)
  } finally {
    busyRefresh = false
    $refreshBtn.disabled = false
    $refreshFooter.disabled = false
  }
}

// ============================================================
// Subscriptions
// ============================================================
window.api.onMessagesUpdated((messages) => applyMessages(messages))

window.api.onGoalsUpdated((goals) => applyGoals(goals))

window.api.onHighlight((id) => applyMessages(lastMessages, id))

window.api.onSyncStatus((status) => renderSyncStatus(status))

window.api.onPendingCount((count) => {
  pendingCount = count
  if (currentMode === 'pill') renderPill()
  else renderCurrentView()
})

window.api.onAppState((state) => {
  applyAppState(state)
  if (currentMode === 'pill') renderPill()
})

window.api.onToast((payload) => {
  showToast(payload?.message || '', payload?.ms || 2200)
})

window.api.onGoalComplete(() => {
  const g = lastGoals.find((x) => x.type === 'numeric')
  if (g) triggerGoalCelebration(g.id)
})

window.api.onMorningSummary((data) => {
  renderMorningSummary(data)
})

window.api.onSnapHint((hint) => applySnapHint(hint))

window.api.onModeSet((payload) => {
  applyMode(payload)
})

// ============================================================
// Boot
// ============================================================
async function loadUserName() {
  const u = await window.api.getUser()
  if (!u) return
  currentUserId = u.id
  userDisplayName = shortDisplayName(u.name)
  $miniUserName.textContent = `Teiker · ${userDisplayName}`
  $fullUserName.textContent = userDisplayName
  $settingsUserName.textContent = u.name
  $settingsHostname.textContent = u.hostname || '—'
}

;(async () => {
  const [theme, snap, info, settings] = await Promise.all([
    window.api.getTheme(),
    window.api.getSnapshot(),
    window.api.getAppInfo(),
    window.api.getSettings(),
  ])
  await applyTheme(theme, false)
  $settingsBackend.textContent = `v${info?.version || '—'} · ${info?.backendUrl || '—'}`
  applySettingsFromInfo(info, settings)
  const isMac = info?.platform === 'darwin'
  const isWin = info?.platform === 'win32'
  if (isMac) document.body.classList.add('platform-darwin')
  if (info?.launchAtLogin) {
    $settingsLaunchAtLogin.textContent = 'Activo — se abre al encender el equipo'
  } else if (!info?.isPackaged) {
    $settingsLaunchAtLogin.textContent = isWin
      ? 'En desarrollo. Al instalar el .exe quedará registrado en el sistema.'
      : 'En desarrollo. Al instalar el .dmg quedará registrado en el sistema.'
  } else if (isMac) {
    $settingsLaunchAtLogin.textContent =
      'Pendiente — abre Ajustes del sistema › General › Ítems de inicio'
  } else if (isWin) {
    $settingsLaunchAtLogin.textContent =
      'Pendiente — Configuración › Aplicaciones › Inicio o Administrador de tareas'
  } else {
    $settingsLaunchAtLogin.textContent = 'Pendiente — revisa el inicio automático del sistema'
  }
  await loadUserName()
  const mode = await window.api.getMode()
  applyMode(mode)
  renderSyncStatus(snap)
  applyMessages(snap.messages || [])
  applyGoals(snap.goals || [])
  const highlight = await window.api.getHighlight()
  if (highlight) applyMessages(lastMessages, highlight)
  hideBootSkeleton()
})()

// Actualiza etiquetas de tiempo sin refetch ni re-render completo.
setInterval(() => {
  renderSyncStatus(lastSyncStatus)
  const idleSub = document.querySelector('.mini-idle-sub')
  if (idleSub && currentMode === 'mini') {
    idleSub.textContent = lastSyncStatus.lastPollError
      ? 'Sin conexión'
      : `Sincronizado · ${fmtRelativeShort(lastSyncStatus.lastPollAt)}`
  }
}, 30_000)
