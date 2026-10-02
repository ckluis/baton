// baton v7 prime guard: the pure decision. No I/O; the hooks module feeds it.
//
// The prime (the main session, whose tool calls carry no agentId) holds an
// allowlist during an active run. A naive deny-list leaked in the spike (deny
// Read and the prime reached for Bash), so this is an allowlist: whatever is
// not on it is refused with a reason that names the route.

/** Tools the prime keeps during a run. */
export const PRIME_TOOLS = Object.freeze([
  'Agent', // dispatch: the one way work happens
  'Task', // the Agent tool's older name, kept so a rename cannot open the guard
  'AskUserQuestion', // the operator lane
  'SendMessage', // talk to a running sub-orchestrator
  'ToolSearch', // loads deferred tool schemas (SendMessage, AskUserQuestion, memory_*) — reads no files
])

/** The mod's own tools are `mcp__<plugin>__<name>`. */
export const MOD_TOOL_PREFIX = 'mcp__baton__'

export const ROUTE = 'dispatch a sub-orchestrator'

/** A tool call is the prime's when it carries no agentId (main loop). */
export function isPrimeCall(e) {
  return e == null || e.agentId === undefined || e.agentId === null || e.agentId === ''
}

/** baton's own skill is instructions, not a file of the target: the prime may load it. */
export function isBatonSkill(e) {
  return e != null && e.tool === 'Skill' && /^baton(:baton)?$/.test(String(e.skill ?? '').trim())
}

export function primeMayUse(tool, e) {
  return PRIME_TOOLS.includes(tool) || String(tool).startsWith(MOD_TOOL_PREFIX) || isBatonSkill(e ?? { tool })
}

export function denyReason(tool) {
  return (
    `baton: ${tool} is not a prime tool. This session is the prime orchestrator of a baton run (the operator ` +
    `started it with /baton start), and in that role it delegates every read, command and edit to a subagent ` +
    `by design — ${ROUTE}: Agent with subagent_type "baton:sub-orchestrator" (or "baton:worker" / "baton:verifier") ` +
    `and a prompt naming the phase or node, its handoff path and what to return; it does the work and returns one line. ` +
    `The prime's own tools: Agent, AskUserQuestion, SendMessage, ToolSearch and mcp__baton__memory_* / project_* ` +
    `(memory_wake shows the run so far). /baton stop ends the run and this routing.`
  )
}

/**
 * The guard's whole decision for one tool call.
 * @param e       the tool.call event ({ tool, agentId? })
 * @param active  whether a baton run is active in this session
 * @returns null to let it through, or { deny }
 */
export function guardDecision(e, active) {
  if (!active) return null
  if (!isPrimeCall(e)) return null // a subagent's call: sub-orchestrators and workers read and edit
  if (primeMayUse(e.tool, e)) return null
  return { deny: denyReason(e.tool) }
}

/** Does this manifest text mark an active prime run? */
export function manifestIsPrime(text) {
  if (!text) return false
  try {
    const m = JSON.parse(text)
    return !!m && m.prime === true && m.closed !== true
  } catch {
    return false
  }
}

/** The Claude Code release whose tool.call agentId the spike verified. */
export const VERIFIED_AGENTID_VERSION = '2.1.287'
