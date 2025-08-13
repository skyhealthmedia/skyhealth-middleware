
import { FastifyRequest, FastifyReply } from 'fastify';

const SAMPLE = [
  { name: "Sunrise Pediatrics", website:"https://example.com", instagram:"https://instagram.com/sunrisepeds", last_post_days: 58, notes: "Low posting cadence; bilingual gap; strong reviews" },
  { name: "Clinica Esperanza", website:null, instagram:"https://instagram.com/clinicaesperanza", last_post_days: 6, notes: "No website; ES-first; candidate for lead form + WhatsApp CTA" },
  { name: "Family Med West", website:"https://fammedwest.example", instagram:null, last_post_days: null, notes: "Site exists; no social; consider Google Maps + website refresh" }
];

export async function prospectsHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const q = req.query as any;
    const limit = Number(q.limit || 25);
    return reply.send(SAMPLE.slice(0, limit));
  } catch (err: any) {
    req.log.error(err);
    return reply.code(500).send({ error: 'prospects_error', detail: String(err?.message || err) });
  }
}
