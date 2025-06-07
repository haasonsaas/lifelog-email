/**
 * Extractor registry system for managing and executing multiple extractors.
 * Provides dynamic loading, configuration management, and parallel execution.
 */

import type { Env, Lifelog } from "../../types";
import type { 
  BaseExtractor, 
  ExtractorConfig, 
  ExtractorResult, 
  ExtractorError
} from "./extractor.interface";
import { isBaseExtractor } from "./extractor.interface";

/**
 * Configuration for the registry system itself.
 */
export interface RegistryConfig {
  /** Maximum parallel execution of extractors */
  maxConcurrency: number;
  /** Timeout in milliseconds for individual extractor execution */
  extractorTimeout: number;
  /** Whether to continue execution if some extractors fail */
  continueOnError: boolean;
  /** Global configuration overrides for all extractors */
  globalConfig?: Partial<ExtractorConfig>;
}

/**
 * Result from executing all registered extractors.
 */
export interface RegistryExecutionResult {
  /** Successfully executed extractor results */
  results: Array<{
    extractorId: string;
    result: ExtractorResult;
  }>;
  /** Errors from failed extractors */
  errors: ExtractorError[];
  /** Execution summary */
  summary: {
    /** Total execution time in milliseconds */
    totalTime: number;
    /** Number of extractors executed */
    totalExtractors: number;
    /** Number of successful executions */
    successCount: number;
    /** Number of failed executions */
    errorCount: number;
    /** Number of disabled extractors */
    disabledCount: number;
  };
}

/**
 * Information about a registered extractor.
 */
export interface RegisteredExtractor {
  /** The extractor instance */
  extractor: BaseExtractor;
  /** Current configuration for this extractor */
  config: ExtractorConfig;
  /** Whether the extractor has been initialized */
  initialized: boolean;
  /** Registration timestamp */
  registeredAt: Date;
}

/**
 * Main registry class for managing extractors.
 */
export class ExtractorRegistry {
  private extractors = new Map<string, RegisteredExtractor>();
  private config: RegistryConfig;
  private initialized = false;

  constructor(config?: Partial<RegistryConfig>) {
    this.config = {
      maxConcurrency: 5,
      extractorTimeout: 30000, // 30 seconds
      continueOnError: true,
      ...config
    };
  }

  /**
   * Register a new extractor with the registry.
   * @param extractor The extractor instance to register
   * @param config Optional configuration override
   * @throws Error if extractor is invalid or already registered
   */
  async register(extractor: BaseExtractor, config?: Partial<ExtractorConfig>): Promise<void> {
    if (!isBaseExtractor(extractor)) {
      throw new Error(`Invalid extractor: must implement BaseExtractor interface`);
    }

    if (this.extractors.has(extractor.id)) {
      throw new Error(`Extractor with id '${extractor.id}' is already registered`);
    }

    // Merge configurations
    const finalConfig: ExtractorConfig = {
      ...extractor.defaultConfig,
      ...this.config.globalConfig,
      ...config
    };

    // Validate configuration
    const validation = extractor.validateConfig(finalConfig);
    if (validation !== true) {
      throw new Error(`Invalid configuration for extractor '${extractor.id}': ${validation}`);
    }

    // Register the extractor
    const registered: RegisteredExtractor = {
      extractor,
      config: finalConfig,
      initialized: false,
      registeredAt: new Date()
    };

    this.extractors.set(extractor.id, registered);
  }

  /**
   * Unregister an extractor from the registry.
   * @param extractorId The ID of the extractor to unregister
   * @returns true if extractor was found and removed, false otherwise
   */
  async unregister(extractorId: string): Promise<boolean> {
    const registered = this.extractors.get(extractorId);
    if (!registered) {
      return false;
    }

    // Call cleanup if available
    if (registered.extractor.cleanup) {
      try {
        await registered.extractor.cleanup();
      } catch (error) {
        console.warn(`Error during cleanup for extractor '${extractorId}':`, error);
      }
    }

    return this.extractors.delete(extractorId);
  }

  /**
   * Initialize all registered extractors.
   * @param env Environment variables
   */
  async initialize(env: Env): Promise<void> {
    const initPromises = Array.from(this.extractors.values()).map(async (registered) => {
      if (registered.extractor.initialize && !registered.initialized) {
        try {
          await registered.extractor.initialize(env);
          registered.initialized = true;
        } catch (error) {
          console.error(`Failed to initialize extractor '${registered.extractor.id}':`, error);
          throw error;
        }
      }
    });

    await Promise.all(initPromises);
    this.initialized = true;
  }

