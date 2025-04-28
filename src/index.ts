import * as X from "./extractors";
import { fetchLifelogs, yesterday } from "./utils";

export interface Env {
  LIMITLESS_API_KEY: string;
  OPENAI_API_KEY: string;
  TIMEZONE: string;
  EXTRACTOR: string;
  FROM_EMAIL: string;
  TO_EMAIL: string;
  TOKEN_KV: KVNamespace;
  RESEND_API_KEY: string;
}

export default {
  async scheduled(_: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runDigest(env));
  },

  async fetch(req: Request, env: Env) {
    const { pathname } = new URL(req.url);
    if (pathname === "/preview") {
      const { start, end } = yesterday(env.TIMEZONE || "America/Los_Angeles");
      const logs = await fetchLifelogs(start, end, env);
      const { html } = await extractDigest(logs, env);
      return new Response(html, { headers: { "content-type": "text/html" } });
    }
    if (pathname === "/test") {
      try {
        const { start, end } = yesterday(env.TIMEZONE || "America/Los_Angeles");
        const logs = await fetchLifelogs(start, end, env);
        const { subject, text, html } = await extractDigest(logs, env);
        await sendViaResend(env, subject, text, html);
        return new Response("Test email sent!");
      } catch (error: any) {
        console.error("Test endpoint error:", error);
        return new Response(`Error: ${error.message}`, { status: 500 });
      }
    }
    return new Response("OK");
  },
};

async function runDigest(env: Env) {
  const { start, end } = yesterday(env.TIMEZONE || "America/Los_Angeles");
  const logs = await fetchLifelogs(start, end, env);
  const { subject, text, html } = await extractDigest(logs, env);
  await sendViaResend(env, subject, text, html);
}

async function extractDigest(lifelogs: any[], env: Env) {
  const name = (env.EXTRACTOR || "decisions") as keyof typeof X;
  console.log("Using extractor:", name);
  const fn = X[name];
  if (!fn) throw new Error("Unknown extractor " + name);

  const result = await fn(lifelogs, env);

  if (typeof result === "object" && "text" in result && "html" in result) {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: env.TIMEZONE || "America/Los_Angeles" }));
    now.setDate(now.getDate() - 1);
    const dateStr = now.toLocaleDateString("en-US", { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    return {
      subject: `Your Digest for ${dateStr}`,
      text: result.text,
      html: wrapHtml(result.html),
    };
  } else {
    throw new Error("Invalid extractor result format");
  }
}

async function sendViaResend(env: Env, subject: string, text: string, html: string) {
  const payload = {
    from: env.FROM_EMAIL,
    to: env.TO_EMAIL,
    subject,
    text,
    html,
  };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error("Resend error " + res.status + ": " + text);
  }
}

function wrapHtml(innerHtml: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>Daily Digest</title></head>
    <body style="font-family: sans-serif; padding: 20px;">
      ${innerHtml}
    </body>
    </html>
  `;
}
