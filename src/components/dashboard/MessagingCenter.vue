<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Dropdown from 'primevue/dropdown'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Textarea from 'primevue/textarea'
import MultiSelect from 'primevue/multiselect'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore'

import { useAuth } from '@/composables/auth'
import { db } from '@/firebase'

const { state } = useAuth()

const userProfile = ref(null)
const profileLoading = ref(false)
const profileError = ref('')

const recipients = ref([])
const recipientsLoading = ref(false)
const recipientsError = ref('')
const selectedRecipientIds = ref([])

const messageBody = ref('')
const sendingMessage = ref(false)
const messageError = ref('')
const messageSuccess = ref('')

const unsubscribeFromMessages = ref(null)
const messagesLoading = ref(false)
const messagesError = ref('')
const receivedMessages = ref([])

const RECEIVED_MESSAGES_PER_PAGE = 10
const receivedMessagesPage = ref(1)
const deletingMessageIds = ref([])
const clearingAllMessages = ref(false)
const messagesSuccess = ref('')

const selectedMessageSenderKeys = ref([])
const messageSearchQuery = ref('')
const messageSortOrder = ref('newest')
const messageSortOptions = [
  { label: 'Newest first', value: 'newest' },
  { label: 'Oldest first', value: 'oldest' },
]

const emailSubject = ref('')
const emailBody = ref('')
const emailAttachments = ref([])
const emailSending = ref(false)
const emailError = ref('')
const emailSuccess = ref('')

const googleGeminiApiKey =
  typeof import.meta.env.VITE_GOOGLE_GEMINI_API_KEY === 'string'
    ? import.meta.env.VITE_GOOGLE_GEMINI_API_KEY.trim()
    : ''

const googleGeminiModel = 'gemini-2.5-flash'

const isGeminiConfigured = computed(() => Boolean(googleGeminiApiKey))

const aiDialogVisible = ref(false)
const aiPrompt = ref('')
const aiGenerating = ref(false)
const aiError = ref('')
const aiTarget = ref('message')

const aiTargetLabel = computed(() => (aiTarget.value === 'email' ? 'email message' : 'message'))

const sendEmailEndpoint =
  typeof import.meta.env.VITE_SENDGRID_ENDPOINT === 'string' && import.meta.env.VITE_SENDGRID_ENDPOINT.trim()
    ? import.meta.env.VITE_SENDGRID_ENDPOINT.trim()
    : '/api/send-email'

const defaultSenderEmail =
  typeof import.meta.env.VITE_SENDGRID_FROM_EMAIL === 'string'
    ? import.meta.env.VITE_SENDGRID_FROM_EMAIL.trim()
    : ''

const firebaseUser = computed(() => {
  const user = state.user
  if (user?.provider === 'firebase' && user.uid) {
    return user
  }
  return null
})

const hasFirebaseAccess = computed(() => Boolean(db) && Boolean(firebaseUser.value))

const senderDisplayName = computed(() => {
  const profileName = userProfile.value?.username
  if (typeof profileName === 'string' && profileName.trim()) {
    return profileName.trim()
  }

  const authUsername = state.user?.username
  if (typeof authUsername === 'string' && authUsername.trim()) {
    return authUsername.trim()
  }

  const authEmail = state.user?.email
  if (typeof authEmail === 'string' && authEmail.trim()) {
    const [namePart] = authEmail.split('@')
    if (namePart) return namePart
    return authEmail
  }

  return 'User'
})

const userRoles = computed(() => {
  const roles = userProfile.value?.roles
  return Array.isArray(roles) ? roles : []
})

const isBeneficiary = computed(() => userRoles.value.includes('beneficiary'))
const isCarer = computed(() => userRoles.value.includes('carer'))

const counterpartRole = computed(() => {
  if (isBeneficiary.value) return 'carer'
  if (isCarer.value) return 'beneficiary'
  return null
})

const counterpartLabel = computed(() => {
  if (counterpartRole.value === 'carer') return 'Carer'
  if (counterpartRole.value === 'beneficiary') return 'Beneficiary'
  return 'Recipient'
})

const counterpartLabelPlural = computed(() => {
  if (counterpartRole.value === 'carer') return 'Carers'
  if (counterpartRole.value === 'beneficiary') return 'Beneficiaries'
  return 'Recipients'
})

const selectedRecipients = computed(() => {
  const ids = new Set(selectedRecipientIds.value)
  return recipients.value.filter((recipient) => ids.has(recipient.id))
})

const selectedRecipientsWithEmail = computed(() =>
  selectedRecipients.value.filter((recipient) => Boolean(recipient.email)),
)

const selectedRecipientsMissingEmail = computed(() =>
  selectedRecipients.value.filter((recipient) => !recipient.email),
)

