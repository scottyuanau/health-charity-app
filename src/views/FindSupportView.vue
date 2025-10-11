<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import Rating from 'primevue/rating'
import Button from 'primevue/button'
import { doc, getDoc } from 'firebase/firestore'

import { useCarersStore } from '@/stores/carers'
import { useAuth } from '@/composables/auth'
import { db } from '@/firebase'

const carersStore = useCarersStore()
const { state } = useAuth()

const mapContainerRef = ref(null)
const mapInstance = ref(null)
const mapLoaded = ref(false)
const mapLoading = ref(true)
const mapError = ref('')
const mapStatusMessage = ref('')
const markers = ref([])
const selectedCarerId = ref(null)
const selectedCarerCoords = ref(null)
const directionSummary = ref(null)
const directionError = ref('')
const directionLoading = ref(false)

const userAddress = ref('')
const userCoordinates = ref(null)
const userProfileLoading = ref(false)
const userProfileError = ref('')

const carers = computed(() => carersStore.allCarers)
const carersLoading = computed(() => carersStore.loading)
const carersError = computed(() => carersStore.loadError)

const selectedCarer = computed(
  () => carers.value.find((carer) => carer.id === selectedCarerId.value) || null,
)

const mapboxToken = typeof import.meta.env.VITE_MAPBOX_API_KEY === 'string'
  ? import.meta.env.VITE_MAPBOX_API_KEY.trim()
  : ''

const hasMapboxToken = computed(() => mapboxToken.length > 0)

const userHasFirebaseProfile = computed(
  () => Boolean(state.user?.provider === 'firebase' && state.user?.uid),
)

const geocodeCache = new Map()
const carerCoordinateCache = new Map()

let mapboxScriptPromise = null
let mapboxglRef = null

const ensureMapboxStyles = () => {
  if (typeof document === 'undefined') return
  if (document.querySelector('link[data-mapbox-style="true"]')) {
    return
  }

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css'
  link.setAttribute('data-mapbox-style', 'true')
  document.head.appendChild(link)
}

const loadMapboxLibrary = async () => {
  if (typeof window === 'undefined') {
    throw new Error('Mapbox is only available in the browser environment.')
  }

  if (window.mapboxgl) {
    return window.mapboxgl
  }

  ensureMapboxStyles()

  if (!mapboxScriptPromise) {
    mapboxScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js'
      script.async = true
      script.defer = true
      script.setAttribute('data-mapbox-script', 'true')
      script.onload = () => {
        if (window.mapboxgl) {
          resolve(window.mapboxgl)
        } else {
          reject(new Error('Mapbox GL failed to initialise.'))
        }
      }
      script.onerror = () => {
        reject(new Error('Failed to load the Mapbox GL library.'))
      }
      document.head.appendChild(script)
    })
  }

  return mapboxScriptPromise
}

const clearMarkers = () => {
  markers.value.forEach((marker) => {
    try {
      marker.remove()
    } catch (error) {
      console.warn('Failed to remove map marker', error)
    }
  })
  markers.value = []
}

const clearRoute = () => {
  const map = mapInstance.value
  if (!map) return

  try {
    if (map.getLayer('find-support-route')) {
      map.removeLayer('find-support-route')
    }

    if (map.getSource('find-support-route')) {
      map.removeSource('find-support-route')
    }
  } catch (error) {
    console.warn('Failed to clear existing directions from the map', error)
  }
}

const resetDirections = () => {
  clearRoute()
  directionSummary.value = null
  directionError.value = ''
}

const extractStoredCoordinates = (carer) => {
  if (!carer?.location) return null

  const { lat, lng } = carer.location
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng }
  }

  return null
}

const geocodeAddress = async (query) => {
  if (!query || !hasMapboxToken.value) return null

  const trimmed = query.trim()
  if (!trimmed) return null

  if (geocodeCache.has(trimmed)) {
    return geocodeCache.get(trimmed)
  }

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json?access_token=${mapboxToken}&limit=1`

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Geocoding request failed with status ${response.status}`)
    }

    const data = await response.json()
    const feature = data?.features?.[0]
    if (feature?.center?.length >= 2) {
      const [lng, lat] = feature.center
      const coordinates = { lat, lng }
      geocodeCache.set(trimmed, coordinates)
      return coordinates
    }

    geocodeCache.set(trimmed, null)
    return null
  } catch (error) {
    console.error('Failed to geocode address', error)
    geocodeCache.set(trimmed, null)
    return null
  }
}

