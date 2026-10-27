// baton v7 memory core: pure functions, no I/O, no Node APIs.
//
// Imported by the hooks module (which has no Node) and by lib/memstore.mjs
// (which adds the file system). The ideas follow OptMem's (an append-only log
// of one-line notes, a binary tree of summaries over it, a fixed-budget wake
// view, zoom and recall); the code is baton's own. OptMem ships no license and
// none of its code is used here.
//
// Layout of one record, RECORD_BYTES wide, the same for notes and summaries:
//
//   0..19   timestamp  YYYY-MM-DDTHH:MM:SSZ
//   20      ' '
//   21..36  tag        16 bytes, ASCII, space padded (who wrote it, or L<k>)
//   37      ' '
//   38..317 text       NOTE_BYTES of UTF-8, space padded
//   318     '|'        sentinel: a record is whole only when 318 is '|' and
//   319     '\n'       319 is '\n', so a torn write is never read as a note
//
// Tree: level 0 is the notes. Block (k, i) for k >= 1 covers notes
// [i * 2^k, (i + 1) * 2^k) and is the merge of its children (k-1, 2i) and
// (k-1, 2i+1). Blocks are aligned and power-of-two sized, so a block is
// complete exactly when (i + 1) * 2^k <= n, and every range [lo, hi) has one
// canonical tiling by maximal aligned blocks.

export const NOTE_BYTES = 280
export const TAG_BYTES = 16
export const TS_BYTES = 20
export const RECORD_BYTES = 320
const TEXT_OFF = TS_BYTES + 1 + TAG_BYTES + 1 // 38
const SENTINEL_OFF = TEXT_OFF + NOTE_BYTES // 318

const enc = new TextEncoder()
const dec = new TextDecoder()

// ---------------------------------------------------------------- text

