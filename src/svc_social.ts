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

    if (!resp.ok) {
      throw new Error(`Instagram account API error ${resp.status}`);
    }

    const data: any = await resp.json();

    return {
      instagram: {
        username: data.username ?? null,
        followers: data.followers_count ?? 0,
        media_count: data.media_count ?? 0,
        posts: (data.media?.data || []).map((m: any) => ({
          id: m.id,
          caption: m.caption ?? null,
          media_url: m.media_url ?? null,
          permalink: m.permalink ?? null,
          like_count: m.like_count ?? 0,
          comments_count: m.comments_count ?? 0,
          timestamp: m.timestamp ?? null,
        })),
      },
    };
  }

  if (platform === "facebook") {
    const fbFields = `id,name,fan_count,followers_count,posts.limit(${postLimit}){id,message,permalink_url,created_time,likes.summary(true),comments.summary(true)}`;

    const resp = await fetch(
      `https://graph.facebook.com/v18.0/${accountId}?fields=${encodeURIComponent(
        fbFields
      )}&access_token=${accessToken}`
    );

    if (!resp.ok) {
      throw new Error(`Facebook account API error ${resp.status}`);
    }

    const data: any = await resp.json();

    return {
      facebook: {
        page_name: data.name ?? null,
        followers: data.followers_count ?? data.fan_count ?? 0,
        likes: data.fan_count ?? 0,
        posts: (data.posts?.data || []).map((p: any) => ({
          id: p.id,
          message: p.message ?? null,
          permalink_url: p.permalink_url ?? null,
          created_time: p.created_time ?? null,
          like_count: p.likes?.summary?.total_count ?? 0,
          comments_count: p.comments?.summary?.total_count ?? 0,
        })),
      },
    };
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

