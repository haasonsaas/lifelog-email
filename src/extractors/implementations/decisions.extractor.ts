/**
 * Decisions Extractor - Uses OpenAI's GPT model to identify and track key decisions from conversations.
 * Refactored from the original extractDecisions function to implement the BaseExtractor interface.
 */

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { Env, Lifelog } from "../../types";
import { AbstractExtractor, type ExtractorConfig, type ExtractorResult } from "../base/extractor.interface";

type ContentNode = {
  content?: string;
  startTime?: string;
  endTime?: string;
  children?: ContentNode[];
  type?: string;
  speakerName?: string;
  speakerIdentifier?: "user" | null;
};

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

/**
 * Configuration specific to the Decisions extractor.
 */
export interface DecisionsConfig extends ExtractorConfig {
  settings: {
    /** OpenAI model to use for extraction */
    model?: string;
    /** Maximum tokens for the response */
    maxTokens?: number;
    /** Temperature for response generation */
    temperature?: number;
    /** Maximum characters to include from lifelogs */
    maxContentLength?: number;
  };
}

/**
 * Decisions extractor implementation.
 */
export class DecisionsExtractor extends AbstractExtractor {
  readonly id = "decisions";
  readonly name = "Key Decisions";
  readonly description = "Identifies and tracks key decisions made during conversations using OpenAI's GPT model";
  readonly version = "2.0.0";
  
  readonly defaultConfig: DecisionsConfig = {
    enabled: true,
    priority: 80,
    settings: {
      model: "gpt-4o",
      maxTokens: 1024,
      temperature: 0.1,
      maxContentLength: 12000
    }
  };

  private openai?: OpenAI;

  /**
   * Initialize the OpenAI client.
   */
  async initialize(env: Env): Promise<void> {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required for Decisions extractor");
    }
    
    this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  /**
   * Validate Decisions specific configuration.
   */
  validateConfig(config: ExtractorConfig): true | string {
    const baseValidation = super.validateConfig(config);
    if (baseValidation !== true) {
      return baseValidation;
    }

    const decisionsConfig = config as DecisionsConfig;
    const { settings } = decisionsConfig;

    if (settings?.model && typeof settings.model !== 'string') {
      return 'settings.model must be a string';
    }

    if (settings?.maxTokens && (typeof settings.maxTokens !== 'number' || settings.maxTokens <= 0)) {
      return 'settings.maxTokens must be a positive number';
    }

    if (settings?.temperature && (typeof settings.temperature !== 'number' || settings.temperature < 0 || settings.temperature > 2)) {
      return 'settings.temperature must be a number between 0 and 2';
    }

    if (settings?.maxContentLength && (typeof settings.maxContentLength !== 'number' || settings.maxContentLength <= 0)) {
      return 'settings.maxContentLength must be a positive number';
    }

    return true;
  }

  /**
   * Extract key decisions from conversations using GPT.
   */
  async extract(lifelogs: Lifelog[], env: Env, config?: ExtractorConfig): Promise<ExtractorResult> {
    if (!this.openai) {
      throw this.createError("OpenAI client not initialized. Call initialize() first.");
    }

    const decisionsConfig = { ...this.defaultConfig, ...config } as DecisionsConfig;
    const { settings } = decisionsConfig;

    if (lifelogs.length === 0) {
      return {
        html: `<h3>Key Decisions</h3><p><em>No significant decisions identified in today's conversations.</em></p>`,
        text: "Key Decisions\n\nNo significant decisions identified in today's conversations.",
        metadata: {
          processingTime: 0,
          logCount: 0,
          custom: {
            model: settings.model || "gpt-4o",
            decisionsCount: 0
          }
        }
      };
    }

    // Process each lifelog separately to maintain conversation boundaries
    const processedLogs = lifelogs.map(log => {
      const content = this.walk(log.contents || [])
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
    }).join('\n\n').slice(0, settings.maxContentLength || 12000);

    const { result: decisionsData, time: processingTime } = await this.measureTime(async () => {

      if (!formattedContent.trim()) {
        return { decisions: [] };
      }

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
        const response = await this.openai!.chat.completions.create({
          model: settings.model || "gpt-4o",
          messages,
          max_tokens: settings.maxTokens || 1024,
          temperature: settings.temperature || 0.1,
          response_format: { type: "json_object" },
        });

        const responseContent = response.choices[0]?.message?.content;
        if (!responseContent) {
          throw new Error("No response content from OpenAI");
        }

        // Parse the JSON response
        try {
          return JSON.parse(responseContent);
        } catch (parseError) {
          console.error("Failed to parse OpenAI response as JSON:", parseError);
          return { decisions: [] };
        }
      } catch (error) {
        console.error("Error in decisions extraction:", error);
        return { decisions: [] };
      }
    });

    // Validate and enrich the decisions
    const decisions: Decision[] = (decisionsData.decisions || [])
      .filter((decision: any) => decision && decision.decision && decision.decision.trim().length > 0)
      .map((decision: any) => ({
        decision: decision.decision,
        context: decision.context || "",
        participants: Array.isArray(decision.participants) ? decision.participants : [],
        scope: ["local", "project", "strategic"].includes(decision.scope) ? decision.scope : "local",
        timestamp: decision.timestamp || new Date().toISOString(),
        source: decision.source || "Unknown",
        confidence: ["high", "medium", "low"].includes(decision.confidence) ? decision.confidence : "medium",
      }));

    if (decisions.length === 0) {
      return {
        html: `<h3>Key Decisions</h3><p><em>No significant decisions identified in today's conversations.</em></p>`,
        text: "Key Decisions\n\nNo significant decisions identified in today's conversations.",
        metadata: {
          processingTime,
          logCount: lifelogs.length,
          custom: {
            model: settings.model || "gpt-4o",
            contentLength: formattedContent.length,
            decisionsCount: 0
          }
        }
      };
    }

    // Group decisions by scope
    const strategicDecisions = decisions.filter(d => d.scope === "strategic");
    const projectDecisions = decisions.filter(d => d.scope === "project");
    const localDecisions = decisions.filter(d => d.scope === "local");

    // Generate HTML output
    let html = `<h3>Key Decisions (${decisions.length})</h3>`;

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

    // Generate text output
    let text = `Key Decisions (${decisions.length})\n\n`;

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

    return {
      html,
      text: text.trim(),
      metadata: {
        processingTime,
        logCount: lifelogs.length,
        custom: {
          model: settings.model || "gpt-4o",
          contentLength: formattedContent.length,
          decisionsCount: decisions.length,
          strategicDecisions: strategicDecisions.length,
          projectDecisions: projectDecisions.length,
          localDecisions: localDecisions.length,
          decisions
        }
      }
    };
  }

  /**
   * Utility function to walk through nested content nodes.
   */
  private walk(nodes: ContentNode[]): ContentNode[] {
    return nodes.flatMap((n) => [n, ...(n.children ? this.walk(n.children) : [])]);
  }
}