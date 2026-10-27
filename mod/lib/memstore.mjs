// baton v7 memory store: the memory core on the file system (Node only).
//
// One memory is a directory:
//   log.dat        the notes, RECORD_BYTES each, append-only
//   tree/L<k>.dat  level-k summaries, record i at byte i * RECORD_BYTES (sparse)
//   lock           present while a writer holds the memory (O_EXCL create)
//   marks.jsonl    the mark log (T14, Q-74): one JSON record per line, append-only
//   superseded.jsonl  the old text of every rebuilt summary, with the reason (Q-84), append-only
//
// Writers (append, putSummary) take the lock. Readers never do: a record is
// read only when it is whole (memcore.isWhole), and the note count is
// floor(size / RECORD_BYTES) of whole records, so a reader racing an append
// sees the memory before or after it, never half of it.

import fs from 'node:fs'
import path from 'node:path'
import {
  RECORD_BYTES,
  clampBytes,
  decodeRecord,
  encodeRecord,
  fallbackMerge,
  newlyComplete,
  pendingMerges,
  renderTiles,
  toRegex,
  wakeTiling,
  parseRange,
  maxLevel,
  completeAt,
  fullTreeSize,
  blockRange,
  blockOf,
  cutBytes,
  idRange,
  isoSeconds,
  markId,
  MARK_VALUES,
} from './memcore.mjs'

const sleepBuf = new Int32Array(new SharedArrayBuffer(4))
function sleepMs(ms) {
  Atomics.wait(sleepBuf, 0, 0, ms)
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}

export class Memory {
  /**
   * @param dir   the memory's directory (created on first write)
   * @param opts  { lockTimeoutMs = 10000, staleMs = 30000, now = Date.now }
   */
  constructor(dir, opts = {}) {
    this.dir = path.resolve(dir)
    this.logPath = path.join(this.dir, 'log.dat')
    this.treeDir = path.join(this.dir, 'tree')
    this.lockPath = path.join(this.dir, 'lock')
    this.marksPath = path.join(this.dir, 'marks.jsonl')
    this.supersededPath = path.join(this.dir, 'superseded.jsonl')
    this.lockTimeoutMs = opts.lockTimeoutMs ?? 10000
    this.staleMs = opts.staleMs ?? 30000
    this.now = opts.now ?? Date.now
  }

  // ------------------------------------------------------------ locking

  withLock(fn) {
    fs.mkdirSync(this.dir, { recursive: true })
    const deadline = Date.now() + this.lockTimeoutMs
    let fd
    for (;;) {
      try {
        fd = fs.openSync(this.lockPath, 'wx')
        fs.writeSync(fd, `${process.pid} ${Date.now()}\n`)
        break
      } catch (e) {
        if (e.code !== 'EEXIST') throw e
        this.breakStaleLock()
        if (Date.now() > deadline) throw new Error(`memory ${this.dir} is locked (timed out after ${this.lockTimeoutMs} ms)`)
        sleepMs(2 + Math.floor(Math.random() * 8))
      }
    }
    try {
      return fn()
    } finally {
      fs.closeSync(fd)
      try {
        fs.unlinkSync(this.lockPath)
      } catch {}
    }
  }

  /** Remove a lock whose holder died, or one older than staleMs. */
  breakStaleLock() {
    let st, body
    try {
      st = fs.statSync(this.lockPath)
      body = fs.readFileSync(this.lockPath, 'utf8')
    } catch {
      return
    }
    const pid = Number(body.split(' ')[0])
    const old = Date.now() - st.mtimeMs > this.staleMs
    const dead = body.trim() !== '' && !pidAlive(pid)
    if (old || dead) {
      try {
        fs.unlinkSync(this.lockPath)
      } catch {}
    }
  }

  // ------------------------------------------------------------ notes

