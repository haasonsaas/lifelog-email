/**
 * Topics Extractor - Identifies and categorizes key topics and themes discussed in conversations.
 * Uses OpenAI's GPT model to extract main discussion topics and categorize them.
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

export interface Topic {
  /** Name of the topic */
  topic: string;
  /** Category of the topic */
  category: "business" | "technical" | "personal" | "planning" | "review" | "other";
  /** Brief description or summary */
  description: string;
  /** Key points discussed */
  keyPoints: string[];
  /** Time range when this topic was discussed */
  timeRange: {
    start: string;
    end: string;
    duration: number; // in minutes
  };
  /** The conversation where this topic was discussed */
  source: string;
  /** Importance level */
  importance: "high" | "medium" | "low";
}

/**
 * Configuration specific to the Topics extractor.
 */
export interface TopicsConfig extends ExtractorConfig {
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
 * Topics extractor implementation.
 */
export class TopicsExtractor extends AbstractExtractor {
  readonly id = "topics";
  readonly name = "Discussion Topics";
  readonly description = "Identifies and categorizes key topics and themes discussed in conversations using OpenAI's GPT model";
  readonly version = "2.0.0";
  
  readonly defaultConfig: TopicsConfig = {
    enabled: true,
    priority: 60,
    settings: {
      model: "gpt-4o",
      maxTokens: 1200,
      temperature: 0.2,
      maxContentLength: 12000
    }
  };

  private openai?: OpenAI;

  /**
   * Initialize the OpenAI client.
   */
  async initialize(env: Env): Promise<void> {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required for Topics extractor");
    }
    
