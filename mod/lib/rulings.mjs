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

// The rulings namespace is append-only. A ruling is a note tagged `ruling` or
// `ruling-hand`; `retract #N` (tag `retract`) withdraws note N; `enforce #N /re/`
// (tag `enforce`) makes the mod refuse shell commands matching re while N stands.

/**
 * The rulings that stand, newest first: [{ n, ts, text, enforce }], where
 * enforce is { source, re } or null. `notes` is the namespace's notes in order.
 */
export function activeRulings(notes) {
  const retracted = new Set()
  const enforce = new Map()
  for (const x of notes ?? []) {
    if (x.tag === 'retract') {
      const m = /^retract #(\d+)/i.exec(x.text)
      if (m) retracted.add(Number(m[1]))
    } else if (x.tag === 'enforce') {
      const m = /^enforce #(\d+) \/(.+)\/$/i.exec(x.text)
      if (m) {
        try {
          enforce.set(Number(m[1]), { source: m[2], re: new RegExp(m[2]) })
        } catch {}
      }
    }
  }
  return (notes ?? [])
    .filter((x) => (x.tag === 'ruling' || x.tag === 'ruling-hand') && !retracted.has(x.index))
    .map((x) => ({ n: x.index, ts: String(x.ts ?? '').slice(0, 10), text: x.text, enforce: enforce.get(x.index) ?? null }))
    .reverse()
}

export function rulingLine(r) {
  return '#' + r.n + ' ' + r.ts + ' ' + r.text + (r.enforce ? '  [enforced: /' + r.enforce.source + '/]' : '')
}

/** The first standing ruling whose enforcement matches a shell command, or null. */
export function enforcedHit(rulings, command) {
  const c = String(command ?? '')
  return (rulings ?? []).find((r) => r.enforce && r.enforce.re.test(c)) ?? null
}

/** Parse `/baton enforce <N> <regex>`: { n, source } or an error string. */
export function parseEnforce(args) {
  const m = /^#?(\d+)\s+\/?(.+?)\/?$/.exec(String(args ?? '').trim())
  if (!m) return 'usage: /baton enforce <ruling #> <regex>  — e.g. /baton enforce 3 git push.*\\bmain\\b'
  try {
    new RegExp(m[2])
  } catch (err) {
    return 'not a regex: ' + err.message
  }
  return { n: Number(m[1]), source: m[2] }
}

// Words a standing rule nearly always carries. A message with none of them ("yes", "merged",
// "try it", a question) is not worth a model call; one with any of them is asked about.
const RULE_SIGNS = /\b(always|never|from now on|going forward|by default|every time|each time|until|stop|don'?t|do not|no more|avoid|prefer|instead|should|must|make sure|rule|only|ever)\b/i

/** Could this message state a standing rule? Cheap, and errs toward asking. */
export function mightBeRuling(text) {
  const t = String(text ?? '').trim()
  if (t.length < 12) return false
  return RULE_SIGNS.test(t)
}
