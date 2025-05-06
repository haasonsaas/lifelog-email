# Lifelog Email Worker

A Cloudflare Worker that processes Limitless lifelogs and sends daily digests via Resend. This service helps you stay on top of your conversations by providing daily summaries, tracking decisions, and analyzing your communication patterns.

## Features

- **Daily Email Digests**: Automatically sends a summary of your day's conversations
- **Multiple Extractors**: Choose from different analysis methods
- **Search Functionality**: Search through your lifelogs by query, speakers, topics, and date ranges
- **Preview Mode**: Test your digest configuration before deployment
- **Customizable Scheduling**: Configure your preferred timezone and schedule

## Components

### Extractors
- `decisions`: Extracts explicit decision statements with context
- `new_contacts`: Tracks unique speakers across conversations (requires KV)
- `filler_score`: Analyzes filler word frequency and speech patterns
- `action_items`: Extracts commitments and tasks
- `gpt_summary`: Generates AI-powered summaries using OpenAI API
- `conversation_topics`: Analyzes and categorizes conversation topics with duration tracking

### Search Capabilities
- Full-text search across all conversations
- Filter by speakers
- Filter by topics
- Date range filtering
- Combined search criteria

### Scheduling
- Runs daily at 9:00 AM in configured timezone
- Customizable via wrangler.toml

### Preview
- Endpoint for testing digests via browser (`/preview`)
- Test email sending (`/test`)

## Installation

```bash
npm i -g wrangler
git clone https://github.com/haasonsaas/lifelog-email.git
cd lifelog-email
npm install
```

## Configuration

### Required Environment Variables
```bash
# API Keys
wrangler secret put LIMITLESS_API_KEY
wrangler secret put RESEND_API_KEY
# For gpt_summary extractor:
wrangler secret put OPENAI_API_KEY
```

### KV Storage
Required for `new_contacts` extractor:
```bash
wrangler kv:namespace create TOKEN_KV
```

### wrangler.toml Configuration
```toml
[vars]
FROM_EMAIL = "sender@domain.com"    # Verified Resend sender
TO_EMAIL = "recipient@domain.com"   # Recipient address
EXTRACTOR = "decisions"            # Selected extractor
TIMEZONE = "America/Los_Angeles"   # IANA timezone
```

## Development

```bash
# Local development
wrangler dev

# Test current digest
curl http://localhost:8787/preview

# Test email sending
curl http://localhost:8787/test

# Deploy
wrangler deploy
```

## Extractors

### decisions
- Pattern matching for "I decided" or "we decided" statements
- Includes surrounding context for better understanding
- Returns chronological list of decisions with timestamps

### new_contacts
- Tracks unique speakers across conversations
- Uses KV storage for persistence
- Returns new contacts for the day
- Excludes the user from tracking

### filler_score
- Analyzes frequency of filler words (um, uh, like, etc.)
- Calculates usage rate per conversation
- Returns statistics and trends
- Focuses on user's speech patterns

### action_items
- Pattern matching for commitment phrases
- Identifies tasks and commitments
- Returns chronological list with context
- Helps track follow-up items

### gpt_summary
- Uses OpenAI API for conversation analysis
- Generates concise summaries with sections:
  - Overview
  - Decisions
  - Action Items
  - New Contacts
  - Topics with durations
- Requires OpenAI API key

### conversation_topics
- Analyzes conversation content for topic detection
- Tracks duration spent on each topic
- Sorts topics by time spent
- Provides daily topic distribution

## License

MIT License - See [LICENSE](LICENSE) file for details.