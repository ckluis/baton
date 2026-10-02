// baton v7 model binding: which model a subagent of a run runs on. Pure.
//
// The binding is per role, not per call: Opus 5.5 for the prime-side roles
// (sub-orchestrator, worker, verifier, luminary — and any other agent type a
// run spawns, because entry is frontier unless the work is a command, rule
// 1.1), Sonnet 5.5 for cheap work. Cheap is declared by name — an agent type
// or an Agent({ name }) ending in "-cheap" — never by the caller's `model`.

export const FRONTIER = 'claude-opus-5-5'
export const CHEAP = 'claude-sonnet-5-5'

export function isCheap(e) {
  const type = String(e?.subagentType ?? '').replace(/^.*:/, '')
  const name = String(e?.name ?? '')
  return /-cheap$/.test(type) || /-cheap$/.test(name)
}

/**
 * @param e  the agent.spawn input
 * @returns the model to run on, or null to leave the spawn alone (a fork
 *          always inherits the parent's model, so binding it means nothing)
 */
export function bindModel(e) {
  if (!e || e.fork) return null
  return isCheap(e) ? CHEAP : FRONTIER
}
