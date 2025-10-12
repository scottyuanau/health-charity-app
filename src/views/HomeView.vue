<script setup>
import { computed } from 'vue'
import Button from 'primevue/button'

const bannerImageModules = import.meta.glob('../assets/banner.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
})

const smilingChildImageModules = import.meta.glob('../assets/smiling-child.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
})

const bannerImageUrl = bannerImageModules['../assets/banner.jpg'] ?? ''
const smilingChildImageUrl = smilingChildImageModules['../assets/smiling-child.jpg'] ?? ''

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
    <section class="impact-highlight">
      <div class="impact-highlight__image" v-if="smilingChildImageUrl">
        <img :src="smilingChildImageUrl" alt="Smiling child receiving support" />
      </div>
      <div class="impact-highlight__content">
        <h2 class="impact-highlight__subtitle">Every Help Counts</h2>
        <p class="impact-highlight__description">
          Your small act can create a big impact. Join us in supporting people living with disabilities by donating today.
          Every contribution helps us provide essential healthcare, education, and hope to those who need it most. Together,
          we can build a healthier, more inclusive future for everyone.
        </p>
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

.impact-highlight {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: clamp(1.5rem, 4vw, 3rem);
  padding: clamp(2rem, 6vw, 4rem) clamp(1.5rem, 5vw, 4rem);
  background-color: #f6f8fb;
}

.impact-highlight__image {
  flex: 1 1 280px;
  max-width: 420px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.impact-highlight__image img {
  width: 100%;
  height: auto;
  border-radius: 1rem;
  object-fit: cover;
  box-shadow: 0 1.25rem 2.5rem rgba(15, 23, 42, 0.15);
}

.impact-highlight__content {
  flex: 2 1 360px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1rem;
}

.impact-highlight__subtitle {
  margin: 0;
  font-size: clamp(1.75rem, 3vw, 2.25rem);
  font-weight: 700;
  color: #102a43;
}

.impact-highlight__description {
  margin: 0;
  font-size: clamp(1rem, 2vw, 1.125rem);
  line-height: 1.8;
  color: #334e68;
}

@media (max-width: 768px) {
  .impact-highlight {
    text-align: center;
  }

  .impact-highlight__content {
    align-items: center;
  }
}
</style> 
