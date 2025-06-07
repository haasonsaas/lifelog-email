/**
 * Comprehensive integration tests for the multi-extractor system.
 * Tests the entire workflow from lifelog processing to email generation.
 */

import { test, expect, mock, beforeEach, afterEach } from "bun:test";
import type { Env, Lifelog } from "../../src/types";
import type { KVNamespace } from "@cloudflare/workers-types";
import { 
  ExtractorRegistry, 
  GptSummaryExtractor,
  type ExtractorConfig,
  type ExtractorResult,
  type RegistryExecutionResult,
  AbstractExtractor
} from "../../src/extractors/index";

// Mock data for realistic testing scenarios
const createMockEnv = (): Env => ({
  OPENAI_API_KEY: 'test-openai-key',
  TIMEZONE: 'America/Los_Angeles',
  TOKEN_KV: {
    get: async (key: string) => null,
    put: async () => {},
    delete: async () => {},
    list: async () => ({ keys: [], list_complete: true, cursor: "", cacheStatus: null }),
    getWithMetadata: async () => ({ value: null, metadata: null })
  } as unknown as KVNamespace,
  LIMITLESS_API_KEY: 'test-limitless-key',
  FROM_EMAIL: 'test@example.com',
  TO_EMAIL: 'recipient@example.com',
  RESEND_API_KEY: 'test-resend-key'
});

// Sample lifelog data that exercises different scenarios
const createTestLifelogs = (): Lifelog[] => [
  {
    id: "standup-meeting",
    title: "Daily Standup - Sprint 23",
    startTime: "2024-03-20T09:00:00Z",
    endTime: "2024-03-20T09:30:00Z",
    markdown: "",
    contents: [
      {
        type: "heading2",
        content: "Team Updates",
        startTime: "2024-03-20T09:00:00Z",
        endTime: "2024-03-20T09:15:00Z",
        children: [
          {
            type: "blockquote",
            content: "I completed the user authentication feature yesterday",
            speakerName: "Alice Johnson",
            speakerIdentifier: null,
            startTime: "2024-03-20T09:02:00Z"
          },
          {
            type: "blockquote",
            content: "I'll finish the API documentation by Friday",
            speakerName: "user",
            speakerIdentifier: "user",
            startTime: "2024-03-20T09:05:00Z"
          },
          {
            type: "blockquote",
            content: "We need to prioritize the performance optimization work",
            speakerName: "Bob Smith",
            speakerIdentifier: null,
            startTime: "2024-03-20T09:08:00Z"
          }
        ]
      },
      {
        type: "heading2",
        content: "Blockers and Issues",
        startTime: "2024-03-20T09:15:00Z",
        endTime: "2024-03-20T09:25:00Z",
        children: [
          {
            type: "blockquote",
            content: "The database migration is blocking the deployment",
            speakerName: "user",
            speakerIdentifier: "user",
            startTime: "2024-03-20T09:16:00Z"
          },
          {
            type: "blockquote",
            content: "I'll help with the migration script today",
            speakerName: "Alice Johnson",
            speakerIdentifier: null,
            startTime: "2024-03-20T09:18:00Z"
          }
        ]
      }
    ]
  },
  {
    id: "product-review",
    title: "Product Feature Review",
    startTime: "2024-03-20T14:00:00Z",
    endTime: "2024-03-20T15:30:00Z",
    markdown: "",
    contents: [
      {
        type: "heading2",
        content: "Dark Mode Implementation",
        startTime: "2024-03-20T14:00:00Z",
        endTime: "2024-03-20T14:45:00Z",
        children: [
          {
            type: "blockquote",
            content: "We decided to implement dark mode as a priority feature",
            speakerName: "user",
            speakerIdentifier: "user",
            startTime: "2024-03-20T14:05:00Z"
          },
          {
            type: "blockquote",
            content: "I can create the design mockups by next Tuesday",
            speakerName: "Sarah Williams",
            speakerIdentifier: null,
            startTime: "2024-03-20T14:10:00Z"
          },
          {
            type: "blockquote",
            content: "The implementation should take about 2 weeks",
            speakerName: "user",
            speakerIdentifier: "user",
            startTime: "2024-03-20T14:15:00Z"
          }
        ]
      },
      {
        type: "heading2",
        content: "User Feedback Analysis",
        startTime: "2024-03-20T14:45:00Z",
        endTime: "2024-03-20T15:30:00Z",
        children: [
          {
            type: "blockquote",
            content: "Users are requesting better mobile responsiveness",
            speakerName: "Sarah Williams",
            speakerIdentifier: null,
            startTime: "2024-03-20T14:50:00Z"
          },
          {
            type: "blockquote",
            content: "Let's schedule a mobile UX workshop for next week",
            speakerName: "user",
            speakerIdentifier: "user",
            startTime: "2024-03-20T15:00:00Z"
          }
        ]
      }
    ]
  },
  {
    id: "client-call",
    title: "Client Consultation - Acme Corp",
    startTime: "2024-03-20T16:00:00Z",
    endTime: "2024-03-20T17:00:00Z",
    markdown: "",
    contents: [
      {
        type: "heading2",
        content: "Project Requirements",
        startTime: "2024-03-20T16:00:00Z",
        endTime: "2024-03-20T16:30:00Z",
        children: [
          {
            type: "blockquote",
            content: "We need the project delivered by the end of Q2",
            speakerName: "John Doe",
            speakerIdentifier: null,
            startTime: "2024-03-20T16:05:00Z"
          },
          {
            type: "blockquote",
            content: "I'll prepare a detailed project timeline by tomorrow",
            speakerName: "user",
            speakerIdentifier: "user",
            startTime: "2024-03-20T16:10:00Z"
          }
        ]
      }
    ]
  }
];

