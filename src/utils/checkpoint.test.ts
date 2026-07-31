import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { CheckpointManager, type CheckpointRecalibrateSource } from "./checkpoint.js";

/** Seed a checkpoint with the given global counters (other fields get defaults). */
async function seedCheckpoint(dataDir: string, overrides: Record<string, unknown>): Promise<void> {
  const mgr = new CheckpointManager(dataDir);
  await mgr.write({
    last_captured_timestamp: 0,
    total_processed: 100,
    last_persona_at: 0,
    last_persona_time: "",
    request_persona_update: false,
    persona_update_reason: "",
    memories_since_last_persona: 0,
    scenes_processed: 3,
    runner_states: { s1: { last_captured_timestamp: 1, last_l1_cursor: 2, last_scene_name: "x" } },
    pipeline_states: { s1: { conversation_count: 5, last_extraction_time: "t", last_extraction_updated_time: "t", last_active_time: 3, l2_pending_l1_count: 2, warmup_threshold: 4, l2_last_extraction_time: "t" } },
    l0_conversations_count: 0,
    total_memories_extracted: 0,
    ...overrides,
  });
}

async function writeJsonl(baseDir: string, subDir: string, fileName: string, lines: string[]): Promise<void> {
  const dir = path.join(baseDir, subDir);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, fileName), lines.length > 0 ? `${lines.join("\n")}\n` : "", "utf-8");
}

describe("CheckpointManager.recalibrate", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ckpt-recalibrate-"));
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("decreases drifted counters to live store counts", async () => {
    await seedCheckpoint(dataDir, {
      l0_conversations_count: 50,
      total_memories_extracted: 45,
      memories_since_last_persona: 10,
    });

    const source: CheckpointRecalibrateSource = { countL0: () => 42, countL1: () => 20 };
    await new CheckpointManager(dataDir).recalibrate(source);

    const cp = await new CheckpointManager(dataDir).read();
    expect(cp.l0_conversations_count).toBe(42);
    expect(cp.total_memories_extracted).toBe(20);
    // 10 <= actual L1 (20) → unchanged
    expect(cp.memories_since_last_persona).toBe(10);
  });

  it("increases counters to live store counts", async () => {
    await seedCheckpoint(dataDir, {
      l0_conversations_count: 5,
      total_memories_extracted: 3,
    });

    const source: CheckpointRecalibrateSource = { countL0: () => 100, countL1: () => 80 };
    await new CheckpointManager(dataDir).recalibrate(source);

    const cp = await new CheckpointManager(dataDir).read();
    expect(cp.l0_conversations_count).toBe(100);
    expect(cp.total_memories_extracted).toBe(80);
  });

  it("clamps memories_since_last_persona down when L1 records were removed", async () => {
    await seedCheckpoint(dataDir, {
      total_memories_extracted: 45,
      memories_since_last_persona: 30,
    });

    const source: CheckpointRecalibrateSource = { countL0: () => 42, countL1: () => 12 };
    await new CheckpointManager(dataDir).recalibrate(source);

    const cp = await new CheckpointManager(dataDir).read();
    expect(cp.total_memories_extracted).toBe(12);
    expect(cp.memories_since_last_persona).toBe(12);
  });

  it("preserves unrelated checkpoint fields", async () => {
    await seedCheckpoint(dataDir, {
      l0_conversations_count: 50,
      total_memories_extracted: 45,
      total_processed: 999,
      scenes_processed: 7,
    });

    const source: CheckpointRecalibrateSource = { countL0: () => 10, countL1: () => 5 };
    await new CheckpointManager(dataDir).recalibrate(source);

    const cp = await new CheckpointManager(dataDir).read();
    expect(cp.total_processed).toBe(999);
    expect(cp.scenes_processed).toBe(7);
    expect(cp.runner_states.s1.last_l1_cursor).toBe(2);
    expect(cp.pipeline_states.s1.conversation_count).toBe(5);
  });

  it("is idempotent", async () => {
    await seedCheckpoint(dataDir, {
      l0_conversations_count: 50,
      total_memories_extracted: 45,
    });

    const source: CheckpointRecalibrateSource = { countL0: () => 42, countL1: () => 20 };
    const mgr = new CheckpointManager(dataDir);
    await mgr.recalibrate(source);
    await mgr.recalibrate(source);

    const cp = await mgr.read();
    expect(cp.l0_conversations_count).toBe(42);
    expect(cp.total_memories_extracted).toBe(20);
  });

  it("counts JSONL shard lines as fallback when no source is given", async () => {
    await seedCheckpoint(dataDir, {
      l0_conversations_count: 99,
      total_memories_extracted: 99,
    });
    await writeJsonl(dataDir, "conversations", "2026-07-01.jsonl", ["{\"a\":1}", "{\"a\":2}", ""]);
    await writeJsonl(dataDir, "conversations", "2026-07-02.jsonl", ["{\"a\":3}"]);
    await writeJsonl(dataDir, "records", "2026-07-01.jsonl", ["{\"r\":1}", "{\"r\":2}", "{\"r\":3}"]);
    // Non-JSONL files must be ignored
    await writeJsonl(dataDir, "records", "notes.txt", ["{\"r\":9}"]);

    await new CheckpointManager(dataDir).recalibrate();

    const cp = await new CheckpointManager(dataDir).read();
    expect(cp.l0_conversations_count).toBe(3);
    expect(cp.total_memories_extracted).toBe(3);
  });

  it("falls back to JSONL line counts when the store source throws", async () => {
    await seedCheckpoint(dataDir, {
      l0_conversations_count: 99,
      total_memories_extracted: 99,
    });
    await writeJsonl(dataDir, "conversations", "2026-07-01.jsonl", ["{\"a\":1}", "{\"a\":2}"]);
    await writeJsonl(dataDir, "records", "2026-07-01.jsonl", ["{\"r\":1}"]);

    const source: CheckpointRecalibrateSource = {
      countL0: () => { throw new Error("store down"); },
      countL1: () => Promise.reject(new Error("store down")),
    };
    await new CheckpointManager(dataDir).recalibrate(source);

    const cp = await new CheckpointManager(dataDir).read();
    expect(cp.l0_conversations_count).toBe(2);
    expect(cp.total_memories_extracted).toBe(1);
  });

  it("clamps NaN and negative counts to zero", async () => {
    await seedCheckpoint(dataDir, {
      l0_conversations_count: 50,
      total_memories_extracted: 45,
    });

    const source: CheckpointRecalibrateSource = { countL0: () => Number.NaN, countL1: () => -7 };
    await new CheckpointManager(dataDir).recalibrate(source);

    const cp = await new CheckpointManager(dataDir).read();
    expect(cp.l0_conversations_count).toBe(0);
    expect(cp.total_memories_extracted).toBe(0);
    expect(cp.memories_since_last_persona).toBe(0);
  });

  it("treats a missing JSONL directory as zero records", async () => {
    await seedCheckpoint(dataDir, {
      l0_conversations_count: 50,
      total_memories_extracted: 45,
    });

    await new CheckpointManager(dataDir).recalibrate();

    const cp = await new CheckpointManager(dataDir).read();
    expect(cp.l0_conversations_count).toBe(0);
    expect(cp.total_memories_extracted).toBe(0);
  });
});