  /**
   * Execute all enabled extractors on the provided lifelog data.
   * @param lifelogs Array of lifelog entries to process
   * @param env Environment variables
   * @returns Promise resolving to execution results
   */
  async execute(lifelogs: Lifelog[], env: Env): Promise<RegistryExecutionResult> {
    if (!this.initialized) {
      await this.initialize(env);
    }

    const startTime = Date.now();
    const results: Array<{ extractorId: string; result: ExtractorResult }> = [];
    const errors: ExtractorError[] = [];

    // Get enabled extractors sorted by priority (highest first)
    const enabledExtractors = Array.from(this.extractors.values())
      .filter(registered => registered.config.enabled)
      .sort((a, b) => b.config.priority - a.config.priority);

    const disabledCount = this.extractors.size - enabledExtractors.length;

    // Execute extractors with concurrency control
    const executeExtractor = async (registered: RegisteredExtractor): Promise<void> => {
      const { extractor, config } = registered;
      
      try {
        const result = await this.executeWithTimeout(
          () => extractor.extract(lifelogs, env, config),
          this.config.extractorTimeout
        );
        
        results.push({
          extractorId: extractor.id,
          result
        });
      } catch (error) {
        const extractorError: ExtractorError = {
          extractorId: extractor.id,
          message: error instanceof Error ? error.message : 'Unknown error',
          originalError: error instanceof Error ? error : undefined,
          context: {
            logCount: lifelogs.length,
            timestamp: new Date().toISOString()
          }
        };
        
        errors.push(extractorError);
        
        if (!this.config.continueOnError) {
          throw error;
        }
      }
    };

    // Execute with concurrency control
    await this.executeConcurrently(
      enabledExtractors.map(registered => () => executeExtractor(registered)),
      this.config.maxConcurrency
    );

    const totalTime = Date.now() - startTime;

    return {
      results,
      errors,
      summary: {
        totalTime,
        totalExtractors: this.extractors.size,
        successCount: results.length,
        errorCount: errors.length,
        disabledCount
      }
    };
  }

  /**
   * Get information about all registered extractors.
   */
  getRegisteredExtractors(): Array<{
    id: string;
    name: string;
    description: string;
    version: string;
    config: ExtractorConfig;
    initialized: boolean;
    registeredAt: Date;
  }> {
    return Array.from(this.extractors.values()).map(registered => ({
      id: registered.extractor.id,
      name: registered.extractor.name,
      description: registered.extractor.description,
      version: registered.extractor.version,
      config: registered.config,
      initialized: registered.initialized,
      registeredAt: registered.registeredAt
    }));
  }

  /**
   * Get a specific registered extractor.
   */
  getExtractor(extractorId: string): RegisteredExtractor | undefined {
    return this.extractors.get(extractorId);
  }

  /**
   * Update configuration for a registered extractor.
   */
  async updateConfig(extractorId: string, config: Partial<ExtractorConfig>): Promise<void> {
    const registered = this.extractors.get(extractorId);
    if (!registered) {
      throw new Error(`Extractor '${extractorId}' not found`);
    }

    const newConfig = { ...registered.config, ...config };
    const validation = registered.extractor.validateConfig(newConfig);
    if (validation !== true) {
      throw new Error(`Invalid configuration: ${validation}`);
    }

    registered.config = newConfig;
  }

  /**
   * Clear all registered extractors and perform cleanup.
   */
  async clear(): Promise<void> {
    const cleanupPromises = Array.from(this.extractors.values()).map(async (registered) => {
      if (registered.extractor.cleanup) {
        try {
          await registered.extractor.cleanup();
        } catch (error) {
          console.warn(`Error during cleanup for extractor '${registered.extractor.id}':`, error);
        }
      }
    });

    await Promise.all(cleanupPromises);
    this.extractors.clear();
    this.initialized = false;
  }

  /**
   * Execute a function with timeout.
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>, 
    timeoutMs: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      fn()
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Execute functions with concurrency control.
   */
  private async executeConcurrently<T>(
    tasks: Array<() => Promise<T>>, 
    maxConcurrency: number
  ): Promise<T[]> {
    const results: T[] = [];
    const executing = new Set<Promise<void>>();

    for (const task of tasks) {
      const promise = task().then(result => {
        results.push(result);
      }).finally(() => {
        executing.delete(promise);
      });
      
      executing.add(promise);

      if (executing.size >= maxConcurrency) {
        // Wait for at least one promise to complete
        await Promise.race(executing);
      }
    }

    // Wait for all remaining promises to complete
    await Promise.all(executing);
    return results;
  }
}

/**
 * Default global registry instance.
 * Can be used throughout the application for a singleton pattern.
 */
export const defaultRegistry = new ExtractorRegistry();