# MODE: POSITION

> POSITION seats an adversarial panel of commercial experts against the
> *commercial surface* of {TARGET} — positioning, pricing and packaging,
> naming, the story, launch readiness, and the discovery evidence underneath
> all of it — builds a claim ledger first so every seat argues from a quoted
> line, and returns a ranked recommendation matrix whose every row is cited,
> priced, owned, and given a verification path. It builds nothing and it ships
> nothing.

## Directive

Audit the commercial surface of {TARGET} — what a prospective buyer reads, is asked to pay,
and is asked to believe — and change nothing. POSITION **refuses to build anything**: no
headline is rewritten, no pricing table is edited, no landing page or launch asset is
produced, and every finding leaves as a matrix row for a later BUILD, IMPROVE or CRAFT run
rather than as a diff. It **refuses to ship anything**: it does not publish, announce,
price, or launch, and it does not approve a launch — a mode that could ship the thing it
had just blessed could never be trusted to fail its own launch-readiness seat. Inventory
the commercial surface first — landing page, pricing page, README, docs index, changelog,
launch assets, each with its location — then extract the **claim ledger**: every commercial
claim as a row carrying its exact location and its verbatim wording. Get the inventory and
the ledger operator-confirmed as one batch, because a panel argued against the wrong
surface list is wasted twice over, and because a claim nobody wrote down is a claim nobody
can check. Seat each commercial lens in its own context and let it find what it finds
against its own standard alone, with no visibility into any other seat's work; require a
claim-ledger row, or a path plus a ≤20-word verbatim quote, for every claim a seat makes,
and treat an uncitable claim as retracted. Commercial findings are the easiest in baton to
argue as taste, so every seat must state its finding as concrete harm to a named buyer
doing a named thing — "the pricing page names three tiers and gates the only feature the
landing page sells behind the highest" survives, "the copy feels weak" does not, and a seat
that cannot make the harm concrete has found nothing. Each seat declares at most one
blocking concern. Where seats oppose one another, pair them for exactly one exchange in
which each states the other's position charitably before rebutting; if every seat agrees,
treat the agreement as a defect in the panel rather than a property of the market, and
force a pairing anyway. Verify every citation against the claim ledger before synthesis: a
quote that does not appear verbatim at the location it names downgrades its finding to
UNVERIFIED, and an UNVERIFIED finding may not block. Then rank the survivors by harm
against effort and give each a P0–P3 priority under CONTRACT §9, an owning task, and a
verification path — repositioning is not free, and a matrix that does not price its own
advice is a wish list. Done when every commercial surface is inventoried, every claim in
the ledger has a location and a verbatim wording, every seat has returned findings or an
explicit nothing-found, every P0 and P1 carries a VERIFIED citation and a named
verification path, at least one clash exchange is on record, and `final/position-report.md`
holds a matrix whose every row is executable by a later run without further interpretation.

## Graph skeleton

