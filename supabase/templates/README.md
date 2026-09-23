# Supabase auth email templates (record only)

These files are a **record** of the live Supabase auth email templates for project
`jmhxyyrleipcorvkmxfk` (R78). **Editing them does NOT change production.**

The live copy is managed through the Supabase Management API:

```
PATCH https://api.supabase.com/v1/projects/jmhxyyrleipcorvkmxfk/config/auth
```

| File | Management API field |
| --- | --- |
| `magic_link.html` | `mailer_templates_magic_link_content` |
| `confirmation.html` | `mailer_templates_confirmation_content` |

Both link to `/auth/confirm` with Supabase's `token_hash` pattern, so the link works
on any device (no PKCE code verifier needed). `next={{ .RedirectTo }}` carries the
`emailRedirectTo` the app passed (or site_url when none was passed); `/auth/confirm`
accepts it only when it is same-origin (see `src/lib/auth/resolve-next.ts`).

Only the link differs from the Supabase defaults; the copy and markup are unchanged.
The recovery (password reset) and invite templates are not managed here and remain
Supabase defaults. If you change a live template, update the matching file here in
the same change.
