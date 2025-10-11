<script setup>
import { computed } from 'vue'
import Button from 'primevue/button'

const bannerImageModules = import.meta.glob('../assets/banner.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
})

const bannerImageUrl = bannerImageModules['../assets/banner.jpg'] ?? ''

const heroBackgroundStyle = computed(() => {
  const layers = ['linear-gradient(rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.55))']

  if (bannerImageUrl) {
    layers.push(`url(${bannerImageUrl})`)
  }

  return {
    backgroundImage: layers.join(', '),
  }
})

const handleDonateClick = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('open-donation-dialog'))
  }
}
</script>

<template>
  <main class="home-view">
    <section class="hero-banner" :style="heroBackgroundStyle">
      <div class="hero-banner__content">
        <h1 class="hero-banner__title">You can help save lives!</h1>
        <Button
          class="hero-banner__cta p-button-rounded p-button-lg"
          label="Donate Now"
          severity="danger"
          @click="handleDonateClick"
        />
      </div>
    </section>
  </main>
</template>

<style scoped>
.home-view {
  display: flex;
  flex-direction: column;
}

.hero-banner {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: clamp(320px, 60vh, 560px);
  padding: clamp(2rem, 5vw, 4rem);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  color: #fff;
  text-align: center;
}

.hero-banner__content {
  max-width: min(640px, 90vw);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.hero-banner__title {
  font-size: clamp(2.5rem, 5vw, 3.5rem);
  font-weight: 700;
  margin: 0;
  line-height: 1.2;
}

.hero-banner__cta {
  font-size: 1.125rem;
  padding-inline: 2.5rem;
  padding-block: 0.85rem;
  font-weight: 600;
  box-shadow: 0 0.75rem 1.5rem rgba(0, 0, 0, 0.25);
}

.hero-banner__cta:focus-visible {
  outline: 3px solid rgba(255, 255, 255, 0.85);
  outline-offset: 3px;
}
</style> 
