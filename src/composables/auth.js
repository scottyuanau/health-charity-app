import { computed, reactive } from 'vue'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth as firebaseAuth } from '../firebase'

const credentials = {
  username: 'admin',
  password: '12345',
}

const state = reactive({
  user: null,
})

const isAuthenticated = computed(() => state.user !== null)

let resolveAuthReady
const authReady = new Promise((resolve) => {
  resolveAuthReady = resolve
})

function login(username, password) {
  if (username === credentials.username && password === credentials.password) {
    state.user = { username }
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
    return
  }

  state.user = {
    username: deriveUsernameFromFirebase(user),
    email: user.email || null,
    uid: user.uid,
    provider: 'firebase',
  }
}

function logout() {
  if (firebaseAuth?.currentUser) {
    signOut(firebaseAuth).catch(() => {})
  }
  state.user = null
}

if (firebaseAuth) {
  onAuthStateChanged(firebaseAuth, (user) => {
    if (user) {
      loginWithFirebase(user)
    } else if (state.user?.provider === 'firebase') {
      state.user = null
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
