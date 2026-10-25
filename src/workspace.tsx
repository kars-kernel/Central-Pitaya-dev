import { createContext, useContext, type ReactNode } from "react";
import { api } from "./api";
import { ErrorMessage, Loading, useLoad } from "./ui";
import type { Subject, Path } from "./types";
const Context = createContext<{
  subjects: Subject[];
  paths: Path[];
  refresh: () => void;
}>({ subjects: [], paths: [], refresh: () => {} });
export function Workspace({ children }: { children: ReactNode }) {
  const { data, error, reload } = useLoad(() =>
    Promise.all([api<Subject[]>("/subjects"), api<Path[]>("/paths")]),
  );
  if (!data) return error ? <ErrorMessage error={error} /> : <Loading />;
  return (
    <Context.Provider
      value={{ subjects: data[0], paths: data[1], refresh: reload }}
    >
      {children}
    </Context.Provider>
  );
}
export const useWorkspace = () => useContext(Context);
