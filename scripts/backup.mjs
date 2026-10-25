import { DatabaseSync, backup } from "node:sqlite";
import {
  mkdirSync,
  cpSync,
  writeFileSync,
  rmSync,
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dataDirectory, requireStopped } from "./maintenance.mjs";
export function fileManifest(dir) {
  const files = {};
  function walk(root, prefix = "") {
    for (const entry of readdirSync(root)) {
      const key = prefix + entry,
        abs = join(root, entry);
      if (statSync(abs).isDirectory()) walk(abs, key + "/");
      else
        files[key] = createHash("sha256")
          .update(readFileSync(abs))
          .digest("hex");
    }
  }
  walk(dir);
  return files;
}
export async function createBackup(dir, root) {
  requireStopped(dir);
  mkdirSync(root, { recursive: true });
  const target = join(
    root,
    new Date().toISOString().replace(/[:.]/g, "-") +
      "-" +
      Math.random().toString(36).slice(2, 7),
  );
  mkdirSync(target);
  const db = new DatabaseSync(join(dir, "space.sqlite"), { readOnly: true });
  try {
    await backup(db, join(target, "space.sqlite"));
    cpSync(join(dir, "uploads"), join(target, "uploads"), { recursive: true });
    writeFileSync(
      join(target, "manifest.json"),
      JSON.stringify(
        {
          version: 1,
          created_at: new Date().toISOString(),
          files: fileManifest(target),
        },
        null,
        2,
      ),
    );
    console.log("Backup criado: " + target);
    return target;
  } catch (e) {
    rmSync(target, { recursive: true, force: true });
    throw e;
  } finally {
    db.close();
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await createBackup(
    dataDirectory(),
    resolve(process.env.BACKUP_DIR || "backups"),
  );
