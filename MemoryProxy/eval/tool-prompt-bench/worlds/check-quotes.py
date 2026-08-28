"""Find nested quotes inside a double-quoted TS string literal.

esbuild ends the string token at the first inner quote, then reports a confusing
'Expected "]"' far from the real cause. Neither parity counting nor a naive scan
catches it: an inner PAIR keeps the count even and looks like two valid literals.

The rule that does work, for the data lines these world files are made of:
a string-array element or a `key: "value"` line contains exactly ONE literal.
Two literals with prose between them means the inner pair is nested.

Legitimate exceptions (imports, `.join()`, `key: "a" + "b"`, mapped pairs) are
recognized by the separators between literals: `,` `:` `[` `]` `(` `)` `+` `=>`.
"""
import re
import sys
from pathlib import Path

LITERAL = re.compile(r'"(?:[^"\\]|\\.)*"')
# Prose between two literals is the signature of a nested pair. Code between them
# (`, description: `, ` ? `, ` : `, ` === `) never contains CJK or a full-width comma.
PROSE = re.compile(r"[　-〿一-鿿＀-￯]")


def nested_quote(line: str) -> str | None:
    stripped = line.strip()
    if stripped.startswith("//") or stripped.startswith("*") or stripped.startswith("import"):
        return None
    spans = [match.span() for match in LITERAL.finditer(line)]
    if len(spans) < 2:
        return None
    for (_, end), (start, _) in zip(spans, spans[1:]):
        if PROSE.search(line[end:start]):
            return f"...{line[max(0, end - 30):start + 30].strip()}..."
    return None


problems = 0
paths = [Path(path) for path in sys.argv[1:]]
if not paths:
    paths = sorted(Path(__file__).resolve().parent.glob("*.ts"))

for path in paths:
    with open(path, encoding="utf-8") as handle:
        lines = handle.read().split("\n")
    # Inside a template literal (the transcript bodies) quotes are free text.
    in_template = False
    for number, line in enumerate(lines, start=1):
        backticks = line.count("`")
        was_in_template = in_template
        if backticks % 2 == 1:
            in_template = not in_template
        if was_in_template or in_template:
            continue
        hit = nested_quote(line)
        if hit:
            print(f"{path}:{number}: nested quote inside a string literal")
            print(f"    {hit}")
            problems += 1

print(f"{problems} problem(s)")
sys.exit(1 if problems else 0)
