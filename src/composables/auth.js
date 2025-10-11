import { computed, reactive } from 'vue'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth as firebaseAuth } from '../firebase'

const STORAGE_KEY = 'health-charity-app:authUser'
const STORAGE_DURATION_MS = 7 * 24 * 60 * 60 * 1000

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function clearPersistedUser() {
  if (!isBrowser()) return

  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.warn('Failed to clear persisted auth state', error)
  }
}

function persistUser(user) {
  if (!isBrowser()) return

  if (!user) {
    clearPersistedUser()
    return
  }

  try {
    const payload = {
      user,
      expiresAt: Date.now() + STORAGE_DURATION_MS,
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch (error) {
    console.warn('Failed to persist auth state', error)
  }
}

function loadPersistedUser() {
  if (!isBrowser()) return null

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      clearPersistedUser()
      return null
    }

    const { user, expiresAt } = parsed
    if (typeof expiresAt !== 'number' || expiresAt < Date.now()) {
      clearPersistedUser()
      return null
    }

    if (!user || typeof user !== 'object') {
      clearPersistedUser()
      return null
    }

    return user
  } catch (error) {
    console.warn('Failed to load persisted auth state', error)
    clearPersistedUser()
    return null
  }
}

const credentials = {
  username: 'admin',
  password: '12345',
}

const state = reactive({
  user: loadPersistedUser(),
})

const isAuthenticated = computed(() => state.user !== null)

let resolveAuthReady
const authReady = new Promise((resolve) => {
  resolveAuthReady = resolve
})

function login(username, password) {
  if (username === credentials.username && password === credentials.password) {
    state.user = { username }
    persistUser(state.user)
    return true
  }
  return false
}

function deriveUsernameFromFirebase(user) {
  if (!user) return 'Firebase user'

  const displayName = user.displayName?.trim()
  if (displayName) return displayName

  const email = user.email?.trim()
  if (email) {
    const [namePart] = email.split('@')
    if (namePart) return namePart
    return email
  }

  return 'Firebase user'
}

function loginWithFirebase(user) {
  if (!user) {
    state.user = null
    persistUser(state.user)
    return
  }

  state.user = {
    username: deriveUsernameFromFirebase(user),
    email: user.email || null,
    uid: user.uid,
    provider: 'firebase',
  }
  persistUser(state.user)
}

function logout() {
  if (firebaseAuth?.currentUser) {
    signOut(firebaseAuth).catch(() => {})
  }
  state.user = null
  persistUser(state.user)
}

if (firebaseAuth) {
  onAuthStateChanged(firebaseAuth, (user) => {
    if (user) {
      loginWithFirebase(user)
    } else if (state.user?.provider === 'firebase') {
      state.user = null
      persistUser(state.user)
    }

    resolveAuthReady?.()
  })
} else {
  resolveAuthReady?.()
}

export function useAuth() {
  return {
    state,
    login,
    loginWithFirebase,
    logout,
    isAuthenticated,
  }
}

export { authReady, isAuthenticated, login, loginWithFirebase, logout, state }
