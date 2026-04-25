import fetch from 'node-fetch';
import { ENV } from './env';

const TIKTOK_API = 'https://open.tiktokapis.com/v2';

// --- In-memory token cache (survives across requests, resets on redeploy) ---
let cachedAccessToken: string | null = null;
let cachedRefreshToken: string | null = null;
let tokenExpiresAt: number = 0; // unix ms

export interface TikTokUserInfo {
  open_id: string;
  display_name: string;
  avatar_url: string | null;
  follower_count: number;
  following_count: number;
  likes_count: number;
  video_count: number;
}

export interface TikTokVideo {
  id: string;
  title: string | null;
  cover_image_url: string | null;
  share_url: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  create_time: number; // unix timestamp
}

export interface TikTokKpiResult {
  tiktok: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    followers: number;
    following: number;
    likes: number;
    video_count: number;
    videos: TikTokVideo[];
  };
}

/**
 * Fetch TikTok user profile info.
 * Uses GET /v2/user/info/ with fields query parameter.
 */
async function getUserInfo(accessToken: string): Promise<TikTokUserInfo> {
  const fields = 'open_id,display_name,avatar_url,follower_count,following_count,likes_count,video_count';
  const resp = await fetch(`${TIKTOK_API}/user/info/?fields=${fields}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data: any = await resp.json();

  if (data.error?.code !== 'ok' && data.error?.code) {
    throw new Error(`TikTok user/info error: ${data.error.code} — ${data.error.message}`);
  }

  const user = data.data?.user || {};
  return {
    open_id: user.open_id || '',
    display_name: user.display_name || '',
    avatar_url: user.avatar_url || null,
    follower_count: user.follower_count ?? 0,
    following_count: user.following_count ?? 0,
    likes_count: user.likes_count ?? 0,
    video_count: user.video_count ?? 0,
  };
}

/**
 * Fetch TikTok videos.
 * Uses POST /v2/video/list/ with cursor-based pagination.
 */
async function getVideos(
  accessToken: string,
  maxResults: number = 10
): Promise<TikTokVideo[]> {
  const fields = 'id,title,cover_image_url,share_url,view_count,like_count,comment_count,share_count,create_time';
  const videos: TikTokVideo[] = [];
  let cursor: number | undefined;
  let hasMore = true;

  while (hasMore && videos.length < maxResults) {
    const body: any = {
      max_count: Math.min(20, maxResults - videos.length),
    };
    if (cursor !== undefined) {
      body.cursor = cursor;
    }

    const resp = await fetch(`${TIKTOK_API}/video/list/?fields=${fields}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data: any = await resp.json();

    if (data.error?.code !== 'ok' && data.error?.code) {
      throw new Error(`TikTok video/list error: ${data.error.code} — ${data.error.message}`);
    }

    const videoList = data.data?.videos || [];
    for (const v of videoList) {
      videos.push({
        id: v.id || '',
        title: v.title || null,
        cover_image_url: v.cover_image_url || null,
        share_url: v.share_url || null,
        view_count: v.view_count ?? 0,
        like_count: v.like_count ?? 0,
        comment_count: v.comment_count ?? 0,
        share_count: v.share_count ?? 0,
        create_time: v.create_time ?? 0,
      });
    }

    hasMore = data.data?.has_more ?? false;
    cursor = data.data?.cursor;
  }

  return videos.slice(0, maxResults);
}

/**
 * Exchange authorization code for access token.
 */
export async function exchangeTikTokCode(
  code: string,
  clientKey: string,
  clientSecret: string,
  redirectUri: string
): Promise<{
  access_token: string;
  refresh_token: string;
  open_id: string;
  expires_in: number;
  refresh_expires_in: number;
}> {
  const resp = await fetch(`${TIKTOK_API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }).toString(),
  });

  const data: any = await resp.json();

  if (data.error || !data.access_token) {
    throw new Error(
      `TikTok token exchange failed: ${data.error || 'no access_token'} — ${data.error_description || JSON.stringify(data)}`
    );
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || '',
    open_id: data.open_id || '',
    expires_in: data.expires_in ?? 86400,
    refresh_expires_in: data.refresh_expires_in ?? 0,
  };
}

/**
 * Refresh an expired TikTok access token.
 */
export async function refreshTikTokToken(
  refreshToken: string,
  clientKey: string,
  clientSecret: string
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const resp = await fetch(`${TIKTOK_API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  });

  const data: any = await resp.json();

  if (data.error || !data.access_token) {
    throw new Error(
      `TikTok token refresh failed: ${data.error || 'no access_token'} — ${data.error_description || JSON.stringify(data)}`
    );
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_in: data.expires_in ?? 86400,
  };
}

