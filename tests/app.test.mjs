import test from "node:test";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, today } from "../server/app.mjs";
import { createBackup } from "../scripts/backup.mjs";
import { restoreBackup } from "../scripts/restore.mjs";
const password = "integration-test-password";
async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "meu-espaco-test-"));
  let app = await createApp({
    dataDir: dir,
    password,
    logger: false,
    secureCookies: false,
  });
  t.after(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { "x-app-request": "1" },
    payload: { username: "admin", password },
  });
  assert.equal(login.statusCode, 200);
  const cookie = "space_session=" + login.cookies[0].value;
  const request = async (method, url, payload) =>
    app.inject({
      method,
      url: "/api" + url,
      headers: { cookie, "x-app-request": "1" },
      ...(payload !== undefined ? { payload } : {}),
    });
  const ok = async (method, url, payload, status = 200) => {
    const r = await request(method, url, payload);
    assert.equal(r.statusCode, status, r.body);
    return r.json();
  };
  return {
    dir,
    get app() {
      return app;
    },
    set app(value) {
      app = value;
    },
    cookie,
    request,
    ok,
  };
}
const subject = (f, title = "Redes") =>
  f.ok("POST", "/subjects", { title }, 201);
const path = (f, s, type = "modules") =>
  f.ok("POST", "/paths", { subject_id: s.id, title: "Fundamentos", type }, 201);
const module = (f, p, title = "Introdução") =>
  f.ok("POST", `/paths/${p.id}/modules`, { title }, 201);
const step = (f, p, m, title = "Primeiro tópico") =>
  f.ok(
    "POST",
    `/paths/${p.id}/steps`,
    { title, module_id: m?.id || null },
    201,
  );

test("authentication, CSRF, cookies, logout and protected file endpoints", async (t) => {
  const f = await fixture(t);
  for (const url of ["/api/subjects", "/api/export", "/api/files/no-file"])
    assert.equal((await f.app.inject(url)).statusCode, 401);
  const noHeader = await f.app.inject({
    method: "POST",
    url: "/api/subjects",
    headers: { cookie: f.cookie },
    payload: { title: "A" },
  });
  assert.equal(noHeader.statusCode, 403);
  const crossSite = await f.app.inject({
    method: "POST",
    url: "/api/subjects",
    headers: {
      cookie: f.cookie,
      "x-app-request": "1",
      "sec-fetch-site": "cross-site",
    },
    payload: { title: "A" },
  });
  assert.equal(crossSite.statusCode, 403);
  const bad = await f.app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { "x-app-request": "1" },
    payload: { username: "admin", password: "wrong" },
  });
  assert.equal(bad.statusCode, 401);
  const login = await f.app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { "x-app-request": "1" },
    payload: { username: "admin", password },
  });
  assert.match(login.headers["set-cookie"], /HttpOnly/);
  assert.match(login.headers["set-cookie"], /SameSite=Strict/i);
  await f.ok("POST", "/auth/logout");
  assert.equal((await f.request("GET", "/subjects")).statusCode, 401);
});

test("module and step ordering, cross-path validation, progress, archives", async (t) => {
  const f = await fixture(t),
    s = await subject(f),
    p = await path(f, s),
    a = await module(f, p, "A"),
    b = await module(f, p, "B"),
    x = await step(f, p, a, "X"),
    y = await step(f, p, a, "Y");
  await f.ok("PUT", `/paths/${p.id}/order`, {
    modules: [b.id, a.id],
    steps: [
      { id: y.id, module_id: b.id },
      { id: x.id, module_id: a.id },
    ],
  });
  const detail = await f.ok("GET", `/paths/${p.id}`);
  assert.equal(detail.modules[0].id, b.id);
  assert.equal(detail.steps[0].id, y.id);
  assert.equal(detail.steps[0].module_id, b.id);
  await f.ok("PATCH", "/steps/" + x.id, { status: "in_progress" });
  assert.equal((await f.ok("GET", "/activity")).paths_in_progress, 1);
  await f.ok("PATCH", "/steps/" + x.id, { status: "completed" });
  assert.equal((await f.ok("GET", "/paths"))[0].completed, 1);
  await f.ok("PATCH", "/paths/" + p.id, { archived: true });
  assert.equal((await f.ok("GET", "/activity")).paths_in_progress, 0);
  assert.equal((await f.ok("GET", `/paths/${p.id}`)).steps.length, 2);
  assert.equal(
    (await f.request("PATCH", "/paths/" + p.id, { type: "map" })).statusCode,
    400,
  );
  const other = await path(f, s),
    otherModule = await module(f, other);
  assert.equal(
    (await f.request("PATCH", "/steps/" + x.id, { module_id: otherModule.id }))
      .statusCode,
    400,
  );
  assert.equal(
    (
      await f.request("PUT", `/paths/${p.id}/order`, {
        modules: [a.id, a.id],
        steps: [],
      })
    ).statusCode,
    400,
  );
});

