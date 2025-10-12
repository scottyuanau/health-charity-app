import 'bootstrap/dist/css/bootstrap.min.css'
import './assets/theme.css'
import 'primeicons/primeicons.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'
import ToastService from 'primevue/toastservice'

import App from './App.vue'
import router from './router'

const themeStorageKey = 'app-theme'
const isClient = typeof window !== 'undefined'
const storedTheme = isClient ? window.localStorage.getItem(themeStorageKey) : null
const prefersDark =
  isClient && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false
const initialIsDark = storedTheme ? storedTheme === 'dark' : prefersDark

if (isClient) {
  const body = document.body
  body.classList.toggle('app-dark', initialIsDark)
  body.classList.toggle('app-light', storedTheme === 'light')
}

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: 'body.app-dark',
    },
  },
})
app.use(ToastService)

app.mount('#app')
