<script setup>
import { computed } from 'vue'
import TabView from 'primevue/tabview'
import TabPanel from 'primevue/tabpanel'

import { useAuth } from '@/composables/auth'

const { state } = useAuth()

const username = computed(() => state.user?.username || 'Guest')
</script>

<template>
  <section class="dashboard">
    <h1 class="dashboard__heading">Welcome Back, {{ username }}</h1>

    <TabView class="dashboard__tabs">
      <TabPanel header="My Availability" />
      <TabPanel header="Bookings" />
      <TabPanel header="Donation History" />
      <TabPanel header="Billing" />
      <TabPanel header="Message" />
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
