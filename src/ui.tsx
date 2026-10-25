import {
  Component,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
  type ErrorInfo,
} from "react";
import {
  X,
  Plus,
  AlertCircle,
  LoaderCircle,
  ArrowUpRight,
  FolderOpen,
} from "lucide-react";
import { Link } from "react-router-dom";
export function IconButton({
  label,
  children,
  ...props
}: {
  label: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className="icon-button"
      type="button"
      title={label}
      aria-label={label}
      {...props}
    >
      {children}
    </button>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <FolderOpen size={30} />
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow || "SEU ESPAÇO, SEU RITMO"}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"panel " + className}>
      {title && (
        <div className="panel-head">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function ErrorMessage({ error }: { error: unknown }) {
  return error ? (
    <div role="alert" className="error">
      <AlertCircle size={16} />
      {error instanceof Error ? error.message : String(error)}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={20} /> Carregando seu espaço…
    </div>
  );
}
export function Progress({ done, total }: { done: number; total: number }) {
  const value = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="progress-wrap">
      <div
        className="progress"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progresso do caminho"
      >
        <span style={{ width: value + "%" }} />
      </div>
      <small>
        {done}/{total} etapas · {value}%
      </small>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const initialClose = useRef(onClose);
  initialClose.current = onClose;
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    const cancel = (e: Event) => {
      e.preventDefault();
      initialClose.current();
    };
    el.addEventListener("cancel", cancel);
    return () => {
      el.removeEventListener("cancel", cancel);
      el.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <IconButton label="Fechar" onClick={onClose}>
          <X size={20} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
export function Form({
  onSubmit,
  children,
  submit = "Salvar",
  onCancel,
}: {
  onSubmit: (data: FormData) => Promise<void>;
  children: ReactNode;
  submit?: string;
  onCancel?: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError(undefined);
    try {
      await onSubmit(data);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={handle}>
      {children}
      <ErrorMessage error={error} />
      <div className="form-actions">
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button className="primary" disabled={busy} type="submit">
          {busy ? <LoaderCircle className="spin" size={16} /> : null}
          {busy ? "Salvando…" : submit}
        </button>
      </div>
    </form>
  );
}
export const field = (d: FormData, key: string) => String(d.get(key) || "");
export function AddButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="primary" onClick={onClick}>
      <Plus size={17} />
      {children}
    </button>
  );
}
export function TextLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link className="text-link" to={to}>
      {children}
      <ArrowUpRight size={14} />
    </Link>
  );
}
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T>(),
    [error, setError] = useState<unknown>(),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    setError(undefined);
    load()
      .then((v) => {
        if (live) setData(v);
      })
      .catch((e) => {
        if (live) setError(e);
      });
    return () => {
      live = false;
    };
  }, [...deps, version]);
  useEffect(() => {
    setData(undefined);
  }, deps);
  return { data, error, reload: () => setVersion((v) => v + 1), setData };
}
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info);
  }
  render() {
    if (this.state.error)
      return (
        <div className="fatal">
          <h1>Não foi possível abrir esta tela.</h1>
          <p>As alterações já salvas continuam no servidor.</p>
          <button onClick={() => window.location.reload()}>Recarregar</button>
        </div>
      );
    return this.props.children;
  }
}
