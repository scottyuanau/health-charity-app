<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import DatePicker from 'primevue/datepicker'
import Dropdown from 'primevue/dropdown'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Message from 'primevue/message'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore'

import { useAuth } from '@/composables/auth'
import { db } from '@/firebase'

const { state } = useAuth()

const selectedDate = ref(null)
const selectedCarerId = ref(null)
const bookingSaving = ref(false)
const bookingError = ref('')
const bookingSuccess = ref('')
const loadingCarers = ref(false)
const carersLoadError = ref('')
const carers = ref([])

const bookingsOnSelectedDate = ref([])
let bookingsRequestId = 0

const beneficiaryBookings = ref([])
const carerBookings = ref([])
const beneficiaryActionError = ref('')
const beneficiaryActionSuccess = ref('')
const carerActionError = ref('')
const carerActionSuccess = ref('')
const cancelingIds = ref([])

const userProfile = ref(null)
const profileLoading = ref(false)
const profileError = ref('')

const beneficiaryUnsubscribe = ref(null)
const carerUnsubscribe = ref(null)

const firebaseUser = computed(() => {
  const user = state.user
  if (user?.provider === 'firebase' && user.uid) {
    return user
  }
  return null
})

const hasFirebaseAccess = computed(() => Boolean(db) && Boolean(firebaseUser.value))

const userRoles = computed(() => {
  const roles = userProfile.value?.roles
  return Array.isArray(roles) ? roles : []
})

const isAdminUser = computed(() => {
  if (userRoles.value.includes('admin')) return true
  const username = state.user?.username
  return typeof username === 'string' && username.trim().toLowerCase() === 'admin'
})

const isBeneficiary = computed(() => userRoles.value.includes('beneficiary'))
const isCarer = computed(() => userRoles.value.includes('carer'))

const showNewBookingSection = computed(
  () => hasFirebaseAccess.value && (isBeneficiary.value || isAdminUser.value),
)
const showBeneficiaryBookings = computed(
  () => hasFirebaseAccess.value && (isBeneficiary.value || isAdminUser.value),
)
const showCarerBookings = computed(
  () => hasFirebaseAccess.value && (isCarer.value || isAdminUser.value),
)

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

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

const formatDisplayDate = (key) => {
  const date = fromDateKey(key)
  if (date instanceof Date && !Number.isNaN(date.getTime())) {
    return dateFormatter.format(date)
  }
  return key
}

