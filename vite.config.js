import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

const createSendGridMiddleware = (options) => {
  const { apiKey, endpoint, defaultSenderEmail } = options

  let sgMailClientPromise

  const getSendGridClient = async () => {
    if (!sgMailClientPromise) {
      sgMailClientPromise = import('@sendgrid/mail').then((module) => {
        const client = module.default || module
        client.setApiKey(apiKey)
        return client
      })
    }

    return sgMailClientPromise
  }

  const collectRequestBody = async (request) =>
    new Promise((resolve, reject) => {
      let body = ''
      request.on('data', (chunk) => {
        body += chunk
      })
      request.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {})
        } catch (error) {
          reject(error)
        }
      })
      request.on('error', reject)
    })

  const buildMessage = (payload) => {
    const to = payload?.to
    const from = payload?.from
    const subject = typeof payload?.subject === 'string' ? payload.subject.trim() : ''
    const text = typeof payload?.text === 'string' ? payload.text : ''
    const html = typeof payload?.html === 'string' ? payload.html : ''
    const attachments = Array.isArray(payload?.attachments) ? payload.attachments : []

    if (!to || typeof to.email !== 'string' || !to.email.trim()) {
      throw new Error('A valid recipient email address is required.')
    }

    const senderEmail =
      (typeof from?.email === 'string' && from.email.trim()) || defaultSenderEmail || ''

    if (!senderEmail) {
      throw new Error('A verified sender email address has not been configured.')
    }

    const message = {
      to: [{ email: to.email.trim(), name: typeof to.name === 'string' ? to.name : undefined }],
      from: {
        email: senderEmail,
        name: typeof from?.name === 'string' ? from.name : undefined,
      },
      subject: subject || 'Message from Health Charity App',
      text: text,
      html: html || text?.replace?.(/\n/g, '<br />') || text,
    }

    if (attachments.length > 0) {
      message.attachments = attachments
        .filter((attachment) =>
          attachment && typeof attachment.content === 'string' && attachment.content.trim(),
        )
        .map((attachment) => ({
          content: attachment.content.trim(),
          filename:
            typeof attachment.filename === 'string' && attachment.filename.trim()
              ? attachment.filename.trim()
              : 'attachment',
          type:
            typeof attachment.type === 'string' && attachment.type.trim()
              ? attachment.type.trim()
              : 'application/octet-stream',
          disposition: 'attachment',
        }))
    }

    return message
  }

  const sendgridHandler = async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (request.method === 'OPTIONS') {
      response.statusCode = 204
      response.end()
      return
    }

    if (request.method !== 'POST') {
      response.statusCode = 405
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }))
      return
    }

    if (!apiKey) {
      response.statusCode = 500
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ error: 'SendGrid API key is not configured on the server.' }))
      return
    }

    try {
      const client = await getSendGridClient()
      const payload = await collectRequestBody(request)
      const message = buildMessage(payload)
      await client.send(message)

      response.statusCode = 200
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ success: true }))
    } catch (error) {
      console.error('Failed to send email via SendGrid', error)
      const statusCode = error?.code && Number.isInteger(error.code) ? error.code : 500
      response.statusCode = statusCode >= 400 && statusCode < 600 ? statusCode : 500
      response.setHeader('Content-Type', 'application/json')

      const errorMessage =
        error?.response?.body?.errors?.[0]?.message || error?.message || 'Unable to send email.'

      response.end(JSON.stringify({ error: errorMessage }))
    }
  }

  return (req, res, next) => {
    if (!req.url) {
      next()
      return
    }

    const requestUrl = new URL(req.url, 'http://localhost')
    if (requestUrl.pathname !== endpoint) {
      next()
      return
    }

    sendgridHandler(req, res)
  }
}

const createSendGridPlugin = (options) => ({
  name: 'health-charity-sendgrid-endpoint',
  configureServer(server) {
    server.middlewares.use(createSendGridMiddleware(options))
  },
  configurePreviewServer(server) {
    server.middlewares.use(createSendGridMiddleware(options))
  },
})

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const apiKey = env.VITE_SENDGRID_API_KEY || env.SENDGRID_API_KEY || ''
  const endpoint = env.VITE_SENDGRID_ENDPOINT || '/api/send-email'
  const defaultSenderEmail = env.VITE_SENDGRID_FROM_EMAIL || env.SENDGRID_FROM_EMAIL || ''

  const plugins = [vue(), vueDevTools()]

  plugins.push(createSendGridPlugin({ apiKey, endpoint, defaultSenderEmail }))

  return {
    plugins,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
