// O116: a signed-in user with no org (and no super-admin impersonation) has
// nothing to see in the org dashboard; they belong on /me. These dashboard
// routes need no org and stay reachable:
//   /orgs/new  — creating the first org
//   /help      — static help center
//   /settings  — account security (2FA), user-level
const NO_ORG_ALLOWED = [/^\/orgs\/new\/?$/, /^\/help(\/|$)/, /^\/settings(\/|$)/]

export function shouldRedirectNoOrgUser(pathname: string, orgCount: number, impersonating: boolean): boolean {
  if (impersonating || orgCount > 0) return false
  return !NO_ORG_ALLOWED.some(re => re.test(pathname))
}