const resolveCarerCoordinates = async (carer) => {
  if (!carer) return null

  if (carerCoordinateCache.has(carer.id)) {
    return carerCoordinateCache.get(carer.id)
  }

  const stored = extractStoredCoordinates(carer)
  if (stored) {
    carerCoordinateCache.set(carer.id, stored)
    return stored
  }

  if (carer.address) {
    const geocoded = await geocodeAddress(carer.address)
    carerCoordinateCache.set(carer.id, geocoded)
    return geocoded
  }

  carerCoordinateCache.set(carer.id, null)
  return null
}

const createPopupHtml = (carer) => {
  const averageRating = carersStore.getAverageRating(carer.id).toFixed(1)
  const reviewCount = carersStore.getReviewCount(carer.id)

  const reviewsLabel = reviewCount === 1 ? '1 review' : `${reviewCount} reviews`

  return `
    <div class="find-support__popup">
      <h3>${carer.name}</h3>
      <p>Average rating: <strong>${averageRating}</strong> / 5 &middot; ${reviewsLabel}</p>
    </div>
  `
}

const selectCarer = (carer, coordinates) => {
  if (!carer || !coordinates) return

  selectedCarerId.value = carer.id
  selectedCarerCoords.value = coordinates
  resetDirections()
  mapStatusMessage.value = ''

  if (mapInstance.value) {
    mapInstance.value.easeTo({
      center: [coordinates.lng, coordinates.lat],
      zoom: 13,
      duration: 800,
    })
  }
}

const updateMarkers = async () => {
  const map = mapInstance.value
  if (!map || !mapboxglRef) return

  clearMarkers()
  mapStatusMessage.value = ''

  const markerCoordinates = []

  for (const carer of carers.value) {
    const coordinates = await resolveCarerCoordinates(carer)
    if (!coordinates) continue

    const marker = new mapboxglRef.Marker({ color: '#2563eb' })
      .setLngLat([coordinates.lng, coordinates.lat])
      .setPopup(new mapboxglRef.Popup({ offset: 24 }).setHTML(createPopupHtml(carer)))
      .addTo(map)

    marker.getElement().addEventListener('click', () => {
      selectCarer(carer, coordinates)
    })

    markers.value.push(marker)
    markerCoordinates.push([coordinates.lng, coordinates.lat])
  }

  if (!markers.value.length) {
    mapStatusMessage.value = 'We could not find any carers with a mapped location yet.'
    return
  }

  if (markerCoordinates.length === 1) {
    map.easeTo({ center: markerCoordinates[0], zoom: 12, duration: 600 })
    return
  }

  const bounds = markerCoordinates.reduce((result, point) => {
    if (!result) {
      return new mapboxglRef.LngLatBounds(point, point)
    }
    return result.extend(point)
  }, null)

  if (bounds) {
    map.fitBounds(bounds, { padding: 80, maxZoom: 13, duration: 800 })
  }
}

const handleSelectCarer = async (carer) => {
  if (!carer) return

  const coordinates = await resolveCarerCoordinates(carer)

  if (!coordinates) {
    selectedCarerId.value = carer.id
    selectedCarerCoords.value = null
    resetDirections()
    mapStatusMessage.value = `We could not find a mapped location for ${carer.name} yet.`
    return
  }

  selectCarer(carer, coordinates)
}

const initialiseMap = async () => {
  if (!hasMapboxToken.value) {
    mapError.value = 'The Mapbox API key is missing. Add VITE_MAPBOX_API_KEY to enable the map.'
    mapLoading.value = false
    return
  }

  if (!mapContainerRef.value) {
    await nextTick()
  }

  if (!mapContainerRef.value) {
    mapError.value = 'The map could not be initialised because the container failed to render.'
    mapLoading.value = false
    return
  }

  mapLoading.value = true
  mapError.value = ''

  try {
    const mapboxgl = await loadMapboxLibrary()
    mapboxglRef = mapboxgl
    mapboxgl.accessToken = mapboxToken

    const map = new mapboxgl.Map({
      container: mapContainerRef.value,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-0.1276, 51.5072],
      zoom: 10,
    })

    mapInstance.value = map

    map.on('load', () => {
      mapLoaded.value = true
      mapLoading.value = false
      updateMarkers()
    })
  } catch (error) {
    console.error('Failed to initialise Mapbox map', error)
    mapboxScriptPromise = null
    mapError.value = 'We were unable to load the interactive map. Please try again later.'
    mapLoading.value = false
  }
}

