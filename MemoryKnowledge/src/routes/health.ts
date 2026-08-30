/**
 * Health check route.
 */

import { Hono } from "hono";

export interface HealthRouteOptions {
  readonly serverInstanceId: string;
}

export function createHealthRoutes(options: HealthRouteOptions): Hono {
  const app = new Hono();

  app.get("/health", (c) => {
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      serverInstanceId: options.serverInstanceId,
    });
  });

  return app;
}
