// node --test — FX7 attempt 3: no code path of the mod opens ~/.claude.json (R-C3-13; operator answer Q-FX7-1 = B).
//
// /Users/clank/Desktop/projects/baton/_orch/inbox/Q-FX7-1.answer.md: "the baton mod must NOT read ~/.claude.json,
// not even this project's entry ... Add a test that the mod never opens ~/.claude.json." The plugin test
// tests/fx7-transcript.test.ts records every path the mod reads while it runs; this one covers the code paths a run
// does not reach: no source file the mod loads names that file or builds a path from the home directory.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const MOD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sources = ['hooks', 'lib', 'bin'].flatMap((d) =>
  readdirSync(path.join(MOD, d))
    .filter((f) => /\.(m?js|ts)$/.test(f))
    .map((f) => path.join(d, f)),
)

// R-C3-13 (Q-FX7-1 B): the file's name, in any spelling a path could be built from.
test('FX7 R-C3-13 (Q-FX7-1 B): no mod source names ~/.claude.json or builds a path from the home directory', () => {
  assert.ok(sources.includes(path.join('hooks', 'register.js')), 'the hook module is among the sources scanned')
  const hits = []
  for (const f of sources) {
    const text = readFileSync(path.join(MOD, f), 'utf8')
    text.split('\n').forEach((line, i) => {
      if (/\.claude\.json|claude\.json['"`]|homedir\s*\(|['"`]HOME['"`]|process\.env\.HOME/.test(line)) hits.push(f + ':' + (i + 1) + ': ' + line.trim().slice(0, 120))
    })
  }
  assert.deepEqual(hits, [])
})
