import fetch from "node-fetch";

export interface SocialKpiOptions {
  platform: "instagram" | "facebook";
  accountId: string;
  accessToken: string;
}

/**
 * Fetch Instagram post insights. Metric names differ by media type:
 * - IMAGE / CAROUSEL_ALBUM: impressions, reach
 * - VIDEO: impressions, reach  (legacy video)
 * - REEL: plays, reach
 * - STORY: impressions, reach (but only available for 24h)
 */
async function getIgPostInsights(
  mediaId: string,
  mediaType: string,
  accessToken: string
): Promise<{ impressions: number | null; reach: number | null }> {
  let impressions: number | null = null;
  let reach: number | null = null;

  // Reels use "plays" instead of "impressions"
  const isReel = (mediaType || '').toUpperCase() === 'REEL';
  const metrics = isReel ? 'plays,reach' : 'impressions,reach';

  try {
    const resp = await fetch(
      `https://graph.facebook.com/v18.0/${mediaId}/insights?metric=${metrics}&access_token=${accessToken}`
    );
    const data: any = await resp.json();

    if (resp.ok && data.data) {
      for (const metric of data.data) {
        if (metric.name === 'impressions' || metric.name === 'plays') {
          impressions = metric.values?.[0]?.value ?? null;
        }
        if (metric.name === 'reach') {
          reach = metric.values?.[0]?.value ?? null;
        }
      }
    }
  } catch {
    // Insights may not be available (e.g. story expired, permissions)
  }

  return { impressions, reach };
}

/**
 * Fetch Facebook post insights using the Page access token.
 */
async function getFbPostInsights(
  postId: string,
  pageAccessToken: string
): Promise<{ impressions: number | null; reach: number | null }> {
  let impressions: number | null = null;
  let reach: number | null = null;

  try {
    const resp = await fetch(
      `https://graph.facebook.com/v18.0/${postId}/insights?metric=post_impressions,post_impressions_unique&access_token=${pageAccessToken}`
    );
    const data: any = await resp.json();

    if (resp.ok && data.data) {
      for (const metric of data.data) {
        if (metric.name === 'post_impressions') {
          impressions = metric.values?.[0]?.value ?? null;
        }
        if (metric.name === 'post_impressions_unique') {
          reach = metric.values?.[0]?.value ?? null;
        }
      }
    }
  } catch {
    // Insights may not be available for all post types
  }

  return { impressions, reach };
}

/**
 * Try to resolve a Facebook Page access token.
 * Strategy:
 *   1. Call /me/accounts and find the page (works when user token manages the page)
 *   2. If that fails, try using the token directly as a Page token (works for Page-scoped tokens)
 */
async function resolveFbPageToken(
  accountId: string,
  accessToken: string
): Promise<string> {
  // Strategy 1: /me/accounts
  try {
    const resp = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
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

  // Strategy 2: Try the token directly — it may already be a Page-scoped token
  try {
    const testResp = await fetch(
      `https://graph.facebook.com/v18.0/${accountId}?fields=id,name&access_token=${accessToken}`
    );
    const testData: any = await testResp.json();

    if (testResp.ok && testData.id) {
      return accessToken; // Token works directly for this page
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
    // Request media_type so we can use the correct insight metrics per post
    const igFields = `username,followers_count,media_count,media.limit(${postLimit}){id,caption,media_url,media_type,permalink,like_count,comments_count,timestamp}`;

    const resp = await fetch(
      `https://graph.facebook.com/v18.0/${accountId}?fields=${encodeURIComponent(
        igFields
      )}&access_token=${accessToken}`
    );

    const data: any = await resp.json();

    if (!resp.ok) {
      throw new Error(
        `Instagram API error ${resp.status}: ${JSON.stringify(data)}`
      );
    }

    // Fetch insights for each post (parallel)
    const posts = data.media?.data || [];
    const postsWithViews = await Promise.all(
      posts.map(async (m: any) => {
        const { impressions, reach } = await getIgPostInsights(
          m.id,
          m.media_type || '',
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
          impressions,
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

    // Fetch Page data
    const fbFields = `id,name,fan_count,posts.limit(${postLimit}){id,message,permalink_url,created_time}`;

    const resp = await fetch(
      `https://graph.facebook.com/v18.0/${accountId}?fields=${encodeURIComponent(
        fbFields
      )}&access_token=${pageAccessToken}`
    );

    const data: any = await resp.json();

    if (!resp.ok) {
      throw new Error(
        `Facebook API error ${resp.status}: ${JSON.stringify(data)}`
      );
    }

    // Fetch insights for each post (parallel)
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
