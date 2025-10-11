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
import { sanitizeMultilineText, sanitizeSingleLineText, sanitizeUrl } from '@/utils/sanitize'

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
      return sanitizeUrl(value)
    }
    return ''
  }, '')

  const descriptionFields = ['bio', 'about', 'description']
  const description = descriptionFields.reduce((result, field) => {
    if (result) return result
    const value = data[field]
    if (typeof value === 'string' && value.trim()) {
      return sanitizeMultilineText(value, { maxLength: 1000 })
    }
    return ''
  }, '')

  const username = sanitizeSingleLineText(data?.username, { maxLength: 120 })
  const emailCandidate = sanitizeSingleLineText(data?.email, { maxLength: 255 })
  const email = emailCandidate.includes('@') ? emailCandidate : ''

  const address = sanitizeSingleLineText(data?.address, { maxLength: 255 })

  const extractCoordinates = (input, visited = new WeakSet()) => {
    if (!input) return null

    const tryCreatePoint = (latCandidate, lngCandidate) => {
      const toNumber = (value) => {
        if (typeof value === 'number') {
          return Number.isFinite(value) ? value : null
        }

        if (typeof value === 'string') {
          const trimmed = value.trim()
          if (!trimmed) return null
          const parsed = Number(trimmed)
          return Number.isFinite(parsed) ? parsed : null
        }

        return null
      }

      const lat = toNumber(latCandidate)
      const lng = toNumber(lngCandidate)

      if (lat === null || lng === null) {
        return null
      }

      return { lat, lng }
    }

    const parseLatLngString = (value) => {
      if (typeof value !== 'string') return null

      const cleaned = value.replace(/[()[\]{}]/g, ' ').trim()
      if (!cleaned) return null

      const matches = cleaned.match(/-?\d+(?:\.\d+)?/g)
      if (!matches || matches.length < 2) {
        return null
      }

      return (
        tryCreatePoint(matches[0], matches[1]) ||
        (matches.length >= 3 ? tryCreatePoint(matches[1], matches[2]) : null)
      )
    }

    if (typeof input === 'string') {
      return parseLatLngString(input)
    }

    if (Array.isArray(input)) {
      if (input.length >= 2) {
        return (
          tryCreatePoint(input[0], input[1]) ||
          tryCreatePoint(input[1], input[0])
        )
      }
      return null
    }

    if (typeof input !== 'object') {
      return null
    }

    if (visited.has(input)) {
      return null
    }
    visited.add(input)

    const directCandidates = [
      [input.latitude, input.longitude],
      [input.lat, input.lng],
      [input.lat, input.long],
      [input.latitude, input.long],
      [input._lat, input._long],
      [input.y, input.x],
    ]

    for (const [latCandidate, lngCandidate] of directCandidates) {
      const point = tryCreatePoint(latCandidate, lngCandidate)
      if (point) return point
    }

    if (typeof input.latLng === 'string') {
      const parsed = parseLatLngString(input.latLng)
      if (parsed) return parsed
    }

    if (Array.isArray(input.coordinates) && input.coordinates.length >= 2) {
      const point =
        tryCreatePoint(input.coordinates[0], input.coordinates[1]) ||
        tryCreatePoint(input.coordinates[1], input.coordinates[0])
      if (point) return point
    }

    if (typeof input.coordinates === 'string') {
      const parsed = parseLatLngString(input.coordinates)
      if (parsed) return parsed
    }

    if (Array.isArray(input.location) || typeof input.location === 'object') {
      const nested = extractCoordinates(input.location, visited)
      if (nested) return nested
    }

    if (Array.isArray(input.position) || typeof input.position === 'object') {
      const nested = extractCoordinates(input.position, visited)
      if (nested) return nested
    }

    if (Array.isArray(input.geo) || typeof input.geo === 'object') {
      const nested = extractCoordinates(input.geo, visited)
      if (nested) return nested
    }

    if (Array.isArray(input.geopoint) || typeof input.geopoint === 'object') {
      const nested = extractCoordinates(input.geopoint, visited)
      if (nested) return nested
    }

    for (const key of Object.keys(input)) {
      const candidate = input[key]
      const nested = extractCoordinates(candidate, visited)
      if (nested) {
        return nested
      }
    }

    return null
  }

  const locationCandidates = [
    data?.location,
    data?.coordinates,
    data?.position,
    data?.geo,
    data?.geopoint,
    data?.profile?.location,
    data?.profile?.coordinates,
    data?.profile?.geo,
  ]

  const location = locationCandidates.reduce((result, candidate) => {
    if (result) return result
    return extractCoordinates(candidate)
  }, null)

  const derivedName = username || (email ? email.split('@')[0] || email : 'Carer')

  return {
    id: snapshotDoc.id,
    name: sanitizeSingleLineText(derivedName, { maxLength: 120 }) || 'Carer',
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
