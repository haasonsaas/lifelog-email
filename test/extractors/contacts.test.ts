import { test, expect, mock } from "bun:test";
import { contacts_extractor } from '../../src/extractors';
import type { Lifelog, Env } from '../../src/types';
import type { KVNamespace } from "@cloudflare/workers-types";

// Mock the OpenAI module with various response scenarios
const createMockOpenAI = (mockResponse: any) => ({
  default: class {
    constructor() {
      return {
        chat: {
          completions: {
            create: async () => ({
              choices: [{
                message: {
                  content: JSON.stringify(mockResponse)
                }
              }]
            })
          }
        }
      };
    }
  }
});

const mockEnv: Env = {
  OPENAI_API_KEY: 'test-key',
  TIMEZONE: 'America/Los_Angeles',
  TOKEN_KV: {
    get: async (key: string) => null,
    put: async () => {},
    delete: async () => {},
    list: async () => ({ keys: [], list_complete: true, cursor: "", cacheStatus: null }),
    getWithMetadata: async () => ({ value: null, metadata: null })
  } as unknown as KVNamespace,
  LIMITLESS_API_KEY: 'test-key',
  FROM_EMAIL: 'test@example.com',
  TO_EMAIL: 'test@example.com',
  RESEND_API_KEY: 'test-key'
};

test('contacts_extractor should identify new business contacts', async () => {
  const mockResponse = {
    contacts: [
      {
        name: "Sarah Johnson",
        relationship: "potential client",
        company: "TechCorp Inc",
        role: "VP of Engineering",
        email: "sarah.johnson@techcorp.com",
        phone: null,
        context: "Discussed potential partnership for Q1 project, very interested in our AI solutions",
        significance: "high",
        conversationTitle: "Client Meeting"
      },
      {
        name: "Mike Chen",
        relationship: "colleague",
        company: "TechCorp Inc", 
        role: "Senior Developer",
        email: null,
        phone: null,
        context: "Sarah's team member who would be technical point of contact",
        significance: "medium",
        conversationTitle: "Client Meeting"
      }
    ],
    summary: "Two new contacts from TechCorp meeting - strong potential partnership opportunity"
  };

  mock.module('openai', () => createMockOpenAI(mockResponse));

  const sampleLifelogs: Lifelog[] = [
    {
      id: "client-meeting-1",
      title: "Client Meeting",
      startTime: "2024-03-20T14:00:00Z",
      endTime: "2024-03-20T15:00:00Z",
      markdown: "",
      contents: [
        {
          type: "heading2",
          content: "Partnership Discussion",
          startTime: "2024-03-20T14:00:00Z",
          endTime: "2024-03-20T14:30:00Z",
          children: [
            {
              type: "blockquote",
              content: "I met with Sarah Johnson from TechCorp Inc today. She's their VP of Engineering and is very interested in our AI solutions for their Q1 project.",
              speakerName: "user",
              speakerIdentifier: "user",
              startTime: "2024-03-20T14:05:00Z"
            },
            {
              type: "blockquote",
              content: "Sarah mentioned that Mike Chen, one of their senior developers, would be the technical point of contact if we move forward. Her email is sarah.johnson@techcorp.com",
              speakerName: "user", 
              speakerIdentifier: "user",
              startTime: "2024-03-20T14:15:00Z"
            }
          ]
        }
      ]
    }
  ];

  const result = await contacts_extractor(sampleLifelogs, mockEnv);
  
  // Check that the result contains both HTML and text versions
  expect(result).toHaveProperty('html');
  expect(result).toHaveProperty('text');
  
  // Check that both contacts are present
  expect(result.text).toContain('Sarah Johnson');
  expect(result.text).toContain('Mike Chen');
  
  // Check contact details
  expect(result.text).toContain('potential client');
  expect(result.text).toContain('TechCorp Inc');
  expect(result.text).toContain('VP of Engineering');
  expect(result.text).toContain('sarah.johnson@techcorp.com');
  expect(result.text).toContain('high priority');
  
  // Check summary is included
  expect(result.text).toContain('Two new contacts from TechCorp meeting');
});

test('contacts_extractor should handle conversations with no significant contacts', async () => {
  const mockResponse = {
    contacts: [],
    summary: "No significant new contacts identified"
  };

  mock.module('openai', () => createMockOpenAI(mockResponse));

  const sampleLifelogs: Lifelog[] = [
    {
      id: "casual-chat-1",
      title: "Casual Chat",
      startTime: "2024-03-20T12:00:00Z",
      endTime: "2024-03-20T12:15:00Z",
      markdown: "",
      contents: [
        {
          type: "heading2",
          content: "Lunch Discussion",
          children: [
            {
              type: "blockquote",
              content: "Had lunch and mentioned I saw John at the grocery store yesterday. Nothing much to report.",
              speakerName: "user",
              speakerIdentifier: "user"
            }
          ]
        }
      ]
    }
  ];

  const result = await contacts_extractor(sampleLifelogs, mockEnv);
  
  expect(result.html).toContain('No significant new contacts identified');
  expect(result.text).toContain('No significant new contacts identified');
  expect(result.text).not.toContain('John'); // Should not include casual mentions
});

