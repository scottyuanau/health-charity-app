<template>
  <div class="container py-5">
    <div class="row justify-content-center">

      <div class="card shadow-sm">
        <div class="card-body p-4">
          <h1 class="h3 mb-3 text-center">Firebase Sign In</h1>
          <p v-if="missingConfigMessage" class="alert alert-warning" role="alert">
            {{ missingConfigMessage }}
          </p>
          <p v-if="successMessage" class="alert alert-success" role="alert">
            {{ successMessage }}
          </p>
          <p v-if="errorMessage" class="alert alert-danger" role="alert">
            {{ errorMessage }}
          </p>
          <form @submit.prevent="handleSubmit" novalidate>
            <div class="mb-3">
              <label for="firebase-email" class="form-label">Email address</label>
              <input
                id="firebase-email"
                type="email"
                class="form-control"
                v-model="form.email"
                autocomplete="email"
                required
              />
            </div>
            <div class="mb-3">
              <label for="firebase-password" class="form-label">Password</label>
              <input
                id="firebase-password"
                type="password"
                class="form-control"
                v-model="form.password"
                autocomplete="current-password"
                required
                minlength="6"
              />
              <div class="form-text">Passwords must be at least 6 characters long.</div>
            </div>
            <div class="d-grid gap-2">
              <button type="submit" class="btn btn-primary" :disabled="loading || !isConfigured">
                <span v-if="loading" class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                {{ submitLabel }}
              </button>
            </div>
          </form>
          <div class="mt-4 text-center">
            <button
              type="button"
              class="btn btn-link p-0 text-decoration-none"
              @click="toggleMode"
              :disabled="loading"
            >
              {{ toggleLabel }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'
import { auth, missingKeys } from '../firebase'
import { useAuth } from '../composables/auth'

const router = useRouter()
const route = useRoute()
const { loginWithFirebase } = useAuth()

const form = reactive({
  email: '',
  password: '',
})

const mode = ref('login')
const loading = ref(false)
const successMessage = ref('')
const errorMessage = ref('')

const isConfigured = computed(() => !!auth && missingKeys.length === 0)

const missingConfigMessage = computed(() => {
  if (missingKeys.length === 0) {
    return ''
  }

  return `Firebase configuration is incomplete. Please provide the following keys: ${missingKeys.join(', ')}`
})

const submitLabel = computed(() => (mode.value === 'register' ? 'Create account' : 'Sign in'))

const toggleLabel = computed(() =>
  mode.value === 'register'
    ? 'Already have an account? Sign in with Firebase'
    : "Need an account? Register with Firebase",
)

const redirectPath = computed(() => (typeof route.query.redirect === 'string' ? route.query.redirect : '/'))

const handleSubmit = async () => {
  errorMessage.value = ''
  successMessage.value = ''

  if (!form.email || !form.password) {
    errorMessage.value = 'Please provide both an email address and password.'
    return
  }

  if (!isConfigured.value) {
    errorMessage.value = 'Firebase has not been configured yet. Please add your Firebase credentials.'
    return
  }

  loading.value = true

  try {
    const credential =
      mode.value === 'register'
        ? await createUserWithEmailAndPassword(auth, form.email, form.password)
        : await signInWithEmailAndPassword(auth, form.email, form.password)

    loginWithFirebase(credential.user)

    const message =
      mode.value === 'register'
        ? 'Account created successfully. Redirecting to your destination...'
        : 'Signed in successfully. Redirecting to your destination...'

    successMessage.value = message

    setTimeout(() => {
      router.push(redirectPath.value || '/')
    }, 300)
  } catch (error) {
    errorMessage.value = getFriendlyErrorMessage(error)
  } finally {
    loading.value = false
    form.password = ''
  }
}

const toggleMode = () => {
  mode.value = mode.value === 'register' ? 'login' : 'register'
  successMessage.value = ''
  errorMessage.value = ''
}

const getFriendlyErrorMessage = (error) => {
  if (!error?.code) {
    return 'An unexpected error occurred. Please try again.'
  }

  switch (error.code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.'
    case 'auth/invalid-email':
      return 'The email address is not valid.'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'The email or password you entered is incorrect.'
    case 'auth/user-not-found':
      return 'No account was found with this email address.'
    case 'auth/weak-password':
      return 'Please choose a stronger password (at least 6 characters).'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.'
    default:
      return 'Unable to complete the request. Please try again later.'
  }
}
</script>

<style scoped>
.card {
  border: none;
}
</style>
