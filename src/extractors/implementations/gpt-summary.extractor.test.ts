/**
 * Unit tests for the GPT Summary extractor implementation.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { GptSummaryExtractor, type GptSummaryConfig } from './gpt-summary.extractor';
import type { Env, Lifelog } from '../../types';

// Mock OpenAI
jest.mock('openai');

const mockOpenAI = {
  chat: {
    completions: {
      create: jest.fn()
    }
  }
};

// Mock OpenAI constructor
const OpenAI = jest.fn().mockImplementation(() => mockOpenAI);

// Mock environment
const mockEnv: Env = {
  TOKEN_KV: {} as any,
  OPENAI_API_KEY: 'test-openai-key',
  TIMEZONE: 'America/Los_Angeles',
  LIMITLESS_API_KEY: 'test-limitless-key',
  FROM_EMAIL: 'test@example.com',
  TO_EMAIL: 'recipient@example.com',
  RESEND_API_KEY: 'test-resend-key'
};

// Mock lifelog data
const mockLifelogs: Lifelog[] = [
  {
    id: '1',
    title: 'Test Meeting',
    startTime: '2024-01-01T10:00:00Z',
    endTime: '2024-01-01T11:00:00Z',
    contents: [
      {
        type: 'blockquote',
        content: 'Hello, how are you today?',
        startTime: '2024-01-01T10:05:00Z',
        endTime: '2024-01-01T10:05:30Z',
        speakerName: 'Alice',
        speakerIdentifier: 'user'
      },
      {
        type: 'blockquote',
        content: 'I am doing well, thanks for asking.',
        startTime: '2024-01-01T10:06:00Z',
        endTime: '2024-01-01T10:06:30Z',
        speakerName: 'Bob',
        speakerIdentifier: null
      }
    ],
    markdown: 'Test markdown content'
  }
];

const mockEmptyLifelogs: Lifelog[] = [
  {
    id: '2',
    title: 'Empty Meeting',
    startTime: '2024-01-01T14:00:00Z',
    endTime: '2024-01-01T14:30:00Z',
    contents: [],
    markdown: ''
  }
];

describe('GptSummaryExtractor', () => {
  let extractor: GptSummaryExtractor;

  beforeEach(() => {
    extractor = new GptSummaryExtractor();
    jest.clearAllMocks();
  });

  describe('Basic Properties', () => {
    it('should have correct basic properties', () => {
      expect(extractor.id).toBe('gpt_summary');
      expect(extractor.name).toBe('GPT Summary');
      expect(extractor.description).toBe('Generates AI-powered conversation summaries using OpenAI\'s GPT model');
      expect(extractor.version).toBe('2.0.0');
    });

    it('should have correct default configuration', () => {
      expect(extractor.defaultConfig).toEqual({
        enabled: true,
        priority: 100,
        settings: {
          model: 'gpt-4o',
          maxTokens: 512,
          temperature: 0.3,
          maxContentLength: 12000
        }
      });
    });
  });

  describe('Initialization', () => {
    it('should initialize with valid OpenAI API key', async () => {
      await expect(extractor.initialize(mockEnv)).resolves.not.toThrow();
      expect(OpenAI).toHaveBeenCalledWith({ apiKey: 'test-openai-key' });
    });

    it('should throw error without OpenAI API key', async () => {
      const envWithoutKey = { ...mockEnv, OPENAI_API_KEY: '' };
      
      await expect(extractor.initialize(envWithoutKey)).rejects.toThrow(
        'OPENAI_API_KEY is required for GPT Summary extractor'
      );
    });
  });

  describe('Configuration Validation', () => {
    it('should validate default configuration', () => {
      expect(extractor.validateConfig(extractor.defaultConfig)).toBe(true);
    });

    it('should accept valid custom configuration', () => {
      const config: GptSummaryConfig = {
        enabled: true,
        priority: 150,
        settings: {
          model: 'gpt-3.5-turbo',
          maxTokens: 1000,
          temperature: 0.5,
          maxContentLength: 8000
        }
      };

      expect(extractor.validateConfig(config)).toBe(true);
    });

    it('should reject invalid model type', () => {
      const config: GptSummaryConfig = {
        enabled: true,
        priority: 100,
        settings: {
          model: 123 as any,
          maxTokens: 512,
          temperature: 0.3,
          maxContentLength: 12000
        }
      };

      expect(extractor.validateConfig(config)).toBe('settings.model must be a string');
    });

    it('should reject invalid maxTokens', () => {
      const config: GptSummaryConfig = {
        enabled: true,
        priority: 100,
        settings: {
          model: 'gpt-4o',
          maxTokens: -100,
          temperature: 0.3,
          maxContentLength: 12000
        }
      };

      expect(extractor.validateConfig(config)).toBe('settings.maxTokens must be a positive number');
    });

    it('should reject invalid temperature', () => {
      const config: GptSummaryConfig = {
        enabled: true,
        priority: 100,
        settings: {
          model: 'gpt-4o',
          maxTokens: 512,
          temperature: 5.0,
          maxContentLength: 12000
        }
      };

      expect(extractor.validateConfig(config)).toBe('settings.temperature must be a number between 0 and 2');
    });

    it('should reject invalid maxContentLength', () => {
      const config: GptSummaryConfig = {
        enabled: true,
        priority: 100,
        settings: {
          model: 'gpt-4o',
          maxTokens: 512,
          temperature: 0.3,
          maxContentLength: 0
        }
      };

      expect(extractor.validateConfig(config)).toBe('settings.maxContentLength must be a positive number');
    });

    it('should allow missing optional settings', () => {
      const config: GptSummaryConfig = {
        enabled: true,
        priority: 100,
        settings: {}
      };

      expect(extractor.validateConfig(config)).toBe(true);
    });
  });

  describe('Content Processing', () => {
    beforeEach(async () => {
      await extractor.initialize(mockEnv);
      
      // Mock successful OpenAI response
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: '## Overview\nTest summary of the conversation.\n\n## Key Decisions\n- Decision 1\n- Decision 2'
            }
          }
        ]
      });
    });

    it('should extract summary successfully', async () => {
      const result = await extractor.extract(mockLifelogs, mockEnv);

      expect(result).toEqual({
        html: expect.stringContaining('<h2>Daily Summary</h2>'),
        text: expect.stringContaining('Daily Summary'),
        metadata: {
          processingTime: expect.any(Number),
          logCount: 1,
          custom: {
            model: 'gpt-4o',
            contentLength: expect.any(Number),
            dateStr: expect.any(String)
          }
        }
      });

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4o',
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user' })
        ]),
        max_tokens: 512,
        temperature: 0.3
      });
    });

    it('should handle empty lifelogs', async () => {
      const result = await extractor.extract([], mockEnv);

      expect(result.metadata?.logCount).toBe(0);
      expect(result.text).toContain('(no content to summarize)');
    });

    it('should handle lifelogs with no content', async () => {
      const result = await extractor.extract(mockEmptyLifelogs, mockEnv);

      expect(result.metadata?.logCount).toBe(1);
    });

    it('should use custom configuration', async () => {
      const customConfig: GptSummaryConfig = {
        enabled: true,
        priority: 100,
        settings: {
          model: 'gpt-3.5-turbo',
          maxTokens: 256,
          temperature: 0.1,
          maxContentLength: 5000
        }
      };

      await extractor.extract(mockLifelogs, mockEnv, customConfig);

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-3.5-turbo',
        messages: expect.any(Array),
        max_tokens: 256,
        temperature: 0.1
      });
    });

    it('should format content correctly', async () => {
      await extractor.extract(mockLifelogs, mockEnv);

      const [systemMessage, userMessage] = mockOpenAI.chat.completions.create.mock.calls[0][0].messages;
      
      expect(systemMessage.role).toBe('system');
      expect(systemMessage.content).toContain('conversation-summarizer');
      
      expect(userMessage.role).toBe('user');
      expect(userMessage.content).toContain('Test Meeting');
      expect(userMessage.content).toContain('Alice: Hello, how are you today?');
      expect(userMessage.content).toContain('Bob: I am doing well, thanks for asking.');
    });

    it('should handle timezone correctly', async () => {
      const customEnv = { ...mockEnv, TIMEZONE: 'America/New_York' };
      
      const result = await extractor.extract(mockLifelogs, customEnv);
      
      expect(result.metadata?.custom?.dateStr).toContain('December 31, 2023'); // Previous day in NY timezone
    });

    it('should truncate long content', async () => {
      const longConfig: GptSummaryConfig = {
        enabled: true,
        priority: 100,
        settings: {
          maxContentLength: 100 // Very small limit
        }
      };

      await extractor.extract(mockLifelogs, mockEnv, longConfig);

      const userMessage = mockOpenAI.chat.completions.create.mock.calls[0][0].messages[1];
      expect(userMessage.content.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await extractor.initialize(mockEnv);
    });

    it('should throw error if not initialized', async () => {
      const uninitializedExtractor = new GptSummaryExtractor();
      
      await expect(uninitializedExtractor.extract(mockLifelogs, mockEnv)).rejects.toThrow(
        'OpenAI client not initialized. Call initialize() first.'
      );
    });

    it('should handle OpenAI API errors', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API Error'));

      await expect(extractor.extract(mockLifelogs, mockEnv)).rejects.toThrow('API Error');
    });

    it('should handle empty OpenAI response', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: []
      });

      const result = await extractor.extract(mockLifelogs, mockEnv);
      expect(result.text).toContain('(no summary generated)');
    });

    it('should handle null OpenAI response content', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: null } }]
      });

      const result = await extractor.extract(mockLifelogs, mockEnv);
      expect(result.text).toContain('(no summary generated)');
    });
  });

  describe('Content Walking Utility', () => {
    it('should walk nested content correctly', () => {
      const nestedLifelogs: Lifelog[] = [
        {
          id: '1',
          title: 'Nested Test',
          startTime: '2024-01-01T10:00:00Z',
          endTime: '2024-01-01T11:00:00Z',
          contents: [
            {
              type: 'blockquote',
              content: 'Parent content',
              children: [
                {
                  type: 'blockquote',
                  content: 'Child content 1'
                },
                {
                  type: 'blockquote',
                  content: 'Child content 2',
                  children: [
                    {
                      type: 'blockquote',
                      content: 'Grandchild content'
                    }
                  ]
                }
              ]
            }
          ],
          markdown: 'Test'
        }
      ];

      // Test via extraction which uses the walk method internally
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'Test summary' } }]
      });

      return extractor.extract(nestedLifelogs, mockEnv).then(() => {
        const userMessage = mockOpenAI.chat.completions.create.mock.calls[0][0].messages[1];
        
        expect(userMessage.content).toContain('Parent content');
        expect(userMessage.content).toContain('Child content 1');
        expect(userMessage.content).toContain('Child content 2');
        expect(userMessage.content).toContain('Grandchild content');
      });
    });
  });
});