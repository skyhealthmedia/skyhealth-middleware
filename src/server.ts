import fs from 'fs';
import path from 'path';

// Serve OpenAPI spec for GPT Actions
app.get('/openapi.yaml', async (req, reply) => {
  const p = path.join(__dirname, '..', 'openapi.yaml');
  const text = fs.readFileSync(p, 'utf8');
  reply.type('text/yaml').send(text);
});
