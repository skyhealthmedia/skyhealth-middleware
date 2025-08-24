// src/svc_social.ts
// Strict, typed social KPI service for Instagram & Facebook
// - Fixes TS7006 ("a/b implicitly any") by typing all comparators
// - Normalizes IG/FB posts into a single SocialPost shape
// - Returns account-level + per-post like_count/comments_count

// -------------------- Types --------------------

export type Platform = "instagram" | "facebook";

export interface ServiceConfig {
  platform: Platform;
  accessToken: string;   // Graph API token
  accountId: string;     // IG User ID (for Instagram) or Page ID (for Facebook)
  graphBaseUrl?: string; // override for testing; defaults to https://graph.facebook.com/v19.0
}

export interface SocialPost {
  id: string;
  platform: Platform;
  caption?: string;          // IG: caption; FB: message
  media_type?: string;       // IG only
  media_url?: string;        // IG only
  permalink: string;
  created_time: string;      // ISO string
  like_count: number;        // IG: like_count; FB: reactions.summary.total_count
  comments_count: number;    // IG: comments_count; FB: comments.summary.total_count
}

export interface AccountSummary {
  platform: Platform;
  account_id: string;
  username?: string;        // IG
  name?: string;            // FB Page name
  followers?: number;       // IG only
  media_count?: number;     // IG only
  fan_count?: number;       // FB only: page fans
}

export interface SocialKPI {
  account: AccountSummary;
  posts: SocialPost[];
  top_by_likes: SocialPost[];
  top_by_comments: SocialPost[];
  latest_first: SocialPost[];
}

// -------------------- Helpers --------------------

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Fetch failed (${res.status}): ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