// Test implementation of a second extractor for integration testing
class TestActionItemsExtractor extends AbstractExtractor {
  readonly id = "test_action_items";
  readonly name = "Test Action Items";
  readonly description = "Test extractor for action items extraction";
  readonly version = "1.0.0";

  readonly defaultConfig: ExtractorConfig = {
    enabled: true,
    priority: 90,
    settings: {}
  };

  async extract(lifelogs: Lifelog[], env: Env, config?: ExtractorConfig): Promise<ExtractorResult> {
    const { result: extractionResult, time: processingTime } = await this.measureTime(async () => {
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 50));

      const actionItems = [
        "Finish API documentation by Friday (user)",
        "Help with migration script today (Alice Johnson)",
        "Create design mockups by next Tuesday (Sarah Williams)",
        "Prepare detailed project timeline by tomorrow (user)"
      ];

      const html = `
        <h2>Action Items</h2>
        <ul>
          ${actionItems.map(item => `<li>${item}</li>`).join('')}
        </ul>
      `;

      const text = `Action Items\n\n${actionItems.map(item => `• ${item}`).join('\n')}`;

      return {
        html,
        text,
        metadata: {
          processingTime: 50,
          logCount: lifelogs.length,
          custom: {
            extractorType: 'action_items',
            itemCount: actionItems.length
          }
        }
      };
    });

    return {
      ...extractionResult,
      metadata: {
        ...extractionResult.metadata,
        processingTime
      }
    };
  }
}

// Test implementation of a third extractor that fails
class TestFailingExtractor extends AbstractExtractor {
  readonly id = "test_failing";
  readonly name = "Test Failing Extractor";
  readonly description = "Test extractor that always fails";
  readonly version = "1.0.0";

  readonly defaultConfig: ExtractorConfig = {
    enabled: true,
    priority: 100,
    settings: {}
  };

  async extract(lifelogs: Lifelog[], env: Env, config?: ExtractorConfig): Promise<ExtractorResult> {
    throw new Error("Simulated extractor failure");
  }
}

// Mock OpenAI responses for different scenarios
const mockGptResponse = `**Overview**
Daily standup covered sprint progress and blocker resolution. Product review prioritized dark mode and mobile UX improvements. Client consultation established Q2 delivery timeline.

**Action Items & Deadlines**
| Owner | Task | Due | Status |
|-------|------|-----|--------|
| user | Finish API documentation | Friday | new |
| Alice Johnson | Help with migration script | today | new |
| Sarah Williams | Create design mockups | next Tuesday | new |
| user | Prepare project timeline | tomorrow | new |

**Key Decisions**
• Implement dark mode as priority feature
• Schedule mobile UX workshop for next week
• Q2 delivery timeline confirmed

**Discussion Log**
• Team Updates (09:00 – 09:15, 15 minutes)
• Blockers and Issues (09:15 – 09:25, 10 minutes)
• Dark Mode Implementation (14:00 – 14:45, 45 minutes)
• User Feedback Analysis (14:45 – 15:30, 45 minutes)
• Project Requirements (16:00 – 16:30, 30 minutes)`;