```yaml
- id: T01
  kind: task
  phase: 1
  title: Inventory the commercial surface
  rung: 1
  surface: doc
  handoff: _orch/nodes/T01/handoff.md
  done: "commercial-map.md names every commercial surface — landing page, pricing page, README, docs index, changelog, launch assets — each with its location"
- id: T02
  kind: task
  phase: 1
  title: Extract the claim ledger
  rung: 1
  surface: doc
  needs: [T01]
  done: "claim-ledger.md holds one row per commercial claim, each with its exact location and its verbatim wording"
- id: G1
  kind: gate
  phase: 1
  title: Scope gate — operator confirms the inventory and the ledger as ONE batch
  rung: 1
  needs: [T02]
  done: "every row of commercial-map.md and claim-ledger.md is marked confirmed, cut, or amended in writing"
- id: C1
  kind: fanout                        # one S-<surface> child per RUNNING commercial page
  phase: 2
  rung: 1
  needs: [G1]
  done: "one S-<surface> node per confirmed commercial surface that is a running page; no children at all when the commercial surface is documents only"
- id: S-<surface>
  kind: task
  phase: 2
  title: "PROBE — capture this commercial page as a sceptical buyer encounters it"
  rung: 3
  surface: ui
  needs: [C1]
  personas: [low-trust-evaluator]
  done: "capture-<surface>.md — per state: screenshot path, rendered text, viewport, locale"
- id: B1
  kind: barrier                       # trivially satisfied when C1 has no children
  phase: 2
  rung: 1
  needs: [C1]
  done: "every running commercial page has a capture file or a recorded reason it could not be reached"
- id: F1
  kind: fanout                        # one A-<seat> child per cast expert seat
  phase: 3
  rung: 1
  needs: [B1]
  done: "one A-<seat> node per cast expert seat; no A-node's handoff names another A-node"
- id: A-<seat>
  kind: task
  phase: 3
  title: "AUDIT — judge the commercial surface from this lens alone"
  rung: 2
  needs: [F1]
  adversarial: panel
  personas: [<seat>]
  done: "findings.md — every finding cites a claim-ledger row, or a path plus a ≤20-word verbatim quote, and proposes a P0–P3"
- id: R-<seat>
  kind: task
  phase: 3
  title: Declare this seat's one blocking concern
  rung: 1
  needs: [A-<seat>]
  done: "red-flag.md holds one blocking concern with its named harm, or the single line NO BLOCKING FLAG"
- id: B2
  kind: barrier                       # needs [R-<seat>] for every cast seat
  phase: 4
  title: All seats in before opposition can be measured
  rung: 1
  needs: [R-<seat>]
  done: "every seated lens has one findings.md and one red-flag.md on disk"
- id: C2
  kind: task
  phase: 4
  title: Convergence audit — pair the opposed, force a pairing if nothing opposes
  rung: 3
  needs: [B2]
  done: "pairings.yaml lists every unrun pairing keyed seat-pair+claim, or states the ledger holds them all"
- id: K1
  kind: fanout
  phase: 4
  title: Run each new pairing as one steelman exchange
  rung: 3
  needs: [C2]
  adversarial: panel
  done: "one clash-<key>.md per unrun pairing, each with both steelmen, both rebuttals, and the ruling"
- id: L1
  kind: loop
  phase: 4
  body: [C2, K1]
  invariant: "every pairing in the ledger has exactly one recorded exchange and one ruling"
  ledger: _orch/loops/L1/seen.yaml     # key: seat-pair + claim shape, never a round number
  stop:
    dry_rounds: 2
    max_iterations: 3
    max_rungs: 12
  on_stop: B3
- id: B3
  kind: barrier                       # freeze the record before anything is scored
  phase: 5
  rung: 1
  needs: [L1]
  done: "every findings.md, red-flag.md, and clash file is present and non-empty"
- id: V1
  kind: task
  phase: 5
  title: Verify every citation against the claim ledger
  rung: 0
  needs: [B3]
  done: "citations.csv marks every claim VERIFIED or UNVERIFIED — the cited text appears verbatim at the location the ledger names"
- id: A-severity-inflation
  kind: task
  phase: 5
  title: "VERIFY — re-score every claimed P0 and P1"
  rung: 2
  needs: [V1]
  refutes: B3
  personas: [severity-inflation]
  done: "every claimed P0/P1 names an irreversible or user-visible harm per CONTRACT §9, or is downgraded in place"
- id: S1
  kind: task
  phase: 6
  title: Synthesize the commercial recommendation matrix
  rung: 3
  needs: [V1, A-severity-inflation]
  personas: []            # SYNTH is neutral by construction
  done: "final/position-report.md matrix — every row has priority, owner task, verification path, citation status"
```

`L1` is the only loop in this mode and it declares its exit condition in full, as
CONTRACT §5.3 requires: an `invariant`, a `ledger` keyed on seat-pair plus claim shape
rather than on a round number, a `stop` block carrying `dry_rounds: 2` — the contract
floor, not a preference — with `max_iterations` and `max_rungs` as the outer bounds, and an
`on_stop` target. Two dry rounds is the normal exit. Hitting `max_iterations` or
`max_rungs` exits **DONE-WITH-CAVEATS**, never `FAILED`, and the caveat names which pairing
was still moving when the budget ran out.

The planner may vary seat count inside personas/CONTRACT.md §4.1's three-to-seven, split
`T01` when {TARGET} sells more than one product, merge `T01` and `T02` only if the
commercial surface is a single page, and add pairings `C2` discovers. It may **not** seat a
panel before `G1` closes, give any `A-` node an `informs` edge from another `A-` node, fold
the red-flag stage into the audit stage, run a pairing twice, place the citation pass after
synthesis, or add a node that writes to {TARGET}. `C1` is the one branch that may come out
empty: when the commercial surface is documents only there are no running pages to capture,
`C1` produces no children, `B1` is satisfied trivially, and POSITION runs without a probe.

