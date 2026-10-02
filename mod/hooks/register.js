// baton v7 — the hooks module.
//
// A prime orchestrator that never reads: during an active run the main
// session keeps an allowlist of tools (Agent, AskUserQuestion, SendMessage,
// ToolSearch, the mod's memory tools) and everything else is refused with the
// route. Subagents (sub-orchestrators, workers, verifiers) pass untouched.
//
// A run is active when the session's directory holds _orch/manifest.json with
// "prime": true (what /baton start writes), or /baton start ran here.

import { guardDecision, isPrimeCall, manifestIsPrime, VERIFIED_AGENTID_VERSION } from '../lib/guard.mjs'

// ------------------------------------------------------------------ state

const run = {
  checkedAt: -1e12, // when the manifest was last read (ms)
  active: false, // the cached answer
  manifest: null, // the parsed manifest, when active
  startedHere: false, // /baton start ran in this module's lifetime
}

// What the guard learned about agentId at run time.
const probe = {
  version: null, // the engine version at load
  verified: false, // a subagent's tool call carried its agentId
  notice: null, // set when agentId behaviour could not be confirmed
  spawned: new Set(), // agentIds agent.spawn handed back
  seen: new Set(), // agentIds seen on tool.call
  denied: 0, // prime denials so far
  deniedWhileLive: 0, // prime denials while a spawned subagent had not finished
}

const MANIFEST_TTL_MS = 1500

/** Is a baton run active? Reads _orch/manifest.json at most every MANIFEST_TTL_MS. */
async function runActive($) {
  const now = Date.now()
  if (now - run.checkedAt < MANIFEST_TTL_MS) return run.active || run.startedHere
  run.checkedAt = now
  let text = null
  try {
    text = await $.fs.read('_orch/manifest.json')
  } catch {
    text = null
  }
  run.active = manifestIsPrime(text)
  try {
    run.manifest = run.active ? JSON.parse(text) : null
  } catch {
    run.manifest = null
  }
  return run.active || run.startedHere
}

function forgetRunCache() {
  run.checkedAt = -1e12
}

export function register(on, options) {
  // ---------------------------------------------------------------- load

  on('session.start', async ($, e, next) => {
    try {
      const v = await $.session.version()
      probe.version = v.base ?? v.version
      if (!String(probe.version).startsWith(VERIFIED_AGENTID_VERSION)) {
        probe.notice =
          `baton: the prime guard tells the prime from a subagent by tool.call's agentId, verified on Claude Code ` +
          `${VERIFIED_AGENTID_VERSION}; this is ${probe.version}. The guard fails closed: a call without agentId ` +
          `is treated as the prime's. If subagents report "the prime never runs", agentId has changed — /baton stop.`
        $.ui.log(probe.notice)
      }
    } catch {
      probe.notice = 'baton: could not read the engine version; the prime guard fails closed (no agentId = prime).'
      $.ui.log(probe.notice)
    }
    return next(e)
  })

  // ---------------------------------------------------------------- the prime guard

  on('tool.call', async ($, e, next) => {
    if (!isPrimeCall(e)) {
      if (!probe.seen.has(e.agentId)) {
        probe.seen.add(e.agentId)
        if (probe.spawned.has(e.agentId) && !probe.verified) probe.verified = true
      }
      return next(e)
    }
    const active = await runActive($)
    const verdict = guardDecision(e, active)
    if (!verdict) return next(e)
    probe.denied++
    const live = [...probe.spawned].some((id) => !probe.seen.has(id))
    if (live) probe.deniedWhileLive++
    $.ui.log('prime denied ' + e.tool + ' → dispatch a sub-orchestrator')
    return verdict
  }).catch(async ($, e, next) => {
    // Fail closed during a run: a guard that broke must not wave the prime through.
    if (isPrimeCall(e) && (run.active || run.startedHere)) {
      return { deny: 'baton: the prime guard failed (' + next.error.kind + '), so this call was refused. Dispatch a sub-orchestrator.' }
    }
    return next(e)
  })

  // A subagent that finishes without one tool call carrying its id, while
  // prime-classified calls were being refused, is the signature of agentId
  // having gone missing: say so loudly (the guard stays closed).
  on('turn.complete', async ($, e, next) => {
    if (e.agentId && probe.spawned.has(e.agentId) && !probe.seen.has(e.agentId) && probe.deniedWhileLive > 0 && !probe.verified) {
      probe.notice =
        'baton: a subagent finished with no tool call carrying its agentId while prime-classified calls were refused — ' +
        'agentId detection may be broken on this build. The guard fails closed; /baton stop to release the session.'
      $.ui.log(probe.notice)
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r && r.agentId) probe.spawned.add(r.agentId)
    return r
  })
}
