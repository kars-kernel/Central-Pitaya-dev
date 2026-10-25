import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import staticPlugin from "@fastify/static";
import { hash, verify, Algorithm } from "@node-rs/argon2";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  createReadStream,
} from "node:fs";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { resolve, join } from "node:path";
import { z, ZodError } from "zod";
import { openDatabase, transaction } from "./db.mjs";

export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const title = z.string().trim().min(1, "Informe um título.").max(200);
const id = z.string().min(1).max(200);
const text = z.string().max(50000).default("");
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T12:00:00Z");
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Data inválida.");
const safeUrl = z
  .string()
  .max(4096)
  .refine(
    (v) =>
      !v ||
      (() => {
        try {
          return ["https:", "http:"].includes(new URL(v).protocol);
        } catch {
          return false;
        }
      })(),
    "Use um endereço HTTP ou HTTPS.",
  )
  .default("");
const subjectSchema = z.object({
  title,
  description: text,
  color: z
    .string()
    .regex(/^#[a-fA-F0-9]{6}$/)
    .default("#b8c99b"),
  archived: z.boolean().default(false),
});
const pathSchema = z.object({
  subject_id: id,
  title,
  description: text,
  type: z.enum(["modules", "map"]),
  archived: z.boolean().default(false),
});
const stepSchema = z.object({
  title,
  module_id: id.nullable().default(null),
  status: z
    .enum(["not_started", "in_progress", "completed"])
    .default("not_started"),
  position: z.number().int().nonnegative().default(0),
  x: z.number().finite().default(0),
  y: z.number().finite().default(0),
});
const sessionSchema = z.object({
  subject_id: id,
  path_id: id.nullable().default(null),
  step_id: id.nullable().default(null),
  date: date.refine(
    (v) => v <= today(),
    "Não é possível registrar estudo no futuro.",
  ),
  minutes: z.number().int().min(1).max(1440),
  notes: text,
});
const materialSchema = z
  .object({
    title,
    author: z.string().max(300).default(""),
    description: text,
    type: z.enum(["exercises", "book", "paper"]),
    url: safeUrl,
    file_id: id.nullable().default(null),
    tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
    subject_ids: z.array(id).max(100).default([]),
  })
  .refine((v) => v.url || v.file_id, "Adicione um arquivo ou link.");
const itemSchema = z.object({
  id: id.optional(),
  title,
  type: z.enum(["estudos", "treinos", "lembretes", "eventos"]),
  date,
  time: z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^$/)
    .default(""),
  notes: text,
  done: z.boolean().default(false),
});
const tokenHash = (v) => createHash("sha256").update(v).digest("hex");
export const passwordHash = (password) =>
  hash(password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
const fail = (status, message) => {
  throw Object.assign(new Error(message), { statusCode: status });
};
const noteTypes = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "codeBlock",
  "hardBreak",
  "horizontalRule",
  "image",
  "inlineMath",
  "blockMath",
]);
function validateDocument(doc) {
  let count = 0;
  const visit = (node, depth = 0) => {
    if (
      ++count > 30000 ||
      depth > 40 ||
      !node ||
      typeof node !== "object" ||
      !noteTypes.has(node.type)
    )
      fail(400, "Documento de anotações inválido.");
    if (node.type === "text" && typeof node.text !== "string")
      fail(400, "Texto inválido.");
    if (
      node.type === "image" &&
      !/^\/api\/files\/[a-zA-Z0-9-]+$/.test(node.attrs?.src || "")
    )
      fail(400, "Imagens devem ser enviadas ao servidor.");
    if (node.marks) {
      if (!Array.isArray(node.marks)) fail(400, "Formatação inválida.");
      for (const mark of node.marks) {
        if (
          !["bold", "italic", "strike", "code", "underline", "link"].includes(
            mark.type,
          )
        )
          fail(400, "Formatação inválida.");
        if (
          mark.type === "link" &&
          !safeUrl.safeParse(mark.attrs?.href).success
        )
          fail(400, "Link inválido.");
      }
    }
    if (node.content) {
      if (!Array.isArray(node.content)) fail(400, "Blocos inválidos.");
      node.content.forEach((n) => visit(n, depth + 1));
    }
  };
  if (doc?.type !== "doc") fail(400, "Documento inválido.");
  visit(doc);
}

