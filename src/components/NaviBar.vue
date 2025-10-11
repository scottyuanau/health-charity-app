<script setup>
import { RouterLink, useRouter } from 'vue-router'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import MenuBar from 'primevue/menubar'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import SelectButton from 'primevue/selectbutton'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'

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

const notifications = ref([])
const notificationsLoading = ref(false)
const notificationsError = ref('')
const notificationsDropdownVisible = ref(false)
const notificationsContainerRef = ref(null)
const unsubscribeFromNotifications = ref(null)
const notificationsLimit = 20

const unreadNotificationCount = computed(
  () => notifications.value.filter((notification) => !notification.read).length,
)

const hasUnreadNotifications = computed(() => unreadNotificationCount.value > 0)

const notificationBadgeLabel = computed(() => {
  if (unreadNotificationCount.value > 99) {
    return '99+'
  }
  return String(unreadNotificationCount.value)
})

const notificationAriaLabel = computed(() =>
  hasUnreadNotifications.value
    ? `Notifications (${notificationBadgeLabel.value})`
    : 'Notifications',
)

const notificationTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const formatNotificationTimestamp = (date) => {
  if (!(date instanceof Date)) {
    return ''
  }

  return notificationTimeFormatter.format(date)
}

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

const resetNotifications = () => {
  notifications.value = []
  notificationsLoading.value = false
  notificationsError.value = ''
  notificationsDropdownVisible.value = false
}

const createNotificationsListener = (useFallback = false) => {
  const constraints = [where('recipientId', '==', firebaseUser.value.uid)]

  if (!useFallback) {
    constraints.push(orderBy('createdAt', 'desc'), limit(notificationsLimit))
  }

  let unsubscribeFn = null

  unsubscribeFn = onSnapshot(
    query(collection(db, 'notifications'), ...constraints),
    (snapshot) => {
      let items = snapshot.docs.map((snapshotDoc) => {
        const data = snapshotDoc.data() || {}
        const createdAt = data?.createdAt?.toDate?.() || null

        const messageBody = typeof data.messageBody === 'string' ? data.messageBody : ''
        const messagePreview =
          typeof data.messagePreview === 'string' && data.messagePreview
            ? data.messagePreview
            : messageBody

        return {
          id: snapshotDoc.id,
          read: Boolean(data.read),
          senderName: data.senderName || 'New message',
          messageBody,
          messagePreview,
          createdAt,
        }
      })

      if (useFallback) {
        items = items
          .sort((a, b) => {
            const timeA = a.createdAt?.getTime?.() ?? 0
            const timeB = b.createdAt?.getTime?.() ?? 0
            return timeB - timeA
          })
          .slice(0, notificationsLimit)
      }

      notifications.value = items
      notificationsLoading.value = false
    },
    (error) => {
      if (!useFallback && error?.code === 'failed-precondition') {
        console.warn(
          'Missing Firestore index for notifications query. Falling back to client-side sorting.',
          error,
        )

        if (typeof unsubscribeFn === 'function') {
          unsubscribeFn()
        }

        notificationsLoading.value = true
        notificationsError.value = ''
        notifications.value = []

        unsubscribeFromNotifications.value = createNotificationsListener(true)
        return
      }

      console.error('Failed to subscribe to notifications', error)
      notificationsError.value = 'We could not load your notifications right now.'
      notifications.value = []
      notificationsLoading.value = false
    },
  )

  return unsubscribeFn
}

const subscribeToNotifications = () => {
  if (!db || !firebaseUser.value?.uid) {
    if (typeof unsubscribeFromNotifications.value === 'function') {
      unsubscribeFromNotifications.value()
    }
    unsubscribeFromNotifications.value = null
    resetNotifications()
    return
  }

  if (typeof unsubscribeFromNotifications.value === 'function') {
    unsubscribeFromNotifications.value()
  }

  notificationsLoading.value = true
  notificationsError.value = ''

  try {
    unsubscribeFromNotifications.value = createNotificationsListener(false)
  } catch (error) {
    console.error('Failed to subscribe to notifications', error)
    notificationsError.value = 'We could not load your notifications right now.'
    notifications.value = []
    notificationsLoading.value = false
  }
}

const toggleNotificationsDropdown = () => {
  notificationsDropdownVisible.value = !notificationsDropdownVisible.value
}

const closeNotificationsDropdown = () => {
  notificationsDropdownVisible.value = false
}

const markNotificationAsRead = async (notificationId) => {
  if (!db || !notificationId) {
    return
  }

  try {
    const notificationRef = doc(db, 'notifications', notificationId)
    await updateDoc(notificationRef, {
      read: true,
      readAt: serverTimestamp(),
    })
  } catch (error) {
    console.error('Failed to mark notification as read', error)
  }
}

const handleNotificationClick = async (notification) => {
  if (!notification?.id) {
    return
  }

  if (!notification.read) {
    notification.read = true
    await markNotificationAsRead(notification.id)
  }
}

const handleDocumentClick = (event) => {
  if (!notificationsDropdownVisible.value) {
    return
  }

  const container = notificationsContainerRef.value

  if (container && !container.contains(event.target)) {
    closeNotificationsDropdown()
  }
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
  document.addEventListener('click', handleDocumentClick)

  if (hasFirebaseAccess.value) {
    loadUserProfile()
  }

  subscribeToNotifications()
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)

  if (typeof unsubscribeFromNotifications.value === 'function') {
    unsubscribeFromNotifications.value()
  }
})