    this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  /**
   * Validate Topics specific configuration.
   */
  validateConfig(config: ExtractorConfig): true | string {
    const baseValidation = super.validateConfig(config);
    if (baseValidation !== true) {
      return baseValidation;
    }

    const topicsConfig = config as TopicsConfig;
    const { settings } = topicsConfig;

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
   * Extract discussion topics from conversations using GPT.
   */
  async extract(lifelogs: Lifelog[], env: Env, config?: ExtractorConfig): Promise<ExtractorResult> {
    if (!this.openai) {
      throw this.createError("OpenAI client not initialized. Call initialize() first.");
    }

    const topicsConfig = { ...this.defaultConfig, ...config } as TopicsConfig;
    const { settings } = topicsConfig;

    if (lifelogs.length === 0) {
      return {
        html: `<h3>Discussion Topics</h3><p><em>No topics identified in today's conversations.</em></p>`,
        text: "Discussion Topics\n\nNo topics identified in today's conversations.",
        metadata: {
          processingTime: 0,
          logCount: 0,
          custom: {
            model: settings.model || "gpt-4o",
            topicsCount: 0
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

    const { result: topicsData, time: processingTime } = await this.measureTime(async () => {

      if (!formattedContent.trim()) {
        return { topics: [] };
      }

      const messages: ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: `You are an expert at analyzing conversations and identifying key discussion topics.

TASK:
Identify and categorize the main topics discussed in conversations. Focus on:
• Major themes and subjects discussed
• Key business or technical topics
• Important planning or decision-making discussions
• Areas of focus or concern
• Topics that consumed significant discussion time

CATEGORIES:
• "business": Strategy, operations, sales, marketing, partnerships
• "technical": Development, infrastructure, tools, technical decisions
• "personal": Career development, team management, individual concerns
• "planning": Project planning, roadmaps, timelines, resource allocation
• "review": Performance reviews, retrospectives, evaluations
• "other": Topics that don't fit other categories

IMPORTANCE LEVELS:
• "high": Critical topics affecting major decisions or outcomes
• "medium": Important topics requiring attention or follow-up
• "low": Informational or minor topics

OUTPUT FORMAT:
Return a valid JSON object with this exact structure:
{
  "topics": [
    {
      "topic": "Clear, concise topic name",
      "category": "business|technical|personal|planning|review|other",
      "description": "Brief description of what was discussed",
      "keyPoints": ["key point 1", "key point 2"],
      "timeRange": {
        "start": "ISO timestamp",
        "end": "ISO timestamp", 
        "duration": 15
      },
      "source": "Meeting/conversation title",
      "importance": "high|medium|low"
    }
  ]
}

GUIDELINES:
• Focus on substantial topics, not brief mentions
• Each topic should represent at least 2-3 minutes of discussion
• Combine related subtopics into broader themes
• Use clear, descriptive topic names
• Include specific key points that were discussed
• Estimate time ranges based on when topics were discussed
• If no significant topics are found, return empty topics array

IMPORTANT:
• Only extract topics that had meaningful discussion
• Use exact quotes or close paraphrases for key points
• Ensure JSON is valid and properly formatted
• Be conservative - better to miss a minor topic than to over-extract`,
        },
        { 
          role: "user", 
          content: `Extract topics from these conversations:\n\n${formattedContent}` 
        },
      ];

      try {
        const response = await this.openai!.chat.completions.create({
          model: settings.model || "gpt-4o",
          messages,
          max_tokens: settings.maxTokens || 1200,
          temperature: settings.temperature || 0.2,
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
          return { topics: [] };
        }
      } catch (error) {
        console.error("Error in topics extraction:", error);
        return { topics: [] };
      }
    });

    // Validate and clean the topics
    const topics: Topic[] = (topicsData.topics || [])
      .filter((topic: any) => topic && topic.topic && topic.topic.trim().length > 0)
      .map((topic: any) => ({
        topic: topic.topic,
        category: ["business", "technical", "personal", "planning", "review", "other"].includes(topic.category) ? topic.category : "other",
        description: topic.description || "",
        keyPoints: Array.isArray(topic.keyPoints) ? topic.keyPoints : [],
        timeRange: {
          start: topic.timeRange?.start || new Date().toISOString(),
          end: topic.timeRange?.end || new Date().toISOString(),
          duration: topic.timeRange?.duration || 0
        },
        source: topic.source || "Unknown",
        importance: ["high", "medium", "low"].includes(topic.importance) ? topic.importance : "medium",
      }));

    if (topics.length === 0) {
      return {
        html: `<h3>Discussion Topics</h3><p><em>No topics identified in today's conversations.</em></p>`,
        text: "Discussion Topics\n\nNo topics identified in today's conversations.",
        metadata: {
          processingTime,
          logCount: lifelogs.length,
          custom: {
            model: settings.model || "gpt-4o",
            contentLength: formattedContent.length,
            topicsCount: 0
          }
        }
      };
    }

    // Group topics by category
    const categories = ["business", "technical", "personal", "planning", "review", "other"];
    const topicsByCategory = categories.reduce((acc, category) => {
      acc[category] = topics.filter(t => t.category === category);
      return acc;
    }, {} as Record<string, Topic[]>);

    // Generate HTML output
    let html = `<h3>Discussion Topics (${topics.length})</h3>`;

    categories.forEach(category => {
      const categoryTopics = topicsByCategory[category];
      if (categoryTopics.length > 0) {
        html += `<h4>${category.charAt(0).toUpperCase() + category.slice(1)} (${categoryTopics.length})</h4>`;
        html += `<div style="margin-left: 15px;">`;
        
        categoryTopics.forEach(topic => {
          const importanceColor = topic.importance === 'high' ? '#ff6b6b' : topic.importance === 'medium' ? '#ffd93d' : '#6bcf7f';
          
          html += `<div style="margin-bottom: 15px; padding: 10px; border-left: 3px solid ${importanceColor}; background-color: #f8f9fa;">`;
          html += `<strong>${topic.topic}</strong> `;
          html += `<span style="background-color: ${importanceColor}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 0.8em; font-weight: bold;">${topic.importance.toUpperCase()}</span><br/>`;
          html += `<em>${topic.description}</em><br/>`;
          
          if (topic.keyPoints.length > 0) {
            html += `<strong>Key Points:</strong><ul>`;
            topic.keyPoints.forEach(point => {
              html += `<li>${point}</li>`;
            });
            html += `</ul>`;
          }
          
          html += `<small><strong>Duration:</strong> ${topic.timeRange.duration} minutes | <strong>Source:</strong> ${topic.source}</small>`;
          html += `</div>`;
        });
        
        html += `</div>`;
      }
    });

    // Generate text output
    let text = `Discussion Topics (${topics.length})\n\n`;

    categories.forEach(category => {
      const categoryTopics = topicsByCategory[category];
      if (categoryTopics.length > 0) {
        text += `${category.charAt(0).toUpperCase() + category.slice(1)} (${categoryTopics.length}):\n`;
        
        categoryTopics.forEach(topic => {
          text += `\n• ${topic.topic} [${topic.importance.toUpperCase()}]\n`;
          text += `  ${topic.description}\n`;
          
          if (topic.keyPoints.length > 0) {
            text += `  Key Points:\n`;
            topic.keyPoints.forEach(point => {
              text += `    - ${point}\n`;
            });
          }
          
          text += `  Duration: ${topic.timeRange.duration} minutes | Source: ${topic.source}\n`;
        });
        
        text += `\n`;
      }
    });

    return {
      html,
      text: text.trim(),
      metadata: {
        processingTime,
        logCount: lifelogs.length,
        custom: {
          model: settings.model || "gpt-4o",
          contentLength: formattedContent.length,
          topicsCount: topics.length,
          topicsByCategory: Object.keys(topicsByCategory).reduce((acc, cat) => {
            acc[cat] = topicsByCategory[cat].length;
            return acc;
          }, {} as Record<string, number>),
          topics
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