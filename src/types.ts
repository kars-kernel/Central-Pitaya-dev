export type Subject = {
  id: string;
  title: string;
  description: string;
  color: string;
  archived: number;
};
export type Path = {
  id: string;
  subject_id: string;
  title: string;
  description: string;
  type: "modules" | "map";
  archived: number;
  total: number;
  completed: number;
};
export type Module = {
  id: string;
  path_id: string;
  title: string;
  position: number;
};
export type Step = {
  id: string;
  path_id: string;
  module_id: string | null;
  title: string;
  status: "not_started" | "in_progress" | "completed";
  position: number;
  x: number;
  y: number;
  material_ids: string[];
};
export type Edge = {
  id: string;
  path_id: string;
  source: string;
  target: string;
};
export type PathDetail = Path & {
  modules: Module[];
  steps: Step[];
  edges: Edge[];
};
export type Note = {
  step_id: string;
  content: Record<string, unknown>;
  revision: number;
  updated_at: string;
};
export type StudySession = {
  id: string;
  subject_id: string;
  path_id: string | null;
  step_id: string | null;
  date: string;
  minutes: number;
  notes: string;
};
export type StoredFile = {
  id: string;
  name: string;
  mime: string;
  size: number;
  url?: string;
};
export type Material = {
  id: string;
  title: string;
  author: string;
  description: string;
  type: "exercises" | "book" | "paper";
  url: string;
  file_id: string | null;
  tags: string[];
  subject_ids: string[];
  file: StoredFile | null;
  usages: { id: string; title: string; path_id: string; path_title: string }[];
};
export type Item = {
  id: string;
  title: string;
  type: "estudos" | "treinos" | "lembretes" | "eventos";
  date: string;
  time: string;
  notes: string;
  done: boolean;
};
export type Activity = {
  year: number;
  days: { date: string; minutes: number; sessions: number }[];
  active_days: number;
  minutes: number;
  paths_in_progress: number;
};