// Setup and cleanup for each test
beforeEach(() => {
  // Mock OpenAI module for consistent responses
  mock.module('openai', () => ({
    default: class {
      constructor() {
        return {
          chat: {
            completions: {
              create: async () => ({
                choices: [{
                  message: {
                    content: mockGptResponse
                  }
                }]
              })
            }
          }
        };
      }
    }
  }));
});

afterEach(() => {
  mock.restore();
});

// Integration Tests
test('Registry should register and execute multiple extractors successfully', async () => {
  const registry = new ExtractorRegistry({
    maxConcurrency: 2,
    extractorTimeout: 5000,
    continueOnError: true
  });

  const gptExtractor = new GptSummaryExtractor();
  const actionItemsExtractor = new TestActionItemsExtractor();

  // Register extractors
  await registry.register(gptExtractor);
  await registry.register(actionItemsExtractor, { priority: 90 });

  const env = createMockEnv();
  const lifelogs = createTestLifelogs();

  // Initialize registry
  await registry.initialize(env);

  // Execute all extractors
  const result = await registry.execute(lifelogs, env);

  // Verify execution summary
  expect(result.summary.totalExtractors).toBe(2);
  expect(result.summary.successCount).toBe(2);
  expect(result.summary.errorCount).toBe(0);
  expect(result.summary.disabledCount).toBe(0);
  expect(result.summary.totalTime).toBeGreaterThan(0);

  // Verify results
  expect(result.results).toHaveLength(2);
  expect(result.errors).toHaveLength(0);

  // Check that results are ordered by priority (GPT summary should be first)
  expect(result.results[0].extractorId).toBe('gpt_summary');
  expect(result.results[1].extractorId).toBe('test_action_items');

  // Verify result structure
  const gptResult = result.results[0].result;
  expect(gptResult).toHaveProperty('html');
  expect(gptResult).toHaveProperty('text');
  expect(gptResult).toHaveProperty('metadata');
  expect(gptResult.html).toContain('Daily Summary');
  expect(gptResult.text).toContain('Overview');

  const actionResult = result.results[1].result;
  expect(actionResult).toHaveProperty('html');
  expect(actionResult).toHaveProperty('text');
  expect(actionResult.html).toContain('Action Items');
  expect(actionResult.text).toContain('API documentation');
});

test('Registry should handle extractor failures gracefully when continueOnError is true', async () => {
  const registry = new ExtractorRegistry({
    maxConcurrency: 3,
    extractorTimeout: 5000,
    continueOnError: true
  });

  const gptExtractor = new GptSummaryExtractor();
  const failingExtractor = new TestFailingExtractor();
  const actionItemsExtractor = new TestActionItemsExtractor();

  await registry.register(gptExtractor);
  await registry.register(failingExtractor, { priority: 95 });
  await registry.register(actionItemsExtractor, { priority: 90 });

  const env = createMockEnv();
  const lifelogs = createTestLifelogs();

  await registry.initialize(env);
  const result = await registry.execute(lifelogs, env);

  // Should have 2 successful results and 1 error
  expect(result.summary.totalExtractors).toBe(3);
  expect(result.summary.successCount).toBe(2);
  expect(result.summary.errorCount).toBe(1);
  expect(result.results).toHaveLength(2);
  expect(result.errors).toHaveLength(1);

  // Verify error structure
  const error = result.errors[0];
  expect(error.extractorId).toBe('test_failing');
  expect(error.message).toBe('Simulated extractor failure');
  expect(error.context).toHaveProperty('logCount');
  expect(error.context).toHaveProperty('timestamp');
});

test('Registry should stop execution when continueOnError is false and an extractor fails', async () => {
  const registry = new ExtractorRegistry({
    maxConcurrency: 3,
    extractorTimeout: 5000,
    continueOnError: false
  });

  const gptExtractor = new GptSummaryExtractor();
  const failingExtractor = new TestFailingExtractor();
  const actionItemsExtractor = new TestActionItemsExtractor();

  await registry.register(gptExtractor);
  await registry.register(failingExtractor, { priority: 110 }); // Highest priority to run first
  await registry.register(actionItemsExtractor, { priority: 90 });

  const env = createMockEnv();
  const lifelogs = createTestLifelogs();

  await registry.initialize(env);

  // Should throw an error because continueOnError is false
  await expect(registry.execute(lifelogs, env)).rejects.toThrow('Simulated extractor failure');
});

