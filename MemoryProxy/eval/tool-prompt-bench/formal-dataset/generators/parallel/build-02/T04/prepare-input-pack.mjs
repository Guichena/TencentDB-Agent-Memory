import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = process.cwd();
const TEAM = "T04";
const BUILD_ROOT = resolve(ROOT, "MemoryProxy/eval/tool-prompt-bench/formal-dataset/generators/parallel/build-02/T04");
const SOURCE_ROOT = resolve(ROOT, "MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T04");
const FROZEN_AT = "2026-08-29T22:55:00+08:00";

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
};

const skills = [
  {
    assetId: "T04-SKILL-JAKARTA", name: "jakarta-namespace", source: "skillsbench",
    path: "tasks/spring-boot-jakarta-migration/environment/skills/jakarta-namespace/SKILL.md",
    ownerAgentId: "agent-task1-t04-general", visibility: "private", listed: true,
    description: "Migrates Java EE javax namespaces to Jakarta while retaining JDK-owned javax packages.",
    useWhen: "A Spring Boot 3 or Jakarta upgrade specifically requires namespace mapping and verification.",
    doNotUseWhen: "The issue is RestClient, Maven configuration, a retained JDK javax import, or an exact local replacement already supplied.",
  },
  {
    assetId: "T04-SKILL-RESTCLIENT", name: "restclient-migration", source: "skillsbench",
    path: "tasks/spring-boot-jakarta-migration/environment/skills/restclient-migration/SKILL.md",
    ownerAgentId: "agent-task1-t04-general", visibility: "private", listed: true,
    description: "Migrates synchronous Spring RestTemplate calls to Spring 6.1 RestClient while preserving behavior.",
    useWhen: "A synchronous Spring HTTP client must move from RestTemplate to RestClient with method and error parity.",
    doNotUseWhen: "The target is WebClient/reactive, a controller route, a namespace migration, or a fully specified local edit.",
  },
  {
    assetId: "T04-SKILL-SPRING-TESTING", name: "spring-boot-testing", source: "awesomeCopilot",
    path: "skills/spring-boot-testing/SKILL.md",
    resourcePaths: ["skills/spring-boot-testing/references/restclienttest.md"],
    ownerAgentId: "agent-task1-t04-general", visibility: "private", listed: true,
    description: "Selects focused Spring Boot test slices and resources for MVC, persistence, and REST clients.",
    useWhen: "A Spring Boot component needs a focused test slice or a RestClient-specific test procedure.",
    doNotUseWhen: "The task is a Maven root-cause diagnosis, namespace migration, or an already specified assertion edit.",
  },
  {
    assetId: "T04-SKILL-JAVA-JUNIT", name: "java-junit", source: "awesomeCopilot",
    path: "skills/java-junit/SKILL.md",
    ownerAgentId: "agent-task1-t04-general", visibility: "private", listed: true,
    description: "Designs focused Java unit tests with JUnit lifecycle, parameterization, and assertions.",
    useWhen: "The only missing procedure is a Java unit-test design or JUnit test structure.",
    doNotUseWhen: "The request is build diagnosis, HTTP client migration, or an exact assertion already given.",
  },
  {
    assetId: "T04-SKILL-JAVA-SPRINGBOOT", name: "java-springboot", source: "awesomeCopilot",
    path: "skills/java-springboot/SKILL.md",
    ownerAgentId: "agent-task1-t04-general", visibility: "private", listed: true,
    description: "Provides broad Spring Boot implementation conventions across API, data, validation, and services.",
    useWhen: "A general Spring Boot implementation needs framework conventions rather than a narrow migration.",
    doNotUseWhen: "A narrow Jakarta, RestClient, Security, Hibernate, or Maven procedure is the unique gap.",
  },
  {
    assetId: "T04-SKILL-CREATE-SPRING", name: "create-spring-boot-java-project", source: "awesomeCopilot",
    path: "skills/create-spring-boot-java-project/SKILL.md",
    ownerAgentId: "agent-task1-t04-general", visibility: "private", listed: true,
    description: "Scaffolds a new Spring Boot Java project with a deliberate dependency and package layout.",
    useWhen: "The deliverable is a new Spring Boot project rather than a change to an existing repository.",
    doNotUseWhen: "An existing project only needs migration, testing, or build repair.",
  },
  {
    assetId: "T04-SKILL-MAVEN-LIFECYCLE", name: "maven-build-lifecycle", source: "skillsbench",
    path: "tasks/fix-build-google-auto/environment/skills/maven-build-lifecycle/SKILL.md",
    ownerAgentId: "agent-task1-t04-assets-a", visibility: "team", listed: false,
    description: "Diagnoses Maven phase, goal, profile, module-order, and lifecycle execution problems.",
    useWhen: "The failure is uniquely about which Maven phase/profile/module is executed and in what order.",
    doNotUseWhen: "The evidence identifies a dependency conflict or a plugin configuration defect.",
  },
  {
    assetId: "T04-SKILL-MAVEN-DEPENDENCY", name: "maven-dependency-management", source: "skillsbench",
    path: "tasks/fix-build-google-auto/environment/skills/maven-dependency-management/SKILL.md",
    ownerAgentId: "agent-task1-t04-assets-a", visibility: "team", listed: false,
    description: "Diagnoses Maven version mediation, convergence, dependencyManagement, exclusions, and scopes.",
    useWhen: "The failing build evidence uniquely points to dependency resolution or version convergence.",
    doNotUseWhen: "The root cause is a lifecycle/profile choice, plugin execution, or ordinary Java compilation.",
  },
  {
    assetId: "T04-SKILL-MAVEN-PLUGIN", name: "maven-plugin-configuration", source: "skillsbench",
    path: "tasks/fix-build-google-auto/environment/skills/maven-plugin-configuration/SKILL.md",
    ownerAgentId: "agent-task1-t04-assets-a", visibility: "team", listed: false,
    description: "Diagnoses Maven plugin versions, executions, goals, inherited configuration, and parameters.",
    useWhen: "The build evidence uniquely identifies a plugin execution or plugin parameter defect.",
    doNotUseWhen: "The root cause is dependency mediation, lifecycle phase selection, or source code semantics.",
  },
  {
    assetId: "T04-SKILL-SPRING-MIGRATION", name: "spring-boot-migration", source: "skillsbench",
    path: "tasks/spring-boot-jakarta-migration/environment/skills/spring-boot-migration/SKILL.md",
    ownerAgentId: "agent-task1-t04-assets-a", visibility: "team", listed: false,
    description: "Coordinates a broad Spring Boot 2-to-3 and Java baseline migration across several subsystems.",
    useWhen: "The task genuinely spans the complete Spring Boot platform upgrade and its ordered workstreams.",
    doNotUseWhen: "Only namespace, RestClient, Security, Hibernate, or one local edit is requested.",
  },
  {
    assetId: "T04-SKILL-SPRING-SECURITY", name: "spring-security-6", source: "skillsbench",
    path: "tasks/spring-boot-jakarta-migration/environment/skills/spring-security-6/SKILL.md",
    ownerAgentId: "agent-task1-t04-assets-a", visibility: "team", listed: false,
    description: "Migrates Spring Security configuration to the Spring Security 6 component-based model.",
    useWhen: "SecurityFilterChain, request authorization, password encoding, or method security is the unique migration gap.",
    doNotUseWhen: "The task concerns only namespace mapping, RestClient, or Maven build mechanics.",
  },
  {
    assetId: "T04-SKILL-HIBERNATE", name: "hibernate-upgrade", source: "skillsbench",
    path: "tasks/spring-boot-jakarta-migration/environment/skills/hibernate-upgrade/SKILL.md",
    ownerAgentId: "agent-task1-t04-assets-b", visibility: "team", listed: false,
    description: "Migrates Hibernate/JPA mapping and query behavior across a framework upgrade.",
    useWhen: "The missing procedure is specifically Hibernate mapping, dialect, query, or persistence behavior migration.",
    doNotUseWhen: "Only import namespaces, HTTP client code, or Maven configuration is in scope.",
  },
  {
    assetId: "T04-SKILL-JACKSON-SECURITY", name: "jackson-security", source: "skillsbench",
    path: "tasks/fix-druid-loophole-cve/environment/skills/jackson-security/SKILL.md",
    ownerAgentId: "agent-task1-t04-assets-b", visibility: "team", listed: false,
    description: "Diagnoses and repairs Jackson deserialization and parser-boundary security flaws.",
    useWhen: "The task is a Java JSON deserialization vulnerability with adversarial and legitimate behavior constraints.",
    doNotUseWhen: "The request is a normal DTO change, HTTP migration, namespace edit, or Maven failure.",
  },
  {
    assetId: "T04-SKILL-SENIOR-JAVA", name: "senior-java", source: "skillsbench",
    path: "tasks/fix-druid-loophole-cve/environment/skills/senior-java/SKILL.md",
    ownerAgentId: "agent-task1-t04-assets-b", visibility: "team", listed: false,
    description: "Provides broad Java code-reading, implementation, testing, and maintainability guidance.",
    useWhen: "A general Java engineering workflow lacks a more specific framework or build procedure.",
    doNotUseWhen: "A narrow Skill uniquely covers Jakarta, RestClient, security, testing, or a Maven root cause.",
  },
  {
    assetId: "T04-SKILL-JAVAX-AWESOME", name: "javax-to-jakarta-migration", source: "awesomeCopilot",
    path: "skills/javax-to-jakarta-migration/SKILL.md",
    ownerAgentId: "agent-task1-t04-assets-b", visibility: "team", listed: false,
    description: "Migrates broad javax usage to Jakarta with a scan, mapping, build, and verification workflow.",
    useWhen: "A general Jakarta namespace conversion needs a broad cross-project procedure.",
    doNotUseWhen: "The active agent already lists the narrower project-frozen Jakarta procedure or an exact edit is supplied.",
  },
  {
    assetId: "T04-SKILL-JAVA-REFACTOR", name: "java-refactoring-extract-method", source: "awesomeCopilot",
    path: "skills/java-refactoring-extract-method/SKILL.md",
    ownerAgentId: "agent-task1-t04-assets-b", visibility: "team", listed: false,
    description: "Extracts a focused Java method while preserving behavior and local tests.",
    useWhen: "The task is specifically an extract-method refactor in existing Java code.",
    doNotUseWhen: "The task is a framework migration, security fix, HTTP client change, or build diagnosis.",
  },
];

