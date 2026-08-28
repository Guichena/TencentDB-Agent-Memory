import {
  MEMORIES,
  PROFILE_L3,
  PROJECTS,
  SCENES,
  SKILLS,
} from "./w02-jakarta-migration.assets.js";
import { CASES } from "./w02-jakarta-migration.cases.js";
import { CONVERSATIONS } from "./w02-jakarta-migration.conversations.js";
import { KNOWLEDGE } from "./w02-jakarta-migration.knowledge.js";
import type { World } from "./world-schema.js";

export const W02: World = {
  worldId: "W02",
  name: "Spring Boot / Jakarta 迁移",
  split: "dev",
  description: "A Spring Boot order service mid-Jakarta-migration, with a frozen legacy batch job, a payments API and an infra CLI as neighbouring sub-scenes.",
  defaultProject: "order-service",
  projects: PROJECTS,
  profileL3: PROFILE_L3,
  memories: MEMORIES,
  conversations: CONVERSATIONS,
  scenes: SCENES,
  skills: SKILLS,
  knowledge: KNOWLEDGE,
  cases: CASES,
};
