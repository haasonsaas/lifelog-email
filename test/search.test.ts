import { expect, test, describe } from "bun:test";
import { searchLifelogs } from '../src/utils';
import type { LifelogEntry } from '../src/types';

describe('Search Functionality', () => {
  const sampleLogs: LifelogEntry[] = [
    {
      id: '1',
      title: 'Meeting about Project X',
      startTime: '2024-03-20T10:00:00Z',
      endTime: '2024-03-20T11:00:00Z',
      contents: [
        {
          type: 'heading1',
          content: 'Project Discussion',
          startTime: '2024-03-20T10:00:00Z',
          endTime: '2024-03-20T10:30:00Z',
        },
        {
          type: 'blockquote',
          content: 'We need to focus on the deadline',
          startTime: '2024-03-20T10:15:00Z',
          endTime: '2024-03-20T10:16:00Z',
          speakerName: 'John',
        }
      ]
    },
    {
      id: '2',
      title: 'Coffee Chat with Alice',
      startTime: '2024-03-20T14:00:00Z',
      endTime: '2024-03-20T14:30:00Z',
      contents: [
        {
          type: 'blockquote',
          content: 'The weather is nice today',
          startTime: '2024-03-20T14:00:00Z',
          endTime: '2024-03-20T14:01:00Z',
          speakerName: 'Alice',
        }
      ]
    }
  ];

  test('should search by query text', () => {
    const results = searchLifelogs(sampleLogs, { query: 'deadline' });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('1');
  });

  test('should filter by speaker', () => {
    const results = searchLifelogs(sampleLogs, { speakers: ['Alice'] });
    expect(results.length).toBe(1);
    expect(results[0].title).toContain('Coffee Chat');
  });

  test('should filter by topic', () => {
    const results = searchLifelogs(sampleLogs, { topics: ['Project'] });
    expect(results.length).toBe(1);
    expect(results[0].title).toContain('Project X');
  });

  test('should filter by date range', () => {
    const results = searchLifelogs(sampleLogs, {
      startDate: '2024-03-20T13:00:00Z',
      endDate: '2024-03-20T15:00:00Z'
    });
    expect(results.length).toBe(1);
    expect(results[0].title).toContain('Coffee Chat');
  });

  test('should combine multiple filters', () => {
    const results = searchLifelogs(sampleLogs, {
      query: 'project',
      speakers: ['John'],
      startDate: '2024-03-20T00:00:00Z',
      endDate: '2024-03-21T00:00:00Z'
    });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('1');
  });

  test('should return empty array when no matches', () => {
    const results = searchLifelogs(sampleLogs, { query: 'nonexistent' });
    expect(results.length).toBe(0);
  });
}); 