const availableMessageSenders = computed(() => {
  const uniqueSenders = new Map()

  for (const message of receivedMessages.value) {
    const senderKey = typeof message?.senderKey === 'string' ? message.senderKey : ''
    if (!senderKey || uniqueSenders.has(senderKey)) {
      continue
    }

    const senderName =
      typeof message?.senderName === 'string' && message.senderName.trim()
        ? message.senderName.trim()
        : 'Unknown sender'

    uniqueSenders.set(senderKey, {
      id: senderKey,
      name: senderName,
    })
  }

  return Array.from(uniqueSenders.values()).sort((a, b) => a.name.localeCompare(b.name))
})

const filteredReceivedMessages = computed(() => {
  const senderFilters = Array.isArray(selectedMessageSenderKeys.value)
    ? selectedMessageSenderKeys.value.filter((value) => typeof value === 'string' && value)
    : []

  const activeSenderKeys = new Set(senderFilters)
  const searchTerm = messageSearchQuery.value.trim().toLowerCase()
  const sortOrder = messageSortOrder.value === 'oldest' ? 'oldest' : 'newest'

  let messages = receivedMessages.value.slice()

  if (activeSenderKeys.size > 0) {
    messages = messages.filter((message) =>
      message?.senderKey ? activeSenderKeys.has(message.senderKey) : false,
    )
  }

  if (searchTerm) {
    messages = messages.filter((message) => {
      const senderName =
        typeof message?.senderName === 'string' ? message.senderName.toLowerCase() : ''
      const body = typeof message?.body === 'string' ? message.body.toLowerCase() : ''

      return senderName.includes(searchTerm) || body.includes(searchTerm)
    })
  }

  messages.sort((a, b) => {
    const timeA = a?.sentAt?.getTime?.() ?? 0
    const timeB = b?.sentAt?.getTime?.() ?? 0

    return sortOrder === 'oldest' ? timeA - timeB : timeB - timeA
  })

  return messages
})

const totalReceivedMessagesPages = computed(() => {
  const total = Math.ceil(filteredReceivedMessages.value.length / RECEIVED_MESSAGES_PER_PAGE)
  return total > 0 ? total : 1
})

const paginatedReceivedMessages = computed(() => {
  const safePage = Math.max(1, Math.min(receivedMessagesPage.value, totalReceivedMessagesPages.value))
  const startIndex = (safePage - 1) * RECEIVED_MESSAGES_PER_PAGE
  const endIndex = startIndex + RECEIVED_MESSAGES_PER_PAGE
  return filteredReceivedMessages.value.slice(startIndex, endIndex)
})

const canSendInternalMessage = computed(
  () => hasFirebaseAccess.value && (isBeneficiary.value || isCarer.value),
)

const openAiDialog = (target) => {
  aiTarget.value = target === 'email' ? 'email' : 'message'
  aiDialogVisible.value = true
  aiPrompt.value = ''
  aiError.value = ''

  if (!isGeminiConfigured.value) {
    aiError.value =
      'AI writing is not configured. Please add the Google Gemini API key to enable this feature.'
  }
}

const closeAiDialog = () => {
  if (aiGenerating.value) return
  aiDialogVisible.value = false
}

const applyAiContentToTarget = (content) => {
  const trimmedContent = typeof content === 'string' ? content.trim() : ''

  if (!trimmedContent) return

  if (aiTarget.value === 'email') {
    emailBody.value = trimmedContent
  } else {
    messageBody.value = trimmedContent
  }
}

