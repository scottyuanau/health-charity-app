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

function login(username, password) {
  if (username === credentials.username && password === credentials.password) {
    state.user = { username }
    return true
  }
  return false
}

function loginWithFirebase(user) {
  if (!user) {
    state.user = null
    return
  }

  state.user = {
    username: user.displayName || user.email || 'Firebase user',
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
  })
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

export { isAuthenticated, login, loginWithFirebase, logout, state }