  /** Number of whole notes. */
  count() {
    let size
    try {
      size = fs.statSync(this.logPath).size
    } catch {
      return 0
    }
    let n = Math.floor(size / RECORD_BYTES)
    // A crash mid-append can leave a torn last record; it does not count.
    while (n > 0 && !this.readNote(n - 1)) n--
    return n
  }

  /** Read note i by seeking to i * RECORD_BYTES; null when absent or torn. */
  readNote(i) {
    return readRecordAt(this.logPath, i)
  }

  /**
   * Append a note under the lock. Returns { index, text, truncated, merges }
   * where merges lists the blocks this note completed.
   */
  append(text, tag = 'note') {
    const { text: clean, truncated } = clampBytes(text)
    if (!clean) throw new Error('empty note')
    const rec = encodeRecord({ text: clean, tag, ts: this.now() })
    const index = this.withLock(() => {
      const fd = fs.openSync(this.logPath, 'a+')
      try {
        const size = fs.fstatSync(fd).size
        let n = Math.floor(size / RECORD_BYTES)
        while (n > 0 && !readRecordFd(fd, n - 1)) n--
        if (n * RECORD_BYTES !== size) fs.ftruncateSync(fd, n * RECORD_BYTES)
        // 'a+' appends regardless of position on POSIX; after the truncate the
        // end of the file is exactly n * RECORD_BYTES.
        fs.writeSync(fd, rec)
        return n
      } finally {
        fs.closeSync(fd)
      }
    })
    return { index, text: clean, truncated, merges: newlyComplete(index + 1) }
  }

  // ------------------------------------------------------------ tree

  summaryPath(k) {
    return path.join(this.treeDir, `L${k}.dat`)
  }

  getSummary(k, i) {
    const r = readRecordAt(this.summaryPath(k), i)
    return r ? r.text : null
  }

  hasSummary(k, i) {
    return this.getSummary(k, i) !== null
  }

  /** Write summary (k, i) under the lock. First writer wins; returns false if it already existed. */
  putSummary(k, i, text) {
    if (!(k >= 1)) throw new Error('summaries start at level 1')
    const n = this.count()
    if (!((i + 1) * 2 ** k <= n)) throw new Error(`block L${k}#${i} is not complete over ${n} notes`)
    const rec = encodeRecord({ text, tag: `L${k}`, ts: this.now() })
    return this.withLock(() => {
      if (this.hasSummary(k, i)) return false
      fs.mkdirSync(this.treeDir, { recursive: true })
      const fd = fs.openSync(this.summaryPath(k), fs.existsSync(this.summaryPath(k)) ? 'r+' : 'w+')
      try {
        fs.writeSync(fd, rec, 0, RECORD_BYTES, i * RECORD_BYTES)
      } finally {
        fs.closeSync(fd)
      }
      return true
    })
  }

  /** The texts a merge of block (k, i) compresses: two notes, or two child summaries. */
  childTexts(k, i) {
    if (k === 1) return [this.readNote(2 * i)?.text, this.readNote(2 * i + 1)?.text]
    return [this.getSummary(k - 1, 2 * i), this.getSummary(k - 1, 2 * i + 1)]
  }

  /**
   * Load every level file once, for an operation that asks about many blocks.
   * Returns { has(k, i), get(k, i) } over that snapshot.
   */
  treeSnapshot() {
    const levels = new Map()
    const load = (k) => {
      if (!levels.has(k)) {
        let buf = null
        try {
          buf = fs.readFileSync(this.summaryPath(k))
        } catch {}
        levels.set(k, buf)
      }
      return levels.get(k)
    }
    const get = (k, i) => {
      const buf = load(k)
      if (!buf || (i + 1) * RECORD_BYTES > buf.length) return null
      const r = decodeRecord(new Uint8Array(buf.buffer, buf.byteOffset + i * RECORD_BYTES, RECORD_BYTES))
      return r ? r.text : null
    }
    return { get, has: (k, i) => get(k, i) !== null }
  }

