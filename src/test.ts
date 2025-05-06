import { conversation_topics } from './extractors';
import type { Lifelog, LifelogContent } from './types';

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

const env = {
  TIMEZONE: "America/Los_Angeles",
  TOKEN_KV: {} as any,
  OPENAI_API_KEY: "",
  LIMITLESS_API_KEY: "",
  FROM_EMAIL: "",
  TO_EMAIL: "",
  RESEND_API_KEY: ""
};

const result = conversation_topics([testLifelog], env);
console.log("HTML Output:", result.html);
console.log("Text Output:", result.text); 