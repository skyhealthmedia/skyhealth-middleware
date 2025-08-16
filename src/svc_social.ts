import { FastifyRequest, FastifyReply } from 'fastify';
import { google } from 'googleapis';
import { ENV } from './env';

type J = any;
const toNum = (v: any) => (typeof v === 'number' ? v : Number(v ?? 0)) || 0;

function parseHandles(raw: string): Record<string, string> {
  // Accept: "ig:1784..., fb:12345, yt:UCxxx, li:urn:li:organization:123, tt:acct"
  // Trim spaces and split by commas
  const entries = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      const i = s.indexOf(':');
      if (i === -1) return [s, ''] as const;
      const k = s.slice(0, i).trim().toLowerCase();
      const v = s.slice(i + 1).trim();
      return [k, v] as const;
    });
  return Object.fromEntries(entries);
}

async function fetchJson(url: string, init?: RequestInit): Promise<J> {
  const r = await fetch(url, init);
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`${r.status} ${r.statusText} – ${body}`);
  }
  return r.json() as any;
}

export async function socialHandler(req: FastifyRequest, reply: FastifyReply) {
  const q = req.query as any;
  const handlesRaw = String(q.handles || '');
  const handles = parseHandles(handlesRaw);
  const out: Record<string, any> = {};

  try {
    // ===================== Instagram (Meta Graph) =====================
    // Requires:
    //   - ENV.META_ACCESS_TOKEN (Page/System User token)
    //   - handles.ig = Instagram Business/Creator USER ID (starts 1784…)
    if (handles.ig && ENV.META_ACCESS_TOKEN) {
      try {
        const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(
          handles.ig
        )}?fields=username,followers_count,media_count&access_token=${encodeURIComponent(
          ENV.META_ACCESS_TOKEN!
        )}`;
        const j = await fetchJson(url);
        out.instagram = {
          username: j?.username ?? null,
          followers: toNum(j?.followers_count),
          media_count: toNum(j?.media_count),
        };
      } catch (e: any) {
        req.log.error({ msg: 'instagram_fetch_error', err: String(e) });
      }
    }

    // ===================== Facebook Page (Meta Graph) =====================
    // Requires:
    //   - ENV.META_ACCESS_TOKEN (Page/System User token)
    //   - handles.fb = PAGE_ID (numeric)
    if (handles.fb && ENV.META_ACCESS_TOKEN) {
      try {
        const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(
          handles.fb
        )}?fields=name,fan_count&access_token=${encodeURIComponent(
          ENV.META_ACCESS_TOKEN!
        )}`;
        const j = await fetchJson(url);
        out.facebook = {
          name: j?.name ?? null,
          fans: toNum(j?.fan_count),
        };
      } catch (e: any) {
        req.log.error({ msg: 'facebook_fetch_error', err: String(e) });
      }
    }

    // ===================== YouTube Channel =====================
    // Requires:
    //   - ENV.YT_CLIENT_ID, ENV.YT_CLIENT_SECRET, ENV.YT_REFRESH_TOKEN
    //   - handles.yt = CHANNEL_ID (starts UC…)
    if (handles.yt && ENV.YT_CLIENT_ID && ENV.YT_CLIENT_SECRET && ENV.YT_REFRESH_TOKEN) {
      try {
        const oauth2 = new google.auth.OAuth2(ENV.YT_CLIENT_ID, ENV.YT_CLIENT_SECRET);
        oauth2.setCredentials({ refresh_token: ENV.YT_REFRESH_TOKEN });
        const yt = google.youtube({ version: 'v3', auth: oauth2 });
        const resp = await yt.channels.list({
          id: [handles.yt],
          part: ['statistics', 'snippet'],
          maxResults: 1,
        });
        const c = resp.data.items?.[0];
        if (c) {
          out.youtube = {
            title: c?.snippet?.title ?? null,
            subs: toNum(c?.statistics?.subscriberCount),
            views: toNum(c?.statistics?.viewCount),
            videos: toNum(c?.statistics?.videoCount),
          };
        }
      } catch (e: any) {
        req.log.error({ msg: 'youtube_fetch_error', err: String(e) });
      }
    }

    // ===================== LinkedIn Organization =====================
    // Requires:
    //   - ENV.LINKEDIN_ACCESS_TOKEN (Marketing Dev Platform user token)
    //   - handles.li = numeric org id OR full URN ('urn:li:organization:123')
    if (handles.li && ENV.LINKEDIN_ACCESS_TOKEN) {
      try {
        const orgUrn = handles.li.startsWith('urn:li:organization:')
          ? handles.li
          : `urn:li:organization:${handles.li}`;
        const h = {
          Authorization: `Bearer ${ENV.LINKEDIN_ACCESS_TOKEN}`,
          'LinkedIn-Version': '202405',
        } as Record<string, string>;

        // Followers
        const foll = await fetchJson(
          `https://api.linkedin.com/rest/organizationFollowerStatistics?q=organization&organization=${encodeURIComponent(
            orgUrn
          )}`,
          { headers: h }
        );
        const followers = toNum(
          foll?.elements?.[0]?.followerCounts?.organicFollowerCount ??
            foll?.elements?.[0]?.followerCounts?.followerCount
        );

        // Page stats (impressions) – optional; ignore errors
        let impressions = 0;
        try {
          const stats = await fetchJson(
            `https://api.linkedin.com/rest/organizationPageStatistics?q=organization&organization=${encodeURIComponent(
              orgUrn
            )}`,
            { headers: h }
          );
          impressions = toNum(stats?.elements?.[0]?.totalPageStatistics?.impressions);
        } catch (_) {
          /* ignore */
        }

        out.linkedin = { organization: orgUrn, followers, impressions };
      } catch (e: any) {
        req.log.error({ msg: 'linkedin_fetch_error', err: String(e) });
      }
    }

    // ===================== TikTok (placeholder) =====================
    if (handles.tt) {
      out.tiktok = ENV.TIKTOK_ACCESS_TOKEN
        ? { note: 'TikTok Business API token present. Add metrics endpoint when app is approved.' }
        : { note: 'TikTok metrics require TikTok Business API approval and token.' };
    }

    return reply.send(out);
  } catch (err: any) {
    req.log.error(err);
    return reply.code(500).send({ error: 'social_error', detail: String(err?.message || err) });
  }
}
