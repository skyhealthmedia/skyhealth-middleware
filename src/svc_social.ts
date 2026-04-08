import fetch from "node-fetch";

export interface SocialKpiOptions {
  platform: "instagram" | "facebook";
  accountId: string;
  accessToken: string;
}

export async function getSocialKPI(
  { platform, accountId, accessToken }: SocialKpiOptions,
  { postLimit = 5 }: { postLimit?: number } = {}
) {
  if (platform === "instagram") {
    const igFields = `username,followers_count,media_count,media.limit(${postLimit}){id,caption,media_url,permalink,like_count,comments_count,timestamp}`;

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

    // Fetch insights (impressions/reach) for each post
    const posts = data.media?.data || [];
    const postsWithViews = await Promise.all(
      posts.map(async (m: any) => {
        let impressions = null;
        let reach = null;
        try {
          const insightsResp = await fetch(
            `https://graph.facebook.com/v18.0/${m.id}/insights?metric=impressions,reach&access_token=${accessToken}`
          );
          const insightsData: any = await insightsResp.json();
          if (insightsResp.ok && insightsData.data) {
            for (const metric of insightsData.data) {
              if (metric.name === 'impressions') impressions = metric.values?.[0]?.value ?? null;
              if (metric.name === 'reach') reach = metric.values?.[0]?.value ?? null;
            }
          }
        } catch {
          // Insights may not be available for all post types (e.g. stories, reels)
        }
        return {
          id: m.id,
          caption: m.caption ?? null,
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
    // Step 1: Get Page Access Token dynamically
    const accountsResp = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
    );
    const accountsData: any = await accountsResp.json();

    if (!accountsResp.ok) {
      throw new Error(
        `Failed to fetch Page accounts: ${JSON.stringify(accountsData)}`
      );
    }

    const page = (accountsData.data || []).find(
      (p: any) => p.id === accountId
    );

    if (!page || !page.access_token) {
      throw new Error(
        `No Page access token found for accountId=${accountId}`
      );
    }

    const pageAccessToken = page.access_token;

    // Step 2: Fetch Page data using Page Access Token
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

    // Fetch insights (impressions/reach) for each post
    const fbPosts = data.posts?.data || [];
    const fbPostsWithViews = await Promise.all(
      fbPosts.map(async (p: any) => {
        let impressions = null;
        let reach = null;
        try {
          const insightsResp = await fetch(
            `https://graph.facebook.com/v18.0/${p.id}/insights?metric=post_impressions,post_impressions_unique&access_token=${pageAccessToken}`
          );
          const insightsData: any = await insightsResp.json();
          if (insightsResp.ok && insightsData.data) {
            for (const metric of insightsData.data) {
              if (metric.name === 'post_impressions') impressions = metric.values?.[0]?.value ?? null;
              if (metric.name === 'post_impressions_unique') reach = metric.values?.[0]?.value ?? null;
            }
          }
        } catch {
          // Insights may not be available for all post types
        }
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
