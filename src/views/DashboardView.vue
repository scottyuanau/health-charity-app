<script setup>
import { computed } from 'vue'
import TabView from 'primevue/tabview'
import TabPanel from 'primevue/tabpanel'

import AvailabilityManager from '@/components/dashboard/AvailabilityManager.vue'
import BookingsManager from '@/components/dashboard/BookingsManager.vue'
import DonationHistory from '@/components/dashboard/DonationHistory.vue'
import BillingManager from '@/components/dashboard/BillingManager.vue'
import MessagingCenter from '@/components/dashboard/MessagingCenter.vue'

import { useAuth } from '@/composables/auth'

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
</script>

<template>
  <section class="dashboard">
    <h1 class="dashboard__heading">Welcome Back, {{ username }}</h1>

    <TabView class="dashboard__tabs">
      <TabPanel header="My Availability">
        <AvailabilityManager />
      </TabPanel>
      <TabPanel header="Bookings">
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
      <TabPanel header="Settings" />
      <TabPanel header="Admin" />
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
