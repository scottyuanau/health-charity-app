<template>
  <div class="container py-5">
    <div class="row justify-content-center">
      <div class="col-12 col-lg-8 col-xxl-6">
        <div class="card shadow-sm">
          <div class="card-body p-4">
            <h1 class="h3 mb-3 text-center">Sign In</h1>

            <Message
              v-if="missingConfigMessage"
              severity="warn"
              class="mb-3"
              :closable="false"
            >
              {{ missingConfigMessage }}
            </Message>

            <Message v-if="successMessage" severity="success" class="mb-3" :closable="false">
              {{ successMessage }}
            </Message>

            <Message v-if="errorMessage" severity="error" class="mb-3" :closable="false">
              {{ errorMessage }}
            </Message>

            <VForm
              v-if="mode === 'login'"
              :initial-values="loginInitialValues"
              @submit="handleLogin"
            >
              <div class="p-fluid">
                <div class="mb-3">
                  <label for="login-email" class="form-label">Email address</label>
                  <Field name="email" :rules="loginEmailRules" v-slot="{ value, handleChange, handleBlur, errorMessage }">
                    <div class="field-wrapper">
                      <InputText
                        id="login-email"
                        type="email"
                        autocomplete="email"
                        :model-value="value"
                        @update:model-value="handleChange"
                        @blur="handleBlur"
                      />
                      <span class="text-danger field-error" v-if="errorMessage">{{ errorMessage }}</span>
                    </div>
                  </Field>
                </div>

                <div class="mb-4">
                  <label for="login-password" class="form-label">Password</label>
                  <Field name="password" :rules="loginPasswordRules" v-slot="{ value, handleChange, handleBlur, errorMessage }">
                    <div class="field-wrapper">
                      <Password
                        id="login-password"
                        toggleMask
                        :feedback="false"
                        autocomplete="current-password"
                        :model-value="value"
                        @update:model-value="handleChange"
                        @blur="handleBlur"
                      />
                      <span class="text-danger field-error" v-if="errorMessage">{{ errorMessage }}</span>
                    </div>
                  </Field>
                </div>

                <Button
                  type="submit"
                  label="Sign in"
                  class="w-100"
                  :loading="loading"
                  :disabled="loading || !isConfigured"
                />
              </div>
            </VForm>

            <VForm
              v-else
              ref="registerFormRef"
              :initial-values="registrationInitialValues"
              @submit="handleRegister"
            >
              <div class="p-fluid">
                <div class="row g-3">
                  <div class="col-12 col-md-6">
                    <label for="register-username" class="form-label">Username</label>
                    <Field name="username" :rules="usernameRules" v-slot="{ value, handleChange, handleBlur, errorMessage }">
                      <div class="field-wrapper">
                        <InputText
                          id="register-username"
                          autocomplete="username"
                          :model-value="value"
                          @update:model-value="handleChange"
                          @blur="handleBlur"
                        />
                        <span class="text-danger field-error" v-if="errorMessage">{{ errorMessage }}</span>
                      </div>
                    </Field>
                  </div>

                  <div class="col-12 col-md-6">
                    <label for="register-email" class="form-label">Email address</label>
                    <Field name="email" :rules="emailRules" v-slot="{ value, handleChange, handleBlur, errorMessage }">
                      <div class="field-wrapper">
                        <InputText
                          id="register-email"
                          type="email"
                          autocomplete="email"
                          :model-value="value"
                          @update:model-value="handleChange"
                          @blur="handleBlur"
                        />
                        <span class="text-danger field-error" v-if="errorMessage">{{ errorMessage }}</span>
                      </div>
                    </Field>
                  </div>

                  <div class="col-12 col-md-6">
                    <label for="register-password" class="form-label">Password</label>
                    <Field name="password" :rules="passwordRules" v-slot="{ value, handleChange, handleBlur, errorMessage }">
                      <div class="field-wrapper">
                        <Password
                          id="register-password"
                          toggleMask
                          :feedback="false"
                          autocomplete="new-password"
                          :model-value="value"
                          @update:model-value="handleChange"
                          @blur="handleBlur"
                        />
                        <span class="text-danger field-error" v-if="errorMessage">{{ errorMessage }}</span>
                      </div>
                    </Field>

                  </div>

                  <div class="col-12 col-md-6">
                    <label for="register-confirm-password" class="form-label">Confirm password</label>
                    <Field name="confirmPassword" :rules="confirmPasswordRules" v-slot="{ value, handleChange, handleBlur, errorMessage }">
                      <div class="field-wrapper">
                        <Password
                          id="register-confirm-password"
                          toggleMask
                          :feedback="false"
                          autocomplete="new-password"
                          :model-value="value"
                          @update:model-value="handleChange"
                          @blur="handleBlur"
                        />
                        <span class="text-danger field-error" v-if="errorMessage">{{ errorMessage }}</span>
                      </div>
                    </Field>
                  </div>

                  <div class="col-12 col-md-6">
                    <label for="register-dob" class="form-label">Date of birth</label>
                    <Field name="dateOfBirth" :rules="dateOfBirthRules" v-slot="{ value, handleChange, handleBlur, errorMessage }">
                      <div class="field-wrapper">
                        <DatePicker
                          id="register-dob"
                          showIcon
                          :maxDate="today"
                          dateFormat="yy-mm-dd"
                          :model-value="value"
                          @update:model-value="handleChange"
                          @blur="handleBlur"
                        />
                        <span class="text-danger field-error" v-if="errorMessage">{{ errorMessage }}</span>
                      </div>
                    </Field>
                  </div>

                  <div class="col-12 col-md-6">
                    <label for="register-address" class="form-label">Address</label>
                    <Field name="address" :rules="addressRules" v-slot="{ value, handleChange, handleBlur, errorMessage }">
                      <div class="field-wrapper">
                        <InputText
                          id="register-address"
                          autocomplete="street-address"
                          ref="addressInputRef"
                          :model-value="value"
                          @update:model-value="handleChange"
                          @blur="handleBlur"
                        />
                        <span class="text-danger field-error" v-if="errorMessage">{{ errorMessage }}</span>
                      </div>
                    </Field>
                  </div>

                  <div class="col-12">
                    <label for="register-roles" class="form-label">User roles</label>
                    <Field name="roles" :rules="roleRules" :initial-value="[]" v-slot="{ value, handleChange, handleBlur, errorMessage }">
                      <div class="field-wrapper">
                        <MultiSelect
                          inputId="register-roles"
                          :options="roleOptions"
                          optionLabel="label"
                          optionValue="value"
                          display="chip"
                          placeholder="Select roles"
                          :model-value="value"
                          @update:model-value="handleChange"
                          @blur="handleBlur"
                        />
                        <span class="text-danger field-error" v-if="errorMessage">{{ errorMessage }}</span>
                      </div>
                    </Field>

                  </div>
                </div>

                <Button
                  type="submit"
                  label="Create account"
                  class="w-100 mt-4"
                  :loading="loading"
                  :disabled="loading || !isConfigured"
                />
              </div>
            </VForm>

            <div class="mt-4 text-center">
              <Button
                type="button"
                class="p-button-link"
                :label="toggleLabel"
                @click="toggleMode"
                :disabled="loading"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  fetchSignInMethodsForEmail,
} from 'firebase/auth'
import { doc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore'
import { Field, Form as VForm } from 'vee-validate'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import DatePicker from 'primevue/datepicker'
import MultiSelect from 'primevue/multiselect'
import Message from 'primevue/message'

import { auth, db, missingKeys } from '../firebase'
import { useAuth } from '../composables/auth'

const router = useRouter()
const route = useRoute()
const { loginWithFirebase } = useAuth()

const mode = ref('login')
const loading = ref(false)
const successMessage = ref('')
const errorMessage = ref('')

const today = new Date()

const registerFormRef = ref(null)
const addressInputRef = ref(null)
let addressAutocomplete = null
let googleMapsScriptPromise = null

const roleOptions = [
  { label: 'Donor', value: 'donor' },
  { label: 'Beneficiary', value: 'beneficiary' },
  { label: 'Carer', value: 'carer' },
]

const loginInitialValues = {
  email: '',
  password: '',
}

const registrationInitialValues = {
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
  dateOfBirth: null,
  address: '',
  roles: [],
}

const isConfigured = computed(() => !!auth && missingKeys.length === 0)

const missingConfigMessage = computed(() => {
  if (missingKeys.length === 0) {
    return ''
  }

  return `Firebase configuration is incomplete. Please provide the following keys: ${missingKeys.join(', ')}`
})

const toggleLabel = computed(() =>
  mode.value === 'register'
    ? 'Already have an account? Sign in here.'
    : 'Need an account? Register here.',
)

const redirectPath = computed(() => (typeof route.query.redirect === 'string' ? route.query.redirect : '/'))

const usernameRules = (value) => {
  if (!value || !value.trim()) {
    return 'Username is required.'
  }

  if (!/^[a-zA-Z0-9 ]+$/.test(value)) {
    return 'Username may only contain letters, numbers, and spaces.'
  }

  return true
}

const emailRules = async (value) => {
  if (!value) {
    return 'Email is required.'
  }

  const normalized = value.trim().toLowerCase()

  const emailPattern = /[^\s@]+@[^\s@]+\.[^\s@]+/
  if (!emailPattern.test(normalized)) {
    return 'Please enter a valid email address.'
  }

  if (!auth) {
    return true
  }

  try {
    const methods = await fetchSignInMethodsForEmail(auth, normalized)
    if (methods.length > 0) {
      return 'An account with this email already exists.'
    }
  } catch (error) {
    console.error('Failed to validate email uniqueness', error)
    return 'Unable to validate email. Please try again.'
  }

  return true
}

const loginEmailRules = (value) => {
  if (!value) {
    return 'Email is required.'
  }

  const normalized = value.trim()

  const emailPattern = /[^\s@]+@[^\s@]+\.[^\s@]+/
  return emailPattern.test(normalized) ? true : 'Please enter a valid email address.'
}

const passwordRules = (value) => {
  if (!value) {
    return 'Password is required.'
  }

  if (value.length < 8) {
    return 'Password must be at least 8 characters long.'
  }

  if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value)) {
    return 'Password must include uppercase, lowercase, and a number.'
  }

  return true
}

