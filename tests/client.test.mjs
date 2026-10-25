import test from "node:test";
import assert from "node:assert/strict";
import { calendarDays, activityLevel } from "../src/calendar.ts";
import { NoteSync } from "../src/note-sync.ts";
const doc = (text) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const initial = {
  step_id: "test",
  revision: 0,
  content: doc("Original"),
  updated_at: "",
};
const memory = () => {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) || null,
    setItem: (key, v) => data.set(key, v),
    removeItem: (key) => data.delete(key),
  };
};

test("calendar covers the full year including leap day with week alignment and exact thresholds", () => {
  for (const year of [2023, 2024, 2026]) {
    const days = calendarDays(year);
    assert.equal(days.length % 7, 0);
    assert.equal(new Date(days[0].date + "T12:00:00Z").getUTCDay(), 0);
    assert.equal(
      days.filter((d) => d.inYear).length,
      year === 2024 ? 366 : 365,
    );
    assert.equal(new Set(days.map((d) => d.date)).size, days.length);
  }
  assert.equal(
    calendarDays(2024).some((d) => d.date === "2024-02-29"),
    true,
  );
  assert.equal(
    calendarDays(2023).some((d) => d.date === "2023-02-29"),
    false,
  );
  for (const [minutes, level] of [
    [0, 0],
    [1, 1],
    [29, 1],
    [30, 2],
    [59, 2],
    [60, 3],
    [119, 3],
    [120, 4],
    [1440, 4],
  ])
    assert.equal(activityLevel(minutes), level);
});

test("autosave keeps a local draft after network failure, restores it and retries", async () => {
  const store = memory();
  let failing = true;
  let server = initial;
  const save = async (revision, content) => {
    if (failing) throw new Error("Sem conexão");
    assert.equal(revision, server.revision);
    server = { ...server, revision: revision + 1, content };
    return server;
  };
  const sync = new NoteSync(initial, store, save, () => {});
  sync.update(doc("Rascunho"));
  await sync.flush();
  assert.equal(sync.state.status, "error");
  assert.ok(store.getItem("meu-espaco-note-test"));
  const recovered = new NoteSync(initial, store, save, () => {});
  assert.equal(recovered.state.restored, true);
  assert.deepEqual(recovered.content, doc("Rascunho"));
  failing = false;
  await recovered.flush();
  assert.equal(server.revision, 1);
  assert.equal(recovered.state.status, "saved");
  assert.equal(store.getItem("meu-espaco-note-test"), null);
});

test("autosave serializes in-flight updates and advances revisions without dropping edits", async () => {
  const store = memory();
  let release;
  const wait = new Promise((r) => (release = r));
  let calls = 0,
    server = initial;
  const sync = new NoteSync(
    initial,
    store,
    async (revision, content) => {
      calls++;
      if (calls === 1) await wait;
      assert.equal(revision, server.revision);
      server = { ...server, revision: revision + 1, content };
      return server;
    },
    () => {},
  );
  sync.update(doc("Primeira"));
  const saving = sync.flush();
  sync.update(doc("Segunda"));
  release();
  await saving;
  assert.equal(calls, 2);
  assert.equal(server.revision, 2);
  assert.deepEqual(server.content, doc("Segunda"));
  assert.equal(sync.dirty, false);
  sync.dispose();
});

test("conflicts pause saves, retain the local draft, and require an explicit version choice", async () => {
  const store = memory();
  let server = { ...initial, revision: 1, content: doc("Outra aba") };
  let calls = 0;
  const sync = new NoteSync(
    initial,
    store,
    async (revision, content) => {
      calls++;
      if (revision !== server.revision)
        throw Object.assign(new Error("Conflito"), {
          status: 409,
          data: { current: server },
        });
      server = { ...server, revision: revision + 1, content };
      return server;
    },
    () => {},
  );
  sync.update(doc("Local"));
  await sync.flush();
  assert.equal(sync.state.status, "conflict");
  sync.update(doc("Ainda local"));
  await sync.flush();
  assert.equal(calls, 1);
  assert.deepEqual(server.content, doc("Outra aba"));
  assert.ok(store.getItem("meu-espaco-note-test"));
  await sync.keepDraft();
  assert.deepEqual(server.content, doc("Ainda local"));
  assert.equal(server.revision, 2);
  const reloaded = new NoteSync(
    initial,
    store,
    async () => server,
    () => {},
  );
  store.setItem(
    "meu-espaco-note-test",
    JSON.stringify({ revision: 0, content: doc("Rascunho antigo") }),
  );
  const conflict = new NoteSync(
    server,
    store,
    async () => server,
    () => {},
  );
  assert.equal(conflict.state.status, "conflict");
  assert.deepEqual(conflict.useServer(), server.content);
  assert.equal(store.getItem("meu-espaco-note-test"), null);
});

test("unavailable local storage is reported while retaining content in memory", async () => {
  const broken = {
    getItem: () => null,
    setItem: () => {
      throw new Error("Quota");
    },
    removeItem: () => {},
  };
  const sync = new NoteSync(
    initial,
    broken,
    async () => {
      throw new Error("Offline");
    },
    () => {},
  );
  sync.update(doc("Ainda aqui"));
  await sync.flush();
  assert.equal(sync.state.storageError, true);
  assert.deepEqual(sync.content, doc("Ainda aqui"));
});

test("a recovered conflicting draft keeps its original base revision across another reload", () => {
  const store = memory();
  store.setItem(
    "meu-espaco-note-test",
    JSON.stringify({ revision: 0, content: doc("Rascunho") }),
  );
  const remote = {
    ...initial,
    revision: 2,
    content: doc("Servidor atualizado"),
  };
  const sync = new NoteSync(
    remote,
    store,
    async () => remote,
    () => {},
  );
  sync.update(doc("Rascunho editado durante conflito"));
  const reopened = new NoteSync(
    remote,
    store,
    async () => remote,
    () => {},
  );
  assert.equal(reopened.state.status, "conflict");
  assert.equal(reopened.revision, 0);
  assert.deepEqual(reopened.content, doc("Rascunho editado durante conflito"));
});
