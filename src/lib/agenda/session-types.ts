// Built-in session types, shared by server actions and client UI.
// Lives in a plain (non-"use server") module so it can be exported as a
// value — a "use server" file may only export async functions.
export const BUILTIN_SESSION_TYPES = [
  'talk', 'workshop', 'panel', 'keynote', 'break', 'networking', 'other',
] as const
