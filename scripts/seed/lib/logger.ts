const B = '\x1b[1m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED = '\x1b[31m'
const CYAN = '\x1b[36m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

export const log = {
  info:    (msg: string) => console.log(`  ${msg}`),
  ok:      (msg: string) => console.log(`${GREEN}  ✓ ${msg}${RESET}`),
  warn:    (msg: string) => console.warn(`${YELLOW}  ⚠ ${msg}${RESET}`),
  error:   (msg: string) => console.error(`${RED}  ✗ ${msg}${RESET}`),
  section: (msg: string) => console.log(`\n${B}${CYAN}── ${msg} ──${RESET}`),
  dry:     (msg: string) => console.log(`${DIM}  [dry-run] would ${msg}${RESET}`),
  link:    (label: string, url: string) => console.log(`${B}  ${label}:${RESET} ${url}`),
}

export interface StageSummary {
  stage: string
  planned: number
  actual: number
  note?: string
}

export function printSummaryTable(rows: StageSummary[]): void {
  console.log(`\n${B}  ┌─ Run Summary ${'─'.repeat(40)}┐${RESET}`)
  console.log(`  ${'Stage'.padEnd(22)} ${'Planned'.padStart(9)} ${'Actual'.padStart(9)}  Status`)
  console.log(`  ${'─'.repeat(55)}`)
  for (const r of rows) {
    const ok = r.actual === r.planned
    const status = ok ? `${GREEN}ok${RESET}` : `${YELLOW}Δ${RESET}`
    const note = r.note ? `  ${DIM}(${r.note})${RESET}` : ''
    console.log(
      `  ${r.stage.padEnd(22)} ${String(r.planned).padStart(9)} ${String(r.actual).padStart(9)}  ${status}${note}`,
    )
  }
  console.log(`  ${'─'.repeat(55)}`)
}
