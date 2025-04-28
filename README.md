# Lifelog Email Worker

A Cloudflare Worker that processes Limitless lifelogs and sends daily digests via Resend.

## Components

- **Extractors**:
  - `decisions`: Extracts explicit decision statements
  - `new_contacts`: Tracks unique speakers (requires KV)
  - `filler_score`: Analyzes filler word frequency
  - `action_items`: Extracts commitments and tasks
  - `gpt_summary`: Generates summaries using OpenAI API
- **Scheduling**: Runs daily at 9:00 AM in configured timezone
- **Preview**: Endpoint for testing digests via browser (`/preview`)

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

### KV Storage (Optional)
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

# Deploy
wrangler deploy
```

## Extractors

### decisions
- Pattern matching for "I decided" or "we decided" statements
- Returns chronological list of decisions

### new_contacts
- Tracks unique speakers across conversations
- Uses KV storage for persistence
- Returns new contacts for the day

### filler_score
- Analyzes frequency of filler words
- Calculates usage rate per conversation
- Returns statistics and trends

### action_items
- Pattern matching for commitment phrases
- Identifies tasks and commitments
- Returns chronological list

### gpt_summary
- Uses OpenAI API for conversation analysis
- Generates concise summaries
- Requires OpenAI API key