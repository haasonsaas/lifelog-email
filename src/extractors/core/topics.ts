/**
 * Topics extractor: analyzes conversation topics with time tracking, importance, and trends.
 * Provides insights into how time is spent and what subjects are most important.
 */

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { Env, Lifelog } from "../../types";

export interface Topic {
  /** The main topic or subject discussed */
  topic: string;
  /** Detailed description of what was discussed about this topic */
  description: string;
  /** Estimated time spent on this topic in minutes */
  durationMinutes: number;
  /** When the topic was first mentioned (ISO timestamp) */
  startTime: string;
  /** When the topic ended or transitioned (ISO timestamp) */
  endTime: string;
  /** How important or engaging this topic was (1-5 scale) */
  importance: 1 | 2 | 3 | 4 | 5;
  /** Level of engagement/energy in the discussion (low, medium, high) */
  engagement: "low" | "medium" | "high";
  /** Who were the main participants in this topic */
  participants: string[];
  /** Keywords or tags associated with this topic */
  keywords: string[];
  /** The conversation/meeting where this topic occurred */
  source: string;
  /** Related topics that were mentioned or connected */
  relatedTopics: string[];
  /** Type of topic (work, personal, strategic, operational, etc.) */
  category: "work" | "personal" | "strategic" | "operational" | "social" | "learning" | "planning" | "technical" | "creative" | "other";
  /** Whether this topic has been discussed before (recurring) */
  isRecurring: boolean;
  /** Confidence level in topic extraction accuracy (high, medium, low) */
  confidence: "high" | "medium" | "low";
}

export interface TopicTransition {
  /** The topic being transitioned from */
  fromTopic: string;
  /** The topic being transitioned to */
  toTopic: string;
  /** When the transition occurred */
  transitionTime: string;
  /** How the transition happened (natural, forced, interrupted) */
  transitionType: "natural" | "forced" | "interrupted";
  /** The conversation where this transition occurred */
  source: string;
}

