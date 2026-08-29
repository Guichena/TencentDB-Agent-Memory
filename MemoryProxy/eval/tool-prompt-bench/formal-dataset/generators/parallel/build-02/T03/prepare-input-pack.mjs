import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = process.cwd();
const TEAM = "T03";
const BUILD_ROOT = resolve(ROOT, "MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-02/T03");
const SOURCE_ROOT = resolve(ROOT, "MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T03");
const FROZEN_AT = "2026-08-29T20:40:00+08:00";

const repositories = {
  skillsbench: {
    repository: "https://github.com/benchflow-ai/skillsbench",
    revision: "b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af",
    license: "Apache-2.0",
    licensePath: "LICENSE",
  },
  awesomeCopilot: {
    repository: "https://github.com/github/awesome-copilot",
    revision: "f11a4e441c5ff061b4f8ae37952be8c602e4034e",
    license: "MIT",
    licensePath: "LICENSE",
  },
  openaiSkills: {
    repository: "https://github.com/openai/skills",
    revision: "49f948faa9258a0c61caceaf225e179651397431",
    license: "Apache-2.0",
    licensePath: null,
  },
};

const skills = [
  {
    assetId: "T03-SKILL-GRPO", name: "grpo", source: "skillsbench",
    path: "tasks/debug-trl-grpo/environment/skills/grpo/SKILL.md",
    ownerAgentId: "agent-task1-t03-general", visibility: "private", listed: true,
    description: "Explains GRPO objectives, group-relative advantages, clipping, and stable training diagnostics.",
    useWhen: "The task needs the GRPO algorithmic procedure or its objective-level debugging sequence.",
    doNotUseWhen: "The issue is a generic tensor shape, environment setup, or an already localized constant edit.",
  },
  {
    assetId: "T03-SKILL-NLP-REPRO-ENV", name: "nlp-research-repo-package-installment", source: "skillsbench",
    path: "tasks/simpo-code-reproduction/environment/skills/nlp-research-repo-package-installment/SKILL.md",
    ownerAgentId: "agent-task1-t03-general", visibility: "private", listed: true,
    description: "Reconstructs a version-pinned NLP research repository environment before reproducing results.",
    useWhen: "A paper repository must be installed and pinned reproducibly before code or metric reproduction.",
    doNotUseWhen: "The environment is already locked and the request is a localized model or loss edit.",
  },
  {
    assetId: "T03-SKILL-JUPYTER", name: "jupyter-notebook", source: "openaiSkills",
    path: "skills/.curated/jupyter-notebook/SKILL.md",
    resourcePaths: ["skills/.curated/jupyter-notebook/references/experiment-patterns.md"],
    licensePath: "skills/.curated/jupyter-notebook/LICENSE.txt",
    ownerAgentId: "agent-task1-t03-general", visibility: "private", listed: true,
    description: "Creates or refactors reproducible experiment and tutorial notebooks using bundled patterns.",
    useWhen: "The deliverable is a new or structurally refactored Jupyter notebook for an experiment or tutorial.",
    doNotUseWhen: "A complete notebook is already present and only one identified cell needs a local edit.",
  },
  {
    assetId: "T03-SKILL-TESTING-PYTHON", name: "testing-python", source: "skillsbench",
    path: "tasks/fix-build-agentops/environment/skills/testing-python/SKILL.md",
    ownerAgentId: "agent-task1-t03-general", visibility: "private", listed: true,
    description: "Plans focused Python tests and diagnoses test failures without conflating them with environment setup.",
    useWhen: "A Python or ML repository needs a testing workflow or failure-isolation procedure.",
    doNotUseWhen: "The request is notebook authoring, GRPO diagnosis, or an already specified assertion change.",
  },
  {
    assetId: "T03-SKILL-CLI-CREATOR", name: "cli-creator", source: "openaiSkills",
    path: "skills/.curated/cli-creator/SKILL.md",
    licensePath: "skills/.curated/cli-creator/LICENSE.txt",
    ownerAgentId: "agent-task1-t03-general", visibility: "private", listed: true,
    description: "Designs a new persistent CLI around an API or script with stable commands and output contracts.",
    useWhen: "The task is to create a new command-line product or durable command surface.",
    doNotUseWhen: "The task only uses DVC commands, adjusts one existing flag, or diagnoses a training run.",
  },
  {
    assetId: "T03-SKILL-JAX", name: "jax-skills", source: "skillsbench",
    path: "tasks/jax-computing-basics/environment/skills/jax-skills/SKILL.md",
    ownerAgentId: "agent-task1-t03-general", visibility: "private", listed: true,
    description: "Applies JAX array, transformation, vectorization, and accelerator execution patterns.",
    useWhen: "The current ML implementation specifically uses JAX transformations or execution semantics.",
    doNotUseWhen: "The repository is PyTorch, MONAI, DVC, or the problem is framework-independent.",
  },
  {
    assetId: "T03-SKILL-RL-POST-TRAINING", name: "rl-post-training", source: "skillsbench",
    path: "tasks/debug-trl-grpo/environment/skills/rl-post-training/SKILL.md",
    ownerAgentId: "agent-task1-t03-assets-a", visibility: "team", listed: false,
    description: "Diagnoses reward, sampling, logging, and optimization failures in post-training runs.",
    useWhen: "A post-training run is not improving and the missing piece is a disciplined diagnosis workflow.",
    doNotUseWhen: "The exact bad value and replacement are already supplied or the issue is ordinary supervised training.",
  },
  {
    assetId: "T03-SKILL-TRL", name: "trl", source: "skillsbench",
    path: "tasks/debug-trl-grpo/environment/skills/trl/SKILL.md",
    ownerAgentId: "agent-task1-t03-assets-a", visibility: "team", listed: false,
    description: "Navigates TRL trainer configuration and implementation boundaries for post-training code.",
    useWhen: "The information gap concerns TRL-specific trainer APIs, configuration, or code paths.",
    doNotUseWhen: "The question is purely about the GRPO objective or general reward diagnostics.",
  },
  {
    assetId: "T03-SKILL-SETUP-ENV", name: "setup-env", source: "skillsbench",
    path: "tasks/setup-fuzzing-py/environment/skills/setup-env/SKILL.md",
    ownerAgentId: "agent-task1-t03-assets-a", visibility: "team", listed: false,
    description: "Builds a pinned Python environment and resolves interpreter and native dependency prerequisites.",
    useWhen: "A reproducible Python or ML environment is missing and must be established before the task can proceed.",
    doNotUseWhen: "The environment is already verified or the missing piece is a repository-specific algorithm.",
  },
  {
    assetId: "T03-SKILL-PDF", name: "pdf", source: "skillsbench",
    path: "tasks/simpo-code-reproduction/environment/skills/pdf/SKILL.md",
    ownerAgentId: "agent-task1-t03-assets-a", visibility: "team", listed: false,
    description: "Extracts and inspects information from PDF documents such as research papers.",
    useWhen: "The task requires facts, formulas, or tables that remain only in a PDF artifact.",
    doNotUseWhen: "The paper facts are already quoted or the task is repository environment reproduction.",
  },
  {
    assetId: "T03-SKILL-ANALYZE-CI", name: "analyze-ci", source: "skillsbench",
    path: "tasks/fix-build-agentops/environment/skills/analyze-ci/SKILL.md",
    ownerAgentId: "agent-task1-t03-assets-a", visibility: "team", listed: false,
    description: "Classifies CI failures from logs before selecting a build, environment, or test repair.",
    useWhen: "The failure root cause is still unknown and CI evidence must be classified first.",
    doNotUseWhen: "The exact failing assertion, dependency, or command is already identified.",
  },
  {
    assetId: "T03-SKILL-UV", name: "uv-package-manager", source: "skillsbench",
    path: "tasks/fix-build-agentops/environment/skills/uv-package-manager/SKILL.md",
    ownerAgentId: "agent-task1-t03-assets-b", visibility: "team", listed: false,
    description: "Uses uv to resolve and reproduce Python package environments and lockfiles.",
    useWhen: "The project explicitly uses uv and dependency or lockfile reproduction is the missing procedure.",
    doNotUseWhen: "The project uses another resolver or the environment is already locked and passing.",
  },
  {
    assetId: "T03-SKILL-PYTHON-PARALLEL", name: "python-parallelization", source: "skillsbench",
    path: "tasks/parallel-tfidf-search/environment/skills/python-parallelization/SKILL.md",
    ownerAgentId: "agent-task1-t03-assets-b", visibility: "team", listed: false,
    description: "Selects and implements Python parallel execution patterns for CPU-bound data work.",
    useWhen: "A CPU-bound Python workload needs a concrete parallelization design.",
    doNotUseWhen: "The issue is GPU training, DVC orchestration, or simple test concurrency.",
  },
  {
    assetId: "T03-SKILL-MEMORY-OPT", name: "memory-optimization", source: "skillsbench",
    path: "tasks/parallel-tfidf-search/environment/skills/memory-optimization/SKILL.md",
    ownerAgentId: "agent-task1-t03-assets-b", visibility: "team", listed: false,
    description: "Reduces memory pressure in Python data workloads through bounded representations and processing.",
    useWhen: "Memory consumption, not training semantics or test design, is the dominant bottleneck.",
    doNotUseWhen: "The request concerns GRPO reward behavior, notebook structure, or CLI usage.",
  },
  {
    assetId: "T03-SKILL-WORKLOAD-BALANCING", name: "workload-balancing", source: "skillsbench",
    path: "tasks/parallel-tfidf-search/environment/skills/workload-balancing/SKILL.md",
    ownerAgentId: "agent-task1-t03-assets-b", visibility: "team", listed: false,
    description: "Balances uneven work units across parallel workers and diagnoses stragglers.",
    useWhen: "Parallel workers are underutilized because work distribution is skewed.",
    doNotUseWhen: "The task is single-process training diagnosis or deterministic test authoring.",
  },
  {
    assetId: "T03-SKILL-PYTEST-COVERAGE", name: "pytest-coverage", source: "awesomeCopilot",
    path: "skills/pytest-coverage/SKILL.md",
    ownerAgentId: "agent-task1-t03-assets-b", visibility: "team", listed: false,
    description: "Improves pytest coverage for a known uncovered branch with focused regression tests.",
    useWhen: "The explicit goal is to cover identified Python branches with pytest tests.",
    doNotUseWhen: "The task is to fix a failing test, validate a notebook, or diagnose model training.",
  },
];

