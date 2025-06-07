# Extractor Plugin Architecture

This directory contains the multi-extractor plugin architecture for processing lifelog conversations and generating email digest content.

## Overview

The extractor system is designed to support multiple extractors that can process lifelog data in parallel and return structured output. Each extractor implements a common interface, allowing for easy addition of new extractors without modifying core system logic.

## Architecture

### Core Components

1. **BaseExtractor Interface** (`base/extractor.interface.ts`)
   - Defines the contract all extractors must implement
   - Provides abstract base class with common utilities
   - Includes type guards for runtime validation

2. **ExtractorRegistry** (`base/extractor.registry.ts`)
   - Manages registration and execution of multiple extractors
   - Supports parallel execution with configurable concurrency
   - Handles errors gracefully with individual extractor failure isolation
   - Provides configuration management and validation

3. **Concrete Implementations** (`implementations/`)
   - Individual extractor implementations
   - Currently includes: GPT Summary extractor

### Directory Structure

```
src/extractors/
├── README.md                                    # This documentation
├── index.ts                                     # Main exports
├── legacy.ts                                    # Backwards compatibility
├── base/
│   ├── extractor.interface.ts                  # Base interface and abstract class
│   ├── extractor.interface.test.ts             # Interface tests
│   ├── extractor.registry.ts                   # Registry system
│   └── extractor.registry.test.ts              # Registry tests
└── implementations/
    ├── gpt-summary.extractor.ts                # GPT Summary implementation
    └── gpt-summary.extractor.test.ts           # GPT Summary tests
```

## Key Features

### 1. Plugin Architecture
- **Modular Design**: Each extractor is self-contained with its own configuration
- **Dynamic Loading**: Extractors can be registered at runtime
- **Type Safety**: Full TypeScript support with compile-time validation

### 2. Configuration Management
- **Per-Extractor Config**: Each extractor has its own settings
- **Priority System**: Control execution order with priority values
- **Enable/Disable**: Turn extractors on/off without code changes
- **Validation**: Built-in configuration validation for each extractor

### 3. Parallel Execution
- **Concurrent Processing**: Multiple extractors run simultaneously
- **Configurable Concurrency**: Control max parallel executions
- **Timeout Protection**: Prevent hanging extractors from blocking others
- **Error Isolation**: Failed extractors don't affect others

### 4. Error Handling
- **Graceful Degradation**: System continues working if some extractors fail
- **Structured Errors**: Detailed error information for debugging
- **Monitoring Support**: Execution summaries and metrics

### 5. Extensibility
- **Easy to Add**: New extractors implement BaseExtractor interface
- **Custom Validation**: Each extractor can define its own config rules
- **Initialization/Cleanup**: Optional setup and teardown hooks
- **Metadata Support**: Rich result metadata for debugging and monitoring

## Usage Examples

### Basic Setup

```typescript
import { ExtractorRegistry, GptSummaryExtractor } from './extractors';

// Create registry
const registry = new ExtractorRegistry({
  maxConcurrency: 3,
  extractorTimeout: 60000,
  continueOnError: true
});

// Register extractors
const gptSummary = new GptSummaryExtractor();
await registry.register(gptSummary);

// Initialize all extractors
await registry.initialize(env);

// Execute on lifelog data
const result = await registry.execute(lifelogs, env);
```

### Custom Extractor

```typescript
import { AbstractExtractor, type ExtractorConfig, type ExtractorResult } from './base/extractor.interface';

class MyCustomExtractor extends AbstractExtractor {
  readonly id = 'my_custom';
  readonly name = 'My Custom Extractor';
  readonly description = 'Does something custom with lifelogs';
  readonly version = '1.0.0';

  async extract(lifelogs: Lifelog[], env: Env, config?: ExtractorConfig): Promise<ExtractorResult> {
    // Your custom logic here
    return {
      html: '<div>Custom HTML</div>',
      text: 'Custom text',
      metadata: {
        processingTime: 100,
        logCount: lifelogs.length
      }
    };
  }
}

// Register and use
await registry.register(new MyCustomExtractor());
```

### Configuration

```typescript
// Register with custom configuration
await registry.register(extractor, {
  enabled: true,
  priority: 150,
  settings: {
    model: 'gpt-4o',
    maxTokens: 1000,
    customSetting: 'value'
  }
});

// Update configuration later
await registry.updateConfig('extractor_id', {
  enabled: false,
  priority: 50
});
```

## Current Extractors

### GPT Summary Extractor
- **ID**: `gpt_summary`
- **Purpose**: Generates AI-powered conversation summaries using OpenAI's GPT model
- **Configuration**: Model selection, token limits, temperature control
- **Requirements**: OpenAI API key in environment

## Adding New Extractors

1. **Create Implementation**: Extend `AbstractExtractor` or implement `BaseExtractor`
2. **Add Configuration**: Define extractor-specific settings interface
3. **Implement Extract Method**: Process lifelogs and return structured result
4. **Add Validation**: Implement custom configuration validation if needed
5. **Write Tests**: Create comprehensive unit tests
6. **Register**: Add to registry in main application

## Testing

The extractor system includes comprehensive unit tests:

- **Interface Tests**: Validate base interface and abstract class functionality
- **Registry Tests**: Test registration, execution, and error handling
- **Implementation Tests**: Test individual extractor behavior
- **Integration Tests**: End-to-end testing with real data

Run tests with:
```bash
npm test src/extractors/
```

## Migration from Legacy System

The new architecture maintains backwards compatibility:

1. **Legacy Function**: `gpt_summary()` function still available in `legacy.ts`
2. **Gradual Migration**: Can migrate extractors one by one
3. **Same Interface**: Results have the same `{ html, text }` structure
4. **Enhanced Features**: New system adds error handling, metadata, and parallel execution

## Future Enhancements

Planned improvements:
- **Result Aggregation**: Combine results from multiple extractors
- **Caching**: Cache extractor results for performance
- **Metrics**: Detailed performance and usage metrics
- **Configuration UI**: Web interface for managing extractor settings
- **Hot Reloading**: Dynamic reloading of extractor implementations