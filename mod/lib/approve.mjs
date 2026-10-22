// baton v7 approvals: which calls wait for the operator, and how answers read. Pure, no I/O.
//
// Two gates. A command gate holds an irreversible shell command from any
// agent at any depth (push, PR, release, hard reset, recursive delete) until
// the operator answers. A phase gate holds the prime's next dispatch after a
// sub-orchestrator reports DONE, until the operator approves the phase or
// sends it back with a reason.

export const GATES = [
  { id: 'push', label: 'git push', re: /\bgit\s+push\b/ },
  { id: 'pr', label: 'open, merge or close a PR', re: /\bgh\s+pr\s+(create|merge|close)\b/ },
  { id: 'release', label: 'publish a release or package', re: /\bgh\s+release\s+create\b|\b(npm|pnpm|yarn)\s+publish\b|\bcargo\s+publish\b/ },
  { id: 'reset', label: 'discard work (reset --hard, clean -f, checkout -- .)', re: /\bgit\s+reset\s+--hard\b|\bgit\s+clean\s+-[a-zA-Z]*f|\bgit\s+checkout\s+--\s+\./ },
  { id: 'rm', label: 'delete recursively', re: /\brm\s+(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\b/ },
]

export function gateFor(command) {
  const c = String(command ?? '')
  return GATES.find((g) => g.re.test(c)) ?? null
}

export const APPROVE = 'Approve'
export const REFUSE = 'Refuse'
export const alwaysLabel = (gate) => 'Approve every "' + gate.label + '" for this run'

export function commandQuestion({ who, command, gate, rulings = [] }) {
  const lines = ['baton: ' + who + ' wants to ' + gate.label + ':', '  ' + String(command).slice(0, 400)]
  if (rulings.length) lines.push('', 'Your rulings:', ...rulings.slice(0, 5).map((r) => '  ' + r))
  lines.push('', 'Type a reason instead to refuse with it.')
  return lines.join('\n')
}

/** 'approve' | 'always' | { refuse: reason } */
export function readCommandAnswer(answer, gate) {
  const a = String(answer ?? '').trim()
  if (a === APPROVE) return 'approve'
  if (gate && a === alwaysLabel(gate)) return 'always'
  if (!a || a === REFUSE) return { refuse: null }
  return { refuse: a }
}

export const SEND_BACK = 'Send back'

export function phaseQuestion(item, rulings = []) {
  const lines = ['baton: ' + item.label + ' reports:', '  ' + item.line, '', 'Approve it before the prime dispatches anything else?']
  if (rulings.length) lines.push('', 'Your rulings:', ...rulings.slice(0, 5).map((r) => '  ' + r))
  lines.push('', 'Type what is wrong instead to send it back with that reason.')
  return lines.join('\n')
}

/** 'approve' | { sendBack: reason } */
export function readPhaseAnswer(answer) {
  const a = String(answer ?? '').trim()
  if (a === APPROVE) return 'approve'
  if (!a || a === SEND_BACK) return { sendBack: null }
  return { sendBack: a }
}

/** Does a sub-orchestrator's return claim a finished phase? Its first verdict word decides (DONE, DONE+CONFIRMED, DONE-WITH-CAVEATS). */
export function claimsDone(line) {
  const m = /\b(DONE(?:\+CONFIRMED|-WITH-CAVEATS)?|PARTIAL|BLOCKED|REFUTED|FAILED|IDLE|UNSETTLEABLE)\b/.exec(String(line ?? ''))
  return !!m && m[1].startsWith('DONE')
}

// ------------------------------------------------------------------ approving from a blocked row's brief (T13, Q-37)

/**
 * What approving grants for a blocked node, per kind and never wider (Q-37): a command gate approves
 * that exact command once (`y`) or every command of its gate for the run (`w`, as /approve <gate>);
 * an `interpreted` block is overruled (`y`); a pause, an `explicit` block, a forbidden file or an
 * enforced ruling get no approve key, and `says` what must be done instead. `text` is everything the
 * envelope (or the agent's answer) says; `blockedBy` is parseBlockedBy of its line.
 */
export function blockGrant({ text = '', blockedBy = null, who = 'it', fallback = null }) {
  const t = String(text ?? '')
  if (/\bpaused\b/i.test(t)) return { kind: 'pause', keys: [], says: 'held by the pause: no approve key here. /baton resume lifts it, and ' + who + ' is re-dispatched after it.' }
  const file = /([^\s"'`]+)\s+matches a forbidden-file pattern/i.exec(t)
  if (file || /forbidden[- ]file/i.test(t)) return { kind: 'forbidden', keys: [], file: file ? file[1] : null, says: 'a forbidden file: no approve key. To fix it, ' + (file ? file[1] + ' must stay out of the commit' : 'the forbidden file must stay out of the commit') + ' (secrets, keys and env files are never committed): change the work so it does not need it.' }
  const ruling = /\bruling #(\d+)\b(?:\s*\(enforced\))?:?\s*([^"\n]*)/i.exec(t)
  if (ruling) return { kind: 'ruling', keys: [], ruling: Number(ruling[1]), says: 'an enforced ruling: no approve key. To fix it, retract or narrow ruling #' + ruling[1] + (ruling[2].trim() ? ' (' + ruling[2].trim() + ')' : '') + ' in Memory (2), or change the work so it keeps the ruling.' }
  for (const m of t.matchAll(/`([^`\n]+)`/g)) {
    const gate = gateFor(m[1])
    if (gate) return { kind: 'command', keys: ['y', 'w'], command: m[1].trim(), gate, says: 'held at the "' + gate.label + '" gate: y approves `' + m[1].trim() + '` once and ' + who + ' is re-dispatched with it · w approves every "' + gate.label + '" for this run (as /approve ' + gate.id + ').' }
  }
  if (blockedBy && blockedBy.kind === 'explicit') return { kind: 'explicit', keys: [], says: 'explicit: no approve key. A person has to fix the cause: ' + blockedBy.where + '.' }
  if (blockedBy && blockedBy.kind === 'interpreted') return { kind: 'interpreted', keys: ['y'], default: fallback, says: 'interpreted: y overrules it, and ' + who + ' is re-dispatched to proceed on ' + (fallback ? 'the default its question states: ' + fallback : 'the default it recommended') + '.' }
  return { kind: 'none', keys: [], says: 'no Blocked by: line to act on, so nothing to approve here; its envelope says what it needs.' }
}

/** The asked record (Q-42): written once, when a question is put to the operator. */
export function askedRecord({ at, via, gate = null }) {
  return 'asked_at: ' + at + '\nasked_via: ' + via + '\n' + (gate != null ? 'gate: G' + gate + '\n' : '')
}

/** A pane-written answer file (Q-41): the heading, rule 10's provenance lines, then the answer verbatim. */
export function answerRecord({ id, answer, at, session }) {
  return ['# ' + id + ' answer (binding, operator, ' + String(at).slice(0, 10) + ')', '', 'answered_by: operator', 'answered_via: pane', 'answered_at: ' + at, 'session: ' + (session || 'unknown'), '', '**Answer:** ' + answer, ''].join('\n')
}
