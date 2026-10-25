import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  BookOpen,
  FileText,
  NotebookPen,
  Search,
  ArrowLeft,
  ArrowUpRight,
  Download,
  Pencil,
  Trash2,
  FileUp,
} from "lucide-react";
import { api, json, materialTypes, upload } from "./api";
import {
  AddButton,
  Empty,
  ErrorMessage,
  Form,
  Loading,
  Modal,
  PageTitle,
  Panel,
  TextLink,
  field,
  useLoad,
} from "./ui";
import { useWorkspace } from "./workspace";
import type { Material } from "./types";
const icons = { book: BookOpen, paper: FileText, exercises: NotebookPen };
export function MaterialForm({
  material,
  onClose,
  onSaved,
}: {
  material?: Material;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { subjects } = useWorkspace();
  const [selected, setSelected] = useState(material?.subject_ids || []),
    [file, setFile] = useState<File>(),
    [uploading, setUploading] = useState(false);
  return (
    <Modal
      title={material ? "Editar material" : "Adicionar material"}
      onClose={onClose}
    >
      <Form
        onCancel={onClose}
        onSubmit={async (d) => {
          let fileId = material?.file_id || null;
          try {
            if (file) {
              setUploading(true);
              fileId = (await upload(file)).id;
            }
            await api(
              material ? "/materials/" + material.id : "/materials",
              json(material ? "PUT" : "POST", {
                title: field(d, "title"),
                type: field(d, "type"),
                author: field(d, "author"),
                description: field(d, "description"),
                url: field(d, "url"),
                file_id: fileId,
                tags: field(d, "tags")
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
                subject_ids: selected,
              }),
            );
            onSaved();
            onClose();
          } finally {
            setUploading(false);
          }
        }}
      >
        <label>
          Título
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={material?.title}
            placeholder="Um material para suas próximas descobertas"
          />
        </label>
        <div className="fields">
          <label>
            Tipo
            <select name="type" defaultValue={material?.type || "book"}>
              {Object.entries(materialTypes).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Autor <span className="optional">opcional</span>
            <input
              name="author"
              maxLength={300}
              defaultValue={material?.author}
            />
          </label>
        </div>
        <label>
          Arquivo <span className="optional">PDF ou imagem · até 25 MB</span>
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => setFile(e.target.files?.[0])}
          />
          {material?.file && !file && (
            <small>
              Atual: {material.file.name}. Envie outro arquivo para substituir.
            </small>
          )}
          {uploading && <small role="status">Enviando arquivo…</small>}
        </label>
        <label>
          Link externo{" "}
          <span className="optional">
            alternativa ou complemento ao arquivo
          </span>
          <input
            name="url"
            type="url"
            placeholder="https://"
            defaultValue={material?.url}
          />
        </label>
        <label>
          Descrição
          <textarea name="description" defaultValue={material?.description} />
        </label>
        <fieldset>
          <legend>Matérias</legend>
          <div className="check-options">
            {subjects
              .filter((s) => !s.archived || selected.includes(s.id))
              .map((s) => (
                <label key={s.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(s.id)}
                    onChange={(e) =>
                      setSelected((v) =>
                        e.target.checked
                          ? [...v, s.id]
                          : v.filter((k) => k !== s.id),
                      )
                    }
                  />
                  {s.title}
                </label>
              ))}
            {!subjects.length && (
              <small className="muted">
                Você pode associar matérias depois de criá-las no Learn.
              </small>
            )}
          </div>
        </fieldset>
        <label>
          Etiquetas <span className="optional">separadas por vírgula</span>
          <input
            name="tags"
            defaultValue={material?.tags.join(", ")}
            placeholder="Ex.: revisão, fundamentos, semestre 1"
          />
        </label>
      </Form>
    </Modal>
  );
}
export function LibraryPage() {
  const { subjects } = useWorkspace();
  const { data, error, reload } = useLoad(() => api<Material[]>("/materials"));
  const [search, setSearch] = useState(""),
    [type, setType] = useState(""),
    [subject, setSubject] = useState(""),
    [tag, setTag] = useState(""),
    [form, setForm] = useState(false);
  if (!data) return error ? <ErrorMessage error={error} /> : <Loading />;
  const list = data.filter(
    (m) =>
      (!type || m.type === type) &&
      (!subject || m.subject_ids.includes(subject)) &&
      (!tag || m.tags.includes(tag)) &&
      `${m.title} ${m.author}`
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
  );
  return (
    <>
      <PageTitle
        eyebrow="ESTUDOS / BIBLIOTECA"
        title="Uma biblioteca do seu jeito."
        description="Livros, papers e exercícios para alimentar seus caminhos."
        action={
          <AddButton onClick={() => setForm(true)}>
            Adicionar material
          </AddButton>
        }
      />
      <div className="library-toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Buscar por título ou autor"
            placeholder="Buscar por título ou autor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Filtrar por tipo"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">Todos os tipos</option>
          {Object.entries(materialTypes).map(([k, v]) => (
            <option value={k} key={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por matéria"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        >
          <option value="">Todas as matérias</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por etiqueta"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        >
          <option value="">Todas as etiquetas</option>
          {[...new Set(data.flatMap((m) => m.tags))].sort().map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <div className="section-caption">
        <span>
          {list.length} {list.length === 1 ? "material" : "materiais"}
        </span>
        <span>Conhecimento para voltar sempre.</span>
      </div>
      {list.length ? (
        <div className="material-grid">
          {list.map((m) => {
            const Icon = icons[m.type];
            return (
              <Link
                key={m.id}
                className="material-card"
                to={"/estudos/biblioteca/" + m.id}
              >
                <div className={"material-cover " + m.type}>
                  <Icon size={42} />
                  <span>{materialTypes[m.type]}</span>
                  <ArrowUpRight size={17} />
                </div>
                <div className="material-content">
                  <h2>{m.title}</h2>
                  <p>{m.author || "Sua coleção pessoal"}</p>
                  <div className="tag-list">
                    {m.subject_ids.map((s) => (
                      <span className="tag" key={s}>
                        {subjects.find((x) => x.id === s)?.title}
                      </span>
                    ))}
                    {m.tags.map((t) => (
                      <span className="tag subtle" key={t}>
                        #{t}
                      </span>
                    ))}
                  </div>
                  <small className="muted">
                    {m.file
                      ? m.file.mime === "application/pdf"
                        ? "PDF"
                        : "Imagem"
                      : "Link externo"}{" "}
                    · {m.usages.length}{" "}
                    {m.usages.length === 1
                      ? "etapa vinculada"
                      : "etapas vinculadas"}
                  </small>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <Panel>
          <Empty
            title={
              data.length
                ? "Nenhum material com esses filtros"
                : "Um lugar para suas referências"
            }
            action={
              <button onClick={() => setForm(true)}>
                <FileUp size={16} />
                Adicionar material
              </button>
            }
          >
            {data.length
              ? "Experimente outro título, matéria ou etiqueta."
              : "Guarde o primeiro livro, paper ou lista de exercícios."}
          </Empty>
        </Panel>
      )}
      {form && <MaterialForm onClose={() => setForm(false)} onSaved={reload} />}
    </>
  );
}
export function MaterialPage() {
  const { materialId } = useParams();
  const navigate = useNavigate();
  const { subjects, paths } = useWorkspace();
  const {
    data: m,
    error,
    reload,
  } = useLoad(() => api<Material>("/materials/" + materialId), [materialId]);
  const [edit, setEdit] = useState(false),
    [actionError, setError] = useState<unknown>();
  if (!m) return error ? <ErrorMessage error={error} /> : <Loading />;
  const Icon = icons[m.type];
  return (
    <>
      <Link className="back-link" to="/estudos/biblioteca">
        <ArrowLeft size={15} />
        Biblioteca
      </Link>
      <PageTitle
        eyebrow={"BIBLIOTECA / " + materialTypes[m.type].toUpperCase()}
        title={m.title}
        description={m.author || "Da sua coleção pessoal"}
        action={
          <button onClick={() => setEdit(true)}>
            <Pencil size={15} />
            Editar material
          </button>
        }
      />
      <ErrorMessage error={actionError} />
      <div className="material-detail">
        <Panel className="material-preview">
          {m.file ? (
            m.file.mime.startsWith("image/") ? (
              <img src={"/api/files/" + m.file.id} alt={m.title} />
            ) : (
              <>
                <iframe
                  src={"/api/files/" + m.file.id}
                  title={"PDF: " + m.title}
                />
                <div className="panel-padding muted">
                  Se o navegador não mostrar o PDF, use “Abrir arquivo”.
                </div>
              </>
            )
          ) : (
            <div className={"material-cover large " + m.type}>
              <Icon size={80} />
              <p>{materialTypes[m.type]}</p>
            </div>
          )}
        </Panel>
        <div>
          <Panel title="Sobre este material">
            <div className="panel-padding">
              <p className="pre-wrap">
                {m.description || "Sem descrição por enquanto."}
              </p>
              <div className="tag-list">
                {m.subject_ids.map((s) => (
                  <span className="tag" key={s}>
                    {subjects.find((x) => x.id === s)?.title}
                  </span>
                ))}
                {m.tags.map((t) => (
                  <span className="tag subtle" key={t}>
                    #{t}
                  </span>
                ))}
              </div>
              <div className="stack-actions">
                {m.file && (
                  <>
                    <a
                      className="button primary"
                      href={"/api/files/" + m.file.id}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ArrowUpRight size={16} />
                      Abrir arquivo
                    </a>
                    <a
                      className="button"
                      href={"/api/files/" + m.file.id + "?download=1"}
                    >
                      <Download size={16} />
                      Baixar · {(m.file.size / 1024 / 1024).toFixed(1)} MB
                    </a>
                  </>
                )}
                {m.url && (
                  <a
                    className="button"
                    href={m.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ArrowUpRight size={16} />
                    Abrir link externo
                  </a>
                )}
              </div>
            </div>
          </Panel>
          <Panel title="Presente nestes caminhos">
            {m.usages.length ? (
              <div className="usage-list">
                {m.usages.map((s) => (
                  <TextLink
                    key={s.id}
                    to={`/estudos/learn/${paths.find((p) => p.id === s.path_id)?.subject_id}/${s.path_id}/etapas/${s.id}`}
                  >
                    {s.path_title} · {s.title}
                  </TextLink>
                ))}
              </div>
            ) : (
              <div className="panel-padding muted">
                Vincule este material dentro de uma etapa ou tópico no Learn.
              </div>
            )}
          </Panel>
          <button
            className="danger text-button"
            onClick={() => {
              if (
                confirm(
                  `Excluir este material? ${m.usages.length ? "Ele será desvinculado das etapas que o utilizam." : ""}`,
                )
              )
                api("/materials/" + m.id, { method: "DELETE" })
                  .then(() => navigate("/estudos/biblioteca"))
                  .catch(setError);
            }}
          >
            <Trash2 size={14} />
            Excluir material
          </button>
        </div>
      </div>
      {edit && (
        <MaterialForm
          material={m}
          onClose={() => setEdit(false)}
          onSaved={reload}
        />
      )}
    </>
  );
}
