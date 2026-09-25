# Migrating between baton versions

One file per version you might be coming from. Each says what breaks, what does
not, and what to do with a run in flight. The current release is **v5.0**.

| coming from | read | the short version |
|---|---|---|
| **v4.0** | [`migrations/from-v4.md`](migrations/from-v4.md) | change one URL; a checkout needs one command (`tiers.py remap`); a run in flight needs nothing |
| **v3.0 – v3.3** | [`migrations/from-v3.md`](migrations/from-v3.md) | the v4.0 hop (`lists.py split`, once per run in flight), then the v5.0 hop |
| **v2.0** | [`migrations/from-v2.md`](migrations/from-v2.md) | five breaking changes at v3.0, then the two above |
| **v1** | [`migrations/from-v1.md`](migrations/from-v1.md) | a different invocation, not a conversion; finish v1 runs under v1 |

`TEAM: github` is opt-in in every case. Every schema — envelopes, verdicts, the
ledger, graphs, persona cards — has kept its fields and names through every hop
since v2.0; what changed at v5.0 is the *meaning* of one field's values.

## Every hop, for the record

- **v4.0 → v5.0** — one breaking change: a `rung` value now means a tier (`0`
  cheap, `1` frontier, `n/a`); `CEILING` and `PRIME_TURNS` are gone. Five rules
  deleted, four rewritten, one bullet cut; dispatch may belong to the harness.
- **v3.3 → v4.0** — one breaking change (§6.3: the four append-only lists are
  directories of rows; `split` once per run in flight). Everything else is
  additive and behind `TEAM`.
- **v3.2 → v3.3** — additive. The prime reads the rules it cites and fetches the
  rest on demand; `tools/index.py --sqlite`.
- **v3.1 → v3.2** — additive. §6.2, §8.2, §9.3; one more verifier shape; two more
  linter rules; `tools/index.py --state-root`.
- **v3.0 → v3.1** — one thing breaks for one kind of user: the contracts no longer
  contain the rules; read `rules/*.md` or the bundle.
- **v2.0 → v3.0** — five breaking changes: `bundle.sh` fails on a missing seat,
  eleven lenses gained phases, the author-and-verify guard, computed
  per-criterion verdicts, `DOGFOOD` dropped a phase from `returning-power`.
- **v1 → v2.0** — the router replaced the single prompt; six rungs replaced four
  tiers; phases replaced task-by-task dispatch. No state conversion exists.
