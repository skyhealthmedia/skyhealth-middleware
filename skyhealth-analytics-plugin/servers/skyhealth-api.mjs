#!/usr/bin/env node

/**
 * SkyHealth Analytics MCP Server
 *
 * A minimal MCP (Model Context Protocol) server that wraps the SkyHealth
 * middleware REST API, exposing it as tools Claude can call directly.
 *
 * Runs over stdio — no npm dependencies required (uses Node.js built-ins).
 */

import { createInterface } from 'readline';
import https from 'https';

const API_URL = process.env.SKYHEALTH_API_URL || 'https://api.skyhealthmedia.com';
const BEARER = process.env.SKYHEALTH_BEARER_TOKEN || '';

// --- HTTP helper ---
function apiGet(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_URL);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${BEARER}`,
        Accept: 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({ raw: body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// --- Tool definitions ---
const TOOLS = [
  {
    name: 'skyhealth_list_clients',
    description: 'List all registered SkyHealth Media clients with their IDs, domains, and connected social accounts.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'skyhealth_ga4_kpis',
    description: 'Get GA4 website analytics (sessions, users, top pages, traffic sources, events) for a client. Returns 7-day and 28-day metrics.',
    inputSchema: {
      type: 'object',
      properties: {
        client: { type: 'string', description: 'Client key (e.g. skyhealth, pediatricgi, vipeds, kernplacepediatrics, drhector)' },
        top_limit: { type: 'number', description: 'Max top pages to return (default 10)' },
      },
      required: ['client'],
    },
  },
  {
    name: 'skyhealth_social_kpis',
    description: 'Get social media KPIs for a client. Supports instagram, facebook, and tiktok platforms. Returns followers, posts/videos, engagement metrics. NOTE: TikTok is pending production approval from TikTok Developer — until approved, tiktok requests may return empty, partial, or placeholder data.',
    inputSchema: {
      type: 'object',
      properties: {
        client: { type: 'string', description: 'Client key (e.g. skyhealth, pediatricgi, vipeds, kernplacepediatrics, drhector)' },
        platform: { type: 'string', enum: ['instagram', 'facebook', 'tiktok'], description: 'Social platform to query. tiktok is pending TikTok production approval.' },
        postLimit: { type: 'number', description: 'Max posts/videos to return (default 5)' },
      },
      required: ['client', 'platform'],
    },
  },
  {
    name: 'skyhealth_list_prospects',
    description: 'List demo/sample prospect data for SkyHealth Media. Useful for showcasing onboarding data or non-production reporting demos.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'skyhealth_health',
    description: 'Check if the SkyHealth middleware API is online.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

// --- Tool execution ---
async function executeTool(name, args) {
  switch (name) {
    case 'skyhealth_list_clients':
      return await apiGet('/clients');

    case 'skyhealth_ga4_kpis': {
      const params = new URLSearchParams();
      if (args.client) params.set('client', args.client);
      if (args.top_limit) params.set('top_limit', String(args.top_limit));
      return await apiGet(`/kpi/ga4?${params}`);
    }

    case 'skyhealth_social_kpis': {
      const params = new URLSearchParams();
      if (args.client) params.set('client', args.client);
      if (args.platform) params.set('platform', args.platform);
      if (args.postLimit) params.set('postLimit', String(args.postLimit));
      return await apiGet(`/kpi/social?${params}`);
    }

    case 'skyhealth_list_prospects':
      return await apiGet('/prospects');

    case 'skyhealth_health':
      return await apiGet('/health');

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// --- MCP Protocol over stdio ---
const rl = createInterface({ input: process.stdin, terminal: false });
let buffer = '';

function send(msg) {
  // Modern MCP stdio transport: newline-delimited JSON-RPC, one message per line.
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function handleMessage(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case 'initialize':
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'skyhealth-api', version: '0.2.2' },
        },
      });
      break;

    case 'notifications/initialized':
      // No response needed
      break;

    case 'tools/list':
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      break;

    case 'tools/call':
      executeTool(params.name, params.arguments || {})
        .then((result) => {
          send({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            },
          });
        })
        .catch((err) => {
          send({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: `Error: ${err.message}` }],
              isError: true,
            },
          });
        });
      break;

    default:
      if (id) {
        send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
      }
  }
}

// Parse JSON-RPC messages from stdin (Content-Length framing)
let expectedLength = -1;

rl.on('line', (line) => {
  if (expectedLength === -1) {
    const match = line.match(/^Content-Length:\s*(\d+)/i);
    if (match) {
      expectedLength = parseInt(match[1], 10);
      buffer = '';
    } else if (line.trim() === '' && expectedLength === -1) {
      // skip blank lines
    } else if (line.trim()) {
      // Try parsing as raw JSON (some clients don't use Content-Length)
      try {
        handleMessage(JSON.parse(line));
      } catch {
        // ignore
      }
    }
  } else if (line.trim() === '') {
    // blank line after headers, body comes next
  } else {
    buffer += line;
    try {
      const msg = JSON.parse(buffer);
      expectedLength = -1;
      buffer = '';
      handleMessage(msg);
    } catch {
      // incomplete JSON, wait for more
    }
  }
});

process.stderr.write('[skyhealth-api] MCP server started\n');