test("maps support branches and merging, reject duplicates, loops and cross-map links", async (t) => {
  const f = await fixture(t),
    s = await subject(f),
    p = await path(f, s, "map");
  const nodes = [];
  for (let i = 0; i < 4; i++) nodes.push(await step(f, p, null, "Tópico " + i));
  const edge = async (a, b, status = 201) =>
    f.ok(
      "POST",
      `/paths/${p.id}/edges`,
      { source: nodes[a].id, target: nodes[b].id },
      status,
    );
  await edge(0, 1);
  await edge(0, 2);
  await edge(1, 3);
  await edge(2, 3);
  assert.equal(
    (
      await f.request("POST", `/paths/${p.id}/edges`, {
        source: nodes[0].id,
        target: nodes[1].id,
      })
    ).statusCode,
    409,
  );
  for (const [a, b] of [
    [0, 0],
    [3, 0],
    [3, 1],
  ])
    assert.equal(
      (
        await f.request("POST", `/paths/${p.id}/edges`, {
          source: nodes[a].id,
          target: nodes[b].id,
        })
      ).statusCode,
      400,
    );
  await f.ok("PATCH", "/steps/" + nodes[3].id, {
    status: "completed",
    x: 312.5,
    y: 402,
  });
  const d = await f.ok("GET", "/paths/" + p.id);
  assert.equal(d.steps.find((n) => n.id === nodes[3].id).x, 312.5);
  assert.equal(d.steps.find((n) => n.id === nodes[3].id).status, "completed");
  const other = await path(f, s, "map"),
    foreign = await step(f, other);
  assert.equal(
    (
      await f.request("POST", `/paths/${p.id}/edges`, {
        source: nodes[0].id,
        target: foreign.id,
      })
    ).statusCode,
    400,
  );
  await f.ok("DELETE", "/edges/" + d.edges[0].id);
  assert.equal((await f.ok("GET", "/paths/" + p.id)).edges.length, 3);
});

test("manual sessions aggregate by date, editable, deletable, validate real dates and associations", async (t) => {
  const f = await fixture(t),
    s = await subject(f),
    p = await path(f, s, "map"),
    node = await step(f, p);
  const session = await f.ok(
    "POST",
    "/sessions",
    {
      subject_id: s.id,
      path_id: p.id,
      step_id: node.id,
      date: "2024-02-29",
      minutes: 29,
    },
    201,
  );
  await f.ok(
    "POST",
    "/sessions",
    { subject_id: s.id, date: "2024-02-29", minutes: 31 },
    201,
  );
  let summary = await f.ok("GET", "/activity?year=2024");
  assert.equal(summary.minutes, 60);
  assert.equal(summary.active_days, 1);
  assert.equal(summary.days[0].sessions, 2);
  await f.ok("PUT", "/sessions/" + session.id, {
    subject_id: s.id,
    date: "2024-03-01",
    minutes: 120,
  });
  summary = await f.ok("GET", "/activity?year=2024");
  assert.equal(summary.minutes, 151);
  assert.equal(summary.active_days, 2);
  await f.ok("DELETE", "/sessions/" + session.id);
  assert.equal((await f.ok("GET", "/activity?year=2024")).minutes, 31);
  const second = await subject(f, "Outra");
  for (const v of [
    { date: "2023-02-29", minutes: 10 },
    { date: "2024-04-31", minutes: 10 },
    { date: "2999-01-01", minutes: 10 },
    { date: today(), minutes: 0 },
    { date: today(), minutes: 10, path_id: p.id, subject_id: second.id },
    { date: today(), minutes: 10, step_id: node.id },
  ])
    assert.equal(
      (await f.request("POST", "/sessions", { subject_id: s.id, ...v }))
        .statusCode,
      400,
    );
});

