<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import DatePicker from 'primevue/datepicker'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp } from 'firebase/firestore'

import { useAuth } from '@/composables/auth'
import { db } from '@/firebase'

const { state } = useAuth()

const form = ref({
  cardNumber: '',
  expiryDate: null,
  cvv: '',
  billingAddress: '',
  nameOnCard: '',
})

const errors = ref({
  cardNumber: '',
  expiryDate: '',
  cvv: '',
  billingAddress: '',
  nameOnCard: '',
})

const saving = ref(false)
const saveSuccess = ref('')
const saveError = ref('')

const paymentMethods = ref([])
const loadingMethods = ref(false)
const loadError = ref('')

const addressInputRef = ref(null)
let addressAutocomplete = null
let googleMapsScriptPromise = null
let unsubscribe = null

const firebaseUser = computed(() => {
  const user = state.user
  if (user?.provider === 'firebase' && user.uid) {
    return user
  }
  return null
})

const canManagePayments = computed(() => Boolean(db) && Boolean(firebaseUser.value))

const resetFeedback = () => {
  saveError.value = ''
  saveSuccess.value = ''
}

const sanitizeCardNumber = (value) => {
  if (typeof value !== 'string') return ''
  return value.replace(/\D+/g, '').slice(0, 16)
}

const sanitizeCvv = (value) => {
  if (typeof value !== 'string') return ''
  return value.replace(/\D+/g, '').slice(0, 3)
}

const cardNumberRules = (value) => {
  const sanitized = sanitizeCardNumber(value)
  if (sanitized.length !== 16) {
    return 'Card number must be exactly 16 digits.'
  }
  return true
}

const expiryDateRules = (value) => {
  if (!value) {
    return 'Expiry date is required.'
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Please choose a valid expiry date.'
  }
  return true
}

const cvvRules = (value) => {
  const sanitized = sanitizeCvv(value)
  if (sanitized.length !== 3) {
    return 'CVV must be exactly 3 digits.'
  }
  return true
}

const billingAddressRules = (value) => {
  if (!value || !value.trim()) {
    return 'Billing address is required.'
  }
  if (value.trim().length < 5) {
    return 'Billing address must be at least 5 characters long.'
  }
  return true
}

