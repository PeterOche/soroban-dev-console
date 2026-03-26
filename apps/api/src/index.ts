import { prisma } from "./lib/prisma.js";
import { createApp } from "./app.js";

const app = createApp();
const port = 4000;

const server = app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});

const shutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down API server...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("beforeExit", async () => {
  await prisma.$disconnect();
});
