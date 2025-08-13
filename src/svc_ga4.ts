
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { ENV } from './env';
import { FastifyRequest, FastifyReply } from 'fastify';

const gaClient = new BetaAnalyticsDataClient();
function int(v: any): number { return Number(v ?? 0); }

export async function ga4Handler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const q = req.query as any;
    const propertyId = String(q.property_id || ENV.GA_PROPERTY_ID || '');
    const topLimit = Number(q.top_limit || 10);
    if (!propertyId) return reply.code(400).send({ error: 'property_id required' });
    const property = `properties/${propertyId}`;

    const [tot7] = await gaClient.runReport({ property, dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }], metrics: [{ name: 'sessions' }, { name: 'totalUsers' }] });
    const [tot28] = await gaClient.runReport({ property, dateRanges: [{ startDate: '28daysAgo', endDate: 'today' }], metrics: [{ name: 'sessions' }, { name: 'totalUsers' }] });
    const [top] = await gaClient.runReport({ property, dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }], metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }], dimensions: [{ name: 'pagePath' }], orderBys: [{ desc: true, metric: { metricName: 'sessions' } }], limit: topLimit });

    const getTotals = (r: any) => {
      const row = r.rows?.[0];
      return { sessions: int(row?.metricValues?.[0]?.value), users: int(row?.metricValues?.[1]?.value) };
    };

    const t7 = getTotals(tot7);
    const t28 = getTotals(tot28);
    const top_pages = (top.rows || []).map((row: any) => ({ path: row.dimensionValues?.[0]?.value || '/', pv: int(row.metricValues?.[0]?.value), sessions: int(row.metricValues?.[1]?.value) }));

    return reply.send({ sessions: { '7d': t7.sessions, '28d': t28.sessions }, users: { '7d': t7.users, '28d': t28.users }, top_pages, events: [], conversions: [] });
  } catch (err: any) {
    req.log.error(err);
    return reply.code(500).send({ error: 'ga4_error', detail: String(err?.message || err) });
  }
}
