import { test, expect, mock } from "bun:test";
import { 
  extractTopics, 
  formatTopicsAsHtml, 
  formatTopicsAsText,
  type Topic,
  type TopicTransition,
  type TopicsExtractorResult 
} from '../../src/extractors/core/topics';
import type { Lifelog, Env } from '../../src/types';
import type { KVNamespace } from "@cloudflare/workers-types";

// Mock the OpenAI module with various response scenarios
const createMockOpenAI = (responseContent: string) => ({
  default: class {
    constructor() {
      return {
        chat: {
          completions: {
            create: async () => ({
              choices: [{
                message: {
                  content: responseContent
                }
              }]
            })
          }
        }
      };
    }
  }
});

const mockEnv: Env = {
  OPENAI_API_KEY: 'test-key',
  TIMEZONE: 'America/Los_Angeles',
  TOKEN_KV: {
    get: async (key: string) => null,
    put: async () => {},
    delete: async () => {},
    list: async () => ({ keys: [], list_complete: true, cursor: "", cacheStatus: null }),
    getWithMetadata: async () => ({ value: null, metadata: null })
  } as unknown as KVNamespace,
  LIMITLESS_API_KEY: 'test-key',
  FROM_EMAIL: 'test@example.com',
  TO_EMAIL: 'test@example.com',
  RESEND_API_KEY: 'test-key'
};

// Sample lifelog data with diverse conversation topics
const sampleLifelogsWithTopics: Lifelog[] = [
  {
    id: "product-strategy-meeting",
    title: "Product Strategy Meeting",
    startTime: "2024-03-20T09:00:00Z",
    endTime: "2024-03-20T11:00:00Z",
    markdown: "",
    contents: [
      {
        type: "heading2",
        content: "Market Analysis Discussion",
        startTime: "2024-03-20T09:00:00Z",
        endTime: "2024-03-20T09:30:00Z",
        children: [
          {
            type: "blockquote",
            content: "Our user research shows that enterprise customers are struggling with data integration",
            speakerName: "Product Manager",
            speakerIdentifier: null,
            startTime: "2024-03-20T09:05:00Z"
          },
          {
            type: "blockquote",
            content: "I've been tracking competitor analysis and they're all moving toward API-first approaches",
            speakerName: "user",
            speakerIdentifier: "user",
            startTime: "2024-03-20T09:10:00Z"
          },
          {
            type: "blockquote",
            content: "The revenue potential in the enterprise segment is 3x our current SMB focus",
            speakerName: "Sales Director",
            speakerIdentifier: null,
            startTime: "2024-03-20T09:15:00Z"
          }
        ]
      },
      {
        type: "heading2",
        content: "Technical Architecture Planning",
        startTime: "2024-03-20T09:30:00Z",
        endTime: "2024-03-20T10:15:00Z",
        children: [
          {
            type: "blockquote",
            content: "We need to redesign our core API to handle enterprise-scale data volumes",
            speakerName: "Tech Lead",
            speakerIdentifier: null,
            startTime: "2024-03-20T09:35:00Z"
          },
          {
            type: "blockquote",
            content: "Microservices architecture would give us the scalability we need",
            speakerName: "user",
            speakerIdentifier: "user",
            startTime: "2024-03-20T09:45:00Z"
          },
          {
            type: "blockquote",
            content: "We should also consider implementing GraphQL for better data fetching",
            speakerName: "Frontend Dev",
            speakerIdentifier: null,
            startTime: "2024-03-20T09:55:00Z"
          }
        ]
      },
      {
        type: "heading2",
        content: "Timeline and Resource Planning",
        startTime: "2024-03-20T10:15:00Z",
        endTime: "2024-03-20T10:45:00Z",
        children: [
          {
            type: "blockquote",
            content: "This pivot will require at least 6 months of development time",
            speakerName: "Product Manager",
            speakerIdentifier: null,
            startTime: "2024-03-20T10:20:00Z"
          },
          {
            type: "blockquote",
            content: "We'll need to hire 2 more backend engineers and 1 DevOps specialist",
            speakerName: "Engineering Manager",
            speakerIdentifier: null,
            startTime: "2024-03-20T10:30:00Z"
          }
        ]
      }
    ]
  },
  {
    id: "team-social-hour",
    title: "Team Social Hour",
    startTime: "2024-03-20T17:00:00Z",
    endTime: "2024-03-20T18:00:00Z",
    markdown: "",
    contents: [
      {
        type: "heading2",
        content: "Casual Team Discussion",
        startTime: "2024-03-20T17:00:00Z",
        endTime: "2024-03-20T18:00:00Z",
        children: [
          {
            type: "blockquote",
            content: "How's everyone doing with the new remote work setup?",
            speakerName: "user",
            speakerIdentifier: "user",
            startTime: "2024-03-20T17:05:00Z"
          },
          {
            type: "blockquote",
            content: "I've been learning React in my spare time - it's really growing on me",
            speakerName: "Junior Dev",
            speakerIdentifier: null,
            startTime: "2024-03-20T17:15:00Z"
          },
          {
            type: "blockquote",
            content: "We should organize a team hiking trip once the weather gets better",
            speakerName: "Designer",
            speakerIdentifier: null,
            startTime: "2024-03-20T17:30:00Z"
          },
          {
            type: "blockquote",
            content: "I've been working on a side project using machine learning for music recommendation",
            speakerName: "user",
            speakerIdentifier: "user",
            startTime: "2024-03-20T17:45:00Z"
          }
        ]
      }
    ]
  }
];

