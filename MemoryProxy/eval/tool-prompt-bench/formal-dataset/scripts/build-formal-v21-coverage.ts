import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { canonicalSha256, exactUtf8Sha256 } from "../../formal-runtime/canonical.js";
import { loadFormalCaseBindings } from "../../formal-runtime/case-bindings.js";
import { resolveFormalDataFreeze } from "../../formal-runtime/freeze.js";
import { loadPrivateMeasurementSplit } from "../../formal-runtime/private-loader.js";
import { loadFormalProviderSplit } from "../../formal-runtime/provider-loader.js";
import { loadFormalSmokePreregistration } from "../../formal-runtime/smoke-preregistration.js";
import { assertFormalWorldContract, type FormalWorldContract } from "../../worlds/formal-schema.js";

type CountMap = Record<string, number>;
type JsonRecord = Record<string, unknown>;

const REPORT_JSON = "formal-dataset/reports/DS09-FORMAL-V2.1-COVERAGE-MATRIX.json";
const REPORT_MARKDOWN = "formal-dataset/reports/DS09-FORMAL-V2.1-COVERAGE-MATRIX.md";

function increment(target: CountMap, key: string, amount = 1): void {
  target[key] = (target[key] ?? 0) + amount;
}

function sortedCounts(value: CountMap): CountMap {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function shortestSequence(gold: any): any[] {
  const sequences = (gold.allowedSequences as Array<{ steps: any[] }> | undefined) ?? [];
  return sequences
    .map((sequence) => sequence.steps)
    .sort((left, right) => left.length - right.length || JSON.stringify(left).localeCompare(JSON.stringify(right)))[0] ?? [];
}

function routeFor(steps: any[]): "none" | "direct" | "discovery" | "followup" {
  if (steps.length === 0) return "none";
  if (steps.length === 1) return "direct";
  const firstTool = String(steps[0]?.tool ?? "");
  return /(?:search|_list|scenario_ls)$/u.test(firstTool) ? "discovery" : "followup";
}

function contextBucket(count: number): string {
  if (count <= 4) return "0-4";
  if (count <= 8) return "5-8";
  if (count <= 12) return "9-12";
  return "13+";
}

function tableRows(counts: CountMap): string {
  return Object.entries(counts).map(([key, count]) => `| ${key} | ${count} |`).join("\n");
}

async function main(): Promise<void> {
  const repositoryRoot = process.cwd();
  const freeze = resolveFormalDataFreeze({ repositoryRoot });
  const devProvider = loadFormalProviderSplit({ freeze, split: "dev" });
  const hiddenProvider = loadFormalProviderSplit({ freeze, split: "hidden_test", allowHiddenTest: true });
  const devPrivate = loadPrivateMeasurementSplit({ freeze, split: "dev" });
  const hiddenPrivate = loadPrivateMeasurementSplit({ freeze, split: "hidden_test", allowHiddenTest: true });
  const devBindings = loadFormalCaseBindings({ freeze, split: "dev" });
  const hiddenBindings = loadFormalCaseBindings({ freeze, split: "hidden_test", allowHiddenTest: true });
  const smoke = loadFormalSmokePreregistration({ freeze });

  const contractPath = resolve(freeze.datasetRoot, "registry", "contracts", "formal-v2.json");
  const contract = JSON.parse(await readFile(contractPath, "utf8")) as FormalWorldContract;
  assertFormalWorldContract(contract);

  const providers = [...devProvider.cases, ...hiddenProvider.cases];
  const gold = [...devPrivate.gold, ...hiddenPrivate.gold];
  const pairs = [...devPrivate.pairs, ...hiddenPrivate.pairs];
  const bindings = [...devBindings.rows, ...hiddenBindings.rows];
  const runtimeContracts = devPrivate.runtimeContracts;
  const providerById = new Map(providers.map((item) => [item.caseId, item]));
  const goldById = new Map(gold.map((item) => [item.caseId, item]));
  const publicById = new Map(contract.publicCases.map((item) => [item.caseId, item]));
  const bindingById = new Map(bindings.map((item) => [item.caseId, item]));
  const pairByNegative = new Map(pairs.map((item) => [item.negativeCaseId, item]));

  const dimensions = {
    split: {} as CountMap,
    team: {} as CountMap,
    language: {} as CountMap,
    difficulty: {} as CountMap,
    evaluationFamily: {} as CountMap,
    terminalTool: {} as CountMap,
    knowledgeOperation: {} as CountMap,
    shortestChainLength: {} as CountMap,
    route: {} as CountMap,
    chainKind: {} as CountMap,
    caseKind: {} as CountMap,
  };
  const bySplitFamily: CountMap = {};
  const bySplitRoute: CountMap = {};
  const bySplitCaseKind: CountMap = {};
  const runtimeContractUse: CountMap = {};
  const operationTeams = new Map<string, Set<string>>();
  const multiStepCaseIds: string[] = [];
  const typedBindingCaseIds: string[] = [];
  const unlabeledDifficultyCaseIds: string[] = [];
  const teamRepositories = new Map<string, Set<string>>();

  for (const item of contract.publicCases) {
    const provider = providerById.get(item.caseId);
    const caseGold = goldById.get(item.caseId) as any;
    const binding = bindingById.get(item.caseId);
    if (!provider || !caseGold || !binding) throw new Error(`${item.caseId}: incomplete provider/Gold/binding join`);
    const steps = shortestSequence(caseGold);
    const terminal = steps.at(-1);
    const pair = pairByNegative.get(item.caseId);
    const caseKind = caseGold.expectation === "tool"
      ? "positive"
      : pair ? "paired_negative" : "natural_coding_negative";
    const family = caseGold.expectation === "tool" ? String(steps[0]?.family ?? "unknown") : "no-tool";
    const route = routeFor(steps);
    increment(dimensions.split, binding.split);
    increment(dimensions.team, item.identity.teamId);
    increment(dimensions.language, item.language);
    increment(dimensions.difficulty, item.difficulty ?? "unlabeled");
    if (item.difficulty === undefined) unlabeledDifficultyCaseIds.push(item.caseId);
    increment(dimensions.evaluationFamily, family);
    increment(dimensions.terminalTool, terminal ? String(terminal.tool) : "none");
    increment(dimensions.shortestChainLength, String(steps.length));
    increment(dimensions.route, route);
    increment(dimensions.chainKind, steps.length > 1 ? "multi_step" : steps.length === 1 ? "single_step" : "no_tool");
    increment(dimensions.caseKind, caseKind);
    increment(bySplitFamily, `${binding.split}|${family}`);
    increment(bySplitRoute, `${binding.split}|${route}`);
    increment(bySplitCaseKind, `${binding.split}|${caseKind}`);
    const repositories = teamRepositories.get(item.identity.teamId) ?? new Set<string>();
    repositories.add(binding.workspace.repoSlug);
    teamRepositories.set(item.identity.teamId, repositories);
    if (steps.length > 1) multiStepCaseIds.push(item.caseId);
    if (steps.some((step) => Array.isArray(step.bindings) && step.bindings.length > 0)) typedBindingCaseIds.push(item.caseId);
    for (const step of steps) increment(runtimeContractUse, String(step.runtimeContractId));
    if (terminal?.family === "knowledge") {
      const operation = String(terminal.operation?.value ?? "none");
      increment(dimensions.knowledgeOperation, operation);
      const teams = operationTeams.get(operation) ?? new Set<string>();
      teams.add(item.identity.teamId);
      operationTeams.set(operation, teams);
    }
  }

  const pairDimensions = {
    split: {} as CountMap,
    team: {} as CountMap,
    counterfactualKind: {} as CountMap,
    family: {} as CountMap,
    route: {} as CountMap,
    shortestChainLength: {} as CountMap,
    negativeContextMessages: {} as CountMap,
  };
  for (const pair of pairs) {
    const positiveGold = goldById.get(pair.positiveCaseId) as any;
    const negativeProvider = providerById.get(pair.negativeCaseId);
    const publicCase = publicById.get(pair.positiveCaseId);
    if (!positiveGold || !negativeProvider || !publicCase) throw new Error(`${pair.pairId}: incomplete Pair join`);
    const steps = shortestSequence(positiveGold);
    increment(pairDimensions.split, pair.split === "hidden" ? "hidden_test" : "dev");
    increment(pairDimensions.team, publicCase.identity.teamId);
    increment(pairDimensions.counterfactualKind, pair.causalFactorId.replace(/^task1:/u, ""));
    increment(pairDimensions.family, String(steps[0]?.family ?? "unknown"));
    increment(pairDimensions.route, routeFor(steps));
    increment(pairDimensions.shortestChainLength, String(steps.length));
    increment(pairDimensions.negativeContextMessages, contextBucket(negativeProvider.contextMessages.length));
  }

  const runtimeDimensions = {
    family: {} as CountMap,
    tool: {} as CountMap,
    operation: {} as CountMap,
  };
  for (const contractItem of runtimeContracts) {
    increment(runtimeDimensions.family, contractItem.family);
    increment(runtimeDimensions.tool, contractItem.tool);
    increment(runtimeDimensions.operation, contractItem.operation.kind === "argument"
      ? contractItem.operation.value
      : contractItem.contractId);
  }

  const errors: string[] = [];
  if (providers.length !== 800 || gold.length !== 800 || bindings.length !== 800) errors.push("800-case join is incomplete");
  if (pairs.length !== 300) errors.push("Pair count is not 300");
  if (runtimeContracts.length !== 22) errors.push("runtime contract count is not 22");
  if (smoke.caseIds.length !== 40) errors.push("Smoke v2 count is not 40");
  if (Object.keys(dimensions.team).length !== 20) errors.push("Team coverage is not 20");
  if (pairDimensions.counterfactualKind.answer_in_current_context !== 300) {
    errors.push("frozen Pair counterfactual contract drift");
  }
  for (const contractItem of runtimeContracts) {
    if (!runtimeContractUse[contractItem.contractId]) errors.push(`runtime contract has zero case use: ${contractItem.contractId}`);
  }
  for (const split of ["dev", "hidden_test"]) {
    for (const family of ["memory", "skill", "knowledge", "no-tool"]) {
      if (!bySplitFamily[`${split}|${family}`]) errors.push(`${split} has zero ${family} coverage`);
    }
    for (const kind of ["positive", "paired_negative", "natural_coding_negative"]) {
      if (!bySplitCaseKind[`${split}|${kind}`]) errors.push(`${split} has zero ${kind} coverage`);
    }
  }
  for (const team of ["T17", "T18", "T19", "T20"]) {
    if (dimensions.team[team] !== 40 || pairDimensions.team[team] !== 15) errors.push(`${team} is not 40 cases / 15 pairs`);
  }

  const report: JsonRecord = {
    schemaVersion: "task1.formal-v2.1-coverage-matrix.v1",
    dataFreeze: {
      tag: freeze.tag,
      tagObject: freeze.tagObject,
      commit: freeze.commit,
      statusTagBlob: freeze.statusTagBlob,
      statusFileSha256: freeze.statusFileSha256,
    },
    counts: {
      providerCases: providers.length,
      privateGold: gold.length,
      pairs: pairs.length,
      caseBindings: bindings.length,
      runtimeContracts: runtimeContracts.length,
      smokeCases: smoke.caseIds.length,
      teams: Object.keys(dimensions.team).length,
    },
    caseDimensions: Object.fromEntries(Object.entries(dimensions).map(([key, value]) => [key, sortedCounts(value)])),
    splitComparisons: {
      family: sortedCounts(bySplitFamily),
      route: sortedCounts(bySplitRoute),
      caseKind: sortedCounts(bySplitCaseKind),
    },
    pairDimensions: Object.fromEntries(Object.entries(pairDimensions).map(([key, value]) => [key, sortedCounts(value)])),
    runtimeContractCoverage: {
      dimensions: Object.fromEntries(Object.entries(runtimeDimensions).map(([key, value]) => [key, sortedCounts(value)])),
      caseUse: sortedCounts(runtimeContractUse),
    },
    knowledgeOperationTeamCounts: Object.fromEntries([...operationTeams.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([operation, teams]) => [operation, teams.size])),
    addedTeamCoverage: Object.fromEntries(["T17", "T18", "T19", "T20"].map((team) => [team, {
      cases: dimensions.team[team] ?? 0,
      pairs: pairDimensions.team[team] ?? 0,
      repositories: [...(teamRepositories.get(team) ?? [])].sort(),
    }])),
    riskReviewQueues: {
      multiStepCaseIds: multiStepCaseIds.sort(),
      typedBindingCaseIds: typedBindingCaseIds.sort(),
      unlabeledDifficultyCaseIds: unlabeledDifficultyCaseIds.sort(),
      addedTeamCaseIds: contract.publicCases.map((item) => item.caseId)
        .filter((caseId) => /^(?:T17|T18|T19|T20)-/u.test(caseId))
        .sort(),
    },
    interpretation: {
      counterfactualCoverage: "The frozen 300 Pairs intentionally cover only answer_in_current_context; this is diagnostic scope, not a Gate failure.",
      repositoryMismatch: "No post-hoc mismatch label is added. A future auxiliary set must separate visible mismatch/no-call from discovery-required/list-then-stop.",
      difficulty: "Two frozen T17 Pair cases have no difficulty label. They are reported as unlabeled because difficulty is not a Task 1 scoring input and must not be invented after freeze.",
      selectionIndependence: "Coverage is derived without Variant model outputs and is used only for data validation and preregistration.",
    },
    errors,
    valid: errors.length === 0,
  };

  const jsonText = `${JSON.stringify(report, null, 2)}\n`;
  const reportCanonicalSha256 = canonicalSha256(report);
  const markdownText = `# formal-v2.1 覆盖矩阵与风险定向复核输入\n\n`
    + `- 数据：800 Gold / 300 Pair / 800 binding / 22 runtime contracts / 40 Smoke v2。\n`
    + `- JSON canonical SHA-256：\`${reportCanonicalSha256}\`。\n`
    + `- 生成结论：${errors.length === 0 ? "PASS" : "FAIL"}。\n\n`
    + `## Case 类型\n\n| 类型 | 数量 |\n| --- | ---: |\n${tableRows(sortedCounts(dimensions.caseKind))}\n\n`
    + `## 工具家族\n\n| 家族 | 数量 |\n| --- | ---: |\n${tableRows(sortedCounts(dimensions.evaluationFamily))}\n\n`
    + `## 最短充分链\n\n| 长度 | 数量 |\n| --- | ---: |\n${tableRows(sortedCounts(dimensions.shortestChainLength))}\n\n`
    + `## Pair 反事实合同\n\n| 类型 | 数量 |\n| --- | ---: |\n${tableRows(sortedCounts(pairDimensions.counterfactualKind))}\n\n`
    + `冻结的 300 个 Pair 仅承诺 \`answer_in_current_context\`。这不是覆盖失败；本轮不事后补写仓库或版本不匹配标签。未来若新增诊断集，应区分“输入已明确不匹配，因此不调用”和“必须先 list/search 才能发现不匹配，因此发现后停止”。\n\n`
    + `## 风险定向复核队列\n\n`
    + `- multi-step：${multiStepCaseIds.length} 条。\n`
    + `- typed binding：${typedBindingCaseIds.length} 条。\n`
    + `- difficulty 未标注：${unlabeledDifficultyCaseIds.length} 条（只记录，不参与 Task 1 评分）。\n`
    + `- T17-T20：160 条，分别保持 40 Case / 15 Pair，并绑定独立仓库。\n`
    + `- 完整 Case ID 与按 operation/Team 的计数保存在同名 JSON；不重复人工检查已通过的机械 schema 规则。\n\n`
    + `## Gate\n\n${errors.length === 0 ? "- PASS：无零覆盖运行合同，Dev/Holdout 均含三类工具、No-tool、Pair negative 与自然 coding negative。" : errors.map((error) => `- FAIL：${error}`).join("\n")}\n`;

  const jsonPath = resolve(freeze.datasetRoot, "..", REPORT_JSON.replace(/^formal-dataset\//u, "formal-dataset/"));
  const markdownPath = resolve(freeze.datasetRoot, "..", REPORT_MARKDOWN.replace(/^formal-dataset\//u, "formal-dataset/"));
  await writeFile(jsonPath, jsonText, "utf8");
  await writeFile(markdownPath, markdownText, "utf8");
  process.stdout.write(`${JSON.stringify({
    valid: errors.length === 0,
    jsonPath,
    markdownPath,
    jsonFileSha256: exactUtf8Sha256(jsonText),
    jsonCanonicalSha256: reportCanonicalSha256,
    markdownFileSha256: exactUtf8Sha256(markdownText),
    counts: report.counts,
  }, null, 2)}\n`);
  if (errors.length > 0) process.exitCode = 1;
}

await main();
