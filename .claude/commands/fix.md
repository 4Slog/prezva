# /fix — Fix a specific error in Prezva

Given the error description provided:

1. Find the exact file(s) causing the error
2. Read the file and surrounding context carefully
3. Make the minimal correct fix — don't refactor, just fix
4. Run `pnpm test` to verify nothing broke
5. Run `/code-review` on the diff
6. Commit with message: "fix: [brief description]"
7. Report what was changed and why
