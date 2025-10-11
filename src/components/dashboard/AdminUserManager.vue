<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import MultiSelect from 'primevue/multiselect'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'

import { useAuth } from '@/composables/auth'
import { db } from '@/firebase'

const roleOptions = [
  { label: 'Donor', value: 'donor' },
  { label: 'Beneficiary', value: 'beneficiary' },
  { label: 'Carer', value: 'carer' },
  { label: 'Admin', value: 'admin' },
]

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

const emailPattern = /[^\s@]+@[^\s@]+\.[^\s@]+/

const { state } = useAuth()

const users = ref([])
const loadingUsers = ref(false)
const usersError = ref('')
const unsubscribeRef = ref(null)

const adminProfile = ref(null)
const adminProfileLoading = ref(false)
const adminProfileError = ref('')

const userStates = reactive({})

const firebaseUser = computed(() => {
  const user = state.user
  if (user?.provider === 'firebase' && user.uid) {
    return user
  }
  return null
})

const hasFirebaseAccess = computed(() => Boolean(db))

const isAdminUser = computed(() => {
  const roles = adminProfile.value?.roles
  if (Array.isArray(roles) && roles.includes('admin')) {
    return true
  }
  const username = state.user?.username
  return typeof username === 'string' && username.trim().toLowerCase() === 'admin'
})

const canManageUsers = computed(
  () => hasFirebaseAccess.value && Boolean(firebaseUser.value?.uid) && isAdminUser.value,
)

const ensureRowState = (id, defaults) => {
  if (!userStates[id]) {
    userStates[id] = {
      editedEmail: defaults.email,
      editedRoles: defaults.roles,
      saving: false,
      deleting: false,
      success: '',
      error: '',
      hasUserEdited: false,
    }
  }

  const state = userStates[id]

  if (!state.hasUserEdited || state.saving || state.deleting) {
    state.editedEmail = defaults.email
    state.editedRoles = defaults.roles
    state.hasUserEdited = false
  }

  return state
}

const normalizeRoles = (roles) => {
  if (!Array.isArray(roles)) return []
  const unique = [...new Set(roles.filter((role) => typeof role === 'string' && role.trim()))]
  return unique
}

const getRolesLabel = (roles) => {
  const normalized = normalizeRoles(roles)
  if (normalized.length === 0) {
    return 'No role assigned'
  }
  return normalized
    .map((role) => {
      const option = roleOptions.find((item) => item.value === role)
      return option?.label || role
    })
    .join(', ')
}

const formatRegistrationDate = (value) => {
  if (!value) return 'Unknown'

  if (typeof value.toDate === 'function') {
    const date = value.toDate()
    return Number.isNaN(date?.getTime()) ? 'Unknown' : dateFormatter.format(date)
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 'Unknown' : dateFormatter.format(value)
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? 'Unknown' : dateFormatter.format(date)
  }

  if (typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date)
  }

  return 'Unknown'
}

const stopListening = () => {
  if (typeof unsubscribeRef.value === 'function') {
    unsubscribeRef.value()
  }
  unsubscribeRef.value = null
}

const startListening = () => {
  stopListening()

  if (!canManageUsers.value) {
    users.value = []
    loadingUsers.value = false
    return
  }

  loadingUsers.value = true
  usersError.value = ''

  try {
    const usersCollection = collection(db, 'users')

    unsubscribeRef.value = onSnapshot(
      usersCollection,
      (snapshot) => {
        const seenIds = new Set()
        const nextUsers = snapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data() || {}
          const id = docSnapshot.id

          const username = typeof data.username === 'string' ? data.username : ''
          const email = typeof data.email === 'string' ? data.email : ''
          const roles = normalizeRoles(data.roles)
          const createdAt = data.createdAt || null

          seenIds.add(id)

          const state = ensureRowState(id, { email, roles })

          state.success = state.saving || state.deleting ? state.success : ''
          state.error = state.saving || state.deleting ? state.error : ''

          return {
            id,
            username,
            email,
            roles,
            createdAt,
            state,
          }
        })

        Object.keys(userStates).forEach((id) => {
          if (!seenIds.has(id)) {
            delete userStates[id]
          }
        })

        nextUsers.sort((a, b) => {
          const aTime = a.createdAt?.seconds || a.createdAt?.toMillis?.() || 0
          const bTime = b.createdAt?.seconds || b.createdAt?.toMillis?.() || 0
          return bTime - aTime
        })

        users.value = nextUsers
        loadingUsers.value = false
      },
      (error) => {
        console.error('Failed to load users', error)
        usersError.value = 'We were unable to load users. Please try again later.'
        users.value = []
        loadingUsers.value = false
      },
    )
  } catch (error) {
    console.error('Failed to initialize user listener', error)
    usersError.value = 'We were unable to load users. Please try again later.'
    users.value = []
    loadingUsers.value = false
  }
}

