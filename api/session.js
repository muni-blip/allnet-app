import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = 'https://orrpowyewsioyxztwkdq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ycnBvd3lld3Npb3l4enR3a2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3ODAwNzMsImV4cCI6MjA4OTM1NjA3M30.4K6ZT-eNOGbvXxJkN_Dt7aLv80GlC0rrTLcIUPExwp0';

export default async function handler(req, res) {
  const org = req.query.org || '';
  const code = req.query.code || '';

  if (!org || !code) {
    return res.redirect(302, '/allnet-landing.html');
  }

  // Fetch session data for OG tags
  let sessionInfo = null;
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { data: session } = await sb.from('run_sessions')
      .select('title, date, start_time, end_time, venue_name, max_players, short_code, org_id')
      .eq('short_code', code.toUpperCase())
      .maybeSingle();

    if (session) {
      const { data: orgData } = await sb.from('organizations')
        .select('name, slug')
        .eq('id', session.org_id)
        .eq('slug', org.toLowerCase())
        .maybeSingle();

      if (orgData) {
        // Get confirmed count
        const { count } = await sb.from('session_registrations')
          .select('*', { count: 'exact', head: true })
          .eq('session_id', session.org_id) // need session id
          .eq('status', 'confirmed');

        sessionInfo = { ...session, org_name: orgData.name, confirmed: count || 0 };
      }
    }
  } catch (e) {
    console.error('Session fetch error:', e);
  }

  // Build OG meta
  const dateStr = sessionInfo
    ? new Date(sessionInfo.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : '';

  const timeStr = sessionInfo?.start_time
    ? formatTime(sessionInfo.start_time)
    : '';

  const ogTitle = sessionInfo
    ? `${sessionInfo.title} — ${sessionInfo.org_name}`
    : 'Join this run — AllNet';

  const ogDesc = sessionInfo
    ? `${dateStr} · ${timeStr} · ${sessionInfo.venue_name} · ${sessionInfo.confirmed}/${sessionInfo.max_players} spots filled — Request your spot on AllNet.`
    : 'Request your spot for this basketball session on AllNet.';

  const ogImage = 'https://allnetgames.com/img/icon-512.png';
  const ogUrl = `https://allnetgames.com/r/${encodeURIComponent(org)}/${encodeURIComponent(code)}`;

  // Read the static session page HTML
  let html;
  try {
    html = readFileSync(join(process.cwd(), 'allnet-session.html'), 'utf-8');
  } catch (e) {
    console.error('Could not read allnet-session.html:', e);
    return res.status(500).send('Server error');
  }

  // Replace OG tags
  html = html.replace(
    /<meta property="og:title"[^>]*>/,
    `<meta property="og:title" content="${escapeHtml(ogTitle)}">`
  );
  html = html.replace(
    /<meta property="og:description"[^>]*>/,
    `<meta property="og:description" content="${escapeHtml(ogDesc)}">`
  );
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>AllNet — ${escapeHtml(sessionInfo?.title || 'Session')}</title>`
  );

  // Add og:url and twitter meta
  const extraMeta = `
    <meta property="og:url" content="${ogUrl}">
    <meta name="twitter:title" content="${escapeHtml(ogTitle)}">
    <meta name="twitter:description" content="${escapeHtml(ogDesc)}">
  `;
  html = html.replace('</head>', extraMeta + '</head>');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
  return res.status(200).send(html);
}

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return (hr > 12 ? hr - 12 : hr || 12) + ':' + m + (hr >= 12 ? ' PM' : ' AM');
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
