import { test, expect, mock } from "bun:test";
import { gpt_summary } from './extractors';
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