/**
 * Resolve a valid TikTok access token.
 *
 * Priority:
 *   1. Cached in-memory token (if not expired)
 *   2. TIKTOK_ACCESS_TOKEN env var (initial seed from OAuth)
 *   3. Auto-refresh using TIKTOK_REFRESH_TOKEN
 *
 * On successful refresh the new tokens are cached in memory so subsequent
 * requests don't need to refresh again. The cache survives for the lifetime
 * of the server process (~24h on Render free tier before spin-down, longer on paid).
 */
async function resolveAccessToken(providedToken?: string): Promise<string> {
  // If caller provided an explicit token, use it directly
  if (providedToken) return providedToken;

  // Check in-memory cache first
  if (cachedAccessToken && Date.now() < tokenExpiresAt) {
    return cachedAccessToken;
  }

  // Try the env var (initial seed)
  const envToken = ENV.TIKTOK_ACCESS_TOKEN;
  if (envToken && !cachedAccessToken) {
    // First time — use env token but we don't know when it expires,
    // so we'll let it fail and then refresh.
    cachedAccessToken = envToken;
    cachedRefreshToken = ENV.TIKTOK_REFRESH_TOKEN || null;
    tokenExpiresAt = 0; // unknown, will try and refresh on failure
    return envToken;
  }

  // Try refreshing
  const refreshToken = cachedRefreshToken || ENV.TIKTOK_REFRESH_TOKEN;
  const clientKey = ENV.TIKTOK_CLIENT_KEY;
  const clientSecret = ENV.TIKTOK_CLIENT_SECRET;

  if (refreshToken && clientKey && clientSecret) {
    console.log('[TikTok] Access token expired, refreshing...');
    const refreshed = await refreshTikTokToken(refreshToken, clientKey, clientSecret);
    cachedAccessToken = refreshed.access_token;
    cachedRefreshToken = refreshed.refresh_token;
    tokenExpiresAt = Date.now() + (refreshed.expires_in - 300) * 1000; // 5 min buffer
    console.log('[TikTok] Token refreshed successfully, expires in', refreshed.expires_in, 'seconds');
    return cachedAccessToken;
  }

  throw new Error(
    'No valid TikTok access token available. Visit /auth/tiktok to authorize, ' +
    'then set TIKTOK_ACCESS_TOKEN and TIKTOK_REFRESH_TOKEN in Render.'
  );
}

/**
 * Main entry: fetch TikTok KPIs (profile + videos).
 * Automatically refreshes expired tokens.
 */
export async function getTikTokKPI(
  providedToken: string,
  { postLimit = 10 }: { postLimit?: number } = {}
): Promise<TikTokKpiResult> {
  let token = await resolveAccessToken(providedToken || undefined);

  try {
    const [userInfo, videos] = await Promise.all([
      getUserInfo(token),
      getVideos(token, postLimit),
    ]);

    return {
      tiktok: {
        username: null,
        display_name: userInfo.display_name || null,
        avatar_url: userInfo.avatar_url,
        followers: userInfo.follower_count,
        following: userInfo.following_count,
        likes: userInfo.likes_count,
        video_count: userInfo.video_count,
        videos,
      },
    };
  } catch (err: any) {
    // If token was invalid, try refreshing once and retry
    if (err?.message?.includes('access_token_invalid') || err?.message?.includes('token')) {
      const refreshToken = cachedRefreshToken || ENV.TIKTOK_REFRESH_TOKEN;
      const clientKey = ENV.TIKTOK_CLIENT_KEY;
      const clientSecret = ENV.TIKTOK_CLIENT_SECRET;

      if (refreshToken && clientKey && clientSecret) {
        console.log('[TikTok] Token invalid, attempting refresh...');
        const refreshed = await refreshTikTokToken(refreshToken, clientKey, clientSecret);
        cachedAccessToken = refreshed.access_token;
        cachedRefreshToken = refreshed.refresh_token;
        tokenExpiresAt = Date.now() + (refreshed.expires_in - 300) * 1000;
        token = cachedAccessToken;
        console.log('[TikTok] Token refreshed after failure, retrying...');

        const [userInfo, videos] = await Promise.all([
          getUserInfo(token),
          getVideos(token, postLimit),
        ]);

        return {
          tiktok: {
            username: null,
            display_name: userInfo.display_name || null,
            avatar_url: userInfo.avatar_url,
            followers: userInfo.follower_count,
            following: userInfo.following_count,
            likes: userInfo.likes_count,
            video_count: userInfo.video_count,
            videos,
          },
        };
      }
    }

    throw err;
  }
}
