import { defineStore } from 'pinia'
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'

import { db } from '@/firebase'

const descriptionPlaceholder = 'The carer is busy writing the introduction, come back later.'

const normaliseRating = (value) => {
  if (!Number.isFinite(value)) return null
  const rounded = Math.round(value)
  return Math.min(5, Math.max(1, rounded))
}

const extractRatings = (input) => {
  if (!Array.isArray(input)) return []

  return input
    .map((entry) => {
      if (entry === null || entry === undefined) return null
      if (typeof entry === 'number' && Number.isFinite(entry)) return entry
      if (typeof entry === 'string' && entry.trim()) {
        const parsed = Number(entry)
        return Number.isFinite(parsed) ? parsed : null
      }

      if (typeof entry === 'object') {
        const candidate =
          entry.rating ?? entry.score ?? entry.value ?? entry.amount ?? entry.points ?? null

        if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate
        if (typeof candidate === 'string' && candidate.trim()) {
          const parsed = Number(candidate)
          return Number.isFinite(parsed) ? parsed : null
        }
      }

      return null
    })
    .map((value) => normaliseRating(value))
    .filter((rating) => rating !== null)
}

const calculateAverage = (reviews = []) => {
  if (!Array.isArray(reviews) || reviews.length === 0) {
    return 5
  }

  const total = reviews.reduce((sum, rating) => sum + rating, 0)
  return total / reviews.length
}

const transformCarerRecord = (snapshotDoc) => {
  const data = snapshotDoc.data() || {}

  const reviews = extractRatings(data.reviews)
  const potentialPhotoFields = ['photoURL', 'photoUrl', 'photo', 'avatarUrl']
  const photo = potentialPhotoFields.reduce((result, field) => {
    if (result) return result
    const value = data[field]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
    return ''
  }, '')

  const descriptionFields = ['bio', 'about', 'description']
  const description = descriptionFields.reduce((result, field) => {
    if (result) return result
    const value = data[field]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
    return ''
  }, '')

  const username = typeof data?.username === 'string' ? data.username.trim() : ''
  const email = typeof data?.email === 'string' ? data.email.trim() : ''

  const address = typeof data?.address === 'string' ? data.address.trim() : ''

  const extractCoordinates = (value) => {
    if (!value) return null

    const tryCreatePoint = (latCandidate, lngCandidate) => {
      const lat = Number(latCandidate)
      const lng = Number(lngCandidate)

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null
      }

      return { lat, lng }
    }

    if (typeof value === 'object') {
      if (typeof value.latitude === 'number' && typeof value.longitude === 'number') {
        return tryCreatePoint(value.latitude, value.longitude)
      }

      if (typeof value.lat === 'number' && typeof value.lng === 'number') {
        return tryCreatePoint(value.lat, value.lng)
      }

      if (typeof value.lat === 'number' && typeof value.long === 'number') {
        return tryCreatePoint(value.lat, value.long)
      }

      if (typeof value.latitude === 'number' && typeof value.long === 'number') {
        return tryCreatePoint(value.latitude, value.long)
      }

      if (typeof value._lat === 'number' && typeof value._long === 'number') {
        return tryCreatePoint(value._lat, value._long)
      }

      if (Array.isArray(value) && value.length >= 2) {
        return tryCreatePoint(value[1], value[0])
      }
    }

    if (Array.isArray(value) && value.length >= 2) {
      return tryCreatePoint(value[1], value[0])
    }

    return null
  }

  const locationCandidates = [
    data?.location,
    data?.coordinates,
    data?.position,
    data?.geo,
    data?.geopoint,
  ]

  const location = locationCandidates.reduce((result, candidate) => {
    if (result) return result
    return extractCoordinates(candidate)
  }, null)

  return {
    id: snapshotDoc.id,
    name: username || (email ? email.split('@')[0] || email : 'Carer'),
    email,
    photo,
    description,
    reviews,
    address,
    location,
  }
}