export interface TopicsExtractorResult {
  /** Array of identified topics */
  topics: Topic[];
  /** Topic transitions within conversations */
  transitions: TopicTransition[];
  /** Summary statistics and insights */
  summary: {
    totalTopics: number;
    totalDiscussionTime: number;
    averageTopicDuration: number;
    mostImportantTopic: string | null;
    longestTopic: string | null;
    mostEngagingTopic: string | null;
    topicsByCategory: Record<string, number>;
    recurringTopics: number;
    uniqueTopics: number;
  };
  /** Time allocation insights */
  timeAnalysis: {
    /** Time spent per category */
    timeByCategory: Record<string, number>;
    /** Time spent per importance level */
    timeByImportance: Record<number, number>;
    /** Peak discussion periods */
    peakDiscussionHours: string[];
    /** Topics that took longer than expected */
    longRunningTopics: string[];
    /** Topics that were brief but important */
    highImpactBriefTopics: string[];
  };
  /** Trending insights */
  trends: {
    /** Topics that appear frequently */
    frequentTopics: string[];
    /** Topics with increasing discussion time */
    growingTopics: string[];
    /** New topics that appeared today */
    newTopics: string[];
    /** Topics with high engagement */
    hotTopics: string[];
  };
  /** Processing metadata */
  metadata: {
    processedConversations: number;
    totalContentLength: number;
    extractionTimestamp: string;
    averageConfidence: string;
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
 * Extracts conversation topics with time tracking and analysis using OpenAI GPT.
 * Provides comprehensive insights into topic patterns, time allocation, and trends.
 */
export async function extractTopics(
  lifelogs: Lifelog[], 
  env: Env
): Promise<TopicsExtractorResult> {
  if (!lifelogs || lifelogs.length === 0) {
    return {
      topics: [],
      transitions: [],
      summary: {
        totalTopics: 0,
        totalDiscussionTime: 0,
        averageTopicDuration: 0,
        mostImportantTopic: null,
        longestTopic: null,
        mostEngagingTopic: null,
        topicsByCategory: {},
        recurringTopics: 0,
        uniqueTopics: 0,
      },
      timeAnalysis: {
        timeByCategory: {},
        timeByImportance: {},
        peakDiscussionHours: [],
        longRunningTopics: [],
        highImpactBriefTopics: [],
      },
      trends: {
        frequentTopics: [],
        growingTopics: [],
        newTopics: [],
        hotTopics: [],
      },
      metadata: {
        processedConversations: 0,
        totalContentLength: 0,
        extractionTimestamp: new Date().toISOString(),
        averageConfidence: "high",
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

  // Format the content for GPT with clear conversation boundaries and timestamps
  const formattedContent = processedLogs.map(log => {
    const duration = Math.round((new Date(log.endTime).getTime() - new Date(log.startTime).getTime()) / 1000 / 60);
    return `Conversation: ${log.title} (${duration} minutes total)
Start: ${new Date(log.startTime).toLocaleTimeString()}
End: ${new Date(log.endTime).toLocaleTimeString()}

${log.content.map(c => {
  const timestamp = new Date(c.startTime).toLocaleTimeString();
  return `[${timestamp}] ${c.speaker}: ${c.content}`;
}).join('\n')}

---`;
  }).join('\n\n').slice(0, 15_000);

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are an expert conversation analyst specializing in topic identification and time tracking. Your task is to analyze conversations and extract detailed topic information with time insights.

TOPIC IDENTIFICATION CRITERIA:
• Distinct subjects or themes of discussion (not just keywords)
• Conversations that have a clear focus for a meaningful duration
• Topics that provide insights into how time is spent
• Subjects that show engagement or importance to participants

WHAT TO TRACK:
• Main topics and their detailed descriptions
• Time spent on each topic (estimate based on conversation flow)
• Importance level (1-5 scale based on engagement, urgency, or impact)
• Engagement level (low/medium/high based on participation and energy)
• Topic categories (work, personal, strategic, operational, social, learning, planning, technical, creative, other)
• Keywords and related topics
• Whether topics seem recurring vs new
• Topic transitions and how they occurred

TIME ESTIMATION GUIDELINES:
• Estimate topic duration based on conversation flow and timestamp analysis
• Consider natural breaks, speaker changes, and topic shifts
• Account for overlapping topics (multiple topics can be discussed simultaneously)
• Be realistic about attention spans and focus periods

IMPORTANCE SCORING (1-5):
• 1: Casual mentions, small talk, routine updates
• 2: Standard work discussions, regular planning
• 3: Significant work topics, important decisions
• 4: High-impact discussions, strategic planning, urgent issues
• 5: Critical decisions, major announcements, crisis management

ENGAGEMENT LEVELS:
• Low: Routine updates, one-way information sharing
• Medium: Standard discussions with some back-and-forth
• High: Animated discussions, brainstorming, heated debates, excited planning

OUTPUT FORMAT:
Return a valid JSON object with this exact structure:
{
  "topics": [
    {
      "topic": "Brief, clear topic name",
      "description": "Detailed description of what was discussed",
      "durationMinutes": 15,
      "startTime": "ISO timestamp when topic started",
      "endTime": "ISO timestamp when topic ended",
      "importance": 3,
      "engagement": "medium",
      "participants": ["person1", "person2"],
      "keywords": ["keyword1", "keyword2"],
      "source": "Meeting/conversation title",
      "relatedTopics": ["related topic 1"],
      "category": "work",
      "isRecurring": false,
      "confidence": "high"
    }
  ],
  "transitions": [
    {
      "fromTopic": "Previous topic",
      "toTopic": "Next topic", 
      "transitionTime": "ISO timestamp",
      "transitionType": "natural",
      "source": "Conversation title"
    }
  ]
}

CATEGORIES:
• work: Business tasks, meetings, project discussions
• personal: Life updates, family, health, hobbies
• strategic: Long-term planning, vision, major decisions
• operational: Day-to-day processes, procedures, logistics
• social: Team building, casual conversation, relationship building
• learning: Education, training, skill development, knowledge sharing
• planning: Scheduling, coordination, organizing future activities
• technical: Technology discussions, technical problem-solving
• creative: Brainstorming, design, innovation, artistic pursuits
• other: Anything that doesn't fit other categories

TRANSITION TYPES:
• natural: Topic evolved organically from previous discussion
• forced: Topic was deliberately changed or redirected
• interrupted: Topic was cut off by external factors or urgent matters

IMPORTANT RULES:
• Only extract topics that had meaningful discussion (not just brief mentions)
• Estimate times realistically based on conversation flow
• Use exact quotes or close paraphrases for topic names
• If no clear topics are found, return empty arrays
• Ensure JSON is valid and properly formatted
• Be conservative with importance ratings - most topics should be 2-3
• Mark topics as recurring if they seem like ongoing themes`,
    },
    { 
      role: "user", 
      content: `Analyze these conversations and extract topics with detailed time tracking:\n\n${formattedContent}` 
    },
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 2048,
      temperature: 0.2, // Low temperature for consistency
      response_format: { type: "json_object" },
    });

    const responseContent = response.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error("No response content from OpenAI");
    }

    // Parse the JSON response
    let parsedResponse: { topics: Topic[]; transitions: TopicTransition[] };
    try {
      parsedResponse = JSON.parse(responseContent);
    } catch (parseError) {
      console.error("Failed to parse OpenAI response as JSON:", parseError);
      throw new Error("Invalid JSON response from OpenAI");
    }

    // Validate and enrich the topics
    const topics: Topic[] = (parsedResponse.topics || [])
      .filter(topic => topic && topic.topic && topic.topic.trim().length > 0)
      .map(topic => ({
        topic: topic.topic,
        description: topic.description || "",
        durationMinutes: Math.max(1, Math.min(180, topic.durationMinutes || 5)), // Between 1-180 minutes
        startTime: topic.startTime || new Date().toISOString(),
        endTime: topic.endTime || new Date().toISOString(),
        importance: [1, 2, 3, 4, 5].includes(topic.importance) ? topic.importance : 3,
        engagement: ["low", "medium", "high"].includes(topic.engagement) ? topic.engagement : "medium",
        participants: Array.isArray(topic.participants) ? topic.participants : [],
        keywords: Array.isArray(topic.keywords) ? topic.keywords : [],
        source: topic.source || "Unknown",
        relatedTopics: Array.isArray(topic.relatedTopics) ? topic.relatedTopics : [],
        category: ["work", "personal", "strategic", "operational", "social", "learning", "planning", "technical", "creative", "other"].includes(topic.category) ? topic.category : "other",
        isRecurring: Boolean(topic.isRecurring),
        confidence: ["high", "medium", "low"].includes(topic.confidence) ? topic.confidence : "medium",
      }));

    // Validate and enrich transitions
    const transitions: TopicTransition[] = (parsedResponse.transitions || [])
      .filter(t => t && t.fromTopic && t.toTopic)
      .map(t => ({
        fromTopic: t.fromTopic,
        toTopic: t.toTopic,
        transitionTime: t.transitionTime || new Date().toISOString(),
        transitionType: ["natural", "forced", "interrupted"].includes(t.transitionType) ? t.transitionType : "natural",
        source: t.source || "Unknown",
      }));

    // Generate comprehensive analysis
    const totalDiscussionTime = topics.reduce((sum, topic) => sum + topic.durationMinutes, 0);
    const averageTopicDuration = topics.length > 0 ? Math.round(totalDiscussionTime / topics.length) : 0;
    
    // Find key topics
    const mostImportantTopic = topics.reduce((max, topic) => 
      topic.importance > (max?.importance || 0) ? topic : max, null as Topic | null)?.topic || null;
    
    const longestTopic = topics.reduce((max, topic) => 
      topic.durationMinutes > (max?.durationMinutes || 0) ? topic : max, null as Topic | null)?.topic || null;
    
    const mostEngagingTopic = topics.filter(t => t.engagement === "high")
      .sort((a, b) => b.durationMinutes - a.durationMinutes)[0]?.topic || null;

    // Category analysis
    const topicsByCategory = topics.reduce((acc, topic) => {
      acc[topic.category] = (acc[topic.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Time analysis
    const timeByCategory = topics.reduce((acc, topic) => {
      acc[topic.category] = (acc[topic.category] || 0) + topic.durationMinutes;
      return acc;
    }, {} as Record<string, number>);

    const timeByImportance = topics.reduce((acc, topic) => {
      acc[topic.importance] = (acc[topic.importance] || 0) + topic.durationMinutes;
      return acc;
    }, {} as Record<number, number>);

    // Peak discussion hours (most active conversation times)
    const peakDiscussionHours = topics
      .map(topic => new Date(topic.startTime).getHours())
      .reduce((acc, hour) => {
        acc[hour] = (acc[hour] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);
    
    const sortedHours = Object.entries(peakDiscussionHours)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([hour]) => `${hour}:00`);

    // Identify notable topics
    const averageDuration = averageTopicDuration;
    const longRunningTopics = topics
      .filter(topic => topic.durationMinutes > averageDuration * 1.5)
      .map(topic => topic.topic);

    const highImpactBriefTopics = topics
      .filter(topic => topic.durationMinutes < averageDuration * 0.7 && topic.importance >= 4)
      .map(topic => topic.topic);

    // Trend analysis
    const frequentTopics = topics
      .filter(topic => topic.isRecurring)
      .map(topic => topic.topic);

    const hotTopics = topics
      .filter(topic => topic.engagement === "high")
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 5)
      .map(topic => topic.topic);

    const newTopics = topics
      .filter(topic => !topic.isRecurring)
      .map(topic => topic.topic);

    // Calculate average confidence
    const confidenceValues = { high: 3, medium: 2, low: 1 };
    const avgConfidenceNum = topics.length > 0 
      ? topics.reduce((sum, topic) => sum + confidenceValues[topic.confidence], 0) / topics.length
      : 3;
    
    const averageConfidence = avgConfidenceNum >= 2.5 ? "high" : avgConfidenceNum >= 1.5 ? "medium" : "low";

    return {
      topics,
      transitions,
      summary: {
        totalTopics: topics.length,
        totalDiscussionTime,
        averageTopicDuration,
        mostImportantTopic,
        longestTopic,
        mostEngagingTopic,
        topicsByCategory,
        recurringTopics: frequentTopics.length,
        uniqueTopics: newTopics.length,
      },
      timeAnalysis: {
        timeByCategory,
        timeByImportance,
        peakDiscussionHours: sortedHours,
        longRunningTopics,
        highImpactBriefTopics,
      },
      trends: {
        frequentTopics,
        growingTopics: [], // Would need historical data to determine this
        newTopics,
        hotTopics,
      },
      metadata: {
        processedConversations: processedLogs.length,
        totalContentLength: formattedContent.length,
        extractionTimestamp: new Date().toISOString(),
        averageConfidence,
      },
    };

  } catch (error) {
    console.error("Error in topics extraction:", error);
    
    // Return empty result on error rather than throwing
    return {
      topics: [],
      transitions: [],
      summary: {
        totalTopics: 0,
        totalDiscussionTime: 0,
        averageTopicDuration: 0,
        mostImportantTopic: null,
        longestTopic: null,
        mostEngagingTopic: null,
        topicsByCategory: {},
        recurringTopics: 0,
        uniqueTopics: 0,
      },
      timeAnalysis: {
        timeByCategory: {},
        timeByImportance: {},
        peakDiscussionHours: [],
        longRunningTopics: [],
        highImpactBriefTopics: [],
      },
      trends: {
        frequentTopics: [],
        growingTopics: [],
        newTopics: [],
        hotTopics: [],
      },
      metadata: {
        processedConversations: processedLogs.length,
        totalContentLength: formattedContent.length,
        extractionTimestamp: new Date().toISOString(),
        averageConfidence: "medium",
      },
    };
  }
}

/**
 * Formats topics into HTML for email display
 */
export function formatTopicsAsHtml(result: TopicsExtractorResult): string {
  if (result.topics.length === 0) {
    return `<h3>Conversation Topics</h3><p><em>No significant topics identified in today's conversations.</em></p>`;
  }

  let html = `<h3>Conversation Topics (${result.summary.totalTopics})</h3>`;
  
  // Summary stats
  html += `<div style="background-color: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 5px;">
    <strong>Overview:</strong> ${result.summary.totalDiscussionTime} minutes across ${result.summary.totalTopics} topics<br/>
    <strong>Average Topic Duration:</strong> ${result.summary.averageTopicDuration} minutes<br/>
    ${result.summary.mostImportantTopic ? `<strong>Most Important:</strong> ${result.summary.mostImportantTopic}<br/>` : ''}
    ${result.summary.longestTopic ? `<strong>Longest Discussion:</strong> ${result.summary.longestTopic}<br/>` : ''}
    ${result.summary.mostEngagingTopic ? `<strong>Most Engaging:</strong> ${result.summary.mostEngagingTopic}` : ''}
  </div>`;

  // Group topics by importance
  const highImportanceTopics = result.topics.filter(t => t.importance >= 4);
  const mediumImportanceTopics = result.topics.filter(t => t.importance === 3);
  const lowImportanceTopics = result.topics.filter(t => t.importance <= 2);

  if (highImportanceTopics.length > 0) {
    html += `<h4>High Impact Topics</h4><ul>`;
    highImportanceTopics.forEach(topic => {
      const importanceColor = topic.importance === 5 ? '#ff4444' : '#ff7744';
      const engagementIcon = topic.engagement === 'high' ? '🔥' : topic.engagement === 'medium' ? '💬' : '📝';
      html += `<li>
        <span style="background-color: ${importanceColor}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 0.8em; margin-right: 5px;">
          ${topic.importance}/5
        </span>
        ${engagementIcon} <strong>${topic.topic}</strong> (${topic.durationMinutes}min)<br/>
        <em>${topic.description}</em><br/>
        <small>Category: ${topic.category} | Participants: ${topic.participants.join(', ') || 'N/A'} | Source: ${topic.source}</small>
        ${topic.keywords.length > 0 ? `<br/><small>Keywords: ${topic.keywords.join(', ')}</small>` : ''}
      </li>`;
    });
    html += `</ul>`;
  }

  if (mediumImportanceTopics.length > 0) {
    html += `<h4>Standard Topics</h4><ul>`;
    mediumImportanceTopics.forEach(topic => {
      const engagementIcon = topic.engagement === 'high' ? '🔥' : topic.engagement === 'medium' ? '💬' : '📝';
      html += `<li>
        ${engagementIcon} <strong>${topic.topic}</strong> (${topic.durationMinutes}min)<br/>
        <em>${topic.description}</em><br/>
        <small>Category: ${topic.category} | Source: ${topic.source}</small>
      </li>`;
    });
    html += `</ul>`;
  }

  if (lowImportanceTopics.length > 0) {
    html += `<h4>Brief Discussions</h4>`;
    html += `<p><small>`;
    lowImportanceTopics.forEach((topic, index) => {
      html += `${topic.topic} (${topic.durationMinutes}min)`;
      if (index < lowImportanceTopics.length - 1) html += ', ';
    });
    html += `</small></p>`;
  }

  // Time insights
  if (Object.keys(result.timeAnalysis.timeByCategory).length > 0) {
    html += `<h4>Time Allocation</h4>`;
    const sortedCategories = Object.entries(result.timeAnalysis.timeByCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    
    html += `<ul>`;
    sortedCategories.forEach(([category, minutes]) => {
      const percentage = Math.round((minutes / result.summary.totalDiscussionTime) * 100);
      html += `<li><strong>${category}:</strong> ${minutes} minutes (${percentage}%)</li>`;
    });
    html += `</ul>`;
  }

  return html;
}

/**
 * Formats topics as plain text for email display
 */
export function formatTopicsAsText(result: TopicsExtractorResult): string {
  if (result.topics.length === 0) {
    return `Conversation Topics\n\nNo significant topics identified in today's conversations.`;
  }

  let text = `Conversation Topics (${result.summary.totalTopics})\n\n`;
  
  // Summary stats
  text += `Overview: ${result.summary.totalDiscussionTime} minutes across ${result.summary.totalTopics} topics\n`;
  text += `Average Topic Duration: ${result.summary.averageTopicDuration} minutes\n`;
  if (result.summary.mostImportantTopic) text += `Most Important: ${result.summary.mostImportantTopic}\n`;
  if (result.summary.longestTopic) text += `Longest Discussion: ${result.summary.longestTopic}\n`;
  if (result.summary.mostEngagingTopic) text += `Most Engaging: ${result.summary.mostEngagingTopic}\n`;
  text += `\n`;

  // Group topics by importance
  const highImportanceTopics = result.topics.filter(t => t.importance >= 4);
  const mediumImportanceTopics = result.topics.filter(t => t.importance === 3);
  const lowImportanceTopics = result.topics.filter(t => t.importance <= 2);

  if (highImportanceTopics.length > 0) {
    text += `High Impact Topics:\n`;
    highImportanceTopics.forEach(topic => {
      text += `• ${topic.topic} (${topic.durationMinutes}min, Importance: ${topic.importance}/5)\n`;
      text += `  ${topic.description}\n`;
      text += `  Category: ${topic.category} | Engagement: ${topic.engagement}\n`;
      if (topic.participants.length > 0) text += `  Participants: ${topic.participants.join(', ')}\n`;
      if (topic.keywords.length > 0) text += `  Keywords: ${topic.keywords.join(', ')}\n`;
      text += `  Source: ${topic.source}\n\n`;
    });
  }

  if (mediumImportanceTopics.length > 0) {
    text += `Standard Topics:\n`;
    mediumImportanceTopics.forEach(topic => {
      text += `• ${topic.topic} (${topic.durationMinutes}min)\n`;
      text += `  ${topic.description}\n`;
      text += `  Category: ${topic.category} | Source: ${topic.source}\n\n`;
    });
  }

  if (lowImportanceTopics.length > 0) {
    text += `Brief Discussions:\n`;
    lowImportanceTopics.forEach(topic => {
      text += `• ${topic.topic} (${topic.durationMinutes}min)\n`;
    });
    text += `\n`;
  }

  // Time insights
  if (Object.keys(result.timeAnalysis.timeByCategory).length > 0) {
    text += `Time Allocation:\n`;
    const sortedCategories = Object.entries(result.timeAnalysis.timeByCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    
    sortedCategories.forEach(([category, minutes]) => {
      const percentage = Math.round((minutes / result.summary.totalDiscussionTime) * 100);
      text += `• ${category}: ${minutes} minutes (${percentage}%)\n`;
    });
    text += `\n`;
  }

  // Trends
  if (result.trends.hotTopics.length > 0) {
    text += `High Engagement Topics: ${result.trends.hotTopics.join(', ')}\n`;
  }

  if (result.trends.newTopics.length > 0) {
    text += `New Topics Today: ${result.trends.newTopics.slice(0, 5).join(', ')}\n`;
  }

  return text.trim();
}