const destroyMap = () => {
  clearMarkers()
  if (mapInstance.value) {
    try {
      mapInstance.value.remove()
    } catch (error) {
      console.warn('Failed to clean up Mapbox map instance', error)
    }
    mapInstance.value = null
  }
  mapLoaded.value = false
}

const formatDistance = (meters) => {
  if (!Number.isFinite(meters)) return ''
  if (meters < 1000) {
    return `${Math.round(meters)} m`
  }

  const kilometres = meters / 1000
  return `${kilometres.toFixed(kilometres >= 10 ? 0 : 1)} km`
}

const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds)) return ''

  const totalMinutes = Math.round(seconds / 60)
  if (totalMinutes < 60) {
    return `${totalMinutes} min`
  }

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (minutes === 0) {
    return `${hours} hr`
  }
  return `${hours} hr ${minutes} min`
}

const ensureUserCoordinates = async () => {
  if (userCoordinates.value) {
    return userCoordinates.value
  }

  if (!userAddress.value) {
    directionError.value = 'Add your address to calculate directions to a carer.'
    return null
  }

  directionError.value = ''
  const coordinates = await geocodeAddress(userAddress.value)
  if (!coordinates) {
    directionError.value = 'We could not find that address. Please refine it and try again.'
    return null
  }

  userCoordinates.value = coordinates
  return coordinates
}

const showDirections = async () => {
  if (!selectedCarer.value || !selectedCarerCoords.value) {
    directionError.value = selectedCarer.value
      ? 'We do not have a mapped location for this carer yet.'
      : 'Select a carer on the map to view directions.'
    return
  }

  if (!mapLoaded.value) {
    directionError.value = 'The map is still loading. Please try again shortly.'
    return
  }

  const start = await ensureUserCoordinates()
  if (!start) return

  directionLoading.value = true
  directionError.value = ''

  const coordinates = `${start.lng},${start.lat};${selectedCarerCoords.value.lng},${selectedCarerCoords.value.lat}`
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?geometries=geojson&access_token=${mapboxToken}`

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Directions request failed with status ${response.status}`)
    }

    const data = await response.json()
    const route = data?.routes?.[0]

    if (!route?.geometry) {
      throw new Error('No route geometry returned from Mapbox Directions API.')
    }

    const map = mapInstance.value
    if (!map) {
      throw new Error('Map is not ready for rendering directions.')
    }

    clearRoute()

    map.addSource('find-support-route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: route.geometry,
        properties: {},
      },
    })

    map.addLayer({
      id: 'find-support-route',
      type: 'line',
      source: 'find-support-route',
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#ef4444',
        'line-width': 6,
        'line-opacity': 0.85,
      },
    })

    directionSummary.value = {
      distance: formatDistance(route.distance),
      duration: formatDuration(route.duration),
    }

    const bounds = route.geometry.coordinates.reduce((result, point) => {
      if (!result) {
        return new mapboxglRef.LngLatBounds(point, point)
      }
      return result.extend(point)
    }, null)

    if (bounds) {
      map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 800 })
    }
  } catch (error) {
    console.error('Failed to retrieve driving directions', error)
    directionError.value = 'We were unable to find directions. Please try another address or try again later.'
  } finally {
    directionLoading.value = false
  }
}

const loadUserProfileAddress = async () => {
  if (!db || !userHasFirebaseProfile.value) {
    userAddress.value = ''
    userCoordinates.value = null
    userProfileError.value = ''
    return
  }

  userProfileLoading.value = true
  userProfileError.value = ''

  try {
    const snapshot = await getDoc(doc(db, 'users', state.user.uid))
    if (snapshot.exists()) {
      const data = snapshot.data()
      const savedAddress = typeof data?.address === 'string' ? data.address.trim() : ''
      userAddress.value = savedAddress
      userCoordinates.value = null
    } else {
      userAddress.value = ''
    }
  } catch (error) {
    console.error('Failed to load user profile address', error)
    userProfileError.value = 'We could not load your saved address from your profile.'
  } finally {
    userProfileLoading.value = false
  }
}