export async function createApp(options = {}) {
  const dataDir = resolve(options.dataDir || process.env.DATA_DIR || "data");
  const secure = options.secureCookies ?? process.env.COOKIE_SECURE !== "false";
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 5 * 1024 * 1024,
    trustProxy: process.env.TRUST_PROXY === "true",
  });
  mkdirSync(join(dataDir, "uploads"), { recursive: true });
  const lock = join(dataDir, "server.lock");
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, "utf8"));
    if (pid !== process.pid) {
      try {
        process.kill(pid, 0);
        fail(503, "Outra instância está usando este diretório.");
      } catch (e) {
        if (e.statusCode) throw e;
        if (e.code !== "ESRCH") throw e;
      }
    }
  }
  writeFileSync(lock, String(process.pid));
  const db = openDatabase(dataDir);
  app.decorate("db", db);
  app.decorate("dataDir", dataDir);
  app.addHook("onClose", async () => {
    db.close();
    rmSync(lock, { force: true });
  });
  if (!db.prepare("SELECT id FROM admin WHERE id=1").get()) {
    const password =
      options.password ||
      (process.env.ADMIN_PASSWORD_FILE
        ? readFileSync(process.env.ADMIN_PASSWORD_FILE, "utf8").trim()
        : process.env.ADMIN_PASSWORD);
    if (!password || password.length < 12) {
      await app.close();
      throw new Error(
        "Defina ADMIN_PASSWORD (ou ADMIN_PASSWORD_FILE) com pelo menos 12 caracteres.",
      );
    }
    db.prepare("INSERT INTO admin VALUES(1,?,?)").run(
      options.username || process.env.ADMIN_USERNAME || "admin",
      await passwordHash(password),
    );
  }
  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 5 },
  });
  await app.register(rateLimit, { global: false });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError)
      return reply
        .code(400)
        .send({ message: error.issues[0]?.message || "Dados inválidos." });
    if (
      error.code?.startsWith("FST_REQ_FILE") ||
      error.code === "FST_FILES_LIMIT"
    )
      return reply
        .code(413)
        .send({ message: "Envie um arquivo de até 25 MB." });
    if (
      error.code?.startsWith("ERR_SQLITE") ||
      String(error.message).includes("constraint failed")
    ) {
      request.log.error(error);
      return reply.code(400).send({
        message: "O registro contém uma referência inválida ou duplicada.",
      });
    }
    const status = error.statusCode || 500;
    if (status >= 500) request.log.error(error);
    reply.code(status).send({
      message:
        status >= 500 ? "Não foi possível concluir a operação." : error.message,
    });
  });
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "same-origin")
      .header("X-Frame-Options", "SAMEORIGIN");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'self'; base-uri 'self'; frame-ancestors 'self'",
    );
    const route = req.routeOptions.url || "";
    if (!route.startsWith("/api/")) return;
    reply.header("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (req.headers["x-app-request"] !== "1" ||
        req.headers["sec-fetch-site"] === "cross-site")
    )
      fail(403, "Origem da solicitação inválida.");
    if (route === "/api/auth/login" || route === "/api/health") return;
    const raw = req.cookies.space_session;
    if (
      !raw ||
      !db
        .prepare(
          "SELECT token_hash FROM auth_sessions WHERE token_hash=? AND expires>?",
        )
        .get(tokenHash(raw), Date.now())
    )
      fail(401, "Entre para continuar.");
  });
  const one = (table, key, field = "id") =>
    db.prepare(`SELECT * FROM ${table} WHERE ${field}=?`).get(key) ||
    fail(404, "Registro não encontrado.");
  const path = (key) => one("paths", key);
  const material = (key) => {
    const m = one("materials", key);
    return {
      ...m,
      tags: JSON.parse(m.tags),
      subject_ids: db
        .prepare("SELECT subject_id FROM material_subjects WHERE material_id=?")
        .all(key)
        .map((x) => x.subject_id),
      file: m.file_id ? one("files", m.file_id) : null,
      usages: db
        .prepare(
          "SELECT s.id, s.title, s.path_id, p.title AS path_title FROM step_materials sm JOIN steps s ON s.id=sm.step_id JOIN paths p ON p.id=s.path_id WHERE sm.material_id=?",
        )
        .all(key),
    };
  };
  const step = (key) => {
    const s = one("steps", key);
    return {
      ...s,
      material_ids: db
        .prepare("SELECT material_id FROM step_materials WHERE step_id=?")
        .all(key)
        .map((x) => x.material_id),
    };
  };
  const learningPath = (key) => {
    const p = path(key);
    const steps = db
      .prepare("SELECT id FROM steps WHERE path_id=? ORDER BY position,id")
      .all(key)
      .map((x) => step(x.id));
    return {
      ...p,
      total: steps.length,
      completed: steps.filter((s) => s.status === "completed").length,
      modules: db
        .prepare("SELECT * FROM modules WHERE path_id=? ORDER BY position,id")
        .all(key),
      steps,
      edges: db.prepare("SELECT * FROM edges WHERE path_id=?").all(key),
    };
  };
  app.get("/api/health", async () => ({ ok: true }));
  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const input = z
        .object({
          username: z.string().max(200),
          password: z.string().max(1024),
        })
        .parse(req.body);
      const admin = one("admin", 1);
      const valid = await verify(admin.password_hash, input.password);
      if (input.username !== admin.username || !valid)
        fail(401, "Usuário ou senha incorretos.");
      const token = randomBytes(32).toString("hex");
      db.prepare("DELETE FROM auth_sessions WHERE expires<=?").run(Date.now());
      db.prepare("INSERT INTO auth_sessions VALUES(?,?)").run(
        tokenHash(token),
        Date.now() + 7 * 86400000,
      );
      reply.setCookie("space_session", token, {
        httpOnly: true,
        secure,
        sameSite: "strict",
        path: "/",
        maxAge: 7 * 86400,
      });
      return { username: admin.username };
    },
  );
  app.get("/api/auth/me", async () => ({ username: one("admin", 1).username }));
  app.post("/api/auth/logout", async (req, reply) => {
    if (req.cookies.space_session)
      db.prepare("DELETE FROM auth_sessions WHERE token_hash=?").run(
        tokenHash(req.cookies.space_session),
      );
    reply.clearCookie("space_session", { path: "/" });
    return { ok: true };
  });

  app.get("/api/items", async () =>
    db
      .prepare("SELECT * FROM items ORDER BY date,time")
      .all()
      .map((i) => ({ ...i, done: !!i.done })),
  );
  app.post("/api/items", async (req, reply) => {
    const v = itemSchema.parse(req.body);
    const key = randomUUID();
    db.prepare("INSERT INTO items VALUES(?,?,?,?,?,?,?)").run(
      key,
      v.title,
      v.type,
      v.date,
      v.time,
      v.notes,
      +v.done,
    );
    reply.code(201);
    return { ...v, id: key };
  });
  app.patch("/api/items/:id", async (req) => {
    const old = one("items", req.params.id);
    const v = itemSchema.parse({ ...old, done: !!old.done, ...req.body });
    db.prepare(
      "UPDATE items SET title=?,type=?,date=?,time=?,notes=?,done=? WHERE id=?",
    ).run(v.title, v.type, v.date, v.time, v.notes, +v.done, old.id);
    return { ...v, id: old.id };
  });
  app.delete("/api/items/:id", async (req) => {
    one("items", req.params.id);
    db.prepare("DELETE FROM items WHERE id=?").run(req.params.id);
    return { ok: true };
  });
  app.post("/api/import", async (req) => {
    const list = z.array(itemSchema.extend({ id })).max(20000).parse(req.body);
    const imported = transaction(db, () => {
      let n = 0;
      const insert = db.prepare(
        "INSERT OR IGNORE INTO items VALUES(?,?,?,?,?,?,?)",
      );
      for (const v of list)
        n += Number(
          insert.run(v.id, v.title, v.type, v.date, v.time, v.notes, +v.done)
            .changes,
        );
      return n;
    });
    return { imported, skipped: list.length - imported };
  });
  app.get("/api/export", async () => ({
    version: 2,
    exported_at: new Date().toISOString(),
    items: db
      .prepare("SELECT * FROM items")
      .all()
      .map((i) => ({ ...i, done: !!i.done })),
    subjects: db.prepare("SELECT * FROM subjects").all(),
    paths: db
      .prepare("SELECT id FROM paths")
      .all()
      .map((p) => learningPath(p.id)),
    notes: db
      .prepare("SELECT * FROM notes")
      .all()
      .map((n) => ({ ...n, content: JSON.parse(n.content) })),
    sessions: db.prepare("SELECT * FROM study_sessions").all(),
    materials: db
      .prepare("SELECT id FROM materials")
      .all()
      .map((m) => material(m.id)),
  }));

  app.get("/api/subjects", async () =>
    db.prepare("SELECT * FROM subjects ORDER BY archived,title").all(),
  );
  app.post("/api/subjects", async (req, reply) => {
    const v = subjectSchema.parse(req.body);
    const key = randomUUID();
    db.prepare("INSERT INTO subjects VALUES(?,?,?,?,?)").run(
      key,
      v.title,
      v.description,
      v.color,
      +v.archived,
    );
    reply.code(201);
    return one("subjects", key);
  });
  app.patch("/api/subjects/:id", async (req) => {
    const old = one("subjects", req.params.id);
    const v = subjectSchema.parse({
      ...old,
      archived: !!old.archived,
      ...req.body,
    });
    db.prepare(
      "UPDATE subjects SET title=?,description=?,color=?,archived=? WHERE id=?",
    ).run(v.title, v.description, v.color, +v.archived, old.id);
    return one("subjects", old.id);
  });
  app.get("/api/paths", async () =>
    db
      .prepare(
        `SELECT p.*, (SELECT count(*) FROM steps WHERE path_id=p.id) AS total, (SELECT count(*) FROM steps WHERE path_id=p.id AND status='completed') AS completed FROM paths p ORDER BY p.archived,p.title`,
      )
      .all(),
  );
  app.post("/api/paths", async (req, reply) => {
    const v = pathSchema.parse(req.body);
    one("subjects", v.subject_id);
    const key = randomUUID();
    db.prepare("INSERT INTO paths VALUES(?,?,?,?,?,?)").run(
      key,
      v.subject_id,
      v.title,
      v.description,
      v.type,
      +v.archived,
    );
    reply.code(201);
    return learningPath(key);
  });
  app.get("/api/paths/:id", async (req) => learningPath(req.params.id));
  app.patch("/api/paths/:id", async (req) => {
    const old = path(req.params.id);
    const v = pathSchema.parse({
      ...old,
      archived: !!old.archived,
      ...req.body,
    });
    if (v.type !== old.type || v.subject_id !== old.subject_id)
      fail(400, "O formato e a matéria do caminho são fixos.");
    db.prepare(
      "UPDATE paths SET title=?,description=?,archived=? WHERE id=?",
    ).run(v.title, v.description, +v.archived, old.id);
    return learningPath(old.id);
  });
  app.post("/api/paths/:id/modules", async (req, reply) => {
    const p = path(req.params.id);
    if (p.type !== "modules") fail(400, "Este caminho usa um mapa.");
    const v = z.object({ title }).parse(req.body);
    const key = randomUUID();
    const pos = db
      .prepare(
        "SELECT coalesce(max(position),-1)+1 AS n FROM modules WHERE path_id=?",
      )
      .get(p.id).n;
    db.prepare("INSERT INTO modules VALUES(?,?,?,?)").run(
      key,
      p.id,
      v.title,
      pos,
    );
    reply.code(201);
    return one("modules", key);
  });
  app.patch("/api/modules/:id", async (req) => {
    const old = one("modules", req.params.id);
    const v = z.object({ title }).parse({ ...old, ...req.body });
    db.prepare("UPDATE modules SET title=? WHERE id=?").run(v.title, old.id);
    return one("modules", old.id);
  });
  app.put("/api/paths/:id/order", async (req) => {
    const p = path(req.params.id);
    if (p.type !== "modules") fail(400, "Mapas usam posições visuais.");
    const v = z
      .object({
        modules: z.array(id),
        steps: z.array(z.object({ id, module_id: id })),
      })
      .parse(req.body);
    const old = learningPath(p.id);
    if (
      v.modules.length !== old.modules.length ||
      new Set(v.modules).size !== v.modules.length ||
      old.modules.some((m) => !v.modules.includes(m.id)) ||
      v.steps.length !== old.steps.length ||
      new Set(v.steps.map((s) => s.id)).size !== v.steps.length ||
      v.steps.some(
        (s) =>
          !v.modules.includes(s.module_id) ||
          !old.steps.some((o) => o.id === s.id),
      )
    )
      fail(400, "Ordem inválida ou desatualizada.");
    transaction(db, () => {
      v.modules.forEach((key, i) =>
        db.prepare("UPDATE modules SET position=? WHERE id=?").run(i, key),
      );
      v.steps.forEach((s, i) =>
        db
          .prepare("UPDATE steps SET position=?,module_id=? WHERE id=?")
          .run(i, s.module_id, s.id),
      );
    });
    return learningPath(p.id);
  });
  app.post("/api/paths/:id/steps", async (req, reply) => {
    const p = path(req.params.id);
    const v = stepSchema.parse(req.body);
    if (
      p.type === "modules" &&
      (!v.module_id || one("modules", v.module_id).path_id !== p.id)
    )
      fail(400, "Selecione um módulo deste caminho.");
    if (p.type === "map" && v.module_id)
      fail(400, "Tópicos do mapa não pertencem a módulos.");
    const key = randomUUID();
    const pos = db
      .prepare(
        "SELECT coalesce(max(position),-1)+1 AS n FROM steps WHERE path_id=?",
      )
      .get(p.id).n;
    transaction(db, () => {
      db.prepare("INSERT INTO steps VALUES(?,?,?,?,?,?,?,?)").run(
        key,
        p.id,
        v.module_id,
        v.title,
        v.status,
        pos,
        v.x,
        v.y,
      );
      db.prepare("INSERT INTO notes(step_id) VALUES(?)").run(key);
    });
    reply.code(201);
    return step(key);
  });
  app.get("/api/steps/:id", async (req) => step(req.params.id));
  app.patch("/api/steps/:id", async (req) => {
    const old = one("steps", req.params.id);
    const p = path(old.path_id);
    const v = stepSchema.parse({ ...old, ...req.body });
    if (
      p.type === "modules" &&
      (!v.module_id || one("modules", v.module_id).path_id !== p.id)
    )
      fail(400, "Módulo inválido.");
    if (p.type === "map" && v.module_id) fail(400, "Módulo inválido.");
    db.prepare(
      "UPDATE steps SET title=?,status=?,module_id=?,x=?,y=? WHERE id=?",
    ).run(v.title, v.status, v.module_id, v.x, v.y, old.id);
    return step(old.id);
  });
  app.post("/api/paths/:id/edges", async (req, reply) => {
    const p = path(req.params.id);
    if (p.type !== "map") fail(400, "Conexões pertencem a mapas.");
    const v = z.object({ source: id, target: id }).parse(req.body);
    if (v.source === v.target)
      fail(400, "Um tópico não pode apontar para si mesmo.");
    if (
      one("steps", v.source).path_id !== p.id ||
      one("steps", v.target).path_id !== p.id
    )
      fail(400, "Os tópicos devem pertencer a este mapa.");
    if (
      db
        .prepare("SELECT id FROM edges WHERE source=? AND target=?")
        .get(v.source, v.target)
    )
      fail(409, "Esta conexão já existe.");
    const edges = db
      .prepare("SELECT source,target FROM edges WHERE path_id=?")
      .all(p.id);
    const visited = new Set();
    const stack = [v.target];
    while (stack.length) {
      const n = stack.pop();
      if (n === v.source) fail(400, "A conexão criaria um ciclo.");
      if (visited.has(n)) continue;
      visited.add(n);
      for (const e of edges) if (e.source === n) stack.push(e.target);
    }
    const key = randomUUID();
    db.prepare("INSERT INTO edges VALUES(?,?,?,?)").run(
      key,
      p.id,
      v.source,
      v.target,
    );
    reply.code(201);
    return one("edges", key);
  });
  app.delete("/api/edges/:id", async (req) => {
    one("edges", req.params.id);
    db.prepare("DELETE FROM edges WHERE id=?").run(req.params.id);
    return { ok: true };
  });

  app.get("/api/steps/:id/note", async (req) => {
    const n = one("notes", req.params.id, "step_id");
    return { ...n, content: JSON.parse(n.content) };
  });
  app.put("/api/steps/:id/note", async (req, reply) => {
    const v = z
      .object({
        revision: z.number().int().nonnegative(),
        content: z.record(z.string(), z.unknown()),
      })
      .parse(req.body);
    validateDocument(v.content);
    one("notes", req.params.id, "step_id");
    const result = db
      .prepare(
        "UPDATE notes SET content=?,revision=revision+1,updated_at=? WHERE step_id=? AND revision=?",
      )
      .run(
        JSON.stringify(v.content),
        new Date().toISOString(),
        req.params.id,
        v.revision,
      );
    if (!result.changes) {
      const current = one("notes", req.params.id, "step_id");
      return reply.code(409).send({
        message:
          "Esta nota foi alterada em outra aba ou dispositivo. Seu rascunho foi preservado.",
        current: { ...current, content: JSON.parse(current.content) },
      });
    }
    const n = one("notes", req.params.id, "step_id");
    return { ...n, content: JSON.parse(n.content) };
  });
  app.get("/api/sessions", async (req) => {
    const year = z.coerce
      .number()
      .int()
      .min(1900)
      .max(9999)
      .optional()
      .parse(req.query.year);
    return db
      .prepare(
        `SELECT * FROM study_sessions ${year ? "WHERE date>=? AND date<=?" : ""} ORDER BY date DESC,id`,
      )
      .all(...(year ? [`${year}-01-01`, `${year}-12-31`] : []));
  });
  const validateSession = (v) => {
    one("subjects", v.subject_id);
    if (v.path_id && path(v.path_id).subject_id !== v.subject_id)
      fail(400, "O caminho não pertence à matéria.");
    if (
      v.step_id &&
      (!v.path_id || one("steps", v.step_id).path_id !== v.path_id)
    )
      fail(400, "A etapa não pertence ao caminho.");
  };
  app.post("/api/sessions", async (req, reply) => {
    const v = sessionSchema.parse(req.body);
    validateSession(v);
    const key = randomUUID();
    db.prepare("INSERT INTO study_sessions VALUES(?,?,?,?,?,?,?)").run(
      key,
      v.subject_id,
      v.path_id,
      v.step_id,
      v.date,
      v.minutes,
      v.notes,
    );
    reply.code(201);
    return one("study_sessions", key);
  });
  app.put("/api/sessions/:id", async (req) => {
    one("study_sessions", req.params.id);
    const v = sessionSchema.parse(req.body);
    validateSession(v);
    db.prepare(
      "UPDATE study_sessions SET subject_id=?,path_id=?,step_id=?,date=?,minutes=?,notes=? WHERE id=?",
    ).run(
      v.subject_id,
      v.path_id,
      v.step_id,
      v.date,
      v.minutes,
      v.notes,
      req.params.id,
    );
    return one("study_sessions", req.params.id);
  });
  app.delete("/api/sessions/:id", async (req) => {
    one("study_sessions", req.params.id);
    db.prepare("DELETE FROM study_sessions WHERE id=?").run(req.params.id);
    return { ok: true };
  });
  app.get("/api/activity", async (req) => {
    const year = z.coerce
      .number()
      .int()
      .min(1900)
      .max(9999)
      .parse(req.query.year || today().slice(0, 4));
    const days = db
      .prepare(
        "SELECT date,sum(minutes) AS minutes,count(*) AS sessions FROM study_sessions WHERE date>=? AND date<=? GROUP BY date ORDER BY date",
      )
      .all(`${year}-01-01`, `${year}-12-31`);
    return {
      year,
      days,
      active_days: days.length,
      minutes: days.reduce((n, d) => n + Number(d.minutes), 0),
      paths_in_progress: db
        .prepare(
          "SELECT count(*) AS n FROM paths p JOIN subjects sub ON sub.id=p.subject_id WHERE p.archived=0 AND sub.archived=0 AND EXISTS(SELECT 1 FROM steps WHERE path_id=p.id AND status<>'not_started') AND EXISTS(SELECT 1 FROM steps WHERE path_id=p.id AND status<>'completed')",
        )
        .get().n,
    };
  });

  app.get("/api/materials", async () =>
    db
      .prepare("SELECT id FROM materials ORDER BY title")
      .all()
      .map((m) => material(m.id)),
  );
  app.get("/api/materials/:id", async (req) => material(req.params.id));
  const saveMaterial = (key, v, create) =>
    transaction(db, () => {
      for (const subject of v.subject_ids) one("subjects", subject);
      if (v.file_id) one("files", v.file_id);
      if (create)
        db.prepare("INSERT INTO materials VALUES(?,?,?,?,?,?,?,?)").run(
          key,
          v.title,
          v.author,
          v.description,
          v.type,
          v.url,
          v.file_id,
          JSON.stringify([...new Set(v.tags)]),
        );
      else
        db.prepare(
          "UPDATE materials SET title=?,author=?,description=?,type=?,url=?,file_id=?,tags=? WHERE id=?",
        ).run(
          v.title,
          v.author,
          v.description,
          v.type,
          v.url,
          v.file_id,
          JSON.stringify([...new Set(v.tags)]),
          key,
        );
      db.prepare("DELETE FROM material_subjects WHERE material_id=?").run(key);
      for (const sub of new Set(v.subject_ids))
        db.prepare("INSERT INTO material_subjects VALUES(?,?)").run(key, sub);
      return material(key);
    });
  app.post("/api/materials", async (req, reply) => {
    const v = materialSchema.parse(req.body);
    const m = saveMaterial(randomUUID(), v, true);
    reply.code(201);
    return m;
  });
  app.put("/api/materials/:id", async (req) => {
    one("materials", req.params.id);
    return saveMaterial(req.params.id, materialSchema.parse(req.body), false);
  });
  app.delete("/api/materials/:id", async (req) => {
    one("materials", req.params.id);
    db.prepare("DELETE FROM materials WHERE id=?").run(req.params.id);
    return { ok: true };
  });
  app.put("/api/steps/:id/materials", async (req) => {
    one("steps", req.params.id);
    const v = z.object({ material_ids: z.array(id).max(500) }).parse(req.body);
    transaction(db, () => {
      for (const key of v.material_ids) one("materials", key);
      db.prepare("DELETE FROM step_materials WHERE step_id=?").run(
        req.params.id,
      );
      for (const key of new Set(v.material_ids))
        db.prepare("INSERT INTO step_materials VALUES(?,?)").run(
          req.params.id,
          key,
        );
    });
    return step(req.params.id);
  });
  app.post("/api/files", async (req, reply) => {
    const part = await req.file();
    if (!part) fail(400, "Selecione um arquivo.");
    const key = randomUUID(),
      target = join(dataDir, "uploads", key);
    try {
      await pipeline(part.file, createWriteStream(target, { flags: "wx" }));
      if (part.file.truncated) fail(413, "O arquivo deve ter até 25 MB.");
      const { statSync, openSync, readSync, closeSync } =
        await import("node:fs");
      const size = statSync(target).size;
      const bytes = Buffer.alloc(12),
        fd = openSync(target, "r");
      try {
        readSync(fd, bytes, 0, 12, 0);
      } finally {
        closeSync(fd);
      }
      const mime =
        bytes.subarray(0, 5).toString() === "%PDF-"
          ? "application/pdf"
          : bytes
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            ? "image/png"
            : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
              ? "image/jpeg"
              : bytes
                    .subarray(0, 6)
                    .toString()
                    .match(/^GIF8[79]a$/)
                ? "image/gif"
                : bytes.subarray(0, 4).toString() === "RIFF" &&
                    bytes.subarray(8, 12).toString() === "WEBP"
                  ? "image/webp"
                  : null;
      if (!mime) fail(400, "Envie um PDF ou imagem PNG, JPEG, GIF ou WebP.");
      const name =
        part.filename.replace(/[\r\n\x00-\x1f/\\]/g, "_").slice(0, 200) ||
        "arquivo";
      db.prepare("INSERT INTO files(id,name,mime,size) VALUES(?,?,?,?)").run(
        key,
        name,
        mime,
        size,
      );
      reply.code(201);
      return { ...one("files", key), url: `/api/files/${key}` };
    } catch (e) {
      rmSync(target, { force: true });
      throw e;
    }
  });
  app.get("/api/files/:id", async (req, reply) => {
    const f = one("files", req.params.id);
    const file = join(dataDir, "uploads", f.id);
    if (!existsSync(file)) fail(404, "Arquivo não encontrado no servidor.");
    const disposition = req.query.download === "1" ? "attachment" : "inline";
    reply
      .header("Content-Type", f.mime)
      .header(
        "Content-Disposition",
        `${disposition}; filename="arquivo"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      );
    return reply.send(createReadStream(file));
  });
  const dist = resolve(options.distDir || "build");
  if (existsSync(join(dist, "index.html"))) {
    await app.register(staticPlugin, { root: dist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/"))
        return reply.code(404).send({ message: "Endpoint não encontrado." });
      if (req.method !== "GET")
        return reply.code(404).send({ message: "Página não encontrada." });
      return reply.type("text/html").sendFile("index.html");
    });
  }
  return app;
}
