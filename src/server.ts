// src/server.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fs from 'fs';
import path from 'path';

import { ENV } from './env';
import { getSocialKPI } from './svc_social';
let ga4Handler: any = null;

// Try to import GA4 handler safely
try {
  const ga4Module = require('./svc_ga4');
  ga4Handler = ga4Module.ga4Handler;
} catch (err) {
  console.warn("⚠️ GA4 handler not available. GA4 endpoint will be disabled.", err);
}

const app = Fastify({ logger: true });

async function buildApp() {
  // --- Debugging startup ---
  console.log("✅ Server starting with ENV:", {
    PORT: process.env.PORT,
    AGENT_BEARER: process.env.AGENT_BEARER ? "set" : "MISSING",
    META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN ? "set" : "MISSING",
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || "not set"
  });

  // --- Plugins ---
  await app.register(cors, { origin: true });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  // --- Auth hook (skip public routes) ---
  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/health') || req.url.startsWith('/openapi.yaml')) return;
    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (!ENV.AGENT_BEARER || token !== ENV.AGENT_BEARER) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // --- Routes ---
  app.get('/health', async () => ({ ok: true }));

  app.get('/openapi.yaml', async (req, reply) => {
    try {
      const specPath = path.join(__dirname, '..', 'openapi.yaml');
      const text = fs.readFileSync(specPath, 'utf8');
      reply.type('text/yaml').send(text);
    } catch (e: any) {
      req.log.error(e);
      reply.code(500).send({ error: 'spec_not_found' });
    }
  });

  // --- GA4 endpoint (optional) ---
  if (ga4Handler) {
    app.get('/kpi/ga4', ga4Handler);
  } else {
    app.get('/kpi/ga4', async (req, reply) => {
      return reply.code(501).send({ error: "GA4_not_configured" });
    });
  }

  // --- /kpi/social (Instagram/Facebook via Graph API) ---
  app.get('/kpi/social', async (req, reply) => {
    try {
      const q = req.query as Record<string, unknown>;
      const platformRaw = String(q.platform || '');
      const accountId = String(q.accountId || '');

      // ✅ Now also checks ENV.META_ACCESS_TOKEN
      const accessToken =
        String(q.accessToken || '') ||
        String(
          (ENV as any).FB_GRAPH_TOKEN ||
          (ENV as any).GRAPH_ACCESS_TOKEN ||
          (ENV as any).META_ACCESS_TOKEN ||
          ''
        );

      const postLimit = q.postLimit ? Number(q.postLimit) : 50;

      if (!platformRaw || (platformRaw !== 'instagram' && platformRaw !== 'facebook')) {
        return reply
          .code(400)
          .send({ error: 'invalid_platform', detail: "Use 'instagram' or 'facebook'." });
      }
      if (!accountId) {
        return reply
          .code(400)
          .send({ error: 'missing_accountId', detail: 'Provide ?accountId=' });
      }
      if (!accessToken) {
        return reply.code(400).send({
          error: 'missing_accessToken',
          detail:
            'Provide ?accessToken= or set ENV.FB_GRAPH_TOKEN / ENV.GRAPH_ACCESS_TOKEN / ENV.META_ACCESS_TOKEN',
        });
      }

      const data = await getSocialKPI(
        {
          platform: platformRaw as 'instagram' | 'facebook',
          accessToken,
          accountId,
        },
        { postLimit }
      );

      return reply.send(data);
    } catch (err: any) {
      req.log.error(err);
      return reply
        .code(500)
        .send({ error: 'social_kpi_failed', detail: err?.message || String(err) });
    }
  });

  // Demo prospects
  app.get('/prospects', async (req, reply) => {
    const q = req.query as any;
    const market = String(q.market || 'El Paso');
    const service = String(q.service || 'pediatrics');
    const limit = Number(q.limit || 25);

    const sample = [
      {
        name: 'Sunrise Pediatrics',
        website: 'https://example.com',
        instagram: '@sunrisepeds',
        last_post_days: 3,
        notes: 'Active on IG',
      },
      {
        name: 'Healthy Kids Clinic',
        website: null,
        instagram: null,
        last_post_days: null,
        notes: 'Website only',
      },
      {
        name: 'GI Care Associates',
        website: 'https://gi-care.example',
        instagram: '@gicare',
        last_post_days: 10,
        notes: 'Potential outreach',
      },
    ];

    const results = sample
      .slice(0, Math.max(1, Math.min(limit, sample.length)))
      .map((r) => ({ ...r, notes: `${r.notes} • ${service} • ${market}` }));

    reply.send(results);
  });
}

async function start() {
  try {
    await buildApp();
    const PORT = Number(process.env.PORT || 8080);

    // ✅ Use 127.0.0.1 locally, 0.0.0.0 on Render
    const HOST = process.env.RENDER ? '0.0.0.0' : '127.0.0.1';

    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Server listening on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