const generateAiContent = async () => {
  const prompt = aiPrompt.value.trim()

  if (!prompt) {
    aiError.value = 'Enter a prompt so the AI knows what to write.'
    return
  }

  if (!googleGeminiApiKey) {
    aiError.value =
      'AI writing is not configured. Please add the Google Gemini API key to enable this feature.'
    return
  }

  aiGenerating.value = true
  aiError.value = ''

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${googleGeminiModel}:generateContent?key=${googleGeminiApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
        }),
      },
    )

    if (!response.ok) {
      let errorMessage = 'We could not generate a response. Please try again.'
      try {
        const errorPayload = await response.json()
        if (errorPayload?.error?.message) {
          errorMessage = errorPayload.error.message
        }
      } catch (parseError) {
        console.warn('Unable to parse Gemini error response', parseError)
      }
      throw new Error(errorMessage)
    }

    const payload = await response.json()
    const candidate = payload?.candidates?.[0]
    const parts = candidate?.content?.parts || []
    const generatedText = parts
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim()

    if (!generatedText) {
      throw new Error('The AI did not return any content. Try a different prompt.')
    }

    applyAiContentToTarget(generatedText)
    aiDialogVisible.value = false
  } catch (error) {
    console.error('Failed to generate AI content', error)
    aiError.value =
      error instanceof Error && error.message
        ? error.message
        : 'We could not generate a response. Please try again.'
  } finally {
    aiGenerating.value = false
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

const loadRecipients = async () => {
  if (!db || !counterpartRole.value) {
    recipients.value = []
    return
  }

  recipientsLoading.value = true
  recipientsError.value = ''

  try {
    const recipientsQuery = query(
      collection(db, 'users'),
      where('roles', 'array-contains', counterpartRole.value),
    )

    const snapshot = await getDocs(recipientsQuery)

    recipients.value = snapshot.docs.map((snapshotDoc) => {
      const data = snapshotDoc.data()
      const username = typeof data?.username === 'string' ? data.username.trim() : ''
      const email = typeof data?.email === 'string' ? data.email.trim() : ''

      return {
        id: snapshotDoc.id,
        name: username || email || counterpartLabel.value,
        email: email || '',
      }
    })
  } catch (error) {
    console.error('Failed to load recipients', error)
    recipientsError.value = 'We were unable to load recipients. Please try again later.'
    recipients.value = []
  } finally {
    recipientsLoading.value = false
  }
}

const resetMessageFeedback = () => {
  messageError.value = ''
  messageSuccess.value = ''
}

const handleSendMessage = async () => {
  if (!db || !firebaseUser.value?.uid) return

  const trimmedBody = messageBody.value.trim()
  if (selectedRecipients.value.length === 0) {
    messageError.value = `Select at least one ${counterpartLabel.value.toLowerCase()} before sending.`
    messageSuccess.value = ''
    return
  }
  if (!trimmedBody) {
    messageError.value = 'Enter a message before sending.'
    messageSuccess.value = ''
    return
  }

  sendingMessage.value = true
  messageError.value = ''
  messageSuccess.value = ''

  try {
    await Promise.all(
      selectedRecipients.value.map((recipient) =>
        addDoc(collection(db, 'messages'), {
          senderId: firebaseUser.value.uid,
          senderName: senderDisplayName.value,
          senderRoles: userRoles.value,
          senderEmail: typeof state.user?.email === 'string' ? state.user.email : null,
          recipientId: recipient.id,
          recipientName: recipient.name,
          recipientEmail: recipient.email || null,
          recipientRole: counterpartRole.value,
          body: trimmedBody,
          createdAt: serverTimestamp(),
        }),
      ),
    )

    const recipientNames = selectedRecipients.value
      .map((recipient) => recipient.name || counterpartLabel.value)
      .join(', ')
    messageSuccess.value = `Message sent to ${recipientNames}.`
    messageBody.value = ''
  } catch (error) {
    console.error('Failed to send message', error)
    messageError.value = 'We could not send your message. Please try again.'
  } finally {
    sendingMessage.value = false
  }
}

const subscribeToReceivedMessages = () => {
  if (!db || !firebaseUser.value?.uid) {
    receivedMessages.value = []
    if (typeof unsubscribeFromMessages.value === 'function') {
      unsubscribeFromMessages.value()
    }
    unsubscribeFromMessages.value = null
    return
  }

  if (typeof unsubscribeFromMessages.value === 'function') {
    unsubscribeFromMessages.value()
  }

  messagesLoading.value = true
  messagesError.value = ''

  try {
    const messagesQuery = query(
      collection(db, 'messages'),
      where('recipientId', '==', firebaseUser.value.uid),
    )

    unsubscribeFromMessages.value = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const messages = snapshot.docs.map((snapshotDoc) => {
          const data = snapshotDoc.data()
          const createdAt = data?.createdAt?.toDate?.() || null
          const senderId =
            typeof data?.senderId === 'string' && data.senderId.trim()
              ? data.senderId.trim()
              : ''
          const senderNameRaw = typeof data?.senderName === 'string' ? data.senderName : ''
          const senderName = senderNameRaw.trim() || 'Unknown sender'
          const senderKey = senderId || `name:${senderName.toLowerCase()}`
          return {
            id: snapshotDoc.id,
            senderId: senderId || null,
            senderKey,
            senderName,
            body: typeof data?.body === 'string' ? data.body : '',
            sentAt: createdAt,
          }
        })

        receivedMessages.value = messages.sort((a, b) => {
          const timeA = a.sentAt?.getTime?.() ?? 0
          const timeB = b.sentAt?.getTime?.() ?? 0
          return timeB - timeA
        })

        messagesLoading.value = false
      },
      (error) => {
        console.error('Failed to load messages', error)
        messagesError.value = 'We could not load your messages right now.'
        receivedMessages.value = []
        messagesLoading.value = false
      },
    )
  } catch (error) {
    console.error('Failed to subscribe to messages', error)
    messagesError.value = 'We could not load your messages right now.'
    receivedMessages.value = []
    messagesLoading.value = false
  }
}

