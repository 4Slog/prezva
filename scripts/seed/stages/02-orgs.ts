/**
 * Stage 02 — Orgs + Org Members
 *
 * For each org in data/orgs.json:
 *   1. Ensures every roster persona exists via ensurePersona() (idempotent).
 *   2. Upserts the organizations row keyed by id.
 *   3. Upserts org_members rows keyed by (org_id, user_id).
 *
 * No auto-owner trigger exists on organizations (verified: only trg_organizations_updated_at).
 * The owner org_members row is inserted explicitly, mirroring createOrg in actions.ts:108-113:
 *   invited_by = owner's profiles.id (owner "invited themselves").
 *
 * Dry-run: performs only reads (resolving existing persona IDs); no writes.
 * Execute: creates personas, upserts orgs, upserts memberships — all idempotent.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { ensurePersona, type PersonaMode } from '../lib/personas'
import { log } from '../lib/logger'
import type { StageSummary } from '../lib/logger'
import { seedBuiltinRoles } from '../../../src/lib/orgs/seed-builtin-roles'

interface OrgMember {
  id?: string
  email: string
  full_name: string
  job_title?: string
  company?: string
  mode: PersonaMode
  role: 'owner' | 'admin' | 'staff'
}

export interface OrgData {
  id: string
  name: string
  slug: string
  timezone: string
  description?: string
  website?: string
  email?: string
  city?: string
  state?: string
  country?: string
  members: OrgMember[]
}

export interface OrgsFileData {
  orgs: OrgData[]
}

export async function runOrgs(
  supabase: SupabaseClient,
  data: OrgsFileData,
  opts: { dryRun: boolean },
): Promise<StageSummary> {
  log.section('Stage 02: Orgs + Org Members')

  const totalOrgs    = data.orgs.length
  const totalMembers = data.orgs.reduce((s, o) => s + o.members.length, 0)

  log.info(`Plan: ${totalOrgs} org(s), ${totalMembers} total membership(s)`)

  if (opts.dryRun) {
    for (const org of data.orgs) {
      log.dry(`upsert org "${org.name}" (id ${org.id}, slug "${org.slug}")`)
      for (const member of org.members) {
        // Read-only: try to resolve existing profile id
        const existing = await ensurePersona(
          supabase,
          { id: member.id, email: member.email, full_name: member.full_name,
            job_title: member.job_title, company: member.company, mode: member.mode },
          { dryRun: true },
        )
        if (existing) {
          log.dry(`  ${member.role.padEnd(5)} ${member.email} (${existing.profileId.slice(0, 8)}…) — already exists`)
        } else {
          log.dry(`  ${member.role.padEnd(5)} ${member.email} — would create persona then add as ${member.role}`)
        }
      }
    }
    log.info('')
    log.ok('Dry-run complete — no writes made')
    return { stage: 'orgs', planned: totalOrgs, actual: 0, note: 'dry-run' }
  }

  // ── Execute path ──────────────────────────────────────────────────────────────
  let actualOrgs = 0

  for (const org of data.orgs) {
    console.log(`\n  \x1b[1m▸ ${org.name}\x1b[0m`)

    // Step 1: Ensure all member personas exist and collect resolved IDs
    const resolvedMembers: Array<{ profileId: string; role: OrgMember['role']; email: string }> = []

    for (const member of org.members) {
      const result = await ensurePersona(
        supabase,
        { id: member.id, email: member.email, full_name: member.full_name,
          job_title: member.job_title, company: member.company, mode: member.mode },
        opts,
      )
      if (!result) {
        log.warn(`  Could not resolve persona for ${member.email} — skipping membership`)
        continue
      }
      resolvedMembers.push({ profileId: result.profileId, role: member.role, email: member.email })
    }

    const ownerMember = resolvedMembers.find(m => m.role === 'owner')

    // Step 2: Upsert the organization row (keyed by id; slug unique constraint handled by onConflict)
    const { error: orgErr } = await supabase.from('organizations').upsert(
      {
        id:          org.id,
        name:        org.name,
        slug:        org.slug,
        timezone:    org.timezone,
        description: org.description ?? null,
        website:     org.website     ?? null,
        email:       org.email       ?? null,
        city:        org.city        ?? null,
        state:       org.state       ?? null,
        country:     org.country     ?? 'US',
        created_by:  ownerMember?.profileId ?? null,
      },
      { onConflict: 'id' },
    )
    if (orgErr) throw new Error(`upsert org "${org.name}" (${org.slug}): ${orgErr.message}`)
    log.ok(`Org upserted — ${org.name} (/${org.slug})`)

    // Step 3: Seed built-in roles (idempotent — mirrors createOrg prod path).
    // Ensures dev seed matches production: owner(57)/admin(55)/staff(28) roles seeded.
    try {
      await seedBuiltinRoles(org.id, supabase)
      log.ok(`  built-in roles seeded (owner/admin/staff)`)
    } catch (e) {
      log.warn(`  seedBuiltinRoles failed for ${org.slug}: ${e}`)
    }

    // Resolve all 3 built-in role IDs so each member gets role_id set.
    const { data: builtinRoles } = await supabase
      .from('roles')
      .select('id, slug')
      .eq('org_id', org.id)
      .in('slug', ['owner', 'admin', 'staff'])
      .eq('is_builtin', true)
    const roleIdBySlug: Record<string, string> = Object.fromEntries(
      (builtinRoles ?? []).map(r => [r.slug as string, r.id as string]),
    )

    // Step 4: Upsert org_members (keyed by (org_id, user_id))
    // Mirror app pattern (actions.ts): invited_by = owner's profiles.id.
    // Dual-write: role enum + role_id FK so RBAC works from day one.
    for (const m of resolvedMembers) {
      const { error: memberErr } = await supabase.from('org_members').upsert(
        {
          org_id:     org.id,
          user_id:    m.profileId,
          role:       m.role,
          role_id:    roleIdBySlug[m.role] ?? null,
          invited_by: ownerMember?.profileId ?? m.profileId,
        },
        { onConflict: 'org_id,user_id' },
      )
      if (memberErr) {
        log.warn(`  org_members ${m.email} (${m.role}): ${memberErr.message}`)
      } else {
        log.info(`  member — ${m.email} → ${m.role}`)
      }
    }

    actualOrgs++
  }

  log.ok(`Stage 02 complete — ${actualOrgs}/${totalOrgs} org(s) seeded`)
  return { stage: 'orgs', planned: totalOrgs, actual: actualOrgs }
}
