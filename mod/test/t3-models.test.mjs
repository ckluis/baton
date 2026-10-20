// node --test — T3 "Models and prices" (spec docs/designs/v7.6-tuning.md L46-52), bullets 1-2:
// the mechanical model becomes Haiku 5.5, and the ledger knows the prices and context windows
// of Sonnet 5.5 and Haiku 5.5, including Haiku 5.5's price step above 100k-token prompts.
//
// Every expected value below is taken from the spec, from decisions.md Q-28, or from the live
// pricing record of node P3 (_orch/nodes/P3/work/pricing.json and pricing.md, read from
// https://platform.claude.com/docs/en/about-claude/pricing and .../models/overview on
// 2026-10-19). None is taken from the implementation.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MECH } from '../lib/binding.mjs'
import { addUsage, costOf, priceFor, windowFor } from '../lib/ledger.mjs'

// Dollar amounts are compared to a millionth of a cent: the prices are decimals.
const near = (actual, expected, msg) =>
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-8, `${msg}: got ${actual}, want ${expected}`)

// The cost of one request, as the ledger meters it: one usage added to a fresh account, then priced.
const costOfOne = (u) => costOf(addUsage({}, u))

// Pins R-C3-01 (_orch/plan/traceability.yaml).
// Spec L48: "`MECH` in `mod/lib/binding.mjs` becomes `claude-haiku-5-5`."
test('t3: MECH is claude-haiku-5-5', () => {
  // Expected value from spec L48, verbatim.
  assert.equal(MECH, 'claude-haiku-5-5')
})

// Pins R-C3-02 (_orch/plan/traceability.yaml).
// Spec L49-50: "`mod/lib/ledger.mjs` gains prices and context windows for `claude-sonnet-5-5` and
// `claude-haiku-5-5`. Check them on the pricing page first."
// Source record: P3 pricing.md, S1 row "| Claude Sonnet 5.5 | $2 / MTok | $2.50 / MTok | $4 / MTok | $0.10 / MTok<sup>2</sup> | $10 / MTok |".
test('t3: priceFor(claude-sonnet-5-5) is the live per-MTok price', () => {
  const p = priceFor('claude-sonnet-5-5')
  assert.ok(p, 'claude-sonnet-5-5 has a price entry')
  // input 2: pricing.json "claude-sonnet-5-5".input (S1 "$2 / MTok", Base input tokens)
  near(p?.input, 2, 'sonnet 5.5 input $/MTok')
  // output 10: pricing.json "claude-sonnet-5-5".output (S1 "$10 / MTok", Output tokens)
  near(p?.output, 10, 'sonnet 5.5 output $/MTok')
  // cacheRead 0.10: pricing.json "claude-sonnet-5-5".cacheRead (S1 "$0.10 / MTok", Cache hits and refreshes)
  near(p?.cacheRead, 0.1, 'sonnet 5.5 cache read $/MTok')
  // A dated or [1m] form of the id names the same model (priceFor's documented contract: a date
  // suffix and a [1m] tag are ignored), so it has the same price.
  near(priceFor('claude-sonnet-5-5[1m]')?.input, 2, 'sonnet 5.5 [1m] input $/MTok') // pricing.json input 2
})

// Pins R-C3-02 (_orch/plan/traceability.yaml).
// Spec L49-50: "`mod/lib/ledger.mjs` gains prices and context windows for `claude-sonnet-5-5` and
// `claude-haiku-5-5`. Check them on the pricing page first."
// Source record: P3 pricing.md, S1 row "| Claude Haiku 5.5 (for prompts up to 100,000 tokens) | $0.10 / MTok | $0.125 / MTok | $0.20 / MTok | $0.01 / MTok | $0.50 / MTok |".
test('t3: priceFor(claude-haiku-5-5) is the live base per-MTok price', () => {
  const p = priceFor('claude-haiku-5-5')
  assert.ok(p, 'claude-haiku-5-5 has a price entry')
  // input 0.10: pricing.json "claude-haiku-5-5".input (S1 up-to-100,000 row "$0.10 / MTok")
  near(p?.input, 0.1, 'haiku 5.5 base input $/MTok')
  // output 0.50: pricing.json "claude-haiku-5-5".output (S1 up-to-100,000 row "$0.50 / MTok")
  near(p?.output, 0.5, 'haiku 5.5 base output $/MTok')
  // cacheRead 0.01: pricing.json "claude-haiku-5-5".cacheRead (S1 up-to-100,000 row "$0.01 / MTok")
  near(p?.cacheRead, 0.01, 'haiku 5.5 base cache read $/MTok')
})

