// src/server.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fs from 'fs';
import path from 'path';

import { ENV } from './env';
import { ga4Handler } from './svc_ga4';
import { socialHandler } from './svc_social';

const app = Fastify({ logger: true });

async function buildApp() {
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

  app.get('/kpi/ga4', ga4Handler);
  app.get('/kpi/social', socialHandler);

  app.get('/prospects', async (req, reply) => {
    const q = req.query as any;
    const market = String(q.market || 'El Paso');
    const service = String(q.service || 'pediatrics');
    const limit = Number(q.limit || 25);

    const sample = [
      { name: 'Sunrise Pediatrics', website: 'https://example.com', instagram: '@sunrisepeds', last_post_days: 3, notes: 'Active on IG' },
      { name: 'Healthy Kids Clinic', website: null, instagram: null, last_post_days: null, notes: 'Website only' },
      { name: 'GI Care Associates', website: 'https://gi-care.example', instagram: '@gicare', last_post_days: 10, notes: 'Potential outreach' },
    ];

    const results = sample.slice(0, Math.max(1, Math.min(limit, sample.length))).map(r => ({
      ...r,
      notes: `${r.notes} • ${service} • ${market}`
    }));

    reply.send(results);
  });
}

async function start() {
  try {
    await buildApp();
    const PORT = Number(process.env.PORT || 8080);
    await app.listen({ port: PORT, host: '0.0.0.0' });
    app.log.info(`Server listening on :${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
