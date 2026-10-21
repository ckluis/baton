// Test-only fixture for mod/tests/t11-steps.test.ts (criterion 25, T111 handoff; rewritten under
// _orch/inbox/Q-T111-3.answer.md, option D): the row-to-node matcher that refuted c25 in verdict r3
// (_orch/verify/T111-verdict.r3.json), word for word: "`const all = s.match(/\b[A-Z][A-Z0-9]*[a-z]?\b/g) || [];
// const best = all.reduce((a, b) => (b.length > a.length ? b : a), '')` (the LONGEST capitalised token,
// first on a tie; only it is looked up) + register.js:1405 lifecycle fallback".
// It picks one token from the label without reading the run's node list; the test looks the token up.
export const id = 'r3'
export const verdict = '_orch/verify/T111-verdict.r3.json'
/** An unmatched row falls back to its own lifecycle stepper. */
export const fallback = true
export function pick(label) {
  const all = String(label ?? '').match(/\b[A-Z][A-Z0-9]*[a-z]?\b/g) || []
  const best = all.reduce((a, b) => (b.length > a.length ? b : a), '')
  return best || null
}
