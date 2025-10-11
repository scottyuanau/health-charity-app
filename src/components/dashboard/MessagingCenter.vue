<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Dropdown from 'primevue/dropdown'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Textarea from 'primevue/textarea'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
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
const selectedRecipientId = ref(null)

const messageBody = ref('')
const sendingMessage = ref(false)
const messageError = ref('')
const messageSuccess = ref('')

const unsubscribeFromMessages = ref(null)
const messagesLoading = ref(false)
const messagesError = ref('')
const receivedMessages = ref([])

const emailSubject = ref('')
const emailBody = ref('')
const emailAttachments = ref([])
const emailSending = ref(false)
const emailError = ref('')
const emailSuccess = ref('')

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

const selectedRecipient = computed(() =>
  recipients.value.find((recipient) => recipient.id === selectedRecipientId.value) || null,
)

const selectedRecipientEmail = computed(() => selectedRecipient.value?.email || '')

const canSendInternalMessage = computed(
  () => hasFirebaseAccess.value && (isBeneficiary.value || isCarer.value),
)

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
  if (!selectedRecipient.value) {
    messageError.value = `Select a ${counterpartLabel.value.toLowerCase()} before sending.`
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
    await addDoc(collection(db, 'messages'), {
      senderId: firebaseUser.value.uid,
      senderName: senderDisplayName.value,
      senderRoles: userRoles.value,
      senderEmail: typeof state.user?.email === 'string' ? state.user.email : null,
      recipientId: selectedRecipient.value.id,
      recipientName: selectedRecipient.value.name,
      recipientEmail: selectedRecipient.value.email || null,
      recipientRole: counterpartRole.value,
      body: trimmedBody,
      createdAt: serverTimestamp(),
    })

    messageSuccess.value = 'Message sent successfully.'
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
      orderBy('createdAt', 'desc'),
    )

    unsubscribeFromMessages.value = onSnapshot(
      messagesQuery,
      (snapshot) => {
        receivedMessages.value = snapshot.docs.map((snapshotDoc) => {
          const data = snapshotDoc.data()
          const createdAt = data?.createdAt?.toDate?.() || null
          return {
            id: snapshotDoc.id,
            senderName: data?.senderName || 'Unknown sender',
            body: data?.body || '',
            sentAt: createdAt,
          }
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
  if (!selectedRecipient.value) {
    emailError.value = `Select a ${counterpartLabel.value.toLowerCase()} before sending.`
    emailSuccess.value = ''
    return
  }
  if (!selectedRecipientEmail.value) {
    emailError.value = 'The selected recipient does not have an email address.'
    emailSuccess.value = ''
    return
  }
  if (!emailBody.value.trim()) {
    emailError.value = 'Enter an email message before sending.'
    emailSuccess.value = ''
    return
  }

  const apiKey = import.meta.env.VITE_SENDGRID_API_KEY
  if (!apiKey) {
    emailError.value = 'SendGrid is not configured. Please add your API key.'
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

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: selectedRecipientEmail.value, name: selectedRecipient.value.name }],
            subject: emailSubject.value.trim() || 'Message from Health Charity App',
          },
        ],
        from: {
          email:
            typeof state.user?.email === 'string' && state.user.email
              ? state.user.email
              : 'no-reply@health-charity-app.local',
          name: senderDisplayName.value,
        },
        content: [
          {
            type: 'text/plain',
            value: emailBody.value.trim(),
          },
        ],
        attachments: attachments.filter((attachment) => attachment.content),
      }),
    })

    if (!response.ok) {
      throw new Error(`SendGrid responded with status ${response.status}`)
    }

    emailSuccess.value = 'Email sent successfully.'
    emailSubject.value = ''
    emailBody.value = ''
    emailAttachments.value = []
  } catch (error) {
    console.error('Failed to send email', error)
    emailError.value = 'We could not send your email. Please try again.'
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

watch(counterpartRole, (role) => {
  if (role) {
    loadRecipients()
  } else {
    recipients.value = []
  }
})

watch([messageBody, selectedRecipientId], () => {
  if (!sendingMessage.value) {
    resetMessageFeedback()
  }
})

watch([emailSubject, emailBody, emailAttachments], () => {
  if (!emailSending.value) {
    emailError.value = ''
    emailSuccess.value = ''
  }
})

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
            <h2 class="messaging-center__section-heading">Send a message to a {{ counterpartLabel.toLowerCase() }}</h2>

            <div class="messaging-center__form">
              <label class="messaging-center__label" for="recipient">Select {{ counterpartLabel }}</label>
              <Dropdown
                id="recipient"
                v-model="selectedRecipientId"
                :options="recipients.map((recipient) => ({ label: recipient.name, value: recipient.id }))"
                :loading="recipientsLoading"
                option-label="label"
                option-value="value"
                placeholder="Choose a recipient"
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

              <Button
                label="Send message"
                class="messaging-center__submit"
                :loading="sendingMessage"
                @click="handleSendMessage"
              />
            </div>

            <div class="messaging-center__email">
              <h3 class="messaging-center__subheading">Prefer email?</h3>
              <p class="messaging-center__description">
                Send an email with optional attachments to the selected {{ counterpartLabel.toLowerCase() }}.
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

              <Button
                label="Send email"
                severity="secondary"
                class="messaging-center__submit"
                :loading="emailSending"
                @click="handleSendEmail"
              />
            </div>
          </section>

          <section class="messaging-center__section">
            <h2 class="messaging-center__section-heading">Messages you received</h2>

            <div class="messaging-center__messages" v-if="messagesLoading">
              <Message severity="info">Loading your messages…</Message>
            </div>

            <div class="messaging-center__messages" v-else-if="messagesError">
              <Message severity="error">{{ messagesError }}</Message>
            </div>

            <div class="messaging-center__messages" v-else-if="receivedMessages.length === 0">
              <Message severity="info">You have not received any messages yet.</Message>
            </div>

            <ul v-else class="messaging-center__message-list">
              <li v-for="message in receivedMessages" :key="message.id" class="messaging-center__message-item">
                <div class="messaging-center__message-header">
                  <span class="messaging-center__message-sender">{{ message.senderName }}</span>
                  <span v-if="message.sentAt" class="messaging-center__message-date">
                    {{ message.sentAt.toLocaleString() }}
                  </span>
                </div>
                <p class="messaging-center__message-body">{{ message.body }}</p>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
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

.messaging-center__submit {
  align-self: flex-start;
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

.messaging-center__message-sender {
  font-weight: 600;
  color: var(--p-surface-900, #18181b);
}

.messaging-center__message-body {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.5;
}

.messaging-center__hint {
  font-size: 0.875rem;
  color: var(--p-surface-600, #52525b);
}

.messaging-center__hint--error {
  color: #dc2626;
}
</style>
