<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { doc, getDoc } from 'firebase/firestore'

import { loadGoogleMaps } from '@/composables/googleMaps'
import { useCarersStore } from '@/stores/carers'
import { useAuth } from '@/composables/auth'
import { db } from '@/firebase'

const mapElementRef = ref(null)
const mapInstance = ref(null)
const googleMapsApi = ref(null)
const mapLoading = ref(true)
const mapError = ref('')
const locationError = ref('')
const locationLoading = ref(true)
const directionsError = ref('')
const directionsLoading = ref(false)
const selectedCarerId = ref('')
const userLocation = ref(null)
const userAddress = ref('')

const carersStore = useCarersStore()
const carers = computed(() => carersStore.allCarers)
const carersWithLocations = computed(() =>
  carers.value.filter((carer) =>
    carer?.location && Number.isFinite(carer.location.lat) && Number.isFinite(carer.location.lng),
  ),
)

const selectedCarer = computed(() => {
  if (!selectedCarerId.value) return null
  return carersStore.getCarerById(selectedCarerId.value)
})

const selectedCarerRating = computed(() => {
  if (!selectedCarer.value) {
    return null
  }

  const reviewCount = carersStore.getReviewCount(selectedCarer.value.id)
  const averageRating = carersStore.getAverageRating(selectedCarer.value.id)

  return {
    count: reviewCount,
    average: Number.isFinite(averageRating) ? averageRating : null,
  }
})

const { state } = useAuth()
const firebaseUser = computed(() => {
  const user = state.user
  if (user?.provider === 'firebase' && user.uid) {
    return user
  }
  return null
})

const markerInstances = new Map()
let infoWindowInstance = null
let directionsService = null
let directionsRenderer = null
let userMarkerInstance = null
let hasCenteredOnUser = false
let hasCenteredOnCarers = false

const fitMapToVisibleLocations = ({ includeUser = true } = {}) => {
  if (!mapInstance.value || !googleMapsApi.value) {
    return
  }

  const bounds = new googleMapsApi.value.LatLngBounds()
  let hasVisibleLocations = false

  carersWithLocations.value.forEach((carer) => {
    if (!carer?.location) return

    bounds.extend(carer.location)
    hasVisibleLocations = true
  })

  if (includeUser && userLocation.value) {
    bounds.extend(userLocation.value)
    hasVisibleLocations = true
  }

  if (!hasVisibleLocations) {
    return
  }

  mapInstance.value.fitBounds(bounds)
}

const escapeHtml = (value) => {
  if (typeof value !== 'string') {
    return ''
  }

  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const describeGeolocationError = (error) => {
  if (!error) return 'We could not determine your location.'

  if (typeof error.code === 'number') {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return 'We could not access your location because permission was denied.'
      case error.POSITION_UNAVAILABLE:
        return 'Location information is unavailable. Please try again later.'
      case error.TIMEOUT:
        return 'Locating you took too long. Please try again.'
      default:
        break
    }
  }

  if (typeof error.message === 'string' && error.message.trim()) {
    return error.message
  }

  return 'We could not determine your location.'
}

const attemptBrowserGeolocation = () => {
  if (typeof navigator === 'undefined' || !navigator?.geolocation) {
    return Promise.reject(new Error('Geolocation is not supported by your browser.'))
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({ lat: position.coords.latitude, lng: position.coords.longitude })
      },
      (error) => {
        reject(error)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    )
  })
}

const geocodeAddress = async (address) => {
  if (!googleMapsApi.value) {
    throw new Error('The Google Maps API is not ready yet.')
  }

  const trimmed = typeof address === 'string' ? address.trim() : ''
  if (!trimmed) {
    throw new Error('No address was provided for geocoding.')
  }

  const geocoder = new googleMapsApi.value.Geocoder()

  return new Promise((resolve, reject) => {
    geocoder.geocode({ address: trimmed }, (results, status) => {
      if (status === 'OK' && Array.isArray(results) && results[0]?.geometry?.location) {
        const location = results[0].geometry.location
        resolve({ lat: location.lat(), lng: location.lng() })
        return
      }

      if (status === 'ZERO_RESULTS') {
        reject(new Error('We could not find that address on the map.'))
        return
      }

      reject(new Error('We could not convert your address to map coordinates.'))
    })
  })
}

const updateUserMarker = () => {
  if (!mapInstance.value || !googleMapsApi.value || !userLocation.value) {
    return
  }

  const position = userLocation.value

  if (userMarkerInstance) {
    userMarkerInstance.setPosition(position)
    return
  }

  userMarkerInstance = new googleMapsApi.value.Marker({
    map: mapInstance.value,
    position,
    title: 'Your location',
    icon: {
      path: googleMapsApi.value.SymbolPath.CIRCLE,
      scale: 8,
      strokeColor: '#2563eb',
      strokeWeight: 3,
      fillColor: '#3b82f6',
      fillOpacity: 0.85,
    },
  })
}

