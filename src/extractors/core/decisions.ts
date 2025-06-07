/**
 * Decisions extractor: identifies and tracks key decisions made during conversations.
 * Focuses on capturing decisions that affect future work or direction.
 */

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { Env, Lifelog } from "../../types";

export interface Decision {
  /** The specific decision that was made */
  decision: string;
  /** The context or rationale behind the decision */
  context: string;
  /** Who made or was involved in the decision */
  participants: string[];
  /** The scope/impact of the decision (local, project, strategic) */
  scope: "local" | "project" | "strategic";
  /** When the decision was made (ISO timestamp) */
  timestamp: string;
  /** The conversation/meeting where this decision occurred */
  source: string;
  /** Confidence level in decision extraction (high, medium, low) */
  confidence: "high" | "medium" | "low";
}

export interface DecisionsExtractorResult {
  /** Array of identified decisions */
  decisions: Decision[];
  /** Summary statistics */
  summary: {
    totalDecisions: number;
    strategicDecisions: number;
    projectDecisions: number;
    localDecisions: number;
  };
  /** Processing metadata */
  metadata: {
    processedConversations: number;
    totalContentLength: number;
    extractionTimestamp: string;
  };
}

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

/**
 * Extracts key decisions from lifelog conversations using OpenAI GPT.
 * Focuses on decisions that have business impact or affect future actions.
 */
export async function extractDecisions(
  lifelogs: Lifelog[], 
  env: Env
): Promise<DecisionsExtractorResult> {
  if (!lifelogs || lifelogs.length === 0) {
    return {
      decisions: [],
      summary: {
        totalDecisions: 0,
        strategicDecisions: 0,
        projectDecisions: 0,
        localDecisions: 0,
      },
      metadata: {
        processedConversations: 0,
        totalContentLength: 0,
        extractionTimestamp: new Date().toISOString(),
      },
    };
  }

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
      content: `You are an expert decision analyst. Your task is to identify and extract KEY DECISIONS from conversation transcripts.

WHAT QUALIFIES AS A DECISION:
• A definitive choice made between alternatives
• A commitment to a specific course of action
• A resolution that affects future work or direction
• A conclusion reached that changes plans or priorities

WHAT DOES NOT QUALIFY:
• Ongoing discussions without resolution
• Ideas or suggestions without commitment
• Questions or hypothetical scenarios
• Routine operational choices (like scheduling)

FOCUS ON:
• Business-impacting decisions
• Strategic direction changes
• Project scope or timeline decisions
• Resource allocation choices
• Process or methodology changes
• Technology or tool selections

OUTPUT FORMAT:
Return a valid JSON object with this exact structure:
{
  "decisions": [
    {
      "decision": "Clear, specific description of what was decided",
      "context": "Why this decision was made, background information",
      "participants": ["person1", "person2"],
      "scope": "local|project|strategic",
      "timestamp": "ISO timestamp when decision was made",
      "source": "Meeting/conversation title",
      "confidence": "high|medium|low"
    }
  ]
}

SCOPE DEFINITIONS:
• "local": Affects individual tasks or immediate work
• "project": Affects project timeline, scope, or resources
• "strategic": Affects business direction, major initiatives, or long-term plans

CONFIDENCE LEVELS:
• "high": Decision clearly stated with explicit commitment
• "medium": Decision implied but not explicitly stated
• "low": Uncertain if this represents a firm decision

IMPORTANT:
• Only extract actual decisions, not discussions
• Use exact quotes or close paraphrases from the transcript
• If no clear decisions are found, return empty decisions array
• Ensure JSON is valid and properly formatted
• Be conservative - better to miss a decision than to hallucinate one`,
    },
    { 
      role: "user", 
      content: `Extract decisions from these conversations:\n\n${formattedContent}` 
    },
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 1024,
      temperature: 0.1, // Low temperature for consistency
      response_format: { type: "json_object" },
    });

    const responseContent = response.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error("No response content from OpenAI");
    }

    // Parse the JSON response
    let parsedResponse: { decisions: Decision[] };
    try {
      parsedResponse = JSON.parse(responseContent);
    } catch (parseError) {
      console.error("Failed to parse OpenAI response as JSON:", parseError);
      throw new Error("Invalid JSON response from OpenAI");
    }

    // Validate and enrich the decisions
    const decisions: Decision[] = (parsedResponse.decisions || [])
      .filter(decision => decision && decision.decision && decision.decision.trim().length > 0)
      .map(decision => ({
        decision: decision.decision,
        context: decision.context || "",
        participants: Array.isArray(decision.participants) ? decision.participants : [],
        scope: ["local", "project", "strategic"].includes(decision.scope) ? decision.scope : "local",
        timestamp: decision.timestamp || new Date().toISOString(),
        source: decision.source || "Unknown",
        confidence: ["high", "medium", "low"].includes(decision.confidence) ? decision.confidence : "medium",
      }));

    // Generate summary statistics
    const summary = {
      totalDecisions: decisions.length,
      strategicDecisions: decisions.filter(d => d.scope === "strategic").length,
      projectDecisions: decisions.filter(d => d.scope === "project").length,
      localDecisions: decisions.filter(d => d.scope === "local").length,
    };

    return {
      decisions,
      summary,
      metadata: {
        processedConversations: processedLogs.length,
        totalContentLength: formattedContent.length,
        extractionTimestamp: new Date().toISOString(),
      },
    };

  } catch (error) {
    console.error("Error in decisions extraction:", error);
    
    // Return empty result on error rather than throwing
    return {
      decisions: [],
      summary: {
        totalDecisions: 0,
        strategicDecisions: 0,
        projectDecisions: 0,
        localDecisions: 0,
      },
      metadata: {
        processedConversations: processedLogs.length,
        totalContentLength: formattedContent.length,
        extractionTimestamp: new Date().toISOString(),
      },
    };
  }
}

