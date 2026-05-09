---
name: save
description: Save current session state. Detects automatically whether this is a mid-session checkpoint or a phase/module completion and does everything accordingly. Call this any time — after a module, after a phase, or just before a break.
---

When the user runs /save, follow this exact procedure without asking for confirmation:

## STEP 1 — Detect what just happened
Read the conversation and determine which of these is true:
- A) Mid-session checkpoint — work in progress, no module or phase just completed
- B) Module complete — a specific module (auth, check-in, registration, etc.) just finished and passed its gate check
- C) Phase complete — an entire phase (Phase 1, Phase 2, etc.) just finished

## STEP 2 — Always do these (all scenarios)
1. Read ~/Xekin/dev/session-notes.md
2. Update it with:
   - Current Phase
   - Date: today
   - What was completed (bullet list)
   - Any new Decisions Made (append only — never remove existing ones)
   - Next Action (single most important next step)
   - Open Blockers
   - Validation Status (last known PASS/FAIL counts)
3. Write updated file to ~/Xekin/dev/session-notes.md on lin
4. Update ~/.claude/global-memory/xekin_project.md with any new decisions or progress

## STEP 3 — Module complete (scenario B): do these additionally
5. Run: bash ~/Xekin/scripts/validate/build.sh [module-name]
   - If FAIL: report failures, do NOT proceed to git commit. Tell user to fix first.
   - If PASS: continue
6. Run on lin via SSH: cd ~/Xekin/dev && git add -A && git commit -m "feat: complete [module] module — all gate checks passing"
7. Confirm: "Module [name] saved and committed ✅"

## STEP 4 — Phase complete (scenario C): do everything automatically
5. Run: bash ~/Xekin/scripts/validate/phase_complete.sh "[phase-name]"
   This single script does ALL of the following automatically:
   - Runs full validation suite (environment + build + RLS)
   - Commits any uncommitted files
   - Creates git tag: [phase-name]-complete
   - Pushes to staging branch on GitHub
   - Pushes all tags to GitHub
   - Logs completion to ~/Xekin/logs/phase_complete.log
   - Logs to ~/Xekin/logs/phases_completed.log
6. If validation FAILS: stop, report what failed, do not tag or push. Tell user to fix.
7. If validation PASSES: report the full completion summary
8. Confirm: "Phase [name] complete ✅ — tagged, pushed, logged. Open new chat for next phase."

## STEP 5 — Always end /save with
- One line: what was saved
- One line: what the next action is
- If phase complete: remind user to open a new chat for the next phase

## IMPORTANT RULES
- Never ask "are you sure?" — just execute
- Never skip the session-notes.md update — it's the handoff file
- Never commit if validation shows FAIL — report and stop
- Never push directly to main — staging branch only
- Phase names to use: pre-build, phase-1, phase-2, phase-3, phase-4
- Module names match the build order in CLAUDE.md