const openInfoWindow = (carer, marker) => {
  if (!googleMapsApi.value || !mapInstance.value || !marker) {
    return
  }

  if (!infoWindowInstance) {
    infoWindowInstance = new googleMapsApi.value.InfoWindow()
  }

  const reviewCount = carersStore.getReviewCount(carer.id)
  const averageRating = carersStore.getAverageRating(carer.id)

  const reviewSummary =
    reviewCount > 0
      ? `${averageRating.toFixed(1)} out of 5 (${reviewCount} review${reviewCount === 1 ? '' : 's'})`
      : 'No reviews yet'

  const content = `
    <div class="map-infowindow">
      <h3>${escapeHtml(carer.name || 'Carer')}</h3>
      <p>${escapeHtml(reviewSummary)}</p>
      ${carer.address ? `<p class="map-infowindow__address">${escapeHtml(carer.address)}</p>` : ''}
    </div>
  `

  infoWindowInstance.setContent(content)
  infoWindowInstance.open({ map: mapInstance.value, anchor: marker })
}

const refreshCarerMarkers = () => {
  if (!mapInstance.value || !googleMapsApi.value) {
    return
  }

  const activeIds = new Set()

  carersWithLocations.value.forEach((carer) => {
    const id = carer.id
    if (!id) return

    const position = { lat: carer.location.lat, lng: carer.location.lng }
    activeIds.add(id)

    if (!markerInstances.has(id)) {
      const marker = new googleMapsApi.value.Marker({
        map: mapInstance.value,
        position,
        title: carer.name || 'Carer',
      })

      marker.addListener('click', () => {
        selectedCarerId.value = id
        directionsError.value = ''
        if (directionsRenderer) {
          directionsRenderer.set('directions', null)
        }
        openInfoWindow(carer, marker)
      })

      markerInstances.set(id, marker)
      return
    }

    markerInstances.get(id).setPosition(position)
  })

  markerInstances.forEach((marker, id) => {
    if (!activeIds.has(id)) {
      marker.setMap(null)
      markerInstances.delete(id)
    }
  })

  if (!hasCenteredOnCarers && carersWithLocations.value.length > 0) {
    fitMapToVisibleLocations({ includeUser: Boolean(userLocation.value) })
    hasCenteredOnCarers = true
  }
}

const initialiseDirections = () => {
  if (!googleMapsApi.value || !mapInstance.value) {
    return
  }

  if (!directionsService) {
    directionsService = new googleMapsApi.value.DirectionsService()
  }

  if (!directionsRenderer) {
    directionsRenderer = new googleMapsApi.value.DirectionsRenderer({
      map: mapInstance.value,
      suppressMarkers: false,
    })
  }
}

const initialiseMap = async () => {
  mapLoading.value = true
  mapError.value = ''

  try {
    const google = await loadGoogleMaps(['places'])
    googleMapsApi.value = google

    if (!mapElementRef.value) {
      throw new Error('The map container is not available.')
    }

    mapInstance.value = new google.Map(mapElementRef.value, {
      center: { lat: 51.5074, lng: -0.1278 },
      zoom: 11,
      mapTypeControl: false,
      fullscreenControl: false,
      streetViewControl: false,
    })

    initialiseDirections()
    refreshCarerMarkers()
    updateUserMarker()
  } catch (error) {
    mapError.value = error?.message || 'We were unable to load the map. Please try again later.'
  } finally {
    mapLoading.value = false
  }
}

const locateUser = async ({ force = false } = {}) => {
  if (userLocation.value && !force) {
    locationLoading.value = false
    return
  }

  locationLoading.value = true
  locationError.value = ''

  let location = null
  const errors = []

  try {
    location = await attemptBrowserGeolocation()
  } catch (error) {
    errors.push(describeGeolocationError(error))
  }

  if (!location && userAddress.value && googleMapsApi.value) {
    try {
      location = await geocodeAddress(userAddress.value)
    } catch (error) {
      errors.push(error?.message || 'We could not use your saved address to find you on the map.')
    }
  }

  if (location) {
    userLocation.value = location
    updateUserMarker()

    if (!hasCenteredOnUser && mapInstance.value) {
      fitMapToVisibleLocations({ includeUser: true })
      hasCenteredOnUser = true
    }

    locationError.value = ''
  } else if (errors.length > 0) {
    locationError.value = errors.join(' ')
  } else {
    locationError.value = 'We could not determine your location.'
  }

  locationLoading.value = false
}