test('Registry should respect priority ordering for extractor execution', async () => {
  const registry = new ExtractorRegistry();

  const gptExtractor = new GptSummaryExtractor();
  const actionItemsExtractor = new TestActionItemsExtractor();

  // Register with specific priorities  
  await registry.register(actionItemsExtractor, { priority: 150 }); // Higher priority
  await registry.register(gptExtractor, { priority: 100 }); // Lower priority

  const env = createMockEnv();
  const lifelogs = createTestLifelogs();

  await registry.initialize(env);
  const result = await registry.execute(lifelogs, env);

  // Both extractors should complete successfully
  expect(result.results).toHaveLength(2);
  const extractorIds = result.results.map(r => r.extractorId);
  expect(extractorIds).toContain('test_action_items');
  expect(extractorIds).toContain('gpt_summary');
  
  // The registry should start them in priority order, though completion order may vary
  const registeredExtractors = registry.getRegisteredExtractors();
  const sortedByPriority = registeredExtractors.sort((a, b) => b.config.priority - a.config.priority);
  expect(sortedByPriority[0].id).toBe('test_action_items'); // Higher priority
  expect(sortedByPriority[1].id).toBe('gpt_summary'); // Lower priority
});

test('Registry should handle timeout scenarios correctly', async () => {
  const registry = new ExtractorRegistry({
    extractorTimeout: 10 // Very short timeout
  });

  // Create a slow extractor
  class SlowExtractor extends AbstractExtractor {
    readonly id = "slow_extractor";
    readonly name = "Slow Extractor";
    readonly description = "Test extractor that takes too long";
    readonly version = "1.0.0";

    readonly defaultConfig: ExtractorConfig = {
      enabled: true,
      priority: 100,
      settings: {}
    };

    async extract(lifelogs: Lifelog[], env: Env, config?: ExtractorConfig): Promise<ExtractorResult> {
      await new Promise(resolve => setTimeout(resolve, 100)); // Longer than timeout
      return { html: "test", text: "test" };
    }
  }

  const slowExtractor = new SlowExtractor();
  await registry.register(slowExtractor);

  const env = createMockEnv();
  const lifelogs = createTestLifelogs();

  await registry.initialize(env);
  const result = await registry.execute(lifelogs, env);

  expect(result.summary.errorCount).toBe(1);
  expect(result.errors[0].message).toContain('timed out');
});

test('Registry should handle disabled extractors correctly', async () => {
  const registry = new ExtractorRegistry();

  const gptExtractor = new GptSummaryExtractor();
  const actionItemsExtractor = new TestActionItemsExtractor();

  await registry.register(gptExtractor);
  await registry.register(actionItemsExtractor, { enabled: false }); // Disabled

  const env = createMockEnv();
  const lifelogs = createTestLifelogs();

  await registry.initialize(env);
  const result = await registry.execute(lifelogs, env);

  expect(result.summary.totalExtractors).toBe(2);
  expect(result.summary.successCount).toBe(1);
  expect(result.summary.disabledCount).toBe(1);
  expect(result.results).toHaveLength(1);
  expect(result.results[0].extractorId).toBe('gpt_summary');
});

test('Registry should manage concurrency correctly', async () => {
  const registry = new ExtractorRegistry({
    maxConcurrency: 1 // Only one at a time
  });

  const executionOrder: string[] = [];

  // Create extractors that track execution order
  class TrackingExtractor extends AbstractExtractor {
    readonly id: string;
    readonly name: string;
    readonly description = "Test extractor for concurrency testing";
    readonly version = "1.0.0";

    readonly defaultConfig: ExtractorConfig = {
      enabled: true,
      priority: 100,
      settings: {}
    };

    constructor(private trackingId: string) {
      super();
      this.id = this.trackingId;
      this.name = `Tracking Extractor ${this.trackingId}`;
    }

    async extract(lifelogs: Lifelog[], env: Env, config?: ExtractorConfig): Promise<ExtractorResult> {
      executionOrder.push(`start-${this.trackingId}`);
      await new Promise(resolve => setTimeout(resolve, 50));
      executionOrder.push(`end-${this.trackingId}`);
      return { html: `test-${this.trackingId}`, text: `test-${this.trackingId}` };
    }
  }

  const extractor1 = new TrackingExtractor('extractor1');
  const extractor2 = new TrackingExtractor('extractor2');
  const extractor3 = new TrackingExtractor('extractor3');

  await registry.register(extractor1);
  await registry.register(extractor2);
  await registry.register(extractor3);

  const env = createMockEnv();
  const lifelogs = createTestLifelogs();

  await registry.initialize(env);
  const result = await registry.execute(lifelogs, env);

  expect(result.summary.successCount).toBe(3);

  // With maxConcurrency=1, extractors should complete one at a time
  expect(executionOrder).toEqual([
    'start-extractor1', 'end-extractor1',
    'start-extractor2', 'end-extractor2',
    'start-extractor3', 'end-extractor3'
  ]);
});

