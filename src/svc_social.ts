// src/svc_social.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { google } from 'googleapis';
import { ENV } from './env';

type J = any;
const toNum = (v: any) => (typeof v === 'number' ? v : Number(v ?? 0)) || 0;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function parseHandles(raw: string): Record<string, string> {
  const entries = String(raw || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      const i = s.indexOf(':');
      if (i === -1) return [s.toLowerCase(), ''] as const;
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
  const handles = parseHandles(q.handles || '');
  const postsLimit = clamp(Number(q.posts_limit || 5), 1, 25);

  const out: Record<string, any> = {};

  // ===================== Instagram (Meta Graph) =====================
  if (handles.ig && ENV.META_ACCESS_TOKEN) {
    try {
      // Account-level
      const igInfoUrl =
        `https://graph.facebook.com/v19.0/${encodeURIComponent(handles.ig)}` +
        `?fields=username,followers_count,media_count&access_token=${encodeURIComponent(ENV.META_ACCESS_TOKEN!)}`;
      const igInfo = await fetchJson(igInfoUrl);
      out.instagram = {
        username: igInfo?.username ?? null,
        followers: toNum(igInfo?.followers_count),
        media_count: toNum(igInfo?.media_count),
      };

      // Recent posts (likes/comments)
      const igMediaUrl =
        `https://graph.facebook.com/v19.0/${encodeURIComponent(handles.ig)}` +
        `/media?fields=id,caption,media_type,permalink,timestamp,like_count,comments_count` +
        `&limit=${postsLimit}&access_token=${encodeURIComponent(ENV.META_ACCESS_TOKEN!)}`;
      const igMedia = await fetchJson(igMediaUrl);
      const ig_posts = Array.isArray(igMedia?.data)
        ? igMedia.data.map((m: any) => ({
            id: m?.id ?? null,
            media_type: m?.media_type ?? null,
            caption: m?.caption ?? null,
            permalink: m?.permalink ?? null,
            timestamp: m?.timestamp ?? null,
            like_count: toNum(m?.like_count),
            comments_count: toNum(m?.comments_count),
          }))
        : [];

      const igLikesAvg = ig_posts.length
        ? Math.round(ig_posts.reduce((a, b) => a + (b.like_count || 0), 0) / ig_posts.length)
        : 0;
      const igCommentsAvg = ig_posts.length
        ? Math.round(ig_posts.reduce((a, b) => a + (b.comments_count || 0), 0) / ig_posts.length)
        : 0;
      const igTop = ig_posts.slice().sort((a, b) => (b.like_count || 0) - (a.like_count || 0))[0] || null;

      out.ig_posts = ig_posts;
      out.ig_summary = {
        posts_looked_at: ig_posts.length,
        avg_likes: igLikesAvg,
        avg_comments: igCommentsAvg,
        top_post: igTop
          ? {
              id: igTop.id,
              permalink: igTop.permalink,
              like_count: igTop.like_count,
              comments_count: igTop.comments_count,
            }
          : null,
      };
    } catch (e: any) {
      req.log.error({ msg: 'instagram_fetch_error', err: String(e) });
    }
  }

  // ===================== Facebook Page (Meta Graph) =====================
  if (handles.fb && ENV.META_ACCESS_TOKEN) {
    try {
      // Page info
      const fbInfoUrl =
        `https://graph.facebook.com/v19.0/${encodeURIComponent(handles.fb)}` +
        `?fields=name,fan_count&access_token=${encodeURIComponent(ENV.META_ACCESS_TOKEN!)}`;
      const fbInfo = await fetchJson(fbInfoUrl);
      out.facebook = {
        name: fbInfo?.name ?? null,
        fans: toNum(fbInfo?.fan_count),
      };

      // Recent posts with reactions/comments summaries
      // Note: for Pages, per-post "likes" are via reactions summary; comments via comments summary.
      const fbPostsUrl =
        `https://graph.facebook.com/v19.0/${encodeURIComponent(handles.fb)}` +
        `/posts?fields=id,permalink_url,message,created_time,shares,` +
        `reactions.summary(true).limit(0),comments.summary(true).limit(0)` +
        `&limit=${postsLimit}&access_token=${encodeURIComponent(ENV.META_ACCESS_TOKEN!)}`;
      const fbPosts = await fetchJson(fbPostsUrl);

      const fb_posts = Array.isArray(fbPosts?.data)
        ? fbPosts.data.map((p: any) => ({
            id: p?.id ?? null,
            message: p?.message ?? null,
            permalink_url: p?.permalink_url ?? null,
            created_time: p?.created_time ?? null,
            reactions_count: toNum(p?.reactions?.summary?.total_count),
            comments_count: toNum(p?.comments?.summary?.total_count),
            shares_count: toNum(p?.shares?.count),
          }))
        : [];

      const fbLikesAvg = fb_posts.length
        ? Math.round(fb_posts.reduce((a, b) => a + (b.reactions_count || 0), 0) / fb_posts.length)
        : 0;
      const fbCommentsAvg = fb_posts.length
        ? Math.round(fb_posts.reduce((a, b) => a + (b.comments_count || 0), 0) / fb_posts.length)
        : 0;
      const fbTop = fb_posts.slice().sort((a, b) => (b.reactions_count || 0) - (a.reactions_count || 0))[0] || null;

      out.fb_posts = fb_posts;
      out.fb_summary = {
        posts_looked_at: fb_posts.length,
        avg_reactions: fbLikesAvg,
        avg_comments: fbCommentsAvg,
        top_post: fbTop
          ? {
              id: fbTop.id,
              permalink_url: fbTop.permalink_url,
              reactions_count: fbTop.reactions_count,
              comments_count: fbTop.comments_count,
              shares_count: fbTop.shares_count,
            }
          : null,
      };
    } catch (e: any) {
      req.log.error({ msg: 'facebook_fetch_error', err: String(e) });
    }
  }

  // ===================== (Existing) YouTube / LinkedIn / TikTok placeholders =====================
  // Keep your previous code here if you already had YT/LI/TT wired.
  // This response focuses on IG/FB post-level metrics requested.

  return reply.send(out);
}
