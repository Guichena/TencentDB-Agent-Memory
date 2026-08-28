"""Apply discriminating probe terms, verified by probe-discriminate.ts.

Denser conversations mean several sessions legitimately mention the same topic, so a
generic probe ties. Each term below was measured to put its intended asset first with
a positive margin. Run from the worlds/ directory.
"""

EDITS = [
    # W01 raw-wording: only sess-w01-cache-safety says 越过前缀 / 前缀边界
    (
        "w01-proxy-prompt.cases.ts",
        'query: "当时讨论 prompt cache 的时候，原话是怎么说注入区域位置的？我要引用原文。",',
        'query: "当时讨论注入块能不能越过前缀的时候，原话是怎么说的？我要引用原文。",',
    ),
    (
        "w01-proxy-prompt.cases.ts",
        'firstAction: conversationSearch(["prompt cache", "注入"]),',
        'firstAction: conversationSearch(["越过前缀", "前缀边界"]),',
    ),
    # W02 raw-wording: version attribute appears only in sess-w02-descriptor
    (
        "w02-jakarta-migration.cases.ts",
        'query: "How exactly was the descriptor failure described at the time? I want to quote it in the postmortem.",',
        'query: "How was the rule about the version attribute phrased at the time? I want to quote it in the postmortem.",',
    ),
    (
        "w02-jakarta-migration.cases.ts",
        'firstAction: conversationSearch(["descriptor", "persistence"]),',
        'firstAction: conversationSearch(["version attribute"]),',
    ),
    # W01 version-choice: 先压缩 separates the superseded pair from endpoint-verbatim
    (
        "w01-proxy-prompt.cases.ts",
        'firstAction: memorySearch(["压缩", "顺序"]),',
        'firstAction: memorySearch(["先压缩", "V1"]),',
    ),
    # W03 version-choice: 表格 separates the pair from profile-build
    (
        "w03-frontend-perf.cases.ts",
        'firstAction: memorySearch(["memo", "表格"]),',
        'firstAction: memorySearch(["表格", "虚拟化"]),',
    ),
]

applied = 0
for path, old, new in EDITS:
    with open(path, encoding="utf-8") as handle:
        text = handle.read()
    if old not in text:
        print(f"  MISS {path}: {old[:72]}")
        continue
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text.replace(old, new, 1))
    applied += 1

print(f"applied {applied} of {len(EDITS)}")
