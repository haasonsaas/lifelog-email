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

/* ---------- 1. Decisions extractor (EMAIL READY VERSION) ---------- */
export function decisions(lifelogs: Lifelog[], env: Env) {
  // Expanded decision patterns
  const DECISION_PATTERNS = [
    /\b(we|I)\s+decided\s+to\b/i,
    /\b(we|I)\s+chose\s+to\b/i,
    /\b(we|I)\s+opted\s+for\b/i,
    /\b(we|I)\s+selected\b/i,
    /\b(we|I)\s+agreed\s+to\b/i,
    /\b(we|I)\s+settled\s+on\b/i,
    /\b(we|I)\s+concluded\s+to\b/i,
    /\b(we|I)\s+resolved\s+to\b/i,
    /\b(we|I)\s+determined\s+to\b/i,
    /\b(we|I)\s+will\s+go\s+with\b/i,
    /\b(we|I)\s+will\s+proceed\s+with\b/i,
    /\b(we|I)\s+will\s+take\s+the\s+path\b/i,
    /\b(we|I)\s+will\s+follow\s+the\s+approach\b/i,
    /\b(?:I'm|I am|I'll|I will)\s+going\s+to\s+(?:take|capture|record|add)\s+(?:that|this|it)\s+as\s+(?:an|a)\s+(?:action\s+)?item\b/i,
    /\b(we|I)\s+made\s+the\s+call\b/i,
    /\b(we|I)\s+made\s+a\s+decision\b/i,
    /\b(we|I)\s+reached\s+a\s+decision\b/i,
    /\b(we|I)\s+came\s+to\s+a\s+decision\b/i,
    /\b(we|I)\s+arrived\s+at\s+a\s+decision\b/i,
    /\b(we|I)\s+made\s+up\s+our\s+mind\b/i,
    /\b(we|I)\s+made\s+my\s+mind\s+up\b/i,
    /\b(we|I)\s+have\s+decided\b/i,
    /\b(we|I)\s+have\s+chosen\b/i,
    /\b(we|I)\s+have\s+selected\b/i,
    /\b(we|I)\s+have\s+agreed\b/i,
    /\b(we|I)\s+have\s+settled\b/i,
    /\b(we|I)\s+have\s+determined\b/i,
    /\b(we|I)\s+have\s+resolved\b/i,
    /\b(we|I)\s+have\s+concluded\b/i,
    /\b(we|I)\s+have\s+opted\b/i,
    /\b(we|I)\s+have\s+made\s+the\s+call\b/i,
    /\b(we|I)\s+have\s+made\s+a\s+decision\b/i,
    /\b(we|I)\s+have\s+reached\s+a\s+decision\b/i,
    /\b(we|I)\s+have\s+come\s+to\s+a\s+decision\b/i,
    /\b(we|I)\s+have\s+arrived\s+at\s+a\s+decision\b/i,
    /\b(we|I)\s+have\s+made\s+up\s+our\s+mind\b/i,
    /\b(we|I)\s+have\s+made\s+my\s+mind\s+up\b/i
  ];

  const decisions: Array<{
    content: string;
    context: string[];
    timestamp: string;
  }> = [];

  for (const log of lifelogs) {
    let currentContext: string[] = [];
    let lastDecisionTime = "";

    // Get all content nodes in order
    const nodes = walk((log.contents as unknown as ContentNode[]) || []);
    
    for (const node of nodes) {
      if (node.content) {
        const text = node.content.trim();
        const timestamp = node.startTime || log.startTime;

        // Check if this content matches any decision pattern
        const isDecision = DECISION_PATTERNS.some(pattern => pattern.test(text));
        
        if (isDecision) {
          // If we have a previous decision, save it with its context
          if (lastDecisionTime) {
            decisions.push({
              content: currentContext[0], // The decision is always first in context
              context: currentContext.slice(1), // Rest is supporting context
              timestamp: lastDecisionTime
            });
          }
          
          // Start new context with this decision
          currentContext = [text];
          lastDecisionTime = timestamp;
        } else if (lastDecisionTime) {
          // Add to context if it's within 2 minutes of the last decision
          const timeDiff = Math.abs(new Date(timestamp).getTime() - new Date(lastDecisionTime).getTime());
          if (timeDiff <= 120000) { // 2 minutes in milliseconds
            currentContext.push(text);
          } else {
            // Time gap too large, save previous decision and reset
            if (currentContext.length > 0) {
              decisions.push({
                content: currentContext[0],
                context: currentContext.slice(1),
                timestamp: lastDecisionTime
              });
            }
            currentContext = [];
            lastDecisionTime = "";
          }
        }
      }
    }

    // Save the last decision if we have one
    if (currentContext.length > 0) {
      decisions.push({
        content: currentContext[0],
        context: currentContext.slice(1),
        timestamp: lastDecisionTime
      });
    }
  }

  const timezone = env.TIMEZONE || "America/Los_Angeles";
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
  now.setDate(now.getDate() - 1);
  const dateStr = now.toLocaleDateString("en-US", { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  if (!decisions.length) {
    return {
      html: `
        <h2>Decisions</h2>
        <p>No major decisions recorded on ${dateStr}.</p>
      `,
      text: `Decisions\n\nNo major decisions recorded on ${dateStr}.`
    };
  }

  // Sort decisions by timestamp
  decisions.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const listHtml = decisions.map(d => `
    <li>
      <strong>${d.content}</strong>
      ${d.context.length > 0 ? `
        <ul>
          ${d.context.map(c => `<li>${c}</li>`).join('\n')}
        </ul>
      ` : ''}
    </li>
  `).join('\n');

  const listText = decisions.map(d => `
- ${d.content}
  ${d.context.map(c => `  - ${c}`).join('\n')}
  `).join('\n');

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
   Use parallel formatting for tasks (all start with same verb tense).

3. **Key Decisions** – Bullet list of decisions that affect future work. Start with outcomes.

4. **Discussion Log** – "Topic Name (HH:MM – HH:MM, Duration)".

FORMAT RULES  
• Use exact wording or tight paraphrases from the transcript.  
• Use 24-hour times and user's local zone if times are given.  
• Do **not** exceed 120 total words per section.  
• Do **not** include meta-feedback or coaching notes.  
• Every action item must have an owner and date.  
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

/* ---------- 6. Conversation Topics extractor ---------- */
export function conversation_topics(lifelogs: Lifelog[], env: Env): { html: string; text: string } {
  const topics: { [key: string]: { duration: number; startTime: string; endTime: string } } = {};
  let currentTopic = "";
  let topicStartTime = "";
  let lastBlockquoteEndTime = "";

  console.log('Processing lifelogs:', lifelogs.length);

  // Process each lifelog's contents
  for (const log of lifelogs) {
    console.log('Processing log:', log.title);
    console.log('Contents length:', log.contents?.length);
    
    // Process content in order, maintaining hierarchy
    const processContent = (content: { 
      type?: string;
      content?: string;
      startTime?: string;
      endTime?: string;
      children?: any[];
    }) => {
      console.log('Content type:', content.type);
      console.log('Content:', content.content);
      
      if (content.type === "blockquote" && content.endTime) {
        lastBlockquoteEndTime = content.endTime;
      }
      
      if (content.type === "heading2") {
        // If we were tracking a previous topic, record its duration
        if (currentTopic && topicStartTime && lastBlockquoteEndTime) {
          const start = new Date(topicStartTime);
          const end = new Date(lastBlockquoteEndTime);
          const duration = (end.getTime() - start.getTime()) / 1000 / 60; // duration in minutes
          
          if (!topics[currentTopic]) {
            topics[currentTopic] = { duration: 0, startTime: topicStartTime, endTime: lastBlockquoteEndTime };
          }
          topics[currentTopic].duration += duration;
          console.log('Recorded topic:', currentTopic, 'duration:', duration);
        }
        
        // Start tracking new topic
        currentTopic = content.content || "";
        topicStartTime = lastBlockquoteEndTime || log.startTime;
        console.log('New topic:', currentTopic, 'start time:', topicStartTime);
      }

      // Process children recursively
      if (content.children && content.children.length > 0) {
        content.children.forEach(processContent);
      }
    };

    // Process each content item in the log
    (log.contents || []).forEach(processContent);
  }

  // Handle the last topic if there is one
  if (currentTopic && topicStartTime && lastBlockquoteEndTime) {
    const start = new Date(topicStartTime);
    const end = new Date(lastBlockquoteEndTime);
    const duration = (end.getTime() - start.getTime()) / 1000 / 60;
    
    if (!topics[currentTopic]) {
      topics[currentTopic] = { duration: 0, startTime: topicStartTime, endTime: lastBlockquoteEndTime };
    }
    topics[currentTopic].duration += duration;
    console.log('Final topic:', currentTopic, 'duration:', duration);
  }

  console.log('Found topics:', Object.keys(topics));

  const timezone = env.TIMEZONE || "America/Los_Angeles";
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
  now.setDate(now.getDate() - 1);
  const dateStr = now.toLocaleDateString("en-US", { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  if (Object.keys(topics).length === 0) {
    return {
      html: `
        <h2>Conversation Topics</h2>
        <p>No topics recorded on ${dateStr}.</p>
      `,
      text: `Conversation Topics\n\nNo topics recorded on ${dateStr}.`
    };
  }

  // Sort topics by duration (longest first)
  const sortedTopics = Object.entries(topics).sort((a, b) => b[1].duration - a[1].duration);

  const listHtml = sortedTopics.map(([topic, data]) => 
    `<li><strong>${topic}</strong> (${data.duration.toFixed(1)} minutes)</li>`
  ).join("\n");

  const listText = sortedTopics.map(([topic, data]) => 
    `- ${topic} (${data.duration.toFixed(1)} minutes)`
  ).join("\n");

  return {
    html: `
      <h2>Conversation Topics</h2>
      <p>Here's how your time was spent in conversations on <strong>${dateStr}</strong>:</p>
      <ul>
        ${listHtml}
      </ul>
      <p>Stay engaged!</p>
    `,
    text: `Conversation Topics\n\nHere's how your time was spent in conversations on ${dateStr}:\n\n${listText}\n\nStay engaged!`
  };
}