import { Request, Response, Router } from "express";

const router = Router();

/**
 * ------------------------------
 * Mock Fetchers (replace with real API calls)
 * ------------------------------
 */
async function fetchInstagramKpis(handles?: string) {
  // TODO: Replace with actual Instagram Graph API logic
  return {
    username: "demo_insta",
    followers: 1234,
    media_count: 56,
  };
}

async function fetchFacebookKpis(handles?: string) {
  // TODO: Replace with real Facebook API logic
  return {
    page_name: "Demo Page",
    followers: 4321,
    likes: 2100,
  };
}

async function fetchYouTubeKpis(handles?: string) {
  // TODO: Replace with YouTube Data API
  return {
    title: "Demo Channel",
    subs: 900,
    views: 45000,
    videos: 75,
  };
}

async function fetchTikTokKpis(handles?: string) {
  // TODO: Implement TikTok integration
  return {
    note: "TikTok integration not yet implemented",
  };
}

/**
 * ------------------------------
 * /kpi/social Route Handler
 * ------------------------------
 */
router.get("/kpi/social", async (req: Request, res: Response) => {
  const { platform, handles } = req.query;

  if (!platform || typeof platform !== "string") {
    return res.status(400).json({ error: "Platform is required (instagram | facebook | youtube | tiktok)" });
  }

  try {
    switch (platform.toLowerCase()) {
      case "instagram":
        return res.json({ instagram: await fetchInstagramKpis(handles as string) });

      case "facebook":
        return res.json({ facebook: await fetchFacebookKpis(handles as string) });

      case "youtube":
        return res.json({ youtube: await fetchYouTubeKpis(handles as string) });

      case "tiktok":
        return res.json({ tiktok: await fetchTikTokKpis(handles as string) });

      default:
        return res.status(400).json({ error: `Unsupported platform: ${platform}` });
    }
  } catch (err) {
    console.error("Error fetching social KPIs:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