const nameOnCardRules = (value) => {
  if (!value || !value.trim()) {
    return 'Name on card is required.'
  }
  const normalized = value.trim()
  if (normalized.length < 3 || normalized.length > 60) {
    return 'Name on card must be between 3 and 60 characters.'
  }
  if (!/^[A-Za-z][A-Za-z\s\-']*$/.test(normalized)) {
    return "Name on card may only contain letters, spaces, hyphens, and apostrophes, and must start with a letter."
  }
  return true
}

const validateField = (key, value) => {
  let result = true
  switch (key) {
    case 'cardNumber':
      result = cardNumberRules(value)
      break
    case 'expiryDate':
      result = expiryDateRules(value)
      break
    case 'cvv':
      result = cvvRules(value)
      break
    case 'billingAddress':
      result = billingAddressRules(value)
      break
    case 'nameOnCard':
      result = nameOnCardRules(value)
      break
    default:
      result = true
  }

  errors.value[key] = result === true ? '' : result
  return result === true
}

const validateForm = () => {
  const validations = Object.entries(form.value).map(([key, value]) => validateField(key, value))
  return validations.every(Boolean)
}

const formatExpiry = (method) => {
  if (!method) return '—'
  const month = Number.parseInt(method.expiryMonth, 10)
  const year = Number.parseInt(method.expiryYear, 10)
  if (!Number.isFinite(month) || !Number.isFinite(year)) {
    return '—'
  }
  return `${String(month).padStart(2, '0')}/${year}`
}

const handleCardNumberInput = (value) => {
  const input = typeof value === 'string' ? value : String(value ?? '')
  const sanitized = sanitizeCardNumber(input)
  form.value.cardNumber = sanitized
  if (errors.value.cardNumber) {
    validateField('cardNumber', sanitized)
  }
}

const handleCvvInput = (value) => {
  const input = typeof value === 'string' ? value : String(value ?? '')
  const sanitized = sanitizeCvv(input)
  form.value.cvv = sanitized
  if (errors.value.cvv) {
    validateField('cvv', sanitized)
  }
}

const handleNameInput = (value) => {
  form.value.nameOnCard = typeof value === 'string' ? value : String(value ?? '')
  if (errors.value.nameOnCard) {
    validateField('nameOnCard', form.value.nameOnCard)
  }
}

const handleBillingAddressInput = (value) => {
  form.value.billingAddress = typeof value === 'string' ? value : String(value ?? '')
  if (errors.value.billingAddress) {
    validateField('billingAddress', form.value.billingAddress)
  }
}

const updatePaymentDetails = async () => {
  if (!canManagePayments.value) {
    saveError.value = 'You must be signed in with a Firebase account to update payment details.'
    return
  }

  resetFeedback()

  if (!validateForm()) {
    saveError.value = 'Please fix the highlighted errors before saving.'
    return
  }

  saving.value = true

  try {
    const sanitizedCardNumber = sanitizeCardNumber(form.value.cardNumber)
    const sanitizedCvv = sanitizeCvv(form.value.cvv)
    const expiryDate =
      form.value.expiryDate instanceof Date ? form.value.expiryDate : new Date(form.value.expiryDate)

    if (Number.isNaN(expiryDate.getTime())) {
      throw new Error('Invalid expiry date')
    }

    const payload = {
      cardNumber: sanitizedCardNumber,
      last4: sanitizedCardNumber.slice(-4),
      expiryMonth: expiryDate.getMonth() + 1,
      expiryYear: expiryDate.getFullYear(),
      cvv: sanitizedCvv,
      billingAddress: form.value.billingAddress.trim(),
      nameOnCard: form.value.nameOnCard.trim(),
      createdAt: serverTimestamp(),
    }

    const methodsCollection = collection(db, 'users', firebaseUser.value.uid, 'paymentMethods')
    await addDoc(methodsCollection, payload)

    form.value = {
      cardNumber: '',
      expiryDate: null,
      cvv: '',
      billingAddress: '',
      nameOnCard: '',
    }

    saveSuccess.value = 'Payment details saved successfully.'
  } catch (error) {
    console.error('Failed to save payment details', error)
    saveError.value = 'We could not save your payment details. Please try again.'
  } finally {
    saving.value = false
  }
}

const deletePaymentMethod = async (methodId) => {
  if (!canManagePayments.value || !methodId) return

  try {
    loadError.value = ''
    const methodDoc = doc(db, 'users', firebaseUser.value.uid, 'paymentMethods', methodId)
    await deleteDoc(methodDoc)
  } catch (error) {
    console.error('Failed to delete payment method', error)
    loadError.value = 'Unable to delete the selected payment method.'
  }
}

const subscribeToPaymentMethods = () => {
  if (!canManagePayments.value) return

  loadingMethods.value = true
  loadError.value = ''

  const methodsCollection = collection(db, 'users', firebaseUser.value.uid, 'paymentMethods')

  unsubscribe = onSnapshot(
    methodsCollection,
    (snapshot) => {
      const next = snapshot.docs.map((docSnapshot) => {
        const data = docSnapshot.data()
        const expiryMonth = Number.parseInt(data?.expiryMonth, 10)
        const expiryYear = Number.parseInt(data?.expiryYear, 10)
        return {
          id: docSnapshot.id,
          nameOnCard: data?.nameOnCard || '',
          last4: typeof data?.last4 === 'string' ? data.last4 : String(data?.cardNumber || '').slice(-4),
          billingAddress: data?.billingAddress || '',
          expiryMonth: Number.isFinite(expiryMonth) ? expiryMonth : null,
          expiryYear: Number.isFinite(expiryYear) ? expiryYear : null,
          createdAt: data?.createdAt,
        }
      })

      paymentMethods.value = next
      loadingMethods.value = false
    },
    (error) => {
      console.error('Failed to load payment methods', error)
      loadError.value = 'We were unable to load your payment methods. Please try again later.'
      loadingMethods.value = false
    },
  )
}

const unsubscribeFromPaymentMethods = () => {
  if (typeof unsubscribe === 'function') {
    unsubscribe()
    unsubscribe = null
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
    console.warn('Google Maps API key is not configured. Billing address autocomplete will be disabled.')
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
      types: ['address'],
    })

    addressAutocomplete.addListener('place_changed', () => {
      const place = addressAutocomplete.getPlace()
      if (!place?.formatted_address) {
        return
      }
      form.value.billingAddress = place.formatted_address
      validateField('billingAddress', place.formatted_address)
    })
  } catch (error) {
    console.warn('Unable to initialize Google Maps autocomplete', error)
  }
}

