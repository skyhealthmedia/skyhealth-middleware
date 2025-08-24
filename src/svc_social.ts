// src/svc_social.ts
import fetch from "node-fetch"; // or global fetch if on Node 18+

/**
 * Input type for getSocialKPI
 */
export interface SocialKPIRequest {
  platform: "instagram" | "facebook";
  accountId: string;
  accessToken: string;
}

/**
 * Options (e.g., limit number of posts)
 */
export interface SocialKPIOptions {
  postLimit?: number;
}

/**
 * Response shape (matches openapi.json SocialKpiResponse)
 */
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

/**
 * Fetches KPIs from Instagram or Facebook Graph API.
 * This is called by /kpi/social in server.ts.
 */
export async function getSocialKPI(
  req
