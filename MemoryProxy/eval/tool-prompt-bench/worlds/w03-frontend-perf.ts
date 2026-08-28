import {
  MEMORIES,
  PROFILE_L3,
  PROJECTS,
  SCENES,
  SKILLS,
} from "./w03-frontend-perf.assets.js";
import { CASES } from "./w03-frontend-perf.cases.js";
import { CONVERSATIONS } from "./w03-frontend-perf.conversations.js";
import { KNOWLEDGE } from "./w03-frontend-perf.knowledge.js";
import type { World } from "./world-schema.js";

export const W03: World = {
  worldId: "W03",
  name: "React/Three.js 前端性能",
  split: "test",
  description: "A React metrics console under performance work, with a Three.js viewer, a React Native shell and an edge gateway as neighbouring sub-scenes.",
  defaultProject: "web-console",
  projects: PROJECTS,
  profileL3: PROFILE_L3,
  memories: MEMORIES,
  conversations: CONVERSATIONS,
  scenes: SCENES,
  skills: SKILLS,
  knowledge: KNOWLEDGE,
  cases: CASES,
};
