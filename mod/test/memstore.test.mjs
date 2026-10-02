// node --test mod/test — the store on disk, the CLI, and concurrency.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { Memory } from '../lib/memstore.mjs'
import { RECORD_BYTES } from '../lib/memcore.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const MEMO = path.join(here, '..', 'bin', 'memo.mjs')
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'baton-mem-'))
const memo = (dir, args, input) => spawnSync(process.execPath, [MEMO, '--dir', dir, ...args], { input, encoding: 'utf8' })

test('fixed-width log: size is n * RECORD_BYTES and note i is read by seeking', () => {
  const dir = tmp()
  const mem = new Memory(dir)
  for (let i = 0; i < 37; i++) assert.equal(mem.append(`note ${i}`, 'prime').index, i)
  assert.equal(fs.statSync(path.join(dir, 'log.dat')).size, 37 * RECORD_BYTES)
  assert.equal(mem.count(), 37)
  assert.equal(mem.readNote(23).text, 'note 23')
  assert.equal(mem.readNote(37), null)
  // A byte-level seek agrees with readNote.
  const fd = fs.openSync(path.join(dir, 'log.dat'), 'r')
  const buf = Buffer.alloc(RECORD_BYTES)
  fs.readSync(fd, buf, 0, RECORD_BYTES, 11 * RECORD_BYTES)
  fs.closeSync(fd)
  assert.match(buf.toString('utf8'), /\[?prime\s+note 11\s+\|\n$/)
})

test('a torn tail is not a note, and the next append repairs it', () => {
  const dir = tmp()
  const mem = new Memory(dir)
  mem.append('one')
  mem.append('two')
  fs.appendFileSync(path.join(dir, 'log.dat'), Buffer.alloc(100, 0x41))
  assert.equal(mem.count(), 2)
  assert.equal(mem.append('three').index, 2)
  assert.equal(fs.statSync(path.join(dir, 'log.dat')).size, 3 * RECORD_BYTES)
  assert.equal(mem.readNote(2).text, 'three')
})

test('append reports truncation and the merges it completed', () => {
  const mem = new Memory(tmp())
  for (let i = 0; i < 7; i++) mem.append(`n${i}`)
  const r = mem.append('x'.repeat(400))
  assert.equal(r.index, 7)
  assert.equal(r.truncated, true)
  assert.deepEqual(r.merges.map((b) => b.level), [1, 2, 3])
  assert.throws(() => mem.append('   '), /empty note/)
})

test('merges: summaries per level, first writer wins, wake uses them', () => {
  const mem = new Memory(tmp())
  for (let i = 0; i < 20; i++) mem.append(`node N${i} done`)
  assert.equal(mem.pending().length, 10 + 5 + 2 + 1)
  const n = mem.mergeAll((item) => `S L${item.level}#${item.index}`)
  assert.equal(n, 18)
  assert.equal(mem.pending().length, 0)
  assert.equal(mem.getSummary(4, 0), 'S L4#0')
  assert.equal(mem.putSummary(1, 0, 'again'), false, 'first writer wins')
  assert.throws(() => mem.putSummary(3, 2, 'x'), /not complete/)
  const w = mem.wake(6)
  assert.equal(w.tiles.length, 6)
  assert.match(w.lines[0], /^#0-7 \(8 notes\) S L3#0$/)
  assert.match(w.lines.at(-1), /^#19 .* node N19 done$/)
  const s = mem.stats()
  assert.equal(s.summaries, 18)
  assert.equal(s.treeCapacity, 18)
})

test('zoom and recall over the store', () => {
  const mem = new Memory(tmp())
  for (let i = 0; i < 40; i++) mem.append(i === 7 ? 'operator chose route B for P9' : `routine ${i}`, i === 7 ? 'operator' : 'sub')
  mem.mergeAll()
  const z = mem.zoom('4-9', 96)
  assert.deepEqual(z.tiles.map((t) => t.lo), [4, 5, 6, 7, 8, 9])
  assert.match(z.lines[3], /operator chose route B/)
  const tight = mem.zoom('0-39', 3)
  assert.equal(tight.tiles.length, 3)
  const r = mem.recall('route b')
  assert.equal(r.total, 1)
  assert.equal(r.notes[0].index, 7)
  assert.ok(r.blocks.length >= 1, 'the summaries that carry it match too')
  assert.equal(mem.recall('^operator$').total, 1, 'tags match')
})

test('CLI: note, wake, zoom, recall, pending, merge --summarize, stats', () => {
  const dir = tmp()
  for (let i = 0; i < 4; i++) assert.equal(memo(dir, ['note', '--tag', 'prime', `step ${i}`]).status, 0)
  assert.match(memo(dir, ['note', '-'], 'from stdin').stdout, /noted #4/)
  const pend = JSON.parse(memo(dir, ['--json', 'pending', '--ready', '--texts']).stdout)
  assert.deepEqual(pend.map((p) => `${p.level}:${p.index}`), ['1:0', '1:1'])
  assert.deepEqual(pend[0].texts, ['step 0', 'step 1'])
  const sum = [JSON.stringify({ level: 1, index: 1, summary: 'steps 2-3' }), 'steps 0-1'].join('\n')
  assert.match(memo(dir, ['merge', '--summarize'], sum).stdout, /merged 2; 1 pending/)
  assert.match(memo(dir, ['merge', '--summarize'], 'all four steps\n').stdout, /merged 1; 0 pending/)
  const wake = memo(dir, ['wake', '--budget', '2']).stdout.trim().split('\n')
  assert.match(wake[0], /5 notes, 3 summaries, 0 merges pending; 2 blocks/)
  assert.equal(wake[1], '#0-3 (4 notes) all four steps')
  assert.match(wake[2], /^#4 .* \[note\] from stdin$/)
  assert.match(memo(dir, ['zoom', '1-2']).stdout, /step 1\n.*step 2/)
  assert.match(memo(dir, ['recall', 'STEP 3']).stdout, /1 note\(s\)/)
  assert.equal(JSON.parse(memo(dir, ['--json', 'stats']).stdout).notes, 5)
  assert.equal(memo(dir, ['bogus']).status, 2)
  assert.equal(memo(dir, ['zoom', '9-12']).status, 1)
})

test('CLI: --project and --ns pick the project memory and a namespace', () => {
  const root = tmp()
  const r = spawnSync(process.execPath, [MEMO, '--project', '--root', root, '--ns', 'luminary-tufte', 'note', 'missed the axis label'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.ok(fs.existsSync(path.join(root, '.baton', 'memory', 'ns', 'luminary-tufte', 'log.dat')))
})

test('concurrency: eight processes appending at once lose nothing and tear nothing', async () => {
  const dir = tmp()
  const per = 25
  const writers = 8
  const script = `import { Memory } from ${JSON.stringify(path.join(here, '..', 'lib', 'memstore.mjs'))}
const m = new Memory(process.argv[1]); for (let i = 0; i < ${per}; i++) m.append('w' + process.argv[2] + '-' + i, 'w' + process.argv[2])`
  await Promise.all(
    Array.from({ length: writers }, (_, w) =>
      new Promise((res, rej) => {
        const p = spawn(process.execPath, ['--input-type=module', '-e', script, dir, String(w)], { stdio: 'inherit' })
        p.on('exit', (code) => (code === 0 ? res() : rej(new Error('writer ' + w + ' exited ' + code))))
      }),
    ),
  )
  const mem = new Memory(dir)
  assert.equal(mem.count(), per * writers)
  assert.equal(fs.statSync(path.join(dir, 'log.dat')).size, per * writers * RECORD_BYTES)
  const seen = new Set()
  for (let i = 0; i < mem.count(); i++) seen.add(mem.readNote(i).text)
  assert.equal(seen.size, per * writers, 'every note once')
  // Each writer's own notes stay in its order.
  for (let w = 0; w < writers; w++) {
    const mine = []
    for (let i = 0; i < mem.count(); i++) if (mem.readNote(i).tag === 'w' + w) mine.push(Number(mem.readNote(i).text.split('-')[1]))
    assert.deepEqual(mine, [...mine].sort((a, b) => a - b))
  }
  assert.ok(!fs.existsSync(path.join(dir, 'lock')), 'the lock is released')
})

test('concurrency: merges from two processes write each summary once', async () => {
  const dir = tmp()
  const mem = new Memory(dir)
  for (let i = 0; i < 64; i++) mem.append(`n${i}`)
  const run = () =>
    new Promise((res) => {
      const p = spawn(process.execPath, [MEMO, '--dir', dir, 'merge'], { stdio: 'ignore' })
      p.on('exit', res)
    })
  await Promise.all([run(), run(), run()])
  const s = mem.stats()
  assert.equal(s.summaries, 63)
  assert.equal(s.pending, 0)
})

test('a lock left by a dead process is broken; a live one times out', () => {
  const dir = tmp()
  const mem = new Memory(dir, { lockTimeoutMs: 300 })
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'lock'), '999999 0\n') // no such pid
  assert.equal(mem.append('after a crash').index, 0)
  fs.writeFileSync(path.join(dir, 'lock'), `${process.pid} ${Date.now()}\n`) // held by us, alive
  assert.throws(() => mem.append('blocked'), /locked/)
  fs.unlinkSync(path.join(dir, 'lock'))
})
