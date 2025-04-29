/**
 * Extractor utilities: return email content based on lifelog transcripts.
 * Each extractor receives an array of lifelogs (typed loosely as any[]).
 */

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { Env, Lifelog } from "./types";

const walk = (nodes: any[]): any[] =>
  nodes.flatMap((n) => [n, ...(n.children ? walk(n.children) : [])]);

/* ---------- 1. Decisions extractor (EMAIL READY VERSION) ---------- */
export function decisions(lifelogs: Lifelog[], env: Env) {
  const DECISION_RE = /\b(we|I)\s+decided\s+to\b/i;
  const bullets: string[] = [];

  for (const log of lifelogs) {
    walk(log.contents || []).forEach((n: any) => {
      if (n.content && DECISION_RE.test(n.content)) {
        bullets.push(n.content.trim());
      }
    });
  }

  const timezone = env.TIMEZONE || "America/Los_Angeles";
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
  now.setDate(now.getDate() - 1);
  const dateStr = now.toLocaleDateString("en-US", { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  if (!bullets.length) {
    return {
      html: `
        <h2>Decisions</h2>
        <p>No major decisions recorded on ${dateStr}.</p>
      `,
      text: `Decisions\n\nNo major decisions recorded on ${dateStr}.`
    };
  }

  const listHtml = bullets.map((b) => `<li>${b}</li>`).join("\n");
  const listText = bullets.map((b) => `- ${b}`).join("\n");

  return {
    html: `
      <h2>Decisions</h2>
      <p>Here's a summary of your decisions from <strong>${dateStr}</strong>:</p>
      <ul>
        ${listHtml}
      </ul>
      <p>Stay decisive!</p>
    `,
    text: `Decisions\n\nHere's a summary of your decisions from ${dateStr}:\n\n${listText}\n\nStay decisive!`
  };
}

/* ---------- 2. New Contacts extractor ---------- */
export async function new_contacts(
  lifelogs: Lifelog[],
  env: Env
): Promise<{ html: string; text: string }> {
  const seen: Record<string, boolean> =
    (await env.TOKEN_KV.get("KNOWN_SPEAKERS", { type: "json" })) || {};
  const today: Record<string, boolean> = {};
  const newbies: string[] = [];

  const flattenSpeakers = (logs: Lifelog[]) =>
    logs.flatMap((log) =>
      walk(log.contents || [])
        .filter((n) => n.speakerName && n.speakerName !== "user")
        .map((n) => n.speakerName as string)
    );

  for (const n of flattenSpeakers(lifelogs)) {
    if (!seen[n] && !today[n]) {
      newbies.push(n);
      today[n] = true;
    }
  }
  await env.TOKEN_KV.put(
    "KNOWN_SPEAKERS",
    JSON.stringify({ ...seen, ...today })
  );

  const timezone = env.TIMEZONE || "America/Los_Angeles";
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
  now.setDate(now.getDate() - 1);
  const dateStr = now.toLocaleDateString("en-US", { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  if (!newbies.length) {
    return {
      html: `
        <h2>New Contacts</h2>
        <p>No new contacts recorded on ${dateStr}.</p>
      `,
      text: `New Contacts\n\nNo new contacts recorded on ${dateStr}.`
    };
  }

  const listHtml = newbies.map((n) => `<li>${n}</li>`).join("\n");
  const listText = newbies.map((n) => `- ${n}`).join("\n");

  return {
    html: `
      <h2>New Contacts</h2>
      <p>Here are the new contacts you met on <strong>${dateStr}</strong>:</p>
      <ul>
        ${listHtml}
      </ul>
      <p>Keep connecting!</p>
    `,
    text: `New Contacts\n\nHere are the new contacts you met on ${dateStr}:\n\n${listText}\n\nKeep connecting!`
  };
}

/* ---------- 3. Filler score extractor ---------- */
export function filler_score(lifelogs: Lifelog[], env: Env): { html: string; text: string } {
  const FILLER_RE = /\b(um|uh|erm|like|you know)\b/gi;
  let count = 0;
  let words = 0;

  walk(lifelogs.flatMap((l) => l.contents || [])).forEach((n: any) => {
    if (n.speakerIdentifier === "user" && n.content) {
      const txt = n.content as string;
      count += (txt.match(FILLER_RE) || []).length;
      words += txt.split(/\s+/).length;
    }
  });

  const rate = words ? ((count / words) * 100).toFixed(2) : "0";
  const timezone = env.TIMEZONE || "America/Los_Angeles";
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
  now.setDate(now.getDate() - 1);
  const dateStr = now.toLocaleDateString("en-US", { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return {
    html: `
      <h2>Speech Analysis</h2>
      <p>Here's your speech analysis from <strong>${dateStr}</strong>:</p>
      <ul>
        <li>Total fillers: <strong>${count}</strong></li>
        <li>Rate: <strong>${rate}%</strong> of words</li>
      </ul>
      <p>Keep speaking clearly!</p>
    `,
    text: `Speech Analysis\n\nHere's your speech analysis from ${dateStr}:\n\n- Total fillers: ${count}\n- Rate: ${rate}% of words\n\nKeep speaking clearly!`
  };
}

/* ---------- 4. Action‑items extractor ---------- */
export function action_items(lifelogs: Lifelog[], env: Env): { html: string; text: string } {
  const TODO_RE =
    /\b(?:I'll|I will|I'm going to|I'll make sure to)\s+([^.]{0,120})/i;
  const todos: string[] = [];

  walk(lifelogs.flatMap((l) => l.contents || [])).forEach((n: any) => {
    if (n.speakerIdentifier === "user" && n.content) {
      const m = (n.content as string).match(TODO_RE);
      if (m) todos.push(m[1].trim());
    }
  });

  const timezone = env.TIMEZONE || "America/Los_Angeles";
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
  now.setDate(now.getDate() - 1);
  const dateStr = now.toLocaleDateString("en-US", { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  if (!todos.length) {
    return {
      html: `
        <h2>Action Items</h2>
        <p>No commitments detected on ${dateStr}.</p>
      `,
      text: `Action Items\n\nNo commitments detected on ${dateStr}.`
    };
  }

  const listHtml = todos.map((t) => `<li>${t}</li>`).join("\n");
  const listText = todos.map((t) => `- ${t}`).join("\n");

  return {
    html: `
      <h2>Action Items</h2>
      <p>Here are your commitments from <strong>${dateStr}</strong>:</p>
      <ul>
        ${listHtml}
      </ul>
      <p>Stay accountable!</p>
    `,
    text: `Action Items\n\nHere are your commitments from ${dateStr}:\n\n${listText}\n\nStay accountable!`
  };
}

/* ---------- 5. GPT summary extractor (requires OpenAI) ---------- */
export async function gpt_summary(lifelogs: Lifelog[], env: Env): Promise<{ html: string; text: string }> {
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const chunks = lifelogs
    .flatMap((l) => l.contents || [])
    .filter((n) => n.content)
    .map((n) => n.content)
    .join("\n")
    .slice(0, 12_000); // keep token budget sane

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "You are an expert conversation summarizer. Produce a concise bullet list of key takeaways from yesterday's discussions.",
    },
    { role: "user", content: chunks },
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    max_tokens: 256,
    temperature: 0.3,
  });

  const summary = response.choices[0]?.message?.content || "(no summary)";
  const timezone = env.TIMEZONE || "America/Los_Angeles";
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
  now.setDate(now.getDate() - 1);
  const dateStr = now.toLocaleDateString("en-US", { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return {
    html: `
      <p>Good morning Jonathan,</p>
      <p>Here's a summary of your conversations from <strong>${dateStr}</strong>:</p>
      <div style="white-space: pre-wrap;">${summary}</div>
      <p>Stay informed,<br>Your Limitless Digest 🪄</p>
    `,
    text: `Good morning Jonathan,\n\nHere's a summary of your conversations from ${dateStr}:\n\n${summary}\n\nStay informed,\nYour Limitless Digest 🪄`
  };
}