export const useCarersStore = defineStore('carers', {
  state: () => ({
    carers: [],
    loading: false,
    loadError: '',
    hasLoaded: false,
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
    async fetchCarers(force = false) {
      if (this.loading) return
      if (this.hasLoaded && !force) return

      if (!db) {
        if (import.meta.env.DEV) {
          console.warn('Firebase has not been initialised. Skipping carers fetch.')
        }
        this.carers = []
        this.loadError = 'Carers are unavailable because Firebase is not configured.'
        this.hasLoaded = true
        return
      }

      this.loading = true
      this.loadError = ''

      try {
        const carersQuery = query(collection(db, 'users'), where('roles', 'array-contains', 'carer'))
        const snapshot = await getDocs(carersQuery)
        const carers = snapshot.docs.map((doc) => transformCarerRecord(doc))

        this.carers = await this.enrichWithReviews(carers)
      } catch (error) {
        console.error('Failed to load carers', error)
        this.carers = []
        this.loadError = 'We were unable to load carers. Please try again later.'
      } finally {
        this.loading = false
        this.hasLoaded = true
      }
    },
    async enrichWithReviews(carers) {
      if (!Array.isArray(carers) || carers.length === 0) {
        return []
      }

      if (!db) {
        return carers
      }

      const carerIds = carers.map((carer) => carer.id).filter(Boolean)
      if (carerIds.length === 0) {
        return carers
      }

      const reviewsByCarer = new Map()

      const chunkSize = 10
      const reviewCollection = collection(db, 'reviews')
      const reviewQueries = []

      for (let index = 0; index < carerIds.length; index += chunkSize) {
        const chunk = carerIds.slice(index, index + chunkSize)
        if (chunk.length === 0) continue
        reviewQueries.push(getDocs(query(reviewCollection, where('carerId', 'in', chunk))))
      }

      if (reviewQueries.length === 0) {
        return carers
      }

      try {
        const reviewSnapshots = await Promise.all(reviewQueries)

        reviewSnapshots.forEach((snapshot) => {
          snapshot.docs.forEach((docSnapshot) => {
            const data = docSnapshot.data() || {}

            let carerId = ''
            if (typeof data.carerId === 'string') {
              carerId = data.carerId.trim()
            } else {
              const fallback = docSnapshot.get('carerId')
              if (typeof fallback === 'string') {
                carerId = fallback.trim()
              } else if (fallback !== undefined && fallback !== null) {
                carerId = String(fallback)
              }
            }

            if (!carerId) return

            if (!reviewsByCarer.has(carerId)) {
              reviewsByCarer.set(carerId, [])
            }

            reviewsByCarer.get(carerId).push(data)
          })
        })
      } catch (error) {
        console.error('Failed to load carer reviews', error)
      }

      return carers.map((carer) => {
        const existingReviews = Array.isArray(carer.reviews) ? carer.reviews : []
        const fetchedReviews = reviewsByCarer.get(carer.id) || []

        const combined = extractRatings([...existingReviews, ...fetchedReviews])

        return {
          ...carer,
          reviews: combined,
        }
      })
    },
    async addReview(id, rating) {
      const carer = this.carers.find((item) => item.id === id)
      if (!carer) return false

      const normalisedRating = normaliseRating(rating)
      if (normalisedRating === null) return false

      const ensureReviewArray = () => {
        if (!Array.isArray(carer.reviews)) {
          carer.reviews = []
        }
      }

      if (!db) {
        if (import.meta.env.DEV) {
          console.warn('Firebase has not been initialised. Review stored locally only.')
        }
        ensureReviewArray()
        carer.reviews.push(normalisedRating)
        return true
      }

      let reviewPersisted = false

      try {
        const carerRef = doc(db, 'users', id)
        await updateDoc(carerRef, {
          reviews: arrayUnion(normalisedRating),
        })
        reviewPersisted = true
      } catch (error) {
        console.error('Failed to record review in user profile', error)
      }

      try {
        await addDoc(collection(db, 'reviews'), {
          carerId: id,
          rating: normalisedRating,
          createdAt: serverTimestamp(),
        })
        reviewPersisted = true
      } catch (error) {
        console.error('Failed to record review in reviews collection', error)
      }

      if (!reviewPersisted) {
        return false
      }

      ensureReviewArray()
      carer.reviews.push(normalisedRating)
      return true
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
