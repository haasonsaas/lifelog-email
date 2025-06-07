/**
 * Action Items Extractor - Uses OpenAI's GPT model to extract actionable tasks from conversations.
 * Refactored from the original action_items function to implement the BaseExtractor interface.
 */

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { Env, Lifelog, ActionItem } from "../../types";
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
 * Configuration specific to the Action Items extractor.
 */
export interface ActionItemsConfig extends ExtractorConfig {
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
 * Action Items extractor implementation.
 */
export class ActionItemsExtractor extends AbstractExtractor {
  readonly id = "action_items";
  readonly name = "Action Items";
  readonly description = "Extracts actionable tasks and assignments from conversations using OpenAI's GPT model";
  readonly version = "2.0.0";
  
  readonly defaultConfig: ActionItemsConfig = {
    enabled: true,
    priority: 90,
    settings: {
      model: "gpt-4o",
      maxTokens: 1000,
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
      throw new Error("OPENAI_API_KEY is required for Action Items extractor");
    }
    
    this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  /**
   * Validate Action Items specific configuration.
   */
  validateConfig(config: ExtractorConfig): true | string {
    const baseValidation = super.validateConfig(config);
    if (baseValidation !== true) {
      return baseValidation;
    }

    const actionItemsConfig = config as ActionItemsConfig;
    const { settings } = actionItemsConfig;

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
   * Extract action items from conversations using GPT.
   */
  async extract(lifelogs: Lifelog[], env: Env, config?: ExtractorConfig): Promise<ExtractorResult> {
    if (!this.openai) {
      throw this.createError("OpenAI client not initialized. Call initialize() first.");
    }

    const actionItemsConfig = { ...this.defaultConfig, ...config } as ActionItemsConfig;
    const { settings } = actionItemsConfig;

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

    const { result: actionItemsData, time: processingTime } = await this.measureTime(async () => {

      if (!formattedContent.trim()) {
        return [];
      }

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

      const response = await this.openai!.chat.completions.create({
        model: settings.model || "gpt-4o",
        messages,
        max_tokens: settings.maxTokens || 1000,
        temperature: settings.temperature || 0.1,
      });

      const rawResponse = response.choices[0]?.message?.content || "[]";
      
      try {
        return JSON.parse(rawResponse);
      } catch (error) {
        console.error("Failed to parse action items JSON:", error);
        return [];
      }
    });

    // Convert to ActionItem objects with generated IDs and timestamps
    const actionItems: ActionItem[] = actionItemsData.map((item: any, index: number) => ({
      id: `action-${Date.now()}-${index}`,
      task: item.task || "",
      owner: item.owner || "Unknown",
      dueDate: item.dueDate || undefined,
      priority: item.priority || "medium",
      status: item.status || "new",
      context: item.context || "",
      timestamp: new Date().toISOString()
    }));

    if (actionItems.length === 0) {
      return {
        html: `<h3>Action Items</h3><p><em>No action items found in today's conversations.</em></p>`,
        text: "Action Items\n\nNo action items found in today's conversations.",
        metadata: {
          processingTime,
          logCount: lifelogs.length,
          custom: {
            model: settings.model || "gpt-4o",
            contentLength: formattedContent.length,
            actionItemsCount: 0
          }
        }
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

    const html = `<h3>Action Items (${actionItems.length})</h3>${htmlTable}`;

    // Generate text output  
    const textTable = actionItems.map(item => 
      `• ${item.task} (${item.owner}) - Due: ${item.dueDate || 'Not specified'} - Priority: ${item.priority.toUpperCase()} - Status: ${item.status.replace('_', ' ').toUpperCase()}`
    ).join('\n');

    const text = `Action Items (${actionItems.length})\n\n${textTable}`;

    return {
      html,
      text,
      metadata: {
        processingTime,
        logCount: lifelogs.length,
        custom: {
          model: settings.model || "gpt-4o",
          contentLength: formattedContent.length,
          actionItemsCount: actionItems.length,
          actionItems
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