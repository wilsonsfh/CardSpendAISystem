import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'groq-proxy',
      /**
       * Intercepts POST /api/llm-suggest in the Vite dev server (Node.js process).
       * The API key is read from process.env here — it never reaches the browser bundle.
       */
      configureServer(server) {
        const env = loadEnv('development', process.cwd(), '')
        server.middlewares.use('/api/llm-suggest', (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end()
            return
          }

          const apiKey = env.GROQ_API_KEY
          if (!apiKey) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'GROQ_API_KEY not set in .env' }))
            return
          }

          let body = ''
          req.on('data', (chunk: Buffer) => { body += chunk.toString() })
          req.on('end', async () => {
            try {
              const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${apiKey}`,
                },
                body,
              })
              const data = await groqRes.text()
              res.statusCode = groqRes.status
              res.setHeader('Content-Type', 'application/json')
              res.end(data)
            } catch (err) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: String(err) }))
            }
          })
        })
      },
    },
  ],
  test: {
    environment: 'jsdom',
  },
})
