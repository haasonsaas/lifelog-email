import { yesterday, fetchLifelogs, searchLifelogs, formatLifelogEntry } from './utils';
import { decisions, new_contacts, filler_score, action_items, gpt_summary, conversation_topics } from './extractors';
import type { Env, Lifelog } from './types';
import type { ScheduledEvent, ExecutionContext } from "@cloudflare/workers-types";

interface SearchOptions {
  query?: string;
  topics?: string[];
  speakers?: string[];
  startDate?: string;
  endDate?: string;
}

async function runDigest(env: Env): Promise<void> {
  const { start, end } = yesterday(env.TIMEZONE);
  const lifelogs = await fetchLifelogs(env.LIMITLESS_API_KEY, start, end);
  
  // Convert LifelogEntry to Lifelog by adding markdown field
  const logsWithMarkdown: Lifelog[] = lifelogs.map(log => ({
    ...log,
    markdown: formatLifelogEntry(log)
  }));
  
  const extractors = [
    decisions,
    new_contacts,
    filler_score,
    action_items,
    gpt_summary,
    conversation_topics
  ];

  const results = await Promise.all(
    extractors.map(extractor => extractor(logsWithMarkdown, env))
  );

  const html = results.map(r => r.html).join('\n');
  const text = results.map(r => r.text).join('\n\n');

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: env.TO_EMAIL,
      subject: `Lifelog Digest for ${new Date().toLocaleDateString()}`,
      html,
      text,
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
      const { start, end } = yesterday(env.TIMEZONE);
      const lifelogs = await fetchLifelogs(env.LIMITLESS_API_KEY, start, end);
      const logsWithMarkdown: Lifelog[] = lifelogs.map(log => ({
        ...log,
        markdown: formatLifelogEntry(log)
      }));
      const results = await Promise.all([
        decisions(logsWithMarkdown, env),
        new_contacts(logsWithMarkdown, env),
        filler_score(logsWithMarkdown, env),
        action_items(logsWithMarkdown, env),
        gpt_summary(logsWithMarkdown, env),
        conversation_topics(logsWithMarkdown, env)
      ]);
      const html = results.map(r => r.html).join('\n');
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    if (path === "/test") {
      await runDigest(env);
      return new Response("Test email sent!");
    }

    if (path === "/search") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }

      try {
        if (!env.LIMITLESS_API_KEY) {
          return new Response("API key not configured", { status: 500 });
        }

        const searchOptions = await request.json() as SearchOptions;
        console.log('Search options:', searchOptions);
        
        // Use the last 24 hours as default range if not specified
        const end = new Date();
        const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        const startDate = searchOptions.startDate || start.toISOString().replace('T', ' ').slice(0, 19);
        const endDate = searchOptions.endDate || end.toISOString().replace('T', ' ').slice(0, 19);
        
        console.log('Fetching lifelogs with date range:', { startDate, endDate });

        const lifelogs = await fetchLifelogs(env.LIMITLESS_API_KEY, startDate, endDate);
        
        console.log(`Found ${lifelogs.length} lifelogs`);
        
        const searchResults = searchLifelogs(lifelogs, searchOptions);
        
        console.log(`Found ${searchResults.length} matching results`);
        
        // Format the search results
        const formattedResults = searchResults.map(entry => formatLifelogEntry(entry));
        const html = `
          <html>
            <head>
              <style>
                body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
                .result { margin-bottom: 20px; padding: 10px; border: 1px solid #eee; }
                .title { font-size: 1.2em; font-weight: bold; }
                .time { color: #666; font-size: 0.9em; }
                .content { margin-top: 10px; }
              </style>
            </head>
            <body>
              <h1>Search Results</h1>
              ${formattedResults.map(result => `
                <div class="result">
                  <div class="title">${result.split('\n')[0].replace('# ', '')}</div>
                  <div class="time">${result.split('\n')[1].replace('Time: ', '')}</div>
                  <div class="content">${result.split('\n').slice(2).join('\n')}</div>
                </div>
              `).join('\n')}
            </body>
          </html>
        `;
        
        return new Response(html, {
          headers: { 'Content-Type': 'text/html' }
        });
      } catch (error) {
        console.error('Error processing search:', error);
        return new Response(`Error processing search: ${error}`, { status: 500 });
      }
    }

    return new Response("Not found", { status: 404 });
  },
};
