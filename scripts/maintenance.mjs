import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
export const dataDirectory = () => resolve(process.env.DATA_DIR || "data");
export function requireStopped(dir) {
  const lock = join(dir, "server.lock");
  if (existsSync(lock))
    throw new Error(
      "Pare a aplicação antes da manutenção. Se ela terminou abruptamente, confirme que está parada antes de remover server.lock.",
    );
  if (!existsSync(join(dir, "space.sqlite")))
    throw new Error("Banco não encontrado neste diretório.");
}