// Sample lifelog data with no clear topics (just brief exchanges)
const sampleLifelogsWithoutClearTopics: Lifelog[] = [
  {
    id: "brief-checkin",
    title: "Brief Check-in",
    startTime: "2024-03-20T14:00:00Z",
    endTime: "2024-03-20T14:05:00Z",
    markdown: "",
    contents: [
      {
        type: "heading2",
        content: "Quick Status Update",
        startTime: "2024-03-20T14:00:00Z",
        endTime: "2024-03-20T14:05:00Z",
        children: [
          {
            type: "blockquote",
            content: "Hey, just checking in. How's it going?",
            speakerName: "user",
            speakerIdentifier: "user",
            startTime: "2024-03-20T14:01:00Z"
          },
          {
            type: "blockquote",
            content: "Good, thanks! Busy day but making progress.",
            speakerName: "Colleague",
            speakerIdentifier: null,
            startTime: "2024-03-20T14:02:00Z"
          },
          {
            type: "blockquote",
            content: "Great, let's catch up more later",
            speakerName: "user",
            speakerIdentifier: "user",
            startTime: "2024-03-20T14:03:00Z"
          }
        ]
      }
    ]
  }
];

test('extractTopics should handle empty lifelog array', async () => {
  mock.module('openai', () => createMockOpenAI('{"topics": [], "transitions": []}'));
  
  const result = await extractTopics([], mockEnv);
  
  expect(result.topics).toHaveLength(0);
  expect(result.transitions).toHaveLength(0);
  expect(result.summary.totalTopics).toBe(0);
  expect(result.summary.totalDiscussionTime).toBe(0);
  expect(result.metadata.processedConversations).toBe(0);
});

