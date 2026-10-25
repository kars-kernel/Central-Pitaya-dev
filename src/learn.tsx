import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  useEdgesState,
  useNodesState,
  type NodeProps,
  type Node,
  type Connection,
  type Edge as FlowEdge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  Archive,
  BookOpen,
  Check,
  Circle,
  GitBranch,
  Layers,
  List,
  Pencil,
  Plus,
  Route as RouteIcon,
  Trash2,
} from "lucide-react";
import { api, json, statusLabels } from "./api";
import {
  AddButton,
  Empty,
  ErrorMessage,
  Form,
  IconButton,
  Loading,
  Modal,
  PageTitle,
  Panel,
  Progress,
  TextLink,
  field,
  useLoad,
} from "./ui";
import { useWorkspace } from "./workspace";
import { SessionForm } from "./studies";
import { NoteEditor } from "./notes";
import { MaterialForm } from "./library";
import type {
  Material,
  Module,
  Note,
  Path,
  PathDetail,
  Step,
  Subject,
} from "./types";

function SubjectForm({
  subject,
  onClose,
}: {
  subject?: Subject;
  onClose: () => void;
}) {
  const { refresh } = useWorkspace();
  return (
    <Modal
      title={subject ? "Editar matéria" : "Nova matéria"}
      onClose={onClose}
    >
      <Form
        onCancel={onClose}
        onSubmit={async (d) => {
          await api(
            subject ? "/subjects/" + subject.id : "/subjects",
            json(subject ? "PATCH" : "POST", {
              title: field(d, "title"),
              description: field(d, "description"),
              color: field(d, "color"),
            }),
          );
          refresh();
          onClose();
        }}
      >
        <label>
          Nome da matéria
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={subject?.title}
            placeholder="Ex.: Cálculo, Redes, Segurança…"
          />
        </label>
        <label>
          Descrição
          <textarea
            name="description"
            defaultValue={subject?.description}
            placeholder="O que você quer explorar?"
          />
        </label>
        <label>
          Cor de identificação
          <input
            type="color"
            name="color"
            defaultValue={subject?.color || "#b8c99b"}
          />
        </label>
      </Form>
    </Modal>
  );
}
function PathForm({
  path,
  subjectId,
  onClose,
  onSaved,
}: {
  path?: Path;
  subjectId?: string;
  onClose: () => void;
  onSaved?: (id: string, subjectId: string) => void;
}) {
  const { subjects, refresh } = useWorkspace();
  const [type, setType] = useState<"modules" | "map">(path?.type || "modules");
  return (
    <Modal title={path ? "Editar caminho" : "Novo caminho"} onClose={onClose}>
      <Form
        onCancel={onClose}
        submit={path ? "Salvar caminho" : "Criar caminho"}
        onSubmit={async (d) => {
          const result = await api<Path>(
            path ? "/paths/" + path.id : "/paths",
            json(path ? "PATCH" : "POST", {
              title: field(d, "title"),
              description: field(d, "description"),
              subject_id: path?.subject_id || field(d, "subject_id"),
              type,
            }),
          );
          refresh();
          onSaved?.(result.id, result.subject_id);
          onClose();
        }}
      >
        <label>
          Nome do caminho
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={path?.title}
            placeholder="Ex.: Fundamentos de redes"
          />
        </label>
        {!path && (
          <label>
            Matéria
            <select name="subject_id" required defaultValue={subjectId || ""}>
              <option value="" disabled>
                Selecione uma matéria
              </option>
              {subjects
                .filter((s) => !s.archived)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label>
          Descrição
          <textarea name="description" defaultValue={path?.description} />
        </label>
        <fieldset disabled={!!path}>
          <legend>Como você quer organizar este caminho?</legend>
          <div className="path-type-options">
            <label className={type === "modules" ? "selected" : ""}>
              <input
                type="radio"
                name="type"
                value="modules"
                checked={type === "modules"}
                onChange={() => setType("modules")}
              />
              <Layers size={23} />
              <strong>Módulos e etapas</strong>
              <small>Uma sequência organizada, passo a passo.</small>
            </label>
            <label className={type === "map" ? "selected" : ""}>
              <input
                type="radio"
                name="type"
                value="map"
                checked={type === "map"}
                onChange={() => setType("map")}
              />
              <GitBranch size={23} />
              <strong>Mapa com ramificações</strong>
              <small>Explore conexões e diferentes direções.</small>
            </label>
          </div>
        </fieldset>
        <p className="hint">
          O formato é definido na criação. Seus pré-requisitos orientam o
          estudo, sem bloquear o avanço.
        </p>
      </Form>
    </Modal>
  );
}
export function LearnPage() {
  const { subjectId } = useParams();
  const { subjects, paths, refresh } = useWorkspace();
  const navigate = useNavigate();
  const [subjectForm, setSubjectForm] = useState<Subject | "new">(),
    [pathForm, setPathForm] = useState<Path | "new">(),
    [archived, setArchived] = useState(false),
    [error, setError] = useState<unknown>();
  const subject = subjects.find((s) => s.id === subjectId);
  const visibleSubjects = subjects.filter((s) => archived || !s.archived);
  const visiblePaths = paths.filter(
    (p) =>
      (!subjectId || p.subject_id === subjectId) &&
      (archived ||
        (!p.archived &&
          !subjects.find((s) => s.id === p.subject_id)?.archived)),
  );
  if (subjectId && !subject)
    return (
      <Empty
        title="Matéria não encontrada"
        action={
          <Link className="button" to="/estudos/learn">
            Voltar ao Learn
          </Link>
        }
      />
    );
  return (
    <>
      {subject && (
        <Link className="back-link" to="/estudos/learn">
          <ArrowLeft size={15} />
          Todas as matérias
        </Link>
      )}
      <PageTitle
        eyebrow="ESTUDOS / LEARN"
        title={subject?.title || "O que você quer aprender?"}
        description={
          subject?.description ||
          "Crie suas matérias. Construa seus caminhos. Conecte suas ideias."
        }
        action={
          <div className="inline-actions">
            {subject ? (
              <button onClick={() => setSubjectForm(subject)}>
                <Pencil size={15} />
                Editar matéria
              </button>
            ) : (
              <button onClick={() => setSubjectForm("new")}>
                <Plus size={16} />
                Nova matéria
              </button>
            )}
            <AddButton onClick={() => setPathForm("new")}>
              Novo caminho
            </AddButton>
          </div>
        }
      />
      <ErrorMessage error={error} />
      <div className="section-caption">
        <h2>{subject ? "Caminhos desta matéria" : "Suas matérias"}</h2>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          Mostrar arquivados
        </label>
      </div>
      {!subject && (
        <div className="subject-grid">
          {visibleSubjects.map((s) => {
            const ps = paths.filter(
              (p) => p.subject_id === s.id && !p.archived,
            );
            return (
              <div
                key={s.id}
                className={"subject-card " + (s.archived ? "archived" : "")}
                style={{ "--subject-color": s.color } as React.CSSProperties}
              >
                <Link to={"/estudos/learn/" + s.id}>
                  <span className="subject-icon">
                    <BookOpen size={22} />
                  </span>
                  <h2>
                    {s.title}
                    <ArrowUpRight size={16} />
                  </h2>
                  <p>{s.description || "Um novo universo para explorar."}</p>
                  <small>
                    {ps.length} {ps.length === 1 ? "caminho" : "caminhos"}
                    {s.archived ? " · Arquivada" : ""}
                  </small>
                </Link>
                <IconButton
                  label={"Editar " + s.title}
                  onClick={() => setSubjectForm(s)}
                >
                  <Pencil size={14} />
                </IconButton>
              </div>
            );
          })}
          <button className="new-subject" onClick={() => setSubjectForm("new")}>
            <Plus size={23} />
            <strong>Nova matéria</strong>
            <small>Abra espaço para uma nova descoberta.</small>
          </button>
        </div>
      )}
      {!subject && (
        <div className="section-caption">
          <h2>Seus caminhos</h2>
          <span>{visiblePaths.length} para explorar</span>
        </div>
      )}
      {visiblePaths.length ? (
        <div className="path-grid">
          {visiblePaths.map((p) => (
            <Panel key={p.id} className={p.archived ? "archived" : ""}>
              <div className="path-card">
                <div className="path-card-top">
                  <span className="tag">
                    {p.type === "map" ? (
                      <GitBranch size={13} />
                    ) : (
                      <Layers size={13} />
                    )}{" "}
                    {p.type === "map" ? "Mapa" : "Módulos"}
                  </span>
                  <IconButton
                    label={"Editar " + p.title}
                    onClick={() => setPathForm(p)}
                  >
                    <Pencil size={14} />
                  </IconButton>
                </div>
                <Link to={`/estudos/learn/${p.subject_id}/${p.id}`}>
                  <small className="muted">
                    {subjects.find((s) => s.id === p.subject_id)?.title}
                    {p.archived ? " · Arquivado" : ""}
                  </small>
                  <h2>
                    {p.title}
                    <ArrowUpRight size={17} />
                  </h2>
                  <p>{p.description || "Cada etapa é uma nova descoberta."}</p>
                  <Progress done={p.completed} total={p.total} />
                </Link>
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>
          <Empty
            title="Seu próximo caminho está em aberto"
            action={
              <button onClick={() => setPathForm("new")}>
                <Plus size={16} />
                Criar caminho
              </button>
            }
          >
            Escolha uma matéria e organize o que você quer aprender.
          </Empty>
        </Panel>
      )}
      {subject && (
        <button
          className="text-button muted"
          onClick={async () => {
            if (
              !subject.archived &&
              !confirm(
                "Arquivar esta matéria e ocultar seus caminhos da visão ativa? As anotações e sessões serão preservadas.",
              )
            )
              return;
            try {
              await api(
                "/subjects/" + subject.id,
                json("PATCH", { archived: !subject.archived }),
              );
              refresh();
            } catch (e) {
              setError(e);
            }
          }}
        >
          <Archive size={15} />
          {subject.archived ? "Restaurar matéria" : "Arquivar matéria"}
        </button>
      )}
      {subjectForm && (
        <SubjectForm
          subject={subjectForm === "new" ? undefined : subjectForm}
          onClose={() => setSubjectForm(undefined)}
        />
      )}{" "}
      {pathForm && (
        <PathForm
          path={pathForm === "new" ? undefined : pathForm}
          subjectId={subjectId}
          onClose={() => setPathForm(undefined)}
          onSaved={(key, selected) => {
            if (pathForm === "new")
              navigate(`/estudos/learn/${selected}/${key}`);
          }}
        />
      )}
    </>
  );
}
function ModuleForm({
  pathId,
  module,
  onClose,
  onSaved,
}: {
  pathId: string;
  module?: Module;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Modal title={module ? "Renomear módulo" : "Novo módulo"} onClose={onClose}>
      <Form
        onCancel={onClose}
        onSubmit={async (d) => {
          await api(
            module ? "/modules/" + module.id : "/paths/" + pathId + "/modules",
            json(module ? "PATCH" : "POST", { title: field(d, "title") }),
          );
          onSaved();
          onClose();
        }}
      >
        <label>
          Nome do módulo
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={module?.title}
            placeholder="Ex.: Primeiros passos"
          />
        </label>
      </Form>
    </Modal>
  );
}
function StepForm({
  path,
  step,
  moduleId,
  onClose,
  onSaved,
}: {
  path: PathDetail;
  step?: Step;
  moduleId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Modal
      title={
        step
          ? "Editar etapa"
          : path.type === "map"
            ? "Novo tópico"
            : "Nova etapa"
      }
      onClose={onClose}
    >
      <Form
        onCancel={onClose}
        onSubmit={async (d) => {
          await api(
            step ? "/steps/" + step.id : "/paths/" + path.id + "/steps",
            json(step ? "PATCH" : "POST", {
              title: field(d, "title"),
              module_id: path.type === "modules" ? field(d, "module_id") : null,
              ...(!step && {
                x: 80 + (path.steps.length % 3) * 270,
                y: 80 + Math.floor(path.steps.length / 3) * 150,
              }),
            }),
          );
          onSaved();
          onClose();
        }}
      >
        <label>
          {path.type === "map" ? "Título do tópico" : "Título da etapa"}
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={step?.title}
            placeholder="O que vamos aprender?"
          />
        </label>
        {path.type === "modules" && (
          <label>
            Módulo
            <select
              name="module_id"
              required
              defaultValue={step?.module_id || moduleId || path.modules[0]?.id}
            >
              {path.modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </Form>
    </Modal>
  );
}
const stepUrl = (p: PathDetail, s: Step) =>
  `/estudos/learn/${p.subject_id}/${p.id}/etapas/${s.id}`;
function StatusIcon({ status }: { status: Step["status"] }) {
  return (
    <span className={"step-state " + status}>
      {status === "completed" ? (
        <Check size={16} />
      ) : status === "in_progress" ? (
        <span />
      ) : (
        <Circle size={16} />
      )}
    </span>
  );
}
function TopicNode({
  data,
}: NodeProps<Node<{ label: string; status: Step["status"]; href: string }>>) {
  return (
    <div className={"topic-node " + data.status}>
      <Handle type="target" position={Position.Top} />
      <span className="eyebrow">TÓPICO</span>
      <div>
        <StatusIcon status={data.status} />
        <Link className="nodrag" to={data.href}>
          {data.label}
        </Link>
      </div>
      <small>{statusLabels[data.status]}</small>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
const nodeTypes = { topic: TopicNode };
function PathMap({
  path,
  onChanged,
}: {
  path: PathDetail;
  onChanged: () => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);
  const [error, setError] = useState<unknown>(),
    [selectedEdge, setSelectedEdge] = useState("");
  useEffect(() => {
    setNodes(
      path.steps.map((s) => ({
        id: s.id,
        type: "topic",
        position: { x: s.x, y: s.y },
        data: { label: s.title, status: s.status, href: stepUrl(path, s) },
      })),
    );
    setEdges(
      path.edges.map((e) => ({
        ...e,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "#a7ba8d", strokeWidth: 2 },
      })),
    );
  }, [path]);
  const connect = useCallback(
    async (c: Connection) => {
      try {
        await api(
          "/paths/" + path.id + "/edges",
          json("POST", { source: c.source, target: c.target }),
        );
        setError(undefined);
        onChanged();
      } catch (e) {
        setError(e);
      }
    },
    [path.id, onChanged],
  );
  return (
    <>
      <ErrorMessage error={error} />
      <div className="map-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={connect}
          onEdgeClick={(_, e) => setSelectedEdge(e.id)}
          onNodeDragStop={async (_, n) => {
            try {
              await api(
                "/steps/" + n.id,
                json("PATCH", { x: n.position.x, y: n.position.y }),
              );
              setError(undefined);
            } catch (e) {
              setError(e);
              onChanged();
            }
          }}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.2}
          maxZoom={2}
          deleteKeyCode={null}
          colorMode="dark"
          aria-label="Mapa do caminho"
        >
          <Background gap={22} size={1} />
          <Controls />
        </ReactFlow>
      </div>
      <div className="map-help">
        <small>
          Conecte os pontos para sugerir uma sequência. Arraste para organizar;
          abra o título para escrever suas notas.
        </small>
        {selectedEdge && (
          <button
            onClick={() =>
              api("/edges/" + selectedEdge, { method: "DELETE" })
                .then(() => {
                  setSelectedEdge("");
                  onChanged();
                })
                .catch(setError)
            }
          >
            <Trash2 size={14} />
            Remover conexão selecionada
          </button>
        )}
      </div>
      <details className="connection-details">
        <summary>Criar conexão pelos nomes dos tópicos</summary>
        <Form
          submit="Conectar tópicos"
          onSubmit={async (d) => {
            await api(
              "/paths/" + path.id + "/edges",
              json("POST", {
                source: field(d, "source"),
                target: field(d, "target"),
              }),
            );
            onChanged();
          }}
        >
          <div className="fields">
            <label>
              De
              <select name="source" required>
                {path.steps.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Para
              <select name="target" required>
                {path.steps.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Form>
      </details>
    </>
  );
}
export function PathPage() {
  const { subjectId, pathId } = useParams();
  const { subjects, refresh } = useWorkspace();
  const {
    data: path,
    error,
    reload,
  } = useLoad(() => api<PathDetail>("/paths/" + pathId), [pathId]);
  const [moduleForm, setModuleForm] = useState<Module | "new">(),
    [stepForm, setStepForm] = useState<{ step?: Step; moduleId?: string }>(),
    [edit, setEdit] = useState(false),
    [view, setView] = useState<"map" | "list">(() =>
      window.matchMedia("(max-width:720px)").matches ? "list" : "map",
    ),
    [actionError, setError] = useState<unknown>();
  function changed() {
    reload();
    refresh();
  }
  if (!path) return error ? <ErrorMessage error={error} /> : <Loading />;
  if (path.subject_id !== subjectId)
    return (
      <Empty
        title="Este caminho pertence a outra matéria"
        action={
          <Link to={`/estudos/learn/${path.subject_id}/${path.id}`}>
            Abrir caminho
          </Link>
        }
      />
    );
  const completed = path.steps.filter((s) => s.status === "completed").length;
  async function saveOrder(modules: Module[], steps: Step[]) {
    try {
      await api(
        "/paths/" + path!.id + "/order",
        json("PUT", {
          modules: modules.map((m) => m.id),
          steps: steps.map((s) => ({ id: s.id, module_id: s.module_id })),
        }),
      );
      changed();
    } catch (e) {
      setError(e);
    }
  }
  function moveModule(index: number, delta: number) {
    const list = [...path!.modules];
    [list[index], list[index + delta]] = [list[index + delta], list[index]];
    saveOrder(list, path!.steps);
  }
  function moveStep(s: Step, delta: number) {
    const group = path!.steps.filter((x) => x.module_id === s.module_id);
    const i = group.findIndex((x) => x.id === s.id);
    [group[i], group[i + delta]] = [group[i + delta], group[i]];
    saveOrder(
      path!.modules,
      path!.modules.flatMap((m) =>
        m.id === s.module_id
          ? group
          : path!.steps.filter((x) => x.module_id === m.id),
      ),
    );
  }
  function rows(steps: Step[], ordered = false) {
    return steps.map((s, i) => (
      <div className="learning-step" key={s.id}>
        <StatusIcon status={s.status} />
        <Link to={stepUrl(path!, s)} className="grow">
          <strong>{s.title}</strong>
          <small>
            {statusLabels[s.status]}
            {s.material_ids.length
              ? ` · ${s.material_ids.length} materiais`
              : ""}
          </small>
        </Link>
        {ordered && (
          <div className="reorder-actions">
            <IconButton
              label={"Subir " + s.title}
              disabled={i === 0}
              onClick={() => moveStep(s, -1)}
            >
              <ArrowUp size={14} />
            </IconButton>
            <IconButton
              label={"Descer " + s.title}
              disabled={i === steps.length - 1}
              onClick={() => moveStep(s, 1)}
            >
              <ArrowDown size={14} />
            </IconButton>
          </div>
        )}
        <IconButton
          label={"Editar " + s.title}
          onClick={() => setStepForm({ step: s })}
        >
          <Pencil size={14} />
        </IconButton>
        <Link
          className="icon-button"
          aria-label={"Abrir " + s.title}
          to={stepUrl(path!, s)}
        >
          <ArrowUpRight size={15} />
        </Link>
      </div>
    ));
  }
  return (
    <>
      <Link className="back-link" to={"/estudos/learn/" + path.subject_id}>
        <ArrowLeft size={15} />
        {subjects.find((s) => s.id === path.subject_id)?.title || "Matéria"}
      </Link>
      <PageTitle
        eyebrow={
          path.type === "map"
            ? "LEARN / MAPA COM RAMIFICAÇÕES"
            : "LEARN / MÓDULOS E ETAPAS"
        }
        title={path.title}
        description={path.description || "Cada etapa, uma nova descoberta."}
        action={
          <button onClick={() => setEdit(true)}>
            <Pencil size={15} />
            Editar caminho
          </button>
        }
      />
      {path.archived > 0 && (
        <div className="notice">
          Este caminho está arquivado. Suas notas e sessões estão preservadas.
        </div>
      )}
      <div className="path-progress">
        <Progress done={completed} total={path.steps.length} />
        <span className="muted">
          {path.type === "map"
            ? "Você escolhe a ordem de explorar."
            : "Um passo de cada vez."}
        </span>
      </div>
      <ErrorMessage error={actionError} />
      {path.type === "modules" ? (
        <>
          <div className="section-caption">
            <h2>Módulos do caminho</h2>
            <button onClick={() => setModuleForm("new")}>
              <Plus size={15} />
              Novo módulo
            </button>
          </div>
          {path.modules.map((m, i) => (
            <Panel
              key={m.id}
              title={`${String(i + 1).padStart(2, "0")} · ${m.title}`}
              action={
                <div className="inline-actions">
                  <IconButton
                    label={"Subir módulo " + m.title}
                    disabled={i === 0}
                    onClick={() => moveModule(i, -1)}
                  >
                    <ArrowUp size={14} />
                  </IconButton>
                  <IconButton
                    label={"Descer módulo " + m.title}
                    disabled={i === path.modules.length - 1}
                    onClick={() => moveModule(i, 1)}
                  >
                    <ArrowDown size={14} />
                  </IconButton>
                  <IconButton
                    label={"Renomear " + m.title}
                    onClick={() => setModuleForm(m)}
                  >
                    <Pencil size={14} />
                  </IconButton>
                </div>
              }
            >
              {rows(
                path.steps.filter((s) => s.module_id === m.id),
                true,
              )}
              <button
                className="add-step"
                onClick={() => setStepForm({ moduleId: m.id })}
              >
                <Plus size={16} />
                Adicionar etapa
              </button>
            </Panel>
          ))}
          {!path.modules.length && (
            <Panel>
              <Empty
                title="Dê o primeiro passo"
                action={
                  <button onClick={() => setModuleForm("new")}>
                    <Plus size={16} />
                    Criar primeiro módulo
                  </button>
                }
              >
                Divida seu caminho em módulos e, depois, adicione etapas.
              </Empty>
            </Panel>
          )}
        </>
      ) : (
        <>
          <div className="section-caption">
            <div className="tabs">
              <button
                className={view === "map" ? "active" : ""}
                onClick={() => setView("map")}
              >
                <GitBranch size={15} />
                Mapa
              </button>
              <button
                className={view === "list" ? "active" : ""}
                onClick={() => setView("list")}
              >
                <List size={15} />
                Lista de tópicos
              </button>
            </div>
            <AddButton onClick={() => setStepForm({})}>Novo tópico</AddButton>
          </div>
          <Panel>
            {path.steps.length ? (
              view === "map" ? (
                <PathMap path={path} onChanged={changed} />
              ) : (
                <>
                  {rows(path.steps)}
                  <div className="panel-padding">
                    <h3>Conexões sugeridas</h3>
                    {path.edges.length ? (
                      path.edges.map((e) => (
                        <div className="connection-row" key={e.id}>
                          <span>
                            {path.steps.find((s) => s.id === e.source)?.title} →{" "}
                            {path.steps.find((s) => s.id === e.target)?.title}
                          </span>
                          <IconButton
                            label="Remover conexão"
                            onClick={() =>
                              api("/edges/" + e.id, { method: "DELETE" })
                                .then(changed)
                                .catch(setError)
                            }
                          >
                            <Trash2 size={14} />
                          </IconButton>
                        </div>
                      ))
                    ) : (
                      <p>
                        Nenhuma conexão. Use a aba Mapa para conectar seus
                        tópicos.
                      </p>
                    )}
                  </div>
                  <div className="connection-details">
                    <Form
                      submit="Conectar tópicos"
                      onSubmit={async (d) => {
                        await api(
                          "/paths/" + path.id + "/edges",
                          json("POST", {
                            source: field(d, "source"),
                            target: field(d, "target"),
                          }),
                        );
                        changed();
                      }}
                    >
                      <div className="fields">
                        <label>
                          De
                          <select name="source">
                            {path.steps.map((s) => (
                              <option value={s.id} key={s.id}>
                                {s.title}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Para
                          <select name="target">
                            {path.steps.map((s) => (
                              <option value={s.id} key={s.id}>
                                {s.title}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </Form>
                  </div>
                </>
              )
            ) : (
              <Empty
                title="Conecte suas próximas descobertas"
                action={
                  <button onClick={() => setStepForm({})}>
                    <Plus size={16} />
                    Criar primeiro tópico
                  </button>
                }
              >
                Crie tópicos e ligue-os para desenhar seu caminho.
              </Empty>
            )}
          </Panel>
        </>
      )}
      <button
        className="text-button muted"
        onClick={async () => {
          if (
            !path.archived &&
            !confirm(
              "Arquivar este caminho? As notas e sessões serão preservadas.",
            )
          )
            return;
          try {
            await api(
              "/paths/" + path.id,
              json("PATCH", { archived: !path.archived }),
            );
            changed();
          } catch (e) {
            setError(e);
          }
        }}
      >
        <Archive size={15} />
        {path.archived ? "Restaurar caminho" : "Arquivar caminho"}
      </button>
      {moduleForm && (
        <ModuleForm
          pathId={path.id}
          module={moduleForm === "new" ? undefined : moduleForm}
          onClose={() => setModuleForm(undefined)}
          onSaved={changed}
        />
      )}{" "}
      {stepForm && (
        <StepForm
          path={path}
          {...stepForm}
          onClose={() => setStepForm(undefined)}
          onSaved={changed}
        />
      )}{" "}
      {edit && (
        <PathForm
          path={path}
          onClose={() => setEdit(false)}
          onSaved={changed}
        />
      )}
    </>
  );
}
function MaterialsPicker({
  step,
  onClose,
  onSaved,
}: {
  step: Step;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data, error, reload } = useLoad(() => api<Material[]>("/materials"));
  const [selected, setSelected] = useState(step.material_ids),
    [search, setSearch] = useState(""),
    [creating, setCreating] = useState(false);
  return (
    <Modal title="Materiais desta etapa" onClose={onClose}>
      <Form
        onCancel={onClose}
        onSubmit={async () => {
          await api(
            "/steps/" + step.id + "/materials",
            json("PUT", { material_ids: selected }),
          );
          onSaved();
          onClose();
        }}
      >
        <label>
          Buscar na Biblioteca
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Título ou autor"
          />
        </label>
        <ErrorMessage error={error} />
        <div className="material-picker">
          {data
            ? data
                .filter((m) =>
                  (m.title + " " + m.author)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((m) => (
                  <label key={m.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(m.id)}
                      onChange={(e) =>
                        setSelected((v) =>
                          e.target.checked
                            ? [...v, m.id]
                            : v.filter((x) => x !== m.id),
                        )
                      }
                    />
                    <span>
                      <strong>{m.title}</strong>
                      <small>{m.author}</small>
                    </span>
                  </label>
                ))
            : !error && <Loading />}
          {data && !data.length && <p>A Biblioteca ainda está vazia.</p>}
        </div>
        <button type="button" onClick={() => setCreating(true)}>
          <Plus size={15} />
          Adicionar novo material
        </button>
      </Form>
      {creating && (
        <MaterialForm onClose={() => setCreating(false)} onSaved={reload} />
      )}
    </Modal>
  );
}
export function StepPage() {
  const { subjectId, pathId, stepId } = useParams();
  const { refresh } = useWorkspace();
  const { data, error, reload } = useLoad(
    () =>
      Promise.all([
        api<PathDetail>("/paths/" + pathId),
        api<Step>("/steps/" + stepId),
        api<Note>("/steps/" + stepId + "/note"),
        api<Material[]>("/materials"),
      ]),
    [pathId, stepId],
  );
  const [session, setSession] = useState(false),
    [picker, setPicker] = useState(false),
    [edit, setEdit] = useState(false),
    [actionError, setError] = useState<unknown>();
  if (!data) return error ? <ErrorMessage error={error} /> : <Loading />;
  const [path, step, note, materials] = data;
  if (step.path_id !== path.id || path.subject_id !== subjectId)
    return <Empty title="Etapa não encontrada neste caminho" />;
  const index = path.steps.findIndex((s) => s.id === step.id),
    next = path.steps[index + 1];
  return (
    <>
      <Link className="back-link" to={`/estudos/learn/${subjectId}/${pathId}`}>
        <ArrowLeft size={15} />
        {path.title}
      </Link>
      <PageTitle
        eyebrow={path.type === "map" ? "LEARN / TÓPICO" : "LEARN / ETAPA"}
        title={step.title}
        description={
          path.type === "modules"
            ? path.modules.find((m) => m.id === step.module_id)?.title
            : "Explore no seu próprio ritmo."
        }
        action={
          <div className="inline-actions">
            <button
              onClick={() => setEdit(true)}
              aria-label="Editar título da etapa"
            >
              <Pencil size={15} />
            </button>
            <button onClick={() => setSession(true)}>
              <Plus size={15} />
              Registrar estudo
            </button>
          </div>
        }
      />
      <div className="step-toolbar">
        <label className="inline-label">
          Progresso
          <select
            aria-label="Estado da etapa"
            value={step.status}
            onChange={async (e) => {
              try {
                await api(
                  "/steps/" + step.id,
                  json("PATCH", { status: e.target.value }),
                );
                reload();
                refresh();
              } catch (e) {
                setError(e);
              }
            }}
          >
            {Object.entries(statusLabels).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">
          Marcar uma etapa não registra tempo de estudo.
        </span>
      </div>
      <ErrorMessage error={actionError} />
      <div className="note-layout">
        <div>
          <NoteEditor key={step.id} note={note} />
          {next && (
            <div className="next-step">
              <small>PRÓXIMA ETAPA NA LISTA</small>
              <TextLink to={stepUrl(path, next)}>{next.title}</TextLink>
            </div>
          )}
        </div>
        <Panel
          title="Materiais da etapa"
          action={
            <IconButton
              label="Vincular materiais"
              onClick={() => setPicker(true)}
            >
              <Plus size={17} />
            </IconButton>
          }
        >
          {step.material_ids.length ? (
            <div className="linked-materials">
              {materials
                .filter((m) => step.material_ids.includes(m.id))
                .map((m) => (
                  <Link key={m.id} to={"/estudos/biblioteca/" + m.id}>
                    <BookOpen size={17} />
                    <span>
                      {m.title}
                      <small>{m.author || "Da sua Biblioteca"}</small>
                    </span>
                    <ArrowUpRight size={14} />
                  </Link>
                ))}
            </div>
          ) : (
            <div className="panel-padding">
              <p>Tenha suas referências por perto.</p>
              <button className="text-button" onClick={() => setPicker(true)}>
                <Plus size={14} />
                Vincular da Biblioteca
              </button>
            </div>
          )}
        </Panel>
      </div>
      {session && (
        <SessionForm
          defaults={{
            subject_id: path.subject_id,
            path_id: path.id,
            step_id: step.id,
          }}
          onClose={() => setSession(false)}
          onSaved={refresh}
        />
      )}{" "}
      {picker && (
        <MaterialsPicker
          step={step}
          onClose={() => setPicker(false)}
          onSaved={reload}
        />
      )}{" "}
      {edit && (
        <StepForm
          path={path}
          step={step}
          onClose={() => setEdit(false)}
          onSaved={reload}
        />
      )}
    </>
  );
}
