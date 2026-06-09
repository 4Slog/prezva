# GE-0 Reconciliation Report — Pre-Build Audit

**Date:** 2026-06-09
**Branch audited:** `main` @ `f2abb9a`
**Companion branch:** `origin/feature/ghl-integration` (3 unique commits, 305 behind main)
**Build plan ref:** `~/.claude/global-memory/prezva_ghl_build_plan.md` §GE-0
**Status:** APPROVED — locked decisions recorded below; GE-1 may proceed.

---

## 1. Repo State

| Item | Value |
|---|---|
| Branch | `main` |
| HEAD | `f2abb9a` |
| App-code working tree | Clean |
| Modified files | 7 e2e spec files + `ci.yml` (test/CI artifacts only) |
| Untracked | `e2e/authenticated-access.spec.ts`, `e2e/constants.ts`, `e2e/lib/`, `e2e/lifecycle.spec.ts`, `test-results/` |

Working tree dirt is entirely in `e2e/` and does not affect the build. Safe to continue.

---

## 2. Registration / Payment Seam

### Functions present in `src/lib/registration/actions.ts`

| Function | Visibility | Notes |
|---|---|---|
| `validateDiscountCode` | exported | standalone discount lookup |
| `startRegistration` | exported | main server action, called from the register form |
| `confirmFreeRegistration` | **private** | free/RSVP path — clean injection point |
| `createPaidRegistration` | **private** | Stripe Checkout path |
| `saveFieldResponses` | private helper | shared by both paths |
| `virtualCheckIn` | exported | post-registration virtual check-in |
| `addToWaitlist` | private | called from `startRegistration` when capacity full |

**`refundRegistration` does NOT exist on main.** The GE-4 build plan references refactoring it — that assumption is wrong. GE-4 refund handling must locate the actual refund/cancellation path, which is a Stripe webhook handler (likely in `src/app/api/webhooks/stripe/`), not a standalone function. Do not plan a refactor of a nonexistent entry point.

### `confirmFreeRegistration` and `createPaidRegistration` are private

Both functions are module-private (not exported). The GHL inbound registration seam (GE-4) **cannot call them directly** from outside the module. GE-4 must introduce a new exported entry point (e.g., `registerViaGhl`) inside `actions.ts` that validates the GHL context and delegates to `confirmFreeRegistration` or `createPaidRegistration` as appropriate.

### `stripe_account_id` gate — AFTER fork, PAID-CONDITIONAL

The gate fires **after** the free/paid fork and **only in the paid branch**. Exact sequence in `startRegistration`:

```ts
// Line 220 — fork first; free path exits here, never sees Stripe
if (ticket.type === 'free' || ticket.price_cents === 0) {
  return await confirmFreeRegistration(...)
}

// Line 235 — gate only reached on paid path
const org = event.organizations as { ...; stripe_account_id: string | null } | null
if (!org?.stripe_account_id) {
  return { error: 'This organization has not connected a bank account yet...' }
}
// Also verifies account.charges_enabled && account.details_submitted (lines 241–245)
```

**Implication for GHL build:**
- **FREE/RSVP seam (GE-4a):** completely clean — no Stripe dependency, no account check. A new `registerViaGhl` exporting a thin wrapper around `confirmFreeRegistration` is straightforward and self-contained.
- **PAID seam (GE-4b):** the `stripe_account_id` gate must be bypassed or adapted for GHL-originated paid registrations (where payment was taken by GHL, not Stripe). The refactor is localised to `startRegistration` / `createPaidRegistration` — no schema change required.

---

## 3. Integration Registry

**File:** `src/lib/integrations/_shared/registry.ts`

**16 providers registered on `main`:**

```
outlook, zoom, teams, google_drive, sharepoint,
mailchimp, constant_contact, google_forms,
eventbrite, wildapricot, imis, memberclicks,
yourmembership, glue_up, neon, novi
```

**GHL is NOT registered on main.** Registration of `ghl` → `ghlAdapter` is part of GE-1/GE-2 work and must be added when the adapter is copied to main.

---

## 4. Route Groups

**Existing route groups (parenthetical, layout-scoped):**

| Group | Contents |
|---|---|
| `(admin)` | admin panel pages |
| `(auth)` | login, signup, forgot-password, invite |
| `(dashboard)` | dashboard, events, orgs, settings, dev, help |

**Non-group top-level segments:** `admin`, `api`, `auth`, `checkin`, `discover`, `e`, `lobby`, `lookup`, `mc`, `me`, `o`, `onboarding`, `press`, `privacy`, `sms`, `speaker`, `sponsor-portal`, `survey`, `terms`, `verify`, `volunteer`.

