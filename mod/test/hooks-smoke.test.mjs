// node --test — runs the hooks smoke (fixtures/hooks-smoke.mjs) and fails on any FAIL line.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

test('hooks smoke: hierarchy, approvals, rulings, pane tabs', () => {
  const script = fileURLToPath(new URL('./fixtures/hooks-smoke.mjs', import.meta.url))
  let out
  try {
    out = execFileSync(process.execPath, [script], { encoding: 'utf8' })
  } catch (err) {
    assert.fail(String(err.stdout) + String(err.stderr))
  }
  assert.doesNotMatch(out, /^FAIL/m)
  assert.ok((out.match(/^ok /gm) ?? []).length >= 47, out)
})