const loginPasswordRules = (value) => {
  if (!value) {
    return 'Password is required.'
  }

  return value.length >= 6 ? true : 'Password must be at least 6 characters long.'
}

const confirmPasswordRules = (value, ctx) => {
  if (!value) {
    return 'Please confirm your password.'
  }

  if (value !== ctx.form.password) {
    return 'Passwords do not match.'
  }

  return true
}

const dateOfBirthRules = (value) => {
  if (!value) {
    return 'Date of birth is required.'
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Please choose a valid date.'
  }

  if (date > today) {
    return 'Date of birth cannot be in the future.'
  }

  return true
}

const addressRules = (value) => {
  if (!value || !value.trim()) {
    return 'Address is required.'
  }

  const normalized = value.trim()
  if (normalized.length < 10) {
    return 'Address must be at least 10 characters long.'
  }

  // Allow letters, numbers, spaces, commas, periods, hyphens, slashes, and apostrophes
  if (!/^[a-zA-Z0-9\s,.'/-]+$/.test(normalized)) {
    return 'Address may only contain letters, numbers, spaces, commas, periods, hyphens, slashes, and apostrophes.'
  }

  return true
}

const roleRules = (value) => {
  if (!Array.isArray(value) || value.length === 0) {
    return 'Please select at least one role.'
  }

  return true
}

const loadGoogleMapsApi = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window is not available'))
  }

  if (window.google?.maps?.places) {
    return Promise.resolve(window.google)
  }

  if (googleMapsScriptPromise) {
    return googleMapsScriptPromise
  }

  const apiKey = import.meta.env.VITE_GOOGLE_MAP_API_KEY

  if (!apiKey) {
    console.warn('Google Maps API key is not configured. Address autocomplete will be disabled.')
    return Promise.reject(new Error('Missing Google Maps API key'))
  }

  googleMapsScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-google-maps-script]')

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.google), { once: true })
      existingScript.addEventListener('error', reject, { once: true })
      return
    }

    const script = document.createElement('script')
    script.setAttribute('data-google-maps-script', 'true')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    script.async = true
    script.defer = true
    script.onload = () => resolve(window.google)
    script.onerror = (event) => reject(event)

    document.head.appendChild(script)
  })

  return googleMapsScriptPromise
}

