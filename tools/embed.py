import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
router = (root / "prompt" / "baton.md").read_text()
esc = router.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
lines = len(router.rstrip("\n").split("\n"))
html = (root / "index.html").read_text()
html = re.sub(r'(<pre id="psrc">).*?(</pre>)', lambda m: m.group(1) + esc + m.group(2), html, flags=re.S)
html = re.sub(r'(<b>prompt/baton\.md</b> &middot; )(?:__ROUTERLINES__|\d+)( lines)', r'\g<1>%d\g<2>' % lines, html)
(root / "index.html").write_text(html)
print("embedded %d lines of prompt/baton.md into index.html" % lines)