watch(
  () => carers.value,
  () => {
    if (mapLoaded.value) {
      updateMarkers()
    }
  },
  { deep: true },
)

watch(
  () => mapLoaded.value,
  (loaded) => {
    if (loaded) {
      updateMarkers()
    }
  },
)

watch(
  () => state.user?.uid,
  () => {
    loadUserProfileAddress()
  },
)

watch(userAddress, () => {
  userCoordinates.value = null
  directionSummary.value = null
  directionError.value = ''
})

onMounted(async () => {
  carersStore.fetchCarers()
  await initialiseMap()
  loadUserProfileAddress()
})

onUnmounted(() => {
  destroyMap()
})
</script>

<template>
  <section class="find-support">
    <header class="find-support__header">
      <h1>Find Support Near You</h1>
      <p>
        Explore carers across our community, review their experience, and get directions from your
        home to their location.
      </p>
    </header>

    <div class="find-support__layout">
      <aside class="find-support__panel">
        <section class="find-support__panel-section">
          <h2>Carers</h2>

          <p v-if="carersLoading" class="find-support__status">Loading carers&hellip;</p>
          <p v-else-if="carersError" class="find-support__status find-support__status--error">
            {{ carersError }}
          </p>
          <p v-else-if="!carers.length" class="find-support__status">
            We don't have any carers to show right now. Please check back soon.
          </p>
          <ul v-else class="find-support__carer-list">
            <li v-for="carer in carers" :key="carer.id">
              <button
                type="button"
                class="find-support__carer-button"
                :class="{ 'find-support__carer-button--active': carer.id === selectedCarerId }"
                @click="handleSelectCarer(carer)"
              >
                <span class="find-support__carer-name">{{ carer.name }}</span>
                <span class="find-support__carer-meta">
                  {{ carersStore.getAverageRating(carer.id).toFixed(1) }} / 5 ·
                  {{ carersStore.getReviewCount(carer.id) }} reviews
                </span>
              </button>
            </li>
          </ul>
        </section>

        <section class="find-support__panel-section" v-if="selectedCarer">
          <h2>{{ selectedCarer.name }}</h2>

          <div class="find-support__rating">
            <Rating :modelValue="carersStore.getAverageRating(selectedCarer.id)" readonly :cancel="false" />
            <span>
              {{ carersStore.getAverageRating(selectedCarer.id).toFixed(1) }} / 5 ·
              {{ carersStore.getReviewCount(selectedCarer.id) }} reviews
            </span>
          </div>

          <p v-if="selectedCarer.address" class="find-support__address">
            <strong>Address:</strong> {{ selectedCarer.address }}
          </p>

          <p class="find-support__description">{{ carersStore.getDescription(selectedCarer.id) }}</p>

          <div class="find-support__directions">
            <label for="find-support-address" class="find-support__label">Your address</label>
            <input
              id="find-support-address"
              v-model="userAddress"
              type="text"
              class="find-support__input"
              placeholder="123 Main Street, City, Country"
              :disabled="directionLoading"
            />
            <p v-if="userProfileLoading" class="find-support__hint">Loading your saved address…</p>
            <p v-else-if="userProfileError" class="find-support__hint find-support__hint--error">
              {{ userProfileError }}
            </p>
            <Button
              label="Get directions"
              icon="pi pi-compass"
              class="find-support__button"
              @click="showDirections"
              :loading="directionLoading"
            />
            <p v-if="directionError" class="find-support__hint find-support__hint--error">
              {{ directionError }}
            </p>
            <p v-else-if="directionSummary" class="find-support__hint find-support__hint--success">
              Estimated travel: {{ directionSummary.distance }} · {{ directionSummary.duration }}
            </p>
          </div>
        </section>
      </aside>

      <div class="find-support__map-wrapper">
        <div class="find-support__map" ref="mapContainerRef"></div>
        <div v-if="mapLoading" class="find-support__map-overlay">Preparing the map&hellip;</div>
        <div v-else-if="mapError" class="find-support__map-overlay find-support__map-overlay--error">
          {{ mapError }}
        </div>
        <div v-if="mapStatusMessage" class="find-support__map-message">{{ mapStatusMessage }}</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.find-support {
  display: grid;
  gap: 2rem;
}