function safeNum(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sortByLikesDesc(a: SocialPost, b: SocialPost): number {
  return b.like_count - a.like_count;
}
function sortByCommentsDesc(a: SocialPost, b: SocialPost): number {
  return b.comments_count - a.comments_count;
}
function sortByDateDesc(a: SocialPost, b: SocialPost): number {
  return new Date(b.created_time).getTime() - new Date(a.created_time).getTime();
}

// -------------------- Instagram --------------------

type IGAccountResp = {
  id: string;
  username: string;
  media_count?: number;
  followers_count?: number;
};

type IGMediaResp = {
  data: Array<{
    id: string;
    caption?: string;
    media_type?: string;
    media_url?: string;
    permalink: string;
    timestamp: string;
    like_count?: number;
    comments_count?: number;
  }>;
  paging?: { next?: string };
};

async function getInstagramAccountSummary(
  cfg: ServiceConfig
): Promise<AccountSummary> {
  const base = cfg.graphBaseUrl ?? "https://graph.facebook.com/v19.0";
  // followers_count requires the IG user to be a business account + permissions
  const fields = ["id", "username", "media_count", "followers_count"].join(",");
  const url = `${base}/${cfg.accountId}?fields=${fields}&access_token=${cfg.accessToken}`;

  const json = await fetchJSON<IGAccountResp>(url);
  return {
    platform: "instagram",
    account_id: json.id,
    username: json.username,
    followers: safeNum(json.followers_count, undefined as unknown as number),
    media_count: safeNum(json.media_count, undefined as unknown as number)
  };
}

async function getInstagramPosts(cfg: ServiceConfig, limit = 50): Promise<SocialPost[]> {
  const base = cfg.graphBaseUrl ?? "https://graph.facebook.com/v19.0";
  const fields = [
    "id",
    "caption",
    "media_type",
    "media_url",
    "permalink",
    "timestamp",
    "like_count",
    "comments_count"
  ].join(",");

  let url = `${base}/${cfg.accountId}/media?fields=${fields}&access_token=${cfg.accessToken}&limit=${Math.min(
    limit,
    100
  )}`;

  const out: SocialPost[] = [];

  while (url && out.length < limit) {
    const page = await fetchJSON<IGMediaResp>(url);
    for (const m of page.data ?? []) {
      if (out.length >= limit) break;
      out.push({
        id: m.id,
        platform: "instagram",
        caption: m.caption,
        media_type: m.media_type,
        media_url: m.media_url,
        permalink: m.permalink,
        created_time: m.timestamp,
        like_count: safeNum(m.like_count),
        comments_count: safeNum(m.comments_count)
      });
    }
    url = page.paging?.next ?? "";
  }

  return out;
}

// -------------------- Facebook --------------------

type FBPageResp = {
  id: string;
  name?: string;
  fan_count?: number;
};

type FBPostsResp = {
  data: Array<{
    id: string;
    message?: string;
    created_time: string;
    permalink_url: string;
    reactions?: { summary?: { total_count?: number } };
    comments?: { summary?: { total_count?: number } };
  }>;
  paging?: { next?: string };
};

async function getFacebookAccountSummary(
  cfg: ServiceConfig
): Promise<AccountSummary> {
  const base = cfg.graphBaseUrl ?? "https://graph.facebook.com/v19.0";
  const fields = ["id", "name", "fan_count"].join(",");
  const url = `${base}/${cfg.accountId}?fields=${fields}&access_token=${cfg.accessToken}`;

  const json = await fetchJSON<FBPageResp>(url);
  return {
    platform: "facebook",
    account_id: json.id,
    name: json.name,
    fan_count: safeNum(json.fan_count, undefined as unknown as number)
  };
}

async function getFacebookPosts(cfg: ServiceConfig, limit = 50): Promise<SocialPost[]> {
  const base = cfg.graphBaseUrl ?? "https://graph.facebook.com/v19.0";
  // Using summary=true avoids paging through edges to count totals
  const fields = [
    "id",
    "message",
    "created_time",
    "permalink_url",
    "reactions.summary(total_true).limit(0)",
    "comments.summary(true).limit(0)"
  ].join(",");

  let url = `${base}/${cfg.accountId}/posts?fields=${fields}&access_token=${cfg.accessToken}&limit=${Math.min(
    limit,
    100
  )}`;

  const out: SocialPost[] = [];

  while (url && out.length < limit) {
    const page = await fetchJSON<FBPostsResp>(url);
    for (const p of page.data ?? []) {
      if (out.length >= limit) break;
      out.push({
        id: p.id,
        platform: "facebook",
        caption: p.message,
        permalink: p.permalink_url,
        created_time: p.created_time,
        like_count: safeNum(p.reactions?.summary?.total_count),
        comments_count: safeNum(p.comments?.summary?.total_count)
      });
    }
    url = page.paging?.next ?? "";
  }

  return out;
}

// -------------------- Public API --------------------

export async function getSocialKPI(
  cfg: ServiceConfig,
  options?: { postLimit?: number }
): Promise<SocialKPI> {
  const postLimit = options?.postLimit ?? 50;

  let account: AccountSummary;
  let posts: SocialPost[];

  if (cfg.platform === "instagram") {
    [account, posts] = await Promise.all([
      getInstagramAccountSummary(cfg),
      getInstagramPosts(cfg, postLimit)
    ]);
  } else if (cfg.platform === "facebook") {
    [account, posts] = await Promise.all([
      getFacebookAccountSummary(cfg),
      getFacebookPosts(cfg, postLimit)
    ]);
  } else {
    throw new Error(`Unsupported platform: ${cfg.platform}`);
  }

  // Derived rankings — comparators are fully typed (no TS7006)
  const top_by_likes = [...posts].sort(sortByLikesDesc).slice(0, 10);
  const top_by_comments = [...posts].sort(sortByCommentsDesc).slice(0, 10);
  const latest_first = [...posts].sort(sortByDateDesc);

  return { account, posts, top_by_likes, top_by_comments, latest_first };
}

// Example thin route-level handler (optional):
// export async function handleSocialKpiRequest(req: Request): Promise<Response> {
//   const { platform, accessToken, accountId } = await req.json();
//   const data = await getSocialKPI({ platform, accessToken, accountId });
//   return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
// }