test('extractTopics should identify diverse topics with time tracking', async () => {
  const mockResponse = JSON.stringify({
    topics: [
      {
        topic: "Market Analysis and Enterprise Strategy",
        description: "Discussion about user research findings, competitive analysis, and revenue potential in enterprise segment",
        durationMinutes: 25,
        startTime: "2024-03-20T09:05:00Z",
        endTime: "2024-03-20T09:30:00Z",
        importance: 5,
        engagement: "high",
        participants: ["Product Manager", "user", "Sales Director"],
        keywords: ["enterprise", "market research", "revenue", "competitive analysis"],
        source: "Product Strategy Meeting",
        relatedTopics: ["API Strategy", "Product Roadmap"],
        category: "strategic",
        isRecurring: false,
        confidence: "high"
      },
      {
        topic: "Technical Architecture Redesign",
        description: "Planning API redesign for enterprise scalability, microservices architecture, and GraphQL implementation",
        durationMinutes: 40,
        startTime: "2024-03-20T09:35:00Z",
        endTime: "2024-03-20T10:15:00Z",
        importance: 4,
        engagement: "high",
        participants: ["Tech Lead", "user", "Frontend Dev"],
        keywords: ["API", "microservices", "GraphQL", "scalability"],
        source: "Product Strategy Meeting",
        relatedTopics: ["Market Analysis", "Resource Planning"],
        category: "technical",
        isRecurring: false,
        confidence: "high"
      },
      {
        topic: "Project Timeline and Hiring",
        description: "Resource planning for development timeline and hiring needs for the pivot",
        durationMinutes: 25,
        startTime: "2024-03-20T10:20:00Z",
        endTime: "2024-03-20T10:45:00Z",
        importance: 4,
        engagement: "medium",
        participants: ["Product Manager", "Engineering Manager"],
        keywords: ["hiring", "timeline", "resources", "backend engineers"],
        source: "Product Strategy Meeting",
        relatedTopics: ["Technical Architecture"],
        category: "planning",
        isRecurring: false,
        confidence: "high"
      },
      {
        topic: "Remote Work and Team Wellbeing",
        description: "Casual discussion about remote work adaptation and team experiences",
        durationMinutes: 15,
        startTime: "2024-03-20T17:05:00Z",
        endTime: "2024-03-20T17:20:00Z",
        importance: 2,
        engagement: "medium",
        participants: ["user", "Junior Dev", "Designer"],
        keywords: ["remote work", "team", "wellbeing"],
        source: "Team Social Hour",
        relatedTopics: ["Team Building"],
        category: "social",
        isRecurring: true,
        confidence: "medium"
      },
      {
        topic: "Learning and Development",
        description: "Discussion about React learning and skill development initiatives",
        durationMinutes: 10,
        startTime: "2024-03-20T17:15:00Z",
        endTime: "2024-03-20T17:25:00Z",
        importance: 2,
        engagement: "medium",
        participants: ["Junior Dev"],
        keywords: ["React", "learning", "skill development"],
        source: "Team Social Hour",
        relatedTopics: [],
        category: "learning",
        isRecurring: false,
        confidence: "medium"
      },
      {
        topic: "Side Projects and Innovation",
        description: "Personal projects including machine learning for music recommendation",
        durationMinutes: 10,
        startTime: "2024-03-20T17:45:00Z",
        endTime: "2024-03-20T17:55:00Z",
        importance: 2,
        engagement: "low",
        participants: ["user"],
        keywords: ["machine learning", "music", "side project"],
        source: "Team Social Hour",
        relatedTopics: [],
        category: "creative",
        isRecurring: false,
        confidence: "medium"
      }
    ],
    transitions: [
      {
        fromTopic: "Market Analysis and Enterprise Strategy",
        toTopic: "Technical Architecture Redesign",
        transitionTime: "2024-03-20T09:30:00Z",
        transitionType: "natural",
        source: "Product Strategy Meeting"
      },
      {
        fromTopic: "Technical Architecture Redesign",
        toTopic: "Project Timeline and Hiring",
        transitionTime: "2024-03-20T10:15:00Z",
        transitionType: "natural",
        source: "Product Strategy Meeting"
      }
    ]
  });

  mock.module('openai', () => createMockOpenAI(mockResponse));
  
  const result = await extractTopics(sampleLifelogsWithTopics, mockEnv);
  
  expect(result.topics).toHaveLength(6);
  expect(result.transitions).toHaveLength(2);
  expect(result.summary.totalTopics).toBe(6);
  expect(result.summary.totalDiscussionTime).toBe(125); // Sum of all durations
  expect(result.summary.averageTopicDuration).toBe(21); // 125/6 rounded
  expect(result.metadata.processedConversations).toBe(2);
  
  // Check strategic topics
  const strategicTopics = result.topics.filter(t => t.category === "strategic");
  expect(strategicTopics).toHaveLength(1);
  expect(strategicTopics[0].topic).toContain("Market Analysis");
  expect(strategicTopics[0].importance).toBe(5);
  
  // Check time analysis
  expect(result.timeAnalysis.timeByCategory.strategic).toBe(25);
  expect(result.timeAnalysis.timeByCategory.technical).toBe(40);
  expect(result.timeAnalysis.timeByCategory.planning).toBe(25);
  expect(result.timeAnalysis.timeByCategory.social).toBe(15);
  
  // Check summary insights
  expect(result.summary.mostImportantTopic).toBe("Market Analysis and Enterprise Strategy");
  expect(result.summary.longestTopic).toBe("Technical Architecture Redesign");
  expect(result.summary.recurringTopics).toBe(1); // Remote work topic
  expect(result.summary.uniqueTopics).toBe(5); // Non-recurring topics
});

