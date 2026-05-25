#!/usr/bin/env tsx
/**
 * Confirm test email addresses via Supabase admin API.
 * Usage: tsx scripts/confirm-test-email.ts user@example.com [user2@example.com ...]
 */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function confirmEmail(email: string) {
  const { data: user, error: fetchErr } = await admin
    .from('auth.users')
    .select('id, email, email_confirmed_at')
    .eq('email', email)
    .maybeSingle()

  // Use admin SQL approach since auth.users isn't accessible via JS client select
  const { error } = await admin.rpc('confirm_user_email' as any, { user_email: email }).maybeSingle()
    .then(() => ({ error: null }))
    .catch(() => ({ error: new Error('RPC not available') }))

  // Fall back to updateUserById if we have the user ID
  const { data: { users }, error: listErr } = await admin.auth.admin.listUsers()
  if (listErr) {
    console.error(`  Error listing users: ${listErr.message}`)
    return
  }

  const found = users.find((u: any) => u.email === email)
  if (!found) {
    console.error(`  User not found: ${email}`)
    return
  }

  if (found.email_confirmed_at) {
    console.log(`  Already confirmed: ${email} (${found.id})`)
    return
  }

  const { error: updateErr } = await admin.auth.admin.updateUserById(found.id, {
    email_confirm: true,
  })

  if (updateErr) {
    console.error(`  Failed to confirm ${email}: ${updateErr.message}`)
  } else {
    console.log(`  Confirmed: ${email} (${found.id})`)
  }
}

const emails = process.argv.slice(2)
if (emails.length === 0) {
  console.error('Usage: tsx scripts/confirm-test-email.ts email1 [email2 ...]')
  process.exit(1)
}

console.log(`Confirming ${emails.length} email(s)...`)
Promise.all(emails.map(confirmEmail)).then(() => console.log('Done.'))
