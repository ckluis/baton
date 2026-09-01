# MODE: CRAFT

> CRAFT seats an adversarial panel of craft experts against the *experienced
> surface* of {TARGET} — type, colour, motion, microcopy, information
> architecture, accessibility, localisation — captures that surface first so
> every seat argues from a file, and returns a ranked recommendation matrix
> whose every row is cited, priced, owned, and given a verification path. It
> drives no journeys and it fixes nothing.

## Directive

Audit the experienced surface of {TARGET} — what a person actually sees, reads, and can
operate — and change nothing. CRAFT **refuses to drive journeys**: end-to-end task flows,
patience budgets, and honest abandonment are DOGFOOD's subject, and CRAFT does not duplicate
them. It **refuses to fix anything**: every finding leaves as a matrix row for a later
IMPROVE or BUILD run, never as a diff. Classify the surface first — every screen, route, and
state the audit will cover, each with how to reach it — and get that list operator-approved
as one batch, because capture is the expensive stage and an unbounded surface list is
unrunnable. Then capture: each approved surface is rendered and recorded — screenshot path,
rendered text, viewport, locale, one record per state — so that every expert seat argues from
a file rather than from a memory of a mock. Seat each craft lens in its own context and let it
find what it finds against its own standard alone, with no visibility into any other seat's
work; require a screenshot path plus a ≤20-word quote of rendered text for every claim, and
treat an uncitable claim as retracted. Craft findings are the easiest in baton to argue as
taste, so every seat must state its finding as concrete harm to a named person doing a named
thing — "the 11px secondary label fails contrast against the default background" survives,
"the typeface feels dated" does not, and a seat that cannot make the harm concrete has found
nothing. Each seat declares at most one blocking concern. Where seats oppose one another,
pair them for exactly one exchange in which each states the other's position charitably
before rebutting; if every seat agrees, treat the agreement as a defect in the panel rather
than a property of the surface, and force a pairing anyway. Verify every citation against its
capture file before synthesis: a quote that is not in the capture downgrades its finding to
UNVERIFIED, and an UNVERIFIED finding may not block. Then rank the survivors by harm against
effort and give each a P0–P3 priority under CONTRACT §9, an owning task, and a verification
path. Done when every approved surface has a capture or a recorded reason it could not be
reached, every seat has returned findings or an explicit nothing-found, every P0 and P1
carries a VERIFIED citation and a named verification path, at least one clash exchange is on
record, and `final/craft-report.md` holds a matrix whose every row is executable by a later
IMPROVE or BUILD run without further interpretation.

## Graph skeleton

```yaml
- id: T01
  kind: task
  phase: 1
  title: Classify the experienced surface and inventory its states
  rung: 1
  surface: doc
  handoff: _orch/nodes/T01/handoff.md
  done: "surface-map.md names every screen, route, and state the audit will cover, each with how to reach it"
- id: G1
  kind: gate
  phase: 1
  title: Scope gate — operator approves the surface list as ONE batch
  rung: 1
  needs: [T01]
  done: "every row of surface-map.md is marked approved, cut, or amended in writing"
- id: C1
  kind: fanout                        # one S-<surface> child per approved surface
  phase: 2
  rung: 1
  needs: [G1]
  done: "one S-<surface> node per approved surface, each naming the states it must capture"
- id: S-<surface>
  kind: task
  phase: 2
  title: "PROBE — capture this surface as the assigned person encounters it"
  rung: 3
  surface: ui
  needs: [C1]
  personas: [first-run]               # or assistive-tech, or mobile-commuter
  done: "capture-<surface>.md — per state: screenshot path, rendered text, viewport, locale"
- id: B1
  kind: barrier                       # coherence cannot be judged one surface at a time
  phase: 2
  rung: 1
  needs: [C1]
  done: "every approved surface has a capture file or a recorded reason it could not be reached"
- id: F1
  kind: fanout                        # one A-<seat> child per cast expert seat
  phase: 3
  rung: 1
  needs: [B1]
  done: "one A-<seat> node per cast expert seat; no A-node's handoff names another A-node"
- id: A-<seat>
  kind: task
  phase: 3
  title: "AUDIT — judge the captured surface from this lens alone"
  rung: 2
  needs: [F1]
  adversarial: panel
  personas: [<seat>]
  done: "findings.md — every finding carries a screenshot path, a ≤20-word quote of rendered text, and a proposed P0–P3"
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
  title: Verify every citation against its capture file
  rung: 0
  needs: [B3]
  done: "citations.csv marks every claim VERIFIED or UNVERIFIED — the screenshot path exists and the quoted string appears in the capture"
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
  title: Synthesize the craft recommendation matrix
  rung: 3
  needs: [V1, A-severity-inflation]
  personas: []            # SYNTH is neutral by construction
  done: "final/craft-report.md matrix — every row has priority, owner task, verification path, citation status"
```

