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

export async function fetchLifelogs(apiKey: string, startDate: string, endDate: string): Promise<LifelogEntry[]> {
  const url = new URL('https://api.limitless.ai/v1/lifelogs');
  url.searchParams.append('start', startDate);
  url.searchParams.append('end', endDate);
  url.searchParams.append('timezone', 'America/Los_Angeles');
  url.searchParams.append('includeMarkdown', 'true');
  url.searchParams.append('includeHeadings', 'true');
  url.searchParams.append('limit', '100');

  console.log('Fetching lifelogs from:', url.toString());

  const response = await fetch(url.toString(), {
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch lifelogs: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as LifelogsResponse;
  console.log('Received lifelogs:', data.data.lifelogs.length);
  return data.data.lifelogs;
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