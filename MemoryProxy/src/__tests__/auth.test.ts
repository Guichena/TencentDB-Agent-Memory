import { afterEach, describe, expect, it, vi } from "vitest";

import { initAuth, verifyUserKey } from "../auth.js";

afterEach(() => {
  initAuth({ enabled: false, url: "", timeoutMs: 0 });
  vi.unstubAllGlobals();
});

describe("auth service client", () => {
  it("authenticates to the protected MemoryCore gateway with the configured service token", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer local-core-service-token");
      expect(headers.get("x-tdai-service-id")).toBe("runtime-space");
      expect(headers.get("x-tdai-user-key")).toBeNull();
      expect(JSON.parse(String(init?.body))).toEqual({ user_key: "evaluation-user-key" });
      return new Response(JSON.stringify({
        code: 0,
        data: { valid: true, user: { user_id: "runtime-user" } },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchImpl);
    initAuth(
      { enabled: true, url: "http://memory-core.test", timeoutMs: 2_000 },
      "local-core-service-token",
    );

    await expect(verifyUserKey("evaluation-user-key", "runtime-space")).resolves.toEqual({
      userId: "runtime-user",
      rejected: false,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
