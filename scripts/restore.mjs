import {
  existsSync,
  readFileSync,
  cpSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { fileManifest } from "./backup.mjs";
import { dataDirectory } from "./maintenance.mjs";
export function restoreBackup(source, dir) {
  if (
    source === dir ||
    source.startsWith(dir + "/") ||
    dir.startsWith(source + "/")
  )
    throw new Error("Use diretórios separados para backup e dados.");
  if (existsSync(dir) && readdirSync(dir).length)
    throw new Error(
      "A restauração exige um diretório de dados vazio. Preserve os dados atuais em outro volume.",
    );
  const manifest = JSON.parse(
    readFileSync(join(source, "manifest.json"), "utf8"),
  );
  if (manifest.version !== 1)
    throw new Error("Formato de backup desconhecido.");
  const actual = fileManifest(source);
  delete actual["manifest.json"];
  if (
    JSON.stringify(Object.entries(actual).sort()) !==
    JSON.stringify(Object.entries(manifest.files).sort())
  )
    throw new Error("Backup incompleto ou alterado; restauração cancelada.");
  const test = new DatabaseSync(join(source, "space.sqlite"), {
    readOnly: true,
  });
  try {
    if (test.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
      throw new Error("O banco não passou na verificação de integridade.");
  } finally {
    test.close();
  }
  mkdirSync(dir, { recursive: true });
  try {
    cpSync(join(source, "space.sqlite"), join(dir, "space.sqlite"));
    cpSync(join(source, "uploads"), join(dir, "uploads"), { recursive: true });
  } catch (e) {
    rmSync(join(dir, "space.sqlite"), { force: true });
    rmSync(join(dir, "uploads"), { recursive: true, force: true });
    throw e;
  }
  console.log("Backup restaurado. Inicie a aplicação para continuar.");
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (!process.argv[2]) throw new Error("Informe o diretório do backup.");
  restoreBackup(resolve(process.argv[2]), dataDirectory());
}
