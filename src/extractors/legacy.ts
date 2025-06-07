/**
 * Legacy extractor functions for backwards compatibility.
 * These functions wrap the new extractor system to maintain API compatibility.
 * 
 * @deprecated Use the new ExtractorRegistry system instead
 */

import type { Env, Lifelog } from "../types";
import { GptSummaryExtractor } from "./implementations/gpt-summary.extractor";

/**
 * Legacy gpt_summary function for backwards compatibility.
 * @deprecated Use GptSummaryExtractor class instead
 */
export async function gpt_summary(lifelogs: Lifelog[], env: Env): Promise<{ html: string; text: string }> {
  const extractor = new GptSummaryExtractor();
  await extractor.initialize(env);
  
  const result = await extractor.extract(lifelogs, env);
  
  return {
    html: result.html,
    text: result.text
  };
}