import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Clock3,
  Flame,
  Route as RouteIcon,
  ArrowUpRight,
  Pencil,
  Trash2,
  Library,
  Plus,
} from "lucide-react";
import { api, duration, formatDate, json, today } from "./api";
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
import { activityLevel, calendarDays } from "./calendar";
import { useWorkspace } from "./workspace";
import type { Activity, Item, PathDetail, StudySession } from "./types";
import { ItemForm, ItemList } from "./organizer";

export function SessionForm({
  session,
  defaults,
  onClose,
  onSaved,
}: {
  session?: StudySession;
  defaults?: {
    subject_id?: string;
    path_id?: string;
    step_id?: string;
    date?: string;
  };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { subjects, paths } = useWorkspace();
  const [subject, setSubject] = useState(
    session?.subject_id ||
      defaults?.subject_id ||
      subjects.find((s) => !s.archived)?.id ||
      "",
  );
  const [path, setPath] = useState(session?.path_id || defaults?.path_id || "");
  const [step, setStep] = useState(session?.step_id || defaults?.step_id || "");
  const { data: detail, error } = useLoad(
    () => (path ? api<PathDetail>("/paths/" + path) : Promise.resolve(null)),
    [path],
  );
  return (
    <Modal
      title={session ? "Editar sessão" : "Registrar estudo"}
      onClose={onClose}
    >
      <p className="muted">Um registro do tempo que você dedicou a aprender.</p>
      <Form
        onCancel={onClose}
        submit={session ? "Salvar sessão" : "Registrar estudo"}
        onSubmit={async (d) => {
          await api(
            session ? "/sessions/" + session.id : "/sessions",
            json(session ? "PUT" : "POST", {
              subject_id: subject,
              path_id: path || null,
              step_id: step || null,
              date: field(d, "date"),
              minutes: Number(field(d, "minutes")),
              notes: field(d, "notes"),
            }),
          );
          onSaved();
          onClose();
        }}
      >
        <label>
          Matéria
          <select
            required
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setPath("");
              setStep("");
            }}
          >
            <option value="" disabled>
              Selecione a matéria
            </option>
            {subjects
              .filter((s) => !s.archived || s.id === subject)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                  {s.archived ? " (arquivada)" : ""}
                </option>
              ))}
          </select>
        </label>
        {!subjects.length && (
          <div className="notice">
            Crie uma matéria no{" "}
            <Link to="/estudos/learn" onClick={onClose}>
              Learn
            </Link>{" "}
            para registrar seu primeiro estudo.
          </div>
        )}
        <div className="fields">
          <label>
            Data
            <input
              name="date"
              type="date"
              required
              max={today()}
              defaultValue={session?.date || defaults?.date || today()}
            />
          </label>
          <label>
            Duração (minutos)
            <input
              name="minutes"
              type="number"
              min={1}
              max={1440}
              required
              placeholder="Ex.: 45"
              defaultValue={session?.minutes}
            />
          </label>
        </div>
        <label>
          Caminho <span className="optional">opcional</span>
          <select
            value={path}
            onChange={(e) => {
              setPath(e.target.value);
              setStep("");
            }}
          >
            <option value="">Estudo livre da matéria</option>
            {paths
              .filter(
                (p) =>
                  p.subject_id === subject && (!p.archived || p.id === path),
              )
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
          </select>
        </label>
        {path && (
          <label>
            Etapa ou tópico <span className="optional">opcional</span>
            <select
              value={step}
              disabled={!detail || detail.id !== path}
              onChange={(e) => setStep(e.target.value)}
            >
              <option value="">Sem etapa específica</option>
              {detail?.id === path &&
                detail.steps.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
            </select>
          </label>
        )}
        <ErrorMessage error={error} />
        <label>
          Como foi o estudo? <span className="optional">opcional</span>
          <textarea
            name="notes"
            defaultValue={session?.notes}
            placeholder="O que você aprendeu ou quer retomar?"
          />
        </label>
      </Form>
    </Modal>
  );
}
function Heatmap({
  year,
  activity,
  selected,
  onSelect,
}: {
  year: number;
  activity: Activity;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const days = useMemo(() => calendarDays(year), [year]);
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = grid.current?.querySelector<HTMLButtonElement>(
      `[data-date="${selected}"]`,
    );
    const scroll = grid.current?.closest(".heatmap-scroll");
    if (el && scroll) {
      const a = el.getBoundingClientRect(),
        b = scroll.getBoundingClientRect();
      if (a.right > b.right || a.left < b.left)
        scroll.scrollLeft += a.left - b.left - b.width / 2;
    }
  }, [selected, year]);
  const totals = new Map(activity.days.map((d) => [d.date, d]));
  const months = days
    .map((d, i) => ({ ...d, index: i }))
    .filter((d) => d.inYear && d.day === 1);
  return (
    <div className="heatmap-area">
      <div className="heatmap-scroll">
        <div className="heatmap-labels">
          <span>Seg</span>
          <span>Qua</span>
          <span>Sex</span>
        </div>
        <div
          className="heatmap-inner"
          style={{ "--weeks": days.length / 7 } as React.CSSProperties}
        >
          <div className="heatmap-months">
            {months.map((d) => (
              <span
                key={d.date}
                style={{ gridColumn: Math.floor(d.index / 7) + 1 }}
              >
                {new Date(d.date + "T12:00:00Z")
                  .toLocaleDateString("pt-BR", {
                    month: "short",
                    timeZone: "UTC",
                  })
                  .replace(".", "")}
              </span>
            ))}
          </div>
          <div
            className="heatmap-grid"
            ref={grid}
            onKeyDown={(e) => {
              const offset = {
                ArrowRight: 7,
                ArrowLeft: -7,
                ArrowUp: -1,
                ArrowDown: 1,
              }[e.key];
              if (offset === undefined) return;
              e.preventDefault();
              const current = (e.target as HTMLElement).dataset.date;
              const i = days.findIndex((d) => d.date === current);
              const next = days[i + offset];
              if (next?.inYear && next.date <= today()) {
                onSelect(next.date);
                grid.current
                  ?.querySelector<HTMLButtonElement>(
                    `[data-date="${next.date}"]`,
                  )
                  ?.focus();
              }
            }}
          >
            {days.map((d) => {
              const value = totals.get(d.date);
              const unavailable = !d.inYear || d.date > today();
              return d.inYear ? (
                <button
                  key={d.date}
                  data-date={d.date}
                  disabled={unavailable}
                  tabIndex={d.date === selected ? 0 : -1}
                  className={`heat-cell level-${activityLevel(value?.minutes || 0)} ${selected === d.date ? "chosen" : ""} ${d.date === today() ? "is-today" : ""}`}
                  title={`${formatDate(d.date)} · ${value?.minutes ? duration(value.minutes) : "Sem estudo registrado"}`}
                  aria-label={`${formatDate(d.date)}: ${value?.minutes || 0} minutos em ${value?.sessions || 0} sessões`}
                  aria-pressed={selected === d.date}
                  onClick={() => onSelect(d.date)}
                />
              ) : (
                <span className="heat-placeholder" key={d.date} />
              );
            })}
          </div>
        </div>
      </div>
      <div className="heatmap-foot">
        <small>
          <strong>{activity.active_days} dias ativos</strong> em {year}. Cada
          sessão conta.
        </small>
        <div className="heatmap-legend">
          <span>Menos</span>
          {[0, 1, 2, 3, 4].map((n) => (
            <span
              key={n}
              className={"heat-cell level-" + n}
              title={
                [
                  "Sem estudo",
                  "1–29 min",
                  "30–59 min",
                  "60–119 min",
                  "120 min ou mais",
                ][n]
              }
            />
          ))}
          <span>Mais</span>
        </div>
      </div>
    </div>
  );
}
export function StudyHome() {
  const { subjects, paths, refresh } = useWorkspace();
  const [year, setYear] = useState(Number(today().slice(0, 4))),
    [selected, setSelected] = useState(today()),
    [form, setForm] = useState<StudySession | "new">(),
    [addingTask, setAddingTask] = useState(false),
    [actionError, setError] = useState<unknown>();
  const { data, error, reload } = useLoad(
    () =>
      Promise.all([
        api<Activity>("/activity?year=" + year),
        api<StudySession[]>("/sessions?year=" + year),
        api<Item[]>("/items"),
      ]),
    [year],
  );
  function changed() {
    reload();
    refresh();
  }
  if (!data) return error ? <ErrorMessage error={error} /> : <Loading />;
  const [activity, sessions, items] = data;
  const daySessions = sessions.filter((s) => s.date === selected);
  const activePaths = paths
    .filter(
      (p) =>
        !p.archived &&
        !subjects.find((s) => s.id === p.subject_id)?.archived &&
        p.total > p.completed,
    )
    .slice(0, 3);
  const yearNow = Number(today().slice(0, 4));
  const activeYear = activity.year;
  return (
    <>
      <PageTitle
        eyebrow="UM POUCO, TODOS OS DIAS"
        title="Estudos"
        description="Dê espaço ao que você quer aprender."
        action={
          <AddButton onClick={() => setForm("new")}>Registrar estudo</AddButton>
        }
      />
      <div className="study-shortcuts">
        <Link to="/estudos/biblioteca">
          <Library size={18} />
          <span>Biblioteca</span>
          <ArrowUpRight size={16} />
        </Link>
        <Link to="/estudos/learn">
          <RouteIcon size={18} />
          <span>Learn · seus caminhos</span>
          <ArrowUpRight size={16} />
        </Link>
      </div>
      <ErrorMessage error={actionError || error} />
      <div className="stats">
        <Panel>
          <span className="stat-label">
            <Flame size={17} />
            Dias ativos
          </span>
          <strong className="stat-value">{activity.active_days}</strong>
          <small className="muted">em {activeYear}</small>
        </Panel>
        <Panel>
          <span className="stat-label">
            <Clock3 size={17} />
            Tempo de estudo
          </span>
          <strong className="stat-value">{duration(activity.minutes)}</strong>
          <small className="muted">dedicados a aprender em {activeYear}</small>
        </Panel>
        <Panel>
          <span className="stat-label">
            <RouteIcon size={17} />
            Caminhos em andamento
          </span>
          <strong className="stat-value">
            {String(activity.paths_in_progress).padStart(2, "0")}
          </strong>
          <small className="muted">um passo de cada vez</small>
        </Panel>
      </div>
      <Panel
        title="Sua constância"
        className="activity-panel"
        action={
          <select
            className="compact-select"
            aria-label="Ano de atividade"
            value={year}
            onChange={(e) => {
              const y = Number(e.target.value);
              setYear(y);
              setSelected(y === yearNow ? today() : `${y}-01-01`);
            }}
          >
            {Array.from({ length: yearNow - 1899 }, (_, i) => yearNow - i).map(
              (y) => (
                <option key={y}>{y}</option>
              ),
            )}
          </select>
        }
      >
        <Heatmap
          year={activeYear}
          activity={activity}
          selected={selected}
          onSelect={setSelected}
        />
      </Panel>
      <div className="columns">
        <Panel
          title={"Estudos de " + formatDate(selected)}
          action={
            <span className="tag">
              {duration(daySessions.reduce((n, s) => n + s.minutes, 0))}
            </span>
          }
        >
          {daySessions.length ? (
            daySessions.map((s) => (
              <div className="session-row" key={s.id}>
                <div
                  className="subject-dot"
                  style={{
                    background: subjects.find((x) => x.id === s.subject_id)
                      ?.color,
                  }}
                />
                <div className="grow">
                  <strong>
                    {subjects.find((x) => x.id === s.subject_id)?.title ||
                      "Matéria"}
                  </strong>
                  <small>
                    {s.path_id
                      ? paths.find((p) => p.id === s.path_id)?.title
                      : "Estudo livre"}
                    {s.notes && <span className="row-notes">{s.notes}</span>}
                  </small>
                </div>
                <span className="session-time">{duration(s.minutes)}</span>
                <IconButton label="Editar sessão" onClick={() => setForm(s)}>
                  <Pencil size={14} />
                </IconButton>
                <IconButton
                  label="Excluir sessão"
                  onClick={() => {
                    if (confirm("Excluir esta sessão de estudo?"))
                      api("/sessions/" + s.id, { method: "DELETE" })
                        .then(changed)
                        .catch(setError);
                  }}
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ))
          ) : (
            <Empty
              title="Cada dia é um novo começo"
              action={
                <button onClick={() => setForm("new")}>
                  <Plus size={15} />
                  Registrar estudo neste dia
                </button>
              }
            >
              Nenhuma sessão registrada neste dia.
            </Empty>
          )}
        </Panel>
        <Panel
          title="Continue de onde parou"
          action={<TextLink to="/estudos/learn">Abrir Learn</TextLink>}
        >
          {activePaths.length ? (
            <div className="continue-list">
              {activePaths.map((p) => (
                <Link key={p.id} to={`/estudos/learn/${p.subject_id}/${p.id}`}>
                  <span className="eyebrow">
                    {subjects.find((s) => s.id === p.subject_id)?.title}
                  </span>
                  <strong>
                    {p.title}
                    <ArrowUpRight size={16} />
                  </strong>
                  <Progress done={p.completed} total={p.total} />
                </Link>
              ))}
            </div>
          ) : (
            <Empty
              title="Seu próximo caminho começa aqui"
              action={
                <Link className="button" to="/estudos/learn">
                  Criar no Learn
                </Link>
              }
            >
              Organize uma matéria e escolha o que aprender.
            </Empty>
          )}
        </Panel>
      </div>
      <Panel
        title="Atividades planejadas"
        action={
          <button className="text-button" onClick={() => setAddingTask(true)}>
            <Plus size={14} />
            Planejar atividade
          </button>
        }
      >
        <ItemList
          items={items.filter((i) => i.type === "estudos")}
          onChanged={reload}
        />
        {!items.some((i) => i.type === "estudos") && (
          <div className="panel-padding muted">
            Reserve aqui suas próximas atividades. O calendário de constância
            considera apenas sessões registradas.
          </div>
        )}
      </Panel>
      {form && (
        <SessionForm
          session={form === "new" ? undefined : form}
          defaults={{ date: selected }}
          onClose={() => setForm(undefined)}
          onSaved={changed}
        />
      )}{" "}
      {addingTask && (
        <ItemForm
          type="estudos"
          onClose={() => setAddingTask(false)}
          onSaved={reload}
        />
      )}
    </>
  );
}
