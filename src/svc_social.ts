// src/svc_social.ts
import fetch from "node-fetch"; // Remove if Node >=18 (use global fetch)

export interface SocialKPIRequest {
  platform: "instagram" | "facebook";
  accountId: string;
  accessToken: string;
}

export interface SocialKPIOptions {
  postLimit?: number;
}

export interface SocialKPIResponse {
  instagram?: {
    username?: string;
    followers?: number;
    media_count?: number;
    posts?: Array<{
      id: string;
      caption?: string;
      media_url?: string;
      permalink?: string;
      like_count?: number;
      comments_count?: number;
      timestamp?: string;
    }>;
  };
  facebook?: {
    page_name?: string;
    followers?: number;
    likes?: number;
    posts?: Array<{
      id: string;
      message?: string;
      permalink_url?: string;
      like_count?: number;
      comments_count?: number;
      created_time?: string;
    }>;
  };
}

export async function getSocialKPI(
  req: SocialKPIRequest,
  opts: SocialKPIOptions = {}
): Promise<SocialKPIResponse> {
  const { platform, accountId, accessToken } = req;
  const { postLimit = 5 } = opts;

  try {
    if (platform === "instagram") {
      // --- Account info ---
      const accountUrl = `https://graph.facebook.com/v18.0/${accountId}?fields=username,followers_count,media_count&access_token=${accessToken}`;
      const accountResp = await fetch(accountUrl);
      if (!accountResp.ok) throw new Error(`Instagram account API error ${accountResp.status}`);
      const accountData: any = await accountResp.json();

      // --- Recent posts ---
      const postsUrl = `https://graph.facebook.com/v18.0/${accountId}/media?fields=id,caption,media_url,permalink,like_count,comments_count,timestamp&limit=${postLimit}&access_token=${accessToken}`;
      const postsResp = await fetch(postsUrl);
      if (!postsResp.ok) throw new Error(`Instagram posts API error ${postsResp.status}`);
      const postsData: any = await postsResp.json();

      return {
        instagram: {
          username: accountData.username,
          followers: accountData.followers_count,
          media_count: accountData.media_count,
          posts: (postsData.data || []).map((p: any) => ({
            id: p.id,
            caption: p.caption,
            media_url: p.media_url,
            permalink: p.permalink,
            like_count: p.like_count,
            comments_count: p.comments_count,
            timestamp: p.timestamp,
          })),
        },
      };
    }

    if (platform === "facebook") {
      // --- Page info ---
      const accountUrl = `https://graph.facebook.com/v18.0/${accountId}?fields=name,followers_count,fan_count&access_token=${accessToken}`;
      const accountResp = await fetch(accountUrl);
      if (!accountResp.ok) throw new Error(`Facebook account API error ${accountResp.status}`);
      const accountData: any = await accountResp.json();

      // --- Recent posts ---
      const postsUrl = `https://graph.facebook.com/v18.0/${accountId}/posts?fields=id,message,permalink_url,created_time,likes.summary(true),comments.summary(true)&limit=${postLimit}&access_token=${accessToken}`;
      const postsResp = await fetch(postsUrl);
      if (!postsResp.ok) throw new Error(`Facebook posts API error ${postsResp.status}`);
      const postsData: any = await postsResp.json();

      return {
        facebook: {
          page_name: accountData.name,
          followers: accountData.followers_count,
          likes: accountData.fan_count,
          posts: (postsData.data || []).map((p: any) => ({
            id: p.id,
            message: p.message,
            permalink_url: p.permalink_url,
            created_time: p.created_time,
            like_count: p.likes?.summary?.total_count ?? 0,
            comments_count: p.comments?.summary?.total_count ?? 0,
          })),
        },
      };
    }

    throw new Error(`Unsupported platform: ${platform}`);
  } catch (err: any) {
    console.error("Error in getSocialKPI:", err);
    throw err;
  }
}