const projectStreams = [
  {
    projectId: "T03-PROJECT-DVC-PIPELINES", topic: "DVC pipeline and CLI evolution",
    repoSlug: "iterative/dvc", repoUrl: "https://github.com/iterative/dvc",
    commit: "a2f1367a9a75849ef6ad7ee23a5bacc18580f102", license: "Apache-2.0",
    scope: "pipeline reproduction, import-url command flow, parameter propagation, and regression tests",
  },
  {
    projectId: "T03-PROJECT-SIMPO-REPRO", topic: "SimPO paper reproduction",
    repoSlug: "princeton-nlp/SimPO", repoUrl: "https://github.com/princeton-nlp/SimPO",
    commit: "1b3e8f3528a23bce3da514a2dce8ea7490d4bc75", license: "MIT",
    scope: "environment locking, paper-to-code mapping, notebook summaries, and metric provenance",
  },
  {
    projectId: "T03-PROJECT-TRL-GRPO", topic: "TRL GRPO post-training",
    repoSlug: "huggingface/trl", repoUrl: "https://github.com/huggingface/trl",
    commit: "6630e17a42976fb1db84034e94e0cf058e8baa21", license: "Apache-2.0",
    scope: "reward diagnostics, trainer configuration, sampling signals, and algorithm boundaries",
  },
  {
    projectId: "T03-PROJECT-MONAI-IMAGING", topic: "MONAI imaging pipelines",
    repoSlug: "Project-MONAI/MONAI", repoUrl: "https://github.com/Project-MONAI/MONAI",
    commit: "866d53df3f754e25fb4635abeb3f27cdaaa718cd", license: "Apache-2.0",
    scope: "transform pipelines, deterministic tests, cache boundaries, and notebook validation",
  },
];