const goToPreviousMessagesPage = () => {
  if (receivedMessagesPage.value <= 1) return
  receivedMessagesPage.value -= 1
}

const goToNextMessagesPage = () => {
  if (receivedMessagesPage.value >= totalReceivedMessagesPages.value) return
  receivedMessagesPage.value += 1
}

const goToMessagesPage = (page) => {
  const parsedPage = Number(page) || 1
  const clampedPage = Math.min(Math.max(parsedPage, 1), totalReceivedMessagesPages.value)
  receivedMessagesPage.value = clampedPage
}

const isDeletingMessage = (messageId) => deletingMessageIds.value.includes(messageId)

const clearNotificationsForMessageIds = async (messageIds) => {
  if (!db || !firebaseUser.value?.uid || !Array.isArray(messageIds)) {
    return
  }

  const sanitizedIds = Array.from(
    new Set(
      messageIds
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter((id) => id.length > 0),
    ),
  )

  if (sanitizedIds.length === 0) {
    return
  }

  await Promise.all(
    sanitizedIds.map(async (messageId) => {
      const snapshot = await getDocs(
        query(collection(db, 'notifications'), where('messageId', '==', messageId)),
      )

      const deletions = snapshot.docs
        .filter((notificationDoc) => {
          const data = notificationDoc.data()
          return data?.recipientId === firebaseUser.value.uid
        })
        .map((notificationDoc) => deleteDoc(doc(db, 'notifications', notificationDoc.id)))

      if (deletions.length > 0) {
        await Promise.all(deletions)
      }
    }),
  )
}

const handleDeleteMessage = async (messageId) => {
  if (!db || !firebaseUser.value?.uid || !messageId) {
    return
  }

  if (isDeletingMessage(messageId)) {
    return
  }

  messagesError.value = ''
  messagesSuccess.value = ''

  deletingMessageIds.value = [...deletingMessageIds.value, messageId]

  try {
    await deleteDoc(doc(db, 'messages', messageId))
    await clearNotificationsForMessageIds([messageId])
    messagesSuccess.value = 'Message cleared.'
  } catch (error) {
    console.error('Failed to clear message or related notifications', error)
    messagesError.value = 'We could not clear that message. Please try again.'
  } finally {
    deletingMessageIds.value = deletingMessageIds.value.filter((id) => id !== messageId)
  }
}

const handleClearAllMessages = async () => {
  if (!db || !firebaseUser.value?.uid || receivedMessages.value.length === 0) {
    return
  }

  messagesError.value = ''
  messagesSuccess.value = ''
  clearingAllMessages.value = true

  const messageIds = receivedMessages.value.map((message) => message.id)
  deletingMessageIds.value = Array.from(new Set([...deletingMessageIds.value, ...messageIds]))

  try {
    await Promise.all(messageIds.map((messageId) => deleteDoc(doc(db, 'messages', messageId))))
    await clearNotificationsForMessageIds(messageIds)
    messagesSuccess.value = 'All messages cleared.'
    goToMessagesPage(1)
  } catch (error) {
    console.error('Failed to clear messages or related notifications', error)
    messagesError.value = 'We could not clear your messages right now.'
  } finally {
    clearingAllMessages.value = false
    deletingMessageIds.value = []
  }
}

const toBase64Attachment = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') {
        const base64 = result.split(',').pop()
        resolve({
          content: base64 || '',
          filename: file.name,
          type: file.type || 'application/octet-stream',
        })
      } else {
        reject(new Error('Unable to read file'))
      }
    }
    reader.onerror = () => {
      reject(new Error('Unable to read file'))
    }
    reader.readAsDataURL(file)
  })

