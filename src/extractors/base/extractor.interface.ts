/**
 * Base extractor interface and types for the lifelog email digest system.
 * All extractors must implement this interface to be compatible with the registry system.
 */

import type { Env, Lifelog } from "../../types";

/**
 * Configuration interface for extractors.
 * Each extractor can define its own specific configuration by extending this interface.
 */
export interface ExtractorConfig {
  /** Whether this extractor is enabled */
  enabled: boolean;
  /** Priority level for execution order (higher numbers run first) */
  priority: number;
  /** Custom settings specific to each extractor */
  settings?: Record<string, any>;
}

/**
 * Result interface that all extractors must return.
 * Contains both HTML and plain text versions of the extracted content.
 */
export interface ExtractorResult {
  /** HTML formatted content for email */
  html: string;
  /** Plain text content for email fallback */
  text: string;
  /** Optional metadata about the extraction process */
  metadata?: {
    /** Processing time in milliseconds */
    processingTime?: number;
    /** Number of lifelogs processed */
    logCount?: number;
    /** Any warnings or non-fatal errors */
    warnings?: string[];
    /** Custom metadata specific to the extractor */
    custom?: Record<string, any>;
  };
}

/**
 * Error interface for extractor failures.
 * Provides structured error information for debugging and monitoring.
 */
export interface ExtractorError {
  /** Unique identifier of the extractor that failed */
  extractorId: string;
  /** Human-readable error message */
  message: string;
  /** Original error object if available */
  originalError?: Error;
  /** Context information about the failure */
  context?: {
    /** Number of lifelogs being processed when error occurred */
    logCount?: number;
    /** Timestamp when error occurred */
    timestamp?: string;
    /** Additional context data */
    data?: Record<string, any>;
  };
}

/**
 * Base interface that all extractors must implement.
 * Provides a consistent contract for processing lifelog data.
 */
export interface BaseExtractor {
  /** Unique identifier for this extractor */
  readonly id: string;
  
  /** Human-readable name for this extractor */
  readonly name: string;
  
  /** Brief description of what this extractor does */
  readonly description: string;
  
  /** Version of this extractor for tracking compatibility */
  readonly version: string;
  
  /** Default configuration for this extractor */
  readonly defaultConfig: ExtractorConfig;
  
  /**
   * Main extraction method that processes lifelog data.
   * @param lifelogs Array of lifelog entries to process
   * @param env Environment variables and configuration
   * @param config Runtime configuration for this execution
   * @returns Promise resolving to extracted content
   * @throws ExtractorError if processing fails
   */
  extract(
    lifelogs: Lifelog[], 
    env: Env, 
    config?: ExtractorConfig
  ): Promise<ExtractorResult>;
  
  /**
   * Validates the configuration for this extractor.
   * @param config Configuration to validate
   * @returns true if config is valid, string error message if invalid
   */
  validateConfig(config: ExtractorConfig): true | string;
  
  /**
   * Optional initialization method called when extractor is registered.
   * Can be used for setup tasks, validation, or resource allocation.
   * @param env Environment variables
   * @returns Promise that resolves when initialization is complete
   */
  initialize?(env: Env): Promise<void>;
  
  /**
   * Optional cleanup method called when extractor is unregistered.
   * Can be used for cleanup tasks or resource deallocation.
   * @returns Promise that resolves when cleanup is complete
   */
  cleanup?(): Promise<void>;
}

/**
 * Abstract base class that provides common functionality for extractors.
 * Implementers can extend this class to get default behavior and utilities.
 */
export abstract class AbstractExtractor implements BaseExtractor {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly version: string;
  
  /** Default configuration with sensible defaults */
  readonly defaultConfig: ExtractorConfig = {
    enabled: true,
    priority: 100,
    settings: {}
  };
  
  /**
   * Abstract method that must be implemented by concrete extractors.
   */
  abstract extract(
    lifelogs: Lifelog[], 
    env: Env, 
    config?: ExtractorConfig
  ): Promise<ExtractorResult>;
  
  /**
   * Basic configuration validation with common checks.
   * Can be overridden by concrete implementations for custom validation.
   */
  validateConfig(config: ExtractorConfig): true | string {
    if (typeof config.enabled !== 'boolean') {
      return 'enabled must be a boolean';
    }
    
    if (typeof config.priority !== 'number' || config.priority < 0) {
      return 'priority must be a non-negative number';
    }
    
    if (config.settings && typeof config.settings !== 'object') {
      return 'settings must be an object';
    }
    
    return true;
  }
  
  /**
   * Utility method to create a standardized error.
   */
  protected createError(
    message: string, 
    originalError?: Error, 
    context?: ExtractorError['context']
  ): ExtractorError {
    return {
      extractorId: this.id,
      message,
      originalError,
      context: {
        timestamp: new Date().toISOString(),
        ...context
      }
    };
  }
  
  /**
   * Utility method to measure execution time.
   */
  protected async measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; time: number }> {
    const start = Date.now();
    const result = await fn();
    const time = Date.now() - start;
    return { result, time };
  }
}

/**
 * Type guard to check if an object implements the BaseExtractor interface.
 */
export function isBaseExtractor(obj: any): obj is BaseExtractor {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.description === 'string' &&
    typeof obj.version === 'string' &&
    typeof obj.defaultConfig === 'object' &&
    typeof obj.extract === 'function' &&
    typeof obj.validateConfig === 'function'
  );
}