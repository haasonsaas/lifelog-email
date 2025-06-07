# Topics Extractor Example Usage

This document demonstrates how to use the topics extractor with sample conversation scenarios.

## Basic Usage

```typescript
import { extractTopics, formatTopicsAsHtml, formatTopicsAsText } from './src/extractors/core/topics';
import type { Lifelog, Env } from './src/types';

// Sample lifelog with conversation data
const sampleLifelogs: Lifelog[] = [
  {
    id: "team-meeting-1",
    title: "Weekly Team Meeting",
    startTime: "2024-03-20T09:00:00Z",
    endTime: "2024-03-20T10:30:00Z",
    markdown: "",
    contents: [
      // ... conversation content
    ]
  }
];

// Environment configuration
const env: Env = {
  OPENAI_API_KEY: "your-openai-api-key",
  TIMEZONE: "America/Los_Angeles",
  // ... other env vars
};

// Extract topics
const result = await extractTopics(sampleLifelogs, env);

// Format for email
const htmlOutput = formatTopicsAsHtml(result);
const textOutput = formatTopicsAsText(result);
```

## Sample Output Structure

### Topics Analysis Result

```typescript
{
  topics: [
    {
      topic: "Product Strategy Planning",
      description: "Discussion about Q2 product roadmap and market positioning",
      durationMinutes: 35,
      startTime: "2024-03-20T09:00:00Z",
      endTime: "2024-03-20T09:35:00Z",
      importance: 5,
      engagement: "high",
      participants: ["Product Manager", "CEO", "Engineering Lead"],
      keywords: ["strategy", "roadmap", "Q2", "positioning"],
      source: "Weekly Team Meeting",
      relatedTopics: ["Technical Architecture"],
      category: "strategic",
      isRecurring: false,
      confidence: "high"
    },
    {
      topic: "Technical Debt Discussion",
      description: "Reviewing technical debt items and prioritization",
      durationMinutes: 20,
      startTime: "2024-03-20T09:35:00Z",
      endTime: "2024-03-20T09:55:00Z",
      importance: 3,
      engagement: "medium",
      participants: ["Engineering Lead", "Senior Developers"],
      keywords: ["technical debt", "refactoring", "priority"],
      source: "Weekly Team Meeting",
      relatedTopics: ["Product Strategy"],
      category: "technical",
      isRecurring: true,
      confidence: "high"
    }
  ],
  transitions: [
    {
      fromTopic: "Product Strategy Planning",
      toTopic: "Technical Debt Discussion",
      transitionTime: "2024-03-20T09:35:00Z",
      transitionType: "natural",
      source: "Weekly Team Meeting"
    }
  ],
  summary: {
    totalTopics: 2,
    totalDiscussionTime: 55,
    averageTopicDuration: 28,
    mostImportantTopic: "Product Strategy Planning",
    longestTopic: "Product Strategy Planning",
    mostEngagingTopic: "Product Strategy Planning",
    topicsByCategory: { strategic: 1, technical: 1 },
    recurringTopics: 1,
    uniqueTopics: 1
  },
  timeAnalysis: {
    timeByCategory: { strategic: 35, technical: 20 },
    timeByImportance: { 5: 35, 3: 20 },
    peakDiscussionHours: ["9:00"],
    longRunningTopics: ["Product Strategy Planning"],
    highImpactBriefTopics: []
  },
  trends: {
    frequentTopics: ["Technical Debt Discussion"],
    growingTopics: [],
    newTopics: ["Product Strategy Planning"],
    hotTopics: ["Product Strategy Planning"]
  }
}
```

## Key Features

### 🎯 Topic Categories
- **strategic**: Business direction, long-term planning
- **work**: Regular business tasks and operations
- **technical**: Technology discussions, architecture
- **social**: Team building, casual conversations
- **learning**: Skill development, knowledge sharing
- **planning**: Scheduling, coordination
- **creative**: Brainstorming, innovation
- **operational**: Day-to-day processes
- **personal**: Life updates, non-work topics
- **other**: Miscellaneous topics

### ⏰ Time Tracking
- Estimated duration for each topic
- Time allocation by category
- Peak discussion hours
- Long-running vs brief topics
- High-impact brief discussions

### 📊 Engagement Analysis
- **Low**: Routine updates, information sharing
- **Medium**: Standard discussions with participation
- **High**: Animated debates, excited planning

### 🔄 Recurring Topics
- Identifies topics that appear regularly
- Tracks new vs recurring discussions
- Helps identify patterns in team focus

### 🎪 Importance Scoring (1-5)
- **1**: Casual mentions, small talk
- **2**: Standard work discussions
- **3**: Significant work topics
- **4**: High-impact discussions
- **5**: Critical decisions, major announcements

### 🔗 Topic Relationships
- Tracks topic transitions
- Identifies related topics
- Maps conversation flow

## Example Conversation Scenarios

### 1. Strategic Planning Session
**Expected Output:**
- High importance (4-5)
- Strategic category
- High engagement
- Long duration (30+ minutes)
- Keywords: strategy, planning, roadmap, vision

### 2. Daily Standup
**Expected Output:**
- Medium importance (2-3)
- Work category
- Low-medium engagement
- Short duration (10-20 minutes)
- Recurring topic
- Keywords: status, updates, blockers

### 3. Technical Architecture Review
**Expected Output:**
- High importance (4)
- Technical category
- High engagement
- Medium-long duration (20-45 minutes)
- Keywords: architecture, design, scalability

### 4. Team Social Hour
**Expected Output:**
- Low importance (1-2)
- Social category
- Medium engagement
- Variable duration
- Keywords: team, social, personal

### 5. Learning & Development Discussion
**Expected Output:**
- Medium importance (2-3)
- Learning category
- Medium-high engagement
- Keywords: learning, skills, training, growth

## Integration with Email System

The topics extractor integrates seamlessly with the existing email digest system:

```typescript
// In extractors.ts
export async function conversation_topics(lifelogs: Lifelog[], env: Env): Promise<{ html: string; text: string }> {
  const result = await extractTopics(lifelogs, env);
  
  return {
    html: formatTopicsAsHtml(result),
    text: formatTopicsAsText(result)
  };
}
```

This provides both HTML and plain text versions for email compatibility, following the same pattern as other extractors in the system.