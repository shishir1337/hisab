// Deletes the calling user's account (spec §8). All their rows cascade from auth.users.
// The service-role key never leaves this function; the caller is identified only from their JWT.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const authorization = req.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return json(401, { error: 'Not signed in' })

  const url = Deno.env.get('SUPABASE_URL')!
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } })
  const { data, error } = await asCaller.auth.getUser()
  if (error || !data.user) return json(401, { error: 'Not signed in' })

  let body: { confirm?: string } = {}
  try {
    body = await req.json()
  } catch {
    // fall through
  }
  if (body.confirm !== 'DELETE') return json(400, { error: 'Type DELETE to confirm' })

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { error: delError } = await admin.auth.admin.deleteUser(data.user.id)
  if (delError) return json(500, { error: 'Could not delete the account. Please try again.' })
  return json(200, { deleted: true })
})
