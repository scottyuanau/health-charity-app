<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import DatePicker from 'primevue/datepicker'
import Message from 'primevue/message'
import Button from 'primevue/button'
import { collection, onSnapshot, query, where } from 'firebase/firestore'

import { useAuth } from '@/composables/auth'
import { db } from '@/firebase'

const { state } = useAuth()

const donations = ref([])
const loading = ref(false)
const errorMessage = ref('')
const unsubscribeRef = ref(null)
const selectedDate = ref(null)

const firebaseUser = computed(() => {
  const user = state.user
  if (user?.provider === 'firebase' && user.uid) {
    return user
  }
  return null
})

const hasFirebaseAccess = computed(() => Boolean(db))

const canLoadDonations = computed(() => hasFirebaseAccess.value && Boolean(firebaseUser.value?.uid))

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
})

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
})

const getTimestampValue = (timestamp) => {
  if (!timestamp) return 0
  if (typeof timestamp.toMillis === 'function') {
    const millis = timestamp.toMillis()
    return Number.isNaN(millis) ? 0 : millis
  }
  if (typeof timestamp.toDate === 'function') {
    const date = timestamp.toDate()
    return Number.isNaN(date?.getTime()) ? 0 : date.getTime()
  }
  if (timestamp instanceof Date) {
    const millis = timestamp.getTime()
    return Number.isNaN(millis) ? 0 : millis
  }
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    return timestamp
  }
  return 0
}

const formatDate = (timestamp) => {
  if (!timestamp) return 'Pending'
  if (typeof timestamp.toDate === 'function') {
    const date = timestamp.toDate()
    return Number.isNaN(date?.getTime()) ? 'Pending' : dateFormatter.format(date)
  }
  if (timestamp instanceof Date) {
    return Number.isNaN(timestamp.getTime()) ? 'Pending' : dateFormatter.format(timestamp)
  }
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    const date = new Date(timestamp)
    return Number.isNaN(date.getTime()) ? 'Pending' : dateFormatter.format(date)
  }
  return 'Pending'
}

const formatAmount = (amount) => {
  if (typeof amount !== 'number') {
    return '$0.00'
  }
  return currencyFormatter.format(amount)
}

const getDateRangeForFilter = (date) => {
  if (!date) {
    return null
  }

  const normalized = new Date(date)
  if (Number.isNaN(normalized.getTime())) {
    return null
  }

  normalized.setHours(0, 0, 0, 0)
  const end = new Date(normalized)
  end.setDate(end.getDate() + 1)

  return {
    start: normalized.getTime(),
    end: end.getTime(),
  }
}

const filteredDonations = computed(() => {
  const range = getDateRangeForFilter(selectedDate.value)

  if (!range) {
    return donations.value
  }

  return donations.value.filter((donation) => {
    const timestamp = getTimestampValue(donation.createdAt)

    if (!timestamp) {
      return false
    }

    return timestamp >= range.start && timestamp < range.end
  })
})

const clearDateFilter = () => {
  selectedDate.value = null
}

const escapePdfText = (text) => {
  if (typeof text !== 'string') {
    return ''
  }
  return text.replace(/([\\()])/g, '\\$1')
}

