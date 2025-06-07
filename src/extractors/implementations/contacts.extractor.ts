/**
 * Contacts Extractor - Identifies and extracts contact information and people mentioned in conversations.
 * Uses OpenAI's GPT model to identify people, their roles, and contact details.
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

export interface Contact {
  /** Name of the person */
  name: string;
  /** Their role or title if mentioned */
  role?: string;
  /** Organization or company if mentioned */
  organization?: string;
  /** Email address if mentioned */
  email?: string;
  /** Phone number if mentioned */
  phone?: string;
  /** Context of how they were mentioned */
  context: string;
  /** The conversation where they were mentioned */
  source: string;
  /** Confidence level in extraction */
  confidence: "high" | "medium" | "low";
}

/**
 * Configuration specific to the Contacts extractor.
 */
export interface ContactsConfig extends ExtractorConfig {
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
 * Contacts extractor implementation.
 */
export class ContactsExtractor extends AbstractExtractor {
  readonly id = "contacts";
  readonly name = "Contact Information";
  readonly description = "Extracts contact information and people mentioned in conversations using OpenAI's GPT model";
  readonly version = "2.0.0";
  
  readonly defaultConfig: ContactsConfig = {
    enabled: false, // Disabled by default as it may contain sensitive information
    priority: 70,
    settings: {
      model: "gpt-4o",
      maxTokens: 800,
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
      throw new Error("OPENAI_API_KEY is required for Contacts extractor");
    }
    
    this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  /**
   * Validate Contacts specific configuration.
   */
  validateConfig(config: ExtractorConfig): true | string {
    const baseValidation = super.validateConfig(config);
    if (baseValidation !== true) {
      return baseValidation;
    }

    const contactsConfig = config as ContactsConfig;
    const { settings } = contactsConfig;

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
   * Extract contact information from conversations using GPT.
   */
  async extract(lifelogs: Lifelog[], env: Env, config?: ExtractorConfig): Promise<ExtractorResult> {
    if (!this.openai) {
      throw this.createError("OpenAI client not initialized. Call initialize() first.");
    }

    const contactsConfig = { ...this.defaultConfig, ...config } as ContactsConfig;
    const { settings } = contactsConfig;

    if (lifelogs.length === 0) {
      return {
        html: `<h3>Contact Information</h3><p><em>No contacts mentioned in today's conversations.</em></p>`,
        text: "Contact Information\n\nNo contacts mentioned in today's conversations.",
        metadata: {
          processingTime: 0,
          logCount: 0,
          custom: {
            model: settings.model || "gpt-4o",
            contactsCount: 0
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

    const { result: contactsData, time: processingTime } = await this.measureTime(async () => {

      if (!formattedContent.trim()) {
        return { contacts: [] };
      }

      const messages: ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: `You are an expert at extracting contact information from conversation transcripts.

TASK:
Extract people, organizations, and contact details mentioned in conversations. Focus on:
• Names of people mentioned (excluding speakers already identified)
• Their roles, titles, or positions
• Companies or organizations they're affiliated with
• Email addresses, phone numbers, or other contact details
• Context of how they were mentioned

WHAT TO EXTRACT:
• New contacts or people mentioned by name
• Business contacts and colleagues
• Clients, customers, or prospects
• Vendors, partners, or service providers
• Contact details like emails, phone numbers
• Professional relationships and roles

WHAT NOT TO EXTRACT:
• Generic references (e.g., "the team", "customer service")
• Public figures or celebrities mentioned in passing
• Fictional characters or brands
• Speaker names that are already known

OUTPUT FORMAT:
Return a valid JSON object with this exact structure:
{
  "contacts": [
    {
      "name": "Full name of the person",
      "role": "Their title or role (if mentioned)",
      "organization": "Company or organization (if mentioned)",
      "email": "email@example.com (if mentioned)",
      "phone": "phone number (if mentioned)",
      "context": "Brief context of how they were mentioned",
      "source": "Meeting/conversation title",
      "confidence": "high|medium|low"
    }
  ]
}

CONFIDENCE LEVELS:
• "high": Full name and clear role/context mentioned
• "medium": Name mentioned with some context
• "low": Name mentioned but limited context

IMPORTANT:
• Only extract actual people, not general references
• Use exact names as mentioned in the conversation
• If no contacts are found, return empty contacts array
• Be conservative with personal information
• Ensure JSON is valid and properly formatted`,
        },
        { 
          role: "user", 
          content: `Extract contacts from these conversations:\n\n${formattedContent}` 
        },
      ];

      try {
        const response = await this.openai!.chat.completions.create({
          model: settings.model || "gpt-4o",
          messages,
          max_tokens: settings.maxTokens || 800,
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
          return { contacts: [] };
        }
      } catch (error) {
        console.error("Error in contacts extraction:", error);
        return { contacts: [] };
      }
    });

    // Validate and clean the contacts
    const contacts: Contact[] = (contactsData.contacts || [])
      .filter((contact: any) => contact && contact.name && contact.name.trim().length > 0)
      .map((contact: any) => ({
        name: contact.name,
        role: contact.role || undefined,
        organization: contact.organization || undefined,
        email: contact.email || undefined,
        phone: contact.phone || undefined,
        context: contact.context || "",
        source: contact.source || "Unknown",
        confidence: ["high", "medium", "low"].includes(contact.confidence) ? contact.confidence : "medium",
      }));

    if (contacts.length === 0) {
      return {
        html: `<h3>Contact Information</h3><p><em>No contacts mentioned in today's conversations.</em></p>`,
        text: "Contact Information\n\nNo contacts mentioned in today's conversations.",
        metadata: {
          processingTime,
          logCount: lifelogs.length,
          custom: {
            model: settings.model || "gpt-4o",
            contentLength: formattedContent.length,
            contactsCount: 0
          }
        }
      };
    }

    // Generate HTML output
    let html = `<h3>Contact Information (${contacts.length})</h3>`;
    html += `<div style="margin-top: 10px;">`;
    
    contacts.forEach(contact => {
      html += `<div style="margin-bottom: 15px; padding: 10px; border-left: 3px solid #007cba; background-color: #f8f9fa;">`;
      html += `<strong>${contact.name}</strong>`;
      if (contact.role) html += ` - <em>${contact.role}</em>`;
      html += `<br/>`;
      if (contact.organization) html += `<strong>Organization:</strong> ${contact.organization}<br/>`;
      if (contact.email) html += `<strong>Email:</strong> <a href="mailto:${contact.email}">${contact.email}</a><br/>`;
      if (contact.phone) html += `<strong>Phone:</strong> ${contact.phone}<br/>`;
      html += `<strong>Context:</strong> ${contact.context}<br/>`;
      html += `<strong>Source:</strong> ${contact.source}`;
      html += `</div>`;
    });
    
    html += `</div>`;

    // Generate text output
    let text = `Contact Information (${contacts.length})\n\n`;
    
    contacts.forEach(contact => {
      text += `${contact.name}`;
      if (contact.role) text += ` - ${contact.role}`;
      text += `\n`;
      if (contact.organization) text += `  Organization: ${contact.organization}\n`;
      if (contact.email) text += `  Email: ${contact.email}\n`;
      if (contact.phone) text += `  Phone: ${contact.phone}\n`;
      text += `  Context: ${contact.context}\n`;
      text += `  Source: ${contact.source}\n\n`;
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
          contactsCount: contacts.length,
          contacts
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