import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { TwoFactorSetup } from '@/components/security/TwoFactorSetup'

export default async function SecuritySettingsPage() {
  await requireUser()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const factors = (user as any)?.factors ?? []
  const totpFactor = factors.find((f: any) => f.factor_type === 'totp') ?? null

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-[var(--pz-text)]">Security Settings</h1>
        <p className="text-sm text-[var(--pz-muted)] mt-1">Manage two-factor authentication and account security.</p>
      </div>
      <TwoFactorSetup existingFactor={totpFactor} />
    </div>
  )
}
