import { createApp } from "./app.mjs";
const app = await createApp();
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
try {
  await app.listen({
    port: Number(process.env.PORT || 3000),
    host: process.env.HOST || "0.0.0.0",
  });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
