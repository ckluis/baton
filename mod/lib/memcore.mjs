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
  'Plain text, no markdown, no preamble, no quotes. Output the line only.'

export function mergePrompt(item, texts) {
  return `Entries #${item.lo}-${item.hi} (level ${item.level}), oldest first:\n` + texts.map((t, j) => `${j + 1}. ${t}`).join('\n')
}
