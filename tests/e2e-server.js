import { createE2EServer } from "./support/testServer.js";

const port = Number(process.env.PORT || 3100);

const { server } = await createE2EServer(port);

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
