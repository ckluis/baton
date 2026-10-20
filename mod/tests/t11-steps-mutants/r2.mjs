// Test-only fixture for mod/tests/t11-steps.test.ts (criterion 25, T111 handoff; rewritten under
// _orch/inbox/Q-T111-3.answer.md, option D): the row-to-node matcher that refuted c25 in verdict r2
// (_orch/verify/T111-verdict.r2.json), word for word: "workOf node = LAST match of
// /\b[A-Z][A-Z0-9]*\d*[a-z]?\b/g" plus "minimal lifecycle fallback".
// It picks one token from the label without reading the run's node list; the test looks the token up.
export const id = 'r2'
export const verdict = '_orch/verify/T111-verdict.r2.json'
/** An unmatched row falls back to its own lifecycle stepper. */
export const fallback = true
export function pick(label) {
  const all = String(label ?? '').match(/\b[A-Z][A-Z0-9]*\d*[a-z]?\b/g)
  return all ? all[all.length - 1] : null
}
