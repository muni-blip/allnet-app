import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://orrpowyewsioyxztwkdq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ycnBvd3lld3Npb3l4enR3a2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3ODAwNzMsImV4cCI6MjA4OTM1NjA3M30.4K6ZT-eNOGbvXxJkN_Dt7aLv80GlC0rrTLcIUPExwp0';
const MAPBOX_TOKEN = 'pk.eyJ1IjoibWFzaHJhZnkiLCJhIjoiY21rYnJqd3UwMDc0NTNrcHMzZTNydGR6eiJ9.LJBgJ1mpL1Q9Xv9aoBTwNw';

function esc(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function dayLabel(i) { return ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]; }
function busyLevel(val) {
  if (!val || val <= 30) return 'Quiet';
  if (val <= 60) return 'Moderate';
  return 'Busy';
}

export default async function handler(req, res) {
  const slug = (req.query.slug || '').toLowerCase().trim();
  if (!slug) return res.redirect(302, '/allnet-landing.html');

  let court = null;
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data } = await sb.from('courts')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    court = data;
  } catch (e) {
    console.error('Court fetch error:', e);
  }

  if (!court) {
    return res.status(404).send(buildNotFoundPage());
  }

  // Extract city from address
  const cityMatch = court.address?.match(/,\s*([^,]+),\s*CA/);
  const city = cityMatch ? cityMatch[1].trim() : 'Southern California';
  const courtType = court.court_type === 'indoor' ? 'Indoor' : 'Outdoor';

  // Build forecast data
  const forecasts = [
    court.forecast_mon, court.forecast_tue, court.forecast_wed,
    court.forecast_thu, court.forecast_fri, court.forecast_sat, court.forecast_sun
  ];
  const peakDay = forecasts.indexOf(Math.max(...forecasts.filter(f => f != null)));
  const peakDayLabel = peakDay >= 0 ? dayLabel(peakDay) : null;

  // Static map image via Mapbox
  const mapImg = court.lat && court.lng
    ? `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/pin-l+F74501(${court.lng},${court.lat})/${court.lng},${court.lat},14,0/600x300@2x?access_token=${MAPBOX_TOKEN}`
    : null;

  // OG meta
  const ogTitle = `${court.name} — Basketball Court in ${city}`;
  const ogDesc = `${courtType} basketball court in ${city}. ${peakDayLabel ? 'Busiest on ' + peakDayLabel + 's.' : ''} Check live activity, weekly forecasts, and player check-ins on AllNet.`;
  const ogUrl = `https://allnetgames.com/courts/${slug}`;
  const ogImage = mapImg || 'https://allnetgames.com/img/icon-512.png';

  // JSON-LD structured data
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    "name": court.name,
    "description": `${courtType} basketball court in ${city}`,
    "address": {
      "@type": "PostalAddress",
      "streetAddress": court.address?.split(',')[0] || '',
      "addressLocality": city,
      "addressRegion": "CA",
      "addressCountry": "US"
    },
    "sport": "Basketball",
    "url": ogUrl,
    ...(court.lat && court.lng ? {
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": court.lat,
        "longitude": court.lng
      }
    } : {})
  };

  const html = buildCourtPage({ court, city, courtType, forecasts, peakDayLabel, mapImg, ogTitle, ogDesc, ogUrl, ogImage, jsonLd });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).send(html);
}

