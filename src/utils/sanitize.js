const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g
const SCRIPT_TAG = /<\/?script[^>]*>/gi
const ANGLE_BRACKETS = /[<>]/g
const MULTIPLE_SPACES = /\s+/g
const INVALID_URL_PROTOCOL = /^(?:javascript|data|vbscript|file):/i
const SIMPLE_RELATIVE_URL = /^(?:\.{0,2}\/)?[\w\-./]+$/

const stripDangerousSequences = (value) => {
  return value
    .replace(CONTROL_CHARACTERS, '')
    .replace(SCRIPT_TAG, '')
    .replace(ANGLE_BRACKETS, '')
}

export const sanitizeSingleLineText = (value, { maxLength } = {}) => {
  if (typeof value !== 'string') {
    return ''
  }

  let cleaned = stripDangerousSequences(value)
  cleaned = cleaned.replace(MULTIPLE_SPACES, ' ').trim()

  if (typeof maxLength === 'number' && maxLength > 0 && cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength)
  }

  return cleaned
}

export const sanitizeMultilineText = (value, { maxLength } = {}) => {
  if (typeof value !== 'string') {
    return ''
  }

  let cleaned = stripDangerousSequences(value)

  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.replace(MULTIPLE_SPACES, ' ').trim())
    .filter((line) => line)

  cleaned = lines.join('\n')

  if (typeof maxLength === 'number' && maxLength > 0 && cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength)
  }

  return cleaned
}

export const sanitizeUrl = (value) => {
  if (typeof value !== 'string') {
    return ''
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  if (INVALID_URL_PROTOCOL.test(trimmed)) {
    return ''
  }

  if (trimmed.startsWith('//')) {
    return ''
  }

  try {
    const parsed = new URL(trimmed, 'https://placeholder.local')
    if (parsed.origin === 'https://placeholder.local') {
      return SIMPLE_RELATIVE_URL.test(trimmed) ? trimmed : ''
    }

    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href
    }
  } catch (error) {
    if (SIMPLE_RELATIVE_URL.test(trimmed)) {
      return trimmed
    }

    return ''
  }

  return ''
} 