const toCsvValue = (value) => {
  if (value === undefined || value === null) return ''
  const stringValue = value instanceof Date ? value.toISOString() : String(value)
  const escaped = stringValue.replace(/"/g, '""')
  if (/[",\n]/u.test(escaped)) {
    return `"${escaped}"`
  }
  return escaped
}

const createCsvContent = (records, columns) => {
  if (!Array.isArray(columns) || columns.length === 0) return null

  const safeRecords = Array.isArray(records) ? records : []

  const headerRow = columns.map((column) => toCsvValue(column.header)).join(',')

  const dataRows = safeRecords.map((record) =>
    columns
      .map((column) => {
        const rawValue =
          typeof column.formatter === 'function'
            ? column.formatter(record[column.accessor], record)
            : record[column.accessor]
        return toCsvValue(rawValue)
      })
      .join(','),
  )

  return [headerRow, ...dataRows].join('\r\n')
}

const downloadCsvFile = (content, filename) => {
  if (!content || typeof window === 'undefined' || typeof document === 'undefined') return

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  link.style.display = 'none'

  document.body.appendChild(link)
  link.click()

  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const handleDownloadBeneficiaryBookings = () => {
  const csvContent = createCsvContent(beneficiaryBookings.value, [
    { header: 'Carer name', accessor: 'carerName' },
    {
      header: 'Booked date',
      accessor: 'date',
      formatter: (value) => formatDisplayDate(value),
    },
    {
      header: 'Pick up location',
      accessor: 'pickUpLocation',
      formatter: (value) => value || 'Not provided',
    },
  ])

  downloadCsvFile(csvContent, 'my-bookings-with-carers.csv')
}

const handleDownloadCarerBookings = () => {
  const csvContent = createCsvContent(carerBookings.value, [
    { header: 'Beneficiary name', accessor: 'beneficiaryName' },
    {
      header: 'Booked date',
      accessor: 'date',
      formatter: (value) => formatDisplayDate(value),
    },
  ])

  downloadCsvFile(csvContent, 'my-bookings-with-beneficiaries.csv')
}

const parseAvailability = (entries) => {
  const availableDates = new Set()
  if (!Array.isArray(entries)) return availableDates

  entries.forEach((item) => {
    if (!item) return
    const dateKey = toDateKey(item.date)
    if (!dateKey) return
    if (item.available) {
      availableDates.add(dateKey)
    }
  })

  return availableDates
}

const loadCarers = async () => {
  if (!db) return

  loadingCarers.value = true
  carersLoadError.value = ''

  try {
    const carersQuery = query(collection(db, 'users'), where('roles', 'array-contains', 'carer'))
    const snapshot = await getDocs(carersQuery)

    const records = snapshot.docs.map((snapshotDoc) => {
      const data = snapshotDoc.data()
      return {
        id: snapshotDoc.id,
        name: typeof data?.username === 'string' && data.username.trim().length
          ? data.username.trim()
          : data?.email || 'Carer',
        address: typeof data?.address === 'string' ? data.address.trim() : '',
        availability: parseAvailability(data?.availability),
      }
    })

    carers.value = records
  } catch (error) {
    console.error('Failed to load carers', error)
    carersLoadError.value = 'We were unable to load carers. Please try again later.'
    carers.value = []
  } finally {
    loadingCarers.value = false
  }
}

const availableCarers = computed(() => {
  if (!selectedDate.value) return []
  const dateKey = toDateKey(selectedDate.value)
  if (!dateKey) return []

  if (beneficiaryHasBookingOnSelectedDate.value) {
    return []
  }

  const bookedCarerIds = new Set()
  bookingsOnSelectedDate.value.forEach((booking) => {
    if (booking?.carerId) {
      bookedCarerIds.add(booking.carerId)
    }
  })

  return carers.value.filter(
    (carer) => carer.availability.has(dateKey) && !bookedCarerIds.has(carer.id),
  )
})

const availableCarerOptions = computed(() =>
  availableCarers.value.map((carer) => ({
    label: carer.address ? `${carer.name} — ${carer.address}` : carer.name,
    value: carer.id,
  })),
)

const selectedCarer = computed(() => carers.value.find((carer) => carer.id === selectedCarerId.value) || null)

const beneficiaryHasBookingOnSelectedDate = computed(
  () =>
    Boolean(firebaseUser.value?.uid) &&
    bookingsOnSelectedDate.value.some((booking) => booking.beneficiaryId === firebaseUser.value.uid),
)

const beneficiaryDisplayName = computed(() => {
  if (typeof userProfile.value?.username === 'string' && userProfile.value.username.trim()) {
    return userProfile.value.username.trim()
  }
  const username = state.user?.username
  if (typeof username === 'string' && username.trim()) {
    return username.trim()
  }
  const email = state.user?.email
  if (typeof email === 'string' && email.trim()) {
    const [namePart] = email.split('@')
    if (namePart) return namePart
    return email
  }
  return 'Beneficiary'
})

const resetBookingFeedback = () => {
  bookingError.value = ''
  bookingSuccess.value = ''
}

const loadBookingsForSelectedDate = async (dateKey = toDateKey(selectedDate.value)) => {
  if (!db || !dateKey) {
    bookingsRequestId += 1
    bookingsOnSelectedDate.value = []
    return
  }

  const requestId = ++bookingsRequestId

  try {
    const bookingsQuery = query(collection(db, 'bookings'), where('date', '==', dateKey))
    const snapshot = await getDocs(bookingsQuery)

    if (requestId !== bookingsRequestId) {
      return
    }

    bookingsOnSelectedDate.value = snapshot.docs.map((snapshotDoc) => ({
      id: snapshotDoc.id,
      ...snapshotDoc.data(),
    }))
  } catch (error) {
    if (requestId === bookingsRequestId) {
      console.error('Failed to load bookings for selected date', error)
      bookingsOnSelectedDate.value = []
    }
  }
}

const checkExistingBookingConflicts = async ({ carerId, beneficiaryId, dateKey }) => {
  if (!db || !carerId || !beneficiaryId || !dateKey) {
    return { carerConflict: false, beneficiaryConflict: false }
  }

  const carerConflictQuery = query(
    collection(db, 'bookings'),
    where('carerId', '==', carerId),
    where('date', '==', dateKey),
    limit(1),
  )

  const beneficiaryConflictQuery = query(
    collection(db, 'bookings'),
    where('beneficiaryId', '==', beneficiaryId),
    where('date', '==', dateKey),
    limit(1),
  )

  const [carerSnapshot, beneficiarySnapshot] = await Promise.all([
    getDocs(carerConflictQuery),
    getDocs(beneficiaryConflictQuery),
  ])

  return {
    carerConflict: !carerSnapshot.empty,
    beneficiaryConflict: !beneficiarySnapshot.empty,
  }
}

const handleCreateBooking = async () => {
  if (!db || !firebaseUser.value?.uid) return
  if (!selectedDate.value || !selectedCarer.value) {
    bookingError.value = 'Select a booking date and an available carer before submitting.'
    bookingSuccess.value = ''
    return
  }

  const dateKey = toDateKey(selectedDate.value)
  if (!dateKey) {
    bookingError.value = 'The selected date is invalid. Please choose another date.'
    bookingSuccess.value = ''
    return
  }

  if (beneficiaryHasBookingOnSelectedDate.value) {
    bookingError.value = 'You already have a booking on this date. Cancel it before creating a new one.'
    bookingSuccess.value = ''
    return
  }

  bookingSaving.value = true
  bookingError.value = ''
  bookingSuccess.value = ''

  try {
    const { carerConflict, beneficiaryConflict } = await checkExistingBookingConflicts({
      carerId: selectedCarer.value.id,
      beneficiaryId: firebaseUser.value.uid,
      dateKey,
    })

    if (carerConflict) {
      bookingError.value = `${selectedCarer.value.name} is no longer available on ${formatDisplayDate(
        dateKey,
      )}. Please choose another date or carer.`
      bookingSuccess.value = ''
      await loadBookingsForSelectedDate(dateKey)
      return
    }

    if (beneficiaryConflict) {
      bookingError.value = 'You already have a booking on this date. Cancel it before creating a new one.'
      bookingSuccess.value = ''
      await loadBookingsForSelectedDate(dateKey)
      return
    }

    await addDoc(collection(db, 'bookings'), {
      beneficiaryId: firebaseUser.value.uid,
      beneficiaryName: beneficiaryDisplayName.value,
      carerId: selectedCarer.value.id,
      carerName: selectedCarer.value.name,
      pickUpLocation: selectedCarer.value.address || '',
      date: dateKey,
      createdAt: serverTimestamp(),
    })

    bookingSuccess.value = `Booking confirmed with ${selectedCarer.value.name} on ${formatDisplayDate(dateKey)}.`
    selectedCarerId.value = null
    await loadBookingsForSelectedDate(dateKey)
  } catch (error) {
    console.error('Failed to create booking', error)
    bookingError.value = 'We could not complete your booking. Please try again.'
  } finally {
    bookingSaving.value = false
  }
}

const unsubscribeFromBookings = () => {
  if (typeof beneficiaryUnsubscribe.value === 'function') {
    beneficiaryUnsubscribe.value()
  }
  if (typeof carerUnsubscribe.value === 'function') {
    carerUnsubscribe.value()
  }
  beneficiaryUnsubscribe.value = null
  carerUnsubscribe.value = null
}

const subscribeToBookings = () => {
  unsubscribeFromBookings()

  if (!db || !firebaseUser.value?.uid) {
    beneficiaryBookings.value = []
    carerBookings.value = []
    return
  }

  if (showBeneficiaryBookings.value) {
    const beneficiaryQuery = query(
      collection(db, 'bookings'),
      where('beneficiaryId', '==', firebaseUser.value.uid),
    )

    beneficiaryUnsubscribe.value = onSnapshot(
      beneficiaryQuery,
      (snapshot) => {
        beneficiaryBookings.value = snapshot.docs
          .map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() }))
          .sort((a, b) => a.date.localeCompare(b.date))
      },
      (error) => {
        console.error('Failed to load beneficiary bookings', error)
        beneficiaryActionError.value = 'We were unable to load your bookings. Please refresh the page.'
      },
    )
  } else {
    beneficiaryBookings.value = []
  }

  if (showCarerBookings.value) {
    const carerQuery = query(
      collection(db, 'bookings'),
      where('carerId', '==', firebaseUser.value.uid),
    )

    carerUnsubscribe.value = onSnapshot(
      carerQuery,
      (snapshot) => {
        carerBookings.value = snapshot.docs
          .map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() }))
          .sort((a, b) => a.date.localeCompare(b.date))
      },
      (error) => {
        console.error('Failed to load carer bookings', error)
        carerActionError.value = 'We were unable to load your bookings. Please refresh the page.'
      },
    )
  } else {
    carerBookings.value = []
  }
}

