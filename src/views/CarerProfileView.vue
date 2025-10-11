<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Rating from 'primevue/rating'
import Button from 'primevue/button'

import { useCarersStore, getDescriptionPlaceholder } from '@/stores/carers'
import placeholderAvatar from '@/assets/Profile_avatar_placeholder_large.png'

const route = useRoute()
const router = useRouter()
const carersStore = useCarersStore()

const carerId = computed(() => route.params.id)
const userRating = ref(null)
const reviewSubmitted = ref(false)
const reviewError = ref('')

const carer = computed(() => carersStore.getCarerById(carerId.value))
const isLoading = computed(() => carersStore.loading)
const loadError = computed(() => carersStore.loadError)
const hasLoaded = computed(() => carersStore.hasLoaded)

const profilePhoto = computed(() => {
  if (carer.value?.photo?.trim()) {
    return carer.value.photo
  }
  return placeholderAvatar
})

const description = computed(() => {
  if (carer.value?.description?.trim()) {
    return carer.value.description
  }
  return getDescriptionPlaceholder()
})

const averageRating = computed(() => {
  if (!carer.value) return 5
  return Number(carersStore.getAverageRating(carer.value.id).toFixed(1))
})

const reviewCount = computed(() => {
  if (!carer.value) return 0
  return carersStore.getReviewCount(carer.value.id)
})

const handleRating = async (value) => {
  if (!carer.value) return
  reviewError.value = ''
  const success = await carersStore.addReview(carer.value.id, value)
  if (success) {
    userRating.value = value
    reviewSubmitted.value = true
  } else {
    reviewError.value = 'We were unable to save your review. Please try again.'
    userRating.value = null
  }
}

watch(
  () => carer.value?.id,
  () => {
    userRating.value = null
    reviewSubmitted.value = false
    reviewError.value = ''
  },
)

const goBack = () => {
  router.push({ name: 'carers' })
}

onMounted(() => {
  carersStore.fetchCarers()
})
</script>

<template>
  <section v-if="isLoading" class="profile profile--status">
    <div class="profile__details">
      <h1>Loading carer profile&hellip;</h1>
      <p>Please wait while we fetch the latest details.</p>
    </div>
  </section>
  <section v-else-if="loadError" class="profile profile--status">
    <div class="profile__details">
      <h1>We couldn’t load this carer</h1>
      <p>{{ loadError }}</p>
      <Button label="Back to carers" severity="secondary" @click="goBack" />
    </div>
  </section>
  <section v-else-if="carer" class="profile">
    <div class="profile__photo">
      <img :src="profilePhoto" :alt="`${carer.name} profile photo`" />
      <Button class="profile__back" label="Back to carers" severity="secondary" @click="goBack" />
    </div>

    <div class="profile__details">
      <header class="profile__header">
        <h1>{{ carer.name }}</h1>
        <div class="profile__rating">
          <Rating :modelValue="averageRating" readonly :cancel="false" />
          <span class="profile__rating-value">{{ averageRating.toFixed(1) }} / 5</span>
          <span class="profile__rating-count">({{ reviewCount }} reviews)</span>
        </div>
      </header>

      <article class="profile__bio">
        <h2>About {{ carer.name.split(' ')[0] }}</h2>
        <p>{{ description }}</p>
      </article>

      <section class="profile__review">
        <h2>Share your experience</h2>
        <p>Click on the stars below to rate {{ carer.name }}.</p>
        <Rating v-model="userRating" :cancel="false" @update:modelValue="handleRating" />
        <p v-if="reviewSubmitted" class="profile__thanks">
          Thank you! Your review has been added to {{ carer.name }}'s rating.
        </p>
        <p v-else-if="reviewError" class="profile__error">{{ reviewError }}</p>
      </section>
    </div>
  </section>
  <section v-else-if="hasLoaded" class="profile profile--missing">
    <div class="profile__details">
      <h1>Carer not found</h1>
      <p>We couldn’t find the profile you were looking for. Please return to the carers list.</p>
      <Button label="Back to carers" severity="secondary" @click="goBack" />
    </div>
  </section>
  <section v-else class="profile profile--status">
    <div class="profile__details">
      <h1>Loading carer profile&hellip;</h1>
      <p>Please wait while we fetch the latest details.</p>
    </div>
  </section>
</template>

<style scoped>
.profile {
  display: grid;
  grid-template-columns: minmax(0, 300px) minmax(0, 1fr);
  gap: 2.5rem;
  align-items: start;
}

.profile__photo {
  position: sticky;
  top: 1.5rem;
  display: grid;
  gap: 1rem;
}

.profile__photo img {
  width: 100%;
  border-radius: 1.25rem;
  object-fit: cover;
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.12);
}

.profile__back {
  justify-self: start;
}

.profile__details {
  display: grid;
  gap: 2rem;
}

.profile__header h1 {
  margin: 0 0 0.75rem;
  font-size: clamp(2rem, 4vw, 2.75rem);
}

.profile__rating {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.profile__rating :deep(.p-rating-icon) {
  color: #f59e0b;
}

.profile__rating-value {
  font-weight: 600;
  color: var(--p-text-color);
}

.profile__rating-count {
  color: var(--p-text-muted-color);
}

.profile__bio h2,
.profile__review h2 {
  margin: 0 0 0.75rem;
}

.profile__bio p,
.profile__review p {
  margin: 0;
  line-height: 1.6;
  color: var(--p-text-muted-color);
}

.profile__error {
  color: var(--p-red-500);
}

.profile__review {
  display: grid;
  gap: 0.75rem;
  padding: 1.5rem;
  border-radius: 1rem;
  background: rgba(59, 130, 246, 0.05);
}

.profile__thanks {
  color: #166534;
  font-weight: 600;
}

.profile--missing {
  justify-items: center;
  text-align: center;
}

.profile--status {
  justify-items: center;
  text-align: center;
}

@media (max-width: 960px) {
  .profile {
    grid-template-columns: minmax(0, 1fr);
  }

  .profile__photo {
    position: static;
  }
}
</style>