test('contacts_extractor should identify networking contacts', async () => {
  const mockResponse = {
    contacts: [
      {
        name: "Dr. Lisa Rodriguez",
        relationship: "conference speaker",
        company: "Stanford University",
        role: "Professor of AI Ethics",
        email: "lrodriguez@stanford.edu",
        phone: null,
        context: "Keynote speaker at AI conference, discussed collaboration on ethics research",
        significance: "high",
        conversationTitle: "AI Conference"
      },
      {
        name: "James Kim",
        relationship: "startup founder",
        company: "DataFlow AI",
        role: "CEO",
        email: null,
        phone: "+1-555-0199",
        context: "Fellow attendee, interested in partnership discussions",
        significance: "medium",
        conversationTitle: "AI Conference"
      }
    ],
    summary: "Met two valuable contacts at AI conference - research and business opportunities"
  };

  mock.module('openai', () => createMockOpenAI(mockResponse));

  const sampleLifelogs: Lifelog[] = [
    {
      id: "conference-1",
      title: "AI Conference",
      startTime: "2024-03-20T09:00:00Z",
      endTime: "2024-03-20T17:00:00Z",
      markdown: "",
      contents: [
        {
          type: "heading2",
          content: "Conference Networking",
          children: [
            {
              type: "blockquote",
              content: "Amazing keynote by Dr. Lisa Rodriguez from Stanford on AI Ethics. Got her email lrodriguez@stanford.edu and we discussed potential collaboration on research.",
              speakerName: "user",
              speakerIdentifier: "user"
            },
            {
              type: "blockquote", 
              content: "Also met James Kim, CEO of DataFlow AI startup. He's interested in partnerships. Got his phone +1-555-0199.",
              speakerName: "user",
              speakerIdentifier: "user"
            }
          ]
        }
      ]
    }
  ];

  const result = await contacts_extractor(sampleLifelogs, mockEnv);
  
  expect(result.text).toContain('Dr. Lisa Rodriguez');
  expect(result.text).toContain('James Kim');
  expect(result.text).toContain('Stanford University');
  expect(result.text).toContain('DataFlow AI');
  expect(result.text).toContain('lrodriguez@stanford.edu');
  expect(result.text).toContain('+1-555-0199');
  expect(result.text).toContain('research and business opportunities');
});

test('contacts_extractor should distinguish contact significance levels', async () => {
  const mockResponse = {
    contacts: [
      {
        name: "Emma Thompson",
        relationship: "strategic partner",
        company: "GlobalTech Solutions",
        role: "Chief Innovation Officer",
        email: "e.thompson@globaltech.com",
        phone: null,
        context: "Urgent partnership discussion for major enterprise deal worth $2M",
        significance: "high",
        conversationTitle: "Strategic Partnership Call"
      },
      {
        name: "Alex Rivera",
        relationship: "industry contact",
        company: "TechStartup Inc",
        role: "Marketing Director",
        email: null,
        phone: null,
        context: "Casual introduction at networking event, might collaborate on marketing",
        significance: "low",
        conversationTitle: "Networking Event"
      }
    ],
    summary: "Mix of high and low priority contacts - one urgent partnership, one casual networking"
  };

  mock.module('openai', () => createMockOpenAI(mockResponse));

  const sampleLifelogs: Lifelog[] = [
    {
      id: "mixed-contacts-1",
      title: "Mixed Contacts Day",
      startTime: "2024-03-20T09:00:00Z",
      endTime: "2024-03-20T18:00:00Z",
      markdown: "",
      contents: [
        {
          type: "heading2",
          content: "Business Meetings",
          children: [
            {
              type: "blockquote",
              content: "Critical call with Emma Thompson from GlobalTech Solutions. She's their Chief Innovation Officer and we're discussing a $2M enterprise partnership. Her email is e.thompson@globaltech.com",
              speakerName: "user",
              speakerIdentifier: "user"
            },
            {
              type: "blockquote",
              content: "Later at the networking event, briefly met Alex Rivera from TechStartup Inc. He's in marketing and mentioned possible collaboration.",
              speakerName: "user",
              speakerIdentifier: "user"
            }
          ]
        }
      ]
    }
  ];

  const result = await contacts_extractor(sampleLifelogs, mockEnv);
  
  // Check both contacts are present
  expect(result.text).toContain('Emma Thompson');
  expect(result.text).toContain('Alex Rivera');
  
  // Check significance indicators
  expect(result.text).toContain('Priority: high');
  expect(result.text).toContain('Priority: low');
  
  // Check the summary describes the mix
  expect(result.text).toContain('Mix of high and low priority contacts');
  
  // Check HTML has proper color coding for priorities
  expect(result.html).toContain('#4CAF50'); // High priority green
  expect(result.html).toContain('#757575'); // Low priority gray
});