The planner may vary seat count inside personas/CONTRACT.md §4.1's three-to-seven, split
`T01` when {TARGET} spans more than one product, swap which user persona captures a surface,
and add pairings `C2` discovers. It may **not** run a capture before `G1` closes, give any
`A-` node an `informs` edge from another `A-` node, fold the red-flag stage into the audit
stage, run a pairing twice, place the citation pass after synthesis, or add a node that
writes to {TARGET}. `B1` is a real barrier rather than a pipeline stage because no expert
seat can judge coherence *across* surfaces from one surface.

A CRAFT node carrying `surface: ui` attracts a journey probe like every other
`surface: ui` node — `prompt/CONTRACT.md` §4.1's rule is universal and CRAFT writes no
exception into it. But the probe attached to a CRAFT node is **scoped to the surfaces
that node audited**, not to full journeys. CRAFT's refusal of driving journeys governs
what the **panel** does, not what verification is attached to it; that distinction is
the whole answer. A typography or motion expert cannot audit a surface it has never
seen, and the probe is how the seat gets its evidence: DOGFOOD drives journeys to find
what breaks, while CRAFT's probe captures a surface so an expert can judge it.

## Entry rungs

| node class | entry rung | why |
|---|---|---|
| citation verification (`V1`) | 0 | Exact string and path match of a quote against its capture file. Verifiable by command; there is no judgment in it. |
| classification, scope gate, fanouts, barriers, red-flag declaration | 1 | Bounded restatement against a clear spec — the default. |
| audit seats (`A-*`), `A-severity-inflation` | 2 | Pinned by personas/CONTRACT.md §2.1, not chosen here: AUDIT and expert VERIFY are rung 2. |
| capture (`S-*`) | 3 | Pinned by personas/CONTRACT.md §2.2, not chosen here: PROBE is rung 3 for `kind: user`. Reading a surface from pixels under the §3 perception contract is genuinely rung-3 work. |
| convergence audit (`C2`) | 3 | Judgment — whether unanimity is evidence or a seating failure, and which positions are genuinely most opposed. |
| clash (`K1` children) | 3 | Pinned by personas/CONTRACT.md §2.1: CLASH is rung 3. |
| synthesis (`S1`) | 3 | Cross-panel resolution. Rung 5 needs operator approval (CONTRACT §1.4); CRAFT never asks. Nothing here enters above 3. |

## Seats

| seat slug | kind | phases | what it examines |
|---|---|---|---|
| `type-system` | expert | AUDIT, CLASH | Whether the typography of real content in the captured surfaces is readable at real sizes with real content lengths, or only in the mock. Hierarchy, measure, contrast, and what happens to a heading with forty words in it. |
| `visual-coherence` | expert | AUDIT, CLASH | Whether colour, spacing, elevation and chart treatment come from one system, or from whoever built each screen. Includes data display: a chart that misrepresents its data is a visual-system failure, not a content one. |
| `motion-honesty` | expert | AUDIT, CLASH | Whether animation communicates a real state change or decorates a wait; whether durations match the work being done; whether reduced-motion is honoured. |
| `microcopy-truth` | expert | AUDIT, CLASH | Whether the microcopy of button, label, empty-state and error text tells the person what happened and what to do next, in their words rather than the system's. |
| `information-scent` | expert | AUDIT, CLASH | Whether a person can tell from the visible surface where a thing lives and what will happen if they click. Navigation, labelling, grouping, and the information architecture those imply. |
| `documentation-structure` | expert | AUDIT, CLASH | Whether the explanatory surface — help pages, guides, reference tables, onboarding walkthroughs — is split by what the reader arrived needing (learn, do, look up, understand), or whether one page silently serves two needs and serves neither well. |
| `access-barrier` | expert | AUDIT, CLASH, VERIFY | Which people the captured surface excludes outright and which it merely inconveniences — contrast, focus order, target size, semantics, and the accessibility mismatches no checklist covers. |
| `locale-truth` | expert | AUDIT, CLASH | Whether the surface survives localisation — another language, script direction, date format, name shape and currency — or only English at English lengths. |
| `surface-coherence` | expert | AUDIT, CLASH | Whether the captured surfaces read as one product made by one team, or as several teams' work sharing a domain name. The whole-product seat: nobody else is asked to look across surfaces. |
| `blindspot` | expert | AUDIT | The failure classes this seating chart cannot catch, and the assumptions every craft seat shares — a surface can be beautiful, legible, animated honestly and still be manipulative. |
| `severity-inflation` | expert | VERIFY | Standing seat. Every claimed P0/P1 against CONTRACT §9 — an unfashionable typeface is never P0. |
| `first-run` | user | PROBE | Captures the assigned surfaces as a newcomer encounters them. PROBE only — no PLAN, no CLASH. Supplies the evidence the expert seats audit; it does not join the panel. |
| `assistive-tech` | user | PROBE | Captures the same surfaces through assistive technology. The evidence `access-barrier` cannot audit without. PROBE only. |
| `mobile-commuter` | user | PROBE | Captures the same surfaces at a narrow viewport on a bad connection — where `type-system`, `visual-coherence` and `motion-honesty` most often fail. PROBE only. |

