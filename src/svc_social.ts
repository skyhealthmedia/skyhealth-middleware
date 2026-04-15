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
 * Fetch Facebook post insights.
 *
 * Requires a Page access token with pages_read_engagement + read_insights.
 * No period parameter needed — post insights default to lifetime.
 *
 * Metrics:
 *   - post_impressions: total times post entered a screen
 *   - post_impressions_unique: unique people who saw it (= reach)
 */
async function getFbPostInsights(
  postId: string,
  pageAccessToken: string
): Promise<{ impressions: number | null; reach: number | null }> {
  let impressions: number | null = null;
  let reach: number | null = null;

  try {
    const resp = await fetch(
      `${GRAPH_API}/${postId}/insights?metric=post_impressions,post_impressions_unique&access_token=${pageAccessToken}`
    );
    const data: any = await resp.json();

    if (resp.ok && data.data) {
      for (const metric of data.data) {
        if (metric.name === "post_impressions") {
          impressions = metric.values?.[0]?.value ?? null;
        }
        if (metric.name === "post_impressions_unique") {
          reach = metric.values?.[0]?.value ?? null;
        }
      }
    } else if (data.error) {
      console.warn(
        `FB insights error for post ${postId}: ${data.error.message} [code: ${data.error.code}]`
      );
    }
  } catch (err) {
    console.warn(`FB insights fetch failed for post ${postId}:`, err);
  }

  return { impressions, reach };
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

    // Fetch insights for each post in parallel
    const fbPosts = data.posts?.data || [];
    const fbPostsWithViews = await Promise.all(
      fbPosts.map(async (p: any) => {
        const { impressions, reach } = await getFbPostInsights(
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
          impressions,
          reach,
          created_time: p.created_time ?? null,
        };
      })
    );

    return {
      facebook: {
        page_name: data.name ?? null,
        followers: data.fan_count ?? 0,
        likes: data.fan_count ?? 0,
        posts: fbPostsWithViews,
      },
    };
  }

  throw new Error(`Unsupported platform: ${platform}`);
}
