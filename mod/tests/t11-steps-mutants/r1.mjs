// Test-only fixture for mod/tests/t11-steps.test.ts (criterion 25, T111 handoff; rewritten under
// _orch/inbox/Q-T111-3.answer.md, option D): the row-to-node matcher that refuted c25 in verdict r1
// (_orch/verify/T111-verdict.r1.json), word for word: "workOf first-match /\b([A-Z]+\d+[a-z]?)\b/".
// It picks one token from the label without reading the run's node list; the test looks the token up.
export const id = 'r1'
export const verdict = '_orch/verify/T111-verdict.r1.json'
/** No lifecycle fallback: an unmatched row draws no stepper. */
export const fallback = false
export function pick(label) {
  const m = /\b([A-Z]+\d+[a-z]?)\b/.exec(String(label ?? ''))
  return m ? m[1] : null
}
