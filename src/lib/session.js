// The logged-in user's JWT and profile, kept in localStorage so a page refresh stays signed in.
const KEY = 'minsu_session'
const listeners = new Set()

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null
  } catch {
    return null
  }
}

let current = read()

export const getSession = () => current
export const getToken = () => current?.token ?? null

export function setSession(session) {
  current = session
  try { localStorage.setItem(KEY, JSON.stringify(session)) } catch { /* storage blocked: session lasts until reload */ }
  listeners.forEach(fn => fn(current))
}

export function clearSession() {
  current = null
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  listeners.forEach(fn => fn(null))
}

// Like Firebase's onAuthStateChanged: calls fn now and on every login/logout
export function onSessionChange(fn) {
  listeners.add(fn)
  fn(current)
  return () => listeners.delete(fn)
}
