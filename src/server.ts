  // --- /kpi/social (Instagram/Facebook via Graph API) ---
  app.get('/kpi/social', async (req, reply) => {
    try {
      const q = req.query as Record<string, unknown>;
      const platformRaw = String(q.platform || '');
      const accessToken =
        String(q.accessToken || '') ||
        String((ENV as any).META_ACCESS_TOKEN || (ENV as any).FB_GRAPH_TOKEN || '');

      const postLimit = q.postLimit ? Number(q.postLimit) : 50;

      if (!platformRaw || (platformRaw !== 'instagram' && platformRaw !== 'facebook')) {
        return reply
          .code(400)
          .send({ error: 'invalid_platform', detail: "Use 'instagram' or 'facebook'." });
      }

      // ✅ Auto-pick account ID if not provided
      let accountId = String(q.accountId || '');
      if (!accountId) {
        accountId =
          platformRaw === 'instagram'
            ? (ENV as any).DEFAULT_IG_ID
            : (ENV as any).DEFAULT_FB_ID;
      }

      if (!accessToken) {
        return reply.code(400).send({
          error: 'missing_accessToken',
          detail: 'Provide ?accessToken= or set META_ACCESS_TOKEN / FB_GRAPH_TOKEN',
        });
      }

      const data = await getSocialKPI(
        {
          platform: platformRaw as 'instagram' | 'facebook',
          accessToken,
          accountId,
        },
        { postLimit }
      );

      return reply.send(data);
    } catch (err: any) {
      req.log.error(err);
      return reply
        .code(500)
        .send({ error: 'social_kpi_failed', detail: err?.message || String(err) });
    }
  });