test('Registry should handle configuration updates correctly', async () => {
  const registry = new ExtractorRegistry();
  const gptExtractor = new GptSummaryExtractor();

  await registry.register(gptExtractor);

  // Update configuration
  await registry.updateConfig('gpt_summary', {
    enabled: false,
    priority: 50
  });

  const registeredInfo = registry.getExtractor('gpt_summary');
  expect(registeredInfo?.config.enabled).toBe(false);
  expect(registeredInfo?.config.priority).toBe(50);

  // Trying to update non-existent extractor should throw
  await expect(registry.updateConfig('nonexistent', {})).rejects.toThrow('not found');
});

test('Registry should validate extractor configurations', async () => {
  const registry = new ExtractorRegistry();
  const gptExtractor = new GptSummaryExtractor();

  // Valid configuration should work
  await expect(registry.register(gptExtractor, {
    enabled: true,
    priority: 100,
    settings: { model: 'gpt-4o' }
  })).resolves.toBeUndefined();

  // Invalid configuration should throw
  class BadExtractor extends GptSummaryExtractor {
    readonly id = 'bad_extractor'; // Different ID to avoid duplicate
  }
  
  const badExtractor = new BadExtractor();

  await expect(registry.register(badExtractor, {
    enabled: 'not-boolean' as any,
    priority: 100
  })).rejects.toThrow('enabled must be a boolean');
});

test('Complete email generation workflow with multiple extractors', async () => {
  const registry = new ExtractorRegistry({
    maxConcurrency: 2,
    continueOnError: true
  });

  const gptExtractor = new GptSummaryExtractor();
  const actionItemsExtractor = new TestActionItemsExtractor();

  await registry.register(gptExtractor);
  await registry.register(actionItemsExtractor, { priority: 90 });

  const env = createMockEnv();
  const lifelogs = createTestLifelogs();

  await registry.initialize(env);
  const result = await registry.execute(lifelogs, env);

  // Simulate email generation logic (similar to index.ts)
  expect(result.results.length).toBeGreaterThan(0);

  const primaryResult = result.results[0].result;

  // Verify email-ready output
  expect(primaryResult.html).toContain('<h2>Daily Summary</h2>');
  expect(primaryResult.text).toContain('Daily Summary\n\n');

  // Verify content includes key information from lifelogs
  expect(primaryResult.text).toContain('API documentation');
  expect(primaryResult.text).toContain('dark mode');
  expect(primaryResult.text).toContain('migration script');

  // Verify metadata for monitoring
  expect(primaryResult.metadata).toHaveProperty('processingTime');
  expect(primaryResult.metadata).toHaveProperty('logCount');
  expect(primaryResult.metadata?.logCount).toBe(3);

  // Test that HTML is properly formatted for email
  expect(primaryResult.html).not.toContain('undefined');
  expect(primaryResult.html).not.toContain('null');
  expect(primaryResult.html).toMatch(/<h2>.*<\/h2>/);

  // Test that text version is readable
  expect(primaryResult.text.split('\n').length).toBeGreaterThan(5);
  expect(primaryResult.text).not.toContain('<');
  expect(primaryResult.text).not.toContain('>');
});

test('Registry should handle empty lifelog data gracefully', async () => {
  const registry = new ExtractorRegistry();
  const gptExtractor = new GptSummaryExtractor();

  await registry.register(gptExtractor);

  const env = createMockEnv();
  const emptyLifelogs: Lifelog[] = [];

  await registry.initialize(env);
  const result = await registry.execute(emptyLifelogs, env);

  expect(result.summary.successCount).toBe(1);
  expect(result.results).toHaveLength(1);

  const primaryResult = result.results[0].result;
  expect(primaryResult.metadata?.logCount).toBe(0);
});

