<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import TabView from 'primevue/tabview'
import TabPanel from 'primevue/tabpanel'

import AvailabilityManager from '@/components/dashboard/AvailabilityManager.vue'
import BookingsManager from '@/components/dashboard/BookingsManager.vue'
import DonationHistory from '@/components/dashboard/DonationHistory.vue'
import BillingManager from '@/components/dashboard/BillingManager.vue'
import MessagingCenter from '@/components/dashboard/MessagingCenter.vue'
import SettingsManager from '@/components/dashboard/SettingsManager.vue'
import AdminUserManager from '@/components/dashboard/AdminUserManager.vue'

import { useAuth } from '@/composables/auth'
import { db } from '@/firebase'
import { doc, onSnapshot } from 'firebase/firestore'

const { state } = useAuth()

const username = computed(() => {
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

const userProfile = ref(null)
const profileUnsubscribe = ref(null)

const firebaseUser = computed(() => {
  const user = state.user
  if (user?.provider === 'firebase' && user.uid) {
    return user
  }
  return null
})

const hasFirebaseAccess = computed(() => Boolean(db) && Boolean(firebaseUser.value?.uid))

const stopProfileListener = () => {
  if (typeof profileUnsubscribe.value === 'function') {
    profileUnsubscribe.value()
    profileUnsubscribe.value = null
  }
}

const startProfileListener = (uid) => {
  stopProfileListener()

  if (!hasFirebaseAccess.value || !uid) {
    userProfile.value = null
    return
  }

  try {
    profileUnsubscribe.value = onSnapshot(
      doc(db, 'users', uid),
      (snapshot) => {
        if (snapshot.exists()) {
          userProfile.value = snapshot.data()
        } else {
          userProfile.value = null
        }
      },
      (error) => {
        console.error('Failed to fetch user profile', error)
        userProfile.value = null
      },
    )
  } catch (error) {
    console.error('Failed to subscribe to user profile', error)
    userProfile.value = null
  }
}

watch(
  [hasFirebaseAccess, () => firebaseUser.value?.uid],
  ([canAccess, uid]) => {
    if (canAccess && uid) {
      startProfileListener(uid)
    } else {
      stopProfileListener()
      userProfile.value = null
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  stopProfileListener()
})

const normalizedRoles = computed(() => {
  const roles = userProfile.value?.roles
  if (!Array.isArray(roles)) return []

  const normalized = roles
    .map((role) => (typeof role === 'string' ? role.trim().toLowerCase() : ''))
    .filter(Boolean)

  return [...new Set(normalized)]
})

const isAdminUser = computed(() => {
  if (normalizedRoles.value.includes('admin')) return true
  const usernameValue = state.user?.username
  return typeof usernameValue === 'string' && usernameValue.trim().toLowerCase() === 'admin'
})

const isCarer = computed(() => normalizedRoles.value.includes('carer'))
const isBeneficiary = computed(() => normalizedRoles.value.includes('beneficiary'))

const showAvailabilityTab = computed(() => isAdminUser.value || isCarer.value)
const showBookingsTab = computed(
  () => isAdminUser.value || isCarer.value || isBeneficiary.value,
)
</script>

<template>
  <section class="dashboard">
    <h1 class="dashboard__heading">Welcome Back, {{ username }}</h1>

    <TabView class="dashboard__tabs">
      <TabPanel v-if="showAvailabilityTab" header="My Availability">
        <AvailabilityManager />
      </TabPanel>
      <TabPanel v-if="showBookingsTab" header="Bookings">
        <BookingsManager />
      </TabPanel>
      <TabPanel header="Donation History">
        <DonationHistory />
      </TabPanel>
      <TabPanel header="Billing">
        <BillingManager />
      </TabPanel>
      <TabPanel header="Message">
        <MessagingCenter />
      </TabPanel>
      <TabPanel header="Settings">
        <SettingsManager />
      </TabPanel>
      <TabPanel header="Admin">
        <AdminUserManager />
      </TabPanel>
    </TabView>
  </section>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.dashboard__heading {
  font-size: clamp(1.75rem, 2vw + 1.25rem, 2.5rem);
  font-weight: 600;
  margin: 0;
}

.dashboard__tabs :deep(.p-tabview-nav) {
  flex-wrap: wrap;
}

.dashboard__tabs :deep(.p-tabview-nav li) {
  flex: 1 1 auto;
  text-align: center;
}
</style>
