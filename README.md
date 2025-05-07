# Lifelog Email Worker

A Cloudflare Worker that processes Limitless lifelogs and sends daily digests via Resend. This service helps you stay on top of your conversations by providing daily summaries, tracking decisions, and analyzing your communication patterns.

## Features

- **Daily Email Digests**: Automatically sends a summary of your day's conversations
- **AI-Powered Analysis**: Uses OpenAI to generate comprehensive summaries
- **Search Functionality**: Search through your lifelogs by query, speakers, topics, and date ranges
- **Preview Mode**: Test your digest configuration before deployment
- **Customizable Scheduling**: Configure your preferred timezone and schedule

## Components

### Extractors
- `gpt_summary`: Generates AI-powered summaries using OpenAI API
  - Overview of key points
  - Action items and deadlines
  - Key decisions
  - Discussion topics with durations

### Search Capabilities
- Full-text search across all conversations
- Filter by speakers
- Filter by topics
- Date range filtering
- Combined search criteria

### Scheduling
- Runs daily at 8:00 AM Pacific time (15:00 UTC)
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
# API Keys (DO NOT commit these to version control)
wrangler secret put LIMITLESS_API_KEY
wrangler secret put RESEND_API_KEY
# For gpt_summary extractor:
wrangler secret put OPENAI_API_KEY
```

### Environments
The service supports multiple environments:
- **Development**: Local testing with `wrangler dev`
- **Staging**: Accessible at digest-staging.haasonsaas.com
- **Production**: Accessible at digest.haasonsaas.com

### KV Storage
Required for persistent storage:
```bash
wrangler kv:namespace create TOKEN_KV
```

### wrangler.toml Configuration
```toml
[vars]
FROM_EMAIL = "sender@domain.com"    # Verified Resend sender
TO_EMAIL = "recipient@domain.com"   # Recipient address
EXTRACTOR = "gpt_summary"          # Selected extractor
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

### gpt_summary
- Uses OpenAI API for conversation analysis
- Generates concise summaries with sections:
  - Overview
  - Decisions
  - Action Items
  - New Contacts
  - Topics with durations
- Requires OpenAI API key

## License

MIT License - See [LICENSE](LICENSE) file for details.