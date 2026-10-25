import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Pencil,
  Plus,
} from "lucide-react";
import { api, json, today, formatDate } from "./api";
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
  TextLink,
  field,
  useLoad,
} from "./ui";
import type { Item } from "./types";
const types = {
  estudos: "Estudos",
  treinos: "Treinos",
  lembretes: "Lembretes",
  eventos: "Calendário",
};
export function ItemForm({
  item,
  type,
  date,
  onClose,
  onSaved,
}: {
  item?: Item;
  type?: Item["type"];
  date?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Modal title={item ? "Editar item" : "Novo item"} onClose={onClose}>
      <Form
        onCancel={onClose}
        onSubmit={async (d) => {
          await api(
            item ? "/items/" + item.id : "/items",
            json(item ? "PATCH" : "POST", {
              title: field(d, "title"),
              type: field(d, "type"),
              date: field(d, "date"),
              time: field(d, "time"),
              notes: field(d, "notes"),
            }),
          );
          onSaved();
          onClose();
        }}
      >
        <label>
          Título
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={item?.title}
            placeholder="O que você quer organizar?"
          />
        </label>
        <label>
          Área
          <select name="type" defaultValue={item?.type || type || "lembretes"}>
            {Object.entries(types).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <div className="fields">
          <label>
            Data
            <input
              type="date"
              name="date"
              defaultValue={item?.date || date || today()}
              required
            />
          </label>
          <label>
            Horário
            <input type="time" name="time" defaultValue={item?.time} />
          </label>
        </div>
        <label>
          Detalhes
          <textarea name="notes" defaultValue={item?.notes} />
        </label>
      </Form>
    </Modal>
  );
}
export function ItemList({
  items,
  onChanged,
}: {
  items: Item[];
  onChanged: () => void;
}) {
  const [edit, setEdit] = useState<Item>(),
    [error, setError] = useState<unknown>();
  return (
    <>
      <ErrorMessage error={error} />
      {items.map((i) => (
        <div key={i.id} className={"item-row " + (i.done ? "done" : "")}>
          <input
            className="checkbox"
            type="checkbox"
            checked={i.done}
            aria-label={"Concluir " + i.title}
            onChange={(e) =>
              api("/items/" + i.id, json("PATCH", { done: e.target.checked }))
                .then(onChanged)
                .catch(setError)
            }
          />
          <div className="grow">
            <strong>{i.title}</strong>
            <small>
              {formatDate(i.date)} {i.time && "· " + i.time}
              {i.notes && <span className="row-notes">{i.notes}</span>}
            </small>
          </div>
          <span className="tag">{types[i.type]}</span>
          <IconButton label={"Editar " + i.title} onClick={() => setEdit(i)}>
            <Pencil size={14} />
          </IconButton>
          <IconButton
            label={"Excluir " + i.title}
            onClick={() => {
              if (confirm("Excluir este item?"))
                api("/items/" + i.id, { method: "DELETE" })
                  .then(onChanged)
                  .catch(setError);
            }}
          >
            <Trash2 size={14} />
          </IconButton>
        </div>
      ))}
      {edit && (
        <ItemForm
          item={edit}
          onClose={() => setEdit(undefined)}
          onSaved={onChanged}
        />
      )}
    </>
  );
}
function Calendar({
  items,
  selected,
  onSelect,
}: {
  items: Item[];
  selected: string;
  onSelect: (d: string) => void;
}) {
  const [month, setMonth] = useState(selected.slice(0, 7));
  const [y, m] = month.split("-").map(Number);
  const offset = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  function move(n: number) {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(d.toISOString().slice(0, 7));
  }
  return (
    <div className="month-calendar">
      <div className="cal-bar">
        <strong>
          {new Date(month + "-15T12:00:00Z").toLocaleDateString("pt-BR", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        </strong>
        <div>
          <IconButton label="Mês anterior" onClick={() => move(-1)}>
            <ChevronLeft size={17} />
          </IconButton>
          <IconButton label="Próximo mês" onClick={() => move(1)}>
            <ChevronRight size={17} />
          </IconButton>
        </div>
      </div>
      <div className="month-grid">
        {["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map((x) => (
          <small key={x}>{x}</small>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={"o" + i} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const key = `${month}-${String(i + 1).padStart(2, "0")}`;
          return (
            <button
              key={key}
              aria-label={formatDate(key)}
              aria-pressed={key === selected}
              className={
                (key === today() ? "today " : "") +
                (selected === key ? "selected " : "") +
                (items.some((x) => x.date === key) ? "has-items" : "")
              }
              onClick={() => onSelect(key)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <small className="muted">Selecione um dia para ver sua agenda.</small>
    </div>
  );
}
export function Organizer({ type }: { type?: Item["type"] }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedDate = params.get("date") || "";
  const initialDate =
    /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) &&
    !isNaN(new Date(requestedDate + "T12:00:00Z").getTime())
      ? requestedDate
      : today();
  const { data: items, error, reload } = useLoad(() => api<Item[]>("/items"));
  const [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState(initialDate),
    [adding, setAdding] = useState(false);
  useEffect(() => {
    window.addEventListener("items-imported", reload);
    return () => window.removeEventListener("items-imported", reload);
  }, []);
  if (!items) return error ? <ErrorMessage error={error} /> : <Loading />;
  const list = items.filter(
    (i) =>
      (!type || i.type === type) &&
      (filter === "all" || (filter === "done" ? i.done : !i.done)),
  );
  return (
    <>
      <PageTitle
        title={type ? types[type] : "Um pouco de ordem, mais leveza."}
        description={
          type
            ? {
                estudos: "Suas atividades de estudo planejadas.",
                treinos: "Sua rotina de movimento começa aqui.",
                lembretes: "Menos coisas na cabeça. Mais clareza no dia.",
                eventos: "Tempo para suas prioridades.",
              }[type]
            : "Tudo o que importa, em um só lugar."
        }
        action={
          <AddButton onClick={() => setAdding(true)}>Novo item</AddButton>
        }
      />
      {!type && (
        <div className="stats four">
          {Object.entries(types).map(([k, v]) => (
            <Panel key={k}>
              <span className="stat-label">{v}</span>
              <strong className="stat-value">
                {String(
                  items.filter((i) => i.type === k && !i.done).length,
                ).padStart(2, "0")}
              </strong>
              <small className="muted">itens em andamento</small>
            </Panel>
          ))}
        </div>
      )}
      {!type || type === "eventos" ? (
        <div className="columns">
          <Panel
            title={
              type ? "Agenda · " + formatDate(selected) : "Próximos passos"
            }
            action={!type && <span className="tag">Sua agenda</span>}
          >
            <ItemList
              items={
                type
                  ? items
                      .filter((i) => i.date === selected)
                      .sort((a, b) => a.time.localeCompare(b.time))
                  : items
                      .filter((i) => !i.done && i.date >= today())
                      .sort((a, b) =>
                        (a.date + a.time).localeCompare(b.date + b.time),
                      )
                      .slice(0, 7)
              }
              onChanged={reload}
            />
            {!(
              type
                ? items.filter((i) => i.date === selected)
                : items.filter((i) => !i.done && i.date >= today())
            ).length && (
              <Empty title="Um pouco de espaço livre">
                Adicione seus próximos passos à agenda.
              </Empty>
            )}
          </Panel>
          <div>
            <Panel title="Seu calendário" action={<CalendarDays size={17} />}>
              <Calendar
                items={items}
                selected={selected}
                onSelect={(date) => {
                  setSelected(date);
                  if (!type) navigate("/eventos?date=" + date);
                }}
              />
            </Panel>
            <div className="quote">
              <span className="eyebrow">NO SEU RITMO</span>
              <p>Pequenos passos também levam longe.</p>
              <TextLink to="/estudos">Continuar aprendendo</TextLink>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="tabs">
            {[
              ["all", "Todos"],
              ["pending", "Em andamento"],
              ["done", "Concluídos"],
            ].map(([k, v]) => (
              <button
                key={k}
                className={filter === k ? "active" : ""}
                onClick={() => setFilter(k)}
              >
                {v}
              </button>
            ))}
          </div>
          <Panel title="Minha lista">
            <ItemList items={list} onChanged={reload} />
            {!list.length && (
              <Empty
                title="Espaço para seus próximos passos"
                action={
                  <button onClick={() => setAdding(true)}>
                    <Plus size={15} />
                    Adicionar item
                  </button>
                }
              >
                Organize no seu ritmo.
              </Empty>
            )}
          </Panel>
        </>
      )}
      {adding && (
        <ItemForm
          type={type}
          date={type === "eventos" ? selected : undefined}
          onClose={() => setAdding(false)}
          onSaved={reload}
        />
      )}
    </>
  );
}
