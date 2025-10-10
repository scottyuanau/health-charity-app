<script setup>
import { RouterLink, useRouter } from 'vue-router'
import MenuBar from 'primevue/menubar'
import { useAuth } from '../composables/auth'
import { computed } from 'vue'

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
  ]

  if (isAuthenticated.value) {
    items.push({
      label: 'Dashboard',
      command: () => router.push({ name: 'dashboard' }),
    })
  }

  return items
})

const handleLogout = () => {
  logout()
  if (router.currentRoute.value.meta.requiresAuth) {
    router.push({ name: 'home' })
  }
}
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
      </MenuBar>
      <div class="d-flex align-items-center gap-2 auth-controls">
          <span v-if="isAuthenticated" class="text-muted small">
            Signed in as <strong>{{ displayName }}</strong>
          </span>
        <button v-if="isAuthenticated" class="btn btn-outline-secondary btn-sm" @click="handleLogout">
          Logout
        </button>
        <template v-else>
          <router-link to="/login" class="btn btn-primary btn-sm">Login</router-link>
        </template>
      </div>
    </div>
  </nav>
</template>

<style scoped></style>
