import { test, expect, mock } from "bun:test";
import { gpt_summary, action_items } from './extractors';
import type { Lifelog, Env } from './types';
import type { KVNamespace } from "@cloudflare/workers-types";

// Mock the OpenAI module
mock.module('openai', () => ({
  default: class {
    constructor() {
      return {
        chat: {
          completions: {
            create: async () => ({
              choices: [{
                message: {
                  content: `Overview: Morning standup and product review meetings were held.

Decisions:
Morning Standup:
- Move launch date to next week

Product Review:
- Implement dark mode feature first

Action Items:
Morning Standup:
- Update documentation by EOD

Product Review:
- Create prototype by tomorrow

New Contacts:
- Sarah (Design Team)

Topics:
Morning Standup:
- Project Updates (15 minutes)

Product Review:
- Feature Discussion (30 minutes)

Summary:
Morning Standup: Discussed project updates and timeline changes.
Product Review: Met with design team to discuss feature implementation.

Key Takeaways:
- Launch timeline adjusted
- Dark mode feature prioritized
- Documentation updates needed`
                }
              }]
            })
          }
        }
      };
    }
  }
}));

test('gpt_summary should process multiple conversations and maintain structure', async () => {
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

  const sampleLifelogs: Lifelog[] = [
    {
      id: "standup-1",
      title: "Morning Standup",
      startTime: "2024-03-20T09:00:00Z",
      endTime: "2024-03-20T09:30:00Z",
      markdown: "",
      contents: [
        {
          type: "heading2",
          content: "Project Updates",
          startTime: "2024-03-20T09:00:00Z",
          endTime: "2024-03-20T09:15:00Z",
          children: [
            {
              type: "blockquote",
              content: "I'll make sure to update the documentation by EOD",
              speakerName: "user",
              speakerIdentifier: "user",
              startTime: "2024-03-20T09:05:00Z"
            },
            {
              type: "blockquote",
              content: "We decided to move the launch date to next week",
              speakerName: "user",
              speakerIdentifier: "user",
              startTime: "2024-03-20T09:10:00Z"
            }
          ]
        }
      ]
    },
    {
      id: "review-1",
      title: "Product Review",
      startTime: "2024-03-20T14:00:00Z",
      endTime: "2024-03-20T15:00:00Z",
      markdown: "",
      contents: [
        {
          type: "heading2",
          content: "Feature Discussion",
          startTime: "2024-03-20T14:00:00Z",
          endTime: "2024-03-20T14:30:00Z",
          children: [
            {
              type: "blockquote",
              content: "I met with Sarah from the design team today",
              speakerName: "user",
              speakerIdentifier: "user",
              startTime: "2024-03-20T14:05:00Z"
            },
            {
              type: "blockquote",
              content: "We chose to implement the dark mode feature first",
              speakerName: "user",
              speakerIdentifier: "user",
              startTime: "2024-03-20T14:15:00Z"
            },
            {
              type: "blockquote",
              content: "I'll create a prototype by tomorrow",
              speakerName: "user",
              speakerIdentifier: "user",
              startTime: "2024-03-20T14:20:00Z"
            }
          ]
        }
      ]
    }
  ];

  const result = await gpt_summary(sampleLifelogs, mockEnv);
  
  // Check that the result contains both HTML and text versions
  expect(result).toHaveProperty('html');
  expect(result).toHaveProperty('text');
  
  // Check that both conversations are referenced
  expect(result.text).toContain('Morning Standup');
  expect(result.text).toContain('Product Review');
  
  // Check that action items are present
  expect(result.text).toContain('Update documentation by EOD');
  expect(result.text).toContain('Create prototype by tomorrow');
  
  // Check that decisions are present
  expect(result.text).toContain('Move launch date to next week');
  expect(result.text).toContain('Implement dark mode feature first');
  
  // Check that new contacts are present
  expect(result.text).toContain('Sarah (Design Team)');
});

