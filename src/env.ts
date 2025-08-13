
import 'dotenv/config';

const requireEnv = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
};

export const ENV = {
  PORT: Number(process.env.PORT || 8080),
  AGENT_BEARER: requireEnv('AGENT_BEARER'),
  GA_PROPERTY_ID: process.env.GA_PROPERTY_ID,
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN,
  YT_CLIENT_ID: process.env.YT_CLIENT_ID,
  YT_CLIENT_SECRET: process.env.YT_CLIENT_SECRET,
  YT_REFRESH_TOKEN: process.env.YT_REFRESH_TOKEN,
  TIKTOK_ACCESS_TOKEN: process.env.TIKTOK_ACCESS_TOKEN
};
