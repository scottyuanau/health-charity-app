import { defineStore } from 'pinia'

const descriptionPlaceholder = 'The carer is busy writing the introduction, come back later.'

const calculateAverage = (reviews = []) => {
  if (!Array.isArray(reviews) || reviews.length === 0) {
    return 5
  }

  const total = reviews.reduce((sum, rating) => sum + rating, 0)
  return total / reviews.length
}

export const useCarersStore = defineStore('carers', {
  state: () => ({
    carers: [
      {
        id: 'amelia-stone',
        name: 'Amelia Stone',
        photo: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80',
        description:
          'Amelia has been supporting families in our community for over a decade, focusing on personalised care plans that celebrate independence.',
        reviews: [5, 4, 5, 5],
      },
      {
        id: 'liam-patel',
        name: 'Liam Patel',
        photo: '',
        description:
          'Liam specialises in dementia care and is known for creating calming routines that help people feel safe and understood.',
        reviews: [4, 4, 5],
      },
      {
        id: 'nina-owens',
        name: 'Nina Owens',
        photo: 'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?auto=format&fit=crop&w=400&q=80',
        description: '',
        reviews: [],
      },
    ],
  }),
  getters: {
    allCarers: (state) => state.carers,
    getCarerById: (state) => (id) => state.carers.find((carer) => carer.id === id) || null,
    getAverageRating: (state) => (id) => {
      const carer = state.carers.find((item) => item.id === id)
      if (!carer) return 5
      return calculateAverage(carer.reviews)
    },
    getReviewCount: (state) => (id) => {
      const carer = state.carers.find((item) => item.id === id)
      if (!carer || !Array.isArray(carer.reviews)) return 0
      return carer.reviews.length
    },
  },
  actions: {
    addReview(id, rating) {
      const carer = this.carers.find((item) => item.id === id)
      if (!carer) return

      const normalisedRating = Math.min(5, Math.max(1, Math.round(rating)))
      if (!Array.isArray(carer.reviews)) {
        carer.reviews = []
      }

      carer.reviews.push(normalisedRating)
    },
    getDescription(id) {
      const carer = this.carers.find((item) => item.id === id)
      if (!carer) return descriptionPlaceholder

      const content = carer.description?.trim()
      return content ? content : descriptionPlaceholder
    },
  },
})

export const getPlaceholderPhoto = (size = 300) => `https://i.pravatar.cc/${size}`
export const getDescriptionPlaceholder = () => descriptionPlaceholder
