// node --test — T1, the API drift audit (cluster C1): the mismatches that live in what register.js passes and reads.
//
// Written from the spec (docs/designs/v7.6-tuning.md L23-33) and A1's audit BEFORE the fix (node T11, the split red step
// of F11). Spec L25-26: "Check every `$` call, event name, matcher, option and result shape in `mod/hooks/register.js`
// against the engine's current types." Spec L32: "Each mismatch gets a failing test first, then the fix."
// Requirement ids (_orch/plan/traceability.yaml, cluster C1): R-C1-04 "option" (L25), R-C1-05 "result shape in
// `mod/hooks/register.js`" (L25), R-C1-06 "against the engine's current types." (L26), R-C1-13 "Each mismatch gets a
// failing test first," (L32), R-C1-14 "then the fix." (L32).
//
// Why these pins read the source: the engine drops what its types do not declare, so nothing drawn shows it. A `key`
// passed to ui.Text never reaches the drawn tree (probe: _orch/nodes/T11/work/false-premise.md §keys, a Text's drawn
// props hold no key while a Box's and a Button's do), and `tsc -p mod` does not type-check register.js (A1's tsc.txt:
// "mod/hooks/register.js is not type-checked by this command"). So each test reads register.js the way A1's audit did.
//
// The record pinned: A1's confirmed _orch/nodes/A1/work/mismatches.yaml (types: Claude Code 2.1.304). For each id the
// test names the site as A1 found it (register.js line at the run tip da5910c) and the `key` expression that site passes
// (read off that line: it is how the test finds the site again after lines move, not an expected value). The expected
// value is A1's declaration: `export type TextProps = {` (index.d.ts:13348) and `export type LinkProps = {`
// (index.d.ts:5820) have no `key`; "only Box (index.d.ts:937), Button (index.d.ts:1104) and Input (index.d.ts:5628)
// declare key".
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SRC = readFileSync(fileURLToPath(new URL('../hooks/register.js', import.meta.url)), 'utf8')

/** Skip a string, template or comment starting at i; return the index after it, or i when none starts there. */
function skipLiteral(s, i) {
  const c = s[i]
  if (c === "'" || c === '"') {
    let j = i + 1
    while (j < s.length && s[j] !== c) j += s[j] === '\\' ? 2 : 1
    return j + 1
  }
  if (c === '`') {
    let j = i + 1
    while (j < s.length && s[j] !== '`') {
      if (s[j] === '\\') j += 2
      else if (s[j] === '$' && s[j + 1] === '{') j = balanced(s, j + 1) + 1
      else j++
    }
    return j + 1
  }
  if (c === '/' && s[i + 1] === '/') return s.indexOf('\n', i) === -1 ? s.length : s.indexOf('\n', i)
  if (c === '/' && s[i + 1] === '*') return s.indexOf('*/', i + 2) + 2
  return i
}
/** The index of the bracket closing the one at i ({, ( or [). */
function balanced(s, i) {
  let depth = 0
  for (let j = i; j < s.length; ) {
    const k = skipLiteral(s, j)
    if (k !== j) {
      j = k
      continue
    }
    const c = s[j]
    if (c === '{' || c === '(' || c === '[') depth++
    else if (c === '}' || c === ')' || c === ']') {
      depth--
      if (depth === 0) return j
    }
    j++
  }
  return s.length
}
/** The top-level `key` of an object literal's text ({ ... }): its expression, or null when it passes none. */
function topKey(obj) {
  const body = obj.slice(1, -1)
  let depth = 0
  let start = 0
  const props = []
  for (let j = 0; j <= body.length; ) {
    if (j === body.length) {
      props.push(body.slice(start))
      break
    }
    const k = skipLiteral(body, j)
    if (k !== j) {
      j = k
      continue
    }
    const c = body[j]
    if (c === '{' || c === '(' || c === '[') depth++
    else if (c === '}' || c === ')' || c === ']') depth--
    else if (c === ',' && depth === 0) {
      props.push(body.slice(start, j))
      start = j + 1
    }
    j++
  }
  for (const p of props.map((x) => x.trim())) {
    if (p === 'key') return 'key' // shorthand { key }
    const m = /^key\s*:\s*([\s\S]*)$/.exec(p)
    if (m) return m[1].trim()
  }
  return null
}
const lineAt = (i) => SRC.slice(0, i).split('\n').length
/** Every call of `name({ ... })` in register.js: its line and the key it passes (null for none). */
function calls(name) {
  const out = []
  const re = new RegExp('(^|[^A-Za-z0-9_$.])' + name + '\\(\\s*\\{', 'g')
  for (let m; (m = re.exec(SRC)); ) {
    const open = SRC.indexOf('{', m.index + m[1].length)
    const close = balanced(SRC, open)
    out.push({ line: lineAt(open), key: topKey(SRC.slice(open, close + 1)) })
  }
  return out
}
const keyed = (name) => calls(name).filter((c) => c.key !== null)

