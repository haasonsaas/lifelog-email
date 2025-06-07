import { test, expect, mock } from "bun:test";
import { 
  extractDecisions, 
  formatDecisionsAsHtml, 
  formatDecisionsAsText,
  type Decision,
  type DecisionsExtractorResult 
} from '../../src/extractors/core/decisions';
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

// Sample lifelog data with clear decisions
const sampleLifelogsWithDecisions: Lifelog[] = [
  {
    id: "strategy-meeting-1",
    title: "Strategy Planning Meeting",
    startTime: "2024-03-20T09:00:00Z",
    endTime: "2024-03-20T10:30:00Z",
    markdown: "",
    contents: [
      {
        type: "heading2",
        content: "Product Strategy Discussion",
        startTime: "2024-03-20T09:00:00Z",
        endTime: "2024-03-20T09:45:00Z",
        children: [
          {
            type: "blockquote",
            content: "After reviewing the market analysis, we've decided to pivot our product strategy towards enterprise customers",
            speakerName: "CEO",
            speakerIdentifier: null,
            startTime: "2024-03-20T09:15:00Z"
          },
          {
            type: "blockquote",
            content: "I agree with that decision. The enterprise market shows much better unit economics",
            speakerName: "user",
            speakerIdentifier: "user",
            startTime: "2024-03-20T09:16:00Z"
          },
          {
            type: "blockquote",
            content: "We'll need to completely redesign our onboarding flow for this pivot",
            speakerName: "Product Manager",
            speakerIdentifier: null,
            startTime: "2024-03-20T09:20:00Z"
          }
        ]
      },
      {
        type: "heading2",
        content: "Technology Stack Decision",
        startTime: "2024-03-20T09:45:00Z",
        endTime: "2024-03-20T10:15:00Z",
        children: [
          {
            type: "blockquote",
            content: "After evaluating React and Vue, we've chosen React for the frontend rewrite",
            speakerName: "Tech Lead",
            speakerIdentifier: null,
            startTime: "2024-03-20T09:50:00Z"
          },
          {
            type: "blockquote",
            content: "The team has more React experience and the ecosystem is more mature",
            speakerName: "user",
            speakerIdentifier: "user",
            startTime: "2024-03-20T09:52:00Z"
          }
        ]
      }
    ]
  },
  {
    id: "project-standup-1",
    title: "Daily Standup",
    startTime: "2024-03-20T14:00:00Z",
    endTime: "2024-03-20T14:15:00Z",
    markdown: "",
    contents: [
      {
        type: "heading2",
        content: "Sprint Planning Updates",
        startTime: "2024-03-20T14:00:00Z",
        endTime: "2024-03-20T14:15:00Z",
        children: [
          {
            type: "blockquote",
            content: "I've decided to extend the sprint by one week to accommodate the new requirements",
            speakerName: "user",
            speakerIdentifier: "user",
            startTime: "2024-03-20T14:05:00Z"
          },
          {
            type: "blockquote",
            content: "That makes sense given the scope creep we've seen",
            speakerName: "Developer",
            speakerIdentifier: null,
            startTime: "2024-03-20T14:06:00Z"
          }
        ]
      }
    ]
  }
];

// Sample lifelog data with no clear decisions (just discussions)
const sampleLifelogsWithoutDecisions: Lifelog[] = [
  {
    id: "discussion-1",
    title: "Team Discussion",
    startTime: "2024-03-20T11:00:00Z",
    endTime: "2024-03-20T11:30:00Z",
    markdown: "",
    contents: [
      {
        type: "heading2",
        content: "Brainstorming Session",
        startTime: "2024-03-20T11:00:00Z",
        endTime: "2024-03-20T11:30:00Z",
        children: [
          {
            type: "blockquote",
            content: "We should consider using microservices architecture",
            speakerName: "user",
            speakerIdentifier: "user",
            startTime: "2024-03-20T11:05:00Z"
          },
          {
            type: "blockquote",
            content: "That's an interesting idea, but what about the complexity?",
            speakerName: "Developer",
            speakerIdentifier: null,
            startTime: "2024-03-20T11:10:00Z"
          },
          {
            type: "blockquote",
            content: "Let's think about this more and discuss it next week",
            speakerName: "user",
            speakerIdentifier: "user",
            startTime: "2024-03-20T11:15:00Z"
          }
        ]
      }
    ]
  }
];

test('extractDecisions should handle empty lifelog array', async () => {
  mock.module('openai', () => createMockOpenAI('{"decisions": []}'));
  
  const result = await extractDecisions([], mockEnv);
  
  expect(result.decisions).toHaveLength(0);
  expect(result.summary.totalDecisions).toBe(0);
  expect(result.metadata.processedConversations).toBe(0);
});

