/**
 * Unit tests for the base extractor interface and abstract class.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { 
  AbstractExtractor, 
  isBaseExtractor,
  type ExtractorConfig,
  type ExtractorResult
} from './extractor.interface';
import type { Env, Lifelog } from '../../types';

// Mock implementation for testing
class MockExtractor extends AbstractExtractor {
  readonly id = 'mock_extractor';
  readonly name = 'Mock Extractor';
  readonly description = 'A mock extractor for testing';
  readonly version = '1.0.0';

  async extract(lifelogs: Lifelog[], env: Env, config?: ExtractorConfig): Promise<ExtractorResult> {
    return {
      html: '<div>Mock HTML</div>',
      text: 'Mock text',
      metadata: {
        processingTime: 100,
        logCount: lifelogs.length
      }
    };
  }
}

// Mock implementation with custom validation
class MockExtractorWithValidation extends AbstractExtractor {
  readonly id = 'mock_with_validation';
  readonly name = 'Mock Extractor with Validation';
  readonly description = 'A mock extractor with custom validation';
  readonly version = '1.0.0';

  validateConfig(config: ExtractorConfig): true | string {
    const baseValidation = super.validateConfig(config);
    if (baseValidation !== true) {
      return baseValidation;
    }

    if (config.settings?.customSetting && typeof config.settings.customSetting !== 'string') {
      return 'customSetting must be a string';
    }

    return true;
  }

  async extract(lifelogs: Lifelog[], env: Env, config?: ExtractorConfig): Promise<ExtractorResult> {
    return {
      html: '<div>Mock HTML with validation</div>',
      text: 'Mock text with validation'
    };
  }
}

// Mock environment
const mockEnv: Env = {
  TOKEN_KV: {} as any,
  OPENAI_API_KEY: 'test-key',
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
    title: 'Test Conversation',
    startTime: '2024-01-01T10:00:00Z',
    endTime: '2024-01-01T11:00:00Z',
    contents: [],
    markdown: 'Test markdown content'
  }
];

describe('AbstractExtractor', () => {
  let extractor: MockExtractor;

  beforeEach(() => {
    extractor = new MockExtractor();
  });

  describe('Default Configuration', () => {
    it('should have default configuration', () => {
      expect(extractor.defaultConfig).toEqual({
        enabled: true,
        priority: 100,
        settings: {}
      });
    });
  });

  describe('Configuration Validation', () => {
    it('should validate valid configuration', () => {
      const config: ExtractorConfig = {
        enabled: true,
        priority: 50,
        settings: { key: 'value' }
      };

      expect(extractor.validateConfig(config)).toBe(true);
    });

    it('should reject invalid enabled value', () => {
      const config = {
        enabled: 'true' as any,
        priority: 50,
        settings: {}
      };

      expect(extractor.validateConfig(config)).toBe('enabled must be a boolean');
    });

    it('should reject invalid priority value', () => {
      const config = {
        enabled: true,
        priority: -1,
        settings: {}
      };

      expect(extractor.validateConfig(config)).toBe('priority must be a non-negative number');
    });

    it('should reject non-numeric priority', () => {
      const config = {
        enabled: true,
        priority: 'high' as any,
        settings: {}
      };

      expect(extractor.validateConfig(config)).toBe('priority must be a non-negative number');
    });

    it('should reject invalid settings type', () => {
      const config = {
        enabled: true,
        priority: 100,
        settings: 'invalid' as any
      };

      expect(extractor.validateConfig(config)).toBe('settings must be an object');
    });

    it('should allow undefined settings', () => {
      const config = {
        enabled: true,
        priority: 100
      } as ExtractorConfig;

      expect(extractor.validateConfig(config)).toBe(true);
    });
  });

  describe('Extract Method', () => {
    it('should execute extract method successfully', async () => {
      const result = await extractor.extract(mockLifelogs, mockEnv);

      expect(result).toEqual({
        html: '<div>Mock HTML</div>',
        text: 'Mock text',
        metadata: {
          processingTime: 100,
          logCount: 1
        }
      });
    });

    it('should handle empty lifelogs array', async () => {
      const result = await extractor.extract([], mockEnv);

      expect(result.metadata?.logCount).toBe(0);
    });
  });

  describe('Error Creation Utility', () => {
    it('should create standardized error', () => {
      const originalError = new Error('Original error');
      const context = { logCount: 5 };

      const error = (extractor as any).createError('Test error', originalError, context);

      expect(error).toEqual({
        extractorId: 'mock_extractor',
        message: 'Test error',
        originalError,
        context: {
          timestamp: expect.any(String),
          logCount: 5
        }
      });
    });

    it('should create error without original error', () => {
      const error = (extractor as any).createError('Test error');

      expect(error).toEqual({
        extractorId: 'mock_extractor',
        message: 'Test error',
        originalError: undefined,
        context: {
          timestamp: expect.any(String)
        }
      });
    });
  });

  describe('Time Measurement Utility', () => {
    it('should measure execution time', async () => {
      const mockFunction = jest.fn().mockResolvedValue('test result');
      
      const { result, time } = await (extractor as any).measureTime(mockFunction);

      expect(result).toBe('test result');
      expect(typeof time).toBe('number');
      expect(time).toBeGreaterThanOrEqual(0);
      expect(mockFunction).toHaveBeenCalledTimes(1);
    });

    it('should handle async function errors', async () => {
      const mockFunction = jest.fn().mockRejectedValue(new Error('Test error'));
      
      await expect((extractor as any).measureTime(mockFunction)).rejects.toThrow('Test error');
    });
  });
});

describe('Custom Validation Extractor', () => {
  let extractor: MockExtractorWithValidation;

  beforeEach(() => {
    extractor = new MockExtractorWithValidation();
  });

  it('should perform base validation first', () => {
    const config = {
      enabled: 'invalid' as any,
      priority: 100,
      settings: { customSetting: 'valid' }
    };

    expect(extractor.validateConfig(config)).toBe('enabled must be a boolean');
  });

  it('should perform custom validation', () => {
    const config = {
      enabled: true,
      priority: 100,
      settings: { customSetting: 123 }
    };

    expect(extractor.validateConfig(config)).toBe('customSetting must be a string');
  });

  it('should pass both base and custom validation', () => {
    const config = {
      enabled: true,
      priority: 100,
      settings: { customSetting: 'valid' }
    };

    expect(extractor.validateConfig(config)).toBe(true);
  });
});

describe('isBaseExtractor type guard', () => {
  it('should return true for valid extractor', () => {
    const extractor = new MockExtractor();
    expect(isBaseExtractor(extractor)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isBaseExtractor(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isBaseExtractor(undefined)).toBe(false);
  });

  it('should return false for object missing required properties', () => {
    const invalidExtractor = {
      id: 'test',
      name: 'Test'
      // missing other required properties
    };

    expect(isBaseExtractor(invalidExtractor)).toBe(false);
  });

  it('should return false for object with wrong property types', () => {
    const invalidExtractor = {
      id: 123, // should be string
      name: 'Test',
      description: 'Test description',
      version: '1.0.0',
      defaultConfig: {},
      extract: () => {},
      validateConfig: () => {}
    };

    expect(isBaseExtractor(invalidExtractor)).toBe(false);
  });

  it('should return false for object missing methods', () => {
    const invalidExtractor = {
      id: 'test',
      name: 'Test',
      description: 'Test description',
      version: '1.0.0',
      defaultConfig: {}
      // missing extract and validateConfig methods
    };

    expect(isBaseExtractor(invalidExtractor)).toBe(false);
  });
});