POSITION's `S-<surface>` nodes carry `surface: ui` and therefore attract a journey probe
like every other `surface: ui` node — CONTRACT §4.1's rule is universal and POSITION writes
no exception into it — but that probe is **scoped to the commercial pages the node
captured**, not to full journeys, exactly as `P20`'s design settles for CRAFT: the refusal
governs what the **panel** does, not what verification is attached to a node. DOGFOOD drives
journeys to find what breaks; POSITION captures a pricing page so a commercial seat can
judge what it claims.

## Entry rungs

| node class | entry rung | why |
|---|---|---|
| citation verification (`V1`) | 0 | Exact string and location match of a quote against the claim ledger. Verifiable by command; there is no judgment in it. |
| inventory, claim ledger, scope gate, fanouts, barriers, red-flag declaration | 1 | Bounded restatement against a clear spec — the default. |
| audit seats (`A-*`), `A-severity-inflation` | 2 | Pinned by personas/CONTRACT.md §2.1, not chosen here: AUDIT and expert VERIFY are rung 2. |
| capture (`S-*`) | 3 | Pinned by personas/CONTRACT.md §2.2, not chosen here: PROBE is rung 3 for `kind: user`. |
| convergence audit (`C2`) | 3 | Judgment — whether unanimity is evidence or a seating failure, and which positions are genuinely most opposed. |
| clash (`K1` children) | 3 | Pinned by personas/CONTRACT.md §2.1: CLASH is rung 3. |
| synthesis (`S1`) | 3 | Cross-panel resolution. Rung 5 needs operator approval (CONTRACT §1.4); POSITION never asks. Nothing here enters above 3. |

The loop `L1` spans no rung of its own — its body nodes carry theirs — and its exit
condition is the `stop` block declared in the skeleton above; a loop reaching `on_stop: B3`
without the invariant met exits DONE-WITH-CAVEATS with the unmet pairing named.

## Seats

| seat slug | kind | phases | what it examines |
|---|---|---|---|
| `positioning-clarity` | expert | AUDIT, CLASH | Whether it is the positioning a stranger can restate, from the commercial surface alone: what this is, who it is for, and what they would otherwise use. The competitive alternative is the part usually missing. |
| `price-coherence` | expert | AUDIT, CLASH | Whether the price, the packaging tiers, and the value actually delivered are one story. What each tier gates, whether the gate is the thing buyers value, and what the free tier teaches. |
| `naming-fitness` | expert | AUDIT, CLASH | Whether the names in the product and the names in the market are the same names, and whether each survives being said aloud once, typed once, and searched for once. |
| `claim-evidence` | expert | AUDIT, CLASH, VERIFY | Whether every commercial claim traces to something a buyer could check, or rests on an adjective. Benchmarks without methods, "enterprise-grade", and testimonials with no attributable source. |
| `launch-readiness` | expert | AUDIT, CLASH | Launch readiness: an unbroken path from landing page to first real use for someone persuaded by the pitch — the docs, the signup, the quickstart, the support channel, and the gap where one of them isn't. |
| `discovery-evidence` | expert | AUDIT, CLASH | Whether anything in the commercial surface rests on talking to real prospective buyers — the discovery evidence under it — or entirely on internal conviction. Asks for the evidence, not the confidence. |
| `leverage-vs-risk` | expert | AUDIT, CLASH | Which commercial findings are worth acting on: harm against effort, and what acting would itself endanger — repositioning is not free. |
| `blindspot` | expert | AUDIT | The failure classes this seating chart cannot catch, and the assumption every commercial seat shares — that the product should be sold at all, in this form, to these people. |
| `severity-inflation` | expert | VERIFY | Standing seat. Every claimed P0/P1 against CONTRACT §9 — a weak headline is not a blocker. |
| `low-trust-evaluator` | user | PROBE | Captures the commercial surface as a sceptical buyer encounters it — pricing page, signup wall, permissions ask, export and delete. PROBE only, and only when the commercial surface is a running page rather than a document. |

Casting prefers named experts tagged `positioning`/`strategy` for `positioning-clarity`,
`pricing`/`economics` and `roi`/`strategy` for `price-coherence`,
`copywriting`/`brand-identity` for `naming-fitness`, `persuasion`/`trust` and
`content-marketing`/`copywriting` for `claim-evidence`, `developer-relations`/`adoption`
for `launch-readiness`, `product`/`user-research` and `evidence`/`ux-research` for
`discovery-evidence`, `economics`/`prioritization` for `leverage-vs-risk`, and
`risk`/`triage` for `severity-inflation`. `blindspot` is listed with no upgrade hint
deliberately: that seat audits the panel rather than the artifact — it receives the
roster's lens list and never its findings — so filling it with a named domain expert
seats one more specialist in the seat that exists to name what a panel of specialists
structurally cannot see.
Add the `low-trust-evaluator` user seat whenever the commercial surface is a running page
rather than a document; personas/CONTRACT.md §4.1's ceiling of seven binds the panel, not
this table, and seat duties still govern the upgrade (personas/CONTRACT.md §4.2).