const removeCancelingId = (id) => {
  cancelingIds.value = cancelingIds.value.filter((existingId) => existingId !== id)
}

const handleCancelBooking = async (booking, perspective) => {
  if (!db || !booking?.id) return
  if (cancelingIds.value.includes(booking.id)) return

  cancelingIds.value = [...cancelingIds.value, booking.id]

  if (perspective === 'beneficiary') {
    beneficiaryActionError.value = ''
    beneficiaryActionSuccess.value = ''
  } else {
    carerActionError.value = ''
    carerActionSuccess.value = ''
  }

  try {
    const bookingRef = doc(db, 'bookings', booking.id)
    await deleteDoc(bookingRef)

    if (perspective === 'beneficiary') {
      beneficiaryActionSuccess.value = 'Booking cancelled successfully.'
    } else {
      carerActionSuccess.value = 'Booking cancelled successfully.'
    }
  } catch (error) {
    console.error('Failed to cancel booking', error)
    if (perspective === 'beneficiary') {
      beneficiaryActionError.value = 'We could not cancel this booking. Please try again.'
    } else {
      carerActionError.value = 'We could not cancel this booking. Please try again.'
    }
  } finally {
    removeCancelingId(booking.id)
  }
}

const loadUserProfile = async () => {
  if (!db || !firebaseUser.value?.uid) {
    userProfile.value = null
    return
  }

  profileLoading.value = true
  profileError.value = ''

  try {
    const userDocRef = doc(db, 'users', firebaseUser.value.uid)
    const snapshot = await getDoc(userDocRef)

    if (snapshot.exists()) {
      userProfile.value = snapshot.data()
    } else {
      userProfile.value = null
    }
  } catch (error) {
    console.error('Failed to load user profile', error)
    profileError.value = 'We were unable to load your profile details.'
    userProfile.value = null
  } finally {
    profileLoading.value = false
  }
}