test('action_items should extract action items with complete structure', async () => {
  // Mock OpenAI response for action items
  const mockActionItemsResponse = `[
    {
      "task": "Update project documentation",
      "owner": "user",
      "dueDate": "2024-03-21",
      "priority": "high",
      "status": "new",
      "context": "Mentioned during standup discussion"
    },
    {
      "task": "Create dark mode prototype",
      "owner": "user",
      "dueDate": null,
      "priority": "medium",
      "status": "new",
      "context": "Decided during product review meeting"
    }
  ]`;

  // Override the mock for this specific test
  mock.module('openai', () => ({
    default: class {
      constructor() {
        return {
          chat: {
            completions: {
              create: async () => ({
                choices: [{
                  message: {
                    content: mockActionItemsResponse
                  }
                }]
              })
            }
          }
        };
      }
    }
  }));

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

  const sampleLifelogs: Lifelog[] = [
    {
      id: "meeting-1",
      title: "Sprint Planning",
      startTime: "2024-03-20T09:00:00Z",
      endTime: "2024-03-20T10:00:00Z",
      markdown: "",
      contents: [
        {
          type: "heading2",
          content: "Task Assignment",
          startTime: "2024-03-20T09:00:00Z",
          endTime: "2024-03-20T09:30:00Z",
          children: [
            {
              type: "blockquote",
              content: "I'll update the project documentation by tomorrow",
              speakerName: "user",
              speakerIdentifier: "user",
              startTime: "2024-03-20T09:05:00Z"
            },
            {
              type: "blockquote",
              content: "We need to create a dark mode prototype for the next sprint",
              speakerName: "user",
              speakerIdentifier: "user",
              startTime: "2024-03-20T09:15:00Z"
            }
          ]
        }
      ]
    }
  ];

  const result = await action_items(sampleLifelogs, mockEnv);
  
  // Check that the result has the expected structure
  expect(result).toHaveProperty('actionItems');
  expect(result).toHaveProperty('html');
  expect(result).toHaveProperty('text');
  
  // Check action items array
  expect(result.actionItems).toHaveLength(2);
  
  // Check first action item
  const firstItem = result.actionItems[0];
  expect(firstItem).toHaveProperty('id');
  expect(firstItem).toHaveProperty('task');
  expect(firstItem).toHaveProperty('owner');
  expect(firstItem).toHaveProperty('priority');
  expect(firstItem).toHaveProperty('status');
  expect(firstItem).toHaveProperty('timestamp');
  
  expect(firstItem.task).toBe('Update project documentation');
  expect(firstItem.owner).toBe('user');
  expect(firstItem.dueDate).toBe('2024-03-21');
  expect(firstItem.priority).toBe('high');
  expect(firstItem.status).toBe('new');
  
  // Check second action item
  const secondItem = result.actionItems[1];
  expect(secondItem.task).toBe('Create dark mode prototype');
  expect(secondItem.priority).toBe('medium');
  expect(secondItem.dueDate).toBeUndefined();
  
  // Check HTML output contains table
  expect(result.html).toContain('<table');
  expect(result.html).toContain('Action Items (2)');
  expect(result.html).toContain('Update project documentation');
  expect(result.html).toContain('Create dark mode prototype');
  
  // Check text output
  expect(result.text).toContain('Action Items (2)');
  expect(result.text).toContain('Update project documentation (user)');
  expect(result.text).toContain('Priority: HIGH');
});

test('action_items should handle empty response gracefully', async () => {
  // Mock OpenAI response with no action items
  mock.module('openai', () => ({
    default: class {
      constructor() {
        return {
          chat: {
            completions: {
              create: async () => ({
                choices: [{
                  message: {
                    content: '[]'
                  }
                }]
              })
            }
          }
        };
      }
    }
  }));

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

  const sampleLifelogs: Lifelog[] = [
    {
      id: "casual-1",
      title: "Casual Chat",
      startTime: "2024-03-20T09:00:00Z",
      endTime: "2024-03-20T09:30:00Z",
      markdown: "",
      contents: [
        {
          type: "heading2",
          content: "General Discussion",
          startTime: "2024-03-20T09:00:00Z",
          endTime: "2024-03-20T09:30:00Z",
          children: [
            {
              type: "blockquote",
              content: "How was your weekend?",
              speakerName: "user",
              speakerIdentifier: "user",
              startTime: "2024-03-20T09:05:00Z"
            },
            {
              type: "blockquote",
              content: "It was great, thanks for asking!",
              speakerName: "Other",
              speakerIdentifier: null,
              startTime: "2024-03-20T09:10:00Z"
            }
          ]
        }
      ]
    }
  ];

  const result = await action_items(sampleLifelogs, mockEnv);
  
  // Check that no action items were extracted
  expect(result.actionItems).toHaveLength(0);
  
  // Check that appropriate messages are shown
  expect(result.html).toContain('No action items found');
  expect(result.text).toContain('No action items found');
});