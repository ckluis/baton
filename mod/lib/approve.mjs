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