const destroyAddressAutocomplete = () => {
  if (addressAutocomplete) {
    window.google?.maps?.event?.clearInstanceListeners?.(addressAutocomplete)
    addressAutocomplete = null
  }
}

const initializeAddressAutocomplete = async () => {
  if (mode.value !== 'register') {
    return
  }

  await nextTick()

  const inputComponent = addressInputRef.value
  const inputElement = inputComponent?.$el?.querySelector('input') || inputComponent?.$el || inputComponent

  if (!inputElement) {
    return
  }

  try {
    const google = await loadGoogleMapsApi()

    if (!google?.maps?.places) {
      return
    }

    if (addressAutocomplete) {
      destroyAddressAutocomplete()
    }

    addressAutocomplete = new google.maps.places.Autocomplete(inputElement, {
      types: ['geocode'],
      fields: ['formatted_address'],
    })

    addressAutocomplete.addListener('place_changed', () => {
      const place = addressAutocomplete?.getPlace?.()
      const formattedAddress = place?.formatted_address || inputElement.value || ''

      registerFormRef.value?.setFieldValue?.('address', formattedAddress, true)
    })
  } catch (error) {
    console.error('Failed to initialize Google Maps autocomplete', error)
  }
}

onMounted(() => {
  if (mode.value === 'register') {
    initializeAddressAutocomplete()
  }
})