const projectStreams = [
  {
    projectId: "T04-PROJECT-PETCLINIC", topic: "Spring PetClinic Jakarta and security migration",
    repoSlug: "spring-projects/spring-petclinic", repoUrl: "https://github.com/spring-projects/spring-petclinic",
    commit: "818c4136ea971c21674525f9053de0d9c7ad8cfe", license: "Apache-2.0",
    scope: "Jakarta namespaces, retained JDK javax packages, validation, persistence, security, and focused regression tests",
  },
  {
    projectId: "T04-PROJECT-REST-CONSUMER", topic: "Spring synchronous REST client evolution",
    repoSlug: "spring-guides/gs-consuming-rest", repoUrl: "https://github.com/spring-guides/gs-consuming-rest",
    commit: "879c2a18a74fc9df071147fdd81206373b30a298", license: "Apache-2.0",
    scope: "synchronous RestTemplate-to-RestClient behavior parity, response mapping, error handling, and client tests",
  },
  {
    projectId: "T04-PROJECT-GOOGLE-AUTO", topic: "Google Auto Maven build diagnosis",
    repoSlug: "google/auto", repoUrl: "https://github.com/google/auto",
    commit: "2776e288bd3011800e46581b0b810668cc6d664b", license: "Apache-2.0",
    scope: "multi-module Maven lifecycle, dependency convergence, plugin execution, profiles, and build evidence",
  },
  {
    projectId: "T04-PROJECT-DRUID-BACKEND", topic: "Apache Druid Java backend security",
    repoSlug: "apache/druid", repoUrl: "https://github.com/apache/druid",
    commit: "9318bbee1a26e959b2526ac7cf7045dc906147f2", license: "Apache-2.0",
    scope: "Jackson parser boundaries, adversarial requests, legitimate request compatibility, tests, and Maven module isolation",
  },
];

