/**
 * Unit tests for the extractor registry system.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ExtractorRegistry } from './extractor.registry';
import { AbstractExtractor, type ExtractorConfig, type ExtractorResult } from './extractor.interface';
import type { Env, Lifelog } from '../../types';

// Mock extractors for testing
class FastMockExtractor extends AbstractExtractor {
  readonly id = 'fast_mock';
  readonly name = 'Fast Mock Extractor';
  readonly description = 'A fast mock extractor for testing';
  readonly version = '1.0.0';

  async extract(lifelogs: Lifelog[], env: Env): Promise<ExtractorResult> {
    await new Promise(resolve => setTimeout(resolve, 10)); // 10ms delay
    return {
      html: '<div>Fast mock HTML</div>',
      text: 'Fast mock text',
      metadata: { processingTime: 10, logCount: lifelogs.length }
    };
  }
}

class SlowMockExtractor extends AbstractExtractor {
  readonly id = 'slow_mock';
  readonly name = 'Slow Mock Extractor';
  readonly description = 'A slow mock extractor for testing';
  readonly version = '1.0.0';

  readonly defaultConfig = {
    enabled: true,
    priority: 50, // Lower priority than fast mock
    settings: {}
  };

  async extract(lifelogs: Lifelog[], env: Env): Promise<ExtractorResult> {
    await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay
    return {
      html: '<div>Slow mock HTML</div>',
      text: 'Slow mock text',
      metadata: { processingTime: 50, logCount: lifelogs.length }
    };
  }
}

class ErrorMockExtractor extends AbstractExtractor {
  readonly id = 'error_mock';
  readonly name = 'Error Mock Extractor';
  readonly description = 'An extractor that always fails';
  readonly version = '1.0.0';

  async extract(lifelogs: Lifelog[], env: Env): Promise<ExtractorResult> {
    throw new Error('Mock extractor error');
  }
}

class InitializeMockExtractor extends AbstractExtractor {
  readonly id = 'init_mock';
  readonly name = 'Initialize Mock Extractor';
  readonly description = 'An extractor with initialization';
  readonly version = '1.0.0';

  public initializeCalled = false;
  public cleanupCalled = false;

  async initialize(env: Env): Promise<void> {
    this.initializeCalled = true;
  }

  async cleanup(): Promise<void> {
    this.cleanupCalled = true;
  }

  async extract(lifelogs: Lifelog[], env: Env): Promise<ExtractorResult> {
    if (!this.initializeCalled) {
      throw new Error('Extractor not initialized');
    }
    
    return {
      html: '<div>Initialize mock HTML</div>',
      text: 'Initialize mock text'
    };
  }
}

class ConfigValidationExtractor extends AbstractExtractor {
  readonly id = 'config_validation';
  readonly name = 'Config Validation Extractor';
  readonly description = 'An extractor with custom config validation';
  readonly version = '1.0.0';

  validateConfig(config: ExtractorConfig): true | string {
    const baseValidation = super.validateConfig(config);
    if (baseValidation !== true) {
      return baseValidation;
    }

    if (config.settings?.requiredSetting === undefined) {
      return 'requiredSetting is required';
    }

    return true;
  }

  async extract(lifelogs: Lifelog[], env: Env): Promise<ExtractorResult> {
    return {
      html: '<div>Config validation HTML</div>',
      text: 'Config validation text'
    };
  }
}

// Mock environment and lifelog data
const mockEnv: Env = {
  TOKEN_KV: {} as any,
  OPENAI_API_KEY: 'test-key',
  TIMEZONE: 'America/Los_Angeles',
  LIMITLESS_API_KEY: 'test-limitless-key',
  FROM_EMAIL: 'test@example.com',
  TO_EMAIL: 'recipient@example.com',
  RESEND_API_KEY: 'test-resend-key'
};

const mockLifelogs: Lifelog[] = [
  {
    id: '1',
    title: 'Test Conversation',
    startTime: '2024-01-01T10:00:00Z',
    endTime: '2024-01-01T11:00:00Z',
    contents: [],
    markdown: 'Test markdown'
  }
];

describe('ExtractorRegistry', () => {
  let registry: ExtractorRegistry;

  beforeEach(() => {
    registry = new ExtractorRegistry();
  });

  describe('Constructor and Configuration', () => {
    it('should create registry with default configuration', () => {
      const defaultRegistry = new ExtractorRegistry();
      expect(defaultRegistry).toBeInstanceOf(ExtractorRegistry);
    });

    it('should create registry with custom configuration', () => {
      const customRegistry = new ExtractorRegistry({
        maxConcurrency: 3,
        extractorTimeout: 5000,
        continueOnError: false
      });
      expect(customRegistry).toBeInstanceOf(ExtractorRegistry);
    });
  });

  describe('Extractor Registration', () => {
    it('should register a valid extractor', async () => {
      const extractor = new FastMockExtractor();
      
      await registry.register(extractor);
      
      const registered = registry.getRegisteredExtractors();
      expect(registered).toHaveLength(1);
      expect(registered[0].id).toBe('fast_mock');
      expect(registered[0].name).toBe('Fast Mock Extractor');
    });

    it('should register extractor with custom config', async () => {
      const extractor = new FastMockExtractor();
      const customConfig = { enabled: false, priority: 200 };
      
      await registry.register(extractor, customConfig);
      
      const registered = registry.getExtractor('fast_mock');
      expect(registered?.config.enabled).toBe(false);
      expect(registered?.config.priority).toBe(200);
    });

    it('should reject duplicate extractor registration', async () => {
      const extractor1 = new FastMockExtractor();
      const extractor2 = new FastMockExtractor();
      
      await registry.register(extractor1);
      
      await expect(registry.register(extractor2)).rejects.toThrow(
        "Extractor with id 'fast_mock' is already registered"
      );
    });

    it('should reject invalid extractor', async () => {
      const invalidExtractor = { id: 'invalid' } as any;
      
      await expect(registry.register(invalidExtractor)).rejects.toThrow(
        'Invalid extractor: must implement BaseExtractor interface'
      );
    });

    it('should reject extractor with invalid config', async () => {
      const extractor = new ConfigValidationExtractor();
      const invalidConfig = { enabled: true, priority: 100, settings: {} };
      
      await expect(registry.register(extractor, invalidConfig)).rejects.toThrow(
        "Invalid configuration for extractor 'config_validation': requiredSetting is required"
      );
    });

    it('should register extractor with valid custom config', async () => {
      const extractor = new ConfigValidationExtractor();
      const validConfig = { 
        enabled: true, 
        priority: 100, 
        settings: { requiredSetting: 'value' } 
      };
      
      await registry.register(extractor, validConfig);
      
      const registered = registry.getExtractor('config_validation');
      expect(registered?.config.settings?.requiredSetting).toBe('value');
    });
  });

  describe('Extractor Unregistration', () => {
    it('should unregister existing extractor', async () => {
      const extractor = new FastMockExtractor();
      await registry.register(extractor);
      
      const result = await registry.unregister('fast_mock');
      
      expect(result).toBe(true);
      expect(registry.getExtractor('fast_mock')).toBeUndefined();
    });

    it('should return false for non-existent extractor', async () => {
      const result = await registry.unregister('non_existent');
      expect(result).toBe(false);
    });

    it('should call cleanup on unregistration', async () => {
      const extractor = new InitializeMockExtractor();
      await registry.register(extractor);
      
      await registry.unregister('init_mock');
      
      expect(extractor.cleanupCalled).toBe(true);
    });
  });

  describe('Initialization', () => {
    it('should initialize extractors with initialize method', async () => {
      const extractor = new InitializeMockExtractor();
      await registry.register(extractor);
      
      await registry.initialize(mockEnv);
      
      expect(extractor.initializeCalled).toBe(true);
    });

    it('should handle extractors without initialize method', async () => {
      const extractor = new FastMockExtractor();
      await registry.register(extractor);
      
      await expect(registry.initialize(mockEnv)).resolves.not.toThrow();
    });
  });

  describe('Execution', () => {
    it('should execute single extractor successfully', async () => {
      const extractor = new FastMockExtractor();
      await registry.register(extractor);
      
      const result = await registry.execute(mockLifelogs, mockEnv);
      
      expect(result.results).toHaveLength(1);
      expect(result.results[0].extractorId).toBe('fast_mock');
      expect(result.results[0].result.html).toBe('<div>Fast mock HTML</div>');
      expect(result.errors).toHaveLength(0);
      expect(result.summary.successCount).toBe(1);
      expect(result.summary.errorCount).toBe(0);
    });

    it('should execute multiple extractors in priority order', async () => {
      const fastExtractor = new FastMockExtractor(); // priority 100
      const slowExtractor = new SlowMockExtractor(); // priority 50
      
      await registry.register(fastExtractor);
      await registry.register(slowExtractor);
      
      const result = await registry.execute(mockLifelogs, mockEnv);
      
      expect(result.results).toHaveLength(2);
      // Fast extractor should be first due to higher priority
      expect(result.results[0].extractorId).toBe('fast_mock');
      expect(result.results[1].extractorId).toBe('slow_mock');
    });

    it('should skip disabled extractors', async () => {
      const extractor = new FastMockExtractor();
      await registry.register(extractor, { enabled: false, priority: 100 });
      
      const result = await registry.execute(mockLifelogs, mockEnv);
      
      expect(result.results).toHaveLength(0);
      expect(result.summary.disabledCount).toBe(1);
    });

    it('should handle extractor errors gracefully', async () => {
      const goodExtractor = new FastMockExtractor();
      const badExtractor = new ErrorMockExtractor();
      
      await registry.register(goodExtractor);
      await registry.register(badExtractor);
      
      const result = await registry.execute(mockLifelogs, mockEnv);
      
      expect(result.results).toHaveLength(1);
      expect(result.results[0].extractorId).toBe('fast_mock');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].extractorId).toBe('error_mock');
      expect(result.errors[0].message).toBe('Mock extractor error');
    });

    it('should measure total execution time', async () => {
      const extractor = new FastMockExtractor();
      await registry.register(extractor);
      
      const result = await registry.execute(mockLifelogs, mockEnv);
      
      expect(result.summary.totalTime).toBeGreaterThan(0);
    });

    it('should provide execution summary', async () => {
      const goodExtractor = new FastMockExtractor();
      const badExtractor = new ErrorMockExtractor();
      const disabledExtractor = new SlowMockExtractor();
      
      await registry.register(goodExtractor);
      await registry.register(badExtractor);
      await registry.register(disabledExtractor, { enabled: false, priority: 100 });
      
      const result = await registry.execute(mockLifelogs, mockEnv);
      
      expect(result.summary).toEqual({
        totalTime: expect.any(Number),
        totalExtractors: 3,
        successCount: 1,
        errorCount: 1,
        disabledCount: 1
      });
    });
  });

  describe('Configuration Management', () => {
    it('should update extractor configuration', async () => {
      const extractor = new FastMockExtractor();
      await registry.register(extractor);
      
      await registry.updateConfig('fast_mock', { enabled: false, priority: 200 });
      
      const registered = registry.getExtractor('fast_mock');
      expect(registered?.config.enabled).toBe(false);
      expect(registered?.config.priority).toBe(200);
    });

    it('should reject invalid configuration updates', async () => {
      const extractor = new ConfigValidationExtractor();
      await registry.register(extractor, { 
        enabled: true, 
        priority: 100, 
        settings: { requiredSetting: 'value' } 
      });
      
      await expect(
        registry.updateConfig('config_validation', { settings: {} })
      ).rejects.toThrow('Invalid configuration: requiredSetting is required');
    });

    it('should throw error for non-existent extractor', async () => {
      await expect(
        registry.updateConfig('non_existent', { enabled: false })
      ).rejects.toThrow("Extractor 'non_existent' not found");
    });
  });

  describe('Registry Management', () => {
    it('should clear all extractors', async () => {
      const extractor1 = new FastMockExtractor();
      const extractor2 = new InitializeMockExtractor();
      
      await registry.register(extractor1);
      await registry.register(extractor2);
      
      await registry.clear();
      
      expect(registry.getRegisteredExtractors()).toHaveLength(0);
      expect(extractor2.cleanupCalled).toBe(true);
    });

    it('should get registered extractors info', async () => {
      const extractor = new FastMockExtractor();
      await registry.register(extractor, { enabled: false, priority: 200 });
      
      const registered = registry.getRegisteredExtractors();
      
      expect(registered).toHaveLength(1);
      expect(registered[0]).toEqual({
        id: 'fast_mock',
        name: 'Fast Mock Extractor',
        description: 'A fast mock extractor for testing',
        version: '1.0.0',
        config: {
          enabled: false,
          priority: 200,
          settings: {}
        },
        initialized: false,
        registeredAt: expect.any(Date)
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization errors', async () => {
      const extractor = new InitializeMockExtractor();
      extractor.initialize = jest.fn().mockRejectedValue(new Error('Init failed'));
      
      await registry.register(extractor);
      
      await expect(registry.initialize(mockEnv)).rejects.toThrow('Init failed');
    });

    it('should handle cleanup errors gracefully', async () => {
      const extractor = new InitializeMockExtractor();
      extractor.cleanup = jest.fn().mockRejectedValue(new Error('Cleanup failed'));
      
      await registry.register(extractor);
      
      // Should not throw, just log warning
      await expect(registry.unregister('init_mock')).resolves.toBe(true);
    });
  });

  describe('Registry with Custom Configuration', () => {
    it('should respect maxConcurrency setting', async () => {
      const limitedRegistry = new ExtractorRegistry({ maxConcurrency: 1 });
      
      const extractor1 = new FastMockExtractor();
      const extractor2 = new SlowMockExtractor();
      
      await limitedRegistry.register(extractor1);
      await limitedRegistry.register(extractor2);
      
      const startTime = Date.now();
      const result = await limitedRegistry.execute(mockLifelogs, mockEnv);
      const duration = Date.now() - startTime;
      
      expect(result.results).toHaveLength(2);
      // With maxConcurrency: 1, execution should be sequential
      // so total time should be roughly the sum of individual times
      expect(duration).toBeGreaterThan(50); // 10ms + 50ms + overhead
    });

    it('should respect continueOnError: false', async () => {
      const strictRegistry = new ExtractorRegistry({ continueOnError: false });
      
      const goodExtractor = new FastMockExtractor();
      const badExtractor = new ErrorMockExtractor();
      
      await strictRegistry.register(goodExtractor);
      await strictRegistry.register(badExtractor);
      
      await expect(strictRegistry.execute(mockLifelogs, mockEnv)).rejects.toThrow();
    });
  });
});