const loadUserAddress = async () => {
  userAddress.value = ''

  if (!db || !firebaseUser.value?.uid) {
    return
  }

  try {
    const userDoc = await getDoc(doc(db, 'users', firebaseUser.value.uid))
    if (userDoc.exists()) {
      const data = userDoc.data() || {}
      userAddress.value =
        typeof data.address === 'string' && data.address.trim() ? data.address.trim() : ''
    }
  } catch (error) {
    console.error('Failed to load the user address for the support map.', error)
  }
}

const handleGetDirections = async () => {
  if (!selectedCarer.value) {
    return
  }

  if (!directionsService || !directionsRenderer || !googleMapsApi.value) {
    directionsError.value = 'Directions are unavailable right now. Please try again later.'
    return
  }

  const origin = userAddress.value?.trim() ? userAddress.value.trim() : userLocation.value
  const destinationAddress = selectedCarer.value.address?.trim()
  const destination = destinationAddress && destinationAddress.length > 0
    ? destinationAddress
    : selectedCarer.value.location

  if (!origin) {
    directionsError.value = 'We need your location or address to calculate directions.'
    return
  }

  if (!destination) {
    directionsError.value = 'We could not determine this carer\'s location for directions.'
    return
  }

  directionsError.value = ''
  directionsLoading.value = true

  directionsService.route(
    {
      origin,
      destination,
      travelMode: googleMapsApi.value.TravelMode.DRIVING,
      provideRouteAlternatives: false,
    },
    (result, status) => {
      directionsLoading.value = false

      if (status === 'OK' && result) {
        directionsRenderer.setDirections(result)
        return
      }

      directionsError.value =
        status === 'ZERO_RESULTS'
          ? 'No driving route could be found. Try a different travel mode.'
          : 'We could not calculate directions. Please try again later.'
    },
  )
}

const clearDirections = () => {
  if (directionsRenderer) {
    directionsRenderer.set('directions', null)
  }
}

watch(
  () => carersWithLocations.value,
  () => {
    refreshCarerMarkers()
  },
  { deep: true },
)

watch(
  () => userLocation.value,
  () => {
    updateUserMarker()

    if (userLocation.value && mapInstance.value && !hasCenteredOnUser) {
      fitMapToVisibleLocations({ includeUser: true })
      hasCenteredOnUser = true
    }
  },
)

watch(
  () => selectedCarerId.value,
  () => {
    directionsError.value = ''
    clearDirections()

    if (!selectedCarerId.value && infoWindowInstance) {
      infoWindowInstance.close()
    }
  },
)

watch(
  () => firebaseUser.value?.uid,
  () => {
    loadUserAddress()
  },
  { immediate: true },
)

watch(
  () => userAddress.value,
  (address) => {
    if (address && googleMapsApi.value && !userLocation.value) {
      locateUser({ force: true })
    }
  },
)

onMounted(async () => {
  carersStore.fetchCarers()
  await initialiseMap()
  await locateUser()
})

onUnmounted(() => {
  markerInstances.forEach((marker) => {
    marker.setMap(null)
  })
  markerInstances.clear()

  if (userMarkerInstance) {
    userMarkerInstance.setMap(null)
    userMarkerInstance = null
  }

  if (directionsRenderer) {
    directionsRenderer.setMap(null)
    directionsRenderer = null
  }
})
</script>

