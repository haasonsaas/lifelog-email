import { yesterday, fetchLifelogs, formatLifelogEntry, testDateRange } from './utils';
import { gpt_summary } from './extractors';
import type { Env, Lifelog } from './types';
import type { ScheduledEvent, ExecutionContext } from "@cloudflare/workers-types";

async function runDigest(env: Env): Promise<void> {
  const { start, end } = yesterday(env.TIMEZONE);
  const lifelogs = await fetchLifelogs(env.LIMITLESS_API_KEY, start, end);
  
  const logsWithMarkdown: Lifelog[] = lifelogs.map(log => ({
    ...log,
    contents: log.contents.map(content => ({
      ...content,
      type: content.type as "heading1" | "heading2" | "blockquote",
      speakerIdentifier: content.speakerIdentifier === "user" ? "user" : null
    })),
    markdown: formatLifelogEntry(log)
  }));

  const result = await gpt_summary(logsWithMarkdown, env);

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: env.TO_EMAIL,
      subject: `Daily Summary for ${new Date().toLocaleDateString()}`,
      html: result.html,
      text: result.text,
    }),
  });
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    await runDigest(env);
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/preview") {
      const { start, end } = testDateRange(env.TIMEZONE);
      console.log('Fetching lifelogs for date range:', { start, end });
      const lifelogs = await fetchLifelogs(env.LIMITLESS_API_KEY, start, end);
      console.log('Received lifelogs:', lifelogs.length);
      const logsWithMarkdown: Lifelog[] = lifelogs.map(log => ({
        ...log,
        contents: log.contents.map(content => ({
          ...content,
          type: content.type as "heading1" | "heading2" | "blockquote",
          speakerIdentifier: content.speakerIdentifier === "user" ? "user" : null
        })),
        markdown: formatLifelogEntry(log)
      }));
      console.log('Processed logs with markdown:', logsWithMarkdown.length);
      const result = await gpt_summary(logsWithMarkdown, env);
      return new Response(result.html, { headers: { "Content-Type": "text/html" } });
    }

    if (path === "/test") {
      await runDigest(env);
      return new Response("Test email sent!");
    }

    return new Response("Not found", { status: 404 });
  },
};