test('extractDecisions should identify strategic and project decisions', async () => {
  const mockResponse = JSON.stringify({
    decisions: [
      {
        decision: "Pivot product strategy towards enterprise customers",
        context: "Market analysis showed better unit economics in enterprise segment",
        participants: ["CEO", "user", "Product Manager"],
        scope: "strategic",
        timestamp: "2024-03-20T09:15:00Z",
        source: "Strategy Planning Meeting",
        confidence: "high"
      },
      {
        decision: "Choose React for frontend rewrite",
        context: "Team has more React experience and mature ecosystem",
        participants: ["Tech Lead", "user"],
        scope: "project",
        timestamp: "2024-03-20T09:50:00Z",
        source: "Strategy Planning Meeting",
        confidence: "high"
      },
      {
        decision: "Extend sprint by one week",
        context: "Accommodate new requirements and scope creep",
        participants: ["user"],
        scope: "local",
        timestamp: "2024-03-20T14:05:00Z",
        source: "Daily Standup",
        confidence: "high"
      }
    ]
  });

  mock.module('openai', () => createMockOpenAI(mockResponse));
  
  const result = await extractDecisions(sampleLifelogsWithDecisions, mockEnv);
  
  expect(result.decisions).toHaveLength(3);
  expect(result.summary.totalDecisions).toBe(3);
  expect(result.summary.strategicDecisions).toBe(1);
  expect(result.summary.projectDecisions).toBe(1);
  expect(result.summary.localDecisions).toBe(1);
  expect(result.metadata.processedConversations).toBe(2);
  
  // Check specific decision details
  const strategicDecision = result.decisions.find(d => d.scope === "strategic");
  expect(strategicDecision?.decision).toContain("enterprise customers");
  expect(strategicDecision?.participants).toContain("CEO");
  expect(strategicDecision?.confidence).toBe("high");
});

test('extractDecisions should handle conversations with no decisions', async () => {
  const mockResponse = JSON.stringify({
    decisions: []
  });

  mock.module('openai', () => createMockOpenAI(mockResponse));
  
  const result = await extractDecisions(sampleLifelogsWithoutDecisions, mockEnv);
  
  expect(result.decisions).toHaveLength(0);
  expect(result.summary.totalDecisions).toBe(0);
  expect(result.metadata.processedConversations).toBe(1);
});

test('extractDecisions should handle malformed OpenAI response gracefully', async () => {
  mock.module('openai', () => createMockOpenAI('invalid json response'));
  
  const result = await extractDecisions(sampleLifelogsWithDecisions, mockEnv);
  
  // Should return empty result instead of throwing
  expect(result.decisions).toHaveLength(0);
  expect(result.summary.totalDecisions).toBe(0);
  expect(result.metadata.processedConversations).toBe(2);
});

test('extractDecisions should validate and sanitize decision data', async () => {
  const mockResponse = JSON.stringify({
    decisions: [
      {
        decision: "Valid decision",
        context: "Good context",
        participants: ["person1", "person2"],
        scope: "invalid_scope", // Should default to "local"
        timestamp: "2024-03-20T09:15:00Z",
        source: "Test Meeting",
        confidence: "invalid_confidence" // Should default to "medium"
      },
      {
        decision: "", // Empty decision should be filtered out
        context: "Some context",
        participants: "not_an_array", // Should default to empty array
        scope: "project",
        timestamp: "2024-03-20T09:15:00Z",
        source: "Test Meeting",
        confidence: "high"
      },
      {
        decision: "Another valid decision",
        // Missing fields should get defaults
        scope: "strategic",
        confidence: "low"
      }
    ]
  });

  mock.module('openai', () => createMockOpenAI(mockResponse));
  
  const result = await extractDecisions(sampleLifelogsWithDecisions, mockEnv);
  
  expect(result.decisions).toHaveLength(2); // Empty decision filtered out
  
  const firstDecision = result.decisions[0];
  expect(firstDecision.scope).toBe("local"); // Invalid scope corrected
  expect(firstDecision.confidence).toBe("medium"); // Invalid confidence corrected
  expect(firstDecision.participants).toEqual(["person1", "person2"]);
  
  const secondDecision = result.decisions[1];
  expect(secondDecision.context).toBe(""); // Missing context defaulted
  expect(secondDecision.participants).toEqual([]); // Missing participants defaulted
  expect(secondDecision.source).toBe("Unknown"); // Missing source defaulted
});

test('extractDecisions should handle OpenAI API errors gracefully', async () => {
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
  
  const result = await extractDecisions(sampleLifelogsWithDecisions, mockEnv);
  
  // Should return empty result instead of throwing
  expect(result.decisions).toHaveLength(0);
  expect(result.summary.totalDecisions).toBe(0);
  expect(result.metadata.processedConversations).toBe(2);
});

test('formatDecisionsAsHtml should create proper HTML structure', () => {
  const mockResult: DecisionsExtractorResult = {
    decisions: [
      {
        decision: "Strategic decision example",
        context: "Important strategic context",
        participants: ["CEO", "CTO"],
        scope: "strategic",
        timestamp: "2024-03-20T09:15:00Z",
        source: "Board Meeting",
        confidence: "high"
      },
      {
        decision: "Project decision example",
        context: "Project context",
        participants: ["PM", "Dev"],
        scope: "project",
        timestamp: "2024-03-20T09:20:00Z",
        source: "Planning Meeting",
        confidence: "medium"
      }
    ],
    summary: {
      totalDecisions: 2,
      strategicDecisions: 1,
      projectDecisions: 1,
      localDecisions: 0
    },
    metadata: {
      processedConversations: 1,
      totalContentLength: 100,
      extractionTimestamp: "2024-03-20T10:00:00Z"
    }
  };

  const html = formatDecisionsAsHtml(mockResult);
  
  expect(html).toContain('<h3>Key Decisions (2)</h3>');
  expect(html).toContain('<h4>Strategic Decisions</h4>');
  expect(html).toContain('<h4>Project Decisions</h4>');
  expect(html).toContain('Strategic decision example');
  expect(html).toContain('Important strategic context');
  expect(html).toContain('CEO, CTO');
  expect(html).toContain('Board Meeting');
});