watch(
  () => firebaseUser.value?.uid,
  (newUid) => {
    if (newUid) {
      loadUserProfile()
    } else {
      userProfile.value = null
    }

    subscribeToNotifications()
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

watch(
  () => router.currentRoute.value.fullPath,
  () => {
    closeNotificationsDropdown()
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
          <div class="navbar-actions">
            <div
              v-if="isAuthenticated"
              ref="notificationsContainerRef"
              class="navbar-notifications"
            >
              <button
                type="button"
                class="navbar-notifications__button"
                @click.stop="toggleNotificationsDropdown"
                :aria-expanded="notificationsDropdownVisible ? 'true' : 'false'"
                aria-haspopup="true"
                :aria-label="notificationAriaLabel"
              >
                <span class="navbar-notifications__icon-wrapper" aria-hidden="true">
                  <span class="pi pi-bell navbar-notifications__icon"></span>
                  <span
                    v-if="hasUnreadNotifications"
                    class="navbar-notifications__badge"
                  >
                    {{ notificationBadgeLabel }}
                  </span>
                </span>


              </button>

              <transition name="navbar-notifications__transition">
                <div
                  v-if="notificationsDropdownVisible"
                  class="navbar-notifications__panel"
                  role="menu"
                >
                  <div
                    v-if="notificationsLoading"
                    class="navbar-notifications__status"
                  >
                    Loading notifications…
                  </div>
                  <div
                    v-else-if="notificationsError"
                    class="navbar-notifications__status navbar-notifications__status--error"
                  >
                    {{ notificationsError }}
                  </div>
                  <div
                    v-else-if="!hasFirebaseAccess"
                    class="navbar-notifications__status"
                  >
                    Sign in with your Firebase account to view notifications.
                  </div>
                  <div
                    v-else-if="notifications.length === 0"
                    class="navbar-notifications__status"
                  >
                    You're all caught up! No new messages.
                  </div>
                  <ul v-else class="navbar-notifications__list">
                    <li
                      v-for="notification in notifications"
                      :key="notification.id"
                      class="navbar-notifications__item"
                    >
                      <button
                        type="button"
                        class="navbar-notifications__notification"
                        @click.stop="handleNotificationClick(notification)"
                        :class="{
                          'navbar-notifications__notification--unread': !notification.read,
                        }"
                      >
                        <span class="navbar-notifications__sender">
                          {{ notification.senderName || 'New message' }}
                        </span>
                        <p class="navbar-notifications__message">
                          {{
                            notification.messageBody ||
                            notification.messagePreview ||
                            'Open your inbox to view this message.'
                          }}
                        </p>
                        <span
                          v-if="notification.createdAt"
                          class="navbar-notifications__timestamp"
                        >
                          {{ formatNotificationTimestamp(notification.createdAt) }}
                        </span>
                      </button>
                    </li>
                  </ul>
                </div>
              </transition>
            </div>
            <Button
              class="donate-now-button p-button-rounded p-button-raised"
              label="Donate Now"
              severity="danger"
              @click="openDonationDialog"
            />
          </div>
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

.navbar-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.navbar-notifications {
  position: relative;
}

.navbar-notifications__button {
  position: relative;
  border: none;
  background: transparent;
  color: var(--bs-body-color);
  cursor: pointer;
  padding: 0.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s ease;
}

.navbar-notifications__icon-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.navbar-notifications__icon {
  font-size: 1.35rem;
  line-height: 1;
}

.navbar-notifications__button:hover,
.navbar-notifications__button:focus-visible {
  color: var(--bs-danger);
  outline: none;
}

.navbar-notifications__badge {
  position: absolute;
  top: auto;
  right: 0;
  bottom: 0;
  transform: translate(40%, 40%);
  background: #dc3545;
  color: #fff;
  border-radius: 999px;
  padding: 0 0.35rem;
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1;
  min-width: 1.1rem;
  height: 1.1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.05);
}

.navbar-notifications__panel {
  position: absolute;
  top: 115%;
  right: 0;
  width: min(22rem, 85vw);
  background: #fff;
  border-radius: 0.75rem;
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.18);
  padding: 0.75rem;
  z-index: 1050;
}

.navbar-notifications__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.navbar-notifications__item {
  margin: 0;
}

.navbar-notifications__notification {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
  padding: 0.75rem;
  border-radius: 0.6rem;
  cursor: pointer;
  transition: background-color 0.2s ease, box-shadow 0.2s ease;
  text-align: left;
}

.navbar-notifications__notification:hover,
.navbar-notifications__notification:focus-visible {
  background: rgba(220, 53, 69, 0.12);
  outline: none;
}

.navbar-notifications__notification--unread {
  background: rgba(220, 53, 69, 0.08);
  box-shadow: inset 0 0 0 1px rgba(220, 53, 69, 0.12);
}

.navbar-notifications__sender {
  font-weight: 600;
  color: var(--bs-body-color);
}

.navbar-notifications__message {
  margin: 0;
  color: var(--bs-secondary-color);
  font-size: 0.9rem;
  line-height: 1.4;
  word-break: break-word;
}

.navbar-notifications__timestamp {
  font-size: 0.75rem;
  color: var(--bs-tertiary-color, #6c757d);
}

.navbar-notifications__status {
  padding: 0.75rem;
  font-size: 0.9rem;
  color: var(--bs-secondary-color);
  text-align: center;
}

.navbar-notifications__status--error {
  color: var(--bs-danger);
}

.navbar-notifications__transition-enter-active,
.navbar-notifications__transition-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.navbar-notifications__transition-enter-from,
.navbar-notifications__transition-leave-to {
  opacity: 0;
  transform: translateY(-10%);
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
