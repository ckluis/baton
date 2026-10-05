// node --test — runs the GitHub/tracker smoke (fixtures/github-smoke.mjs) and fails on any FAIL line.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

test('github smoke: issue goal, PR polling, review, remote gate, tracker', () => {
  const script = fileURLToPath(new URL('./fixtures/github-smoke.mjs', import.meta.url))
  let out
  try {
    out = execFileSync(process.execPath, [script], { encoding: 'utf8' })
  } catch (err) {
    assert.fail(String(err.stdout) + String(err.stderr))
  }
  assert.doesNotMatch(out, /^FAIL/m)
  assert.ok((out.match(/^ok /gm) ?? []).length >= 17, out)
})