const createInvoicePdfBlob = (lines) => {
  const encoder = new TextEncoder()
  const lineSpacing = 20
  const startingY = 760

  const contentParts = [
    'BT',
    '/F1 20 Tf',
    '50 800 Td',
    `(${escapePdfText('Tax Invoice')}) Tj`,
    'ET',
  ]

  lines.forEach((line, index) => {
    const yPosition = startingY - index * lineSpacing
    contentParts.push('BT')
    contentParts.push('/F1 12 Tf')
    contentParts.push(`50 ${yPosition} Td`)
    contentParts.push(`(${escapePdfText(line)}) Tj`)
    contentParts.push('ET')
  })

  const contentStream = contentParts.join('\n') + '\n'
  const contentBytes = encoder.encode(contentStream)

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n',
    `4 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n${contentStream}endstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ]

  const header = '%PDF-1.4\n'
  const headerBytes = encoder.encode(header)
  let currentOffset = headerBytes.length
  const xrefEntries = ['0000000000 65535 f \n']
  let body = ''

  objects.forEach((object) => {
    const objectBytes = encoder.encode(object)
    const offsetString = String(currentOffset).padStart(10, '0')
    xrefEntries.push(`${offsetString} 00000 n \n`)
    body += object
    currentOffset += objectBytes.length
  })

  const xrefOffset = currentOffset
  const xrefTable = `xref\n0 ${objects.length + 1}\n${xrefEntries.join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  const pdfString = header + body + xrefTable
  const pdfBytes = encoder.encode(pdfString)

  return new Blob([pdfBytes], { type: 'application/pdf' })
}

const downloadInvoice = (donation) => {
  if (!donation) {
    return
  }

  const amount = typeof donation.amount === 'number' ? donation.amount : 0
  const formattedAmount = formatAmount(amount)
  const gstAmount = formatAmount(0)
  const invoiceLines = [
    'Health Charity Pty Ltd',
    'ABN 90 123 455 789',
    `Date: ${formatDate(donation.createdAt)}`,
    `Donation Amount: ${formattedAmount}`,
    `GST (0% for donations): ${gstAmount}`,
    `Total: ${formattedAmount}`,
    'Thank you for your support!',
  ]

  const blob = createInvoicePdfBlob(invoiceLines)
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const sanitizedId = typeof donation.id === 'string' && donation.id ? donation.id : 'donation'
  link.href = objectUrl
  link.download = `Tax-Invoice-${sanitizedId}.pdf`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(objectUrl)
}

const stopListening = () => {
  if (typeof unsubscribeRef.value === 'function') {
    unsubscribeRef.value()
  }
  unsubscribeRef.value = null
}

const startListening = () => {
  stopListening()

  if (!canLoadDonations.value) {
    donations.value = []
    loading.value = false
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const donationsQuery = query(
      collection(db, 'donations'),
      where('userId', '==', firebaseUser.value.uid),
    )

    unsubscribeRef.value = onSnapshot(
      donationsQuery,
      (snapshot) => {
        donations.value = snapshot.docs
          .map((docSnapshot) => ({
            id: docSnapshot.id,
            ...docSnapshot.data(),
          }))
          .sort((a, b) => getTimestampValue(b.createdAt) - getTimestampValue(a.createdAt))
        loading.value = false
      },
      (error) => {
        console.error('Failed to load donations', error)
        errorMessage.value = 'We were unable to load your donation history. Please try again later.'
        donations.value = []
        loading.value = false
      },
    )
  } catch (error) {
    console.error('Failed to initialize donation listener', error)
    errorMessage.value = 'We were unable to load your donation history. Please try again later.'
    donations.value = []
    loading.value = false
  }
}

onMounted(() => {
  if (canLoadDonations.value) {
    startListening()
  }
})

watch(canLoadDonations, (canLoad) => {
  if (canLoad) {
    startListening()
  } else {
    stopListening()
    donations.value = []
  }
})

onBeforeUnmount(() => {
  stopListening()
})
</script>

<template>
  <div class="donation-history">
    <div v-if="!hasFirebaseAccess" class="donation-history__message">
      <Message severity="warn">
        Firebase has not been configured. Please add your Firebase credentials to track donations.
      </Message>
    </div>

    <div v-else-if="!firebaseUser" class="donation-history__message">
      <Message severity="info">Sign in with your donor account to view donation history.</Message>
    </div>

    <div v-else-if="loading" class="donation-history__message">
      <Message severity="info">Loading your donations…</Message>
    </div>

    <div v-else-if="errorMessage" class="donation-history__message">
      <Message severity="error">{{ errorMessage }}</Message>
    </div>

    <div v-else-if="donations.length === 0" class="donation-history__message">
      <Message severity="info">No donations found yet. Your future contributions will appear here.</Message>
    </div>

    <div v-else class="donation-history__content">
      <div class="donation-history__filters">
        <DatePicker
          v-model="selectedDate"
          :maxDate="new Date()"
          dateFormat="MM d, yy"
          showIcon
          iconDisplay="input"
          placeholder="Filter by date"
          inputId="donation-date-filter"
        />
        <Button
          v-if="selectedDate"
          type="button"
          severity="secondary"
          outlined
          @click="clearDateFilter"
        >
          Clear
        </Button>
      </div>

      <DataTable
        :value="filteredDonations"
        dataKey="id"
        responsiveLayout="scroll"
        paginator
        :rows="10"
      >
        <Column field="createdAt" header="Date" sortable>
          <template #body="{ data }">
            {{ formatDate(data.createdAt) }}
          </template>
        </Column>
        <Column
          field="amount"
          header="Amount"
          style="width: 12rem"
          class="text-end"
          sortable
          dataType="numeric"
        >
          <template #body="{ data }">
            {{ formatAmount(data.amount) }}
          </template>
        </Column>
        <Column header="Invoice" style="width: 10rem" class="text-center">
          <template #body="{ data }">
            <Button
              type="button"
              icon="pi pi-download"
              label="Download"
              size="small"
              @click="downloadInvoice(data)"
            />
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>

<style scoped>
.donation-history {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  --donation-history-header-bg: rgba(220, 53, 69, 0.05);
  --donation-history-row-alt-bg: rgba(248, 249, 250, 0.8);
}

.donation-history__message {
  max-width: 36rem;
}

.donation-history__content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.donation-history__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.donation-history :deep(.p-datatable) {
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.08);
}

.donation-history :deep(.p-datatable .p-datatable-thead > tr > th) {
  font-weight: 600;
  background-color: var(--donation-history-header-bg);
  color: inherit;
}

.donation-history :deep(.p-datatable .p-datatable-tbody > tr:nth-child(even)) {
  background-color: var(--donation-history-row-alt-bg);
}

:global(body.app-dark) :deep(.donation-history) {
  --donation-history-header-bg: rgba(248, 113, 113, 0.14);
  --donation-history-row-alt-bg: rgba(148, 163, 184, 0.14);
}
</style>
