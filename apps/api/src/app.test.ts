import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "./app.js";

interface AppRouteLayer {
  route?: {
    path?: string;
    methods?: Record<string, boolean>;
  };
}

test("createApp registers the health route", () => {
  const app = createApp();
  const layers = app.router.stack as AppRouteLayer[];
  const healthLayer = layers.find((layer) => layer.route?.path === "/api/health");

  assert.ok(healthLayer, "Expected /api/health route to be registered");
  assert.equal(healthLayer?.route?.methods?.get, true);
});