test('contacts_extractor should handle JSON parsing errors gracefully', async () => {
  // Mock OpenAI to return invalid JSON
  mock.module('openai', () => ({
    default: class {
      constructor() {
        return {
          chat: {
            completions: {
              create: async () => ({
                choices: [{
                  message: {
                    content: "This is not valid JSON at all!"
                  }
                }]
              })
            }
          }
        };
      }
    }
  }));

  const sampleLifelogs: Lifelog[] = [
    {
      id: "test-1",
      title: "Test Conversation",
      startTime: "2024-03-20T10:00:00Z",
      endTime: "2024-03-20T10:30:00Z",
      markdown: "",
      contents: [
        {
          type: "heading2",
          content: "Test",
          children: [
            {
              type: "blockquote",
              content: "This is a test conversation",
              speakerName: "user",
              speakerIdentifier: "user"
            }
          ]
        }
      ]
    }
  ];

  const result = await contacts_extractor(sampleLifelogs, mockEnv);
  
  // Should handle the error gracefully
  expect(result.html).toContain('No significant new contacts identified');
  expect(result.text).toContain('No significant new contacts identified');
});

test('contacts_extractor should handle OpenAI API errors', async () => {
  // Mock OpenAI to throw an error
  mock.module('openai', () => ({
    default: class {
      constructor() {
        return {
          chat: {
            completions: {
              create: async () => {
                throw new Error('API rate limit exceeded');
              }
            }
          }
        };
      }
    }
  }));

  const sampleLifelogs: Lifelog[] = [
    {
      id: "test-1",
      title: "Test Conversation",
      startTime: "2024-03-20T10:00:00Z",
      endTime: "2024-03-20T10:30:00Z",
      markdown: "",
      contents: [
        {
          type: "heading2",
          content: "Test",
          children: [
            {
              type: "blockquote",
              content: "This is a test conversation",
              speakerName: "user",
              speakerIdentifier: "user"
            }
          ]
        }
      ]
    }
  ];

  const result = await contacts_extractor(sampleLifelogs, mockEnv);
  
  // Should handle the error gracefully
  expect(result.html).toContain('Error extracting contact information');
  expect(result.text).toContain('Error extracting contact information');
  expect(result.text).toContain('API rate limit exceeded');
});

test('contacts_extractor should handle multiple conversations with contacts', async () => {
  const mockResponse = {
    contacts: [
      {
        name: "Robert Smith",
        relationship: "vendor",
        company: "CloudSecure Ltd",
        role: "Sales Director",
        email: "r.smith@cloudsecure.com",
        phone: null,
        context: "Presenting security solutions for our infrastructure upgrade",
        significance: "medium",
        conversationTitle: "Vendor Meeting"
      },
      {
        name: "Maria Gonzalez",
        relationship: "new team member",
        company: "Our Company",
        role: "Senior Engineer",
        email: "maria.gonzalez@company.com",
        phone: null,
        context: "New hire starting next week, will be joining the backend team",
        significance: "high",
        conversationTitle: "Team Meeting"
      }
    ],
    summary: "New vendor contact and incoming team member identified"
  };

  mock.module('openai', () => createMockOpenAI(mockResponse));

  const sampleLifelogs: Lifelog[] = [
    {
      id: "vendor-meeting-1",
      title: "Vendor Meeting",
      startTime: "2024-03-20T10:00:00Z",
      endTime: "2024-03-20T11:00:00Z",
      markdown: "",
      contents: [
        {
          type: "heading2",
          content: "Security Solutions",
          children: [
            {
              type: "blockquote",
              content: "Robert Smith from CloudSecure Ltd presented their security solutions. He's their Sales Director and his email is r.smith@cloudsecure.com",
              speakerName: "user",
              speakerIdentifier: "user"
            }
          ]
        }
      ]
    },
    {
      id: "team-meeting-1", 
      title: "Team Meeting",
      startTime: "2024-03-20T15:00:00Z",
      endTime: "2024-03-20T16:00:00Z",
      markdown: "",
      contents: [
        {
          type: "heading2",
          content: "New Hire Discussion",
          children: [
            {
              type: "blockquote",
              content: "Maria Gonzalez will be joining our backend team next week as a Senior Engineer. Her email is maria.gonzalez@company.com",
              speakerName: "user",
              speakerIdentifier: "user"
            }
          ]
        }
      ]
    }
  ];

  const result = await contacts_extractor(sampleLifelogs, mockEnv);
  
  // Check both contacts from different conversations are present
  expect(result.text).toContain('Robert Smith');
  expect(result.text).toContain('Maria Gonzalez');
  expect(result.text).toContain('CloudSecure Ltd');
  expect(result.text).toContain('vendor');
  expect(result.text).toContain('new team member');
  expect(result.text).toContain('From: Vendor Meeting');
  expect(result.text).toContain('From: Team Meeting');
  
  // Check count in header
  expect(result.text).toContain('New Contacts (2)');
});