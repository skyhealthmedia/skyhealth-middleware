// src/env.ts
import dotenv from 'dotenv';
dotenv.config();

export interface Env {
  PORT?: string;
  AGENT_BEARER?: string;
  GOOGLE_APPLICATION_CREDENTIALS?: string;
  GA_PROPERTY_ID?: string;

  // --- Social tokens ---
  META_ACCESS_TOKEN?: string;
  FB_GRAPH_TOKEN?: string;

  // --- Defaults for account IDs ---
  DEFAULT_IG_ID?: string;
  DEFAULT_FB_ID?: string;

  // --- Optional YouTube/TikTok fields ---
  YT_CLIENT_ID?: string;
  YT_CLIENT_SECRET?: string;
  YT_REFRESH_TOKEN?: string;
  TIKTOK_CLIENT_KEY?: string;
  TIKTOK_CLIENT_SECRET?: string;
  TIKTOK_ACCESS_TOKEN?: string;
}

export const ENV: Env = {
  PORT: process.env.PORT,
  AGENT_BEARER: process.env.AGENT_BEARER,
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  GA_PROPERTY_ID: process.env.GA_PROPERTY_ID,

  META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN,
  FB_GRAPH_TOKEN: process.env.FB_GRAPH_TOKEN,

  DEFAULT_IG_ID: process.env.DEFAULT_IG_ID,
  DEFAULT_FB_ID: process.env.DEFAULT_FB_ID,

  YT_CLIENT_ID: process.env.YT_CLIENT_ID,
  YT_CLIENT_SECRET: process.env.YT_CLIENT_SECRET,
  YT_REFRESH_TOKEN: process.env.YT_REFRESH_TOKEN,
  TIKTOK_CLIENT_KEY: process.env.TIKTOK_CLIENT_KEY,
  TIKTOK_CLIENT_SECRET: process.env.TIKTOK_CLIENT_SECRET,
  TIKTOK_ACCESS_TOKEN: process.env.TIKTOK_ACCESS_TOKEN,
};
