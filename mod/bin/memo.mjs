#!/usr/bin/env node
// memo — baton v7's memory on the command line (node, no dependencies).
//
// The mod drives the same store through this CLI (a hooks module has no Node
// file system, and $.fs has no append or exclusive create, so no lock).
//
//   memo [--dir D | --project [--root R]] [--ns NAME] [--json] <command>
//
//   note [--tag T] <text…>|-      append one note (≤280 bytes; longer is cut, and said so)
//   wake [--budget N]              the fixed-budget view: recent notes verbatim, older collapsed
//   zoom <lo>-<hi> [--budget N]    open a stretch back up (inclusive indices)
//   recall <regex> [--limit N]     notes and summaries that match
//   pending [--ready]              the pending-merge queue
//   merge [--summarize] [--max N]  run ready merges; --summarize reads summaries
//                                  from stdin (JSON lines {level,index,summary},
//                                  or plain lines in queue order); without it a
//                                  deterministic fallback merge is used
//   stats                          counts: notes, summaries, pending, levels
//
// --dir defaults to $BATON_MEMORY_DIR, else _orch/memory under the cwd.
// --project uses the project memory: <root>/<memoryDir> (default .baton/memory).
// --ns NAME puts the memory under <dir>/ns/NAME (a separate memory, e.g. the rulings).

import fs from 'node:fs'
import path from 'node:path'
import { Memory } from '../lib/memstore.mjs'
import { fallbackMerge, clampBytes } from '../lib/memcore.mjs'

function parseArgs(argv) {
  const flags = {}
  const rest = []
  const takesValue = new Set(['dir', 'root', 'ns', 'tag', 'budget', 'limit', 'max', 'memory-dir'])
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') {
      rest.push(...argv.slice(i + 1))
      break
    }
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split(/=(.*)/s)
      if (v !== undefined) flags[k] = v
      else if (takesValue.has(k)) flags[k] = argv[++i]
      else flags[k] = true
    } else rest.push(a)
  }
  return { flags, rest }
}

function resolveDir(flags) {
  let dir
  if (flags.dir) dir = flags.dir
  else if (flags.project) dir = path.join(flags.root || process.cwd(), flags['memory-dir'] || '.baton/memory')
  else dir = process.env.BATON_MEMORY_DIR || path.join(process.cwd(), '_orch', 'memory')
  if (flags.ns) {
    const ns = String(flags.ns).replace(/[^A-Za-z0-9_.\-]/g, '')
    if (!ns) throw new Error('--ns must have letters or digits')
    dir = path.join(dir, 'ns', ns)
  }
  return dir
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

function out(flags, obj, text) {
  process.stdout.write(flags.json ? JSON.stringify(obj) + '\n' : text.endsWith('\n') ? text : text + '\n')
}

function main(argv) {
  const { flags, rest } = parseArgs(argv)
  const cmd = rest.shift()
  if (!cmd || flags.help || cmd === 'help') {
    process.stdout.write(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).slice(1, 22).map((l) => l.slice(3)).join('\n') + '\n')
    return 0
  }
  const mem = new Memory(resolveDir(flags))
  const budget = flags.budget ? Number(flags.budget) : 96

  switch (cmd) {
    case 'note': {
      let text = rest.join(' ')
      if (text === '-') text = readStdin()
      const r = mem.append(text, flags.tag || 'note')
      const msg = `noted #${r.index}` + (r.truncated ? ' (cut to 280 bytes)' : '') + (r.merges.length ? `; ${r.merges.length} merge(s) now pending` : '')
      out(flags, r, msg)
      return 0
    }
    case 'wake': {
      const w = mem.wake(budget)
      out(flags, w, [w.header, ...w.lines].join('\n'))
      return 0
    }
    case 'zoom': {
      const z = mem.zoom(rest.join(''), budget)
      out(flags, z, [z.header, ...z.lines].join('\n'))
      return 0
    }
    case 'recall': {
      const limit = flags.limit ? Number(flags.limit) : 20
      const r = mem.recall(rest.join(' '), limit)
      const lines = [
        `recall /${r.pattern}/i: ${r.total} note(s)` + (r.total > r.notes.length ? `, newest ${r.notes.length} shown` : '') + `, ${r.blocks.length} summary block(s)`,
        ...r.blocks.map((b) => `#${b.lo}-${b.hi} (L${b.level}) ${b.text}`),
        ...r.notes.map((x) => `#${x.index} ${x.ts} [${x.tag}] ${x.text}`),
      ]
      out(flags, r, lines.join('\n'))
      return 0
    }
    case 'pending': {
      let p = mem.pending()
      if (flags.ready) p = p.filter((x) => x.ready)
      if (flags.texts) p = p.map((x) => (x.ready ? { ...x, texts: mem.childTexts(x.level, x.index) } : x))
      out(flags, p, p.length ? p.map((x) => `L${x.level}#${x.index} notes #${x.lo}-${x.hi}${x.ready ? ' ready' : ''}`).join('\n') : 'no merges pending')
      return 0
    }
    case 'merge': {
      const max = flags.max ? Number(flags.max) : Infinity
      let summarize = (_item, texts) => fallbackMerge(texts)
      if (flags.summarize) {
        const lines = readStdin().split('\n').map((l) => l.trim()).filter(Boolean)
        const keyed = new Map()
        const plain = []
        for (const l of lines) {
          try {
            const j = JSON.parse(l)
            if (j && typeof j === 'object' && Number.isInteger(j.level) && Number.isInteger(j.index)) {
              keyed.set(`${j.level}:${j.index}`, String(j.summary ?? ''))
              continue
            }
          } catch {}
          plain.push(l)
        }
        // Supplied summaries only: an item with no summary given is left pending.
        let n = 0
        summarize = (item) => keyed.get(`${item.level}:${item.index}`) ?? plain[n++] ?? null
        let done = 0
        for (const item of mem.pending().filter((x) => x.ready)) {
          if (done >= max) break
          const s = summarize(item)
          if (!s || !clampBytes(s).text) continue
          if (mem.putSummary(item.level, item.index, s)) done++
        }
        out(flags, { merged: done, pending: mem.pending().length }, `merged ${done}; ${mem.pending().length} pending`)
        return 0
      }
      const done = mem.mergeAll(summarize, max)
      out(flags, { merged: done, pending: mem.pending().length }, `merged ${done} (fallback); ${mem.pending().length} pending`)
      return 0
    }
    case 'stats': {
      const s = mem.stats()
      out(flags, s, `${s.notes} notes, ${s.summaries}/${s.treeCapacity} summaries, ${s.levels} levels, ${s.pending} pending (${s.ready} ready) — ${s.dir}`)
      return 0
    }
    default:
      process.stderr.write(`memo: unknown command "${cmd}" (note, wake, zoom, recall, pending, merge, stats)\n`)
      return 2
  }
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (e) {
  process.stderr.write(`memo: ${e.message}\n`)
  process.exitCode = 1
}
