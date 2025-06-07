import type { KVNamespace } from "@cloudflare/workers-types";

export interface Env {
  TOKEN_KV: KVNamespace;
  OPENAI_API_KEY: string;
  TIMEZONE: string;
  LIMITLESS_API_KEY: string;
  FROM_EMAIL: string;
  TO_EMAIL: string;
  RESEND_API_KEY: string;
}

export interface LifelogEntry {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  contents: LifelogContent[];
}

export type Lifelog = LifelogEntry & {
  markdown: string;
};

export type LifelogContent = {
  type: "heading1" | "heading2" | "blockquote";
  content: string;
  startTime?: string;
  endTime?: string;
  startOffsetMs?: number;
  endOffsetMs?: number;
  children?: LifelogContent[];
  speakerName?: string;
  speakerIdentifier?: "user" | null;
};

export interface ActionItem {
  id: string;
  task: string;
  owner: string;
  dueDate?: string;
  priority: "high" | "medium" | "low";
  status: "new" | "in_progress" | "completed" | "cancelled";
  context?: string;
  timestamp: string;
} 