onMounted(() => {
  if (hasFirebaseAccess.value) {
    loadUserProfile()
  }
})

watch(
  () => firebaseUser.value?.uid,
  (newUid, oldUid) => {
    if (newUid && newUid !== oldUid) {
      loadUserProfile()
    }

    if (!newUid) {
      userProfile.value = null
      beneficiaryBookings.value = []
      carerBookings.value = []
      unsubscribeFromBookings()
    }
  },
)

watch(
  showNewBookingSection,
  (canShow) => {
    if (canShow) {
      loadCarers()
    }
  },
  { immediate: true },
)

watch(
  [showBeneficiaryBookings, showCarerBookings],
  () => {
    subscribeToBookings()
  },
  { immediate: true },
)

watch(
  [selectedDate, showNewBookingSection, () => firebaseUser.value?.uid],
  ([dateValue, canShow]) => {
    if (!canShow || !dateValue) {
      bookingsRequestId += 1
      bookingsOnSelectedDate.value = []
      return
    }

    const dateKey = toDateKey(dateValue)
    if (!dateKey) {
      bookingsRequestId += 1
      bookingsOnSelectedDate.value = []
      return
    }

    loadBookingsForSelectedDate(dateKey)
  },
  { immediate: true },
)

watch(availableCarerOptions, (options) => {
  if (!Array.isArray(options)) return
  if (!options.some((option) => option.value === selectedCarerId.value)) {
    selectedCarerId.value = null
  }
})

watch(beneficiaryHasBookingOnSelectedDate, (hasBooking) => {
  if (hasBooking) {
    selectedCarerId.value = null
  }
})

watch([selectedDate, selectedCarerId], () => {
  if (!bookingSaving.value) {
    resetBookingFeedback()
  }
})

