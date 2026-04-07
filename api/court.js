import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://orrpowyewsioyxztwkdq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ycnBvd3lld3Npb3l4enR3a2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3ODAwNzMsImV4cCI6MjA4OTM1NjA3M30.4K6ZT-eNOGbvXxJkN_Dt7aLv80GlC0rrTLcIUPExwp0';
const MAPBOX_TOKEN = 'pk.eyJ1IjoibWFzaHJhZnkiLCJhIjoiY21rYnJqd3UwMDc0NTNrcHMzZTNydGR6eiJ9.LJBgJ1mpL1Q9Xv9aoBTwNw';

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

export default async function handler(req, res) {
  const slug = (req.query.slug || '').toLowerCase().trim();
  if (!slug) return res.redirect(302, '/allnet-landing.html');

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Fetch court: exact match first, then fuzzy fallback
  let court = null;
  try {
    let { data } = await sb.from('courts').select('*').eq('slug', slug).maybeSingle();
    if (!data) {
      const pattern = '%' + slug.split('-').join('%') + '%';
      const { data: fuzzy } = await sb.from('courts').select('*').ilike('slug', pattern).limit(1).maybeSingle();
      if (fuzzy) data = fuzzy;
    }
    court = data;
  } catch (e) {
    console.error('Court fetch error:', e);
  }

  if (!court) return res.status(404).send(notFoundPage());

  // Fetch leaderboard
  let leaderboard = [];
  try {
    const { data: lb } = await sb.rpc('get_court_leaderboard', { p_court_id: court.id, p_min_games: 1 });
    if (lb) leaderboard = lb;
  } catch (e) {
    console.error('Leaderboard error:', e);
  }

  // Fetch player slugs for leaderboard links
  let playerSlugs = {};
  if (leaderboard.length > 0) {
    try {
      const ids = leaderboard.map(p => p.user_id);
      const { data: profiles } = await sb.from('profiles').select('id,username,short_code').in('id', ids);
      if (profiles) profiles.forEach(p => { playerSlugs[p.id] = p.username || p.short_code || ''; });
    } catch (e) {}
  }

  // Extract city and type
  const cityMatch = court.address?.match(/,\s*([^,]+),\s*CA/);
  const city = cityMatch ? cityMatch[1].trim() : 'Southern California';
  const courtType = court.court_type === 'indoor' ? 'Indoor' : 'Outdoor';

  // Forecast data
  const forecasts = [
    court.forecast_mon, court.forecast_tue, court.forecast_wed,
    court.forecast_thu, court.forecast_fri, court.forecast_sat, court.forecast_sun
  ];
  const valid = forecasts.filter(f => f != null);
  const maxF = Math.max(...valid, 1);
  const peakIdx = valid.length > 0 ? forecasts.indexOf(Math.max(...valid)) : -1;
  const peakDay = peakIdx >= 0 ? DAYS[peakIdx] : null;

  // Today index (Mon=0 ... Sun=6)
  const jsDow = new Date().getUTCDay();
  const todayIdx = jsDow === 0 ? 6 : jsDow - 1;

  // Static map
  const mapImg = court.lat && court.lng
    ? `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/pin-l+F74501(${court.lng},${court.lat})/${court.lng},${court.lat},14,0/600x300@2x?access_token=${MAPBOX_TOKEN}`
    : null;

  // OG meta
  const ogTitle = `${court.name} — Basketball Court in ${city}`;
  const ogDesc = `${courtType} court in ${city}. ${peakDay ? 'Busiest on ' + peakDay + 's.' : ''} Live activity and player leaderboard on AllNet.`;
  const ogUrl = `https://allnetgames.com/courts/${court.slug}`;
  const ogImage = mapImg || 'https://allnetgames.com/img/icon-512.png';

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org", "@type": "SportsActivityLocation",
    "name": court.name, "sport": "Basketball", "url": ogUrl,
    "address": { "@type": "PostalAddress", "streetAddress": court.address?.split(',')[0] || '', "addressLocality": city, "addressRegion": "CA", "addressCountry": "US" },
    ...(court.lat && court.lng ? { "geo": { "@type": "GeoCoordinates", "latitude": court.lat, "longitude": court.lng } } : {})
  });

  // Forecast bars matching app bottom sheet: blue outline, filled if today
  const bars = forecasts.map((val, i) => {
    const h = val ? Math.max(6, Math.round((val / maxF) * 56)) : 6;
    const isToday = i === todayIdx;
    const style = isToday
      ? 'background:#0077F6;border:1px solid #0077F6;'
      : 'background:transparent;border:1px solid #0077F6;';
    return `<div class="fw"><div class="fb" style="height:${h}px;${style}"></div><span class="${isToday ? 'fl fl--today' : 'fl'}">${DAYS[i]}</span></div>`;
  }).join('');

  // Leaderboard rows
  const lbRows = leaderboard.length > 0 ? leaderboard.map((p, i) => {
    const slug = playerSlugs[p.user_id] || '';
    const href = slug ? `/p/${slug}` : '#';
    const initials = p.initials || (p.name || '??').slice(0, 2).toUpperCase();
    const av = p.avatar_cutout_url
      ? `<img src="${esc(p.avatar_cutout_url)}" class="lb-av" alt="">`
      : `<div class="lb-av lb-av--init">${esc(initials)}</div>`;
    return `<a href="${href}" class="lb-row">
      <span class="lb-rank">${i + 1}</span>${av}
      <div class="lb-info"><div class="lb-name">${esc(p.name || 'Player')}</div><div class="lb-rec">${p.total_wins || 0}W - ${p.total_losses || 0}L</div></div>
      <div class="lb-score">${p.score ? Number(p.score).toFixed(1) : '—'}</div>
    </a>`;
  }).join('') : '<div class="lb-empty">No games played here yet. Be the first!</div>';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(ogTitle)}</title>