test("legacy import is atomic, idempotent, preserves planning, generic organizer functions", async (t) => {
  const f = await fixture(t);
  const items = [
    {
      id: "legacy-study",
      title: "Estudar cálculo",
      type: "estudos",
      date: "2024-02-29",
      notes: "Revisar",
      done: true,
    },
    {
      id: "legacy-workout",
      title: "Treino",
      type: "treinos",
      date: today(),
      time: "08:30",
    },
  ];
  assert.equal((await f.ok("POST", "/import", items)).imported, 2);
  assert.equal((await f.ok("POST", "/import", items)).skipped, 2);
  assert.equal(
    (await f.ok("GET", "/items")).find((i) => i.id === "legacy-study").done,
    true,
  );
  assert.equal((await f.ok("GET", "/activity?year=2024")).minutes, 0);
  const reminder = await f.ok(
    "POST",
    "/items",
    { title: "Lembrar", type: "lembretes", date: today() },
    201,
  );
  await f.ok("PATCH", "/items/" + reminder.id, { done: true });
  assert.equal(
    (await f.ok("GET", "/items")).find((i) => i.id === reminder.id).done,
    true,
  );
  const exported = await f.ok("GET", "/export");
  assert.equal((await f.ok("POST", "/import", exported.items)).skipped, 3);
  await f.ok("DELETE", "/items/" + reminder.id);
  assert.equal((await f.ok("GET", "/items")).length, 2);
});

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
async function sendFile(f, buffer = png, name = "image.png") {
  const boundary = "test-boundary";
  return f.app.inject({
    method: "POST",
    url: "/api/files",
    headers: {
      cookie: f.cookie,
      "x-app-request": "1",
      "content-type": "multipart/form-data; boundary=" + boundary,
    },
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  });
}
test("uploads are signature-checked and protected; materials can be reused and filtered by metadata", async (t) => {
  const f = await fixture(t),
    s = await subject(f),
    p = await path(f, s, "map"),
    a = await step(f, p),
    b = await step(f, p);
  assert.equal(
    (await sendFile(f, Buffer.from("<script>bad</script>"), "bad.png"))
      .statusCode,
    400,
  );
  const uploaded = await sendFile(f);
  assert.equal(uploaded.statusCode, 201, uploaded.body);
  const file = uploaded.json();
  assert.equal(file.mime, "image/png");
  assert.equal((await f.app.inject("/api/files/" + file.id)).statusCode, 401);
  const protectedFile = await f.request("GET", "/files/" + file.id);
  assert.equal(protectedFile.statusCode, 200);
  assert.equal(protectedFile.headers["content-type"], "image/png");
  assert.equal(protectedFile.headers["x-frame-options"], "SAMEORIGIN");
  const m = await f.ok(
    "POST",
    "/materials",
    {
      title: "Referência",
      type: "paper",
      author: "Autor",
      file_id: file.id,
      subject_ids: [s.id],
      tags: ["redes"],
    },
    201,
  );
  for (const n of [a, b])
    await f.ok("PUT", `/steps/${n.id}/materials`, { material_ids: [m.id] });
  assert.equal((await f.ok("GET", "/materials/" + m.id)).usages.length, 2);
  assert.equal((await f.ok("GET", "/materials")).length, 1);
  await f.ok("PUT", "/materials/" + m.id, {
    title: "Livro atualizado",
    type: "book",
    url: "https://example.org/book",
    file_id: file.id,
    subject_ids: [s.id],
    tags: ["fundamentos"],
  });
  assert.equal((await f.ok("GET", "/materials/" + m.id)).type, "book");
  assert.equal(
    (
      await f.request("POST", "/materials", {
        title: "Inseguro",
        type: "paper",
        url: "javascript:alert(1)",
      })
    ).statusCode,
    400,
  );
  await f.ok("DELETE", "/materials/" + m.id);
  assert.equal((await f.ok("GET", "/steps/" + a.id)).material_ids.length, 0);
});

