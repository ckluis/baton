// baton v7 lessons: what verifiers refuted, carried to the next agent working in the same place.
// Pure, no I/O.
//
// Rulings are the operator's lessons for the prime. These are the verifiers' lessons for the
// workers: when a criterion is refuted, its node, the criterion and the refuting probe become one
// note in the project memory, tagged with the code area it concerns. When a worker or a
// sub-orchestrator is later spawned with a prompt that touches that area, the newest of those
// lessons ride in its prompt. talos keeps a lessons file by hand; here nobody has to.

import { clampBytes } from './memcore.mjs'

const PATHISH = /(?:^|[\s"'`(:,])((?:[\w.-]+\/)+[\w.-]+\.[A-Za-z0-9]+|(?:[\w.-]+\/){1,}[\w.-]+)(?=$|[\s"'`),:;])/g

/** Code areas a text mentions: the directory of each path-like token, at most two segments deep. */
export function areasOf(text) {
  const out = new Set()
  for (const m of String(text ?? '').matchAll(PATHISH)) {
    const p = m[1].replace(/^\.\//, '')
    if (/^(_orch|\.baton|https?:|node_modules)/.test(p)) continue
    const segs = p.split('/')
    const dirs = /\.[A-Za-z0-9]+$/.test(segs.at(-1)) ? segs.slice(0, -1) : segs
    if (!dirs.length) continue
    out.add(dirs.slice(0, 2).join('/'))
  }
  return [...out]
}

/**
 * Lessons from one verdict file: one per REFUTED row.
 * verdict: { node?, criteria: [{ criterion, verdict, probe, evidence }] }; handoff: its text, for areas.
 */
export function lessonsFromVerdict(node, verdict, handoff = '') {
  const out = []
  for (const row of (verdict && verdict.criteria) || []) {
    if (String(row.verdict).toUpperCase() !== 'REFUTED') continue
    const areas = areasOf([row.criterion, row.probe, ...(row.evidence || []), handoff].join(' '))
    const text = clampBytes(node + ': "' + clampBytes(row.criterion, 110).text + '" was refuted — ' + String(row.probe || 'no probe recorded'), 240).text
    out.push({ key: node + '|' + row.criterion, area: areas[0] || '', areas, text })
  }
  return out
}

/** The note a lesson is stored as: its areas first, so recall and relevance can read them back. */
export function lessonNote(l) {
  return clampBytes('[' + (l.areas.length ? l.areas.slice(0, 3).join(' ') : '-') + '] ' + l.text).text
}

export function parseLessonNote(text) {
  const m = /^\[([^\]]*)\]\s*(.*)$/.exec(String(text ?? ''))
  if (!m) return { areas: [], text: String(text ?? '') }
  return { areas: m[1] === '-' ? [] : m[1].split(/\s+/).filter(Boolean), text: m[2] }
}

/** The lessons that bear on a spawn's prompt: an area it mentions, or a node it names. Newest first. */
export function relevantLessons(notes, prompt, limit = 5) {
  const p = String(prompt ?? '')
  const promptAreas = areasOf(p)
  const out = []
  for (const n of [...(notes || [])].reverse()) {
    const l = parseLessonNote(n.text)
    const node = /^(\w+):/.exec(l.text)
    const hit = l.areas.some((a) => promptAreas.some((pa) => pa === a || pa.startsWith(a + '/') || a.startsWith(pa + '/'))) || (node && new RegExp('\\b' + node[1] + '\\b').test(p))
    if (hit) out.push(l.text)
    if (out.length >= limit) break
  }
  return out
}

export function lessonBlock(lessons) {
  if (!lessons.length) return ''
  return (
    '\n\nbaton — lessons from earlier refutations in this part of the code (verifiers found these; do not repeat them):\n' +
    lessons.map((l) => '- ' + l).join('\n')
  )
}
