<script setup>
import { RouterLink, useRouter } from 'vue-router'
import { computed, onMounted, ref, watch } from 'vue'
import MenuBar from 'primevue/menubar'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import SelectButton from 'primevue/selectbutton'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore'

import { db } from '../firebase'
import { useAuth } from '../composables/auth'

const router = useRouter()
const { state, logout, isAuthenticated: authStatus } = useAuth()
const isAuthenticated = computed(() => authStatus.value)
const displayName = computed(() => {
  const user = state.user
  if (!user) return 'Guest'

  if (user.username) return user.username

  const email = user.email?.trim()
  if (email) {
    const [namePart] = email.split('@')
    if (namePart) return namePart
    return email
  }

  return 'Guest'
})

const handleLogout = () => {
  logout()
  if (router.currentRoute.value.meta.requiresAuth) {
    router.push({ name: 'home' })
  }
}

const menuItems = computed(() => {
  const items = [
    {
      label: 'Home',
      command: () => router.push({ name: 'home' }),
    },
    {
      label: 'About',
      command: () => router.push({ name: 'about' }),
    },
    {
      label: 'Carers',
      command: () => router.push({ name: 'carers' }),
    },
  ]

  if (isAuthenticated.value) {
    items.push({
      label: 'Dashboard',
      command: () => router.push({ name: 'dashboard' }),
    })

    items.push({
      label: 'Account',
      items: [
        {
          label: `Signed in as ${displayName.value}`,
          disabled: true,
        },
        {
          label: 'Logout',
          command: handleLogout,
        },
      ],
    })
  } else {
    items.push({
      label: 'Login',
      command: () => router.push({ name: 'login' }),
    })
  }

  return items
})

const donationDialogVisible = ref(false)
const donationSaving = ref(false)
const donationError = ref('')
const donationSuccess = ref('')
const userProfile = ref(null)
const profileLoading = ref(false)
const profileError = ref('')

const donationOptions = [
  { label: '$20', value: 20 },
  { label: '$50', value: 50 },
  { label: '$100', value: 100 },
  { label: '$200', value: 200 },
  { label: 'Other amount', value: 'other' },
]

const selectedDonation = ref(donationOptions[0].value)
const customDonationAmount = ref(null)

const firebaseUser = computed(() => {
  const user = state.user
  if (user?.provider === 'firebase' && user.uid) {
    return user
  }
  return null
})

const hasFirebaseAccess = computed(() => Boolean(db) && Boolean(firebaseUser.value))

const donorRoles = computed(() => {
  const roles = userProfile.value?.roles
  return Array.isArray(roles) ? roles : []
})

const isDonor = computed(() => donorRoles.value.includes('donor'))

const showCustomAmountInput = computed(() => selectedDonation.value === 'other')

const effectiveDonationAmount = computed(() => {
  if (showCustomAmountInput.value) {
    if (typeof customDonationAmount.value === 'number' && customDonationAmount.value > 0) {
      return Number(customDonationAmount.value.toFixed(2))
    }
    return null
  }

  if (typeof selectedDonation.value === 'number' && selectedDonation.value > 0) {
    return selectedDonation.value
  }

  return null
})

const canSubmitDonation = computed(
  () =>
    donationDialogVisible.value &&
    isDonor.value &&
    !!effectiveDonationAmount.value &&
    !donationSaving.value,
)

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
})

const formatCurrency = (value) => {
  if (typeof value !== 'number') {
    return ''
  }
  return currencyFormatter.format(value)
}

const resetDonationForm = () => {
  selectedDonation.value = donationOptions[0].value
  customDonationAmount.value = null
}

const loadUserProfile = async () => {
  if (!db || !firebaseUser.value?.uid) {
    userProfile.value = null
    return
  }

  profileLoading.value = true
  profileError.value = ''

  try {
    const userDocRef = doc(db, 'users', firebaseUser.value.uid)
    const snapshot = await getDoc(userDocRef)

    if (snapshot.exists()) {
      userProfile.value = snapshot.data()
    } else {
      userProfile.value = null
    }
  } catch (error) {
    console.error('Failed to load user profile', error)
    profileError.value = 'We were unable to load your donor profile. Please try again.'
    userProfile.value = null
  } finally {
    profileLoading.value = false
  }
}

const openDonationDialog = () => {
  donationDialogVisible.value = true
  donationError.value = ''
  donationSuccess.value = ''

  if (hasFirebaseAccess.value && !userProfile.value && !profileLoading.value) {
    loadUserProfile()
  }
}

const closeDonationDialog = () => {
  donationDialogVisible.value = false
}

const handleDonationSubmit = async () => {
  donationError.value = ''
  donationSuccess.value = ''

  if (!db) {
    donationError.value = 'Firebase has not been configured yet. Please add your Firebase credentials.'
    return
  }

  if (!firebaseUser.value?.uid) {
    donationError.value = 'Please sign in with your donor account before making a donation.'
    return
  }

  if (!isDonor.value) {
    donationError.value = 'You must be registered as a donor before making a donation.'
    return
  }

  const amount = effectiveDonationAmount.value

  if (!amount || amount <= 0) {
    donationError.value = 'Please select or enter a donation amount greater than $0.'
    return
  }

  donationSaving.value = true

  try {
    const donationsCollection = collection(db, 'donations')
    await addDoc(donationsCollection, {
      userId: firebaseUser.value.uid,
      amount,
      createdAt: serverTimestamp(),
    })

    donationSuccess.value = `Thank you for donating ${formatCurrency(amount)}!`
    resetDonationForm()
  } catch (error) {
    console.error('Failed to record donation', error)
    donationError.value = 'We could not process your donation at this time. Please try again.'
  } finally {
    donationSaving.value = false
  }
}

