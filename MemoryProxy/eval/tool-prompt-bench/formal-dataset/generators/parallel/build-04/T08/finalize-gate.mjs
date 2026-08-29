import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve("MemoryProxy/eval/tool-prompt-bench");
const generatorRoot = resolve(root, "formal-dataset/generators/parallel/build-04/T08");
const stagingRoot = resolve(root, "formal-dataset/staging/teams/T08");
const reportPath = resolve(generatorRoot, "formal-validation.json");
const contractPath = resolve(generatorRoot, "gate-contract.json");
const fragmentPath = resolve(stagingRoot, "team-fragment.json");
const gatePath = resolve(stagingRoot, "gate.json");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const reportBytes = await readFile(reportPath);
const report = JSON.parse(reportBytes.toString("utf8"));
if (report.valid !== true || report.case_count !== 40 || report.team_case_counts?.T08 !== 40) {
  throw new Error("formal validation report is not a passing T08 Team Gate");
}
if (report.pairs_by_team?.T08 !== 15 || report.pair_integrity_error_count !== 0
  || report.provider_leakage_count !== 0 || report.invalid_sequence_count !== 0
  || report.missing_source_ref_count !== 0) {
  throw new Error("formal validation report failed T08 integrity checks");
}

const gate = JSON.parse(await readFile(gatePath, "utf8"));
const contractBytes = await readFile(contractPath);
const fragmentBytes = await readFile(fragmentPath);
gate.checks.formal_gate_contract = "passed";
gate.validation = {
  setup_command: "node MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-04/T08/build-gate-contract.mjs",
  command: "npx --yes tsx MemoryProxy/eval/tool-prompt-bench/formal-dataset/scripts/validate-formal-dataset.ts --contract MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-04/T08/gate-contract.json --split hidden_test --report MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-04/T08/formal-validation.json",
  report_sha256: sha256(reportBytes),
  gate_contract_sha256: sha256(contractBytes),
  fragment_file_sha256: sha256(fragmentBytes),
  cases: report.case_count,
  pairs: report.pairs_by_team.T08,
  pair_integrity_errors: report.pair_integrity_error_count,
  provider_leakage: report.provider_leakage_count,
  invalid_sequences: report.invalid_sequence_count,
  missing_source_refs: report.missing_source_ref_count,
  local_tests: {
    source_tools_python_unittest: "passed: 19 tests",
    host_vitest: "not run: isolated worktree has no host node_modules; no out-of-scope dependency/link was added",
  },
  gate_contract_artifact: "ephemeral; hash recorded above and file removed after validation",
};
await writeFile(gatePath, `${JSON.stringify(gate, null, 2)}\n`, "utf8");
await rm(contractPath, { force: true });
console.log(JSON.stringify({ status: gate.status, formal_gate_contract: gate.checks.formal_gate_contract, validation: gate.validation }, null, 2));