test("structured notes round-trip and atomic revision conflicts preserve the newer document", async (t) => {
  const f = await fixture(t),
    s = await subject(f),
    p = await path(f, s, "map"),
    n = await step(f, p);
  const content = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Minhas notas" }],
      },
      {
        type: "taskList",
        content: [
          {
            type: "taskItem",
            attrs: { checked: true },
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Ler" }] },
            ],
          },
        ],
      },
      { type: "codeBlock", content: [{ type: "text", text: "print(1)" }] },
      {
        type: "paragraph",
        content: [{ type: "inlineMath", attrs: { latex: "x^2" } }],
      },
    ],
  };
  const results = await Promise.all([
    f.request("PUT", `/steps/${n.id}/note`, { revision: 0, content }),
    f.request("PUT", `/steps/${n.id}/note`, {
      revision: 0,
      content: { type: "doc", content: [{ type: "paragraph" }] },
    }),
  ]);
  assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409]);
  const remote = await f.ok("GET", `/steps/${n.id}/note`);
  assert.equal(remote.revision, 1);
  assert.deepEqual(remote.content, content);
  assert.deepEqual(
    results.find((r) => r.statusCode === 409).json().current.content,
    content,
  );
  assert.equal(
    (
      await f.request("PUT", `/steps/${n.id}/note`, {
        revision: 1,
        content: {
          type: "doc",
          content: [{ type: "image", attrs: { src: "javascript:alert(1)" } }],
        },
      })
    ).statusCode,
    400,
  );
  assert.equal((await f.ok("GET", "/activity")).minutes, 0);
});

test("database and uploads survive restart, backup and restore; damaged backups are rejected", async (t) => {
  const f = await fixture(t),
    s = await subject(f),
    p = await path(f, s, "map"),
    n = await step(f, p);
  await f.ok("PUT", `/steps/${n.id}/note`, {
    revision: 0,
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Persistir" }] },
      ],
    },
  });
  const uploaded = (await sendFile(f)).json();
  const root = mkdtempSync(join(tmpdir(), "meu-backup-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  await assert.rejects(createBackup(f.dir, root), /Pare a aplicação/);
  await f.app.close();
  const target = await createBackup(f.dir, root);
  const restored = join(root, "restored");
  restoreBackup(target, restored);
  assert.deepEqual(readFileSync(join(restored, "uploads", uploaded.id)), png);
  f.app = await createApp({
    dataDir: restored,
    password,
    logger: false,
    secureCookies: false,
  });
  assert.equal(
    (await f.ok("GET", `/steps/${n.id}/note`)).content.content[0].content[0]
      .text,
    "Persistir",
  );
  assert.equal((await f.ok("GET", "/subjects"))[0].id, s.id);
  assert.equal(
    (await f.request("GET", "/files/" + uploaded.id)).statusCode,
    200,
  );
  await f.app.close();
  writeFileSync(join(target, "uploads", uploaded.id), "corrupted");
  assert.throws(
    () => restoreBackup(target, join(root, "bad-restore")),
    /incompleto ou alterado/,
  );
});

test("administrative password reset revokes sessions and production cookies require HTTPS", async (t) => {
  const f = await fixture(t);
  await f.app.close();
  const replacement = "replacement-test-password";
  execFileSync(process.execPath, ["scripts/reset-password.mjs"], {
    env: { ...process.env, DATA_DIR: f.dir },
    input: replacement + "\n",
    stdio: ["pipe", "pipe", "pipe"],
  });
  f.app = await createApp({
    dataDir: f.dir,
    logger: false,
    secureCookies: true,
  });
  assert.equal((await f.request("GET", "/subjects")).statusCode, 401);
  const attempt = async (password) =>
    f.app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "x-app-request": "1" },
      payload: { username: "admin", password },
    });
  assert.equal((await attempt(password)).statusCode, 401);
  const result = await attempt(replacement);
  assert.equal(result.statusCode, 200);
  assert.match(result.headers["set-cookie"], /; Secure/);
  assert.match(result.headers["set-cookie"], /HttpOnly/);
});
