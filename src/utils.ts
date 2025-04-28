import type { Env } from "./extractors";

export function yesterday(tz: string) {
  const now = new Date();
  const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = new Date(utcMidnight - 86_400_000);
  const end = new Date(utcMidnight - 1);
  const iso = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);
  return { start: iso(start), end: iso(end) };
}

export async function fetchLifelogs(start: string, end: string, env: Env) {
  const url = new URL("https://api.limitless.ai/v1/lifelogs");
  url.searchParams.set("start", start);
  url.searchParams.set("end", end);
  url.searchParams.set("timezone", env.TIMEZONE || "UTC");
  url.searchParams.set("includeMarkdown", "false");
  url.searchParams.set("limit", "1000");

  console.log('Making request to:', url.toString());
  console.log('API Key present:', !!env.LIMITLESS_API_KEY);
  console.log('API Key length:', env.LIMITLESS_API_KEY?.length);
  console.log('API Key header:', env.LIMITLESS_API_KEY);

  const res = await fetch(url.toString(), {
    headers: { 
      'X-API-Key': env.LIMITLESS_API_KEY,
      'Accept': 'application/json'
    },
  });
  if (!res.ok) {
    const errorText = await res.text();
    console.error('API Error:', res.status, errorText);
    throw new Error(`Limitless API ${res.status}: ${errorText}`);
  }
  const json = await res.json() as { data: { lifelogs: any[] } };
  return json.data.lifelogs;
}