.find-support__header {
  text-align: center;
  display: grid;
  gap: 0.75rem;
}

.find-support__header h1 {
  margin: 0;
  font-size: clamp(2rem, 5vw, 2.75rem);
}

.find-support__header p {
  margin: 0;
  color: var(--p-text-muted-color);
  max-width: 60ch;
  justify-self: center;
}

.find-support__layout {
  display: grid;
  grid-template-columns: minmax(0, 320px) minmax(0, 1fr);
  gap: 2rem;
  align-items: start;
}

.find-support__panel {
  display: grid;
  gap: 1.5rem;
  align-content: start;
}

.find-support__panel-section {
  background: var(--p-surface-card);
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
  display: grid;
  gap: 1rem;
}

.find-support__panel-section h2 {
  margin: 0;
  font-size: 1.25rem;
}

.find-support__status {
  margin: 0;
  color: var(--p-text-muted-color);
}

.find-support__status--error {
  color: #b91c1c;
}

.find-support__carer-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}

.find-support__carer-button {
  width: 100%;
  text-align: left;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
  background: white;
  cursor: pointer;
  display: grid;
  gap: 0.35rem;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.find-support__carer-button:hover,
.find-support__carer-button:focus-visible {
  border-color: #2563eb;
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.15);
  outline: none;
}

.find-support__carer-button--active {
  border-color: #2563eb;
  background: rgba(37, 99, 235, 0.08);
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.15);
}

.find-support__carer-name {
  font-weight: 600;
}

.find-support__carer-meta {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}

.find-support__rating {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.find-support__rating :deep(.p-rating-icon) {
  color: #f59e0b;
}

.find-support__address {
  margin: 0;
  color: var(--p-text-muted-color);
}

.find-support__description {
  margin: 0;
  line-height: 1.6;
  color: var(--p-text-muted-color);
}

.find-support__directions {
  display: grid;
  gap: 0.75rem;
}

.find-support__label {
  font-weight: 600;
}

.find-support__input {
  width: 100%;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  padding: 0.65rem 0.85rem;
}

.find-support__input:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}

.find-support__button :deep(.p-button-label) {
  font-weight: 600;
}

.find-support__hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}

.find-support__hint--error {
  color: #b91c1c;
}

.find-support__hint--success {
  color: #15803d;
}

.find-support__map-wrapper {
  position: relative;
  min-height: 520px;
}

.find-support__map {
  width: 100%;
  height: 100%;
  min-height: 520px;
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.12);
  background: rgba(37, 99, 235, 0.08);
}

.find-support__map-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: 1rem;
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
  text-align: center;
  padding: 1.5rem;
  font-weight: 600;
  z-index: 2;
}

.find-support__map-overlay--error {
  background: rgba(239, 68, 68, 0.08);
  color: #b91c1c;
}

.find-support__map-message {
  position: absolute;
  inset: auto 1rem 1rem 1rem;
  background: rgba(15, 23, 42, 0.85);
  color: white;
  padding: 0.85rem 1rem;
  border-radius: 0.75rem;
  font-size: 0.9rem;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.28);
  z-index: 3;
}

.find-support__popup {
  display: grid;
  gap: 0.35rem;
}

.find-support__popup h3 {
  margin: 0;
  font-size: 1rem;
}

.find-support__popup p {
  margin: 0;
  font-size: 0.85rem;
  color: #475569;
}

@media (max-width: 1024px) {
  .find-support__layout {
    grid-template-columns: 1fr;
  }

  .find-support__panel {
    order: 2;
  }

  .find-support__map-wrapper {
    order: 1;
    min-height: 420px;
  }

  .find-support__map {
    min-height: 420px;
  }
}

@media (max-width: 600px) {
  .find-support__panel-section {
    padding: 1.25rem;
  }

  .find-support__map-wrapper {
    min-height: 360px;
  }

  .find-support__map {
    min-height: 360px;
  }
}
</style> 