test('extractTopics should handle conversations with no clear topics', async () => {
  const mockResponse = JSON.stringify({
    topics: [],
    transitions: []
  });

  mock.module('openai', () => createMockOpenAI(mockResponse));
  
  const result = await extractTopics(sampleLifelogsWithoutClearTopics, mockEnv);
  
  expect(result.topics).toHaveLength(0);
  expect(result.transitions).toHaveLength(0);
  expect(result.summary.totalTopics).toBe(0);
  expect(result.summary.totalDiscussionTime).toBe(0);
  expect(result.metadata.processedConversations).toBe(1);
});

test('extractTopics should handle malformed OpenAI response gracefully', async () => {
  mock.module('openai', () => createMockOpenAI('invalid json response'));
  
  const result = await extractTopics(sampleLifelogsWithTopics, mockEnv);
  
  // Should return empty result instead of throwing
  expect(result.topics).toHaveLength(0);
  expect(result.transitions).toHaveLength(0);
  expect(result.summary.totalTopics).toBe(0);
  expect(result.metadata.processedConversations).toBe(2);
});

test('extractTopics should validate and sanitize topic data', async () => {
  const mockResponse = JSON.stringify({
    topics: [
      {
        topic: "Valid Topic",
        description: "Good description",
        durationMinutes: 15,
        startTime: "2024-03-20T09:15:00Z",
        endTime: "2024-03-20T09:30:00Z",
        importance: 6, // Should be capped at 5
        engagement: "invalid_engagement", // Should default to "medium"
        participants: ["person1", "person2"],
        keywords: "not_an_array", // Should default to empty array
        source: "Test Meeting",
        relatedTopics: ["related1"],
        category: "invalid_category", // Should default to "other"
        isRecurring: "not_boolean", // Should convert to boolean
        confidence: "high"
      },
      {
        topic: "", // Empty topic should be filtered out
        description: "Some description",
        durationMinutes: 300, // Should be capped at 180
        importance: 3,
        engagement: "low",
        participants: [],
        keywords: [],
        source: "Test Meeting",
        category: "work",
        isRecurring: false,
        confidence: "medium"
      },
      {
        topic: "Another valid topic",
        // Missing fields should get defaults
        importance: 0, // Should default to 3
        category: "technical",
        confidence: "invalid_confidence" // Should default to "medium"
      }
    ],
    transitions: [
      {
        fromTopic: "Topic A",
        toTopic: "Topic B",
        transitionTime: "2024-03-20T09:15:00Z",
        transitionType: "natural",
        source: "Test Meeting"
      },
      {
        fromTopic: "", // Should be filtered out
        toTopic: "Topic C",
        transitionType: "invalid_type" // Should default to "natural"
      }
    ]
  });

  mock.module('openai', () => createMockOpenAI(mockResponse));
  
  const result = await extractTopics(sampleLifelogsWithTopics, mockEnv);
  
  expect(result.topics).toHaveLength(2); // Empty topic filtered out
  
  const firstTopic = result.topics[0];
  expect(firstTopic.importance).toBe(3); // Invalid importance defaulted
  expect(firstTopic.engagement).toBe("medium"); // Invalid engagement corrected
  expect(firstTopic.keywords).toEqual([]); // Invalid keywords corrected
  expect(firstTopic.category).toBe("other"); // Invalid category corrected
  expect(firstTopic.durationMinutes).toBe(15); // Within valid range
  
  const secondTopic = result.topics[1];
  expect(secondTopic.importance).toBe(3); // Invalid importance defaulted
  expect(secondTopic.confidence).toBe("medium"); // Invalid confidence corrected
  expect(secondTopic.description).toBe(""); // Missing description defaulted
  
  expect(result.transitions).toHaveLength(1); // Invalid transition filtered out
  expect(result.transitions[0].transitionType).toBe("natural");
});