test('Registry should provide comprehensive extractor information', async () => {
  const registry = new ExtractorRegistry();
  const gptExtractor = new GptSummaryExtractor();
  const actionItemsExtractor = new TestActionItemsExtractor();

  await registry.register(gptExtractor, { priority: 100 });
  await registry.register(actionItemsExtractor, { priority: 90, enabled: false });

  const extractorInfo = registry.getRegisteredExtractors();

  expect(extractorInfo).toHaveLength(2);

  const gptInfo = extractorInfo.find(info => info.id === 'gpt_summary');
  expect(gptInfo).toBeDefined();
  expect(gptInfo?.name).toBe('GPT Summary');
  expect(gptInfo?.description).toContain('AI-powered conversation summaries');
  expect(gptInfo?.version).toBe('2.0.0');
  expect(gptInfo?.config.priority).toBe(100);
  expect(gptInfo?.config.enabled).toBe(true);

  const actionInfo = extractorInfo.find(info => info.id === 'test_action_items');
  expect(actionInfo).toBeDefined();
  expect(actionInfo?.config.enabled).toBe(false);
});

test('Registry cleanup should work correctly', async () => {
  const registry = new ExtractorRegistry();
  
  // Create an extractor with cleanup method
  class CleanupExtractor extends AbstractExtractor {
    readonly id = "cleanup_test";
    readonly name = "Cleanup Test";
    readonly description = "Test extractor with cleanup";
    readonly version = "1.0.0";
    
    readonly defaultConfig: ExtractorConfig = {
      enabled: true,
      priority: 100,
      settings: {}
    };
    
    cleanupCalled = false;

    async extract(lifelogs: Lifelog[], env: Env, config?: ExtractorConfig): Promise<ExtractorResult> {
      return { html: "test", text: "test" };
    }

    async cleanup(): Promise<void> {
      this.cleanupCalled = true;
    }
  }

  const cleanupExtractor = new CleanupExtractor();
  await registry.register(cleanupExtractor);

  // Clear should call cleanup
  await registry.clear();

  expect(cleanupExtractor.cleanupCalled).toBe(true);
  expect(registry.getRegisteredExtractors()).toHaveLength(0);
});

test('Performance with realistic data volumes', async () => {
  const registry = new ExtractorRegistry({
    maxConcurrency: 3
  });

  const gptExtractor = new GptSummaryExtractor();
  const actionItemsExtractor = new TestActionItemsExtractor();

  await registry.register(gptExtractor);
  await registry.register(actionItemsExtractor);

  const env = createMockEnv();
  
  // Create larger dataset
  const largeLifelogs: Lifelog[] = [];
  for (let i = 0; i < 10; i++) {
    largeLifelogs.push(...createTestLifelogs().map(log => ({
      ...log,
      id: `${log.id}-${i}`,
      title: `${log.title} - Iteration ${i}`
    })));
  }

  await registry.initialize(env);

  const startTime = Date.now();
  const result = await registry.execute(largeLifelogs, env);
  const executionTime = Date.now() - startTime;

  expect(result.summary.successCount).toBe(2);
  expect(result.summary.totalTime).toBeGreaterThan(0);
  
  // Should complete in reasonable time (adjust threshold as needed)
  expect(executionTime).toBeLessThan(10000); // 10 seconds

  // Verify data was processed correctly
  expect(result.results[0].result.metadata?.logCount).toBe(30); // 3 logs × 10 iterations
});

test('Backward compatibility with existing email format', async () => {
  const registry = new ExtractorRegistry();
  const gptExtractor = new GptSummaryExtractor();

  await registry.register(gptExtractor);

  const env = createMockEnv();
  const lifelogs = createTestLifelogs();

  await registry.initialize(env);
  const result = await registry.execute(lifelogs, env);

  const primaryResult = result.results[0].result;

  // Verify backward compatibility with expected email structure
  expect(primaryResult.html).toContain('<h2>Daily Summary</h2>');
  expect(primaryResult.html).toContain('<div style=');
  
  expect(primaryResult.text).toMatch(/^Daily Summary\n\n/);
  
  // Structure should match what the legacy gpt_summary function produced
  expect(primaryResult.text).toContain('Overview');
  expect(primaryResult.text).toContain('Action Items');
  expect(primaryResult.text).toContain('Key Decisions');
  expect(primaryResult.text).toContain('Discussion Log');
});