  pending(n = this.count()) {
    const t = this.treeSnapshot()
    return pendingMerges(n, t.has)
  }

  /**
   * Run every ready merge, repeatedly, until none is ready or `max` were done.
   * @param summarize (item, texts) => string; default the deterministic fallback
   */
  mergeAll(summarize = (_item, texts) => fallbackMerge(texts), max = Infinity) {
    let done = 0
    const n = this.count()
    for (;;) {
      const ready = this.pending(n).filter((p) => p.ready)
      if (!ready.length) break
      let progressed = false
      for (const item of ready) {
        if (done >= max) return done
        const texts = this.childTexts(item.level, item.index)
        if (texts.some((t) => t == null)) continue
        progressed = true
        if (this.putSummary(item.level, item.index, summarize(item, texts))) done++
      }
      if (!progressed) break
    }
    return done
  }

  // ------------------------------------------------------------ marks (T14)

  /** Does `id` name a note or a written summary of this memory? */
  hasId(id, n = this.count()) {
    const [lo, hi] = idRange(id)
    if (lo === hi) return lo < n
    const b = blockOf(lo, hi)
    return !!b && hi < n && this.hasSummary(b.level, b.index)
  }

  /**
   * Append one mark record under the lock (Q-74): nothing is replaced, the newest record is the
   * current mark. Returns the record.
   */
  mark(rawId, mark, { who = '', session, reason = '' } = {}) {
    const id = markId(rawId)
    if (!id) throw new Error(`"${rawId}" is not a note number or a summary range lo-hi`)
    if (!MARK_VALUES.includes(mark)) throw new Error(`a mark is ${MARK_VALUES.join(', ')}, not "${mark}"`)
    if (!this.hasId(id)) throw new Error(`#${id} is not a note or a summary of this memory`)
    const rec = { id, mark, reason: cutBytes(reason), who: String(who), ...(session ? { session: String(session) } : {}), ts: isoSeconds(this.now()) }
    this.withLock(() => fs.appendFileSync(this.marksPath, JSON.stringify(rec) + '\n'))
    return rec
  }

  /** Every mark record (of one id), oldest first. */
  marks(id = null) {
    const want = id == null ? null : markId(id)
    return readJsonl(this.marksPath).filter((r) => want === null || r.id === want)
  }

  /**
   * Replace summary lo-hi with `text` under the lock (a ❌ rebuild, Q-75, Q-76): its old text is
   * appended to the superseded log first, with the reason, so nothing is deleted (Q-84).
   */
  rebuild(range, text, reason = '') {
    const id = markId(range)
    const [lo, hi] = id ? idRange(id) : [0, 0]
    const b = id && lo !== hi ? blockOf(lo, hi) : null
    if (!b) throw new Error(`"${range}" is not a summary range lo-hi`)
    const body = clampBytes(text).text
    if (!body) throw new Error('empty summary')
    const rec = encodeRecord({ text: body, tag: `L${b.level}`, ts: this.now() })
    return this.withLock(() => {
      const old = this.getSummary(b.level, b.index)
      if (old === null) throw new Error(`#${id} has no summary to rebuild`)
      const entry = { level: b.level, index: b.index, lo, hi, text: old, reason: String(reason), ts: isoSeconds(this.now()) }
      fs.appendFileSync(this.supersededPath, JSON.stringify(entry) + '\n')
      const fd = fs.openSync(this.summaryPath(b.level), 'r+')
      try {
        fs.writeSync(fd, rec, 0, RECORD_BYTES, b.index * RECORD_BYTES)
      } finally {
        fs.closeSync(fd)
      }
      return { level: b.level, index: b.index, lo, hi, old, text: body }
    })
  }

  /** Every superseded summary text, oldest first. */
  superseded() {
    return readJsonl(this.supersededPath)
  }

  // ------------------------------------------------------------ views