test('extractTopics should handle OpenAI API errors gracefully', async () => {
  mock.module('openai', () => ({
    default: class {
      constructor() {
        return {
          chat: {
            completions: {
              create: async () => {
                throw new Error("API Error");
              }
            }
          }
        };
      }
    }
  }));
  
  const result = await extractTopics(sampleLifelogsWithTopics, mockEnv);
  
  // Should return empty result instead of throwing
  expect(result.topics).toHaveLength(0);
  expect(result.transitions).toHaveLength(0);
  expect(result.summary.totalTopics).toBe(0);
  expect(result.metadata.processedConversations).toBe(2);
  expect(result.metadata.averageConfidence).toBe("medium");
});

test('formatTopicsAsHtml should create proper HTML structure', () => {
  const mockResult: TopicsExtractorResult = {
    topics: [
      {
        topic: "Strategic Planning Session",
        description: "Long-term product roadmap and market positioning",
        durationMinutes: 45,
        startTime: "2024-03-20T09:00:00Z",
        endTime: "2024-03-20T09:45:00Z",
        importance: 5,
        engagement: "high",
        participants: ["CEO", "CTO", "Product Lead"],
        keywords: ["strategy", "roadmap", "market"],
        source: "Executive Meeting",
        relatedTopics: ["Product Development"],
        category: "strategic",
        isRecurring: false,
        confidence: "high"
      },
      {
        topic: "Code Review Process",
        description: "Improving our development workflow and quality standards",
        durationMinutes: 20,
        startTime: "2024-03-20T10:00:00Z",
        endTime: "2024-03-20T10:20:00Z",
        importance: 3,
        engagement: "medium",
        participants: ["Tech Lead", "Developers"],
        keywords: ["code review", "workflow", "quality"],
        source: "Dev Team Meeting",
        relatedTopics: [],
        category: "technical",
        isRecurring: true,
        confidence: "high"
      },
      {
        topic: "Lunch Plans",
        description: "Casual discussion about team lunch options",
        durationMinutes: 5,
        startTime: "2024-03-20T12:00:00Z",
        endTime: "2024-03-20T12:05:00Z",
        importance: 1,
        engagement: "low",
        participants: ["Team"],
        keywords: ["lunch", "social"],
        source: "Casual Chat",
        relatedTopics: [],
        category: "social",
        isRecurring: false,
        confidence: "medium"
      }
    ],
    transitions: [],
    summary: {
      totalTopics: 3,
      totalDiscussionTime: 70,
      averageTopicDuration: 23,
      mostImportantTopic: "Strategic Planning Session",
      longestTopic: "Strategic Planning Session",
      mostEngagingTopic: "Strategic Planning Session",
      topicsByCategory: { strategic: 1, technical: 1, social: 1 },
      recurringTopics: 1,
      uniqueTopics: 2,
    },
    timeAnalysis: {
      timeByCategory: { strategic: 45, technical: 20, social: 5 },
      timeByImportance: { 5: 45, 3: 20, 1: 5 },
      peakDiscussionHours: ["9:00", "10:00"],
      longRunningTopics: ["Strategic Planning Session"],
      highImpactBriefTopics: [],
    },
    trends: {
      frequentTopics: ["Code Review Process"],
      growingTopics: [],
      newTopics: ["Strategic Planning Session", "Lunch Plans"],
      hotTopics: ["Strategic Planning Session"],
    },
    metadata: {
      processedConversations: 2,
      totalContentLength: 500,
      extractionTimestamp: "2024-03-20T12:00:00Z",
      averageConfidence: "high",
    },
  };

  const html = formatTopicsAsHtml(mockResult);
  
  expect(html).toContain('<h3>Conversation Topics (3)</h3>');
  expect(html).toContain('70 minutes across 3 topics');
  expect(html).toContain('<strong>Average Topic Duration:</strong> 23 minutes');
  expect(html).toContain('<strong>Most Important:</strong> Strategic Planning Session');
  expect(html).toContain('<strong>Longest Discussion:</strong> Strategic Planning Session');
  expect(html).toContain('<h4>High Impact Topics</h4>');
  expect(html).toContain('<h4>Standard Topics</h4>');
  expect(html).toContain('<h4>Brief Discussions</h4>');
  expect(html).toContain('Strategic Planning Session');
  expect(html).toContain('Long-term product roadmap');
  expect(html).toContain('Category: strategic');
  expect(html).toContain('<h4>Time Allocation</h4>');
  expect(html).toContain('<strong>strategic:</strong> 45 minutes');
});

