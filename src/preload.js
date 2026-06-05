const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  getUser: () => ipcRenderer.invoke('user:get'),
  registerUser: (name, backendUrl) => ipcRenderer.invoke('user:register', { name, backendUrl }),
  resetUser: () => ipcRenderer.invoke('user:reset'),
  listMessages: () => ipcRenderer.invoke('messages:list'),
  ackMessage: (id, replyText) =>
    ipcRenderer.invoke('messages:ack', replyText ? { messageId: id, replyText } : id),
  pingActivity: () => ipcRenderer.send('activity:ping'),
  snoozeMessage: (messageId, minutes) =>
    ipcRenderer.invoke('messages:snooze', { messageId, minutes }),
  getMessageHistory: () => ipcRenderer.invoke('messages:history'),
  listGoals: (date) => ipcRenderer.invoke('goals:list', date),
  incrementGoal: (goalId, delta) => ipcRenderer.invoke('goals:increment', { goalId, delta }),
  setGoalValue: (goalId, value) => ipcRenderer.invoke('goals:setValue', { goalId, value }),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  getHighlight: () => ipcRenderer.invoke('window:get-highlight'),
  getSyncStatus: () => ipcRenderer.invoke('sync:status'),
  getSnapshot: () => ipcRenderer.invoke('sync:snapshot'),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  refresh: () => ipcRenderer.invoke('sync:refresh'),
  openUrl: (url) => ipcRenderer.invoke('app:open-url', url),
  quietFor: (minutes) => ipcRenderer.invoke('app:quiet-for', minutes),
  onMessagesUpdated: (cb) => {
    const listener = (_e, messages) => cb(messages)
    ipcRenderer.on('messages:updated', listener)
    return () => ipcRenderer.removeListener('messages:updated', listener)
  },
  onGoalsUpdated: (cb) => {
    const listener = (_e, goals) => cb(goals)
    ipcRenderer.on('goals:updated', listener)
    return () => ipcRenderer.removeListener('goals:updated', listener)
  },
  onHighlight: (cb) => {
    const listener = (_e, id) => cb(id)
    ipcRenderer.on('messages:highlight', listener)
    return () => ipcRenderer.removeListener('messages:highlight', listener)
  },
  onSyncStatus: (cb) => {
    const listener = (_e, status) => cb(status)
    ipcRenderer.on('sync:status', listener)
    return () => ipcRenderer.removeListener('sync:status', listener)
  },
  onAppState: (cb) => {
    const listener = (_e, state) => cb(state)
    ipcRenderer.on('app:state', listener)
    return () => ipcRenderer.removeListener('app:state', listener)
  },
  onToast: (cb) => {
    const listener = (_e, payload) => cb(payload)
    ipcRenderer.on('toast:show', listener)
    return () => ipcRenderer.removeListener('toast:show', listener)
  },
  onGoalComplete: (cb) => {
    const listener = (_e, payload) => cb(payload)
    ipcRenderer.on('goal:complete', listener)
    return () => ipcRenderer.removeListener('goal:complete', listener)
  },
  onMorningSummary: (cb) => {
    const listener = (_e, payload) => cb(payload)
    ipcRenderer.on('morning:summary', listener)
    return () => ipcRenderer.removeListener('morning:summary', listener)
  },
  onSnapHint: (cb) => {
    const listener = (_e, hint) => cb(hint)
    ipcRenderer.on('snap:hint', listener)
    return () => ipcRenderer.removeListener('snap:hint', listener)
  },
  getMode: () => ipcRenderer.invoke('mode:get'),
  setMode: (mode) => ipcRenderer.invoke('mode:set', mode),
  onModeSet: (cb) => {
    const listener = (_e, payload) => cb(payload)
    ipcRenderer.on('mode:set', listener)
    return () => ipcRenderer.removeListener('mode:set', listener)
  },
  onPendingCount: (cb) => {
    const listener = (_e, count) => cb(count)
    ipcRenderer.on('pending:count', listener)
    return () => ipcRenderer.removeListener('pending:count', listener)
  },
  getTheme: () => ipcRenderer.invoke('theme:get'),
  setTheme: (theme) => ipcRenderer.invoke('theme:set', theme),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),
  openAdminPanel: () => ipcRenderer.invoke('app:open-admin'),
})
