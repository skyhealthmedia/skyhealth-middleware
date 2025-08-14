import { FastifyRequest, FastifyReply } from 'fastify';
import fetch from 'node-fetch';
import { google } from 'googleapis';
import { ENV } from './env';

export async function socialHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const handles = String((req.query as any).handles || '');
    const parts: Record<string, string> = Object.fromEntries(
      handles.split(',').filter(Boolean).map(p => {
        const [k, v] = p.split(':');
        return [k.trim(), (v || '').trim()];
      })
    );

    const out: any = {};

    // Instagram via Meta Graph
    if (parts.ig && ENV.META_ACCESS_TOKEN) {
      const fields = 'followers_count,media_count,username';
      const r = await fetch(
        `https://graph.facebook.com/v19.0/${parts.ig}?fields=${fields}&access_token=${ENV.META_ACCESS_TOKEN}`
      );

      if (!r.ok) {
        const errText = await r.text().catch(() => '');
        throw new Error(`Meta Graph error ${r.status}: ${errText}`);
      }

      const j: any = await r.json();

      out.instagram = {
        username: j?.username ?? null,
        followers: typeof j?.followers_count === 'number' ? j.followers_count : null,
        media_count: typeof j?.media_count === 'number' ? j.media_count : null
      };
    }

    // YouTube via OAuth2 refresh token
    if (parts.yt && ENV.YT_CLIENT_ID && ENV.YT_CLIENT_SECRET && ENV.YT_REFRESH_TOKEN) {
      const oauth2 = new google.auth.OAuth2(ENV.YT_CLIENT_ID, ENV.YT_CLIENT_SECRET);
      oauth2.setCredentials({ refresh_token: ENV.YT_REFRESH_TOKEN });
      const yt = google.youtube({ version: 'v3', auth: oauth2 });
      const ch = await yt.channels.list({ id: [parts.yt], part: ['statistics', 'snippet'] });
      const c = ch.data.items?.[0];
      out.youtube = {
        title: c?.snippet?.title,
        subs: Number(c?.statistics?.subscriberCount || 0),
        views: Number(c?.statistics?.viewCount || 0),
        videos: Number(c?.statistics?.videoCount || 0)
      };
    }

    // TikTok placeholder (optional – requires Business API)
    if (parts.tt && ENV.TIKTOK_ACCESS_TOKEN) {
      out.tiktok = { note: 'TikTok wired – add your endpoint logic.' };
    }

    return reply.send(out);
  } catch (err: any) {
    req.log.error(err);
    return reply.code(500).send({ error: 'social_error', detail: String(err?.message || err) });
  }
}