  stats() {
    const n = this.count()
    const t = this.treeSnapshot()
    let summaries = 0
    for (let k = 1; k <= maxLevel(n); k++) for (let i = 0; i < completeAt(k, n); i++) if (t.has(k, i)) summaries++
    const pend = pendingMerges(n, t.has)
    return {
      dir: this.dir,
      notes: n,
      summaries,
      treeCapacity: fullTreeSize(n),
      levels: maxLevel(n),
      pending: pend.length,
      ready: pend.filter((p) => p.ready).length,
      bytes: n * RECORD_BYTES,
    }
  }

  /** Tile [lo, hi) within budget and render. */
  view(lo, hi, budget) {
    const t = this.treeSnapshot()
    const tiles = wakeTiling(lo, hi, budget, t.has)
    // Notes are read by seeking to their record: a view reads at most `budget`
    // of them, however long the log is.
    const lines = renderTiles(tiles, (i) => this.readNote(i), t.get)
    return { tiles, lines }
  }

  wake(budget = 96) {
    const n = this.count()
    const s = this.stats()
    const head = `memory ${this.dir}: ${n} notes, ${s.summaries} summaries, ${s.pending} merges pending`
    if (n === 0) return { header: head, lines: [], tiles: [] }
    const { tiles, lines } = this.view(0, n, budget)
    return { header: `${head}; ${tiles.length} blocks (budget ${budget}), oldest first`, lines, tiles }
  }

  zoom(range, budget = 96) {
    const n = this.count()
    if (n === 0) return { header: 'memory is empty', lines: [], tiles: [] }
    const [lo, hi] = parseRange(range, n)
    const { tiles, lines } = this.view(lo, hi, budget)
    return { header: `notes #${lo}-${hi - 1} of ${n}; ${tiles.length} blocks (budget ${budget})`, lines, tiles }
  }

  /** Notes and summaries whose text or tag matches; the newest `limit` notes, plus matching summaries. */
  recall(pattern, limit = 20) {
    const re = toRegex(pattern)
    const n = this.count()
    const notes = []
    let log = Buffer.alloc(0)
    try {
      log = fs.readFileSync(this.logPath)
    } catch {}
    for (let i = 0; i < n; i++) {
      const r = decodeRecord(new Uint8Array(log.buffer, log.byteOffset + i * RECORD_BYTES, RECORD_BYTES))
      if (r && (re.test(r.text) || re.test(r.tag))) notes.push({ index: i, ...r })
    }
    const t = this.treeSnapshot()
    const blocks = []
    for (let k = 1; k <= maxLevel(n); k++) {
      for (let i = 0; i < completeAt(k, n); i++) {
        const s = t.get(k, i)
        if (s && re.test(s)) {
          const [lo, hi] = blockRange(k, i)
          blocks.push({ level: k, index: i, lo, hi: hi - 1, text: s })
        }
      }
    }
    return { pattern: re.source, total: notes.length, notes: notes.slice(-limit), blocks: blocks.slice(-limit) }
  }
}

/** The whole JSON lines of a log; a torn last line (a crash mid-append) is skipped. */
function readJsonl(file) {
  let text = ''
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const out = []
  for (const l of text.split('\n')) {
    if (!l.trim()) continue
    try {
      out.push(JSON.parse(l))
    } catch {}
  }
  return out
}

function readRecordFd(fd, i) {
  const buf = Buffer.alloc(RECORD_BYTES)
  const got = fs.readSync(fd, buf, 0, RECORD_BYTES, i * RECORD_BYTES)
  if (got < RECORD_BYTES) return null
  return decodeRecord(new Uint8Array(buf.buffer, buf.byteOffset, RECORD_BYTES))
}

function readRecordAt(file, i) {
  let fd
  try {
    fd = fs.openSync(file, 'r')
  } catch {
    return null
  }
  try {
    return readRecordFd(fd, i)
  } finally {
    fs.closeSync(fd)
  }
}