test('formatTopicsAsHtml should handle empty topics', () => {
  const mockResult: TopicsExtractorResult = {
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
      processedConversations: 1,
      totalContentLength: 100,
      extractionTimestamp: "2024-03-20T12:00:00Z",
      averageConfidence: "high",
    },
  };

  const html = formatTopicsAsHtml(mockResult);
  
  expect(html).toContain('<h3>Conversation Topics</h3>');
  expect(html).toContain('<em>No significant topics identified');
  expect(html).not.toContain('<h4>High Impact Topics</h4>');
  expect(html).not.toContain('<h4>Time Allocation</h4>');
});

test('formatTopicsAsText should create proper text structure', () => {
  const mockResult: TopicsExtractorResult = {
    topics: [
      {
        topic: "Strategic Planning Session",
        description: "Long-term product roadmap and market positioning",
        durationMinutes: 45,
        startTime: "2024-03-20T09:00:00Z",
        endTime: "2024-03-20T09:45:00Z",
        importance: 5,
        engagement: "high",
        participants: ["CEO", "CTO", "Product Lead"],
        keywords: ["strategy", "roadmap", "market"],
        source: "Executive Meeting",
        relatedTopics: ["Product Development"],
        category: "strategic",
        isRecurring: false,
        confidence: "high"
      },
      {
        topic: "Team Building Activity",
        description: "Planning for next quarter team offsite",
        durationMinutes: 15,
        startTime: "2024-03-20T14:00:00Z",
        endTime: "2024-03-20T14:15:00Z",
        importance: 2,
        engagement: "medium",
        participants: ["HR", "Team Leads"],
        keywords: ["team building", "offsite"],
        source: "HR Meeting",
        relatedTopics: [],
        category: "social",
        isRecurring: false,
        confidence: "medium"
      }
    ],
    transitions: [],
    summary: {
      totalTopics: 2,
      totalDiscussionTime: 60,
      averageTopicDuration: 30,
      mostImportantTopic: "Strategic Planning Session",
      longestTopic: "Strategic Planning Session",
      mostEngagingTopic: "Strategic Planning Session",
      topicsByCategory: { strategic: 1, social: 1 },
      recurringTopics: 0,
      uniqueTopics: 2,
    },
    timeAnalysis: {
      timeByCategory: { strategic: 45, social: 15 },
      timeByImportance: { 5: 45, 2: 15 },
      peakDiscussionHours: ["9:00"],
      longRunningTopics: ["Strategic Planning Session"],
      highImpactBriefTopics: [],
    },
    trends: {
      frequentTopics: [],
      growingTopics: [],
      newTopics: ["Strategic Planning Session", "Team Building Activity"],
      hotTopics: ["Strategic Planning Session"],
    },
    metadata: {
      processedConversations: 2,
      totalContentLength: 300,
      extractionTimestamp: "2024-03-20T15:00:00Z",
      averageConfidence: "high",
    },
  };

  const text = formatTopicsAsText(mockResult);
  
  expect(text).toContain('Conversation Topics (2)');
  expect(text).toContain('Overview: 60 minutes across 2 topics');
  expect(text).toContain('Average Topic Duration: 30 minutes');
  expect(text).toContain('Most Important: Strategic Planning Session');
  expect(text).toContain('High Impact Topics:');
  expect(text).toContain('• Strategic Planning Session (45min, Importance: 5/5)');
  expect(text).toContain('Long-term product roadmap');
  expect(text).toContain('Category: strategic | Engagement: high');
  expect(text).toContain('Participants: CEO, CTO, Product Lead');
  expect(text).toContain('Keywords: strategy, roadmap, market');
  expect(text).toContain('Time Allocation:');
  expect(text).toContain('• strategic: 45 minutes (75%)');
  expect(text).toContain('High Engagement Topics: Strategic Planning Session');
  expect(text).toContain('New Topics Today: Strategic Planning Session, Team Building Activity');
});