**`/embedded` does not exist on `main`.** The GHL branch adds routes under `/api/integrations/ghl/` and `/api/webhooks/ghl/` but never creates an embedded route group.

---

## 5. Feature-Flag Mechanism

**None exists on main.** No `NEXT_PUBLIC_FEATURE_*` env vars, no `feature_flags` DB table, no flag helper, no flag library. GHL-mode isolation is handled entirely by route separation.

---

## 6. Per-Org Branding / Theming

**Current implementation (two layers):**

1. `src/lib/brand.ts` — platform-wide Prezva brand constants (colors, typography, radius) for JS/TS contexts. CSS variables for dark chrome (sidebars, kiosk) in `globals.css`.
2. `organizations.logo_url` (DB column, set in migration `0001`) — per-org logo URL; displayed on the public org profile page (`/o/[slug]`). No per-org color theming, no CSS-variable injection, no `BrandContext`, no theme provider.

`org.branding` is an RBAC permission key (gates who can edit branding settings) — not a runtime theming object.

**Implication:** The `EmbeddedBrandProvider` context (locked decision §3) is net-new. No existing infrastructure to build on; no schema column to add yet.

---

## 7. Outbound Dispatch / Integration Sync Pattern

**Confirmed: no outbound event-dispatch infrastructure exists.** Search for `dispatch`, `emit`, `emit(`, `outbound`, `EventBus`, `emitter`, `webhook-out` across `src/lib/integrations/` and all of `src/lib/` returned zero results.

All 16 existing integrations are **pull-only** (manual sync triggered by user action or scheduled job). Real-time GHL sync (and upgrades to existing integrations) requires a net-new dispatch layer — this is **component #1** in the GHL build (GE-4).

---

## 8. Migration State

| Item | Value |
|---|---|
| Migration files in `supabase/migrations/` | **102** |
| Latest migration | `0101_rbac_retire_has_org_role.sql` |
| Applied state (Supabase MCP) | Not verified this session (MCP requires re-auth); file ledger matches prior audit. |

The GHL branch adds migrations `0028_sprint27_hardening.sql` and `0029_ghl_integration.sql` — both conflict with current main numbering (main is at `0101`). These migration files are **not salvageable**; GHL schema additions must be written as `0102+` against current main.

---

## 9. `feature/ghl-integration` Branch Audit

### Ahead / behind

```
git rev-list --left-right --count main...origin/feature/ghl-integration
→ 305  3
```

- **305 commits in `main` NOT in the branch** — main has moved on 305 commits since the branch was cut.
- **3 commits in the branch NOT in `main`** — the branch adds only 3 unique commits.

The branch is **305 commits behind `main`**. It predates: the RBAC system (Phases 1–7), the full nav refactor, rate limiting on registration, sms_opt_in, split first/last name support, delivery_method, check_ins table migration, permission-gated ticket actions, and the full sidebar/event-nav rebuild.

### Diff stat (vs common ancestor)

```
45 files changed, +2,358 insertions, −208 deletions
```

This measures the branch's delta from its old divergence point — not from current `main`. Several files the branch modifies (`registration/actions.ts`, `layout.tsx`, `Sidebar.tsx`, `stripe/checkout.ts`, `dashboard/page.tsx`) are significantly older versions that would regress main if merged.

### Files of interest on the branch

| File | Status |
|---|---|
| `src/lib/integrations/ghl/adapter.ts` | ✅ **Salvage** — clean, interface-compatible |
| `src/lib/integrations/ghl/client.ts` | ✅ **Salvage** — clean `ghlGet`/`ghlPost`/`ghlPut` helpers |
| `src/app/api/webhooks/ghl/route.ts` | ✅ **Salvage as skeleton** — HMAC verification + event switch |
| `src/lib/integrations/_shared/registry.ts` (branch delta) | ✅ **Copy the 2 added lines only** |
| `supabase/migrations/0028_*.sql` + `0029_*.sql` | ❌ Wrong migration numbers — rewrite as 0102+ |
| `src/app/(dashboard)/layout.tsx` | ❌ Old version — do not merge |
| `src/components/layout/Sidebar.tsx` | ❌ Old version — do not merge |
| `src/lib/registration/actions.ts` (branch) | ❌ Old version (no rate limit, no split-name, no sms_opt_in) |
| All volunteer/dead-letters/sponsors pages | ❌ Either stale or already shipped differently on main |

