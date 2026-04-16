import fetch from "node-fetch";

// Use current Meta Graph API version (v18.0 is obsolete)
const GRAPH_API = "https://graph.facebook.com/v25.0";

export interface SocialKpiOptions {
  platform: "instagram" | "facebook";
  accountId: string;
  accessToken: string;
}

/**
 * Fetch Instagram media-level insights.
 *
 * As of April 2025, Meta deprecated `impressions` and `plays` on Instagram.
 * The replacement is `views` — a unified metric across all media types.
 * `reach` remains available.
 *
 * Valid for all media types (IMAGE, VIDEO, CAROUSEL_ALBUM, REEL):
 *   - views: total times the media was displayed on screen (includes repeats)
 *   - reach: unique accounts that saw the media
 *
 * No period parameter needed — media insights are always lifetime.
 */
async function getIgPostInsights(
  mediaId: string,
  mediaType: string,
  accessToken: string
): Promise<{ views: number | null; reach: number | null }> {
  let views: number | null = null;
  let reach: number | null = null;

  try {
    const resp = await fetch(
      `${GRAPH_API}/${mediaId}/insights?metric=views,reach&access_token=${accessToken}`
    );
    const data: any = await resp.json();

    if (resp.ok && data.data) {
      for (const metric of data.data) {
        if (metric.name === "views") {
          views = metric.values?.[0]?.value ?? null;
        }
        if (metric.name === "reach") {
          reach = metric.values?.[0]?.value ?? null;
        }
      }
    } else if (data.error) {
      console.warn(
        `IG insights error for media ${mediaId} (${mediaType}): ${data.error.message} [code: ${data.error.code}]`
      );
    }
  } catch (err) {
    console.warn(`IG insights fetch failed for media ${mediaId}:`, err);
  }

  return { views, reach };
}

/**
 * Fetch Facebook POST-level insights (views / reach).
 *
 * IMPORTANT — as of April 2026, this is essentially a no-op:
 *   - `post_impressions` / `post_impressions_unique` were deprecated Nov 15, 2025.
 *   - Meta announced `post_media_view` / `post_media_viewers` as replacements,
 *     but has NOT yet exposed them at the post object level. Full post-level
 *     rollout is expected by the Jun 15, 2026 deadline.
 *   - Only `page_media_view` / `page_media_viewers` (aggregate) work today.
 *
 * We still attempt the post-level call so that when Meta enables it, this
 * starts returning data automatically without a code change. Until then it
 * silently returns `{ views: null, reach: null }` and the page-level total
 * (returned by getFbPageInsights below) is what clients should report on.
 */
async function getFbPostInsights(
  postId: string,
  pageAccessToken: string
): Promise<{ views: number | null; reach: number | null }> {
  try {
    const url = `${GRAPH_API}/${postId}/insights?metric=post_media_view,post_media_viewers&access_token=${pageAccessToken}`;
    const resp = await fetch(url);
    const data: any = await resp.json();

    if (resp.ok && Array.isArray(data.data) && data.data.length > 0) {
      let views: number | null = null;
      let reach: number | null = null;
      for (const metric of data.data) {
        const val = metric.values?.[0]?.value;
        const num = typeof val === "number" ? val : null;
        if (metric.name === "post_media_view" && num !== null) views = num;
        if (metric.name === "post_media_viewers" && num !== null) reach = num;
      }
      return { views, reach };
    }
  } catch {
    // swallow — post-level insights are not yet reliably available
  }

  return { views: null, reach: null };
}

/**
 * Fetch Facebook PAGE-level insights (28-day views and unique viewers).
 *
 * This is the reliable replacement for per-post `views` / `reach` while Meta
 * finishes rolling out post-level metrics. Returns aggregated totals across
 * the last 28 days so reports can say "the page was seen X times by Y unique
 * accounts this month".
 */
async function getFbPageInsights(
  pageId: string,
  pageAccessToken: string
): Promise<{ views_28d: number | null; reach_28d: number | null }> {
  const sumDailyValues = (metric: any): number | null => {
    if (!metric?.values || !Array.isArray(metric.values)) return null;
    let total = 0;
    let found = false;
    for (const v of metric.values) {
      if (typeof v?.value === "number") {
        total += v.value;
        found = true;
      }
    }
    return found ? total : null;
  };

  try {
    const url =
      `${GRAPH_API}/${pageId}/insights` +
      `?metric=page_media_view,page_media_viewers` +
      `&period=day&date_preset=last_28d` +
      `&access_token=${pageAccessToken}`;
    const resp = await fetch(url);
    const data: any = await resp.json();

    if (resp.ok && Array.isArray(data.data) && data.data.length > 0) {
      let views: number | null = null;
      let reach: number | null = null;
      for (const m of data.data) {
        if (m.name === "page_media_view") views = sumDailyValues(m);
        if (m.name === "page_media_viewers") reach = sumDailyValues(m);
      }
      return { views_28d: views, reach_28d: reach };
    }

    if (data.error) {
      console.warn(
        `FB page insights failed for ${pageId}: ${data.error.message} [code: ${data.error.code}]`
      );
    }
  } catch (err) {
    console.warn(`FB page insights fetch failed for ${pageId}:`, err);
  }

  return { views_28d: null, reach_28d: null };
}

