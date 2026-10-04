// Receives posts from the iPhone Shortcut (tech-spec section 4). The logic is
// in handler.ts; this file connects it to the database.
import { adminClient } from '../_shared/http.ts'
import { wording } from '../_shared/wording.ts'
import { handleIngest, type StoreReply } from './handler.ts'

const admin = adminClient()

Deno.serve(async (req) => {
  try {
    return await handleIngest(req, {
      now: () => new Date(),
      // Sizes and counts only (IngestLogEntry), to measure posts.
      log: (entry) => console.log(JSON.stringify({ event: 'ingest', ...entry })),
      store: async (tokenHash, upload, rejection) => {
        const { data, error } = await admin.rpc('ingest_upload', {
          p_token_hash: tokenHash,
          p_upload: upload,
          p_error: rejection,
        })
        if (error) throw new Error(`ingest_upload failed: ${error.message}`)
        return data as StoreReply
      },
    })
  } catch (e) {
    console.error('ingest:', e instanceof Error ? e.message : 'unknown error')
    return new Response(JSON.stringify({ error: 'server_error', message: wording.sync.failed }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
