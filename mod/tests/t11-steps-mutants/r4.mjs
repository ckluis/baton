// Test-only fixture for mod/tests/t11-steps.test.ts (criterion 25, T111 handoff; rewritten under
// _orch/inbox/Q-T111-3.answer.md, option D): the row-to-node matcher that refuted c25 in verdict r4
// (_orch/verify/T111-verdict.r4.json), word for word: "N1: `const all = s.split(/\s+/).filter(Boolean);
// const best = all.reduce((a, b) => (b.length >= a.length ? b : a), '')` (the LONGEST whitespace token,
// LAST on a tie; only it is looked up) + register.js:1405 lifecycle fallback" — it never reads the node list.
// The test looks the picked token up in the run's node list.
export const id = 'r4'
export const verdict = '_orch/verify/T111-verdict.r4.json'
/** An unmatched row falls back to its own lifecycle stepper. */
export const fallback = true
export function pick(label) {
  const all = String(label ?? '').split(/\s+/).filter(Boolean)
  const best = all.reduce((a, b) => (b.length >= a.length ? b : a), '')
  return best || null
}