test('formatTopicsAsText should handle empty topics', () => {
  const mockResult: TopicsExtractorResult = {
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
      processedConversations: 1,
      totalContentLength: 100,
      extractionTimestamp: "2024-03-20T12:00:00Z",
      averageConfidence: "high",
    },
  };

  const text = formatTopicsAsText(mockResult);
  
  expect(text).toContain('Conversation Topics');
  expect(text).toContain('No significant topics identified');
});

test('extractTopics should analyze time patterns and engagement correctly', async () => {
  const mockResponse = JSON.stringify({
    topics: [
      {
        topic: "Morning Strategic Planning",
        description: "High-energy strategic discussion",
        durationMinutes: 60,
        startTime: "2024-03-20T09:00:00Z",
        endTime: "2024-03-20T10:00:00Z",
        importance: 5,
        engagement: "high",
        participants: ["Leadership Team"],
        keywords: ["strategy", "planning"],
        source: "Morning Meeting",
        relatedTopics: [],
        category: "strategic",
        isRecurring: true,
        confidence: "high"
      },
      {
        topic: "Quick Status Update",
        description: "Brief but important project update",
        durationMinutes: 5,
        startTime: "2024-03-20T14:00:00Z",
        endTime: "2024-03-20T14:05:00Z",
        importance: 4,
        engagement: "medium",
        participants: ["Project Team"],
        keywords: ["status", "update"],
        source: "Standup",
        relatedTopics: [],
        category: "work",
        isRecurring: false,
        confidence: "high"
      }
    ],
    transitions: []
  });

  mock.module('openai', () => createMockOpenAI(mockResponse));
  
  const result = await extractTopics(sampleLifelogsWithTopics, mockEnv);
  
  // Check time analysis
  expect(result.timeAnalysis.longRunningTopics).toContain("Morning Strategic Planning");
  expect(result.timeAnalysis.highImpactBriefTopics).toContain("Quick Status Update");
  
  // Check trends analysis
  expect(result.trends.hotTopics).toContain("Morning Strategic Planning");
  expect(result.trends.frequentTopics).toContain("Morning Strategic Planning");
  expect(result.trends.newTopics).toContain("Quick Status Update");
  
  // Check peak discussion hours
  expect(result.timeAnalysis.peakDiscussionHours).toContain("9:00");
  
  // Check summary calculations
  expect(result.summary.totalDiscussionTime).toBe(65);
  expect(result.summary.averageTopicDuration).toBe(33); // 65/2 rounded
  expect(result.summary.mostEngagingTopic).toBe("Morning Strategic Planning");
  expect(result.summary.recurringTopics).toBe(1);
});