## Gates

- **Plan gate.** Passes when every cast seat has exactly one audit node, no audit node can
  read another's output, every capture node carries `surface: ui`, `L1` declares all four
  fields CONTRACT §5.3 requires, and no node writes to {TARGET}.
- **Scope gate** (`G1`, a blocked batch). The surface inventory and the claim ledger go to
  the operator together as one batch. Passes when every row is confirmed, cut, or amended in
  writing. Confirming them separately is the failure this gate exists to prevent: a ledger
  confirmed against an unconfirmed inventory quotes pages nobody agreed were in scope.
- **Phase gate.** Phase 1 passes when every claim in the ledger carries a location and a
  verbatim wording; phase 2 when every running commercial page has a capture or a named
  reason it could not be reached — or when `C1` produced no children at all; phase 3 when
  every seat returned findings or a nothing-found; phase 4 when the loop is dry or stopped
  and every ledger pairing has one ruling; phase 5 when `citations.csv` covers every quoted
  claim.
- **Blocked batch.** A surface that cannot be reached — an unpublished page, a gated
  pricing sheet, a launch asset that exists only in someone's drafts — goes `BLOCKED` and
  batches its question. One unreachable surface does not block the panel; the report records
  it as uncaptured, and a seat whose evidence depended on it says so instead of guessing.
- **Final gate.** Synthesis at rung 3. Passes when no P0 or P1 row rests on an UNVERIFIED
  citation, every row names an owner and a verification path, and {TARGET} is unmodified —
  including every commercial asset in the inventory.

## Done

`final/position-report.md` holds one matrix row per surviving finding; every row carries a
P0–P3 priority, an owner task id, a verification path, and a citation-status column; no
UNVERIFIED row carries P0 or P1; every commercial surface in the inventory is captured or
carries a recorded reason it could not be reached; every claim-ledger row is either cited by
a finding or explicitly untouched; every seat in `_orch/cast/roster.yaml` appears as a source
or an explicit nothing-found; at least one `clash-*.md` exists with both steelmen present;
and `git status` on {TARGET} is clean.

## Failure modes of this mode

- **The mode that starts marketing.** A headline is weak, the fix is obvious, and someone
  writes the better headline — so the matrix now describes a page that no longer exists and
  POSITION has quietly shipped copy nobody reviewed. Every node here reads, inventories and
  captures only; the final gate checks {TARGET} is unmodified, and a rewrite found mid-audit
  becomes a matrix row with an owner and a verification path, never a diff.
- **Taste wearing a severity label.** A commercial seat dislikes a tagline and files it P1
  because it argued the point well. Every finding must name concrete harm to a named buyer
  doing a named thing, `severity-inflation` holds a `refutes` edge and re-scores against
  CONTRACT §9, and the final gate refuses a P0 or P1 that no ledger row supports. This is
  the failure that would make POSITION indistinguishable from an opinion, so it is answered
  twice.
- **The claim nobody wrote down.** A seat argues against a promise it remembers reading
  rather than one the ledger holds, and the rebuttal cannot be checked because the original
  wording is gone. `T02` extracts every claim verbatim with its location before any seat is
  cast, and `V1` at rung 0 marks a citation UNVERIFIED the moment the quoted text is not
  found where the ledger says it is.
- **Confidence audited as evidence.** The panel reads a confident narrative, finds it
  coherent, and mistakes internal conviction for market knowledge. `discovery-evidence`
  exists to ask who was actually talked to and what they actually said; a story with no
  discovery behind it is a finding, and "the founder is sure" is the answer that proves it.
- **Unanimity read as strength.** Seven commercial experts agree the positioning is fine,
  and a panel cast from one go-to-market tradition mistakes its shared training for
  evidence. `C2` treats a zero-opposition round as a finding about the panel and forces a
  pairing anyway, and `blindspot` gets the seat list and never the findings — its question
  is whether this should be sold at all, which no other seat is allowed to ask.
