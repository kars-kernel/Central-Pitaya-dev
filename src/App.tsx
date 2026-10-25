import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import {
  LayoutDashboard,
  BookOpen,
  Library,
  Route as RouteIcon,
  Dumbbell,
  Bell,
  CalendarDays,
  LockKeyhole,
  LogOut,
  Download,
  Upload,
  Leaf,
  ChevronRight,
} from "lucide-react";
import { api, download, json } from "./api";
import { ErrorMessage, Form, Loading, field, useLoad } from "./ui";
import { Workspace, useWorkspace } from "./workspace";
import { StudyHome } from "./studies";
const LibraryPage = lazy(() =>
  import("./library").then((m) => ({ default: m.LibraryPage })),
);
const MaterialPage = lazy(() =>
  import("./library").then((m) => ({ default: m.MaterialPage })),
);
const LearnPage = lazy(() =>
  import("./learn").then((m) => ({ default: m.LearnPage })),
);
const PathPage = lazy(() =>
  import("./learn").then((m) => ({ default: m.PathPage })),
);
const StepPage = lazy(() =>
  import("./learn").then((m) => ({ default: m.StepPage })),
);
import { Organizer } from "./organizer";

export default function App() {
  const [user, setUser] = useState<string | null>(),
    [initialError, setInitialError] = useState<unknown>();
  useEffect(() => {
    let active = true;
    api<{ username: string }>("/auth/me")
      .then((v) => {
        if (active) setUser(v.username);
      })
      .catch((e) => {
        if (active) {
          setUser(null);
          if (e.status !== 401) setInitialError(e);
        }
      });
    const expired = () => setUser(null);
    window.addEventListener("session-expired", expired);
    return () => {
      active = false;
      window.removeEventListener("session-expired", expired);
    };
  }, []);
  if (user === undefined) return <Loading />;
  if (!user)
    return (
      <div className="login">
        <div className="login-card">
          <Link to="/" className="brand">
            <span className="logo">m.</span> meu espaço
          </Link>
          <span className="eyebrow">UM LUGAR PARA O QUE IMPORTA</span>
          <h1>Bem-vindo ao seu espaço.</h1>
          <p>Entre para continuar seus estudos e sua organização.</p>
          <ErrorMessage error={initialError} />
          <Form
            submit="Entrar no meu espaço"
            onSubmit={async (d) => {
              const v = await api<{ username: string }>(
                "/auth/login",
                json("POST", {
                  username: field(d, "username"),
                  password: field(d, "password"),
                }),
              );
              setUser(v.username);
              setInitialError(undefined);
            }}
          >
            <label>
              Usuário
              <input
                name="username"
                autoComplete="username"
                required
                defaultValue="admin"
              />
            </label>
            <label>
              Senha
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
          </Form>
          <small className="login-private">
            <LockKeyhole size={13} /> Seu servidor. Suas anotações. Seu ritmo.
          </small>
        </div>
        <div className="login-decoration">
          <Leaf size={120} />
          <p>
            Aprender é construir
            <br />
            um caminho de cada vez.
          </p>
        </div>
      </div>
    );
  return (
    <Workspace>
      <Shell user={user} logout={() => setUser(null)} />
    </Workspace>
  );
}
function Shell({ user, logout }: { user: string; logout: () => void }) {
  const location = useLocation();
  const { subjects, paths } = useWorkspace();
  const [error, setError] = useState<unknown>(),
    [message, setMessage] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const { data: legacy, reload } = useLoad(async () => {
    try {
      return JSON.parse(
        localStorage.getItem("meu-espaco-v1") || "[]",
      ) as unknown[];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    window.scrollTo(0, 0);
    setError(undefined);
    setMessage("");
  }, [location.pathname]);
  async function importItems(items: unknown) {
    const result = await api<{ imported: number; skipped: number }>(
      "/import",
      json("POST", items),
    );
    setMessage(
      `${result.imported} itens importados; ${result.skipped} já existiam.`,
    );
    window.dispatchEvent(new Event("items-imported"));
    localStorage.setItem("meu-espaco-migrated", "true");
    reload();
  }
  const names: Record<string, string> = {
    estudos: "Estudos",
    biblioteca: "Biblioteca",
    learn: "Learn",
    treinos: "Treinos",
    lembretes: "Lembretes",
    eventos: "Calendário",
  };
  const segments = location.pathname.split("/").filter(Boolean);
  return (
    <>
      <aside className="sidebar">
        <Link className="brand" to="/">
          <span className="logo">m.</span> meu espaço
        </Link>
        <div className="workspace-label">
          PESSOAL <span>⌄</span>
        </div>
        <nav aria-label="Navegação principal">
          <NavLink to="/" end>
            <LayoutDashboard size={19} />
            Visão geral
          </NavLink>
          <NavLink to="/estudos" end>
            <BookOpen size={19} />
            Estudos
          </NavLink>
          <div className="subnav">
            <NavLink to="/estudos/biblioteca">
              <Library size={17} />
              Biblioteca
            </NavLink>
            <NavLink to="/estudos/learn">
              <RouteIcon size={17} />
              Learn
            </NavLink>
          </div>
          <NavLink to="/treinos">
            <Dumbbell size={19} />
            Treinos
          </NavLink>
          <NavLink to="/lembretes">
            <Bell size={19} />
            Lembretes
          </NavLink>
          <NavLink to="/eventos">
            <CalendarDays size={19} />
            Calendário
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <span>
            <LockKeyhole size={14} /> Espaço privado
          </span>
          <small>Uma coisa de cada vez.</small>
          <div className="profile">
            <b>{user.slice(0, 2).toUpperCase()}</b>
            <div>
              {user}
              <small>Seu espaço pessoal</small>
            </div>
            <button
              className="icon-button"
              aria-label="Sair"
              title="Sair"
              onClick={async () => {
                try {
                  await api("/auth/logout", json("POST"));
                  logout();
                } catch (e) {
                  setError(e);
                }
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumbs">
            <Link to="/">Meu espaço</Link>
            <ChevronRight size={12} />
            {segments.length ? (
              segments.slice(0, 4).map((s, i) => (
                <span key={i}>
                  {i > 0 && <ChevronRight size={12} />}{" "}
                  {names[s] ||
                    (i === 2
                      ? subjects.find((item) => item.id === s)?.title
                      : paths.find((item) => item.id === s)?.title) ||
                    "Detalhes"}
                </span>
              ))
            ) : (
              <span>Visão geral</span>
            )}
          </div>
          <div className="topbar-actions">
            <span className="private-pill">
              <LockKeyhole size={12} /> Só você
            </span>
            <button
              className="icon-button mobile-logout"
              aria-label="Sair da conta"
              onClick={async () => {
                try {
                  await api("/auth/logout", json("POST"));
                  logout();
                } catch (e) {
                  setError(e);
                }
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        {legacy &&
          legacy.length > 0 &&
          !localStorage.getItem("meu-espaco-migrated") && (
            <div className="notice">
              <div>
                <strong>Seus dados antigos estão neste navegador.</strong>
                <p>
                  Importe-os para guardar no servidor. As datas planejadas não
                  contam como sessões de estudo.
                </p>
              </div>
              <button onClick={() => importItems(legacy).catch(setError)}>
                Importar {legacy.length} itens
              </button>
            </div>
          )}
        <ErrorMessage error={error} />
        {message && (
          <div className="notice" role="status">
            {message}
          </div>
        )}
        <div className="view">
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Organizer />} />
              <Route path="/treinos" element={<Organizer type="treinos" />} />
              <Route
                path="/lembretes"
                element={<Organizer type="lembretes" />}
              />
              <Route path="/eventos" element={<Organizer type="eventos" />} />
              <Route path="/estudos" element={<StudyHome />} />
              <Route path="/estudos/biblioteca" element={<LibraryPage />} />
              <Route
                path="/estudos/biblioteca/:materialId"
                element={<MaterialPage />}
              />
              <Route path="/estudos/learn" element={<LearnPage />} />
              <Route path="/estudos/learn/:subjectId" element={<LearnPage />} />
              <Route
                path="/estudos/learn/:subjectId/:pathId"
                element={<PathPage />}
              />
              <Route
                path="/estudos/learn/:subjectId/:pathId/etapas/:stepId"
                element={<StepPage />}
              />
              <Route path="*" element={<Navigate to="/estudos" replace />} />
            </Routes>
          </Suspense>
        </div>
        <footer>
          <span>Seu espaço, seu ritmo.</span>
          <div>
            <span className="footer-storage">Salvo no seu servidor</span>
            <button
              onClick={() =>
                api("/export")
                  .then((v) => download("meu-espaco.json", v))
                  .catch(setError)
              }
            >
              <Download size={13} />
              Exportar dados
            </button>
            <button onClick={() => file.current?.click()}>
              <Upload size={13} />
              Importar dados antigos
            </button>
            <input
              ref={file}
              hidden
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const data = JSON.parse(await f.text());
                  await importItems(Array.isArray(data) ? data : data.items);
                } catch (err) {
                  setError(err);
                }
                e.target.value = "";
              }}
            />
          </div>
        </footer>
      </main>
    </>
  );
}
