<script setup>
import { RouterLink, useRouter } from 'vue-router'
import MenuBar from 'primevue/menubar'

const router = useRouter()

const menuItems = [
  {
    label: 'Home',
    command: () => router.push({ name: 'home' })
  },
  {
    label: 'About',
    command: () => router.push({ name: 'about' })
  }
]
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