<template>
  <section class="support-map">
    <header class="support-map__header">
      <h1>Find Support</h1>
      <p>
        Explore carers near you on the interactive map. Select a carer to learn more and get
        driving directions from your location.
      </p>
    </header>

    <div class="support-map__map-wrapper" :class="{ 'support-map__map-wrapper--loading': mapLoading }">
      <div ref="mapElementRef" class="support-map__map" role="presentation">
        <div v-if="mapLoading" class="support-map__map-loading">
          <span>Loading map&hellip;</span>
        </div>
      </div>
    </div>

    <div v-if="mapError" class="support-map__status support-map__status--error">
      {{ mapError }}
    </div>

    <div v-else class="support-map__panel">
      <div v-if="locationLoading" class="support-map__status">
        Determining your location&hellip;
      </div>
      <div v-else-if="locationError" class="support-map__status support-map__status--warning">
        {{ locationError }}
      </div>
      <div v-else-if="userAddress" class="support-map__status support-map__status--success">
        Using your saved address to calculate directions.
      </div>
      <div v-else-if="userLocation" class="support-map__status support-map__status--success">
        Showing your current location on the map.
      </div>

      <div v-if="selectedCarer" class="support-map__selection">
        <h2>{{ selectedCarer.name }}</h2>
        <p v-if="selectedCarer.address" class="support-map__selection-address">
          {{ selectedCarer.address }}
        </p>
        <p v-if="selectedCarerRating && selectedCarerRating.count > 0" class="support-map__selection-rating">
          Average rating: {{ selectedCarerRating.average?.toFixed(1) }}
          ({{ selectedCarerRating.count }} review{{ selectedCarerRating.count === 1 ? '' : 's' }})
        </p>
        <p v-else class="support-map__selection-rating">No reviews yet.</p>

        <div class="support-map__actions">
          <button
            type="button"
            class="support-map__directions-button"
            :disabled="directionsLoading"
            @click="handleGetDirections"
          >
            {{ directionsLoading ? 'Calculating directions…' : 'Get directions' }}
          </button>
          <button type="button" class="support-map__clear-button" @click="selectedCarerId = ''">
            Clear selection
          </button>
        </div>

        <p v-if="directionsError" class="support-map__status support-map__status--error">
          {{ directionsError }}
        </p>
      </div>
      <div v-else class="support-map__prompt">
        Select a carer on the map to view details and get directions.
      </div>
    </div>

    <div v-if="!carersWithLocations.length && !carersStore.loading" class="support-map__status">
      We could not find carers with map locations. Please check back soon.
    </div>
  </section>
</template>

<style scoped>
.support-map {
  display: grid;
  gap: 2rem;
}

.support-map__header {
  display: grid;
  gap: 0.5rem;
  text-align: center;
}

.support-map__header h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 2.5rem);
}

.support-map__header p {
  margin: 0 auto;
  max-width: 48rem;
  color: var(--p-text-muted-color);
}

.support-map__map-wrapper {
  position: relative;
  border-radius: 1.25rem;
  overflow: hidden;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
  min-height: 420px;
  background: linear-gradient(180deg, rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.05));
}

.support-map__map-wrapper--loading {
  display: flex;
  align-items: center;
  justify-content: center;
}

.support-map__map {
  width: 100%;
  height: 100%;
  min-height: 420px;
}

.support-map__map-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(248, 250, 252, 0.85);
  color: var(--p-text-color);
  font-weight: 600;
}

.support-map__panel {
  background: var(--p-surface-card);
  border-radius: 1.25rem;
  padding: 1.75rem;
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.1);
  display: grid;
  gap: 1.25rem;
}

.support-map__selection {
  display: grid;
  gap: 0.75rem;
}

.support-map__selection h2 {
  margin: 0;
}

.support-map__selection-address {
  margin: 0;
  color: var(--p-text-muted-color);
}

.support-map__selection-rating {
  margin: 0;
  color: var(--p-text-color);
}

.support-map__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.support-map__directions-button,
.support-map__clear-button {
  border: none;
  border-radius: 999px;
  padding: 0.75rem 1.5rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease;
}

.support-map__directions-button {
  background: linear-gradient(135deg, #2563eb, #3b82f6);
  color: #fff;
  box-shadow: 0 10px 20px rgba(37, 99, 235, 0.2);
}

.support-map__directions-button:disabled {
  opacity: 0.7;
  cursor: progress;
  box-shadow: none;
}

.support-map__directions-button:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 26px rgba(37, 99, 235, 0.25);
}

.support-map__clear-button {
  background: rgba(148, 163, 184, 0.2);
  color: var(--p-text-color);
}

.support-map__clear-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgba(148, 163, 184, 0.2);
}

.support-map__prompt {
  color: var(--p-text-muted-color);
}

.support-map__status {
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
  background: rgba(148, 163, 184, 0.12);
  color: var(--p-text-muted-color);
  margin: 0;
}

.support-map__status--success {
  background: rgba(16, 185, 129, 0.12);
  color: #047857;
}

.support-map__status--warning {
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;
}

.support-map__status--error {
  background: rgba(239, 68, 68, 0.12);
  color: #b91c1c;
}

.map-infowindow {
  display: grid;
  gap: 0.25rem;
  font-family: inherit;
}

.map-infowindow h3 {
  margin: 0;
  font-size: 1rem;
}

.map-infowindow p {
  margin: 0;
  font-size: 0.9rem;
  color: #334155;
}

.map-infowindow__address {
  color: #475569;
}

@media (max-width: 768px) {
  .support-map__panel {
    padding: 1.25rem;
  }

  .support-map__actions {
    flex-direction: column;
    align-items: stretch;
  }

  .support-map__directions-button,
  .support-map__clear-button {
    width: 100%;
    justify-content: center;
  }
}
</style> 