const handleSendEmail = async () => {
  if (selectedRecipients.value.length === 0) {
    emailError.value = `Select at least one ${counterpartLabel.value.toLowerCase()} before sending.`
    emailSuccess.value = ''
    return
  }

  if (selectedRecipientsMissingEmail.value.length > 0) {
    const missingNames = selectedRecipientsMissingEmail.value
      .map((recipient) => recipient.name || counterpartLabel.value)
      .join(', ')
    emailError.value = `The following recipients do not have an email address: ${missingNames}.`
    emailSuccess.value = ''
    return
  }
  if (!emailBody.value.trim()) {
    emailError.value = 'Enter an email message before sending.'
    emailSuccess.value = ''
    return
  }

  const configuredSenderEmail =
    (defaultSenderEmail && defaultSenderEmail) ||
    (typeof state.user?.email === 'string' && state.user.email.trim())

  if (!configuredSenderEmail) {
    emailError.value =
      'We do not have a sender email configured. Please contact support to configure email sending.'
    emailSuccess.value = ''
    return
  }

  emailSending.value = true
  emailError.value = ''
  emailSuccess.value = ''

  try {
    const attachments = await Promise.all(
      emailAttachments.value.map((file) => toBase64Attachment(file)),
    )

    const filteredAttachments = attachments.filter((attachment) => attachment.content)
    const sentToNames = []

    for (const recipient of selectedRecipientsWithEmail.value) {
      const response = await fetch(sendEmailEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: {
            email: recipient.email,
            name: recipient.name,
          },
          from: {
            email: configuredSenderEmail,
            name: senderDisplayName.value,
          },
          subject: emailSubject.value.trim() || 'Message from Health Charity App',
          text: emailBody.value.trim(),
          html: emailBody.value.trim().replace(/\n/g, '<br />'),
          attachments: filteredAttachments,
        }),
      })

      if (!response.ok) {
        let errorMessage = 'Failed to send email.'
        try {
          const errorPayload = await response.json()
          if (errorPayload?.error) {
            errorMessage = errorPayload.error
          }
        } catch (parseError) {
          console.warn('Unable to parse SendGrid error response', parseError)
        }
        throw new Error(`${errorMessage} (${recipient.name || recipient.email}).`)
      }

      sentToNames.push(recipient.name || recipient.email)
    }

    emailSuccess.value = `Email sent to ${sentToNames.join(', ')}.`
    emailSubject.value = ''
    emailBody.value = ''
    emailAttachments.value = []
  } catch (error) {
    console.error('Failed to send email', error)
    emailError.value =
      error instanceof Error && error.message ? error.message : 'We could not send your email. Please try again.'
  } finally {
    emailSending.value = false
  }
}

const handleAttachmentChange = (event) => {
  const files = Array.from(event.target?.files || [])
  emailAttachments.value = files
}

onMounted(() => {
  if (hasFirebaseAccess.value) {
    loadUserProfile()
    subscribeToReceivedMessages()
  }
})

watch(
  () => aiDialogVisible.value,
  (visible) => {
    if (!visible) {
      aiPrompt.value = ''
      aiError.value = ''
      aiGenerating.value = false
    }
  },
)

watch(
  () => firebaseUser.value?.uid,
  (newUid, oldUid) => {
    if (newUid && newUid !== oldUid) {
      loadUserProfile()
      subscribeToReceivedMessages()
    }

    if (!newUid) {
      userProfile.value = null
      receivedMessages.value = []
      if (typeof unsubscribeFromMessages.value === 'function') {
        unsubscribeFromMessages.value()
      }
      unsubscribeFromMessages.value = null
    }
  },
)

watch(filteredReceivedMessages, (newMessages) => {
  if (!Array.isArray(newMessages)) {
    receivedMessagesPage.value = 1
    return
  }

  const totalPages = Math.ceil(newMessages.length / RECEIVED_MESSAGES_PER_PAGE) || 1

  if (receivedMessagesPage.value > totalPages) {
    receivedMessagesPage.value = totalPages
  }

  if (newMessages.length === 0) {
    receivedMessagesPage.value = 1
  }
})

watch(availableMessageSenders, (senders) => {
  const validSenderKeys = new Set(senders.map((sender) => sender.id))
  selectedMessageSenderKeys.value = selectedMessageSenderKeys.value.filter((key) =>
    validSenderKeys.has(key),
  )
})

watch([selectedMessageSenderKeys, messageSearchQuery, messageSortOrder], () => {
  receivedMessagesPage.value = 1
})

watch(messagesError, (value) => {
  if (value) {
    messagesSuccess.value = ''
  }
})

watch(counterpartRole, (role) => {
  selectedRecipientIds.value = []
  if (role) {
    loadRecipients()
  } else {
    recipients.value = []
  }
})

watch(recipients, (newRecipients) => {
  const validIds = new Set(newRecipients.map((recipient) => recipient.id))
  selectedRecipientIds.value = selectedRecipientIds.value.filter((id) => validIds.has(id))
})

watch([messageBody, selectedRecipientIds], () => {
  if (!sendingMessage.value) {
    resetMessageFeedback()
  }
}, { deep: true })

watch([emailSubject, emailBody, emailAttachments, selectedRecipientIds], () => {
  if (!emailSending.value) {
    emailError.value = ''
    emailSuccess.value = ''
  }
}, { deep: true })

