#!/usr/bin/env python3
"""Embed the invocation card and the router into index.html.

The page shows two things: the small invocation you actually paste (extracted
from the first fenced block of prompt/invoke.md) and, behind a disclosure, the
router that invocation points at. Run this after editing either file or the
page ships a stale prompt.
"""
import re, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
esc = lambda s: s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
nlines = lambda s: len(s.rstrip("\n").split("\n"))

invoke_md = (root / "prompt" / "invoke.md").read_text()
blocks = re.findall(r"^```\n(.*?)^```", invoke_md, re.S | re.M)
if not blocks:
    raise SystemExit("no fenced block found in prompt/invoke.md")
card = blocks[0].rstrip("\n")           # the minimal invocation
team = blocks[1].rstrip("\n") if len(blocks) > 1 else None   # the team card, one line more
router = (root / "prompt" / "baton.md").read_text().rstrip("\n")

html = (root / "index.html").read_text()
pairs = [
    (r'(<pre id="psrc">).*?(</pre>)', esc(card)),
    (r'(<pre id="rsrc">).*?(</pre>)', esc(router)),
]
if team is not None:
    pairs.append((r'(<pre id="tsrc">).*?(</pre>)', esc(team)))
for pat, val in pairs:
    html = re.sub(pat, lambda m, v=val: m.group(1) + v + m.group(2), html, flags=re.S)

html = re.sub(r'(<b>the whole paste</b> &middot; )(?:__INVOKELINES__|\d+)( lines)',
              r"\g<1>%d\g<2>" % nlines(card), html)
if team is not None:
    html = re.sub(r'(<b>for a team</b> &middot; )(?:__TEAMLINES__|\d+)( lines)',
                  r"\g<1>%d\g<2>" % nlines(team), html)
html = re.sub(r'(<code>prompt/baton\.md</code>, )(?:__ROUTERLINES__|\d+)( lines)',
              r"\g<1>%d\g<2>" % nlines(router), html)

(root / "index.html").write_text(html)
print(f"embedded: invocation {nlines(card)} lines"
      + (f", team card {nlines(team)} lines" if team is not None else "")
      + f", router {nlines(router)} lines")
