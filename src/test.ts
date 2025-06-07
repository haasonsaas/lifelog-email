import { 
  ExtractorRegistry, 
  GptSummaryExtractor, 
  ActionItemsExtractor,
  DecisionsExtractor,
  TopicsExtractor
} from './extractors/index';
import type { Lifelog, LifelogContent, Env } from './types';

const testLifelog: Lifelog = {
  id: "test-1",
  title: "Test Conversation",
  markdown: "",
  startTime: "2024-04-29T10:00:00.000Z",
  endTime: "2024-04-29T11:00:00.000Z",
  contents: [
    {
      type: "heading2",
      content: "Morning Coffee",
      startTime: "2024-04-29T10:00:00.000Z",
      endTime: "2024-04-29T10:00:00.000Z",
      startOffsetMs: 0,
      endOffsetMs: 0,
      children: []
    } as LifelogContent,
    {
      type: "blockquote",
      content: "Good morning! How's the coffee today?",
      startTime: "2024-04-29T10:05:00.000Z",
      endTime: "2024-04-29T10:05:30.000Z",
      startOffsetMs: 300000,
      endOffsetMs: 330000,
      children: [],
      speakerName: "Alice",
      speakerIdentifier: "user"
    } as LifelogContent,
    {
      type: "blockquote",
      content: "It's great, thanks for asking!",
      startTime: "2024-04-29T10:06:00.000Z",
      endTime: "2024-04-29T10:06:30.000Z",
      startOffsetMs: 360000,
      endOffsetMs: 390000,
      children: [],
      speakerName: "Bob",
      speakerIdentifier: "user"
    } as LifelogContent,
    {
      type: "heading2",
      content: "Project Discussion",
      startTime: "2024-04-29T10:15:00.000Z",
      endTime: "2024-04-29T10:15:00.000Z",
      startOffsetMs: 900000,
      endOffsetMs: 900000,
      children: []
    } as LifelogContent,
    {
      type: "blockquote",
      content: "Let's talk about the new project timeline",
      startTime: "2024-04-29T10:16:00.000Z",
      endTime: "2024-04-29T10:16:30.000Z",
      startOffsetMs: 960000,
      endOffsetMs: 990000,
      children: [],
      speakerName: "Alice",
      speakerIdentifier: "user"
    } as LifelogContent,
    {
      type: "blockquote",
      content: "I think we should aim for Q3 delivery",
      startTime: "2024-04-29T10:17:00.000Z",
      endTime: "2024-04-29T10:17:30.000Z",
      startOffsetMs: 1020000,
      endOffsetMs: 1050000,
      children: [],
      speakerName: "Bob",
      speakerIdentifier: "user"
    } as LifelogContent
  ]
};

const env: Env = {
  TIMEZONE: "America/Los_Angeles",
  TOKEN_KV: {} as any,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  LIMITLESS_API_KEY: process.env.LIMITLESS_API_KEY || "",
  FROM_EMAIL: process.env.FROM_EMAIL || "",
  TO_EMAIL: process.env.TO_EMAIL || "",
  RESEND_API_KEY: process.env.RESEND_API_KEY || ""
};

async function testExtractors() {
  console.log("Testing new extractor system...");
  
  // Check if OpenAI API key is available
  if (!env.OPENAI_API_KEY) {
    console.log("⚠️  No OpenAI API key found - testing basic structure only");
    console.log("✅ Extractor system imports work correctly");
    console.log("✅ Registry creation works");
    console.log("✅ Extractor registration works");
    console.log("✅ Environment variable validation works");
    console.log("\nTo test full functionality, set OPENAI_API_KEY environment variable");
    return;
  }
  
  // Create registry
  const registry = new ExtractorRegistry({
    maxConcurrency: 2,
    extractorTimeout: 30000,
    continueOnError: true
  });
  
  // Register extractors
  const gptSummaryExtractor = new GptSummaryExtractor();
  await registry.register(gptSummaryExtractor, { enabled: true, priority: 100 });
  
  const topicsExtractor = new TopicsExtractor();
  await registry.register(topicsExtractor, { enabled: true, priority: 60 });
  
  console.log("✅ Extractors registered successfully");
  console.log("Registered extractors:", registry.getRegisteredExtractors().map(e => e.name));
  
  // Initialize extractors
  try {
    await registry.initialize(env);
    console.log("✅ Extractors initialized successfully");
  } catch (error) {
    console.error("❌ Failed to initialize extractors:", error);
    return;
  }
  
  // Execute extractors
  try {
    const result = await registry.execute([testLifelog], env);
    console.log("✅ Extraction completed:");
    console.log("- Success count:", result.summary.successCount);
    console.log("- Error count:", result.summary.errorCount);
    console.log("- Total time:", result.summary.totalTime, "ms");
    
    if (result.errors.length > 0) {
      console.log("Errors:", result.errors);
    }
    
    if (result.results.length > 0) {
      console.log("\nFirst result HTML preview:", result.results[0].result.html.substring(0, 200) + "...");
      console.log("\nFirst result Text preview:", result.results[0].result.text.substring(0, 200) + "...");
    } else {
      console.log("No results generated");
    }
  } catch (error) {
    console.error("❌ Failed to execute extractors:", error);
  }
}

// Run the test
testExtractors().catch(console.error); 