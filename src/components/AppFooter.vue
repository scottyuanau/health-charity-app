<script setup>
import { RouterLink } from 'vue-router'
import logoImage from '@/assets/logo.png'

const navLinks = [
  { label: 'Home', to: { name: 'home' } },
  { label: 'Carers', to: { name: 'carers' } },
  { label: 'Find Support', to: { name: 'find-support' } },
  { label: 'About', to: { name: 'about' } },
]
</script>

<template>
  <footer class="app-footer">
    <div class="app-footer__content">
      <RouterLink class="app-footer__brand" to="/">
        <img :src="logoImage" alt="Health Charity" class="app-footer__logo" />
      </RouterLink>

      <nav class="app-footer__nav" aria-label="Footer navigation">
        <RouterLink
          v-for="link in navLinks"
          :key="link.label"
          class="app-footer__nav-link"
          :to="link.to"
        >
          {{ link.label }}
        </RouterLink>
      </nav>
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  background: #f8f9fa;
}

.app-footer__content {
  max-width: 72rem;
  margin: 0 auto;
  padding: 2rem 1.5rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  gap: 2rem;
  align-items: center;
}

.app-footer__brand {
  display: inline-flex;
  align-items: center;
}

.app-footer__logo {
  height: 40px;
  width: auto;
  display: block;
}

.app-footer__nav {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 1.5rem;
}

.app-footer__nav-link {
  color: inherit;
  text-decoration: none;
  font-weight: 600;
  transition: color 0.2s ease;
}

.app-footer__nav-link:hover,
.app-footer__nav-link:focus {
  color: var(--bs-primary, #0d6efd);
  text-decoration: none;
}

@media (max-width: 768px) {
  .app-footer__content {
    grid-template-columns: 1fr;
    text-align: center;
  }

  .app-footer__brand {
    justify-content: center;
  }

  .app-footer__nav {
    justify-content: center;
  }
}

@media (max-width: 600px) {
  .app-footer__content {
    padding: 1.5rem 1rem;
  }
}
</style> 
