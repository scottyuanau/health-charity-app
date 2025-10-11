const scriptState = {
  promise: null,
  loaded: false,
  requestedLibraries: new Set(),
  loadedLibraries: new Set(),
}

const buildScriptUrl = () => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAP_API_KEY

  if (!apiKey) {
    throw new Error('Google Maps API key is not configured. Set VITE_GOOGLE_MAP_API_KEY in your environment.')
  }

  const url = new URL('https://maps.googleapis.com/maps/api/js')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('v', 'weekly')

  if (scriptState.requestedLibraries.size > 0) {
    url.searchParams.set('libraries', [...scriptState.requestedLibraries].join(','))
  }

  return url.toString()
}

export const loadGoogleMaps = (libraries = []) => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only be loaded in a browser environment.'))
  }

  const normalizedLibraries = Array.isArray(libraries)
    ? libraries.filter((library) => typeof library === 'string' && library.trim())
    : []

  normalizedLibraries.forEach((library) => {
    scriptState.requestedLibraries.add(library.trim())
  })

  if (window.google?.maps) {
    scriptState.loaded = true

    const missingLibraries = normalizedLibraries.filter(
      (library) => !scriptState.loadedLibraries.has(library.trim()),
    )

    if (missingLibraries.length > 0) {
      console.warn(
        `Google Maps libraries could not be added after initial load: ${missingLibraries.join(', ')}`,
      )
    }

    return Promise.resolve(window.google.maps)
  }

  if (scriptState.promise) {
    return scriptState.promise
  }

  try {
    const src = buildScriptUrl()

    scriptState.promise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = src
      script.async = true
      script.defer = true

      script.onload = () => {
        if (window.google?.maps) {
          scriptState.loaded = true
          scriptState.loadedLibraries = new Set(scriptState.requestedLibraries)
          resolve(window.google.maps)
        } else {
          scriptState.promise = null
          reject(new Error('Google Maps script loaded, but the API is unavailable.'))
        }
      }

      script.onerror = () => {
        scriptState.promise = null
        reject(new Error('Failed to load the Google Maps script.'))
      }

      document.head.appendChild(script)
    })
  } catch (error) {
    return Promise.reject(error)
  }

  return scriptState.promise
}
