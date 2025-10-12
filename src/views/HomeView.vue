<script setup>
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { useToast } from 'primevue/usetoast'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'

import { db } from '@/firebase'

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

const email = ref('')
const emailError = ref('')
const isSubmitting = ref(false)

const toast = useToast()

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const clearEmailError = () => {
  if (emailError.value) {
    emailError.value = ''
  }
}

const handleSubscribe = async () => {
  const trimmedEmail = email.value.trim()
  emailError.value = ''

  if (!trimmedEmail) {
    emailError.value = 'Please enter your email address.'
    return
  }

  if (!emailPattern.test(trimmedEmail)) {
    emailError.value = 'Please enter a valid email address.'
    return
  }

  if (!db) {
    toast.add({
      severity: 'error',
      summary: 'Subscription unavailable',
      detail: 'We could not connect to the subscription service. Please try again later.',
      life: 5000,
    })
    return
  }

  try {
    isSubmitting.value = true

    await addDoc(collection(db, 'newsletterSubscriptions'), {
      email: trimmedEmail,
      subscribedAt: serverTimestamp(),
    })

    toast.add({
      severity: 'success',
      summary: 'Subscription confirmed',
      detail: 'You are now subscribed to our newsletter. Thank you!',
      life: 4500,
    })

    email.value = ''
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to subscribe to newsletter', error)
    }

    toast.add({
      severity: 'error',
      summary: 'Subscription failed',
      detail: 'Something went wrong while subscribing. Please try again shortly.',
      life: 5000,
    })
  } finally {
    isSubmitting.value = false
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
    <section class="newsletter">
      <div class="newsletter__content">
        <h2 class="newsletter__title">Stay informed</h2>
        <p class="newsletter__description">
          Subscribe to our newsletter for inspiring stories, program updates, and ways you can continue making a
          difference.
        </p>
      </div>
      <form class="newsletter__form" @submit.prevent="handleSubscribe" novalidate>
        <label class="newsletter__label" for="newsletter-email">Email address</label>
        <div class="newsletter__input-group">
          <InputText
            id="newsletter-email"
            v-model="email"
            type="email"
            class="newsletter__input"
            :class="{ 'p-invalid': emailError }"
            placeholder="you@example.com"
            autocomplete="email"
            :disabled="isSubmitting"
            :aria-invalid="emailError ? 'true' : 'false'"
            aria-describedby="newsletter-email-message"
            @input="clearEmailError"
          />
          <Button
            type="submit"
            label="Subscribe"
            class="newsletter__submit p-button-rounded"
            :loading="isSubmitting"
            :disabled="isSubmitting"
          />
        </div>
        <p
          id="newsletter-email-message"
          class="newsletter__message"
          :class="{ 'newsletter__message--error': emailError }"
          aria-live="polite"
        >
          {{ emailError || 'We’ll send occasional updates about our latest impact and upcoming events.' }}
        </p>
      </form>
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

.newsletter {
  display: grid;
  gap: clamp(1.5rem, 4vw, 2.5rem);
  margin-top: clamp(2.5rem, 6vw, 4rem);
  padding: clamp(2rem, 6vw, 3.5rem);
  background: linear-gradient(135deg, #f6f8fb 0%, #ffffff 100%);
  border-radius: 1.25rem;
  box-shadow: 0 1.5rem 3rem rgba(15, 23, 42, 0.08);
}

.newsletter__content {
  display: grid;
  gap: 0.75rem;
}

.newsletter__title {
  margin: 0;
  font-size: clamp(1.75rem, 3vw, 2.25rem);
  font-weight: 700;
  color: #102a43;
}

.newsletter__description {
  margin: 0;
  font-size: clamp(1rem, 2vw, 1.125rem);
  color: #334e68;
  line-height: 1.7;
}

.newsletter__form {
  display: grid;
  gap: 0.75rem;
}

.newsletter__label {
  font-weight: 600;
  color: #102a43;
}

.newsletter__input-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.newsletter__input {
  flex: 1 1 260px;
  min-height: 3.25rem;
  max-height:3.25rem;
  padding-inline: 1rem;
  font-size: 1rem;
}

.newsletter__submit {
  flex: 0 0 auto;
  min-width: 9rem;
  font-weight: 600;
}

.newsletter__message {
  margin: 0;
  font-size: 0.95rem;
  color: #486581;
}

.newsletter__message--error {
  color: #d64545;
}

@media (max-width: 768px) {
  .impact-highlight {
    text-align: center;
  }

  .impact-highlight__content {
    align-items: center;
  }
}

@media (max-width: 600px) {
  .newsletter__input-group {
    flex-direction: column;
    align-items: stretch;
  }

  .newsletter__submit {
    width: 100%;
  }
}
</style>
