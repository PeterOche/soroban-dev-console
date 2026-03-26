import cors from "cors";
import express from "express";
import { prisma } from "./lib/prisma.js";
import { rpcRouter } from "./routes/rpc.js";
import { verifyRouter } from "./routes/verify.js";
import { workspacesRouter } from "./routes/workspaces.js";

export function createApp() {
  const app = express();
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

  app.use((req, res, next) => {
    const origin = req.get("origin");
    if (origin && origin !== webOrigin) {
      res.status(403).json({
        error: "CORS origin not allowed"
      });
      return;
    }

    next();
  });

  app.use(
    cors({
      origin: webOrigin,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true
    })
  );
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.status(200).json({
      ok: true
    });
  });

  app.get("/api/workspaces", async (_req, res) => {
    try {
      const workspaces = await prisma.workspace.findMany({
        orderBy: {
          createdAt: "desc"
        }
      });

      res.status(200).json(workspaces);
    } catch (error) {
      console.error("Failed to load workspaces", error);
      res.status(500).json({
        error: "Failed to load workspaces"
      });
    }
  });

  app.use("/api/workspaces", workspacesRouter);
  app.use("/api/rpc", rpcRouter);
  app.use("/api/verify", verifyRouter);

  return app;
}
