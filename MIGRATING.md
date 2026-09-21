# Migrating between baton versions

One file per version you might be coming from. Each says what breaks, what does
not, and what to do with a run in flight. The current release is **v4.0**.

| coming from | read | the short version |
|---|---|---|
| **v3.0 – v3.3** | [`migrations/from-v3.md`](migrations/from-v3.md) | change one URL; one command per run in flight (`lists.py split`) |
| **v2.0** | [`migrations/from-v2.md`](migrations/from-v2.md) | five breaking changes at v3.0, then the one above |
| **v1** | [`migrations/from-v1.md`](migrations/from-v1.md) | a different invocation, not a conversion; finish v1 runs under v1 |

`TEAM: github` is opt-in in every case: with the line absent, a v4.0 run is a
v3.3 run plus the one change in `from-v3.md` §2.

## Every hop, for the record

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