test('formatDecisionsAsHtml should handle empty decisions', () => {
  const mockResult: DecisionsExtractorResult = {
    decisions: [],
    summary: {
      totalDecisions: 0,
      strategicDecisions: 0,
      projectDecisions: 0,
      localDecisions: 0
    },
    metadata: {
      processedConversations: 1,
      totalContentLength: 100,
      extractionTimestamp: "2024-03-20T10:00:00Z"
    }
  };

  const html = formatDecisionsAsHtml(mockResult);
  
  expect(html).toContain('<h3>Key Decisions</h3>');
  expect(html).toContain('<em>No significant decisions identified');
  expect(html).not.toContain('<h4>');
});

test('formatDecisionsAsText should create proper text structure', () => {
  const mockResult: DecisionsExtractorResult = {
    decisions: [
      {
        decision: "Strategic decision example",
        context: "Important strategic context",
        participants: ["CEO", "CTO"],
        scope: "strategic",
        timestamp: "2024-03-20T09:15:00Z",
        source: "Board Meeting",
        confidence: "high"
      },
      {
        decision: "Local decision example",
        context: "",
        participants: [],
        scope: "local",
        timestamp: "2024-03-20T09:20:00Z",
        source: "Daily Standup",
        confidence: "medium"
      }
    ],
    summary: {
      totalDecisions: 2,
      strategicDecisions: 1,
      projectDecisions: 0,
      localDecisions: 1
    },
    metadata: {
      processedConversations: 1,
      totalContentLength: 100,
      extractionTimestamp: "2024-03-20T10:00:00Z"
    }
  };

  const text = formatDecisionsAsText(mockResult);
  
  expect(text).toContain('Key Decisions (2)');
  expect(text).toContain('Strategic Decisions:');
  expect(text).toContain('Local Decisions:');
  expect(text).toContain('• Strategic decision example');
  expect(text).toContain('Context: Important strategic context');
  expect(text).toContain('Participants: CEO, CTO');
  expect(text).toContain('Source: Board Meeting');
  expect(text).not.toContain('Project Decisions:'); // No project decisions
});

test('formatDecisionsAsText should handle empty decisions', () => {
  const mockResult: DecisionsExtractorResult = {
    decisions: [],
    summary: {
      totalDecisions: 0,
      strategicDecisions: 0,
      projectDecisions: 0,
      localDecisions: 0
    },
    metadata: {
      processedConversations: 1,
      totalContentLength: 100,
      extractionTimestamp: "2024-03-20T10:00:00Z"
    }
  };

  const text = formatDecisionsAsText(mockResult);
  
  expect(text).toContain('Key Decisions');
  expect(text).toContain('No significant decisions identified');
});

test('extractDecisions should handle conversations with complex nested content', async () => {
  const complexLifelog: Lifelog[] = [
    {
      id: "complex-meeting-1",
      title: "Complex Strategic Session",
      startTime: "2024-03-20T09:00:00Z",
      endTime: "2024-03-20T11:00:00Z",
      markdown: "",
      contents: [
        {
          type: "heading1",
          content: "Main Session",
          children: [
            {
              type: "heading2",
              content: "First Topic",
              children: [
                {
                  type: "blockquote",
                  content: "We've thoroughly evaluated all options and decided to acquire CompanyX",
                  speakerName: "CEO",
                  speakerIdentifier: null,
                  startTime: "2024-03-20T09:30:00Z"
                },
                {
                  type: "heading2",
                  content: "Nested Discussion",
                  children: [
                    {
                      type: "blockquote",
                      content: "The acquisition will cost $50M but gives us their customer base",
                      speakerName: "CFO",
                      speakerIdentifier: null,
                      startTime: "2024-03-20T09:35:00Z"
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
    decisions: [
      {
        decision: "Acquire CompanyX for $50M",
        context: "Gives access to their customer base after thorough evaluation",
        participants: ["CEO", "CFO"],
        scope: "strategic",
        timestamp: "2024-03-20T09:30:00Z",
        source: "Complex Strategic Session",
        confidence: "high"
      }
    ]
  });

  mock.module('openai', () => createMockOpenAI(mockResponse));
  
  const result = await extractDecisions(complexLifelog, mockEnv);
  
  expect(result.decisions).toHaveLength(1);
  expect(result.decisions[0].decision).toContain("Acquire CompanyX");
  expect(result.decisions[0].scope).toBe("strategic");
  expect(result.summary.strategicDecisions).toBe(1);
});