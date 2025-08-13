
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { ENV } from './env';
import { ga4Handler } from './svc_ga4';
import { socialHandler } from './svc_social';
import { prospectsHandler } from './svc_prospects';

async function build() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: (origin, cb) => cb(null, true), methods: ['GET'] });
  await app.register(rateLimit, { max: 60, timeWindow: '1 minute' });

  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/health')) return;
    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (token !== ENV.AGENT_BEARER) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  app.get('/health', async () => ({ ok: true }));
  app.get('/kpi/ga4', ga4Handler);
  app.get('/kpi/social', socialHandler);
  app.get('/prospects', prospectsHandler);

  return app;
}

build()
  .then(app => app.listen({ port: ENV.PORT, host: '0.0.0.0' }))
  .then(() => console.log(`SkyHealth middleware up on port ${ENV.PORT}`))
  .catch(err => { console.error(err); process.exit(1); });