function buildCourtPage({ court, city, courtType, forecasts, peakDayLabel, mapImg, ogTitle, ogDesc, ogUrl, ogImage, jsonLd }) {
  const forecastBars = forecasts.map((val, i) => {
    const h = val ? Math.max(8, Math.round((val / 100) * 60)) : 8;
    const today = new Date().getDay();
    const dayIdx = (i + 1) % 7; // Mon=0 in our array, JS getDay() Sun=0
    const isToday = dayIdx === today;
    const color = isToday ? '#F74501' : '#3B82F6';
    const opacity = isToday ? '1' : '0.5';
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">
      <div style="width:100%;height:${h}px;background:${color};opacity:${opacity};border-radius:4px"></div>
      <span style="font-size:10px;color:${isToday ? '#F74501' : '#666'};font-weight:${isToday ? '700' : '400'}">${dayLabel(i)}</span>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
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
<meta name="twitter:title" content="${esc(ogTitle)}">
<meta name="twitter:description" content="${esc(ogDesc)}">
<meta name="twitter:image" content="${esc(ogImage)}">
<link rel="icon" href="/img/icon-192.png" type="image/png">
<link rel="canonical" href="${esc(ogUrl)}">
<script defer data-domain="allnetgames.com" src="https://plausible.io/js/script.tagged-events.js"></script>
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Montserrat:wght@600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0A0A0A;--card:#141414;--el:#1A1A1A;--bdr:#222;--or:#F74501;--ts:#999;--tm:#666}
body{background:var(--bg);color:#fff;font-family:'DM Sans',sans-serif;-webkit-font-smoothing:antialiased;min-height:100vh}
a{color:inherit}
.nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:0 16px;background:rgba(10,10,10,.9);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,.04)}
.nav>div{max-width:600px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;height:56px}
.nav a{text-decoration:none}
.btn{display:inline-flex;align-items:center;justify-content:center;font-family:'Montserrat',sans-serif;font-weight:700;font-size:13px;border:none;border-radius:10px;cursor:pointer;background:var(--or);color:#fff;padding:10px 18px;text-decoration:none}
.wrap{max-width:600px;margin:0 auto;padding:72px 16px 40px}
.map-img{width:100%;border-radius:12px;margin-bottom:20px;border:1px solid var(--bdr)}
.badge{display:inline-flex;align-items:center;gap:6px;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--or);padding:4px 10px;background:rgba(247,69,1,.1);border:1px solid rgba(247,69,1,.15);border-radius:100px;margin-bottom:12px}
h1{font-family:'Oswald',sans-serif;font-size:28px;font-weight:700;text-transform:uppercase;line-height:1.05;margin-bottom:8px}
.addr{font-size:14px;color:var(--ts);margin-bottom:20px;line-height:1.5}
.tags{display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap}
.tag{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ts);padding:5px 12px;background:var(--el);border:1px solid var(--bdr);border-radius:100px}
.section-title{font-family:'Oswald',sans-serif;font-size:16px;font-weight:700;text-transform:uppercase;margin-bottom:12px;color:var(--ts)}
.forecast{display:flex;gap:4px;align-items:flex-end;padding:16px;background:var(--card);border-radius:12px;border:1px solid var(--bdr);margin-bottom:24px}
.peak{font-size:13px;color:var(--ts);margin-bottom:24px;line-height:1.5}
.cta-box{background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:24px;text-align:center;margin-bottom:24px}
.cta-box h2{font-family:'Oswald',sans-serif;font-size:18px;font-weight:700;text-transform:uppercase;margin-bottom:8px}
.cta-box p{font-size:13px;color:var(--ts);margin-bottom:16px;line-height:1.5}
.cta-box .btn{width:100%;padding:14px;font-size:14px}
.directions{display:block;text-align:center;margin-bottom:24px;color:var(--ts);font-size:13px;text-decoration:none;padding:12px;border:1px solid var(--bdr);border-radius:10px}
.directions:hover{border-color:#444;color:#fff}
.footer{text-align:center;padding:24px 0;border-top:1px solid var(--bdr);margin-top:20px}
.footer a{color:var(--or);text-decoration:none;font-weight:600}
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
<div class="tags">
  <span class="tag">${esc(city)}</span>
  <span class="tag">${courtType}</span>
  ${court.is_lit ? '<span class="tag">Lighted</span>' : ''}
</div>

<div class="section-title">Weekly Crowd Forecast</div>
<div class="forecast">${forecastBars}</div>
${peakDayLabel ? `<p class="peak">Busiest on <strong>${peakDayLabel}s</strong>. ${forecasts[forecasts.indexOf(Math.max(...forecasts.filter(f=>f!=null)))] > 60 ? 'Expect full courts.' : 'Good chance of finding a run.'}</p>` : ''}

${court.lat && court.lng ? `<a class="directions" href="https://www.google.com/maps/dir/?api=1&destination=${court.lat},${court.lng}" target="_blank" rel="noopener">📍 Get Directions</a>` : ''}

<div class="cta-box">
  <h2>Check in at ${esc(court.name)}</h2>
  <p>See who's playing. Start a game. Build your basketball reputation.</p>
  <a href="/allnet-app.html?court=${esc(court.slug)}" class="btn">Open AllNet — It's Free</a>
</div>

<div class="footer">
  <a href="/allnet-landing.html">AllNet</a> — The Reputation Network for Pickup Basketball
  <p>266 courts across OC &amp; LA. Free forever.</p>
</div>
</div>
</body>
</html>`;
}

function buildNotFoundPage() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Court Not Found — AllNet</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>body{background:#0A0A0A;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
.w{max-width:400px;padding:20px}h1{font-size:24px;margin-bottom:12px}p{color:#999;margin-bottom:24px}
a{display:inline-block;padding:14px 28px;background:#F74501;color:#fff;text-decoration:none;border-radius:10px;font-weight:700}</style></head>
<body><div class="w"><h1>Court Not Found</h1><p>This court page doesn't exist. Explore 266 courts across OC &amp; LA on AllNet.</p><a href="/allnet-app.html">Open AllNet</a></div></body></html>`;
}
