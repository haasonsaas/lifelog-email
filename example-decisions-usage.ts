/**
 * Example usage of the decisions extractor
 * This demonstrates how to integrate the decisions extractor into your Cloudflare Worker
 */

import { extractDecisions, formatDecisionsAsHtml, formatDecisionsAsText } from './src/extractors/core/decisions';
import type { Lifelog, Env } from './src/types';

// Example function showing how to use the decisions extractor in your email workflow
export async function generateEmailWithDecisions(lifelogs: Lifelog[], env: Env) {
  try {
    // Extract decisions from the conversations
    const decisionsResult = await extractDecisions(lifelogs, env);
    
    // Format for email
    const decisionsHtml = formatDecisionsAsHtml(decisionsResult);
    const decisionsText = formatDecisionsAsText(decisionsResult);
    
    // Log some metrics
    console.log(`Processed ${decisionsResult.metadata.processedConversations} conversations`);
    console.log(`Found ${decisionsResult.summary.totalDecisions} total decisions:`);
    console.log(`- Strategic: ${decisionsResult.summary.strategicDecisions}`);
    console.log(`- Project: ${decisionsResult.summary.projectDecisions}`);
    console.log(`- Local: ${decisionsResult.summary.localDecisions}`);
    
    // Return formatted content for email
    return {
      html: decisionsHtml,
      text: decisionsText,
      metrics: decisionsResult.summary,
      decisions: decisionsResult.decisions
    };
    
  } catch (error) {
    console.error('Error extracting decisions:', error);
    return {
      html: '<h3>Key Decisions</h3><p><em>Error extracting decisions from conversations.</em></p>',
      text: 'Key Decisions\n\nError extracting decisions from conversations.',
      metrics: { totalDecisions: 0, strategicDecisions: 0, projectDecisions: 0, localDecisions: 0 },
      decisions: []
    };
  }
}

// Example decision scenarios for testing
export const exampleDecisionScenarios = {
  strategicDecision: {
    conversation: "Board Meeting",
    content: "After reviewing the market analysis and quarterly results, we've decided to pivot our product strategy towards enterprise customers. The consumer market isn't showing the growth we need.",
    expectedDecision: {
      scope: "strategic",
      decision: "Pivot product strategy towards enterprise customers",
      context: "Market analysis showed insufficient growth in consumer segment"
    }
  },
  
  projectDecision: {
    conversation: "Technical Planning",
    content: "We evaluated React, Vue, and Angular for the frontend rewrite. After considering team expertise and ecosystem maturity, we've chosen React for the implementation.",
    expectedDecision: {
      scope: "project", 
      decision: "Choose React for frontend rewrite",
      context: "Team expertise and ecosystem maturity were key factors"
    }
  },
  
  localDecision: {
    conversation: "Sprint Planning",
    content: "Given the scope creep we've seen this week, I've decided to extend the current sprint by one week to accommodate the new requirements.",
    expectedDecision: {
      scope: "local",
      decision: "Extend current sprint by one week", 
      context: "Accommodate scope creep and new requirements"
    }
  },
  
  noDecision: {
    conversation: "Brainstorming Session",
    content: "We should consider using microservices architecture. What do you think about the complexity? Maybe we could explore this further next quarter.",
    expectedDecision: null // No actual decision made
  }
};

// Example integration with existing email generation
export async function integrateWithExistingEmailSystem(lifelogs: Lifelog[], env: Env) {
  // You can use decisions extractor alongside existing extractors
  const [
    summaryResult,
    decisionsResult
  ] = await Promise.all([
    // Assuming you have existing extractors
    // gpt_summary(lifelogs, env),
    extractDecisions(lifelogs, env)
  ]);
  
  // Combine the results into a comprehensive email
  const emailContent = {
    html: `
      <!-- Existing summary content would go here -->
      
      <!-- Add decisions section -->
      ${formatDecisionsAsHtml(decisionsResult)}
      
      <!-- Other sections... -->
    `,
    text: `
      // Existing summary content would go here
      
      ${formatDecisionsAsText(decisionsResult)}
      
      // Other sections...
    `
  };
  
  return emailContent;
}