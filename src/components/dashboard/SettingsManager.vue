<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Field, Form as VForm } from 'vee-validate'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import DatePicker from 'primevue/datepicker'
import MultiSelect from 'primevue/multiselect'
import Message from 'primevue/message'
import {
  fetchSignInMethodsForEmail,
  updateEmail,
  updatePassword,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore'

import { auth, db, missingKeys } from '@/firebase'
import { useAuth } from '@/composables/auth'

const { state, loginWithFirebase } = useAuth()

const today = new Date()

const roleOptions = [
  { label: 'Donor', value: 'donor' },
  { label: 'Beneficiary', value: 'beneficiary' },
  { label: 'Carer', value: 'carer' },
]

const emptyValues = () => ({
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
  dateOfBirth: null,
  address: '',
  roles: [],
})

const formRef = ref(null)
const addressInputRef = ref(null)
const formInitialValues = ref(emptyValues())
const formKey = ref(0)
const loadingProfile = ref(false)
const saving = ref(false)
const successMessage = ref('')
const errorMessage = ref('')
const existingProfile = ref(null)
const originalEmail = ref('')
const originalUsername = ref('')

let addressAutocomplete = null
let googleMapsScriptPromise = null

const isConfigured = computed(() => !!auth && !!db && missingKeys.length === 0)

const firebaseUid = computed(() => state.user?.uid || null)

const missingConfigMessage = computed(() => {
  if (missingKeys.length === 0) {
    return ''
  }

  return `Firebase configuration is incomplete. Please provide the following keys: ${missingKeys.join(', ')}`
})

const isSubmitDisabled = computed(() => saving.value || !isConfigured.value || !firebaseUid.value)

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

  if (!auth || normalized === originalEmail.value) {
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

const passwordRules = (value) => {
  if (!value) {
    return true
  }

  if (value.length < 8) {
    return 'Password must be at least 8 characters long.'
  }

  if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value)) {
    return 'Password must include uppercase, lowercase, and a number.'
  }

  return true
}

const confirmPasswordRules = (value, ctx) => {
  if (!ctx.form.password) {
    return true
  }

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

const normalizeDate = (input) => {
  if (!input) {
    return null
  }

  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input
  }

  if (typeof input?.toDate === 'function') {
    const date = input.toDate()
    return Number.isNaN(date.getTime()) ? null : date
  }

  const parsed = new Date(input)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const resetFormState = () => {
  formInitialValues.value = emptyValues()
  formKey.value += 1
  originalEmail.value = ''
  originalUsername.value = ''
  existingProfile.value = null
}

const loadUserProfile = async () => {
  if (!isConfigured.value || !firebaseUid.value) {
    resetFormState()
    return
  }

  const currentUser = auth?.currentUser

  if (!currentUser) {
    resetFormState()
    return
  }

  loadingProfile.value = true
  errorMessage.value = ''

  try {
    const userDocRef = doc(db, 'users', currentUser.uid)
    const snapshot = await getDoc(userDocRef)

    const data = snapshot.exists() ? snapshot.data() : {}
    existingProfile.value = data

    const username = (data?.username || currentUser.displayName || state.user?.username || '').trim()
    const email = (currentUser.email || '').trim()
    const dateOfBirth = normalizeDate(data?.dateOfBirth)
    const address = typeof data?.address === 'string' ? data.address : ''
    const roles = Array.isArray(data?.roles) ? data.roles.filter((role) => typeof role === 'string') : []

    originalEmail.value = email.toLowerCase()
    originalUsername.value = username

    const values = {
      username,
      email,
      password: '',
      confirmPassword: '',
      dateOfBirth,
      address,
      roles,
    }

    formInitialValues.value = values
    formKey.value += 1
  } catch (error) {
    console.error('Failed to load profile settings', error)
    errorMessage.value =
      'We were unable to load your profile settings from Firebase. Please try again.'
    resetFormState()
  } finally {
    loadingProfile.value = false

    nextTick(() => {
      initializeAddressAutocomplete()
    })
  }
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
  await nextTick()

  const inputComponent = addressInputRef.value
  const inputElement = inputComponent?.$el?.querySelector?.('input') || inputComponent?.$el || inputComponent

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

      formRef.value?.setFieldValue?.('address', formattedAddress, true)
    })
  } catch (error) {
    console.error('Failed to initialize Google Maps autocomplete', error)
  }
}

onMounted(() => {
  if (firebaseUid.value && isConfigured.value) {
    loadUserProfile()
  }

  initializeAddressAutocomplete()
})

onBeforeUnmount(() => {
  destroyAddressAutocomplete()
})

watch(
  () => firebaseUid.value,
  (uid) => {
    if (uid && isConfigured.value) {
      loadUserProfile()
    } else {
      resetFormState()
    }
  },
)

