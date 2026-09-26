import { notFound } from 'next/navigation'

// O171 / H-R5: group chat is hidden for launch — the group tables allow only
// the service role while the actions use the member's client, so it cannot
// work today. The proper fix is O176; groups-client.tsx and
// sprint8-group-actions.ts stay for it.
export default function GroupsPage() {
  notFound()
}
