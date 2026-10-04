// baton v7 rulings: pure functions, no I/O.
//
// A ruling is a standing instruction from the operator ("never push to main",
// "use sonnet for the sweeps from now on"). The mod lifts rulings out of the
// operator's prompts into the project memory, and the newest wins on conflict.

import { clampBytes } from './memcore.mjs'

export const RULINGS_HEAD = 'Standing rulings from the operator, newest first (a newer ruling overrides an older one it conflicts with):'

export const RULING_SYSTEM =
  'You read one message an operator sent to an AI orchestrator. Decide whether it states a STANDING rule: ' +
  'how work should be done from now on, beyond this one task (a preference, a prohibition, a convention, a change of mind about an earlier rule). ' +
  'A one-off request, a question or an answer to a question is not a standing rule. ' +
  'If it is one, output exactly: RULING: <the rule as one self-contained imperative line, at most 240 bytes>. Otherwise output exactly: NONE'

export function rulingPrompt(text) {
  return 'Operator message:\n<<<\n' + String(text ?? '').slice(0, 6000) + '\n>>>'
}

/** The model's answer to a rule line, or null for NONE or anything unparseable. */
export function parseRuling(answer) {
  const m = /^\s*RULING:\s*(.+)$/im.exec(String(answer ?? ''))
  if (!m) return null
  const line = clampBytes(m[1].replace(/^["']|["']$/g, ''), 240).text
  return line.length >= 6 ? line : null
}

// Phrases that only standing rules use. The fallback runs when the model gives
// no answer, so it errs towards missing a ruling rather than inventing one.
const MARKERS = /\b(from now on|going forward|always|never|don't ever|do not ever|stop doing|no more|by default|as a rule)\b/i

/** Without a model: the message itself (clamped) when it carries a standing-rule marker, else null. */
export function fallbackRuling(text) {
  const t = String(text ?? '')
  if (t.length > 600 || !MARKERS.test(t)) return null
  return clampBytes(t, 240).text
}

/** Is this prompt the operator's own words (not a slash command, not the mod's kickoff, not empty)? */
export function isOperatorPrompt(text, kickoff) {
  const t = String(text ?? '').trim()
  if (!t || t.startsWith('/')) return false
  if (kickoff && t === String(kickoff).trim()) return false
  if (/^baton v7 run \S+ started/.test(t)) return false
  return true
}
