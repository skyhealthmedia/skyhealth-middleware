# SkyHealth Analytics Plugin

The **SkyHealth Analytic Agent**: a GA4 analytics and social media reporting assistant for SkyHealth Media and its active clients. Connects Claude to the SkyHealth middleware API for live analytics and report generation.

## What It Does

- Pulls live GA4 website analytics (sessions, users, top pages, traffic sources, key events)
- Pulls Instagram, Facebook, and TikTok social KPIs (followers, posts, engagement)
- Lists registered clients and demo prospect data
- Checks middleware API health
- Generates client-ready reports in chat, Word, PowerPoint, or Excel format

## Components

| Component | Name | Purpose |
|-----------|------|---------|
| MCP Server | `skyhealth-api` | Wraps the SkyHealth middleware REST API |
| Skill | `generate-report` | Guides Claude through report generation and data interpretation |

## Available API Actions

| Tool | API Action |
|------|-----------|
| `skyhealth_health` | `getHealth` |
| `skyhealth_list_clients` | `listClients` |
| `skyhealth_ga4_kpis` | `getGa4Kpis` |
| `skyhealth_social_kpis` | `getSocialKpis` |
| `skyhealth_list_prospects` | `listProspects` |

## Supported Clients

- `skyhealth` — SkyHealth Media (Instagram, Facebook, TikTok)
- `kernplacepediatrics` — Kern Place Pediatrics (GA4 only)
- `pediatricgi` — Pediatric GI of El Paso (Instagram, Facebook, TikTok)
- `vipeds` — VIPeds (Instagram, Facebook, TikTok)
- `drhector` — Dr Hector Rodriguez (GA4 only)

## Social Platform Status

- **Instagram, Facebook** — active or partially active depending on connected client account
- **TikTok** — *in progress.* A production request has been submitted to TikTok Developer; we are awaiting approval. Until approved, TikTok requests may return empty, partial, or placeholder data.

## Setup

### Required Environment Variable

```
SKYHEALTH_BEARER_TOKEN=your_bearer_token_here
```

**Windows (PowerShell):**
```powershell
[System.Environment]::SetEnvironmentVariable('SKYHEALTH_BEARER_TOKEN', 'your_token', 'User')
```

**Mac/Linux:**
```bash
echo 'export SKYHEALTH_BEARER_TOKEN=your_token' >> ~/.zshrc
source ~/.zshrc
```

Optionally override the API URL with `SKYHEALTH_API_URL` (defaults to `https://api.skyhealthmedia.com`).

### Requirements

- Node.js 18 or later (no `npm install` needed — built-in modules only)

## Usage

Once installed, ask Claude things like:

- "Generate a monthly report for Pediatric GI"
- "Pull TikTok data for VIPeds"
- "Compare website traffic across all clients"
- "Create a PowerPoint deck for SkyHealth Media's social performance"
- "Show me the demo prospect list"
- "Is the API up?"

## Behavior Rules

The agent will:

- Always call the middleware API for real data — never invent numbers
- Lead reports with key takeaways, then supporting metrics
- Clearly say when data is unavailable and explain the likely reason (missing credentials, unconnected account, pending TikTok approval, etc.)
- Keep reports executive-friendly and client-ready
