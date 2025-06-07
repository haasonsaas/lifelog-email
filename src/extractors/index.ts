/**
 * Main exports for the extractor system.
 * This file provides a clean interface for importing extractor functionality.
 */

// Base interfaces and registry
export * from "./base/extractor.interface";
export * from "./base/extractor.registry";

// Concrete implementations
export { GptSummaryExtractor, type GptSummaryConfig } from "./implementations/gpt-summary.extractor";
export { ActionItemsExtractor, type ActionItemsConfig } from "./implementations/action-items.extractor";
export { DecisionsExtractor, type DecisionsConfig } from "./implementations/decisions.extractor";
export { ContactsExtractor, type ContactsConfig } from "./implementations/contacts.extractor";
export { TopicsExtractor, type TopicsConfig } from "./implementations/topics.extractor";

// Legacy export for backwards compatibility (deprecated)
export { gpt_summary } from "./legacy";