import { describe, expect, it } from "vitest";

import { createHealthRoutes } from "../../../MemoryKnowledge/src/routes/health.js";

describe("MemoryKnowledge formal trace identity", () => {
  it("exposes the externally verifiable server instance id", async () => {
    const app = createHealthRoutes({ serverInstanceId: "knowledge-instance-a" });
    const response = await app.request("http://knowledge.test/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      serverInstanceId: "knowledge-instance-a",
    });
  });
});