<meta name="description" content="${esc(ogDesc)}">
<meta property="og:title" content="${esc(ogTitle)}">
<meta property="og:description" content="${esc(ogDesc)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:url" content="${esc(ogUrl)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/img/icon-192.png" type="image/png">
<link rel="canonical" href="${esc(ogUrl)}">
<script defer data-domain="allnetgames.com" src="https://plausible.io/js/script.tagged-events.js"></script>
<script type="application/ld+json">${jsonLd}</script>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Montserrat:wght@600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0A0A0A;--card:#141414;--el:#1A1A1A;--bdr:#222;--or:#F74501;--ts:#999;--tm:#666;--fd:'Oswald',sans-serif;--fb:'DM Sans',sans-serif;--fm:'JetBrains Mono',monospace;--fh:'Montserrat',sans-serif;--r:12px}
body{background:var(--bg);color:#fff;font-family:var(--fb);-webkit-font-smoothing:antialiased;min-height:100vh}
a{color:inherit;text-decoration:none}
.nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:0 16px;background:rgba(10,10,10,.9);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,.04)}
.nav>div{max-width:600px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;height:56px}
.btn{display:inline-flex;align-items:center;justify-content:center;font-family:var(--fh);font-weight:700;font-size:13px;border:none;border-radius:10px;cursor:pointer;background:var(--or);color:#fff;padding:10px 18px}
.wrap{max-width:600px;margin:0 auto;padding:72px 16px 40px}
.map-img{width:100%;border-radius:var(--r);margin-bottom:20px;border:1px solid var(--bdr)}
.badge{display:inline-flex;align-items:center;gap:6px;font-family:var(--fm);font-size:11px;color:var(--or);padding:4px 10px;background:rgba(247,69,1,.1);border:1px solid rgba(247,69,1,.15);border-radius:100px;margin-bottom:12px}
h1{font-family:var(--fd);font-size:28px;font-weight:700;text-transform:uppercase;line-height:1.05;margin-bottom:8px}
.addr{font-size:14px;color:var(--ts);margin-bottom:20px;line-height:1.5}
.tags{display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap}
.tag{font-family:var(--fm);font-size:11px;color:var(--ts);padding:5px 12px;background:var(--el);border:1px solid var(--bdr);border-radius:100px}
.stitle{font-family:var(--fd);font-size:16px;font-weight:700;text-transform:uppercase;margin-bottom:12px;color:var(--ts)}
.fc{display:flex;gap:4px;align-items:flex-end;padding:16px 12px;background:var(--card);border-radius:var(--r);border:1px solid var(--bdr);margin-bottom:16px;min-height:100px}
.fw{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;justify-content:flex-end}
.fb{width:100%;border-radius:0;min-height:4px}
.fl{font-size:9px;color:var(--tm);font-weight:600;text-transform:uppercase}
.fl--today{color:#fff}
.peak{font-size:13px;color:var(--ts);margin-bottom:24px;line-height:1.5}
.peak strong{color:#fff}
.directions{display:block;text-align:center;margin-bottom:24px;color:var(--ts);font-size:13px;padding:12px;border:1px solid var(--bdr);border-radius:10px;transition:all .2s}
.directions:hover{border-color:#444;color:#fff}
.lb{margin-bottom:24px}
.lb-row{display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid var(--bdr);transition:background .15s}
.lb-row:hover{background:var(--el)}
.lb-row:first-child{border-top:1px solid var(--bdr)}
.lb-rank{font-family:var(--fh);font-weight:800;font-size:16px;color:rgba(247,69,1,.3);width:24px;text-align:center;flex-shrink:0}
.lb-av{width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0;background:var(--el);border:1px solid var(--bdr)}
.lb-av--init{display:flex;align-items:center;justify-content:center;font-family:var(--fh);font-size:12px;font-weight:700;color:var(--tm)}
.lb-info{flex:1;min-width:0}
.lb-name{font-family:var(--fh);font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lb-rec{font-family:var(--fm);font-size:10px;color:var(--tm)}
.lb-score{font-family:var(--fh);font-size:14px;font-weight:700;color:var(--or);flex-shrink:0}
.lb-empty{font-size:13px;color:var(--tm);text-align:center;padding:24px 16px;background:var(--card);border-radius:var(--r);border:1px solid var(--bdr)}
.lb-formula{font-family:var(--fm);font-size:10px;color:var(--tm);margin-top:6px;margin-bottom:24px;text-align:center}
.cta-box{background:var(--card);border:1px solid var(--bdr);border-radius:var(--r);padding:24px;text-align:center;margin-bottom:24px}
.cta-box h2{font-family:var(--fd);font-size:18px;font-weight:700;text-transform:uppercase;margin-bottom:8px}
.cta-box p{font-size:13px;color:var(--ts);margin-bottom:16px;line-height:1.5}
.cta-box .btn{width:100%;padding:14px;font-size:14px}
.footer{text-align:center;padding:24px 0;border-top:1px solid var(--bdr);margin-top:20px}
.footer a{color:var(--or);font-weight:600}
.footer p{font-size:12px;color:var(--tm);margin-top:8px}
</style>
</head>
<body>
<nav class="nav"><div>
  <a href="/allnet-landing.html"><svg height="20" viewBox="0 0 685 318" fill="none"><path d="M546.941 97.7H653.081V121.712H613.757V219.5H586.439V121.712H546.941V97.7Z" fill="white"/><path d="M538.737 121.712H482.883V146.594H516.813V170.606H482.883V195.488H538.737V219.5H455.565V97.7H538.737V121.712Z" fill="white"/><path d="M407.304 97.7H434.622V219.5H407.304V185.744L362.238 144.854V219.5H334.92V97.7H362.238V108.314L407.304 149.03V97.7Z" fill="white"/><path d="M267.07 195.488H322.924V219.5H255.064L239.752 204.188V97.7H267.07V195.488Z" fill="white"/><path d="M172.423 195.488H228.277V219.5H160.417L145.105 204.188V97.7H172.423V195.488Z" fill="white"/><path d="M109.74 97.7L125.052 113.012V219.5H97.734V194.792H58.236V291.5L30.918 307.5V113.012L46.23 97.7H109.74ZM58.236 170.606H97.734V121.712H58.236V170.606Z" fill="white"/><path d="M626 26.5L653 10.5V98.5H626V26.5Z" fill="white"/></svg></a>
  <a href="/allnet-app.html" class="btn">Open App</a>
</div></nav>
<div class="wrap">
${mapImg ? `<img class="map-img" src="${esc(mapImg)}" alt="Map of ${esc(court.name)}" width="600" height="300" loading="eager">` : ''}
<div class="badge">${courtType} Court</div>
<h1>${esc(court.name)}</h1>
<p class="addr">${esc(court.address || city)}</p>
<div class="tags"><span class="tag">${esc(city)}</span><span class="tag">${courtType}</span>${court.is_lit ? '<span class="tag">Lighted</span>' : ''}</div>

<div class="stitle">Weekly Crowd Forecast</div>
<div class="fc">${bars}</div>
${peakDay ? `<p class="peak">Busiest on <strong>${peakDay}s</strong>. ${forecasts[peakIdx] > 60 ? 'Expect full courts.' : 'Good chance of finding a run.'}</p>` : ''}

${court.lat && court.lng ? `<a class="directions" href="https://www.google.com/maps/dir/?api=1&destination=${court.lat},${court.lng}" target="_blank" rel="noopener">📍 Get Directions</a>` : ''}

<div class="stitle">Court Leaderboard</div>
<div class="lb">${lbRows}</div>
${leaderboard.length > 0 ? '<div class="lb-formula">Score = (Skill × 0.4) + (Social × 0.25) + (Win% × 0.35)</div>' : ''}

<div class="cta-box">
  <h2>Play at ${esc(court.name)}</h2>
  <p>See who's here. Start a game. Build your basketball reputation.</p>
  <a href="/allnet-app.html" class="btn">Open AllNet — It's Free</a>
</div>

<div class="footer">
  <a href="/allnet-landing.html">AllNet</a> — The Reputation Network for Pickup Basketball
  <p>266 courts across OC &amp; LA. Free forever.</p>
</div>
</div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).send(html);
}

function notFoundPage() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Court Not Found — AllNet</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>body{background:#0A0A0A;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
.w{max-width:400px;padding:20px}h1{font-size:24px;margin-bottom:12px}p{color:#999;margin-bottom:24px}
a{display:inline-block;padding:14px 28px;background:#F74501;color:#fff;text-decoration:none;border-radius:10px;font-weight:700}</style></head>
<body><div class="w"><h1>Court Not Found</h1><p>This court page doesn't exist. Explore 266 courts across OC &amp; LA on AllNet.</p><a href="/allnet-app.html">Open AllNet</a></div></body></html>`;
}
