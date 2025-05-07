/**
 * Extractor utilities: return email content based on lifelog transcripts.
 * Each extractor receives an array of lifelogs (typed loosely as any[]).
 */

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { Env, Lifelog, LifelogContent } from "./types";

type ContentNode = {
  content?: string;
  startTime?: string;
  endTime?: string;
  children?: ContentNode[];
  type?: string;
  speakerName?: string;
  speakerIdentifier?: "user" | null;
};

const walk = (nodes: ContentNode[]): ContentNode[] =>
  nodes.flatMap((n) => [n, ...(n.children ? walk(n.children) : [])]);

/* ---------- GPT summary extractor (requires OpenAI) ---------- */
export async function gpt_summary(lifelogs: Lifelog[], env: Env): Promise<{ html: string; text: string }> {
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  // Process each lifelog separately to maintain conversation boundaries
  const processedLogs = lifelogs.map(log => {
    const content = walk(log.contents || [])
      .filter(n => n.content)
      .map(n => ({
        content: n.content,
        startTime: n.startTime || log.startTime,
        endTime: n.endTime || log.endTime,
        speaker: n.speakerName || 'Unknown'
      }))
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    return {
      title: log.title,
      startTime: log.startTime,
      endTime: log.endTime,
      content
    };
  });

  // Format the content for GPT with clear conversation boundaries
  const formattedContent = processedLogs.map(log => {
    const duration = Math.round((new Date(log.endTime).getTime() - new Date(log.startTime).getTime()) / 1000 / 60);
    return `Conversation: ${log.title} (${duration} minutes)
Start: ${new Date(log.startTime).toLocaleTimeString()}
End: ${new Date(log.endTime).toLocaleTimeString()}

${log.content.map(c => `${c.speaker}: ${c.content}`).join('\n')}

---`;
  }).join('\n\n').slice(0, 12_000);

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are an expert conversation-summarizer.

TASK  
Summarize the *actual* conversation content passed in \`formattedContent\`.  
• No fabrication, no boilerplate.  
• If a section has zero content, omit that section entirely.  
• Write in clear, short bullet points—max 15 words each.  

OUTPUT  
Return Markdown with the following **headings** *(only when they contain content)*:

1. **Overview** – 2-3 sentences, outcomes-first. Focus on what changed and what's next. No filler.

2. **Action Items & Deadlines** – Table format:
   | Owner | Task | Due | Status |
   |-------|------|-----|--------|
   • Only include due dates that are explicitly mentioned in the conversation
   • If no due date is mentioned, leave the Due column empty
   • Use parallel formatting for tasks (all start with same verb tense)
   • Never infer or guess due dates

3. **Key Decisions** – Bullet list of decisions that affect future work. Start with outcomes.

4. **Discussion Log** – "Topic Name (HH:MM – HH:MM, Duration)".

FORMAT RULES  
• Use exact wording or tight paraphrases from the transcript.  
• Use 24-hour times and user's local zone if times are given.  
• Do **not** exceed 120 total words per section.  
• Do **not** include meta-feedback or coaching notes.  
• Every action item must have an owner
• Use parallel formatting for all bullet points.`,
    },
    { role: "user", content: formattedContent },
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
    max_tokens: 512,
    temperature: 0.3,
  });

  const summary = response.choices[0]?.message?.content || "(no summary)";
  const timezone = env.TIMEZONE || "America/Los_Angeles";
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
  now.setDate(now.getDate() - 1);
  const dateStr = now.toLocaleDateString("en-US", { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return {
    html: `
      <h2>Daily Summary</h2>
      <div style="white-space: pre-wrap; font-family: monospace; line-height: 1.5;">${summary}</div>
    `,
    text: `Daily Summary\n\n${summary}`
  };
}