/**
 * Formats decisions into HTML for email display
 */
export function formatDecisionsAsHtml(result: DecisionsExtractorResult): string {
  if (result.decisions.length === 0) {
    return `<h3>Key Decisions</h3><p><em>No significant decisions identified in today's conversations.</em></p>`;
  }

  const strategicDecisions = result.decisions.filter(d => d.scope === "strategic");
  const projectDecisions = result.decisions.filter(d => d.scope === "project");
  const localDecisions = result.decisions.filter(d => d.scope === "local");

  let html = `<h3>Key Decisions (${result.summary.totalDecisions})</h3>`;

  if (strategicDecisions.length > 0) {
    html += `<h4>Strategic Decisions</h4><ul>`;
    strategicDecisions.forEach(decision => {
      html += `<li><strong>${decision.decision}</strong><br/>`;
      if (decision.context) html += `<em>Context:</em> ${decision.context}<br/>`;
      if (decision.participants.length > 0) html += `<em>Participants:</em> ${decision.participants.join(", ")}<br/>`;
      html += `<em>Source:</em> ${decision.source}</li>`;
    });
    html += `</ul>`;
  }

  if (projectDecisions.length > 0) {
    html += `<h4>Project Decisions</h4><ul>`;
    projectDecisions.forEach(decision => {
      html += `<li><strong>${decision.decision}</strong><br/>`;
      if (decision.context) html += `<em>Context:</em> ${decision.context}<br/>`;
      if (decision.participants.length > 0) html += `<em>Participants:</em> ${decision.participants.join(", ")}<br/>`;
      html += `<em>Source:</em> ${decision.source}</li>`;
    });
    html += `</ul>`;
  }

  if (localDecisions.length > 0) {
    html += `<h4>Local Decisions</h4><ul>`;
    localDecisions.forEach(decision => {
      html += `<li><strong>${decision.decision}</strong><br/>`;
      if (decision.context) html += `<em>Context:</em> ${decision.context}<br/>`;
      if (decision.participants.length > 0) html += `<em>Participants:</em> ${decision.participants.join(", ")}<br/>`;
      html += `<em>Source:</em> ${decision.source}</li>`;
    });
    html += `</ul>`;
  }

  return html;
}

/**
 * Formats decisions as plain text for email display
 */
export function formatDecisionsAsText(result: DecisionsExtractorResult): string {
  if (result.decisions.length === 0) {
    return `Key Decisions\n\nNo significant decisions identified in today's conversations.`;
  }

  const strategicDecisions = result.decisions.filter(d => d.scope === "strategic");
  const projectDecisions = result.decisions.filter(d => d.scope === "project");
  const localDecisions = result.decisions.filter(d => d.scope === "local");

  let text = `Key Decisions (${result.summary.totalDecisions})\n\n`;

  if (strategicDecisions.length > 0) {
    text += `Strategic Decisions:\n`;
    strategicDecisions.forEach(decision => {
      text += `• ${decision.decision}\n`;
      if (decision.context) text += `  Context: ${decision.context}\n`;
      if (decision.participants.length > 0) text += `  Participants: ${decision.participants.join(", ")}\n`;
      text += `  Source: ${decision.source}\n\n`;
    });
  }

  if (projectDecisions.length > 0) {
    text += `Project Decisions:\n`;
    projectDecisions.forEach(decision => {
      text += `• ${decision.decision}\n`;
      if (decision.context) text += `  Context: ${decision.context}\n`;
      if (decision.participants.length > 0) text += `  Participants: ${decision.participants.join(", ")}\n`;
      text += `  Source: ${decision.source}\n\n`;
    });
  }

  if (localDecisions.length > 0) {
    text += `Local Decisions:\n`;
    localDecisions.forEach(decision => {
      text += `• ${decision.decision}\n`;
      if (decision.context) text += `  Context: ${decision.context}\n`;
      if (decision.participants.length > 0) text += `  Participants: ${decision.participants.join(", ")}\n`;
      text += `  Source: ${decision.source}\n\n`;
    });
  }

  return text.trim();
}