/**
 * Try to resolve a Facebook Page access token.
 * Strategy:
 *   1. Call /me/accounts and find the page (user token manages the page)
 *   2. Try using the token directly as a Page token (Page-scoped tokens)
 */
async function resolveFbPageToken(
  accountId: string,
  accessToken: string
): Promise<string> {
  // Strategy 1: /me/accounts
  try {
    const resp = await fetch(
      `${GRAPH_API}/me/accounts?access_token=${accessToken}`
    );
    const data: any = await resp.json();

    if (resp.ok && data.data) {
      const page = data.data.find((p: any) => p.id === accountId);
      if (page?.access_token) {
        return page.access_token;
      }
    }
  } catch {
    // Fall through to strategy 2
  }

  // Strategy 2: Try the token directly
  try {
    const testResp = await fetch(
      `${GRAPH_API}/${accountId}?fields=id,name&access_token=${accessToken}`
    );
    const testData: any = await testResp.json();

    if (testResp.ok && testData.id) {
      return accessToken;
    }
  } catch {
    // Fall through to error
  }

  throw new Error(
    `Cannot access Facebook Page ${accountId}. The token does not manage this page and cannot access it directly. ` +
      `Ensure the page is added to the Meta Business Manager or use a Page-scoped access token.`
  );
}

export async function getSocialKPI(
  { platform, accountId, accessToken }: SocialKpiOptions,
  { postLimit = 5 }: { postLimit?: number } = {}
) {
  if (platform === "instagram") {
    const igFields = `username,followers_count,media_count,media.limit(${postLimit}){id,caption,media_url,media_type,permalink,like_count,comments_count,timestamp}`;

    const resp = await fetch(
      `${GRAPH_API}/${accountId}?fields=${encodeURIComponent(
        igFields
      )}&access_token=${accessToken}`
    );

    const data: any = await resp.json();

    if (!resp.ok) {
      throw new Error(
        `Instagram API error ${resp.status}: ${JSON.stringify(data)}`
      );
    }

    // Fetch insights for each post in parallel
    const posts = data.media?.data || [];
    const postsWithViews = await Promise.all(
      posts.map(async (m: any) => {
        const { views, reach } = await getIgPostInsights(
          m.id,
          m.media_type || "",
          accessToken
        );
        return {
          id: m.id,
          caption: m.caption ?? null,
          media_type: m.media_type ?? null,
          media_url: m.media_url ?? null,
          permalink: m.permalink ?? null,
          like_count: m.like_count ?? 0,
          comments_count: m.comments_count ?? 0,
          views,
          reach,
          timestamp: m.timestamp ?? null,
        };
      })
    );

    return {
      instagram: {
        username: data.username ?? null,
        followers: data.followers_count ?? 0,
        media_count: data.media_count ?? 0,
        posts: postsWithViews,
      },
    };
  }

  if (platform === "facebook") {
    // Resolve page token with fallback strategies
    const pageAccessToken = await resolveFbPageToken(accountId, accessToken);

    // Fetch Page data — include likes/comments/shares on each post
    const fbFields = `id,name,fan_count,posts.limit(${postLimit}){id,message,permalink_url,created_time,likes.summary(true),comments.summary(true),shares}`;

    const resp = await fetch(
      `${GRAPH_API}/${accountId}?fields=${encodeURIComponent(
        fbFields
      )}&access_token=${pageAccessToken}`
    );

    const data: any = await resp.json();

    if (!resp.ok) {
      throw new Error(
        `Facebook API error ${resp.status}: ${JSON.stringify(data)}`
      );
    }

    // Kick off page-level insights + per-post insights in parallel. Page-level
    // views/reach are the reliable "how many people saw our content" signal;
    // per-post views/reach are currently null until Meta completes its
    // post-level media_view rollout (expected Jun 2026).
    const fbPosts = data.posts?.data || [];

    const [pageInsights, fbPostsWithViews] = await Promise.all([
      getFbPageInsights(accountId, pageAccessToken),
      Promise.all(
        fbPosts.map(async (p: any) => {
          const { views, reach } = await getFbPostInsights(
            p.id,
            pageAccessToken
          );
          return {
            id: p.id,
            message: p.message ?? null,
            permalink_url: p.permalink_url ?? null,
            like_count: p.likes?.summary?.total_count ?? 0,
            comments_count: p.comments?.summary?.total_count ?? 0,
            shares_count: p.shares?.count ?? 0,
            views,
            reach,
            created_time: p.created_time ?? null,
          };
        })
      ),
    ]);

    return {
      facebook: {
        page_name: data.name ?? null,
        followers: data.fan_count ?? 0,
        likes: data.fan_count ?? 0,
        page_views_28d: pageInsights.views_28d,
        page_reach_28d: pageInsights.reach_28d,
        posts: fbPostsWithViews,
      },
    };
  }

  throw new Error(`Unsupported platform: ${platform}`);
}