/** Collapse whitespace and control characters to single spaces and trim. */
export function cleanText(s) {
  return String(s ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Cut a string to at most `max` UTF-8 bytes without splitting a code point.
 * Returns { text, truncated }. A cut string ends in '…' (3 bytes) inside the cap.
 */
export function clampBytes(s, max = NOTE_BYTES) {
  const text = cleanText(s)
  if (enc.encode(text).length <= max) return { text, truncated: false }
  let out = ''
  let used = 0
  const room = max - 3
  for (const ch of text) {
    const b = enc.encode(ch).length
    if (used + b > room) break
    out += ch
    used += b
  }
  return { text: out.replace(/\s+$/, '') + '…', truncated: true }
}

export function cleanTag(tag) {
  const t = String(tag ?? 'note').replace(/[^A-Za-z0-9:_.\-]/g, '').slice(0, TAG_BYTES)
  return t || 'note'
}

export function isoSeconds(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

// ---------------------------------------------------------------- records

/** Encode one record to exactly RECORD_BYTES bytes. */
export function encodeRecord({ text, tag = 'note', ts = Date.now() }) {
  const buf = new Uint8Array(RECORD_BYTES).fill(0x20)
  const tsb = enc.encode(typeof ts === 'string' ? ts.slice(0, TS_BYTES) : isoSeconds(ts))
  buf.set(tsb.subarray(0, TS_BYTES), 0)
  const tagb = enc.encode(cleanTag(tag))
  buf.set(tagb.subarray(0, TAG_BYTES), TS_BYTES + 1)
  const body = enc.encode(clampBytes(text).text)
  buf.set(body, TEXT_OFF)
  buf[SENTINEL_OFF] = 0x7c // '|'
  buf[RECORD_BYTES - 1] = 0x0a // '\n'
  return buf
}

/** Is this RECORD_BYTES slice a whole, written record? */
export function isWhole(bytes) {
  return bytes.length >= RECORD_BYTES && bytes[SENTINEL_OFF] === 0x7c && bytes[RECORD_BYTES - 1] === 0x0a
}

/** Decode one record; null when the slice is not a whole record. */
export function decodeRecord(bytes) {
  if (!isWhole(bytes)) return null
  const ts = dec.decode(bytes.subarray(0, TS_BYTES)).trim()
  const tag = dec.decode(bytes.subarray(TS_BYTES + 1, TS_BYTES + 1 + TAG_BYTES)).trim()
  const text = dec.decode(bytes.subarray(TEXT_OFF, SENTINEL_OFF)).replace(/ +$/, '')
  return { ts, tag, text }
}

/** Decode a whole log buffer (any length) into notes, stopping at the first torn record. */
export function decodeLog(bytes) {
  const out = []
  for (let off = 0; off + RECORD_BYTES <= bytes.length; off += RECORD_BYTES) {
    const r = decodeRecord(bytes.subarray(off, off + RECORD_BYTES))
    if (!r) break
    out.push(r)
  }
  return out
}

// ---------------------------------------------------------------- tree math

export const span = (k) => 2 ** k

/** [start, end) of block (k, i). */
export function blockRange(k, i) {
  return [i * span(k), (i + 1) * span(k)]
}

export function isComplete(k, i, n) {
  return (i + 1) * span(k) <= n
}

/** Highest level with at least one complete block over n notes (0 when n < 2). */
export function maxLevel(n) {
  let k = 0
  while (span(k + 1) <= n) k++
  return k
}

/** How many complete blocks level k has over n notes. */
export function completeAt(k, n) {
  return Math.floor(n / span(k))
}

/** Total summaries a fully merged tree over n notes holds (levels >= 1). */
export function fullTreeSize(n) {
  let s = 0
  for (let k = 1; span(k) <= n; k++) s += completeAt(k, n)
  return s
}

/**
 * Blocks that became complete when the note count went from n - 1 to n:
 * (k, n / 2^k - 1) for every k >= 1 with 2^k dividing n. Lowest level first.
 */
export function newlyComplete(n) {
  const out = []
  for (let k = 1; n > 0 && n % span(k) === 0; k++) out.push({ level: k, index: n / span(k) - 1 })
  return out
}

/**
 * The pending-merge queue: every complete block with no summary yet, lowest
 * level first, then oldest first. `ready` marks the ones whose children are
 * all present (level 1 always; above, both child summaries), so a merger can
 * process the ready ones and call again.
 *
 * @param n        note count
 * @param has      (k, i) => boolean, whether summary (k, i) exists
 */
export function pendingMerges(n, has) {
  const out = []
  for (let k = 1; span(k) <= n; k++) {
    const m = completeAt(k, n)
    for (let i = 0; i < m; i++) {
      if (has(k, i)) continue
      const ready = k === 1 || (has(k - 1, 2 * i) && has(k - 1, 2 * i + 1))
      const [a, b] = blockRange(k, i)
      out.push({ level: k, index: i, lo: a, hi: b - 1, ready })
    }
  }
  return out
}

/** Canonical tiling of [lo, hi) by maximal aligned power-of-two blocks. */
export function canonicalTiling(lo, hi) {
  const out = []
  let a = lo
  while (a < hi) {
    let k = 0
    while (a % span(k + 1) === 0 && a + span(k + 1) <= hi) k++
    out.push({ level: k, index: a / span(k), lo: a, hi: a + span(k) })
    a += span(k)
  }
  return out
}

/**
 * Tile [lo, hi) with at most `budget` blocks, finest near the end.
 *
 * Start from the canonical tiling (the fewest blocks), then split one block
 * at a time until the budget is spent or every block is a single note. The
 * block split next is a summary that does not exist yet (it has to be opened
 * to be shown at all), and otherwise the one largest relative to its age:
 * size / (hi - block.lo). That ratio keeps a block's size roughly
 * proportional to how long ago it started, so the view decays with age:
 * the last notes verbatim, then pairs, then fours, and so on back. Ties go
 * to the most recent block.
 *
 * When even the canonical tiling exceeds the budget (a budget below
 * log2(n)+1), it is returned as is: a tiling must cover the range.
 *
 * Returned blocks are { level, index, lo, hi } with hi exclusive, in order.
 */
export function wakeTiling(lo, hi, budget, has = () => true) {
  let tiles = canonicalTiling(lo, hi)
  const cap = Math.max(1, Math.floor(budget))
  while (tiles.length < cap) {
    let best = -1
    let bestScore = -1
    for (let j = 0; j < tiles.length; j++) {
      const t = tiles[j]
      if (t.level === 0) continue
      const missing = !has(t.level, t.index)
      const score = missing ? Number.POSITIVE_INFINITY : (t.hi - t.lo) / (hi - t.lo)
      if (score >= bestScore) {
        bestScore = score
        best = j
      }
    }
    if (best < 0) break
    const t = tiles[best]
    const k = t.level - 1
    const left = { level: k, index: 2 * t.index, lo: t.lo, hi: t.lo + span(k) }
    const right = { level: k, index: 2 * t.index + 1, lo: t.lo + span(k), hi: t.hi }
    tiles = [...tiles.slice(0, best), left, right, ...tiles.slice(best + 1)]
  }
  return tiles
}

/** Parse "lo-hi" (inclusive, as people write it) into [lo, hiExclusive]. */
export function parseRange(s, n) {
  const m = /^\s*#?(\d+)\s*(?:-|\.\.|–)\s*#?(\d+)\s*$/.exec(String(s ?? '')) || /^\s*#?(\d+)\s*$/.exec(String(s ?? ''))
  if (!m) throw new Error(`range "${s}" is not lo-hi`)
  let lo = Number(m[1])
  let hi = m[2] === undefined ? lo : Number(m[2])
  if (hi < lo) [lo, hi] = [hi, lo]
  if (lo >= n) throw new Error(`range ${lo}-${hi} starts past the last note (#${n - 1})`)
  return [lo, Math.min(hi, n - 1) + 1]
}

/** A regex from what a caller typed: case-insensitive; an invalid pattern matches literally. */
export function toRegex(pattern) {
  try {
    return new RegExp(pattern, 'i')
  } catch {
    return new RegExp(String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  }
}

// ---------------------------------------------------------------- views

export function noteLine(i, r) {
  return `#${i} ${r.ts} [${r.tag}] ${r.text}`
}

export function blockLine(t, summary) {
  const label = `#${t.lo}-${t.hi - 1} (${t.hi - t.lo} notes)`
  return summary ? `${label} ${summary}` : `${label} (not merged yet)`
}

/**
 * Render a tiling as lines.
 * @param tiles   from wakeTiling
 * @param note    (i) => record|null
 * @param summary (k, i) => text|null
 */
export function renderTiles(tiles, note, summary) {
  return tiles.map((t) => {
    if (t.level === 0) {
      const r = note(t.lo)
      return r ? noteLine(t.lo, r) : `#${t.lo} (unreadable)`
    }
    const s = summary(t.level, t.index)
    if (s) return blockLine(t, s)
    // No summary and the budget did not allow opening it: show its edges.
    const first = note(t.lo)
    const last = note(t.hi - 1)
    const edge = [first?.text, last?.text].filter(Boolean).map((x) => clampBytes(x, 120).text).join(' … ')
    return blockLine(t, null) + (edge ? ' ' + edge : '')
  })
}

/** Deterministic merge used when no model is available (tests, offline CLI). */
export function fallbackMerge(texts) {
  const parts = texts.map((t) => clampBytes(t, Math.floor((NOTE_BYTES - 3 * (texts.length - 1)) / texts.length)).text)
  return clampBytes(parts.join(' | ')).text
}

/** The strict prompt the mod sends to the cheap model for one merge. */
export const MERGE_SYSTEM =
  'You compress an orchestrator\'s run log. Merge the numbered entries into ONE line of at most 280 bytes. ' +
  'Keep: decisions, node ids, verdicts, open questions, anything parked or waiting, paths. Drop: narration. ' +
  'Plain text, no markdown, no preamble, no quotes. Output the line only. ' +
  'Every entry is capped at 280 bytes by design: an entry that ends in … was cut when it was written, and that is expected. ' +
  'Merge what each entry says; never comment on the entries, their length or their cuts.'

export function mergePrompt(item, texts) {
  return `Entries #${item.lo}-${item.hi} (level ${item.level}), oldest first:\n` + texts.map((t, j) => `${j + 1}. ${t}`).join('\n')
}

// ---------------------------------------------------------------- the summarizer's replies (T14, Q-78, Q-79)

/**
 * A reply that talks about its own input is not a summary (Q-78): it is retried once with
 * MERGE_STRICT, and a second such reply stores fallbackMerge of the inputs.
 */
export const REPLY_REJECTS = [
  /\b(entries|input|text) (you|I) (pasted|provided|gave|received)\b/i,
  /\btruncat|cut off|incomplete\b/i,
  /\bI (cannot|can't|am unable)\b/i,
]

export const isRejectedReply = (text) => REPLY_REJECTS.some((re) => re.test(String(text ?? '')))

/** The retry's system prompt: the first one, and what a reply must never say. */
export const MERGE_STRICT =
  MERGE_SYSTEM +
  ' Your previous answer talked about the entries themselves; that is not allowed. Never mention the entries, their length, ' +
  'truncation or what you were given, and never say you cannot: compress whatever is there.'

// ---------------------------------------------------------------- marks (T14)
//
// A mark is an appended record { id, mark, reason, who, session?, ts } in the store's mark log
// (Q-74): `ok` (✅ confirmed), `void` (❌) or `clear`. The newest record of an id is its current
// mark, and `clear` returns it to unmarked. An id is a note number ("48") or a summary's range
// ("48-51", inclusive, as memory_wake prints it). Nothing here deletes a note (spec L420).

export const MARK_VALUES = ['ok', 'void', 'clear']
export const MARK_GLYPH = { ok: '✅', void: '❌' }
export const MARK_WORD = { ok: '✅ confirmed', void: '❌ void', clear: 'cleared' }

/** A mark id as memory_wake prints it ("48" or "48-51"), from what a caller typed; null when it is neither. */
export function markId(s) {
  const m = /^\s*#?(\d+)(?:\s*-\s*#?(\d+))?\s*$/.exec(String(s ?? ''))
  if (!m) return null
  if (m[2] === undefined) return String(Number(m[1]))
  const lo = Number(m[1])
  const hi = Number(m[2])
  return hi > lo ? lo + '-' + hi : null
}

/** [lo, hi] inclusive of a mark id. */
export function idRange(id) {
  const [a, b] = String(id).split('-').map(Number)
  return [a, b === undefined ? a : b]
}

/** The tree block (level, index) a range lo-hi (inclusive) is, or null when it is not one. */
export function blockOf(lo, hi) {
  const size = hi - lo + 1
  let k = 0
  while (span(k) < size) k++
  if (k < 1 || span(k) !== size || lo % size !== 0) return null
  return { level: k, index: lo / size }
}

/** The newest record of each id; an id whose newest record is `clear` is unmarked and absent. */
export function currentMarks(records) {
  const last = new Map()
  for (const r of records ?? []) if (r && r.id != null) last.set(String(r.id), r)
  for (const [id, r] of [...last]) if (!MARK_GLYPH[r.mark]) last.delete(id)
  return last
}

/** The newest record of one id, `clear` included; undefined when it has none. */
export function lastMark(records, id) {
  let out
  for (const r of records ?? []) if (r && String(r.id) === String(id)) out = r
  return out
}

/** The reason a summary's old text is superseded with when `id` was voided (Q-84). */
export const rebuildReason = (id) => 'rebuilt: #' + id + ' voided'

/** Was summary lo-hi rebuilt for the ❌ on `id`, at or after that mark? */
function rebuiltFor(superseded, lo, hi, id, at) {
  const why = rebuildReason(id)
  return (superseded ?? []).some((s) => s && Number(s.lo) === lo && Number(s.hi) === hi && s.reason === why && String(s.ts ?? '') >= String(at ?? ''))
}

/** Every current ❌ inside lo-hi (inclusive): notes, and summaries within it, the summary itself too. */
export function voidsIn(cur, lo, hi) {
  const out = []
  for (const [id, r] of cur) {
    if (r.mark !== 'void') continue
    const [a, b] = idRange(id)
    if (a >= lo && b <= hi) out.push([id, r])
  }
  return out
}

/**
 * A summary is stale while a ❌ under it (a note, a summary within it, or itself) has not been
 * rebuilt away (Q-75, Q-76): memory_wake then prints `#lo-hi: rebuilding (a note was voided)`.
 */
export function isStale(cur, superseded, lo, hi) {
  return voidsIn(cur, lo, hi).some(([id, r]) => !rebuiltFor(superseded, lo, hi, id, r.ts))
}

/**
 * What a summary's mark cell shows (D-T14-mark-glyphs): its own mark (a ❌ the summary was
 * rebuilt after no longer holds), else ✅ when every note under it is ✅ (spec L424), else none.
 */
export function summaryMark(cur, superseded, lo, hi) {
  const own = cur.get(lo + '-' + hi)
  if (own && own.mark === 'ok') return 'ok'
  if (own && own.mark === 'void' && !rebuiltFor(superseded, lo, hi, lo + '-' + hi, own.ts)) return 'void'
  for (let i = lo; i <= hi; i++) {
    const r = cur.get(String(i))
    if (!r || r.mark !== 'ok') return null
  }
  return 'ok'
}

/** The mark a line's id shows: a note's own, or a summary's (summaryMark). */
export function markOf(cur, superseded, id) {
  const [lo, hi] = idRange(id)
  if (lo === hi) {
    const r = cur.get(String(lo))
    return r ? r.mark : null
  }
  return summaryMark(cur, superseded, lo, hi)
}

export const REBUILDING = (lo, hi) => '#' + lo + '-' + hi + ': rebuilding (a note was voided)'

/**
 * Lines of memo's wake, zoom or recall, with the marks applied (spec L421-424, Q-76, Q-77, Q-90):
 * a ❌ note is left out unless includeVoid, and then printed `#n ❌ … (<reason> — <who>)`; a
 * summary not yet rebuilt over a ❌ prints the rebuilding line in its place (with includeVoid its
 * text is shown, as it is); a marked note or summary prints its glyph after its id.
 */
export function markLines(lines, cur, superseded, includeVoid = false) {
  const out = []
  for (const l of lines) {
    const s = /^#(\d+)-(\d+) (.*)$/.exec(l)
    if (s) {
      const lo = Number(s[1])
      const hi = Number(s[2])
      if (isStale(cur, superseded, lo, hi) && !includeVoid) {
        out.push(REBUILDING(lo, hi))
        continue
      }
      const m = summaryMark(cur, superseded, lo, hi)
      const own = cur.get(lo + '-' + hi)
      out.push(m ? '#' + lo + '-' + hi + ' ' + MARK_GLYPH[m] + ' ' + s[3] + (own && own.mark === m ? ' (' + own.reason + ' — ' + own.who + ')' : '') : l)
      continue
    }
    const n = /^#(\d+) (.*)$/.exec(l)
    if (n) {
      const r = cur.get(String(Number(n[1])))
      if (r && r.mark === 'void' && !includeVoid) continue
      out.push(r ? '#' + n[1] + ' ' + MARK_GLYPH[r.mark] + ' ' + n[2] + ' (' + r.reason + ' — ' + r.who + ')' : l)
      continue
    }
    out.push(l)
  }
  return out
}

/** A superseded summary's old text as memory_recall lists it with include_void (D-T14-superseded-recall). */
export const supersededLine = (s) => '#' + s.lo + '-' + s.hi + ' (L' + s.level + ') superseded · ' + s.reason + ' · ' + s.text

/** Newlines to spaces, then cut to `max` UTF-8 bytes without splitting a code point, and no marker (Q-72). */
export function cutBytes(s, max = NOTE_BYTES) {
  let out = ''
  let used = 0
  for (const ch of cleanText(s)) {
    const b = enc.encode(ch).length
    if (used + b > max) break
    out += ch
    used += b
  }
  return out.trim()
}
