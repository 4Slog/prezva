# /done — End of task summary

When a task is complete:

1. Run `pnpm test` — report pass/fail count
2. Run `git log --oneline -5` — show last 5 commits
3. Run `/diff` to show what changed
4. Write a summary:
   - What was the task
   - What files were changed and why
   - Test results
   - Any follow-up issues discovered (don't fix — just report)
5. Output: "✅ TASK COMPLETE — Ready for Claude Desktop review"
