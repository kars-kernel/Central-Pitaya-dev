import { readFileSync } from "node:fs";
import { openDatabase, transaction } from "../server/db.mjs";
import { passwordHash } from "../server/app.mjs";
import { dataDirectory, requireStopped } from "./maintenance.mjs";
const dir = dataDirectory();
requireStopped(dir);
// Read from stdin or a secret file; never put the password in command arguments.
let password;
if (process.env.NEW_PASSWORD_FILE)
  password = readFileSync(process.env.NEW_PASSWORD_FILE, "utf8").trim();
else if (!process.stdin.isTTY) {
  const parts = [];
  for await (const chunk of process.stdin) parts.push(chunk);
  password = Buffer.concat(parts).toString().trim();
} else {
  process.stderr.write("Digite a nova senha (entrada oculta): ");
  process.stdin.setRawMode(true);
  password = await new Promise((resolve) => {
    let value = "";
    const handler = (chunk) => {
      for (const char of chunk.toString()) {
        if (char === "\u0003") {
          process.exit(130);
        }
        if (char === "\r" || char === "\n") {
          process.stdin.off("data", handler);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stderr.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u007f") {
          value = value.slice(0, -1);
        } else value += char;
      }
    };
    process.stdin.on("data", handler);
    process.stdin.resume();
  });
}
if (password.length < 12) throw new Error("Use pelo menos 12 caracteres.");
const db = openDatabase(dir);
const digest = await passwordHash(password);
try {
  transaction(db, () => {
    if (!db.prepare("SELECT id FROM admin WHERE id=1").get())
      throw new Error("Conta não encontrada.");
    db.prepare("UPDATE admin SET password_hash=? WHERE id=1").run(digest);
    db.prepare("DELETE FROM auth_sessions").run();
  });
  console.log("Senha atualizada. Todas as sessões foram encerradas.");
} finally {
  db.close();
}
