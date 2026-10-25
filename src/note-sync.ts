import type { Note } from "./types";
export type Document = Record<string, unknown>;
export type SyncState = {
  status: "saved" | "saving" | "error" | "conflict";
  message: string;
  storageError: boolean;
  restored: boolean;
};
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export class NoteSync {
  content: Document;
  revision: number;
  dirty = false;
  conflict: Note | null = null;
  state: SyncState;
  private key: string;
  private store: Store;
  private save: (revision: number, content: Document) => Promise<Note>;
  private notify: (state: SyncState) => void;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private busy = false;
  constructor(
    note: Note,
    store: Store,
    save: (revision: number, content: Document) => Promise<Note>,
    notify: (state: SyncState) => void,
  ) {
    this.content = note.content;
    this.revision = note.revision;
    this.key = "meu-espaco-note-" + note.step_id;
    this.store = store;
    this.save = save;
    this.notify = notify;
    this.state = {
      status: "saved",
      message: "Salvo",
      storageError: false,
      restored: false,
    };
    try {
      const raw = store.getItem(this.key);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.content?.type === "doc" && Number.isInteger(draft.revision)) {
          if (JSON.stringify(draft.content) === JSON.stringify(note.content))
            store.removeItem(this.key);
          else {
            this.content = draft.content;
            this.revision = draft.revision;
            this.dirty = true;
            this.state.restored = true;
            if (draft.revision !== note.revision) {
              this.conflict = note;
              this.state.status = "conflict";
              this.state.message =
                "O servidor tem outra versão. Seu rascunho está aberto.";
            } else {
              this.state.status = "saving";
              this.state.message = "Rascunho recuperado. Salvando…";
            }
          }
        }
      }
    } catch {
      this.state.storageError = true;
    }
  }
  private emit() {
    this.notify({ ...this.state });
  }
  private persist() {
    try {
      this.store.setItem(
        this.key,
        JSON.stringify({
          revision: this.revision,
          content: this.content,
          updatedAt: new Date().toISOString(),
        }),
      );
      this.state.storageError = false;
    } catch {
      this.state.storageError = true;
    }
  }
  update(content: Document) {
    this.content = content;
    this.dirty = true;
    this.persist();
    if (!this.conflict) {
      this.state.status = "saving";
      this.state.message = "Salvando…";
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.flush(), 800);
    }
    this.emit();
  }
  async flush() {
    clearTimeout(this.timer);
    if (!this.dirty || this.busy || this.conflict) return;
    this.busy = true;
    const snapshot = this.content;
    this.state.status = "saving";
    this.state.message = "Salvando…";
    this.emit();
    try {
      const note = await this.save(this.revision, snapshot);
      this.revision = note.revision;
      this.dirty = JSON.stringify(this.content) !== JSON.stringify(snapshot);
      if (this.dirty) this.persist();
      else {
        try {
          this.store.removeItem(this.key);
        } catch {}
        this.state.status = "saved";
        this.state.message = "Salvo";
        this.state.restored = false;
      }
      this.emit();
    } catch (e) {
      const error = e as {
        status?: number;
        message?: string;
        data?: { current?: Note };
      };
      if (error.status === 409 && error.data?.current) {
        this.conflict = error.data.current;
        this.state.status = "conflict";
        this.state.message = error.message || "Conflito de versões.";
      } else {
        this.state.status = "error";
        this.state.message = error.message || "Falha ao salvar.";
      }
      this.persist();
      this.emit();
    } finally {
      this.busy = false;
    }
    if (this.dirty && !this.conflict && this.state.status !== "error")
      await this.flush();
  }
  useServer() {
    if (!this.conflict) return this.content;
    this.content = this.conflict.content;
    this.revision = this.conflict.revision;
    this.conflict = null;
    this.dirty = false;
    try {
      this.store.removeItem(this.key);
    } catch {}
    this.state = {
      status: "saved",
      message: "Versão do servidor aberta",
      storageError: false,
      restored: false,
    };
    this.emit();
    return this.content;
  }
  async keepDraft() {
    if (this.conflict) {
      this.revision = this.conflict.revision;
      this.conflict = null;
      this.persist();
    }
    await this.flush();
  }
  start() {
    if (this.dirty && !this.conflict)
      this.timer = setTimeout(() => void this.flush(), 300);
  }
  dispose() {
    clearTimeout(this.timer);
    void this.flush();
  }
}
