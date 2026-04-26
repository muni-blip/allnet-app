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

    const { data } = await sb.rpc('get_public_session_info', {
      p_org_slug: org.toLowerCase(),
      p_session_code: code.toUpperCase()
    });

    if (data && !data.error) {
      sessionInfo = {
        title: data.session.title,
        date: data.session.date,
        start_time: data.session.start_time,
        venue_name: data.session.venue_name,
        max_players: data.session.max_players,
        org_name: data.org.name,
        confirmed: data.confirmed_count || 0
      };
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
