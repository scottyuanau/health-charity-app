<script setup>
import { RouterView } from 'vue-router'
import NaviBar from '@/components/NaviBar.vue'

</script>

<template>
  <header>
    <NaviBar />
  </header>

  <main class="page-container">
    <RouterView />
  </main>
</template>

<style scoped>
.page-container {
  max-width: 72rem;
  margin: 0 auto;
  padding: 2rem 1.5rem 3rem;
}

@media (max-width: 600px) {
  .page-container {
    padding: 1.5rem 1rem 2.5rem;
  }
}
</style>
