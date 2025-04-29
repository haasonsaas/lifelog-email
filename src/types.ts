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

export type Lifelog = {
  id: string;
  title: string;
  markdown: string;
  startTime: string;
  endTime: string;
  contents: LifelogContent[];
};

export type LifelogContent = {
  type: "heading1" | "heading2" | "blockquote";
  content: string;
  startTime: string;
  endTime: string;
  startOffsetMs: number;
  endOffsetMs: number;
  children: LifelogContent[];
  speakerName?: string;
  speakerIdentifier?: "user" | null;
}; 