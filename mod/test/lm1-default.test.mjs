// node --test — LM1 criterion 1 (run build-20261019T125436Z, phase P7; operator decision 2026-11-09): the default
// layout is the strip, held in ONE named constant, `DEFAULT_LAYOUT = 'strip'`, that every default path reads.
//
// The constant is exported by mod/lib/view.mjs (pure); the hooks module imports it. Pinned here:
//   - it is the strip, and it is declared once in the whole product (mod/hooks/register.js and mod/lib/*.mjs);
//   - every value that is no layout (nothing saved, an old or a mistyped one) reads as it (`layoutOf`);
//   - the hooks module spells no default of its own: no `'strip'` literal in mod/hooks/register.js (bar the band's
//     element key `key: 'strip'`), so the
//     layout it starts with, the one it falls back to when the store cannot be read and the one an unknown value
//     reads as all come from DEFAULT_LAYOUT.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'
import { DEFAULT_LAYOUT, LAYOUTS, layoutOf } from '../lib/view.mjs'

const MOD = new URL('..', import.meta.url).pathname
const hooks = readFileSync(MOD + 'hooks/register.js', 'utf8')
const libs = readdirSync(MOD + 'lib').filter((f) => f.endsWith('.mjs')).map((f) => [f, readFileSync(MOD + 'lib/' + f, 'utf8')])

test('LM1: DEFAULT_LAYOUT is the strip, one of the two layouts', () => {
  assert.equal(DEFAULT_LAYOUT, 'strip')
  assert.deepEqual([...LAYOUTS].sort(), ['panel', 'strip'])
})

test('LM1: DEFAULT_LAYOUT is declared once in the product, in mod/lib/view.mjs', () => {
  const decl = /\bDEFAULT_LAYOUT\s*=\s*'strip'/g
  const where = [['hooks/register.js', hooks], ...libs.map(([f, s]) => ['lib/' + f, s])].flatMap(([f, s]) => (s.match(decl) || []).map(() => f))
  assert.deepEqual(where, ['lib/view.mjs'])
})

test('LM1: every value that is no layout reads as DEFAULT_LAYOUT; a layout reads as itself', () => {
  for (const v of [undefined, null, '', 'sideways', 'Panel ', 7, {}, ['panel']]) assert.equal(layoutOf(v), DEFAULT_LAYOUT, JSON.stringify(v))
  assert.equal(layoutOf('strip'), 'strip')
  assert.equal(layoutOf('panel'), 'panel')
})

test('LM1: the hooks module imports DEFAULT_LAYOUT and spells no default layout of its own', () => {
  assert.match(hooks, /import \{[^}]*\bDEFAULT_LAYOUT\b[^}]*\} from '\.\.\/lib\/view\.mjs'/)
  assert.match(hooks, /\bmode: DEFAULT_LAYOUT\b/)
  // (a drawn element keyed `strip`, the band's second line, names an element, not a layout)
  const literals = hooks.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /'strip'|"strip"|`strip`/.test(l.replace(/\bkey: 'strip'/g, '')))
  assert.deepEqual(literals, [])
})
