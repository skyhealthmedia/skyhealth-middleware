  // --- /kpi/social (Instagram/Facebook via Graph API) ---
  app.get('/kpi/social', async (req, reply) => {
    try {
      const q = req.query as Record<string, unknown>;
      const platformRaw = String(q.platform || '');
      const accountId = String(q.accountId || '');

      // ✅ Now also checks ENV.META_ACCESS_TOKEN
      const accessToken =
        String(q.accessToken || '') ||
        String(
          (ENV as any).FB_GRAPH_TOKEN ||
          (ENV as any).GRAPH_ACCESS_TOKEN ||
          (ENV as any).META_ACCESS_TOKEN ||
          ''
        );

      const postLimit = q.postLimit ? Number(q.postLimit) : 50;

      if (!platformRaw || (platformRaw !== 'instagram' && platformRaw !== 'facebook')) {
        return reply
          .code(400)
          .send({ error: 'invalid_platform', detail: "Use 'instagram' or 'facebook'." });
      }
      if (!accountId) {
        return reply
          .code(400)
          .send({ error: 'missing_accountId', detail: 'Provide ?accountId=' });
      }
      if (!accessToken) {
        return reply.code(400).send({
          error: 'missing_accessToken',
          detail:
            'Provide ?accessToken= or set ENV.FB_GRAPH_TOKEN / ENV.GRAPH_ACCESS_TOKEN / ENV.META_ACCESS_TOKEN',
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
