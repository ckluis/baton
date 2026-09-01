#!/bin/sh
# check4-hint-tags.sh — acceptance check 4, repaired.
#
#   "every tag named in a mode hint resolves to a persona that carries it"
#
# Usage:  sh tools/check4-hint-tags.sh [MODES_DIR]      (default: prompt/modes)
#
# Prints the unresolved hint tags, one per line, sorted — the same output shape
# the in-line check-4 pipeline printed before this repair. Empty output = pass.
#
# WHY THIS FILE EXISTS
# --------------------
# The original extractor was
#
#   grep -rhoE '`[a-z-]+`/`[a-z-]+`' prompt/modes/*.md | tr '/' '\n' | tr -d '`' | sort -u
#
# and it was unsound in two ways:
#
#   1. `grep -o` matches NON-OVERLAPPING, so in a chain `a`/`b`/`c` it consumes
#      `a`/`b` and never sees `c`. Every odd-length chain lost its tail.
#   2. It is line-based, so a chain whose `/` separator straddles a newline was
#      invisible on both sides.
#
# `_orch/verify/P20-verdict.json` recorded (1) in phase 3 — "the regex consumes
# the first pair and leaves the rest invisible" — filed as residual, never applied.
#
# HOW THE REPAIR WORKS
# --------------------
# Joining: a line is joined to the next ONLY where the join point is genuinely a
# chain separator — the line ends with a closing backtick immediately followed by
# `/`, or the next line begins with `/` immediately followed by an opening backtick.
# Joining unconditionally would invent chains out of ordinary adjacent backticked
# prose (CRAFT.md:222-223 is exactly that shape: a line ending `` `quality`/`product` ``
# followed by a line beginning "and `trust`/..."), so it is not done. A blank line
# NEVER joins and always resets the pending-separator state, even when the buffer
# being carried ends in a dangling `` `/ `` — otherwise that dangling separator
# would survive the paragraph break and wrongly absorb the next paragraph's first
# backticked word as if it were a chain continuation (P115, closing a latent class
# P111's verifier found: `_orch/verify/P111-verdict.json`,
# attacks_that_landed_latently[0]).
#
# Extraction: instead of matching whole pairs, two passes are unioned —
#   `[a-z-]+`/`   every chain element that is FOLLOWED by a separator AND has a
#                 backtick on the separator's far side too
#   `/`[a-z-]+`   every chain element that is PRECEDED by a separator AND has a
#                 backtick on the separator's far side too
# A backtick on only one side of the `/` (e.g. a file path like `tools/`zzz``) is
# NOT a chain link and must not match either pass (P115, closing the other latent
# class the same verdict found: attacks_that_landed_latently[1]). Requiring the far
# side literally, unconditionally, would make each pass consume the far-side
# backtick as part of its match — which is also the NEXT token's own opening (or
# closing) backtick — reintroducing the original non-overlap defect this repair
# exists to fix, for chains of three or more. So each pass runs over its own
# throwaway-duplicated copy of the joined text (`sed` doubles the backtick that
# sits on the far side of every `/`), so the match can consume the duplicate as
# proof-of-backtick while leaving the real one untouched for the next token's own
# match. `tr -d` then strips every backtick and slash regardless of count, so the
# duplication never leaks into the extracted tag text. Each pass still tiles
# cleanly under this scheme: the first pass yields every element of a chain but the
# last; the second yields every element but the first; their union is every element
# of every chain, at any chain length. A lone backticked word with no `/` on either
# side, or a `/` with a backtick on only one side, matches neither pass and is
# correctly ignored, which is what kept hint tags separable from seat slugs, file
# paths and ordinary prose in the first place.
#
# The persona side is unchanged from the pre-repair check: same three globs, same
# sed/tr handling, same `comm -23`.
#
# POSIX shell only — no interpreter shell-outs. Scratch files via mktemp, never fixed
# /tmp paths (the original wrote /tmp/hinted.txt and /tmp/carried.txt).

set -u

MODES="${1:-prompt/modes}"

hinted=$(mktemp) || exit 1
carried=$(mktemp) || { rm -f "$hinted"; exit 1; }
joined=$(mktemp) || { rm -f "$hinted" "$carried"; exit 1; }
trap 'rm -f "$hinted" "$carried" "$joined"' EXIT HUP INT TERM

# --- modes side -------------------------------------------------------------
# Per file (so a join never crosses a file boundary): fold chain-continuation
# lines together, then extract every chain element.
: > "$joined"
for f in "$MODES"/*.md; do
  [ -f "$f" ] || continue
  awk '
    function flush() { if (have) { print buf; have = 0; buf = "" } }
    {
      line = $0
      if (have && line != "" && (buf ~ /`\/[ \t]*$/ || line ~ /^[ \t]*\/`/)) {
        sub(/[ \t]+$/, "", buf)
        sub(/^[ \t]+/, "", line)
        buf = buf line
      } else {
        flush()
        buf = line
        have = 1
      }
    }
    END { flush() }
  ' "$f" >> "$joined"
done

# Each pass needs a backtick on the FAR side of the separator too (see header),
# via a throwaway-duplicated private copy of $joined so the far-side check never
# costs the next token its own delimiter. See header comment for why.
{
  sed 's#/`#/``#g' "$joined" | grep -ohE '`[a-z-]+`/`'
  sed 's#`/#``/#g' "$joined" | grep -ohE '`/`[a-z-]+`'
} | tr -d '`/' | sort -u > "$hinted"

# --- persona side (unchanged from the pre-repair check) ---------------------
grep -h '^tags:' personas/luminaries/*.md personas/lenses/*.md personas/users/*.md \
  | sed 's/tags: *\[//;s/\]//' | tr ',' '\n' | tr -d ' ' | sort -u > "$carried"

comm -23 "$hinted" "$carried"