function rawUrl(repository, revision, path) {
  const slug = repository.replace(/^https:\/\/github\.com\//, "");
  return `https://raw.githubusercontent.com/${slug}/${revision}/${path}`;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
}

async function fetchBuffer(url) {
  const response = await fetch(url, { headers: { "user-agent": "Codex-Task1-Dataset-Builder" } });
  if (!response.ok) throw new Error(`fetch failed ${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function writeBuffer(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

async function main() {
  const licenseCache = new Map();
  const frozenSkills = [];
  for (const skill of skills) {
    const source = repositories[skill.source];
    const skillUrl = rawUrl(source.repository, source.revision, skill.path);
    const raw = await fetchBuffer(skillUrl);
    const relRoot = `skills/${skill.name}`;
    const rawPath = resolve(SOURCE_ROOT, relRoot, "raw", "SKILL.md");
    const adaptedPath = resolve(SOURCE_ROOT, relRoot, "adapted", "SKILL.md");
    await writeBuffer(rawPath, raw);
    await writeBuffer(adaptedPath, raw);

    const resourceFiles = [];
    for (const resourcePath of skill.resourcePaths ?? []) {
      const resource = await fetchBuffer(rawUrl(source.repository, source.revision, resourcePath));
      const localName = resourcePath.split("/").slice(-2).join("/");
      await writeBuffer(resolve(SOURCE_ROOT, relRoot, "raw", localName), resource);
      await writeBuffer(resolve(SOURCE_ROOT, relRoot, "adapted", localName), resource);
      resourceFiles.push({ upstreamPath: resourcePath, localPath: localName, sha256: sha256(resource) });
    }

    const licensePath = skill.licensePath ?? source.licensePath;
    if (!licensePath) throw new Error(`missing license path for ${skill.name}`);
    const licenseKey = `${skill.source}:${licensePath}`;
    let license = licenseCache.get(licenseKey);
    if (!license) {
      const data = await fetchBuffer(rawUrl(source.repository, source.revision, licensePath));
      license = { data, sha256: sha256(data), upstreamPath: licensePath };
      licenseCache.set(licenseKey, license);
    }
    await writeBuffer(resolve(SOURCE_ROOT, relRoot, "LICENSE.txt"), license.data);

    const rawSha256 = sha256(raw);
    const packageManifest = [
      { path: "SKILL.md", sha256: rawSha256 },
      ...resourceFiles.map((item) => ({ path: item.localPath, sha256: item.sha256 })),
    ];
    const packageSha256 = sha256(Buffer.from(canonicalize(packageManifest), "utf8"));
    const sourceRecord = {
      schema_version: "task1.skill_source_lock.v1",
      team_id: TEAM,
      asset_id: skill.assetId,
      name: skill.name,
      repository: source.repository,
      commit_sha: source.revision,
      path: skill.path,
      license: source.license,
      license_path: licensePath,
      license_sha256: license.sha256,
      raw_file_sha256: rawSha256,
      adapted_file_sha256: rawSha256,
      package_sha256: packageSha256,
      resource_files: resourceFiles,
      adaptation: {
        kind: "registry_metadata_only",
        technical_body_changed: false,
        allowed_changes: ["listing description", "use_when", "do_not_use_when"],
        content_diff_sha256: sha256(Buffer.from("", "utf8")),
      },
      frozen_at: FROZEN_AT,
    };
    await writeFile(resolve(SOURCE_ROOT, relRoot, "source.json"), `${JSON.stringify(sourceRecord, null, 2)}\n`, "utf8");
    await writeFile(resolve(SOURCE_ROOT, relRoot, "ADAPTATION.md"),
      "# Adaptation record\n\nThe imported SKILL.md and any resource files are byte-identical to the frozen upstream files. Only registry-level listing description, `use_when`, and `do_not_use_when` metadata are adapted; the technical body is unchanged.\n",
      "utf8");
    frozenSkills.push({ ...skill, ...sourceRecord, sourceUrl: skillUrl, manifest: packageManifest });
  }

  const inputPack = {
    schema_version: "task1.team_input_pack.v1",
    build_id: "build-02",
    stage: "DS03",
    team_id: TEAM,
    split: "dev",
    frozen_at: FROZEN_AT,
    production_contract: {
      memory: {
        positive_count: 6,
        search_first_count: 4,
        direct_first_count: 2,
        allowed_routes: [
          ["tdai_memory_search"], ["tdai_atomic_query"], ["tdai_conversation_search"],
          ["tdai_conversation_search", "tdai_conversation_query"], ["tdai_read_scene"],
        ],
      },
      skill: {
        positive_count: 6,
        routes: {
          listed_direct: { count: 2, sequence: ["skill_view"] },
          team_search: { count: 3, sequence: ["skill_search", "skill_view_by_id"] },
          listed_resource: { count: 1, sequence: ["skill_view", "skill_files_read"] },
        },
      },
      knowledge: {
        positive_count: 3,
        sequence: ["knowledge_tools_list", "knowledge_tools_call"],
        fixed_resource_count: 3,
      },
      pair_negative_count: 15,
      natural_negative_count: 10,
      provider_forbidden_terms: ["gold", "targetAssetIds", "pairId", "informationGap", "knowledge_id", "/memory-bridge/", "/skill-bridge/", "/tools/list", "/tools/call"],
    },
    identities: {
      active_agent_id: "agent-task1-t03-general",
      asset_agent_ids: ["agent-task1-t03-assets-a", "agent-task1-t03-assets-b"],
      user_id: "user-task1-t03-eval",
      space_id: "space-task1-engineering",
      snapshot_id: "snapshot-task1-dev-v1",
    },
    project_streams: projectStreams,
    asset_targets: {
      memory: { l0_sessions: 10, l0_messages_per_session: [12, 20], l1_memories: 16, l2_scenes: 5, l3_profiles: 1 },
      skills: { total: frozenSkills.length, bound_to_active: frozenSkills.filter((item) => item.listed).map((item) => item.assetId) },
      knowledge: [
        { assetId: "T03-KNOW-DVC-CODEGRAPH", type: "code_graph", projectId: "T03-PROJECT-DVC-PIPELINES", toolName: "search" },
        { assetId: "T03-KNOW-MONAI-CODEGRAPH", type: "code_graph", projectId: "T03-PROJECT-MONAI-IMAGING", toolName: "search" },
        { assetId: "T03-KNOW-RL-RUNBOOK", type: "wiki", about: "GRPO rollout, reward, and reproducibility decisions", toolName: "search" },
      ],
    },
    required_trial_pairs: [
      { family: "memory", route: ["tdai_conversation_search"], projectId: "T03-PROJECT-DVC-PIPELINES" },
      { family: "skill", route: ["skill_search", "skill_view_by_id"], targetAssetId: "T03-SKILL-RL-POST-TRAINING" },
      { family: "knowledge", route: ["knowledge_tools_list", "knowledge_tools_call"], targetAssetId: "T03-KNOW-MONAI-CODEGRAPH" },
    ],
    final_positive_plan: {
      memory: [
        { id: "MEM-01", route: ["tdai_conversation_search"], target: "T03-L0-DVC-CLI", project: "DVC" },
        { id: "MEM-02", route: ["tdai_memory_search"], target: "T03-L1-GRPO-REWARD", project: "TRL-GRPO" },
        { id: "MEM-03", route: ["tdai_conversation_search", "tdai_conversation_query"], target: "T03-L0-MONAI-CACHE", project: "MONAI" },
        { id: "MEM-04", route: ["tdai_memory_search"], target: "T03-L1-SIMPO-METRIC", project: "SimPO" },
        { id: "MEM-05", route: ["tdai_atomic_query"], target: "T03-L1-DVC-RETENTION", project: "DVC" },
        { id: "MEM-06", route: ["tdai_read_scene"], target: "T03-L2-GRPO-ROLLOUT", project: "TRL-GRPO" },
      ],
      skill: [
        { id: "SKILL-01", route: ["skill_view"], target: "T03-SKILL-GRPO", project: "TRL-GRPO" },
        { id: "SKILL-02", route: ["skill_view"], target: "T03-SKILL-NLP-REPRO-ENV", project: "SimPO" },
        { id: "SKILL-03", route: ["skill_search", "skill_view_by_id"], target: "T03-SKILL-RL-POST-TRAINING", project: "TRL-GRPO" },
        { id: "SKILL-04", route: ["skill_search", "skill_view_by_id"], target: "T03-SKILL-TRL", project: "TRL-GRPO" },
        { id: "SKILL-05", route: ["skill_search", "skill_view_by_id"], target: "T03-SKILL-SETUP-ENV", project: "MONAI" },
        { id: "SKILL-06", route: ["skill_view", "skill_files_read"], target: "T03-SKILL-JUPYTER", resource: "references/experiment-patterns.md", project: "SimPO" },
      ],
      knowledge: [
        { id: "KNOW-01", target: "T03-KNOW-DVC-CODEGRAPH", project: "DVC", toolName: "search" },
        { id: "KNOW-02", target: "T03-KNOW-MONAI-CODEGRAPH", project: "MONAI", toolName: "search" },
        { id: "KNOW-03", target: "T03-KNOW-RL-RUNBOOK", project: "TRL-GRPO", toolName: "search" },
      ],
    },
    frozen_skills: frozenSkills,
    prohibitions: [
      "Do not invent or rewrite a formal Skill technical procedure.",
      "Do not decide final Gold or production visibility.",
      "Do not expose author-only ids, tool names, endpoints, or evaluation labels in provider-visible text.",
      "Do not extract official patches, install upstream dependencies, run upstream tests, or perform formal model evaluation.",
    ],
  };
  inputPack.input_pack_sha256 = sha256(Buffer.from(canonicalize(inputPack), "utf8"));
  await mkdir(BUILD_ROOT, { recursive: true });
  await writeFile(resolve(BUILD_ROOT, "input-pack.json"), `${JSON.stringify(inputPack, null, 2)}\n`, "utf8");
  await writeFile(resolve(SOURCE_ROOT, "README.md"),
    "# T03 frozen source material\n\nAll formal Skill packages here are frozen from the repositories, commits, paths, and licenses recorded in each `source.json`. Raw and adapted technical bodies are byte-identical; only formal registry routing metadata is adapted. No upstream dependencies or tests were run.\n",
    "utf8");
  console.log(JSON.stringify({ team: TEAM, skills: frozenSkills.length, inputPackSha256: inputPack.input_pack_sha256 }, null, 2));
}

await main();
