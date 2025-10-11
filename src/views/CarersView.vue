<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Rating from 'primevue/rating'

import { useCarersStore, getPlaceholderPhoto } from '@/stores/carers'

const router = useRouter()
const carersStore = useCarersStore()

const carers = computed(() => carersStore.allCarers)

const navigateToCarer = (carerId) => {
  router.push({ name: 'carer-profile', params: { id: carerId } })
}

const resolvePhoto = (photo) => {
  if (photo && photo.trim()) {
    return photo
  }

  return getPlaceholderPhoto(200)
}
</script>

<template>
  <section class="carers">
    <header class="carers__header">
      <h1>Our Carers</h1>
      <p>Learn more about the dedicated carers who support our community every day.</p>
    </header>

    <div class="carers__grid">
      <article
        v-for="carer in carers"
        :key="carer.id"
        class="carer-card"
        @click="navigateToCarer(carer.id)"
      >
        <img :src="resolvePhoto(carer.photo)" :alt="`${carer.name} profile photo`" class="carer-card__photo" />

        <div class="carer-card__content">
          <h2 class="carer-card__name">{{ carer.name }}</h2>

          <div class="carer-card__rating">
            <Rating :modelValue="carersStore.getAverageRating(carer.id)" readonly :cancel="false" />
            <span class="carer-card__rating-value">
              {{ carersStore.getAverageRating(carer.id).toFixed(1) }}
              <span class="carer-card__rating-count">({{ carersStore.getReviewCount(carer.id) }} reviews)</span>
            </span>
          </div>

          <p class="carer-card__description">
            {{ carersStore.getDescription(carer.id) }}
          </p>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.carers {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.carers__header {
  text-align: center;
  display: grid;
  gap: 0.5rem;
}

.carers__header h1 {
  font-size: clamp(2rem, 5vw, 2.5rem);
  margin: 0;
}

.carers__header p {
  margin: 0;
  color: var(--p-text-muted-color);
}

.carers__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.5rem;
}

.carer-card {
  background: var(--p-surface-card);
  border-radius: 1rem;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: transform 180ms ease, box-shadow 180ms ease;
}

.carer-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.12);
}

.carer-card__photo {
  width: 100%;
  height: 200px;
  object-fit: cover;
}

.carer-card__content {
  padding: 1.25rem 1.5rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.carer-card__name {
  margin: 0;
  font-size: 1.25rem;
  color: var(--p-text-color);
}

.carer-card__rating {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.carer-card__rating :deep(.p-rating-icon) {
  color: #f59e0b;
}

.carer-card__rating-value {
  font-weight: 600;
  color: var(--p-text-color);
}

.carer-card__rating-count {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
  margin-left: 0.25rem;
}

.carer-card__description {
  margin: 0;
  color: var(--p-text-muted-color);
  line-height: 1.5;
}
</style> 
