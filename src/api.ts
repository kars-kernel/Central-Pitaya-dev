export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: any,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api" + url, {
    ...options,
    credentials: "same-origin",
    headers: {
      "X-App-Request": "1",
      ...(!(options.body instanceof FormData) && options.body
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  const body = await response
    .json()
    .catch(() => ({ message: "Resposta inválida do servidor." }));
  if (!response.ok) {
    if (response.status === 401 && url !== "/auth/login")
      window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(
      response.status,
      body.message || "Falha na solicitação.",
      body,
    );
  }
  return body as T;
}
export const json = (method: string, data?: unknown): RequestInit => ({
  method,
  ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
});
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const formatDate = (s: string) =>
  new Date(s + "T12:00:00Z").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
export const duration = (n: number) =>
  n >= 60
    ? `${Math.floor(n / 60)}h${n % 60 ? ` ${n % 60}min` : ""}`
    : `${n}min`;
export const materialTypes = {
  exercises: "Lista de exercícios",
  book: "Livro",
  paper: "Paper",
};
export const statusLabels = {
  not_started: "Não iniciado",
  in_progress: "Em andamento",
  completed: "Concluído",
};
export const download = (name: string, data: unknown) => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
export async function upload(file: File) {
  const data = new FormData();
  data.append("file", file);
  return api<import("./types").StoredFile>("/files", {
    method: "POST",
    body: data,
  });
}
