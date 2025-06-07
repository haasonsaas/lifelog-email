/**
 * GPT Summary Extractor - Uses OpenAI's GPT model to generate conversation summaries.
 * Refactored from the original gpt_summary function to implement the BaseExtractor interface.
 */

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { Env, Lifelog, LifelogContent } from "../../types";
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

/**
 * Configuration specific to the GPT Summary extractor.
 */
export interface GptSummaryConfig extends ExtractorConfig {
  settings: {
    /** OpenAI model to use for summarization */
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
 * GPT Summary extractor implementation.
 */
export class GptSummaryExtractor extends AbstractExtractor {
  readonly id = "gpt_summary";
  readonly name = "GPT Summary";
  readonly description = "Generates AI-powered conversation summaries using OpenAI's GPT model";
  readonly version = "2.0.0";
  
  readonly defaultConfig: GptSummaryConfig = {
    enabled: true,
    priority: 100,
    settings: {
      model: "gpt-4o",
      maxTokens: 512,
      temperature: 0.3,
      maxContentLength: 12000
    }
  };

  private openai?: OpenAI;

  /**
   * Initialize the OpenAI client.
   */
  async initialize(env: Env): Promise<void> {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required for GPT Summary extractor");
    }
    
    this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  /**
   * Validate GPT Summary specific configuration.
   */
  validateConfig(config: ExtractorConfig): true | string {
    const baseValidation = super.validateConfig(config);
    if (baseValidation !== true) {
      return baseValidation;
    }

    const gptConfig = config as GptSummaryConfig;
    const { settings } = gptConfig;

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
   * Extract conversation summary using GPT.
   */
  async extract(lifelogs: Lifelog[], env: Env, config?: ExtractorConfig): Promise<ExtractorResult> {
    if (!this.openai) {
      throw this.createError("OpenAI client not initialized. Call initialize() first.");
    }

    const gptConfig = { ...this.defaultConfig, ...config } as GptSummaryConfig;
    const { settings } = gptConfig;

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

    const { result: summary, time: processingTime } = await this.measureTime(async () => {

      if (!formattedContent.trim()) {
        return "(no content to summarize)";
      }

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

      const response = await this.openai!.chat.completions.create({
        model: settings.model || "gpt-4o",
        messages,
        max_tokens: settings.maxTokens || 512,
        temperature: settings.temperature || 0.3,
      });

      return response.choices[0]?.message?.content || "(no summary generated)";
    });

    // Generate date string for the summary
    const timezone = env.TIMEZONE || "America/Los_Angeles";
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
    now.setDate(now.getDate() - 1);
    const dateStr = now.toLocaleDateString("en-US", { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });

    return {
      html: `
        <h2>Daily Summary</h2>
        <div style="white-space: pre-wrap; font-family: monospace; line-height: 1.5;">${summary}</div>
      `,
      text: `Daily Summary\n\n${summary}`,
      metadata: {
        processingTime,
        logCount: lifelogs.length,
        custom: {
          model: settings.model || "gpt-4o",
          contentLength: formattedContent.length,
          dateStr
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