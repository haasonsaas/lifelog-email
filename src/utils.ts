import type { Env } from "./types";

export function yesterday(tz: string) {
  const now = new Date();
  const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = new Date(utcMidnight - 86_400_000);
  const end = new Date(utcMidnight - 1);
  const iso = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);
  return { start: iso(start), end: iso(end) };
}

interface LifelogsResponse {
  data: {
    lifelogs: LifelogEntry[];
  };
  meta: {
    lifelogs: {
      nextCursor: string | null;
      count: number;
    };
  };
}

interface ApiError {
  error: {
    message: string;
    code: string;
  };
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchLifelogs(
  apiKey: string, 
  startDate: string, 
  endDate: string,
  cursor?: string
): Promise<LifelogEntry[]> {
  const url = new URL('https://api.limitless.ai/v1/lifelogs');
  
  // Convert dates to YYYY-MM-DD format if they include time
  const start = startDate.split(' ')[0];
  const end = endDate.split(' ')[0];
  
  url.searchParams.append('start', start);
  url.searchParams.append('end', end);
  url.searchParams.append('timezone', 'America/Los_Angeles');
  url.searchParams.append('includeMarkdown', 'true');
  url.searchParams.append('includeHeadings', 'true');
  url.searchParams.append('limit', '10');
  url.searchParams.append('direction', 'desc');
  
  if (cursor) {
    url.searchParams.append('cursor', cursor);
  }

  console.log('Fetching lifelogs from:', url.toString());

  let retries = 0;
  while (retries < MAX_RETRIES) {
    try {
      const response = await fetch(url.toString(), {
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json() as ApiError;
        if (response.status === 429) {
          // Rate limit exceeded
          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : RETRY_DELAY_MS;
          console.log(`Rate limit exceeded, retrying after ${delay}ms`);
          await sleep(delay);
          retries++;
          continue;
        }
        throw new Error(`API Error: ${errorData.error.message} (${errorData.error.code})`);
      }

      const data = await response.json() as LifelogsResponse;
      console.log('Received lifelogs:', data.data.lifelogs.length);

      // If there are more pages and we haven't hit the limit, fetch them
      if (data.meta.lifelogs.nextCursor && data.data.lifelogs.length < 100) {
        const nextPage = await fetchLifelogs(apiKey, startDate, endDate, data.meta.lifelogs.nextCursor);
        return [...data.data.lifelogs, ...nextPage];
      }

      return data.data.lifelogs;
    } catch (error) {
      if (retries === MAX_RETRIES - 1) {
        throw error;
      }
      console.log(`Request failed, retrying (${retries + 1}/${MAX_RETRIES})`);
      await sleep(RETRY_DELAY_MS * Math.pow(2, retries)); // Exponential backoff
      retries++;
    }
  }

  throw new Error('Failed to fetch lifelogs after maximum retries');
}

export interface LifelogEntry {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  contents: Array<{
    content: string;
    type: string;
    startTime?: string;
    endTime?: string;
    speakerName?: string;
    speakerIdentifier?: string;
  }>;
}

export function formatLifelogEntry(entry: LifelogEntry): string {
  let formatted = `# ${entry.title}\n\n`;
  formatted += `Time: ${new Date(entry.startTime).toLocaleString()} - ${new Date(entry.endTime).toLocaleString()}\n\n`;

  for (const content of entry.contents) {
    if (content.type === 'heading1' || content.type === 'heading2') {
      formatted += `\n## ${content.content}\n\n`;
    } else if (content.type === 'blockquote') {
      const speaker = content.speakerName || 'Unknown';
      const time = content.startTime ? new Date(content.startTime).toLocaleTimeString() : '';
      formatted += `> ${speaker} (${time}): ${content.content}\n\n`;
    }
  }

  return formatted;
}

export interface SearchOptions {
  query?: string;
  topics?: string[];
  speakers?: string[];
  startDate?: string;
  endDate?: string;
}

export function searchLifelogs(lifelogs: LifelogEntry[], options: SearchOptions): LifelogEntry[] {
  console.log('Searching through', lifelogs.length, 'lifelogs with options:', options);
  
  return lifelogs.filter(entry => {
    // Filter by date range if specified
    if (options.startDate && new Date(entry.startTime) < new Date(options.startDate)) {
      console.log('Entry filtered out by start date:', entry.startTime);
      return false;
    }
    if (options.endDate && new Date(entry.endTime) > new Date(options.endDate)) {
      console.log('Entry filtered out by end date:', entry.endTime);
      return false;
    }

    // Filter by topics if specified
    if (options.topics && options.topics.length > 0) {
      const entryTopics = entry.contents
        .filter(content => content.type === 'heading1' || content.type === 'heading2')
        .map(content => content.content.toLowerCase());
      
      if (!options.topics.some(topic => 
        entryTopics.some(entryTopic => entryTopic.includes(topic.toLowerCase()))
      )) {
        console.log('Entry filtered out by topics:', entryTopics);
        return false;
      }
    }

    // Filter by speakers if specified
    if (options.speakers && options.speakers.length > 0) {
      const entrySpeakers = entry.contents
        .filter(content => content.speakerName)
        .map(content => content.speakerName!.toLowerCase());
      
      if (!options.speakers.some(speaker => 
        entrySpeakers.some(entrySpeaker => entrySpeaker.includes(speaker.toLowerCase()))
      )) {
        console.log('Entry filtered out by speakers:', entrySpeakers);
        return false;
      }
    }

    // Search by query if specified
    if (options.query) {
      const searchText = options.query.toLowerCase();
      const entryText = [
        entry.title,
        ...entry.contents.map(content => content.content)
      ].join(' ').toLowerCase();
      
      console.log('Searching in entry:', entryText);
      
      if (!entryText.includes(searchText)) {
        console.log('Entry filtered out by query:', searchText);
        return false;
      }
    }

    console.log('Entry matched all criteria:', entry.title);
    return true;
  });
}

export function testDateRange(timezone: string = "America/Los_Angeles") {
  const end = new Date("2025-05-05T23:59:59");
  const start = new Date("2025-05-05T00:00:00");
  return {
    start: start.toISOString().replace('T', ' ').slice(0, 19),
    end: end.toISOString().replace('T', ' ').slice(0, 19)
  };
}