Casting prefers named experts tagged `typography`/`visual-design` for `type-system`,
`visual-design`/`brand-identity` and `data-visualization`/`consistency` for
`visual-coherence`, `motion-design`/`performance` for `motion-honesty`,
`ux-writing`/`quality` for `microcopy-truth`,
`information-architecture`/`interaction-design` for `information-scent`,
`documentation`/`architecture` for `documentation-structure`,
`accessibility`/`inclusive-design` and `assistive-tech`/`accessibility` for
`access-barrier`, `localization`/`correctness` for `locale-truth`, `quality`/`product`
and `trust`/`interaction-design` for `surface-coherence`, and `risk`/`triage` for
`severity-inflation`. `blindspot` is listed with no upgrade hint deliberately: that seat
audits the panel rather than the artifact — it receives the roster's lens list and never
its findings — so filling it with a named domain expert seats one more specialist in the
seat that exists to name what a panel of specialists structurally cannot see.
Add the `assistive-tech` and
`mobile-commuter` user seats when the surface carries a compliance or narrow-viewport
obligation; personas/CONTRACT.md §4.1's ceiling of seven binds the panel, not this table,
and seat duties still govern the upgrade (personas/CONTRACT.md §4.2).

## Gates

- **Plan gate.** Passes when every cast seat has exactly one audit node, no audit node can
  read another's output, every capture node carries `surface: ui`, `L1` declares all four
  fields CONTRACT §5.3 requires, and no node writes to {TARGET}.
- **Scope gate** (`G1`, a blocked batch). The surface list goes to the operator as one
  batch. Passes when every row is approved, cut, or amended in writing. This is the only
  gate in the mode that halts everything — capture is the expensive stage and nothing
  downstream is worth running against the wrong surface list.
- **Phase gate.** Phase 2 passes when every approved surface has a capture or a named
  reason it could not be reached; phase 3 when every seat returned findings or a
  nothing-found; phase 4 when the loop is dry or stopped and every ledger pairing has one
  ruling; phase 5 when `citations.csv` covers every quoted claim.
- **Blocked batch.** A surface that cannot be reached — no build, no credentials, no
  runnable app — goes `BLOCKED` and batches its question. One unreachable surface does not
  block the panel; the report records it as uncaptured, and a seat whose evidence depended
  on it says so instead of guessing.
- **Final gate.** Synthesis at rung 3. Passes when no P0 or P1 row rests on an UNVERIFIED
  citation, every row names an owner and a verification path, and {TARGET} is unmodified.

## Done

`final/craft-report.md` holds one matrix row per surviving finding; every row carries a
P0–P3 priority, an owner task id, a verification path, and a citation-status column; no
UNVERIFIED row carries P0 or P1; every approved surface has a capture file or a recorded
reason it could not be reached; every seat in `_orch/cast/roster.yaml` appears as a source
or an explicit nothing-found; at least one `clash-*.md` exists with both steelmen present;
and `git status` on {TARGET} is clean.

## Failure modes of this mode

- **Taste wearing a severity label.** A craft seat dislikes something and files it P1
  because it argued the point well. Every finding must name concrete harm to a named person
  doing a named thing, `severity-inflation` holds a `refutes` edge and re-scores against
  CONTRACT §9, and the final gate refuses a P0 or P1 that no capture supports. This is the
  failure that would make CRAFT indistinguishable from an opinion, so it is answered twice.
- **The surface nobody captured.** A seat audits a screen it never saw, from the design
  file, the source, or a reasonable guess about what the empty state probably looks like.
  Captures precede every audit, `V1` at rung 0 checks that each cited screenshot path
  exists and each quoted string is in the capture, and a finding whose evidence is missing
  is UNVERIFIED on sight rather than merely unlucky.
- **The probe that turns into a journey.** A capture node starts completing a signup to see
  the next screen and CRAFT quietly becomes a worse DOGFOOD. Capture nodes are scoped to the
  approved surface list and record states, not tasks; a state that can only be reached by
  driving a flow is recorded as unreachable and named in the report, which is a finding
  DOGFOOD should own rather than one CRAFT should improvise.
- **Unanimity read as strength.** Seven craft experts agree the surface is fine, and a panel
  cast from one design tradition mistakes its shared training for evidence. `C2` treats a
  zero-opposition round as a finding about the panel and forces a pairing anyway, and
  `blindspot` gets the seat list and never the findings.
- **Craft that starts fixing.** A one-line copy change or a spacing token is obvious and
  someone makes it, so the matrix now describes a surface that no longer exists. Every node
  here reads and captures only; the final gate checks the target is unmodified — a fix found
  mid-audit becomes a matrix row with an owner, never a diff.
