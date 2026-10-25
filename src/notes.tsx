import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import Mathematics from "@tiptap/extension-mathematics";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  ListChecks,
  Code2,
  Quote,
  ImagePlus,
  Sigma,
  Link as LinkIcon,
  Undo2,
  Redo2,
  Check,
  CloudOff,
  LoaderCircle,
  Download,
} from "lucide-react";
import "katex/dist/katex.min.css";
import { api, download, json, upload } from "./api";
import { ErrorMessage, Form, IconButton, Modal, field } from "./ui";
import { NoteSync, type Document, type SyncState } from "./note-sync";
import type { Note } from "./types";

type Command = { label: string; hint: string; run: (e: Editor) => void };
export function NoteEditor({ note }: { note: Note }) {
  const mounted = useRef(true),
    file = useRef<HTMLInputElement>(null);
  const [syncState, setSyncState] = useState<SyncState>({
    status: "saved",
    message: "Salvo",
    storageError: false,
    restored: false,
  });
  const [error, setError] = useState<unknown>(),
    [slash, setSlash] = useState<{
      from: number;
      to: number;
      query: string;
      top: number;
      left: number;
    } | null>(null),
    [active, setActive] = useState(0),
    [dialog, setDialog] = useState<"link" | "math" | null>(null),
    [mathEdit, setMathEdit] = useState<{
      pos: number;
      latex: string;
      block: boolean;
    } | null>(null),
    [uploading, setUploading] = useState(false);
  const syncRef = useRef<NoteSync | null>(null);
  if (!syncRef.current)
    syncRef.current = new NoteSync(
      note,
      {
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
        removeItem: (key) => localStorage.removeItem(key),
      },
      (revision, content) =>
        api<Note>(
          "/steps/" + note.step_id + "/note",
          json("PUT", { revision, content }),
        ),
      (state) => {
        if (mounted.current) setSyncState(state);
      },
    );
  const sync = syncRef.current;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          HTMLAttributes: { rel: "noopener noreferrer" },
        },
      }),
      Placeholder.configure({
        placeholder:
          "É aqui que suas ideias ganham espaço. Digite / para adicionar um bloco…",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ allowBase64: false }),
      Mathematics.configure({
        katexOptions: { throwOnError: false, trust: false },
        inlineOptions: {
          onClick: (node, pos) => {
            setMathEdit({ pos, latex: node.attrs.latex, block: false });
            setDialog("math");
          },
        },
        blockOptions: {
          onClick: (node, pos) => {
            setMathEdit({ pos, latex: node.attrs.latex, block: true });
            setDialog("math");
          },
        },
      }),
    ],
    content: sync.content,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": "Anotações da etapa",
        class: "note-document",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: e }) => {
      sync.update(e.getJSON() as Document);
      const { from, $from } = e.state.selection;
      const before = $from.parent.textBetween(0, $from.parentOffset, "\n");
      const match = before.match(/^\/([^/]*)$/);
      if (match && !e.isActive("codeBlock")) {
        const caret = e.view.coordsAtPos(from);
        const top =
          caret.bottom + 320 > window.innerHeight
            ? Math.max(12, caret.top - 310)
            : caret.bottom + 6;
        setSlash({
          from: from - match[0].length,
          to: from,
          query: match[1],
          top,
          left: Math.max(12, Math.min(caret.left, window.innerWidth - 285)),
        });
        setActive(0);
      } else setSlash(null);
    },
    onSelectionUpdate: ({ editor: e }) => {
      if (!e.state.selection.empty) setSlash(null);
    },
  });
  useEffect(() => {
    mounted.current = true;
    setSyncState({ ...sync.state });
    sync.start();
    const before = (e: BeforeUnloadEvent) => {
      if (sync.dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    const online = () => {
      if (sync.dirty && !sync.conflict) void sync.flush();
    };
    window.addEventListener("online", online);
    return () => {
      mounted.current = false;
      window.removeEventListener("beforeunload", before);
      window.removeEventListener("online", online);
      sync.dispose();
    };
  }, [sync]);
  const commands: Command[] = [
    {
      label: "Texto",
      hint: "Um parágrafo simples",
      run: (e) => e.chain().focus().setParagraph().run(),
    },
    {
      label: "Título 1",
      hint: "Uma nova seção",
      run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: "Título 2",
      hint: "Uma subseção",
      run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "Lista",
      hint: "Organize suas ideias",
      run: (e) => e.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Lista numerada",
      hint: "Um passo de cada vez",
      run: (e) => e.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "Tarefas",
      hint: "Uma lista para marcar",
      run: (e) => e.chain().focus().toggleTaskList().run(),
    },
    {
      label: "Código",
      hint: "Um bloco de código",
      run: (e) => e.chain().focus().toggleCodeBlock().run(),
    },
    {
      label: "Citação",
      hint: "Uma ideia para guardar",
      run: (e) => e.chain().focus().toggleBlockquote().run(),
    },
    {
      label: "Imagem",
      hint: "Enviar uma imagem",
      run: () => file.current?.click(),
    },
    {
      label: "Fórmula",
      hint: "Escrever em LaTeX",
      run: () => {
        setMathEdit(null);
        setDialog("math");
      },
    },
  ];
  const matches = commands.filter((c) =>
    c.label
      .toLocaleLowerCase("pt-BR")
      .includes(slash?.query.toLocaleLowerCase("pt-BR") || ""),
  );
  function run(c: Command) {
    if (!editor) return;
    if (slash)
      editor
        .chain()
        .focus()
        .deleteRange({ from: slash.from, to: slash.to })
        .run();
    setSlash(null);
    c.run(editor);
  }
  useEffect(() => {
    if (!editor) return;
    const handler = (e: KeyboardEvent) => {
      if (!slash) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setSlash(null);
      }
      if (["ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        setActive(
          (v) =>
            (v + (e.key === "ArrowDown" ? 1 : -1) + matches.length) %
            Math.max(1, matches.length),
        );
      }
      if (e.key === "Enter" && matches.length) {
        e.preventDefault();
        e.stopImmediatePropagation();
        run(matches[active % matches.length]);
      }
    };
    const dom = editor.view.dom;
    dom.addEventListener("keydown", handler, true);
    return () => dom.removeEventListener("keydown", handler, true);
  }, [editor, slash, active, matches.length]);
  if (!editor) return <div className="loading">Preparando suas anotações…</div>;
  const tools = [
    {
      label: "Título 1",
      icon: Heading1,
      active: editor.isActive("heading", { level: 1 }),
      run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: "Título 2",
      icon: Heading2,
      active: editor.isActive("heading", { level: 2 }),
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "Negrito",
      icon: Bold,
      active: editor.isActive("bold"),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: "Itálico",
      icon: Italic,
      active: editor.isActive("italic"),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: "Lista",
      icon: List,
      active: editor.isActive("bulletList"),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Lista numerada",
      icon: ListOrdered,
      active: editor.isActive("orderedList"),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "Tarefas",
      icon: ListChecks,
      active: editor.isActive("taskList"),
      run: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      label: "Citação",
      icon: Quote,
      active: editor.isActive("blockquote"),
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: "Código",
      icon: Code2,
      active: editor.isActive("codeBlock"),
      run: () => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      label: "Link",
      icon: LinkIcon,
      active: editor.isActive("link"),
      run: () => setDialog("link"),
    },
    {
      label: "Imagem",
      icon: ImagePlus,
      active: false,
      run: () => file.current?.click(),
    },
    {
      label: "Fórmula",
      icon: Sigma,
      active: false,
      run: () => {
        setMathEdit(null);
        setDialog("math");
      },
    },
  ];
  return (
    <section className="note-editor">
      <div className="note-top">
        <strong>Suas anotações</strong>
        <span className={"save-status " + syncState.status} role="status">
          {syncState.status === "saved" ? (
            <Check size={13} />
          ) : syncState.status === "saving" ? (
            <LoaderCircle className="spin" size={13} />
          ) : (
            <CloudOff size={13} />
          )}{" "}
          {syncState.status === "error"
            ? "Falha ao salvar"
            : syncState.status === "conflict"
              ? "Conflito de versões"
              : syncState.message}
        </span>
      </div>
      {syncState.restored && syncState.status !== "conflict" && (
        <div className="draft-notice">Rascunho local recuperado.</div>
      )}
      {syncState.status === "error" && (
        <div className="sync-alert">
          <p>
            {syncState.message} Seu rascunho foi preservado{" "}
            {syncState.storageError
              ? "na memória desta tela"
              : "neste navegador"}
            .
          </p>
          <button onClick={() => void sync.flush()}>Tentar novamente</button>
        </div>
      )}
      {syncState.status === "conflict" && (
        <div className="sync-alert">
          <strong>Esta nota tem uma versão mais recente no servidor.</strong>
          <p>
            Seu rascunho está aberto abaixo. Compare antes de escolher qual
            manter.
          </p>
          <details>
            <summary>Ver texto da versão do servidor</summary>
            <pre>{documentText(sync.conflict?.content || {})}</pre>
          </details>
          <div className="inline-actions">
            <button
              onClick={() =>
                download("rascunho-" + note.step_id + ".json", sync.content)
              }
            >
              <Download size={14} />
              Baixar rascunho
            </button>
            <button
              onClick={() => {
                if (
                  confirm(
                    "Abrir a versão do servidor e descartar o rascunho local?",
                  )
                )
                  editor.commands.setContent(sync.useServer(), {
                    emitUpdate: false,
                  });
              }}
            >
              Usar versão do servidor
            </button>
            <button
              onClick={() => {
                if (
                  confirm(
                    "Substituir a versão do servidor pelo rascunho que está aberto?",
                  )
                )
                  void sync.keepDraft();
              }}
            >
              Salvar meu rascunho
            </button>
          </div>
        </div>
      )}
      {syncState.storageError && (
        <div className="sync-alert">
          <p>
            O navegador não conseguiu guardar o rascunho local. Mantenha esta
            tela aberta até salvar ou baixe uma cópia.
          </p>
          <button onClick={() => download("rascunho.json", sync.content)}>
            Baixar rascunho
          </button>
        </div>
      )}
      <div
        className="editor-toolbar"
        role="toolbar"
        aria-label="Formatação das anotações"
      >
        {tools.map((t) => (
          <IconButton
            key={t.label}
            label={t.label}
            aria-pressed={t.active}
            className={"icon-button " + (t.active ? "active" : "")}
            onClick={t.run}
          >
            <t.icon size={16} />
          </IconButton>
        ))}
        <span className="toolbar-divider" />
        <IconButton
          label="Desfazer"
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 size={16} />
        </IconButton>
        <IconButton
          label="Refazer"
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 size={16} />
        </IconButton>
      </div>
      <ErrorMessage error={error} />
      {uploading && (
        <div className="draft-notice" role="status">
          Enviando imagem…
        </div>
      )}
      <div className="editor-body">
        <EditorContent editor={editor} />
        {slash && (
          <div
            className="slash-menu"
            style={{
              position: "fixed",
              top: slash.top,
              left: slash.left,
              maxHeight: Math.min(310, window.innerHeight - 24),
            }}
            role="listbox"
            aria-label="Adicionar bloco"
          >
            <span className="eyebrow">ADICIONAR BLOCO</span>
            {matches.length ? (
              matches.map((c, i) => (
                <button
                  role="option"
                  aria-selected={i === active}
                  key={c.label}
                  onMouseDown={(e) => e.preventDefault()}
                  className={i === active ? "active" : ""}
                  onClick={() => run(c)}
                >
                  <strong>{c.label}</strong>
                  <small>{c.hint}</small>
                </button>
              ))
            ) : (
              <p>Nenhum bloco encontrado.</p>
            )}
          </div>
        )}
      </div>
      <div className="note-bottom">
        <small>Digite / para inserir blocos · $fórmula$ para matemática</small>
        <button className="text-button" onClick={() => void sync.flush()}>
          Salvar agora
        </button>
      </div>
      <input
        ref={file}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setUploading(true);
          setError(undefined);
          try {
            const stored = await upload(f);
            if (!stored.mime.startsWith("image/"))
              throw new Error("Selecione uma imagem.");
            if (!editor.isDestroyed)
              editor
                .chain()
                .focus()
                .setImage({ src: "/api/files/" + stored.id, alt: f.name })
                .run();
          } catch (err) {
            setError(err);
          } finally {
            setUploading(false);
            e.target.value = "";
          }
        }}
      />
      {dialog && (
        <Modal
          title={dialog === "math" ? "Fórmula em LaTeX" : "Inserir link"}
          onClose={() => setDialog(null)}
        >
          <Form
            onCancel={() => setDialog(null)}
            submit="Inserir"
            onSubmit={async (d) => {
              if (dialog === "link") {
                const href = field(d, "value");
                if (href && !/^https?:\/\//i.test(href))
                  throw new Error("Use um link HTTP ou HTTPS.");
                if (href)
                  editor
                    .chain()
                    .focus()
                    .extendMarkRange("link")
                    .setLink({ href })
                    .run();
                else editor.chain().focus().unsetLink().run();
              } else {
                const latex = field(d, "value");
                if (mathEdit) {
                  if (mathEdit.block)
                    editor
                      .chain()
                      .focus()
                      .updateBlockMath({ pos: mathEdit.pos, latex })
                      .run();
                  else
                    editor
                      .chain()
                      .focus()
                      .updateInlineMath({ pos: mathEdit.pos, latex })
                      .run();
                } else if (field(d, "display") === "block")
                  editor.chain().focus().insertBlockMath({ latex }).run();
                else editor.chain().focus().insertInlineMath({ latex }).run();
              }
              setDialog(null);
            }}
          >
            <label>
              {dialog === "math" ? "Expressão" : "Endereço"}
              <input
                name="value"
                type={dialog === "link" ? "url" : "text"}
                required={dialog === "math"}
                defaultValue={
                  dialog === "math"
                    ? mathEdit?.latex || ""
                    : editor.getAttributes("link").href || ""
                }
                placeholder={dialog === "math" ? "\\frac{a}{b}" : "https://"}
              />
            </label>
            {dialog === "math" && !mathEdit && (
              <label>
                Exibição
                <select name="display">
                  <option value="inline">Dentro do texto</option>
                  <option value="block">Bloco separado</option>
                </select>
              </label>
            )}
          </Form>
        </Modal>
      )}
    </section>
  );
}
function documentText(doc: Record<string, unknown>): string {
  const walk = (n: any): string =>
    n.text ||
    n.attrs?.latex ||
    (Array.isArray(n.content)
      ? n.content.map(walk).join(n.type === "doc" ? "\n\n" : " ")
      : "");
  return walk(doc);
}