watch(
  () => addressInputRef.value,
  (input) => {
    if (input) {
      initializeAddressAutocomplete()
    }
  },
)

const getFriendlyErrorMessage = (error) => {
  if (!error?.code) {
    return 'An unexpected error occurred. Please try again.'
  }

  switch (error.code) {
    case 'auth/requires-recent-login':
      return 'Please sign in again before updating sensitive information like your email or password.'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.'
    case 'auth/invalid-email':
      return 'The email address is not valid.'
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.'
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.'
    default:
      return 'We were unable to save your changes. Please try again.'
  }
}

const handleSubmit = async (values, { resetForm }) => {
  if (!isConfigured.value) {
    errorMessage.value = 'Firebase has not been configured yet. Please add your Firebase credentials.'
    return
  }

  const currentUser = auth?.currentUser

  if (!currentUser || !firebaseUid.value) {
    errorMessage.value = 'Please sign in again before updating your settings.'
    return
  }

  successMessage.value = ''
  errorMessage.value = ''
  saving.value = true

  try {
    const trimmedUsername = values.username.trim()
    const normalizedEmail = values.email.trim().toLowerCase()
    const shouldUpdateUsername = trimmedUsername !== originalUsername.value
    const shouldUpdateEmail = normalizedEmail !== originalEmail.value
    const shouldUpdatePassword = !!values.password

    if (shouldUpdateEmail) {
      await updateEmail(currentUser, normalizedEmail)
      originalEmail.value = normalizedEmail
    }

    if (shouldUpdatePassword) {
      await updatePassword(currentUser, values.password)
    }

    if (shouldUpdateUsername) {
      await updateProfile(currentUser, { displayName: trimmedUsername })
      originalUsername.value = trimmedUsername
    }

    const normalizedDate = normalizeDate(values.dateOfBirth)

    const payload = {
      username: trimmedUsername,
      email: normalizedEmail,
      address: values.address.trim(),
      roles: Array.isArray(values.roles) ? values.roles : [],
      dateOfBirth: normalizedDate ? Timestamp.fromDate(normalizedDate) : null,
      updatedAt: serverTimestamp(),
    }

    if (!existingProfile.value) {
      payload.createdAt = serverTimestamp()
    }

    const userDocRef = doc(db, 'users', currentUser.uid)
    await setDoc(userDocRef, payload, { merge: true })

    existingProfile.value = {
      ...(existingProfile.value || {}),
      ...payload,
    }

    loginWithFirebase(currentUser)

    successMessage.value = 'Your settings have been updated successfully.'

    resetForm({
      values: {
        username: trimmedUsername,
        email: normalizedEmail,
        password: '',
        confirmPassword: '',
        dateOfBirth: normalizedDate ? new Date(normalizedDate) : null,
        address: values.address.trim(),
        roles: Array.isArray(values.roles) ? values.roles : [],
      },
    })
  } catch (error) {
    console.error('Failed to update settings', error)
    errorMessage.value = getFriendlyErrorMessage(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="settings-manager">
    <h2 class="settings-manager__title">Profile Settings</h2>

    <Message v-if="missingConfigMessage" severity="warn" class="mb-3" :closable="false">
      {{ missingConfigMessage }}
    </Message>

    <Message v-if="successMessage" severity="success" class="mb-3" :closable="false">
      {{ successMessage }}
    </Message>

    <Message v-if="errorMessage" severity="error" class="mb-3" :closable="false">
      {{ errorMessage }}
    </Message>

    <Message
      v-if="!firebaseUid && !loadingProfile && isConfigured"
      severity="info"
      class="mb-3"
      :closable="false"
    >
      Sign in with your account to update your profile settings.
    </Message>

    <div v-if="loadingProfile" class="settings-manager__loading">Loading your settings…</div>

    <VForm
      v-else-if="firebaseUid && isConfigured"
      :key="formKey"
      ref="formRef"
      class="settings-manager__form"
      :initial-values="formInitialValues"
      @submit="handleSubmit"
    >
      <div class="row g-3">
        <div class="col-12 col-md-6">
          <label for="settings-username" class="form-label">Username</label>
          <Field name="username" :rules="usernameRules" v-slot="{ value, handleChange, handleBlur, errorMessage }">
            <div class="field-wrapper">
              <InputText
                id="settings-username"
                autocomplete="username"
                :model-value="value"
                :disabled="isSubmitDisabled"
                @update:model-value="handleChange"
                @blur="handleBlur"
              />
              <span class="text-danger field-error" v-if="errorMessage">{{ errorMessage }}</span>
            </div>
          </Field>
        </div>

        <div class="col-12 col-md-6">
          <label for="settings-email" class="form-label">Email address</label>
          <Field name="email" :rules="emailRules" v-slot="{ value, handleChange, handleBlur, errorMessage }">
            <div class="field-wrapper">
              <InputText
                id="settings-email"
                type="email"
                autocomplete="email"
                :model-value="value"
                :disabled="isSubmitDisabled"
                @update:model-value="handleChange"
                @blur="handleBlur"
              />
              <span class="text-danger field-error" v-if="errorMessage">{{ errorMessage }}</span>
            </div>
          </Field>
        </div>

        <div class="col-12 col-md-6">
          <label for="settings-password" class="form-label">New password</label>
          <Field name="password" :rules="passwordRules" v-slot="{ value, handleChange, handleBlur, errorMessage }">
            <div class="field-wrapper">
              <Password
                id="settings-password"
                toggleMask
                :feedback="false"
                autocomplete="new-password"
                :model-value="value"
                :disabled="isSubmitDisabled"
                @update:model-value="handleChange"
                @blur="handleBlur"
              />
              <small class="text-muted">Leave blank to keep your current password.</small>
              <span class="text-danger field-error" v-if="errorMessage">{{ errorMessage }}</span>
            </div>
          </Field>
        </div>

        <div class="col-12 col-md-6">
          <label for="settings-confirm-password" class="form-label">Confirm new password</label>
          <Field
            name="confirmPassword"
            :rules="confirmPasswordRules"
            v-slot="{ value, handleChange, handleBlur, errorMessage }"
          >
            <div class="field-wrapper">
              <Password
                id="settings-confirm-password"
                toggleMask
                :feedback="false"
                autocomplete="new-password"
                :model-value="value"
                :disabled="isSubmitDisabled"
                @update:model-value="handleChange"
                @blur="handleBlur"
              />
              <span class="text-danger field-error" v-if="errorMessage">{{ errorMessage }}</span>
            </div>
          </Field>
        </div>

        <div class="col-12 col-md-6">
          <label for="settings-dob" class="form-label">Date of birth</label>
          <Field name="dateOfBirth" :rules="dateOfBirthRules" v-slot="{ value, handleChange, handleBlur, errorMessage }">
            <div class="field-wrapper">
              <DatePicker
                id="settings-dob"
                showIcon
                :maxDate="today"
                dateFormat="yy-mm-dd"
                :model-value="value"
                :disabled="isSubmitDisabled"
                @update:model-value="handleChange"
                @blur="handleBlur"
              />
              <span class="text-danger field-error" v-if="errorMessage">{{ errorMessage }}</span>
            </div>
          </Field>
        </div>

        <div class="col-12 col-md-6">
          <label for="settings-address" class="form-label">Address</label>
          <Field name="address" :rules="addressRules" v-slot="{ value, handleChange, handleBlur, errorMessage }">
            <div class="field-wrapper">
              <InputText
                id="settings-address"
                autocomplete="street-address"
                ref="addressInputRef"
                :model-value="value"
                :disabled="isSubmitDisabled"
                @update:model-value="handleChange"
                @blur="handleBlur"
              />
              <span class="text-danger field-error" v-if="errorMessage">{{ errorMessage }}</span>
            </div>
          </Field>
        </div>

        <div class="col-12">
          <label for="settings-roles" class="form-label">User roles</label>
          <Field name="roles" :rules="roleRules" :initial-value="[]" v-slot="{ value, handleChange, handleBlur, errorMessage }">
            <div class="field-wrapper">
              <MultiSelect
                inputId="settings-roles"
                :options="roleOptions"
                optionLabel="label"
                optionValue="value"
                display="chip"
                placeholder="Select roles"
                :model-value="value"
                :disabled="isSubmitDisabled"
                @update:model-value="handleChange"
                @blur="handleBlur"
              />
              <span class="text-danger field-error" v-if="errorMessage">{{ errorMessage }}</span>
            </div>
          </Field>
        </div>
      </div>

      <div class="settings-manager__actions">
        <Button type="submit" label="Save changes" class="w-100" :loading="saving" :disabled="isSubmitDisabled" />
      </div>
    </VForm>
  </section>
</template>

<style scoped>
.settings-manager {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.settings-manager__title {
  font-size: clamp(1.25rem, 0.8vw + 1rem, 1.75rem);
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.settings-manager__loading {
  padding: 1rem;
  border: 1px solid var(--surface-border, #dfe7ef);
  border-radius: 0.75rem;
  text-align: center;
  background: var(--surface-card, #ffffff);
  color: var(--text-color, #1f2933);
}

.field-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.field-error {
  font-size: 0.875rem;
}

.settings-manager__actions {
  margin-top: 1rem;
}
</style>