onBeforeUnmount(() => {
  destroyAddressAutocomplete()
})

watch(
  () => mode.value,
  (newMode) => {
    if (newMode === 'register') {
      initializeAddressAutocomplete()
    } else {
      destroyAddressAutocomplete()
    }
  },
)

watch(
  () => addressInputRef.value,
  (input) => {
    if (input && mode.value === 'register') {
      initializeAddressAutocomplete()
    }
  },
)

const handleLogin = async (values, { resetForm }) => {
  errorMessage.value = ''
  successMessage.value = ''

  if (!isConfigured.value) {
    errorMessage.value = 'Firebase has not been configured yet. Please add your Firebase credentials.'
    return
  }

  loading.value = true

  try {
    const credential = await signInWithEmailAndPassword(auth, values.email.trim(), values.password)

    loginWithFirebase(credential.user)

    successMessage.value = 'Signed in successfully. Redirecting to your destination...'

    setTimeout(() => {
      router.push(redirectPath.value || '/')
    }, 300)
  } catch (error) {
    errorMessage.value = getFriendlyErrorMessage(error)
  } finally {
    loading.value = false
    resetForm({ values: loginInitialValues })
  }
}

const handleRegister = async (values, { resetForm }) => {
  errorMessage.value = ''
  successMessage.value = ''

  if (!isConfigured.value) {
    errorMessage.value = 'Firebase has not been configured yet. Please add your Firebase credentials.'
    return
  }

  loading.value = true

  try {
    const normalizedEmail = values.email.trim().toLowerCase()
    const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, values.password)

    const userDocRef = doc(db, 'users', credential.user.uid)
    await setDoc(userDocRef, {
      username: values.username.trim(),
      email: normalizedEmail,
      dateOfBirth: values.dateOfBirth ? Timestamp.fromDate(new Date(values.dateOfBirth)) : null,
      address: values.address.trim(),
      roles: values.roles,
      createdAt: serverTimestamp(),
    })

    loginWithFirebase(credential.user)

    successMessage.value = 'Account created successfully. Redirecting to your destination...'

    setTimeout(() => {
      router.push(redirectPath.value || '/')
    }, 300)
  } catch (error) {
    errorMessage.value = getFriendlyErrorMessage(error)
  } finally {
    loading.value = false
    resetForm({ values: registrationInitialValues })
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
  border: 1px solid var(--app-border-color, transparent);
  background: var(--app-card-background, #fff);
  color: var(--app-text-color, inherit);
  box-shadow: var(--app-card-shadow, 0 0.5rem 1.5rem rgba(15, 23, 42, 0.08));
}

.card :deep(.form-label),
.card :deep(.form-text),
.card :deep(.p-inputtext),
.card :deep(.p-password-input),
.card :deep(.p-calendar input),
.card :deep(.p-multiselect),
.card :deep(.p-dropdown),
.card :deep(.p-multiselect-label) {
  color: inherit;
}

.card :deep(.p-inputtext),
.card :deep(.p-password-input),
.card :deep(.p-calendar input),
.card :deep(.p-multiselect),
.card :deep(.p-dropdown),
.card :deep(.p-multiselect-label) {
  background-color: var(--app-surface, #fff);
  border-color: var(--app-border-color, rgba(0, 0, 0, 0.08));
}

.p-button-link {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--bs-primary);
}

.p-button-link:hover {
  text-decoration: underline;
}

.field-wrapper {
  display: flex;
  flex-direction: column;
}

.field-error {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.85rem;
}

.text-danger {
  font-size: 0.85rem;
}

.field-wrapper :deep(.p-inputtext),
.field-wrapper :deep(.p-password),
.field-wrapper :deep(.p-password-input),
.field-wrapper :deep(.p-calendar),
.field-wrapper :deep(.p-calendar .p-inputtext),
.field-wrapper :deep(.p-datepicker .p-inputtext),
.field-wrapper :deep(.p-multiselect) {
  width: 100%;
}
</style>