onMounted(() => {
  if (hasFirebaseAccess.value) {
    loadUserProfile()
  }
})

watch(
  () => firebaseUser.value?.uid,
  (newUid, oldUid) => {
    if (newUid && newUid !== oldUid) {
      loadUserProfile()
    }

    if (!newUid) {
      userProfile.value = null
    }
  },
)

watch(
  () => selectedDonation.value,
  (value) => {
    if (value !== 'other') {
      customDonationAmount.value = null
    }
  },
)
</script>

<template>
  <nav class="navbar navbar-expand-lg bg-body-tertiary border-bottom shadow-sm">
    <div class="container">
      <MenuBar :model="menuItems" class="flex-grow-1 border-0 bg-transparent">
        <template #start>
          <RouterLink
            class="navbar-brand fw-semibold text-decoration-none text-body"
            to="/"
          >
            Health Charity
          </RouterLink>
        </template>
        <template #end>
          <Button
            class="donate-now-button p-button-rounded p-button-raised"
            label="Donate Now"
            severity="danger"
            @click="openDonationDialog"
          />
        </template>
      </MenuBar>

      <Dialog
        v-model:visible="donationDialogVisible"
        modal
        header="Support our mission"
        :style="{ width: 'min(520px, 95vw)' }"
        dismissable-mask
        @hide="closeDonationDialog"
      >
        <div class="donation-dialog">
          <div class="donation-dialog__message" v-if="!db">
            <Message severity="warn">
              Firebase has not been configured. Please add your Firebase credentials to enable
              donations.
            </Message>
          </div>

          <template v-else>
            <div class="donation-dialog__message" v-if="!firebaseUser">
              <Message severity="info">
                Please sign in with your donor account to make a contribution.
              </Message>
            </div>

            <div class="donation-dialog__message" v-else-if="profileLoading">
              <Message severity="info">Loading your donor profile…</Message>
            </div>

            <div class="donation-dialog__message" v-else-if="profileError">
              <Message severity="error">{{ profileError }}</Message>
              <Button
                class="mt-3"
                label="Try again"
                icon="pi pi-refresh"
                @click="loadUserProfile"
              />
            </div>

            <div class="donation-dialog__message" v-else-if="!isDonor">
              <Message severity="warn">
                You must be registered as a donor before you can donate. Visit your account settings
                to update your roles.
              </Message>
            </div>

            <div v-else class="donation-dialog__content">
              <Message v-if="donationSuccess" severity="success" class="mb-3">
                {{ donationSuccess }}
              </Message>
              <Message v-if="donationError" severity="error" class="mb-3">
                {{ donationError }}
              </Message>

              <div class="donation-dialog__field">
                <label class="donation-dialog__label">Select your donation amount</label>
                <SelectButton
                  v-model="selectedDonation"
                  :options="donationOptions"
                  optionLabel="label"
                  optionValue="value"
                  :allowEmpty="false"
                  class="donation-dialog__options"
                />
              </div>

              <div class="donation-dialog__field" v-if="showCustomAmountInput">
                <label for="custom-donation" class="donation-dialog__label"
                  >Enter your donation amount</label
                >
                <InputNumber
                  id="custom-donation"
                  v-model="customDonationAmount"
                  mode="currency"
                  currency="USD"
                  locale="en-US"
                  :min="1"
                  :step="5"
                  inputClass="w-100"
                  :useGrouping="true"
                  placeholder="$250"
                />
                <small class="donation-dialog__hint">Minimum donation amount is $1.00.</small>
              </div>

              <div class="donation-dialog__summary" v-if="effectiveDonationAmount">
                Your contribution: <strong>{{ formatCurrency(effectiveDonationAmount) }}</strong>
              </div>

              <div class="donation-dialog__actions">
                <Button
                  label="Cancel"
                  severity="secondary"
                  text
                  @click="closeDonationDialog"
                  :disabled="donationSaving"
                />
                <Button
                  label="Donate"
                  icon="pi pi-heart-fill"
                  severity="danger"
                  :loading="donationSaving"
                  :disabled="!canSubmitDonation"
                  @click="handleDonationSubmit"
                />
              </div>
            </div>
          </template>
        </div>
      </Dialog>
    </div>
  </nav>
</template>

<style scoped>
:deep(.p-menubar) {
  width: 100%;
}

:deep(.p-menubar-root-list) {
  margin-left: auto;
}

.donate-now-button {
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  padding-inline: 1.75rem;
  box-shadow: 0 8px 18px rgba(220, 53, 69, 0.35);
  background: linear-gradient(135deg, var(--bs-danger), #ff6f61);
  border: none;
}

.donate-now-button:hover,
.donate-now-button:focus-visible {
  background: linear-gradient(135deg, #ff6f61, var(--bs-danger));
  box-shadow: 0 10px 24px rgba(220, 53, 69, 0.45);
}

.donation-dialog {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.donation-dialog__content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.donation-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.donation-dialog__label {
  font-weight: 600;
}

.donation-dialog__options :deep(.p-button) {
  min-width: 6.5rem;
  font-weight: 600;
}

.donation-dialog__hint {
  color: var(--bs-secondary-color);
}

.donation-dialog__summary {
  font-size: 1.1rem;
}

.donation-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}
</style>
