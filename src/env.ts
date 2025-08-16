// src/env.ts

type Env = {
  PORT: number;

  // Auth for your API
  AGENT_BEARER: string;

  // GA4 (optional here, used by svc_ga4)
  GA_PROPERTY_ID?: string;
  GOOGLE_APPLICATION_CREDENTIALS?: string;

  // Meta (Facebook + Instagram)
  META_ACCESS_TOKEN?: string;

  // YouTube
  YT_CLIENT_ID?: string;
  YT_CLIENT_SECRET?: string;
  YT_REFRESH_TOKEN?: string;

  // LinkedIn
  LINKEDIN_ACCESS_TOKEN?: string;

  // TikTok (placeholder)
  TIKTOK_ACCESS_TOKEN?: string;
};

export const ENV: Env = {
  PORT: Number(process.env.PORT || 8080),

  AGENT_BEARER: process.env.AGENT_BEARER || "",

  GA_PROPERTY_ID: process.env.GA_PROPERTY_ID,
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,

  META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN,

  YT_CLIENT_ID: process.env.YT_CLIENT_ID,
  YT_CLIENT_SECRET: process.env.YT_CLIENT_SECRET,
  YT_REFRESH_TOKEN: process.env.YT_REFRESH_TOKEN,

  LINKEDIN_ACCESS_TOKEN: process.env.LINKEDIN_ACCESS_TOKEN,

  TIKTOK_ACCESS_TOKEN: process.env.TIKTOK_ACCESS_TOKEN,
};