test('extractTopics should handle complex nested conversation structure', async () => {
  const complexLifelog: Lifelog[] = [
    {
      id: "complex-meeting",
      title: "Complex Multi-Topic Meeting", 
      startTime: "2024-03-20T09:00:00Z",
      endTime: "2024-03-20T12:00:00Z",
      markdown: "",
      contents: [
        {
          type: "heading1",
          content: "Main Session",
          children: [
            {
              type: "heading2",
              content: "Strategic Discussion",
              children: [
                {
                  type: "blockquote",
                  content: "We need to completely rethink our go-to-market strategy for Q2",
                  speakerName: "CEO",
                  speakerIdentifier: null,
                  startTime: "2024-03-20T09:15:00Z"
                },
                {
                  type: "heading2",
                  content: "Nested Technical Discussion",
                  children: [
                    {
                      type: "blockquote",
                      content: "The new architecture will require significant database changes",
                      speakerName: "CTO",
                      speakerIdentifier: null,
                      startTime: "2024-03-20T10:30:00Z"
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ];

  const mockResponse = JSON.stringify({
    topics: [
      {
        topic: "Go-to-Market Strategy Revision",
        description: "Complete rethinking of Q2 market approach and positioning",
        durationMinutes: 45,
        startTime: "2024-03-20T09:15:00Z",
        endTime: "2024-03-20T10:00:00Z",
        importance: 5,
        engagement: "high",
        participants: ["CEO", "Marketing Team"],
        keywords: ["go-to-market", "strategy", "Q2"],
        source: "Complex Multi-Topic Meeting",
        relatedTopics: ["Technical Architecture"],
        category: "strategic",
        isRecurring: false,
        confidence: "high"
      },
      {
        topic: "Database Architecture Changes",
        description: "Technical discussion about database modifications for new architecture",
        durationMinutes: 30,
        startTime: "2024-03-20T10:30:00Z",
        endTime: "2024-03-20T11:00:00Z",
        importance: 4,
        engagement: "high",
        participants: ["CTO", "Backend Team"],
        keywords: ["database", "architecture", "technical"],
        source: "Complex Multi-Topic Meeting",
        relatedTopics: ["Go-to-Market Strategy"],
        category: "technical",
        isRecurring: false,
        confidence: "high"
      }
    ],
    transitions: [
      {
        fromTopic: "Go-to-Market Strategy Revision",
        toTopic: "Database Architecture Changes",
        transitionTime: "2024-03-20T10:30:00Z",
        transitionType: "natural",
        source: "Complex Multi-Topic Meeting"
      }
    ]
  });

  mock.module('openai', () => createMockOpenAI(mockResponse));
  
  const result = await extractTopics(complexLifelog, mockEnv);
  
  expect(result.topics).toHaveLength(2);
  expect(result.transitions).toHaveLength(1);
  expect(result.topics[0].topic).toContain("Go-to-Market Strategy");
  expect(result.topics[1].topic).toContain("Database Architecture");
  expect(result.transitions[0].fromTopic).toContain("Go-to-Market Strategy");
  expect(result.transitions[0].toTopic).toContain("Database Architecture");
  expect(result.summary.totalDiscussionTime).toBe(75);
});