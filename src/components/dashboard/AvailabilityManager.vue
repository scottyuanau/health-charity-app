<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import DatePicker from 'primevue/datepicker'
import InputSwitch from 'primevue/inputswitch'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { doc, getDoc, setDoc } from 'firebase/firestore'

import { useAuth } from '@/composables/auth'
import { db } from '@/firebase'

const { state } = useAuth()

const selectedDates = ref([])
const isAvailable = ref(true)
const saving = ref(false)
const loading = ref(false)
const loadError = ref('')
const saveError = ref('')
const successMessage = ref('')
const availabilityMap = ref(new Map())

const firebaseUser = computed(() => {
  const user = state.user
  if (user?.provider === 'firebase' && user.uid) {
    return user
  }
  return null
})

const canManageAvailability = computed(() => Boolean(db) && Boolean(firebaseUser.value))

const hasSelection = computed(() => selectedDates.value.length > 0)

const availabilityList = computed(() => {
  return Array.from(availabilityMap.value.entries())
    .map(([date, available]) => ({ date, available }))
    .sort((a, b) => a.date.localeCompare(b.date))
})

const formatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

const toDateKey = (input) => {
  if (!input) return null
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed
    }
  }
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return null
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const fromDateKey = (key) => {
  if (!key || typeof key !== 'string') return null
  const [yearStr, monthStr, dayStr] = key.split('-')
  const year = Number.parseInt(yearStr, 10)
  const month = Number.parseInt(monthStr, 10)
  const day = Number.parseInt(dayStr, 10)

  if (!year || !month || !day) return null

  return new Date(year, month - 1, day)
}

const formattedSelection = computed(() =>
  selectedDates.value
    .map((date) => toDateKey(date))
    .filter((value) => typeof value === 'string'),
)

const formatDisplayDate = (key) => {
  const date = fromDateKey(key)
  if (date instanceof Date && !Number.isNaN(date.getTime())) {
    return formatter.format(date)
  }
  return key
}

const resetFeedback = () => {
  saveError.value = ''
  successMessage.value = ''
}

const loadAvailability = async () => {
  if (!canManageAvailability.value) return

  loading.value = true
  loadError.value = ''

  try {
    const userDocRef = doc(db, 'users', firebaseUser.value.uid)
    const snapshot = await getDoc(userDocRef)

    if (snapshot.exists()) {
      const data = snapshot.data()
      const entries = Array.isArray(data?.availability) ? data.availability : []
      const nextMap = new Map()

      entries.forEach((item) => {
        const dateKey = toDateKey(item?.date)
        if (!dateKey) return
        nextMap.set(dateKey, Boolean(item?.available))
      })

      availabilityMap.value = nextMap

      const availableDates = Array.from(nextMap.entries())
        .filter(([, available]) => available)
        .map(([dateKey]) => fromDateKey(dateKey))
        .filter((value) => value instanceof Date && !Number.isNaN(value.getTime()))

      selectedDates.value = availableDates
      isAvailable.value = true
    } else {
      availabilityMap.value = new Map()
      selectedDates.value = []
    }
  } catch (error) {
    console.error('Failed to load availability', error)
    loadError.value = 'We were unable to load your availability. Please try again later.'
  } finally {
    loading.value = false
  }
}

const saveAvailability = async () => {
  if (!canManageAvailability.value || !hasSelection.value) return

  saving.value = true
  resetFeedback()

  try {
    const nextMap = new Map(availabilityMap.value)
    formattedSelection.value.forEach((dateKey) => {
      nextMap.set(dateKey, isAvailable.value)
    })

    const payload = Array.from(nextMap.entries()).map(([date, available]) => ({
      date,
      available,
    }))

    const userDocRef = doc(db, 'users', firebaseUser.value.uid)
    await setDoc(userDocRef, { availability: payload }, { merge: true })

    availabilityMap.value = nextMap
    successMessage.value = 'Availability saved successfully.'
    selectedDates.value = []
  } catch (error) {
    console.error('Failed to save availability', error)
    saveError.value = 'We could not save your availability. Please try again.'
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  if (canManageAvailability.value) {
    loadAvailability()
  }
})