function rawUrl(repository, revision, path) {
  return `https://raw.githubusercontent.com/${repository.replace(/^https:\/\/github\.com\//, "")}/${revision}/${path}`;
}
function sha256(buffer) { return createHash("sha256").update(buffer).digest("hex"); }
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
async function writeBuffer(path, data) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, data); }

async function main() {
  const licenseCache = new Map();
  const frozenSkills = [];
  for (const skill of skills) {
    const source = repositories[skill.source];
    const skillUrl = rawUrl(source.repository, source.revision, skill.path);
    const raw = await fetchBuffer(skillUrl);
    const relRoot = `skills/${skill.name}`;
    await writeBuffer(resolve(SOURCE_ROOT, relRoot, "raw/SKILL.md"), raw);
    await writeBuffer(resolve(SOURCE_ROOT, relRoot, "adapted/SKILL.md"), raw);
    const resourceFiles = [];
    for (const resourcePath of skill.resourcePaths ?? []) {
      const resource = await fetchBuffer(rawUrl(source.repository, source.revision, resourcePath));
      const localPath = resourcePath.split("/").slice(-2).join("/");
      await writeBuffer(resolve(SOURCE_ROOT, relRoot, "raw", localPath), resource);
      await writeBuffer(resolve(SOURCE_ROOT, relRoot, "adapted", localPath), resource);
      resourceFiles.push({ upstreamPath: resourcePath, localPath, sha256: sha256(resource) });
    }
    const licensePath = skill.licensePath ?? source.licensePath;
    const licenseKey = `${skill.source}:${licensePath}`;
    let license = licenseCache.get(licenseKey);
    if (!license) {
      const data = await fetchBuffer(rawUrl(source.repository, source.revision, licensePath));
      license = { data, sha256: sha256(data) };
      licenseCache.set(licenseKey, license);
    }
    await writeBuffer(resolve(SOURCE_ROOT, relRoot, "LICENSE.txt"), license.data);
    const rawSha256 = sha256(raw);
    const manifest = [{ path: "SKILL.md", sha256: rawSha256 }, ...resourceFiles.map((item) => ({ path: item.localPath, sha256: item.sha256 }))];
    const sourceRecord = {
      schema_version: "task1.skill_source_lock.v1", team_id: TEAM, asset_id: skill.assetId, name: skill.name,
      repository: source.repository, commit_sha: source.revision, path: skill.path, license: source.license,
      license_path: licensePath, license_sha256: license.sha256, raw_file_sha256: rawSha256, adapted_file_sha256: rawSha256,
      package_sha256: sha256(Buffer.from(canonicalize(manifest), "utf8")), resource_files: resourceFiles,
      adaptation: { kind: "registry_metadata_only", technical_body_changed: false, allowed_changes: ["listing description", "use_when", "do_not_use_when"], content_diff_sha256: sha256(Buffer.from("", "utf8")) },
      frozen_at: FROZEN_AT,
    };
    await writeFile(resolve(SOURCE_ROOT, relRoot, "source.json"), `${JSON.stringify(sourceRecord, null, 2)}\n`, "utf8");
    await writeFile(resolve(SOURCE_ROOT, relRoot, "ADAPTATION.md"), "# Adaptation record\n\nThe imported SKILL.md and resources are byte-identical to the frozen upstream files. Only registry listing description, `use_when`, and `do_not_use_when` metadata are adapted; the technical body is unchanged.\n", "utf8");
    frozenSkills.push({ ...skill, ...sourceRecord, sourceUrl: skillUrl, manifest });
  }

  const inputPack = {
    schema_version: "task1.team_input_pack.v1", build_id: "build-02", stage: "DS03", team_id: TEAM, split: "dev", frozen_at: FROZEN_AT,
    production_contract: {
      memory: { positive_count: 6, search_first_count: 4, direct_first_count: 2, allowed_routes: [["tdai_memory_search"], ["tdai_atomic_query"], ["tdai_conversation_search"], ["tdai_conversation_search", "tdai_conversation_query"], ["tdai_read_scene"]] },
      skill: { positive_count: 6, routes: { listed_direct: { count: 2, sequence: ["skill_view"] }, team_search: { count: 3, sequence: ["skill_search", "skill_view_by_id"] }, listed_resource: { count: 1, sequence: ["skill_view", "skill_files_read"] } } },
      knowledge: { positive_count: 3, sequence: ["knowledge_tools_list", "knowledge_tools_call"], fixed_resource_count: 3 },
      pair_negative_count: 15, natural_negative_count: 10,
      provider_forbidden_terms: ["gold", "targetAssetIds", "pairId", "informationGap", "knowledge_id", "/memory-bridge/", "/skill-bridge/", "/tools/list", "/tools/call"],
    },
    identities: { active_agent_id: "agent-task1-t04-general", asset_agent_ids: ["agent-task1-t04-assets-a", "agent-task1-t04-assets-b"], user_id: "user-task1-t04-eval", space_id: "space-task1-engineering", snapshot_id: "snapshot-task1-dev-v1" },
    project_streams: projectStreams,
    asset_targets: {
      memory: { l0_sessions: 10, l0_messages_per_session: [12, 20], l1_memories: 16, l2_scenes: 5, l3_profiles: 1 },
      skills: { total: frozenSkills.length, bound_to_active: frozenSkills.filter((item) => item.listed).map((item) => item.assetId) },
      knowledge: [
        { assetId: "T04-KNOW-PETCLINIC-CODEGRAPH", type: "code_graph", projectId: "T04-PROJECT-PETCLINIC", toolName: "search" },
        { assetId: "T04-KNOW-GOOGLE-AUTO-CODEGRAPH", type: "code_graph", projectId: "T04-PROJECT-GOOGLE-AUTO", toolName: "search" },
        { assetId: "T04-KNOW-BACKEND-MIGRATION-WIKI", type: "wiki", about: "Jakarta, RestClient, security, and Maven root-cause decision boundaries", toolName: "search" },
      ],
    },
    required_trial_pairs: [
      { family: "memory", route: ["tdai_conversation_search"], projectId: "T04-PROJECT-PETCLINIC" },
      { family: "skill", route: ["skill_search", "skill_view_by_id"], targetAssetId: "T04-SKILL-MAVEN-DEPENDENCY" },
      { family: "knowledge", route: ["knowledge_tools_list", "knowledge_tools_call"], targetAssetId: "T04-KNOW-GOOGLE-AUTO-CODEGRAPH" },
    ],
    final_positive_plan: {
      memory: [
        { id: "MEM-01", route: ["tdai_conversation_search"], target: "T04-L0-PETCLINIC-NAMESPACE", project: "PetClinic" },
        { id: "MEM-02", route: ["tdai_memory_search"], target: "T04-L1-RESTCLIENT-PARITY", project: "REST consumer" },
        { id: "MEM-03", route: ["tdai_conversation_search", "tdai_conversation_query"], target: "T04-L0-MAVEN-PLUGIN-DIAGNOSIS", project: "Google Auto" },
        { id: "MEM-04", route: ["tdai_memory_search"], target: "T04-L1-DRUID-SECURITY-BOUNDARY", project: "Druid" },
        { id: "MEM-05", route: ["tdai_atomic_query"], target: "T04-L1-MAVEN-DEPENDENCY-CONVERGENCE", project: "Google Auto" },
        { id: "MEM-06", route: ["tdai_read_scene"], target: "T04-L2-SPRING-MIGRATION-BOUNDARIES", project: "PetClinic" },
      ],
      skill: [
        { id: "SKILL-01", route: ["skill_view"], target: "T04-SKILL-JAKARTA", project: "PetClinic" },
        { id: "SKILL-02", route: ["skill_view"], target: "T04-SKILL-RESTCLIENT", project: "REST consumer" },
        { id: "SKILL-03", route: ["skill_search", "skill_view_by_id"], target: "T04-SKILL-MAVEN-DEPENDENCY", project: "Google Auto" },
        { id: "SKILL-04", route: ["skill_search", "skill_view_by_id"], target: "T04-SKILL-MAVEN-LIFECYCLE", project: "Google Auto" },
        { id: "SKILL-05", route: ["skill_search", "skill_view_by_id"], target: "T04-SKILL-MAVEN-PLUGIN", project: "Google Auto" },
        { id: "SKILL-06", route: ["skill_view", "skill_files_read"], target: "T04-SKILL-SPRING-TESTING", resource: "references/restclienttest.md", project: "REST consumer" },
      ],
      knowledge: [
        { id: "KNOW-01", target: "T04-KNOW-PETCLINIC-CODEGRAPH", project: "PetClinic", toolName: "search" },
        { id: "KNOW-02", target: "T04-KNOW-GOOGLE-AUTO-CODEGRAPH", project: "Google Auto", toolName: "search" },
        { id: "KNOW-03", target: "T04-KNOW-BACKEND-MIGRATION-WIKI", project: "backend migration", toolName: "search" },
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
  await writeFile(resolve(SOURCE_ROOT, "README.md"), "# T04 frozen source material\n\nAll formal Skill packages here are frozen from the repositories, commits, paths, and licenses in each `source.json`. Raw and adapted technical bodies are byte-identical; only registry routing metadata is adapted. No upstream dependencies or tests were run.\n", "utf8");
  console.log(JSON.stringify({ team: TEAM, skills: frozenSkills.length, inputPackSha256: inputPack.input_pack_sha256 }, null, 2));
}

await main();