const loadAdminProfile = async () => {
  if (!hasFirebaseAccess.value || !firebaseUser.value?.uid) {
    adminProfile.value = null
    return
  }

  adminProfileLoading.value = true
  adminProfileError.value = ''

  try {
    const userDocRef = doc(db, 'users', firebaseUser.value.uid)
    const snapshot = await getDoc(userDocRef)

    if (snapshot.exists()) {
      adminProfile.value = snapshot.data()
    } else {
      adminProfile.value = null
    }
  } catch (error) {
    console.error('Failed to load admin profile', error)
    adminProfileError.value = 'We were unable to verify your admin permissions.'
    adminProfile.value = null
  } finally {
    adminProfileLoading.value = false
  }
}

const handleEmailChange = (id, value) => {
  const state = userStates[id]
  if (!state) return
  state.editedEmail = value
  state.hasUserEdited = true
  state.success = ''
  state.error = ''
}

const handleRoleChange = (id, value) => {
  const state = userStates[id]
  if (!state) return
  state.editedRoles = normalizeRoles(value)
  state.hasUserEdited = true
  state.success = ''
  state.error = ''
}

const hasChanges = (user) => {
  const state = userStates[user.id]
  if (!state) return false

  const normalizedEmail = (state.editedEmail || '').trim().toLowerCase()
  const originalEmail = (user.email || '').trim().toLowerCase()

  const currentRoles = normalizeRoles(state.editedRoles)
  const originalRoles = normalizeRoles(user.roles)

  const rolesChanged =
    currentRoles.length !== originalRoles.length ||
    currentRoles.some((role) => !originalRoles.includes(role))

  return normalizedEmail !== originalEmail || rolesChanged
}

const resetUserState = (user) => {
  const state = userStates[user.id]
  if (!state) return

  state.editedEmail = user.email
  state.editedRoles = normalizeRoles(user.roles)
  state.success = ''
  state.error = ''
  state.hasUserEdited = false
}

const updateUser = async (user) => {
  const state = userStates[user.id]
  if (!state || state.saving || state.deleting) return

  const trimmedEmail = (state.editedEmail || '').trim()

  if (!trimmedEmail) {
    state.error = 'Email is required.'
    state.success = ''
    return
  }

  if (!emailPattern.test(trimmedEmail)) {
    state.error = 'Please enter a valid email address.'
    state.success = ''
    return
  }

  const roles = normalizeRoles(state.editedRoles)

  state.saving = true
  state.error = ''
  state.success = ''

  try {
    const userDocRef = doc(db, 'users', user.id)
    await updateDoc(userDocRef, {
      email: trimmedEmail,
      roles,
      updatedAt: serverTimestamp(),
    })
    state.success = 'User updated successfully.'
    state.hasUserEdited = false
  } catch (error) {
    console.error('Failed to update user', error)
    state.error = 'We were unable to update this user. Please try again.'
  } finally {
    state.saving = false
  }
}

const deleteUser = async (user) => {
  const state = userStates[user.id]
  if (!state || state.saving || state.deleting) return

  const confirmed = typeof window !== 'undefined' ? window.confirm(`Delete ${user.username || 'this user'}?`) : true
  if (!confirmed) {
    return
  }

  state.deleting = true
  state.error = ''
  state.success = ''

  try {
    const userDocRef = doc(db, 'users', user.id)
    await deleteDoc(userDocRef)
  } catch (error) {
    console.error('Failed to delete user', error)
    state.error = 'We were unable to delete this user. Please try again.'
  } finally {
    state.deleting = false
  }
}

onMounted(() => {
  if (hasFirebaseAccess.value && firebaseUser.value?.uid) {
    loadAdminProfile()
  }
})

watch(
  () => firebaseUser.value?.uid,
  (newUid, oldUid) => {
    if (newUid && newUid !== oldUid) {
      loadAdminProfile()
    }

    if (!newUid) {
      adminProfile.value = null
      stopListening()
      users.value = []
    }
  },
)

watch(hasFirebaseAccess, (hasAccess) => {
  if (!hasAccess) {
    adminProfile.value = null
    stopListening()
    users.value = []
  }
})

watch(canManageUsers, (canManage) => {
  if (canManage) {
    startListening()
  } else {
    stopListening()
    users.value = []
  }
}, { immediate: true })

onBeforeUnmount(() => {
  stopListening()
})
</script>

