// src/server.ts
import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fs from 'fs';
import path from 'path';

import { ENV } from './env';
import { ga4Handler } from './svc_ga4';
import { getSocialKPI } from './svc_social';
import { getTikTokKPI, exchangeTikTokCode } from './svc_tiktok';
import clients from './clients';

const app = Fastify({ logger: true });

async function buildApp() {
  // --- Plugins ---
  await app.register(cors, { origin: true });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  // --- Auth hook (skip public routes) ---
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (
      req.url.startsWith('/health') ||
      req.url.startsWith('/openapi.yaml') ||
      req.url.startsWith('/tiktok-developers-site-verification') ||
      req.url.startsWith('/auth/tiktok')
    ) {
      return;
    }

    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();

    if (!ENV.AGENT_BEARER || token !== ENV.AGENT_BEARER) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // --- Routes ---
  app.get('/health', async () => ({ ok: true }));

  // TikTok domain verification (with and without .txt)
  const tiktokVerification = async (_req: FastifyRequest, reply: FastifyReply) => {
    reply
      .type('text/plain')
      .send('tiktok-developers-site-verification=EmEtMnK6kSmCcLrWqhSy9LRAs17x2Dc0');
  };
  app.get('/tiktok-developers-site-verification', tiktokVerification);
  app.get('/tiktok-developers-site-verification.txt', tiktokVerification);

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

  // List registered clients
  app.get('/clients', async (req: FastifyRequest, reply: FastifyReply) => {
    const list = Object.entries(clients).map(([id, client]) => ({
      id,
      name: client.name,
      domain: client.domain,
      ga4_property_id: client.ga4_property_id,
      ig_account_id: client.ig_account_id || null,
      fb_page_id: client.fb_page_id || null,
      tiktok_username: client.tiktok_username || null,
    }));

    return reply.send(list);
  });

  // GA4 endpoint
  app.get('/kpi/ga4', ga4Handler);

  // --- /kpi/social (Instagram/Facebook via Graph API) ---
  app.get('/kpi/social', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const q = req.query as Record<string, unknown>;
      const platformRaw = String(q.platform || '');

      // Resolve client first so we can check for a per-client token
      const clientKey = String(q.client || '').toLowerCase();
      const clientConfig = clientKey ? clients[clientKey] : undefined;

      // Token priority: ?accessToken → client-specific env var → shared META_ACCESS_TOKEN → FB_GRAPH_TOKEN
      const clientTokenEnv = clientConfig?.meta_access_token_env;
      const clientToken = clientTokenEnv ? (process.env[clientTokenEnv] || '') : '';
      const accessToken =
        String(q.accessToken || '') ||
        clientToken ||
        String(ENV.META_ACCESS_TOKEN || ENV.FB_GRAPH_TOKEN || '');

      const postLimit = q.postLimit ? Number(q.postLimit) : 25;

      if (
        !platformRaw ||
        (platformRaw !== 'instagram' && platformRaw !== 'facebook' && platformRaw !== 'tiktok')
      ) {
        return reply
          .code(400)
          .send({ error: 'invalid_platform', detail: "Use 'instagram', 'facebook', or 'tiktok'." });
      }

      if (clientKey && !clientConfig) {
        return reply.code(404).send({
          error: 'client_not_found',
          detail: `No client registered with key '${clientKey}'. Use /clients to list available clients.`,
        });
      }

      // --- TikTok branch ---
      if (platformRaw === 'tiktok') {
        const tiktokToken =
          String(q.accessToken || '') ||
          String(ENV.TIKTOK_ACCESS_TOKEN || '');

        if (!tiktokToken) {
          return reply.code(400).send({
            error: 'missing_accessToken',
            detail: 'Provide ?accessToken= or set TIKTOK_ACCESS_TOKEN env var. Use /auth/tiktok to authorize.',
          });
        }

        const data = await getTikTokKPI(tiktokToken, { postLimit });
        return reply.send({
          client: clientConfig ? clientKey : undefined,
          tiktok_username: clientConfig?.tiktok_username || null,
          ...data,
        });
      }

      // --- Instagram / Facebook branch ---
      // Resolve account ID: client config → ?accountId= → env defaults
      let accountId = String(q.accountId || '');
      if (!accountId && clientConfig) {
        if (platformRaw === 'instagram') {
          accountId = clientConfig.ig_account_id || '';
        } else {
          accountId = clientConfig.fb_page_id || '';
        }
      }
      if (!accountId) {
        if (platformRaw === 'instagram') {
          accountId = ENV.DEFAULT_IG_ID || '17841476107371059';
        } else {
          accountId = ENV.DEFAULT_FB_ID || '758804137314076';
        }
      }

      if (clientConfig && !accountId) {
        return reply.code(400).send({
          error: 'no_social_config',
          detail: `Client '${clientKey}' does not have a ${platformRaw} account configured.`,
        });
      }

      if (!accessToken) {
        return reply.code(400).send({
          error: 'missing_accessToken',
          detail: 'Provide ?accessToken= or set META_ACCESS_TOKEN / FB_GRAPH_TOKEN',
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

      return reply.send({
        client: clientConfig ? clientKey : undefined,
        account_id: accountId,
        ...data,
      });
    } catch (err: any) {
      req.log.error(err);
      return reply
        .code(500)
        .send({ error: 'social_kpi_failed', detail: err?.message || String(err) });
    }
  });

  // --- TikTok OAuth ---
  const TIKTOK_REDIRECT_URI = 'https://api.skyhealthmedia.com/auth/tiktok/callback';

  // Step 1: Redirect user to TikTok authorization
  app.get('/auth/tiktok', async (req: FastifyRequest, reply: FastifyReply) => {
    const clientKey = ENV.TIKTOK_CLIENT_KEY;
    if (!clientKey) {
      return reply.code(500).send({ error: 'TIKTOK_CLIENT_KEY not configured' });
    }

    const scope = 'user.info.basic,user.info.stats,video.list';
    const state = Math.random().toString(36).substring(2, 15);
    const authUrl =
      `https://www.tiktok.com/v2/auth/authorize/` +
      `?client_key=${clientKey}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(TIKTOK_REDIRECT_URI)}` +
      `&state=${state}`;

    return reply.redirect(authUrl);
  });

  // Step 2: Handle callback — exchange code for token
  app.get('/auth/tiktok/callback', async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as Record<string, string>;
    const code = q.code;
    const error = q.error;

    if (error) {
      return reply.code(400).send({
        error: 'tiktok_auth_denied',
        detail: q.error_description || error,
      });
    }

    if (!code) {
      return reply.code(400).send({ error: 'missing_code' });
    }

    const clientKey = ENV.TIKTOK_CLIENT_KEY;
    const clientSecret = ENV.TIKTOK_CLIENT_SECRET;
    if (!clientKey || !clientSecret) {
      return reply.code(500).send({ error: 'TikTok credentials not configured' });
    }

    try {
      const tokenData = await exchangeTikTokCode(
        code,
        clientKey,
        clientSecret,
        TIKTOK_REDIRECT_URI
      );

      // Return the tokens — in production, store them securely
      return reply.send({
        success: true,
        message: 'TikTok authorized! Save the access_token as TIKTOK_ACCESS_TOKEN env var in Render.',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        open_id: tokenData.open_id,
        expires_in: tokenData.expires_in,
      });
    } catch (err: any) {
      req.log.error(err);
      return reply.code(500).send({
        error: 'token_exchange_failed',
        detail: err?.message || String(err),
      });
    }
  });

  // Demo prospects
  app.get('/prospects', async (req: FastifyRequest, reply: FastifyReply) => {
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
    await app.listen({ port: PORT, host: '0.0.0.0' });
    app.log.info(`Server listening on :${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();