onMounted(() => {
  if (canManagePayments.value) {
    subscribeToPaymentMethods()
  }
  if (typeof window !== 'undefined') {
    initializeAddressAutocomplete()
  }
})

onBeforeUnmount(() => {
  unsubscribeFromPaymentMethods()
  destroyAddressAutocomplete()
})

watch(
  () => firebaseUser.value?.uid,
  (newUid, oldUid) => {
    if (newUid && newUid !== oldUid) {
      unsubscribeFromPaymentMethods()
      subscribeToPaymentMethods()
    }

    if (!newUid) {
      paymentMethods.value = []
      loadingMethods.value = false
      loadError.value = ''
      unsubscribeFromPaymentMethods()
    }
  },
)

watch(
  () => form.value.expiryDate,
  (newValue) => {
    if (errors.value.expiryDate) {
      validateField('expiryDate', newValue)
    }
  },
)

watch(
  () => [form.value.cardNumber, form.value.cvv, form.value.billingAddress, form.value.nameOnCard],
  () => {
    if (saveError.value) {
      saveError.value = ''
    }
    if (saveSuccess.value) {
      saveSuccess.value = ''
    }
  },
)
</script>

<template>
  <div class="billing-manager">
    <section class="billing-manager__form">
      <h2 class="billing-manager__heading">Manage Payment Method</h2>

      <div class="billing-manager__fields">
        <div class="billing-manager__field">
          <label for="card-number">Card Number</label>
          <InputText
            id="card-number"
            :model-value="form.cardNumber"
            inputmode="numeric"
            maxlength="16"
            placeholder="1234123412341234"
            @update:model-value="handleCardNumberInput"
            @blur="validateField('cardNumber', form.cardNumber)"
          />
          <small v-if="errors.cardNumber" class="billing-manager__error">{{ errors.cardNumber }}</small>
        </div>

        <div class="billing-manager__field">
          <label for="expiry-date">Expiry Date</label>
          <DatePicker
            id="expiry-date"
            v-model="form.expiryDate"
            view="month"
            date-format="mm/yy"
            show-icon
            placeholder="MM/YY"
          />
          <small v-if="errors.expiryDate" class="billing-manager__error">{{ errors.expiryDate }}</small>
        </div>

        <div class="billing-manager__field">
          <label for="cvv">CVV</label>
          <InputText
            id="cvv"
            :model-value="form.cvv"
            inputmode="numeric"
            maxlength="3"
            placeholder="123"
            @update:model-value="handleCvvInput"
            @blur="validateField('cvv', form.cvv)"
          />
          <small v-if="errors.cvv" class="billing-manager__error">{{ errors.cvv }}</small>
        </div>

        <div class="billing-manager__field">
          <label for="name-on-card">Name on Card</label>
          <InputText
            id="name-on-card"
            :model-value="form.nameOnCard"
            placeholder="Name as it appears on card"
            @update:model-value="handleNameInput"
            @blur="validateField('nameOnCard', form.nameOnCard)"
          />
          <small v-if="errors.nameOnCard" class="billing-manager__error">{{ errors.nameOnCard }}</small>
        </div>

        <div class="billing-manager__field">
          <label for="billing-address">Billing Address</label>
          <InputText
            id="billing-address"
            ref="addressInputRef"
            :model-value="form.billingAddress"
            placeholder="Start typing to search your address"
            @update:model-value="handleBillingAddressInput"
            @blur="validateField('billingAddress', form.billingAddress)"
          />
          <small v-if="errors.billingAddress" class="billing-manager__error">{{ errors.billingAddress }}</small>
        </div>
      </div>

      <div class="billing-manager__actions">
        <Button
          label="Update Payment Details"
          :loading="saving"
          :disabled="saving || !canManagePayments"
          @click="updatePaymentDetails"
        />
      </div>

      <Message v-if="saveSuccess" severity="success" class="billing-manager__message">{{ saveSuccess }}</Message>
      <Message v-else-if="saveError" severity="error" class="billing-manager__message">{{ saveError }}</Message>
    </section>

    <section class="billing-manager__list">
      <div class="billing-manager__list-header">
        <h3 class="billing-manager__heading">Saved Payment Methods</h3>
      </div>

      <Message v-if="!canManagePayments" severity="warn" class="billing-manager__message">
        Sign in with your Firebase account to view and manage payment methods.
      </Message>

      <template v-else>
        <Message v-if="loadError" severity="error" class="billing-manager__message">{{ loadError }}</Message>

        <Message v-else-if="loadingMethods" severity="info" class="billing-manager__message">
          Loading your saved payment methods...
        </Message>

        <DataTable
          v-else-if="paymentMethods.length > 0"
          :value="paymentMethods"
          :loading="loadingMethods"
          data-key="id"
          class="billing-manager__table"
        >
          <Column field="nameOnCard" header="Name on Card">
            <template #body="{ data }">
              {{ data.nameOnCard }}
            </template>
          </Column>
          <Column header="Card">
            <template #body="{ data }">
              •••• {{ data.last4 }}
            </template>
          </Column>
          <Column header="Expiry">
            <template #body="{ data }">
              {{ formatExpiry(data) }}
            </template>
          </Column>
          <Column field="billingAddress" header="Billing Address">
            <template #body="{ data }">
              {{ data.billingAddress }}
            </template>
          </Column>
          <Column header="Actions">
            <template #body="{ data }">
              <div class="billing-manager__actions-cell">
                <Button
                  label="Delete"
                  severity="danger"
                  text
                  size="small"
                  @click="deletePaymentMethod(data.id)"
                />
              </div>
            </template>
          </Column>
        </DataTable>

        <div v-else class="billing-manager__empty">
          <p>No payment methods saved yet. Add one above to get started.</p>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.billing-manager {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.billing-manager__heading {
  margin: 0 0 1rem 0;
  font-size: clamp(1.25rem, 1vw + 1rem, 1.75rem);
  font-weight: 600;
}

.billing-manager__fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

.billing-manager__field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.billing-manager__field label {
  font-weight: 500;
}

.billing-manager__error {
  color: var(--p-red-500, #f87171);
}

.billing-manager__actions {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-start;
}

.billing-manager__message {
  margin-top: 1rem;
}

.billing-manager__list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.billing-manager__list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.billing-manager__table :deep(.p-datatable-tbody > tr > td) {
  vertical-align: middle;
}

.billing-manager__actions-cell {
  display: flex;
  justify-content: flex-start;
}

.billing-manager__empty {
  padding: 1.5rem;
  border: 1px dashed var(--p-surface-500, #d1d5db);
  border-radius: 0.75rem;
  text-align: center;
  color: var(--p-text-500, #6b7280);
}
</style>