onBeforeUnmount(() => {
  unsubscribeFromBookings()
})
</script>

<template>
  <div class="bookings-manager">
    <div v-if="!db" class="bookings-manager__notice">
      <Message severity="warn">Firebase has not been configured. Please add your Firebase credentials.</Message>
    </div>

    <div v-else>
      <div v-if="!firebaseUser" class="bookings-manager__notice">
        <Message severity="info">Sign in with your Firebase account to manage bookings.</Message>
      </div>

      <div v-else class="bookings-manager__content">
        <div v-if="profileLoading" class="bookings-manager__notice">
          <Message severity="info">Loading your profile details…</Message>
        </div>

        <div v-if="profileError" class="bookings-manager__notice">
          <Message severity="error">{{ profileError }}</Message>
        </div>

        <section v-if="showNewBookingSection" class="bookings-manager__section">
          <header class="bookings-manager__section-header">
            <h2 class="bookings-manager__section-title">Make New Booking</h2>
            <p class="bookings-manager__section-subtitle">
              Choose a date to see carers who are available and request a booking.
            </p>
          </header>

          <div class="bookings-manager__form">
            <div class="bookings-manager__field">
              <label for="booking-date" class="bookings-manager__label">Booking date</label>
              <DatePicker
                id="booking-date"
                v-model="selectedDate"
                :min-date="new Date()"
                :show-other-months="true"
                :manual-input="false"
                show-icon
              />
            </div>

            <div class="bookings-manager__field">
              <label for="booking-carer" class="bookings-manager__label">Available carer</label>
              <Dropdown
                id="booking-carer"
                v-model="selectedCarerId"
                :options="availableCarerOptions"
                option-label="label"
                option-value="value"
                :loading="loadingCarers"
                :disabled="
                  loadingCarers ||
                  !selectedDate ||
                  availableCarerOptions.length === 0 ||
                  beneficiaryHasBookingOnSelectedDate
                "
                placeholder="Select a carer"
                show-clear
              />
              <small
                v-if="
                  selectedDate &&
                  !loadingCarers &&
                  availableCarerOptions.length === 0 &&
                  !beneficiaryHasBookingOnSelectedDate
                "
                class="bookings-manager__hint"
              >
                No carers are available on the selected date. Please choose a different day.
              </small>
              <small
                v-if="beneficiaryHasBookingOnSelectedDate"
                class="bookings-manager__hint bookings-manager__hint--error"
              >
                You already have a booking on this date. Cancel your existing booking to make a new one.
              </small>
              <small v-if="carersLoadError" class="bookings-manager__hint bookings-manager__hint--error">
                {{ carersLoadError }}
              </small>
            </div>
          </div>

          <div class="bookings-manager__actions">
            <Button
              label="Book carer"
              icon="pi pi-calendar-plus"
              :disabled="
                !selectedDate ||
                !selectedCarerId ||
                bookingSaving ||
                beneficiaryHasBookingOnSelectedDate
              "
              :loading="bookingSaving"
              @click="handleCreateBooking"
            />
          </div>

          <div class="bookings-manager__feedback" v-if="bookingError">
            <Message severity="error">{{ bookingError }}</Message>
          </div>

          <div class="bookings-manager__feedback" v-if="bookingSuccess">
            <Message severity="success">{{ bookingSuccess }}</Message>
          </div>
        </section>

        <section v-if="showBeneficiaryBookings" class="bookings-manager__section">
          <header class="bookings-manager__section-header">
            <h2 class="bookings-manager__section-title">Manage Bookings with Carers</h2>
            <p class="bookings-manager__section-subtitle">
              Review your upcoming bookings and cancel if your plans change.
            </p>
          </header>

          <div class="bookings-manager__section-actions">
            <Button
              label="Download bookings CSV"
              icon="pi pi-download"
              :disabled="beneficiaryBookings.length === 0"
              @click="handleDownloadBeneficiaryBookings"
            />
          </div>

          <div class="bookings-manager__feedback" v-if="beneficiaryActionError">
            <Message severity="error">{{ beneficiaryActionError }}</Message>
          </div>

          <div class="bookings-manager__feedback" v-if="beneficiaryActionSuccess">
            <Message severity="success">{{ beneficiaryActionSuccess }}</Message>
          </div>

          <DataTable :value="beneficiaryBookings" data-key="id" responsive-layout="scroll">
            <Column field="carerName" header="Carer name" />
            <Column header="Booked date">
              <template #body="slotProps">
                {{ formatDisplayDate(slotProps.data.date) }}
              </template>
            </Column>
            <Column header="Pick up location">
              <template #body="slotProps">
                {{ slotProps.data.pickUpLocation || 'Not provided' }}
              </template>
            </Column>
            <Column header="Manage booking">
              <template #body="slotProps">
                <Button
                  label="Cancel booking"
                  icon="pi pi-times"
                  severity="danger"
                  text
                  :disabled="cancelingIds.includes(slotProps.data.id)"
                  :loading="cancelingIds.includes(slotProps.data.id)"
                  @click="handleCancelBooking(slotProps.data, 'beneficiary')"
                />
              </template>
            </Column>
          </DataTable>
        </section>

        <section v-if="showCarerBookings" class="bookings-manager__section">
          <header class="bookings-manager__section-header">
            <h2 class="bookings-manager__section-title">Manage Bookings with Beneficiaries</h2>
            <p class="bookings-manager__section-subtitle">
              View who has booked your support and manage those bookings here.
            </p>
          </header>

          <div class="bookings-manager__section-actions">
            <Button
              label="Download bookings CSV"
              icon="pi pi-download"
              :disabled="carerBookings.length === 0"
              @click="handleDownloadCarerBookings"
            />
          </div>

          <div class="bookings-manager__feedback" v-if="carerActionError">
            <Message severity="error">{{ carerActionError }}</Message>
          </div>

          <div class="bookings-manager__feedback" v-if="carerActionSuccess">
            <Message severity="success">{{ carerActionSuccess }}</Message>
          </div>

          <DataTable :value="carerBookings" data-key="id" responsive-layout="scroll">
            <Column field="beneficiaryName" header="Beneficiary name" />
            <Column header="Booked date">
              <template #body="slotProps">
                {{ formatDisplayDate(slotProps.data.date) }}
              </template>
            </Column>
            <Column header="Manage booking">
              <template #body="slotProps">
                <Button
                  label="Cancel booking"
                  icon="pi pi-times"
                  severity="danger"
                  text
                  :disabled="cancelingIds.includes(slotProps.data.id)"
                  :loading="cancelingIds.includes(slotProps.data.id)"
                  @click="handleCancelBooking(slotProps.data, 'carer')"
                />
              </template>
            </Column>
          </DataTable>
        </section>

        <div
          v-if="!showNewBookingSection && !showBeneficiaryBookings && !showCarerBookings && !profileLoading"
          class="bookings-manager__notice"
        >
          <Message severity="info">Your account does not have booking permissions assigned.</Message>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bookings-manager {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.bookings-manager__content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.bookings-manager__section {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  border: 1px solid var(--p-surface-200, #dee2e6);
  border-radius: 0.75rem;
  padding: 1.5rem;
  background-color: var(--p-surface-0, #fff);
  box-shadow: 0 0.5rem 1.5rem rgba(15, 23, 42, 0.08);
}

.bookings-manager__section-header {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.bookings-manager__section-actions {
  display: flex;
  justify-content: flex-end;
}

.bookings-manager__section-title {
  font-size: clamp(1.25rem, 1vw + 1rem, 1.75rem);
  font-weight: 600;
  margin: 0;
}

.bookings-manager__section-subtitle {
  margin: 0;
  color: var(--p-surface-500, #6c757d);
}

.bookings-manager__form {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
}

.bookings-manager__field {
  flex: 1 1 16rem;
  min-width: 16rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.bookings-manager__label {
  font-weight: 600;
}

.bookings-manager__actions {
  display: flex;
  align-items: center;
}

.bookings-manager__feedback {
  max-width: 32rem;
}

.bookings-manager__notice {
  max-width: 36rem;
}

.bookings-manager__hint {
  font-size: 0.9rem;
  color: var(--p-surface-500, #6c757d);
}

.bookings-manager__hint--error {
  color: var(--p-semantic-error-color, #d32f2f);
}

:deep(.p-datatable) {
  background-color: transparent;
}

:deep(.p-datatable .p-datatable-thead > tr > th) {
  background-color: var(--p-surface-0, #fff);
}
</style>