onBeforeUnmount(() => {
  if (typeof unsubscribeFromMessages.value === 'function') {
    unsubscribeFromMessages.value()
  }
})
</script>

<template>
  <div class="messaging-center">
    <div v-if="!db" class="messaging-center__notice">
      <Message severity="warn">Firebase has not been configured. Please add your Firebase credentials.</Message>
    </div>

    <div v-else>
      <div v-if="!firebaseUser" class="messaging-center__notice">
        <Message severity="info">Sign in with your Firebase account to exchange messages.</Message>
      </div>

      <div v-else>
        <div v-if="profileLoading" class="messaging-center__notice">
          <Message severity="info">Loading your messaging profile…</Message>
        </div>

        <div v-else-if="profileError" class="messaging-center__notice">
          <Message severity="error">{{ profileError }}</Message>
        </div>

        <div v-else-if="!canSendInternalMessage" class="messaging-center__notice">
          <Message severity="info">
            Your account does not have messaging permissions assigned. Please contact support if you
            believe this is an error.
          </Message>
        </div>

        <div v-else class="messaging-center__content">
          <section class="messaging-center__section">
            <h2 class="messaging-center__section-heading">Send a message to your {{ counterpartLabelPlural.toLowerCase() }}</h2>

            <div class="messaging-center__form">
              <label class="messaging-center__label" for="recipients">Select {{ counterpartLabelPlural.toLowerCase() }}</label>
              <MultiSelect
                input-id="recipients"
                v-model="selectedRecipientIds"
                :options="recipients"
                option-label="name"
                option-value="id"
                placeholder="Choose recipients"
                display="chip"
                filter
                :loading="recipientsLoading"
                class="messaging-center__dropdown"
              />
              <small v-if="recipientsError" class="messaging-center__hint messaging-center__hint--error">
                {{ recipientsError }}
              </small>

              <label class="messaging-center__label" for="message-body">Message</label>
              <Textarea
                id="message-body"
                v-model="messageBody"
                auto-resize
                rows="5"
                placeholder="Write your message here"
                class="messaging-center__textarea"
              />

              <div class="messaging-center__feedback" v-if="messageError || messageSuccess">
                <Message v-if="messageError" severity="error">{{ messageError }}</Message>
                <Message v-else-if="messageSuccess" severity="success">{{ messageSuccess }}</Message>
              </div>

              <div class="messaging-center__actions">
                <Button
                  label="Send message"
                  class="messaging-center__submit"
                  :loading="sendingMessage"
                  @click="handleSendMessage"
                />
                <Button
                  label="Write with AI"
                  icon="pi pi-sparkles"
                  class="messaging-center__ai-button"
                  severity="secondary"
                  outlined
                  :disabled="aiGenerating"
                  @click="openAiDialog('message')"
                />
              </div>
            </div>

            <div class="messaging-center__email">
              <h3 class="messaging-center__subheading">Prefer email?</h3>
              <p class="messaging-center__description">
                Send an email with optional attachments to the selected {{ counterpartLabelPlural.toLowerCase() }}.
              </p>

              <label class="messaging-center__label" for="email-subject">Email subject</label>
              <InputText
                id="email-subject"
                v-model="emailSubject"
                placeholder="Subject"
                class="messaging-center__input"
              />

              <label class="messaging-center__label" for="email-body">Email message</label>
              <Textarea
                id="email-body"
                v-model="emailBody"
                auto-resize
                rows="5"
                placeholder="Write your email message here"
                class="messaging-center__textarea"
              />

              <label class="messaging-center__label" for="email-attachments">Attachments</label>
              <input
                id="email-attachments"
                type="file"
                multiple
                class="messaging-center__file"
                @change="handleAttachmentChange"
              />
              <small v-if="emailAttachments.length" class="messaging-center__hint">
                {{ emailAttachments.length }} attachment{{ emailAttachments.length === 1 ? '' : 's' }} selected
              </small>

              <div class="messaging-center__feedback" v-if="emailError || emailSuccess">
                <Message v-if="emailError" severity="error">{{ emailError }}</Message>
                <Message v-else-if="emailSuccess" severity="success">{{ emailSuccess }}</Message>
              </div>

              <div class="messaging-center__actions">
                <Button
                  label="Send email"
                  severity="secondary"
                  class="messaging-center__submit"
                  :loading="emailSending"
                  @click="handleSendEmail"
                />
                <Button
                  label="Write with AI"
                  icon="pi pi-sparkles"
                  class="messaging-center__ai-button"
                  severity="secondary"
                  outlined
                  :disabled="aiGenerating"
                  @click="openAiDialog('email')"
                />
              </div>
            </div>
          </section>

          <section class="messaging-center__section">
            <div class="messaging-center__section-heading-row">
              <h2 class="messaging-center__section-heading">Messages you received</h2>
              <Button
                v-if="receivedMessages.length > 0"
                label="Clear all"
                icon="pi pi-trash"
                severity="danger"
                outlined
                size="small"
                class="messaging-center__clear-all"
                :loading="clearingAllMessages"
                :disabled="clearingAllMessages"
                @click="handleClearAllMessages"
              />
            </div>

            <div class="messaging-center__messages" v-if="messagesLoading">
              <Message severity="info">Loading your messages…</Message>
            </div>

            <div class="messaging-center__messages" v-else-if="messagesError">
              <Message severity="error">{{ messagesError }}</Message>
            </div>

            <div class="messaging-center__messages" v-else-if="receivedMessages.length === 0">
              <Message severity="info">You have not received any messages yet.</Message>
            </div>

            <div v-else>
              <div
                v-if="messagesSuccess"
                class="messaging-center__messages messaging-center__messages--success"
              >
                <Message severity="success">{{ messagesSuccess }}</Message>
              </div>

              <div class="messaging-center__received-controls">
                <div class="messaging-center__control messaging-center__control--wide">
                  <label class="messaging-center__label messaging-center__label--inline" for="message-sender-filter">
                    Filter by sender
                  </label>
                  <MultiSelect
                    input-id="message-sender-filter"
                    v-model="selectedMessageSenderKeys"
                    :options="availableMessageSenders"
                    option-label="name"
                    option-value="id"
                    placeholder="All senders"
                    display="chip"
                    filter
                    class="messaging-center__dropdown"
                  />
                </div>

                <div class="messaging-center__control messaging-center__control--search">
                  <label class="messaging-center__label messaging-center__label--inline" for="message-search">
                    Search messages
                  </label>
                  <span class="p-input-icon-left messaging-center__search">
                    <i class="pi pi-search" />
                    <InputText
                      id="message-search"
                      v-model="messageSearchQuery"
                      placeholder="Search by sender or content"
                      class="messaging-center__search-input"
                    />
                  </span>
                </div>

                <div class="messaging-center__control messaging-center__control--compact">
                  <label class="messaging-center__label messaging-center__label--inline" for="message-sort">
                    Sort by
                  </label>
                  <Dropdown
                    input-id="message-sort"
                    v-model="messageSortOrder"
                    :options="messageSortOptions"
                    option-label="label"
                    option-value="value"
                    class="messaging-center__dropdown messaging-center__dropdown--compact"
                  />
                </div>
              </div>

              <div
                class="messaging-center__messages"
                v-if="filteredReceivedMessages.length === 0"
              >
                <Message severity="info">No messages match your current filters.</Message>
              </div>

              <template v-else>
                <ul class="messaging-center__message-list">
                  <li
                    v-for="message in paginatedReceivedMessages"
                    :key="message.id"
                    class="messaging-center__message-item"
                  >
                    <div class="messaging-center__message-header">
                      <div class="messaging-center__message-meta">
                        <span class="messaging-center__message-sender">{{ message.senderName }}</span>
                        <span v-if="message.sentAt" class="messaging-center__message-date">
                          {{ message.sentAt.toLocaleString() }}
                        </span>
                      </div>
                      <div class="messaging-center__message-actions">
                        <Button
                          label="Clear"
                          icon="pi pi-times"
                          severity="secondary"
                          text
                          size="small"
                          class="messaging-center__clear-message"
                          :loading="isDeletingMessage(message.id)"
                          :disabled="isDeletingMessage(message.id) || clearingAllMessages"
                          @click="handleDeleteMessage(message.id)"
                        />
                      </div>
                    </div>
                    <p class="messaging-center__message-body">{{ message.body }}</p>
                  </li>
                </ul>

                <div v-if="totalReceivedMessagesPages > 1" class="messaging-center__pagination">
                  <Button
                    label="Previous"
                    icon="pi pi-chevron-left"
                    severity="secondary"
                    text
                    size="small"
                    :disabled="receivedMessagesPage === 1"
                    @click="goToPreviousMessagesPage"
                  />
                  <span class="messaging-center__pagination-label">
                    Page {{ receivedMessagesPage }} of {{ totalReceivedMessagesPages }}
                  </span>
                  <Button
                    label="Next"
                    icon-pos="right"
                    icon="pi pi-chevron-right"
                    severity="secondary"
                    text
                    size="small"
                    :disabled="receivedMessagesPage === totalReceivedMessagesPages"
                    @click="goToNextMessagesPage"
                  />
                </div>
              </template>
            </div>
          </section>
        </div>
      </div>
    </div>

    <Dialog
      v-model:visible="aiDialogVisible"
      modal
      header="Write with AI"
      :closable="!aiGenerating"
      :close-on-escape="!aiGenerating"
      :dismissable-mask="!aiGenerating"
      :style="{ width: 'min(560px, 95vw)' }"
      class="messaging-center__ai-dialog"
      @hide="closeAiDialog"
    >
      <div class="messaging-center__ai-dialog-content">
        <p class="messaging-center__ai-description">
          Provide a prompt to help the AI draft your {{ aiTargetLabel }}.
        </p>

        <label class="messaging-center__label" for="ai-prompt">Prompt</label>
        <Textarea
          id="ai-prompt"
          v-model="aiPrompt"
          auto-resize
          rows="5"
          placeholder="Describe what you would like to say"
          class="messaging-center__textarea"
        />

        <small class="messaging-center__hint">
          The generated text will replace your current {{ aiTargetLabel }}. You can edit it before
          sending.
        </small>

        <div v-if="!isGeminiConfigured" class="messaging-center__ai-feedback">
          <Message severity="warn">
            Google Gemini is not configured. Add the API key to enable AI writing.
          </Message>
        </div>

        <div v-if="aiError" class="messaging-center__ai-feedback">
          <Message severity="error">{{ aiError }}</Message>
        </div>
      </div>

      <template #footer>
        <Button
          label="Cancel"
          text
          class="messaging-center__ai-cancel"
          :disabled="aiGenerating"
          @click="closeAiDialog"
        />
        <Button
          label="Generate"
          icon="pi pi-sparkles"
          :loading="aiGenerating"
          :disabled="!isGeminiConfigured || aiGenerating"
          @click="generateAiContent"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.messaging-center {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.messaging-center__content {
  display: grid;
  gap: 2rem;
}

@media (min-width: 960px) {
  .messaging-center__content {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.messaging-center__section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.5rem;
  border: 1px solid var(--p-surface-300, #d4d4d8);
  border-radius: 1rem;
  background-color: var(--p-surface-0, #ffffff);
  box-shadow: 0 10px 30px rgb(15 23 42 / 0.08);
}

.messaging-center__section-heading {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.messaging-center__section-heading-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
  justify-content: space-between;
}

.messaging-center__clear-all {
  white-space: nowrap;
}

.messaging-center__subheading {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.messaging-center__label {
  font-weight: 500;
}

.messaging-center__form,
.messaging-center__email {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.messaging-center__dropdown,
.messaging-center__textarea,
.messaging-center__input {
  width: 100%;
}

.messaging-center__textarea {
  min-height: 7rem;
}

.messaging-center__file {
  padding: 0.5rem 0;
}

.messaging-center__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.messaging-center__submit {
  align-self: flex-start;
}

.messaging-center__ai-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.messaging-center__ai-description {
  margin: 0;
  color: var(--p-surface-600, #52525b);
  line-height: 1.5;
}

.messaging-center__ai-feedback {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.messaging-center__feedback {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.messaging-center__notice {
  display: flex;
  justify-content: center;
}

.messaging-center__messages {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.messaging-center__received-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-end;
  margin-bottom: 1rem;
}

.messaging-center__control {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  width: 100%;
}

.messaging-center__control--wide,
.messaging-center__control--search {
  flex: 1 1 16rem;
}

.messaging-center__control--compact {
  flex: 0 0 auto;
  min-width: 10rem;
}

.messaging-center__label--inline {
  font-size: 0.875rem;
}

.messaging-center__search {
  width: 100%;
}

.messaging-center__search-input {
  width: 100%;
}

.messaging-center__dropdown--compact {
  min-width: 10rem;
}

.messaging-center__messages--success {
  margin-bottom: 0.75rem;
}

.messaging-center__message-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.messaging-center__message-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  border-radius: 0.75rem;
  background-color: var(--p-surface-100, #f4f4f5);
}

.messaging-center__message-header {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
  color: var(--p-surface-600, #52525b);
}

.messaging-center__message-meta {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.messaging-center__message-sender {
  font-weight: 600;
  color: var(--p-surface-900, #18181b);
}

.messaging-center__message-date {
  font-size: 0.8125rem;
  color: var(--p-surface-600, #52525b);
}

.messaging-center__message-actions {
  display: flex;
  align-items: center;
}

.messaging-center__message-body {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.5;
}

.messaging-center__pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1rem;
  flex-wrap: wrap;
}

.messaging-center__pagination-label {
  font-size: 0.875rem;
  color: var(--p-surface-600, #52525b);
}

.messaging-center__hint {
  font-size: 0.875rem;
  color: var(--p-surface-600, #52525b);
}

.messaging-center__hint--error {
  color: #dc2626;
}
</style>
