/**
 * Stage 07 — Images
 *
 * SQL-only UPDATE stage: no file uploads. Sets DiceBear avatar URLs for speakers
 * and org logo URLs directly on the DB rows.
 *
 * Speaker photo_url: DiceBear personas style, seeded by speaker name.
 * EXCEPTION: speakers with photo_url=null in events.json keep null (exercises no-photo rendering).
 *
 * Org logo_url: DiceBear initials style with Prezva brand colors (navy bg, teal text).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventsFileData } from '../lib/event-types'
import { log } from '../lib/logger'
import type { StageSummary } from '../lib/logger'

export interface OrgBasicDef {
  id: string
  name: string
}

export interface ImagesOrgData {
  orgs: OrgBasicDef[]
}

// ─── URL builders ─────────────────────────────────────────────────────────────

function speakerPhotoUrl(name: string): string {
  return `https://api.dicebear.com/7.x/personas/svg?seed=${encodeURIComponent(name)}`
}

function orgLogoUrl(name: string): string {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=0d1b2a&textColor=2dd4bf`
}

// ─── Planned count (dry-run) ──────────────────────────────────────────────────

function countSpeakersToUpdate(eventsData: EventsFileData): number {
  let n = 0
  for (const ev of eventsData.events) {
    for (const sp of ev.speakers ?? []) {
      if (sp.photo_url !== null) n++  // keep null speakers as-is (Taylor Kim)
    }
  }
  return n
}

// ─── Main exported function ───────────────────────────────────────────────────

export async function runImages(
  supabase: SupabaseClient,
  eventsData: EventsFileData,
  orgsData: ImagesOrgData,
  opts: { dryRun: boolean },
): Promise<StageSummary> {
  log.section('Stage 07: Images (DiceBear speaker photos + org logos)')

  const plannedSpeakers = countSpeakersToUpdate(eventsData)
  const plannedOrgs = orgsData.orgs.length
  const totalPlanned = plannedSpeakers + plannedOrgs

  log.info(`Plan: ${plannedSpeakers} speaker photo_url updates, ${plannedOrgs} org logo_url updates`)

  if (opts.dryRun) {
    log.dry(`speakers: ${plannedSpeakers} rows would be updated (null photo_url speakers kept null)`)
    log.dry(`orgs: ${plannedOrgs} rows would be updated`)
    log.info('')
    log.ok('Dry-run complete — no writes made')
    return { stage: 'images', planned: totalPlanned, actual: 0, note: 'dry-run' }
  }

  // ── Execute: update speaker photo_url ─────────────────────────────────────
  let speakerActual = 0
  for (const ev of eventsData.events) {
    for (const sp of ev.speakers ?? []) {
      if (sp.photo_url === null) {
        // Deliberately keep null — exercises the no-photo rendering case
        continue
      }
      const url = speakerPhotoUrl(sp.name)
      const { error } = await supabase
        .from('speakers')
        .update({ photo_url: url })
        .eq('id', sp.id)
      if (error) {
        log.warn(`speaker "${sp.name}" (${sp.id}): ${error.message}`)
      } else {
        speakerActual++
      }
    }
  }

  // ── Execute: update org logo_url ──────────────────────────────────────────
  let orgActual = 0
  for (const org of orgsData.orgs) {
    const url = orgLogoUrl(org.name)
    const { error } = await supabase
      .from('organizations')
      .update({ logo_url: url })
      .eq('id', org.id)
    if (error) {
      log.warn(`org "${org.name}" (${org.id}): ${error.message}`)
    } else {
      orgActual++
    }
  }

  const actual = speakerActual + orgActual
  log.ok(`Stage 07 complete — ${speakerActual} speaker photo_urls, ${orgActual} org logo_urls updated`)
  return { stage: 'images', planned: totalPlanned, actual }
}