// Pins R-C3-05 (_orch/plan/traceability.yaml).
// Spec L50-51: "Haiku 5.5's price steps up above 100k-token prompts."
// Decision Q-28 (_orch/plan/decisions.md): "Price each request when it is metered (`turn.step` usage).
// Prompt length is `contextOf` (ledger.mjs:93-96). Strictly over 100,000 uses the step row. ...
// Cache writes stay at the 5m price (1.25x input), as today."
// Source record: P3 pricing.md, S1 row "| Claude Haiku 5.5 (for prompts over 100,000 tokens) | $0.50 / MTok | $0.625 / MTok | $1 / MTok | $0.05 / MTok | $2.50 / MTok |"
// and S1 "A request's prompt length counts all of its input tokens, including cache reads and cache writes."
test('t3: a Haiku 5.5 request with a prompt over 100k tokens is priced at the stepped prices', () => {
  // Prompt = 120,000 input tokens (> step.above_tokens 100000, pricing.json), 1,000 output.
  // Stepped (pricing.json step): 120000 x $0.50 + 1000 x $2.50 = $0.06 + $0.0025 = $0.0625 per request.
  // (At base prices it would be 120000 x $0.10 + 1000 x $0.50 = $0.0125.)
  const plain = costOfOne({ model: 'claude-haiku-5-5', input_tokens: 120_000, output_tokens: 1_000 })
  assert.deepEqual(plain.unpriced, [], 'claude-haiku-5-5 is priced')
  near(plain.usd, 0.0625, 'haiku 5.5, 120k-token prompt') // step.input 0.50, step.output 2.50 (pricing.json)

  // Prompt = 10,000 input + 5,000 cache write + 95,000 cache read = 110,000 (> 100000): the cache
  // tokens count toward the prompt (S1, quoted above), so the whole request is stepped.
  // Stepped: 10000 x $0.50 + 5000 x $0.625 + 95000 x $0.05 + 2000 x $2.50
  //        = $0.005 + $0.003125 + $0.00475 + $0.005 = $0.017875.
  // (step.cacheWrite 0.625 = 1.25 x step.input 0.50, so Q-28's "1.25x input" and pricing.json agree.)
  const cached = costOfOne({
    model: 'claude-haiku-5-5',
    input_tokens: 10_000,
    cache_creation_input_tokens: 5_000,
    cache_read_input_tokens: 95_000,
    output_tokens: 2_000,
  })
  near(cached.usd, 0.017875, 'haiku 5.5, 110k-token prompt mostly cache reads') // step row, pricing.json

  // Just over the line: 100,001 prompt tokens is "over 100,000" (S1; Q-28 "Strictly over 100,000").
  // Stepped: 100001 x $0.50 = $0.0500005.
  const edge = costOfOne({ model: 'claude-haiku-5-5', input_tokens: 100_001, output_tokens: 0 })
  near(edge.usd, 0.0500005, 'haiku 5.5, 100,001-token prompt') // step.input 0.50, pricing.json
})

// Pins R-C3-05 (_orch/plan/traceability.yaml).
// Spec L50-51: "Haiku 5.5's price steps up above 100k-token prompts."
// Decision Q-28 (_orch/plan/decisions.md): "Price each request when it is metered ... Strictly over
// 100,000 uses the step row."
// Source record: P3 pricing.md, S1 row "(for prompts up to 100,000 tokens) ...", and S1 "Each request is
// priced on its own: a request over the threshold pays the higher prices even when part of its prompt
// is a cache hit, and earlier requests keep the prices they were billed at."
test('t3: a Haiku 5.5 request with a prompt at or below 100k tokens is priced at the base prices', () => {
  // Exactly at the threshold: 100,000 is "up to 100,000" (S1), not "strictly over" (Q-28).
  // Base (pricing.json): 100000 x $0.10 + 1000 x $0.50 = $0.01 + $0.0005 = $0.0105.
  const at = costOfOne({ model: 'claude-haiku-5-5', input_tokens: 100_000, output_tokens: 1_000 })
  assert.deepEqual(at.unpriced, [], 'claude-haiku-5-5 is priced')
  near(at.usd, 0.0105, 'haiku 5.5, 100,000-token prompt') // input 0.10, output 0.50 (pricing.json)

  // Below, with cache: 4,000 input + 2,000 cache write + 50,000 cache read = 56,000 prompt tokens.
  // Base: 4000 x $0.10 + 2000 x $0.125 + 50000 x $0.01 + 3000 x $0.50
  //     = $0.0004 + $0.00025 + $0.0005 + $0.0015 = $0.00265.
  // (cacheWrite 0.125 = 1.25 x input 0.10: Q-28 "1.25x input" and pricing.json agree.)
  const below = costOfOne({
    model: 'claude-haiku-5-5',
    input_tokens: 4_000,
    cache_creation_input_tokens: 2_000,
    cache_read_input_tokens: 50_000,
    output_tokens: 3_000,
  })
  near(below.usd, 0.00265, 'haiku 5.5, 56k-token prompt') // base row, pricing.json

  // Each request is priced on its own (S1, Q-28 "Price each request when it is metered"): two
  // 60,000-token requests on one account total 120,000 input tokens but neither is over 100,000,
  // so both stay at base prices. Base: 2 x 60000 x $0.10 = $0.012.
  const acc = {}
  addUsage(acc, { model: 'claude-haiku-5-5', input_tokens: 60_000, output_tokens: 0 })
  addUsage(acc, { model: 'claude-haiku-5-5', input_tokens: 60_000, output_tokens: 0 })
  near(costOf(acc).usd, 0.012, 'two 60k-token haiku 5.5 requests') // input 0.10, pricing.json
})

// Pins R-C3-03 (_orch/plan/traceability.yaml).
// Spec L49: "context windows for `claude-sonnet-5-5` and `claude-haiku-5-5`."
// Source record: P3 pricing.md, S2 "| [Context window](...) | 1M tokens | 1M tokens | 1M tokens | 1M tokens |"
// (Sonnet 5.5 and Haiku 5.5 columns).
test('t3: windowFor gives the live context window of Sonnet 5.5 and Haiku 5.5', () => {
  // The fallback argument is a number neither model has, so only a known window can pass.
  // 1000000: pricing.json "claude-sonnet-5-5".window (S2 "1M tokens")
  assert.equal(windowFor('claude-sonnet-5-5', 123_456), 1_000_000)
  // 1000000: pricing.json "claude-haiku-5-5".window (S2 "1M tokens")
  assert.equal(windowFor('claude-haiku-5-5', 123_456), 1_000_000)
  // With the default fallback too. 1000000: pricing.json window, both models.
  assert.equal(windowFor('claude-sonnet-5-5'), 1_000_000)
  assert.equal(windowFor('claude-haiku-5-5'), 1_000_000)
})
