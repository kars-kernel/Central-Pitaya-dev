import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const suffix = randomBytes(5).toString("hex"),
  name = "meu-espaco-smoke-" + suffix,
  data = name + "-data",
  backups = name + "-backups";
const password = randomBytes(24).toString("hex");
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    env: { ...process.env, ADMIN_PASSWORD: password },
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
let created = false;
try {
  docker("volume", "create", data);
  docker("volume", "create", backups);
  docker(
    "run",
    "--detach",
    "--name",
    name,
    "--mount",
    `source=${data},target=/data`,
    "--mount",
    `source=${backups},target=/backups`,
    "--env",
    "ADMIN_PASSWORD",
    "--env",
    "COOKIE_SECURE=false",
    "--publish",
    "127.0.0.1::3000",
    process.env.TEST_IMAGE || "meu-espaco:local",
  );
  created = true;
  let base;
  async function ready() {
    const address = docker("port", name, "3000/tcp").split("\n")[0];
    base = "http://" + address;
    for (let i = 0; i < 40; i++) {
      try {
        if ((await fetch(base + "/api/health")).ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("Container did not become ready");
  }
  await ready();
  assert.equal((await fetch(base + "/api/subjects")).status, 401);
  const login = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-app-request": "1" },
    body: JSON.stringify({ username: "admin", password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  async function request(method, url, body) {
    const r = await fetch(base + "/api" + url, {
      method,
      headers: {
        cookie,
        "x-app-request": "1",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.ok(r.ok, await r.clone().text());
    return r.json();
  }
  const subject = await request("POST", "/subjects", {
    title: "Persistência no Docker",
  });
  const form = new FormData();
  form.append(
    "file",
    new Blob(["%PDF-1.7\nDocker smoke fixture\n%%EOF"], {
      type: "application/pdf",
    }),
    "fixture.pdf",
  );
  const uploaded = await fetch(base + "/api/files", {
    method: "POST",
    headers: { cookie, "x-app-request": "1" },
    body: form,
  });
  assert.equal(uploaded.status, 201);
  const file = await uploaded.json();
  docker("stop", name);
  docker("start", name);
  await ready();
  assert.equal((await request("GET", "/subjects"))[0].id, subject.id);
  assert.equal(
    (await fetch(base + "/api/files/" + file.id, { headers: { cookie } }))
      .status,
    200,
  );
  docker("stop", name);
  const log = docker(
    "run",
    "--rm",
    "--mount",
    `source=${data},target=/data`,
    "--mount",
    `source=${backups},target=/backups`,
    process.env.TEST_IMAGE || "meu-espaco:local",
    "npm",
    "run",
    "backup",
  );
  assert.match(log, /Backup criado:/);
  console.log(
    "Docker smoke passed: login, private files, persistent database/uploads across restart, and volume backup.",
  );
} finally {
  if (created) docker("rm", "--force", name);
  docker("volume", "rm", data);
  docker("volume", "rm", backups);
}
