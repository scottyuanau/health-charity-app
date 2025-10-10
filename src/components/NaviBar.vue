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
    </div>
  </nav>
</template>

<style scoped></style>