**Decision: PARTIAL SALVAGE.** Do not merge or cherry-pick the branch. Extract only the four salvageable items above into a clean copy-paste onto `main`.

---

## 10. GHL Adapter Structure

From `src/lib/integrations/ghl/adapter.ts` and `client.ts` on the branch:

| Item | Value |
|---|---|
| Base API URL | `https://services.leadconnectorhq.com` |
| OAuth auth URL | `https://marketplace.gohighlevel.com/oauth/chooselocation` |
| API version header | `Version: 2021-07-28` |
| OAuth scopes | `contacts.readonly contacts.write locations.readonly opportunities.write` |
| Token storage | `org_integrations` table — existing schema, encrypted via `_shared/encryption` |
| Refresh strategy | Auto-refresh if token expires within 5 minutes |
| Org fields added | `organizations.ghl_location_id`, `organizations.ghl_account_id` (on callback) |

The `GhlAdapter` class fully implements the existing `IntegrationAdapter` interface and slots cleanly into the existing registry Map.

### OAuth vs. Private Integration Token

The salvaged `GhlAdapter` implements the **full OAuth2 flow** (authorization-code + refresh). GE-1 through GE-5 dev/demo path uses the **static Private Integration Token (PIT)** that already lives in `.env.local` (148 scopes, location-scoped). 

**Resolution:** feed the PIT directly into the `ghlGet`/`ghlPost`/`ghlPut` helpers via a shim in GE-1 (bypass `getAccessToken`; inject the PIT as a bearer token). Defer full OAuth wiring — the `GhlAdapter.handleCallback` / `getAccessToken` flow — to GE-8 (multi-tenant / production auth).

---

## 11. Locked Decisions

### Route-group name
**`/embedded`** — a real route segment (not parenthetical) with its own iframe-aware layout. Events live at `/embedded/events`. Keeps GHL terms out of public URLs and callbacks; reusable for any future CRM embedding.

### Feature-flag mechanism
**Env-var kill switch only:** `GHL_EVENTS_ENABLED=true` gates the `/embedded` surface at the layout/middleware level. Per-org GHL enablement is the existing data relationship (`organizations.ghl_location_id` is non-null → org is GHL-connected). No new flag framework, no DB flag table. Standalone isolation comes from route separation.

### White-label provider
**`EmbeddedBrandProvider`** — a React context wrapping the `/embedded` layout. Fed by a `resolveEmbeddedBrand(orgId)` function that returns a neutral preset now (no Prezva marketing chrome; "Powered by Prezva" footer only) and is architected to accept per-org/agency branding later. **No schema column added now** — branding DB work deferred to GE-6/GE-8.

---

## 12. Explicit Corrections to the Build Plan

These supersede assumptions in `prezva_ghl_build_plan.md`:

| Build plan assumption | Correction |
|---|---|
| GE-4: "PAID refactor: refactor `refundRegistration()`" | `refundRegistration()` **does not exist on main**. Locate the real refund path (Stripe webhook handler in `/api/webhooks/stripe/`) and work from there. |
| GE-4: "wire `confirmFreeRegistration()` to the GHL inbound path" | Both `confirmFreeRegistration` and `createPaidRegistration` are private. GE-4 must introduce a new **exported** entry point (e.g., `registerViaGhl`) in `actions.ts` that calls them. |
| GE-1–5: "full OAuth wiring via salvaged GhlAdapter" | Dev/demo path uses the static PIT. Shim PIT into `ghlGet`/`ghlPost`/`ghlPut` for GE-1–5. Full OAuth (`handleCallback` / token rotation) deferred to GE-8. |
| "Merge or cherry-pick `feature/ghl-integration`" | **Do not merge or cherry-pick.** Branch is 305 commits behind main. Extract only: adapter class, client helpers, webhook route skeleton, and the 2 registry lines. |

---

## 13. GE-1 Entry Conditions (all met)

- [x] `main` is clean (app code)
- [x] Stripe gate confirmed paid-conditional — free seam is clean
- [x] Integration registry file located; GHL entry point known
- [x] No conflicting `/embedded` or `/ghl` routes on `main`
- [x] No existing feature-flag infrastructure to navigate around
- [x] No outbound dispatch to integrate with (net-new in GE-4)
- [x] Migration ledger at `0101`; GHL migrations go in as `0102+`
- [x] Branch salvage list defined; partial-salvage approach approved
- [x] Locked decisions recorded (route, flag, brand provider)
- [x] Two build-plan corrections captured (`refundRegistration`, private functions)

**GE-1 may proceed.**
