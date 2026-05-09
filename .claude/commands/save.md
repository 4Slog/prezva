---
name: save
description: Save current session state to session-notes.md. Use this any time you want to checkpoint progress mid-session, before switching tasks, or before taking a break. Does not end the session.
---

When the user runs /save, do the following immediately without asking for confirmation:

1. Read the current ~/Xekin/dev/session-notes.md
2. Update it with the current session state:
   - Current Phase (from what we have been working on)
   - Last Session date (today's date)
   - What was completed this session (bullet list of tasks finished)
   - Decisions Made (any new architectural or technical decisions — append, never remove existing ones)
   - Next Action (the single most important next step)
   - Blockers / Open Items (anything unresolved)
   - Validation Status (last PASS/FAIL counts if known)
3. Write the updated file to ~/Xekin/dev/session-notes.md on lin
4. Confirm with: "Session saved to session-notes.md — [one line summary of what was captured]"

Keep session-notes.md concise — decisions, state, next action only. Not a full transcript.
This is the handoff file for the next build session. It must be readable in 30 seconds.