<template>
  <section class="admin-user-manager">
    <h2 class="admin-user-manager__title">User Administration</h2>

    <div v-if="!hasFirebaseAccess" class="admin-user-manager__message">
      <Message severity="warn">Firebase has not been configured. Please add your Firebase credentials to manage users.</Message>
    </div>

    <div v-else-if="!firebaseUser" class="admin-user-manager__message">
      <Message severity="info">Sign in with your Firebase account to view registered users.</Message>
    </div>

    <div v-else>
      <div v-if="adminProfileLoading" class="admin-user-manager__message">
        <Message severity="info">Verifying your admin permissions…</Message>
      </div>

      <div v-else-if="adminProfileError" class="admin-user-manager__message">
        <Message severity="error">{{ adminProfileError }}</Message>
      </div>

      <div v-else-if="!isAdminUser" class="admin-user-manager__message">
        <Message severity="error">You need admin permissions to manage users.</Message>
      </div>

      <div v-else>
        <div v-if="loadingUsers" class="admin-user-manager__message">
          <Message severity="info">Loading registered users…</Message>
        </div>

        <div v-else-if="usersError" class="admin-user-manager__message">
          <Message severity="error">{{ usersError }}</Message>
        </div>

        <div v-else-if="users.length === 0" class="admin-user-manager__message">
          <Message severity="info">No registered users found.</Message>
        </div>

        <DataTable
          v-else
          :value="users"
          data-key="id"
          responsive-layout="scroll"
          class="admin-user-manager__table"
        >
          <Column field="username" header="Username" />

          <Column header="Email">
            <template #body="{ data }">
              <div class="admin-user-manager__field">
                <InputText
                  :model-value="data.state.editedEmail"
                  :disabled="data.state.saving || data.state.deleting"
                  @update:modelValue="(value) => handleEmailChange(data.id, value)"
                  class="w-full"
                />
              </div>
            </template>
          </Column>

          <Column header="User Role(s)">
            <template #body="{ data }">
              <div class="admin-user-manager__field">
                <MultiSelect
                  :model-value="data.state.editedRoles"
                  :options="roleOptions"
                  display="chip"
                  option-label="label"
                  option-value="value"
                  placeholder="Select roles"
                  class="admin-user-manager__multiselect"
                  :disabled="data.state.saving || data.state.deleting"
                  @update:modelValue="(value) => handleRoleChange(data.id, value)"
                />
                <div class="admin-user-manager__role-tags">
                  <Tag
                    v-for="role in normalizeRoles(data.state.editedRoles)"
                    :key="role"
                    :value="roleOptions.find((item) => item.value === role)?.label || role"
                    severity="info"
                  />
                </div>
              </div>
            </template>
          </Column>

          <Column field="createdAt" header="Registered">
            <template #body="{ data }">
              {{ formatRegistrationDate(data.createdAt) }}
            </template>
          </Column>

          <Column header="Actions" style="width: 16rem">
            <template #body="{ data }">
              <div class="admin-user-manager__actions">
                <Button
                  label="Save"
                  size="small"
                  :disabled="!hasChanges(data) || data.state.saving || data.state.deleting"
                  :loading="data.state.saving"
                  @click="() => updateUser(data)"
                />
                <Button
                  label="Reset"
                  severity="secondary"
                  size="small"
                  :disabled="!data.state.hasUserEdited || data.state.saving || data.state.deleting"
                  @click="() => resetUserState(data)"
                />
                <Button
                  label="Delete"
                  severity="danger"
                  size="small"
                  :loading="data.state.deleting"
                  :disabled="data.state.saving || data.state.deleting"
                  @click="() => deleteUser(data)"
                />
              </div>
              <div class="admin-user-manager__feedback">
                <small v-if="data.state.error" class="admin-user-manager__feedback--error">{{ data.state.error }}</small>
                <small v-else-if="data.state.success" class="admin-user-manager__feedback--success">
                  {{ data.state.success }}
                </small>
                <small v-else>{{ getRolesLabel(data.roles) }}</small>
              </div>
            </template>
          </Column>
        </DataTable>
      </div>
    </div>
  </section>
</template>

<style scoped>
.admin-user-manager {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.admin-user-manager__title {
  font-size: 1.75rem;
  font-weight: 600;
  margin: 0;
}

.admin-user-manager__message {
  max-width: 36rem;
}

.admin-user-manager__table :deep(.p-datatable) {
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.08);
}

.admin-user-manager__table :deep(.p-datatable .p-datatable-thead > tr > th) {
  font-weight: 600;
  background-color: rgba(13, 110, 253, 0.08);
}

.admin-user-manager__field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.admin-user-manager__multiselect {
  width: 100%;
}

.admin-user-manager__role-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.admin-user-manager__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.admin-user-manager__feedback {
  margin-top: 0.5rem;
  min-height: 1rem;
}

.admin-user-manager__feedback--error {
  color: #dc3545;
}

.admin-user-manager__feedback--success {
  color: #198754;
}
</style>
