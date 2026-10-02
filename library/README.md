# library — the persona layer, off the default path

v6 moved baton's expert personas here. Nothing on the default path reads this tree,
`bundle.sh` never bundles it, and `tools/rules.py` does not check it.

## Why

`docs/experiments/personas-earn-their-place.md` seeded 16 defects and reviewed the
target four ways. One plain fresh reviewer found 15.67 of them. Four lens cards found
16, and so did four plain reviewers at the same spend: four times the cost of one
reviewer for a third of a defect. The lens cards bought nothing a plain reviewer at
equal spend did not, so they left the default path (`docs/designs/v6-shrink.md`,
decision 3).

The experiment did not test user archetypes. They stay on the default path
(`personas/users/`, `personas/CONTRACT.md`, `prompt/roles/journey-probe.md`), because
they produce evidence from the running product.

## What is here

The v5 persona layer, at the paths it had in v5 under this directory:

```
personas/CONTRACT.md       the v5 persona contract and its index
personas/lenses/           37 expert lens cards
personas/luminaries/       40 opt-in named experts
personas/manifest.aix.yaml the AIX bundle manifest
rules/prule-*.md           the v5 persona rules: schema, expert duties, casting, independence
prompt/roles/casting.md    resolves PERSONAS into _orch/cast/
prompt/roles/panel.md      the six-stage panel, with the adjudicator's clash mediation
prompt/modes/CRAFT.md      a panel against the experienced surface
prompt/modes/POSITION.md   a panel against the commercial surface
tools/                     aix-validate.py, check4-hint-tags.sh, and the instrument records for both
```

## Opting in

Set `PERSONAS: library`, optionally combined with v5's sources (`builtin+luminaries`,
`repo:<host/owner/name>`, `path:<dir>`). The prime then:

1. resolves every path a library file names against `{BATON}/library/` first, and the
   default tree second;
2. spawns casting (`library/prompt/roles/casting.md`) beside the planner;
3. routes a node carrying `adversarial: panel` or expert `personas:` to
   `library/prompt/roles/panel.md` or the bound card instead of the plain verifier;
4. reads `MODE: CRAFT` and `MODE: POSITION` from `library/prompt/modes/`.

Everything else is v6: the run contract, the router, the dispatcher duties and the
record. Where a library file names a v5 mechanism v6 removed (a phase runner, a digest,
a decomposer), the v6 replacement in `prompt/CONTRACT.md` governs.
