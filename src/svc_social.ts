// src/svc_social.ts
import fetch from "node-fetch"; // remove if using Node >=18 with native fetch

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
  };
  facebook?: {
    page_name?: string;
    followers?: number;
    likes?: number;
  };
}

export async function getSocialKPI(
  req: SocialKPIRequest,
  opts: SocialKPIOptions = {}
): Promise<SocialKPIResponse> {
  const { platform, accountId, accessToken } = req;
  const { postLimit = 50 } = opts;

  try {
    if (platform === "instagram") {
      const url = `https://graph.facebook.com/v18.0/${accountId}?fields=username,followers_count,media_count&access_token=${accessToken}`;
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`Instagram API error ${resp.status}`);
      }
      const data: any = await resp.json(); // <-- FIXED

      return {
        instagram: {
          username: data.username,
          followers: data.followers_count,
          media_count: data.media_count,
        },
      };
    }

    if (platform === "facebook") {
      const url = `https://graph.facebook.com/v18.0/${accountId}?fields=name,followers_count,fan_count&access_token=${accessToken}`;
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`Facebook API error ${resp.status}`);
      }
      const data: any = await resp.json(); // <-- FIXED

      return {
        facebook: {
          page_name: data.name,
          followers: data.followers_count,
          likes: data.fan_count,
        },
      };
    }

    throw new Error(`Unsupported platform: ${platform}`);
  } catch (err: any) {
    console.error("Error in getSocialKPI:", err);
    throw err;
  }
}