watch(
  () => firebaseUser.value?.uid,
  (newUid, oldUid) => {
    if (newUid && newUid !== oldUid) {
      loadAvailability()
    }

    if (!newUid) {
      availabilityMap.value = new Map()
      selectedDates.value = []
    }
  },
)

watch(
  [selectedDates, isAvailable],
  () => {
    if (!saving.value) {
      resetFeedback()
    }
  },
  { deep: true },
)
</script>

<template>
  <div class="availability-manager">
    <div v-if="!db" class="availability-manager__notice">
      <Message severity="warn">Firebase has not been configured. Please add your Firebase credentials.</Message>
    </div>

    <div v-else-if="!firebaseUser" class="availability-manager__notice">
      <Message severity="info">Sign in with your Firebase account to manage your availability.</Message>
    </div>

    <div v-else class="availability-manager__content">
      <div class="availability-manager__feedback" v-if="loadError">
        <Message severity="error">{{ loadError }}</Message>
      </div>

      <div class="availability-manager__controls">
        <div class="availability-manager__calendar">
          <label class="availability-manager__label" for="availability-calendar">Select dates</label>
          <DatePicker
            id="availability-calendar"
            v-model="selectedDates"
            selectionMode="multiple"
            :manualInput="false"
            inline
            :showOtherMonths="true"
            :disabled="loading || saving"
          />
        </div>

        <div class="availability-manager__toggle">
          <span class="availability-manager__label">Availability status</span>
          <div class="availability-manager__toggle-control">
            <span class="availability-manager__toggle-text">Unavailable</span>
            <InputSwitch v-model="isAvailable" :disabled="loading || saving" />
            <span class="availability-manager__toggle-text">Available</span>
          </div>
        </div>
      </div>

      <div class="availability-manager__actions">
        <Button
          label="Save availability"
          icon="pi pi-save"
          :disabled="!hasSelection || saving || loading"
          :loading="saving"
          @click="saveAvailability"
        />
        <span class="availability-manager__hint" v-if="!hasSelection">
          Select at least one date to enable saving.
        </span>
      </div>

      <div class="availability-manager__feedback" v-if="saveError">
        <Message severity="error">{{ saveError }}</Message>
      </div>

      <div class="availability-manager__feedback" v-if="successMessage">
        <Message severity="success">{{ successMessage }}</Message>
      </div>

      <div class="availability-manager__summary" v-if="availabilityList.length">
        <h3 class="availability-manager__summary-heading">Saved availability</h3>
        <ul class="availability-manager__summary-list">
          <li v-for="record in availabilityList" :key="record.date" class="availability-manager__summary-item">
            <span>{{ formatDisplayDate(record.date) }}</span>
            <Tag :severity="record.available ? 'success' : 'danger'" :value="record.available ? 'Available' : 'Unavailable'" />
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.availability-manager {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.availability-manager__notice {
  max-width: 32rem;
}

.availability-manager__content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.availability-manager__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
}

.availability-manager__calendar {
  flex: 1 1 18rem;
  min-width: 18rem;
}

.availability-manager__label {
  display: block;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.availability-manager__toggle {
  align-self: center;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 12rem;
}

.availability-manager__toggle-control {
  align-items: center;
  display: inline-flex;
  gap: 0.75rem;
}

.availability-manager__toggle-text {
  font-weight: 500;
}

.availability-manager__actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.availability-manager__hint {
  color: var(--p-surface-400, #6c757d);
  font-size: 0.9rem;
}

.availability-manager__summary {
  border-top: 1px solid var(--p-surface-200, #dee2e6);
  padding-top: 1rem;
}

.availability-manager__summary-heading {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 0.75rem;
}

.availability-manager__summary-list {
  display: grid;
  gap: 0.75rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.availability-manager__summary-item {
  align-items: center;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}
</style>
