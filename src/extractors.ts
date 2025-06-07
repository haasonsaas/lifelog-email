/**
 * Extractor utilities: return email content based on lifelog transcripts.
 * Each extractor receives an array of lifelogs (typed loosely as any[]).
 */

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { Env, Lifelog, LifelogContent, ActionItem } from "./types";
import { extractTopics, formatTopicsAsHtml, formatTopicsAsText } from "./extractors/core/topics";

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

/* ---------- Action Items extractor (requires OpenAI) ---------- */
export async function action_items(lifelogs: Lifelog[], env: Env): Promise<{ actionItems: ActionItem[]; html: string; text: string }> {
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
      content: `You are an expert at extracting actionable tasks from conversation transcripts.

TASK
Extract ONLY explicit action items from the conversation. Be conservative - only extract tasks that are clearly assigned or committed to by someone.

RULES
• Only extract tasks that have a clear owner (who will do it)
• Only include due dates that are explicitly mentioned - never guess or infer dates
• Determine priority based on urgency language, explicit statements, or deadline proximity
• Identify status only if explicitly mentioned (in progress, completed, etc.)
• Include brief context from the conversation where the task was mentioned
• If no clear action items exist, return an empty array

OUTPUT FORMAT
Return a JSON array of action items with this exact structure:
[
  {
    "task": "Brief, clear description of what needs to be done",
    "owner": "Name of person responsible",
    "dueDate": "YYYY-MM-DD or null if not specified",
    "priority": "high|medium|low",
    "status": "new|in_progress|completed|cancelled",
    "context": "Brief context from conversation where this was mentioned"
  }
]

PRIORITY GUIDELINES
• high: Urgent language, immediate deadlines, blocking issues
• medium: Standard work items, reasonable deadlines
• low: Future planning, nice-to-have items

STATUS GUIDELINES
• new: Default for newly mentioned tasks
• in_progress: Explicitly mentioned as currently being worked on
• completed: Explicitly mentioned as done/finished
• cancelled: Explicitly mentioned as no longer needed

IMPORTANT
• Return ONLY the JSON array, no additional text
• If no action items found, return []
• Be extremely conservative - when in doubt, don't extract`,
    },
    { role: "user", content: formattedContent },
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
    max_tokens: 1000,
    temperature: 0.1,
  });

  const rawResponse = response.choices[0]?.message?.content || "[]";
  
  let actionItemsData: any[] = [];
  try {
    actionItemsData = JSON.parse(rawResponse);
  } catch (error) {
    console.error("Failed to parse action items JSON:", error);
    actionItemsData = [];
  }

  // Convert to ActionItem objects with generated IDs and timestamps
  const actionItems: ActionItem[] = actionItemsData.map((item, index) => ({
    id: `action-${Date.now()}-${index}`,
    task: item.task || "",
    owner: item.owner || "Unknown",
    dueDate: item.dueDate || undefined,
    priority: item.priority || "medium",
    status: item.status || "new",
    context: item.context || "",
    timestamp: new Date().toISOString()
  }));

  // Generate formatted output
  const timezone = env.TIMEZONE || "America/Los_Angeles";
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
  
  if (actionItems.length === 0) {
    return {
      actionItems: [],
      html: `<h2>Action Items</h2><p><em>No action items found in today's conversations.</em></p>`,
      text: "Action Items\n\nNo action items found in today's conversations."
    };
  }

  // Sort by priority and due date
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  actionItems.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    
    if (a.dueDate && b.dueDate) {
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    }
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return 0;
  });

  // Generate HTML output
  const htmlTable = `
    <table style="border-collapse: collapse; width: 100%; margin-top: 10px;">
      <thead>
        <tr style="background-color: #f5f5f5;">
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Task</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Owner</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Due Date</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Priority</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${actionItems.map(item => {
          const priorityColor = item.priority === 'high' ? '#ff6b6b' : item.priority === 'medium' ? '#ffd93d' : '#6bcf7f';
          const statusColor = item.status === 'completed' ? '#6bcf7f' : item.status === 'in_progress' ? '#ffd93d' : '#e1e5e9';
          return `
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px;">${item.task}</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${item.owner}</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${item.dueDate || '-'}</td>
              <td style="border: 1px solid #ddd; padding: 8px; background-color: ${priorityColor}; color: white; font-weight: bold;">${item.priority.toUpperCase()}</td>
              <td style="border: 1px solid #ddd; padding: 8px; background-color: ${statusColor};">${item.status.replace('_', ' ').toUpperCase()}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  const html = `<h2>Action Items (${actionItems.length})</h2>${htmlTable}`;

  // Generate text output  
  const textTable = actionItems.map(item => 
    `• ${item.task} (${item.owner}) - Due: ${item.dueDate || 'Not specified'} - Priority: ${item.priority.toUpperCase()} - Status: ${item.status.replace('_', ' ').toUpperCase()}`
  ).join('\n');

  const text = `Action Items (${actionItems.length})\n\n${textTable}`;

  return {
    actionItems,
    html,
    text
  };
}

/* ---------- Conversation Topics extractor (requires OpenAI) ---------- */
export async function conversation_topics(lifelogs: Lifelog[], env: Env): Promise<{ html: string; text: string }> {
  const result = await extractTopics(lifelogs, env);
  
  return {
    html: formatTopicsAsHtml(result),
    text: formatTopicsAsText(result)
  };
}