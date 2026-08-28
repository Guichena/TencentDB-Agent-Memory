import { CASES } from "./w01-proxy-prompt.cases.js";
import { CONVERSATIONS } from "./w01-proxy-prompt.conversations.js";
import {
  KNOWLEDGE,
  MEMORIES,
  PROFILE_L3,
  PROJECTS,
  SCENES,
  SKILLS,
} from "./w01-proxy-prompt.assets.js";
import type { World } from "./world-schema.js";

export const W01: World = {
  worldId: "W01",
  name: "MemoryProxy 与 Prompt 优化",
  split: "dev",
  description: "A MemoryProxy prompt-optimization team snapshot with GRPO training, React Native and Spark ETL as neighbouring sub-scenes.",
  defaultProject: "proxy-prompt",
  projects: PROJECTS,
  profileL3: PROFILE_L3,
  memories: MEMORIES,
  conversations: CONVERSATIONS,
  scenes: SCENES,
  skills: SKILLS,
  knowledge: KNOWLEDGE,
  cases: CASES,
};
