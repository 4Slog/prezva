// Phase 4.5 — friendly permission message map. Static constant (NO db lookup on error path).
// Each value completes: "You don't have permission to ___." Keep lowercase, verb-first, human.
// 57 keys total (matches permissions catalog). Source of truth for CC to drop into the PermissionError module.

export const PERMISSION_LABELS: Record<string, string> = {
  // org
  'org.settings': 'change organization settings',
  'org.branding': 'change organization branding',
  'org.billing': 'manage billing and subscription',
  'org.members.view': 'view team members',
  'org.members.manage': 'manage team members',
  'org.members.invite': 'invite or remove team members',
  'org.roles.view': 'view roles',
  'org.roles.manage': 'create or edit roles',
  'org.delete': 'delete the organization',
  'org.templates.view': 'view templates',
  'org.templates.manage': 'manage templates',
  'org.speaker_library.view': 'view the speaker library',
  'org.speaker_library.manage': 'manage the speaker library',
  'org.integrations': 'manage organization integrations',
  'org.certificate_templates': 'manage certificate templates',
  'org.audit_log': 'view the organization audit log',
  // event core
  'event.manage': 'create or configure events',
  'event.tickets': 'manage tickets and pricing',
  'attendees.view': 'view attendees',
  'attendees.edit': 'edit attendees',
  'attendees.refund': 'issue refunds',
  'checkin.manage': 'check in attendees',
  'checkin.undo': 'undo a check-in',
  'agenda.view': 'view the agenda',
  'agenda.manage': 'manage the agenda',
  'speakers.view': 'view speakers',
  'speakers.manage': 'manage speakers',
  'volunteers.manage': 'manage volunteers',
  'badges.manage': 'manage badges',
  // engagement
  'announcements.manage': 'view announcements',
  'announcements.send': 'send announcements',
  'surveys.view': 'view surveys',
  'surveys.manage': 'build or edit surveys',
  'networking.view': 'view networking',
  'networking.manage': 'manage networking',
  'community.manage': 'manage the community feed',
  'photos.manage': 'manage photos',
  'leaderboard.view': 'view the leaderboard',
  'leaderboard.manage': 'manage the leaderboard',
  'icebreakers.manage': 'manage icebreakers',
  'trivia.manage': 'manage trivia',
  'passport.manage': 'manage the passport game',
  'qa.view': 'view session Q&A',
  'qa.moderate': 'moderate session Q&A',
  // advanced
  'sponsors.view': 'view sponsors',
  'sponsors.manage': 'manage sponsors',
  'certificates.manage': 'manage certificates',
  'analytics.view': 'view analytics',
  'analytics.manage': 'manage analytics',
  'event.audit_log': 'view the event audit log',
  'failed_jobs.manage': 'retry failed jobs',
  'run_of_show.view': 'view the run of show',
  'run_of_show.manage': 'manage the run of show',
  'event.integrations': 'manage event integrations',
  'video.view': 'view live video',
  'video.manage': 'manage live video',
}

// Fallback when a key isn't in the map (shouldn't happen): generic message.
export const PERMISSION_FALLBACK = 'perform this action'