// mismatches.yaml, every `ui.Text {key}` / `ui.Link {key}` row: id, element, the site's line at da5910c, and the key
// expression that line passes (the locator, read off the line).
const SITES = [
  ['S0129', 'Text', 1109, "key + '-l'"],
  ['S0133', 'Text', 1110, "key + '-' + i"],
  ['S0137', 'Link', 1121, "key + '-i'"],
  ['S0142', 'Text', 1122, "key + '-t'"],
  ['S0146', 'Text', 1124, "key + '-s'"],
  ['S0149', 'Link', 1125, "key + '-p'"],
  ['S0154', 'Text', 1126, "key + '-c'"],
  ['S0169', 'Text', 1176, "'w-fs' + i"],
  ['S0173', 'Link', 1177, "'w-fl' + i"],
  ['S0176', 'Text', 1177, "'w-fa' + i"],
  ['S0180', 'Text', 1178, "'w-ft' + i"],
  ['S0184', 'Text', 1184, "'w-sp1'"],
  ['S0187', 'Text', 1187, "'w-sp4'"],
  ['S0190', 'Text', 1189, "'w-sp2'"],
  ['S0193', 'Text', 1193, "'w-sp3'"],
  ['S0201', 'Text', 1217, 'key + i'],
  ['S0211', 'Text', 1232, "'plan-t'"],
  ['S0256', 'Text', 1271, "'md-t'"],
  ['S0264', 'Text', 1272, "'md-l' + i + 's' + j"],
  ['S0269', 'Text', 1275, "'mt-r'"],
  ['S0289', 'Text', 1360, "'d-t'"],
  ['S0299', 'Text', 1366, "'d-sp' + i"],
  ['S0307', 'Text', 1367, "'d-l' + i + 's' + j"],
  ['S0311', 'Text', 1374, "'d-sp-m'"],
  ['S0336', 'Text', 1459, "'ah-pad'"],
  ['S0344', 'Text', 1463, "'open-pad' + i"],
  ['S0348', 'Text', 1464, "'a' + i + 'c' + j"],
  ['S0375', 'Text', 1500, "'agents-hint'"],
  ['S0737', 'Text', 2947, 'key'],
  ['S0765', 'Text', 2991, "'b' + i"],
  ['S0770', 'Text', 2995, "'wait'"],
  ['S0807', 'Text', 3031, "'upd-t'"],
  ['S0817', 'Text', 3036, "'upd-done'"],
  ['S0822', 'Text', 3037, "'pause'"],
  ['S0827', 'Text', 3039, "'doctor'"],
]

for (const [id, el, line, key] of SITES) {
  test(id + ': the ui.' + el + ' at register.js:' + line + ' (key ' + key + ') passes no key, which ' + el + 'Props does not declare', () => {
    // R-C1-04 "option" (L25), R-C1-06 "against the engine's current types." (L26), R-C1-13 (L32). mismatches.yaml
    // <id> kind option, text "ui.<el> {key}": "key is outside the declared props of <el>".
    const declared = el === 'Text' ? 'index.d.ts:13348 `export type TextProps = {`' : 'index.d.ts:5820 `export type LinkProps = {`' // mismatches.yaml <id>.declared
    const boxKeys = keyed('Box').length // Box declares key (index.d.ts:937): the reader sees keys where they belong
    const still = keyed(el).filter((c) => c.key === key).map((c) => 'register.js:' + c.line + ' ' + el + '({ key: ' + c.key + ' })')
    assert.ok(boxKeys > 0, 'the reader finds the keys Box calls pass')
    assert.deepEqual(still, [], el + ' takes no key (' + declared + '; mismatches.yaml ' + id + ')') // expected: none (A1's declaration)
  })
}

test('S0129..S0827: no ui.Text or ui.Link call in register.js passes a key', () => {
  // R-C1-04 (L25), R-C1-06 (L26), R-C1-12 "no call site left unverified." (L31). mismatches.yaml, every `ui.Text {key}`
  // and `ui.Link {key}` row: "only Box (index.d.ts:937), Button (index.d.ts:1104) and Input (index.d.ts:5628) declare
  // key". This catches a key the fix moves to another Text or Link rather than dropping.
  const left = [...keyed('Text'), ...keyed('Link')].map((c) => 'register.js:' + c.line + ' key ' + c.key)
  assert.ok(keyed('Box').length > 0, 'the reader finds the keys Box calls pass')
  assert.deepEqual(left, []) // expected: none (TextProps index.d.ts:13348 and LinkProps index.d.ts:5820 have no key)
})

test('S0632: the prompt.submit hook reads no e.agentId, a field PromptSubmitInput does not declare', () => {
  // R-C1-05 "result shape in `mod/hooks/register.js`" (L25), R-C1-06 (L26), R-C1-13 (L32). mismatches.yaml S0632
  // (register.js:2727): declared index.d.ts:9476 `export type PromptSubmitInput = {`; "PromptSubmitInput
  // (index.d.ts:9476-9544) declares text, command, isMeta, attachments, context, turnId, wait, origin; no agentId";
  // "e.agentId is always undefined by the declaration, so the !e.agentId test cannot tell a subagent prompt from the prime's".
  const hooks = []
  const re = /on\('prompt\.submit'\s*,/g
  for (let m; (m = re.exec(SRC)); ) {
    const open = SRC.indexOf('(', m.index)
    const close = balanced(SRC, open)
    hooks.push({ line: lineAt(m.index), body: SRC.slice(open, close + 1) })
  }
  assert.ok(hooks.length > 0, 'register.js registers a prompt.submit hook (mismatches.yaml S0632 names one)')
  const reads = hooks.filter((h) => /\be\.agentId\b/.test(h.body)).map((h) => 'register.js:' + h.line)
  assert.deepEqual(reads, []) // expected: none (PromptSubmitInput, index.d.ts:9476-9544, has no agentId)
})
