/* ══════════════════════════════
   DATA — loaded from Supabase
   ══════════════════════════════ */
const courts = [];

const dayLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
let currentFilter = 'all';
let visibleCourtCount = 0;
let courtsLayersReady = false;
let userCheckins = [];
let checkinCourts = new Set();

/* ══════════════════════════════
   VARIANT C — Public Player Card (bottom sheet)
   Uses shared CareerCard component
   ══════════════════════════════ */
async function showPlayerCard(name, userId) {
  if (!userId) return;
  const overlay = document.getElementById('playerSheetOverlay');
  const cardEl = document.getElementById('playerSheetCard');
  const badgeEl = document.getElementById('playerSheetBadge');
  if (!overlay || !cardEl) return;

  // Show overlay immediately with spinner
  cardEl.innerHTML = '<div class="player-sheet__loader"><div class="player-sheet__spinner"></div></div>';
  if (badgeEl) badgeEl.innerHTML = '';
  overlay.classList.add('active');

  try {
    const [{ data: player }, { data: stats }, { data: topCourt }] = await Promise.all([
      supabase.from('profiles')
        .select('id, first_name, last_name, name, avatar_url, avatar_cutout_url, selected_cover, social_rating, skill_rating, is_founding_hooper, founding_number')
        .eq('id', userId).single(),
      supabase.from('player_division_stats')
        .select('*').eq('user_id', userId),
      supabase.from('checkins')
        .select('court_id, courts(name)')
        .eq('user_id', userId)
    ]);

    // If overlay was closed while loading, bail out
    if (!overlay.classList.contains('active')) return;
    if (!player) { overlay.classList.remove('active'); return; }

    // Populate badge area
    if (badgeEl) {
      let badgeHtml = '';
      if (player.is_founding_hooper) {
        badgeHtml += '<div class="badge-pill">🏅 Founding Hooper #' + (player.founding_number || '') + '</div>';
      }
      if (topCourt && topCourt.length > 0) {
        const courtCounts = {};
        topCourt.forEach(c => { const n = c.courts?.name; if (n) courtCounts[n] = (courtCounts[n] || 0) + 1; });
        const best = Object.entries(courtCounts).sort((a, b) => b[1] - a[1])[0];
        if (best) badgeHtml += '<div class="badge-court">📍 Most played: ' + best[0] + '</div>';
      }
      badgeEl.innerHTML = badgeHtml;
    }

    const divStats = {};
    let bestDiv = '1v1', bestGames = 0;
    if (stats) stats.forEach(s => {
      divStats[s.division] = s;
      if (s.games_count > bestGames) { bestGames = s.games_count; bestDiv = s.division; }
    });

    overlay._playerData = { player, divStats, activeDivision: bestGames > 0 ? bestDiv : '1v1' };
    renderPlayerSheetCard();
  } catch (err) {
    console.error('showPlayerCard error:', err);
    if (overlay.classList.contains('active')) overlay.classList.remove('active');
  }
}

function renderPlayerSheetCard() {
  const overlay = document.getElementById('playerSheetOverlay');
  const cardEl = document.getElementById('playerSheetCard');
  if (!overlay?._playerData || !cardEl) return;
  const { player, divStats, activeDivision } = overlay._playerData;
  const ds = divStats[activeDivision];

  cardEl.innerHTML = CareerCard.render({
    cardId: 'psc',
    firstName: player.first_name || player.name?.split(' ')[0] || '',
    lastName: player.last_name || player.name?.split(' ').slice(1).join(' ') || '',
    cutoutUrl: player.avatar_cutout_url,
    avatarUrl: player.avatar_url,
    coverSlug: player.selected_cover || 'crossover',
    wins: ds?.wins || 0, losses: ds?.losses || 0, draws: ds?.draws || 0,
    skillRating: ds?.skill_rating ? Number(ds.skill_rating).toFixed(1) : '—',
    socialRating: player.social_rating ? Number(player.social_rating).toFixed(1) : '—',
    divisionLabel: activeDivision.toUpperCase(),
    activeDivision: activeDivision,
    showTabs: true,
    onTabClick: 'switchPlayerSheetDiv',
    showDeltas: false
  });
  requestAnimationFrame(() => CareerCard.fitNames('psc'));
}

function switchPlayerSheetDiv(div) {
  const overlay = document.getElementById('playerSheetOverlay');
  if (!overlay?._playerData) return;
  overlay._playerData.activeDivision = div;
  renderPlayerSheetCard();
}

function closePlayerSheet(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('playerSheetOverlay').classList.remove('active');
}

function closePlayerCard() { closePlayerSheet(); }

/* ══════════════════════════════
   VARIANT A — Rating Update Overlay
   Uses shared CareerCard component with deltas
   ══════════════════════════════ */
async function checkRatingUpdates() {
  if (!currentUser) return;
  const { data: updates, error } = await supabase
    .from('rating_updates').select('*')
    .eq('user_id', currentUser.id).eq('seen', false)
    .order('created_at', { ascending: false });
  if (error || !updates || updates.length === 0) return;
  showRatingOverlay(updates[0], updates);
}

async function showRatingOverlay(latestUpdate, allUpdates) {
  const overlay = document.getElementById('ratingOverlay');
  if (!overlay) return;

  const { data: stats } = await supabase.from('player_division_stats')
    .select('*').eq('user_id', currentUser.id);
  const divStats = {};
  if (stats) stats.forEach(s => { divStats[s.division] = s; });

  overlay._ratingData = {
    profile: currentProfile, divStats,
    activeDivision: latestUpdate.division,
    allUpdates,
    shouldAnimate: true  // first render triggers animation
  };

  renderRatingOverlayCard();
  overlay.classList.add('active');
}

function renderRatingOverlayCard() {
  const overlay = document.getElementById('ratingOverlay');
  const cardEl = document.getElementById('ratingOverlayCard');
  if (!overlay?._ratingData || !cardEl) return;
  const { profile, divStats, activeDivision, allUpdates, shouldAnimate } = overlay._ratingData;
  const ds = divStats[activeDivision];
  const divUpdate = allUpdates.find(u => u.division === activeDivision);

  const wins = ds?.wins || 0, losses = ds?.losses || 0, draws = ds?.draws || 0;
  const skillVal = ds?.skill_rating ? Number(ds.skill_rating) : 0;
  const socialVal = profile.social_rating ? Number(profile.social_rating) : 0;
  const skDelta = divUpdate?.skill_delta != null ? Number(divUpdate.skill_delta) : null;
  const soDelta = divUpdate?.social_delta != null ? Number(divUpdate.social_delta) : null;
  const wDelta = divUpdate?.wins_delta || 0;
  const lDelta = divUpdate?.losses_delta || 0;
  const dDelta = divUpdate?.draws_delta || 0;

  cardEl.innerHTML = CareerCard.render({
    cardId: 'rov',
    firstName: profile.first_name || profile.name?.split(' ')[0] || '',
    lastName: profile.last_name || profile.name?.split(' ').slice(1).join(' ') || '',
    cutoutUrl: profile.avatar_cutout_url,
    avatarUrl: profile.avatar_url,
    coverSlug: profile.selected_cover || 'crossover',
    wins: wins, losses: losses, draws: draws,
    skillRating: skillVal ? skillVal.toFixed(1) : '—',
    socialRating: socialVal ? socialVal.toFixed(1) : '—',
    divisionLabel: activeDivision.toUpperCase(),
    activeDivision: activeDivision,
    showTabs: true,
    onTabClick: 'switchRatingOverlayDiv',
    showDeltas: true,
    skillDelta: skDelta,
    socialDelta: soDelta,
    winsDelta: wDelta,
    lossesDelta: lDelta,
    drawsDelta: dDelta
  });

  requestAnimationFrame(() => {
    CareerCard.fitNames('rov');

    // Animate numbers on first show (not on tab switch)
    if (shouldAnimate && divUpdate) {
      overlay._ratingData.shouldAnimate = false;

      setTimeout(() => {
        CareerCard.animateValues('ratingOverlayCard', {
          winsFrom:   wins - wDelta,   winsTo:   wins,
          lossesFrom: losses - lDelta, lossesTo: losses,
          drawsFrom:  draws - dDelta,  drawsTo:  draws,
          skillFrom:  skDelta != null ? skillVal - skDelta : skillVal,
          skillTo:    skillVal,
          socialFrom: soDelta != null ? socialVal - soDelta : socialVal,
          socialTo:   socialVal,
          duration:   1400,
          stagger:    250
        });
      }, 300); // slight delay after overlay appears
    }
  });
}

function switchRatingOverlayDiv(div) {
  const overlay = document.getElementById('ratingOverlay');
  if (!overlay?._ratingData) return;
  overlay._ratingData.activeDivision = div;
  renderRatingOverlayCard();
}

async function dismissRatingOverlay() {
  document.getElementById('ratingOverlay').classList.remove('active');
  if (currentUser) {
    await supabase.from('rating_updates')
      .update({ seen: true })
      .eq('user_id', currentUser.id).eq('seen', false);
  }
}

/* ══════════════════════════════
   MAP INIT
   ══════════════════════════════ */
mapboxgl.accessToken = 'pk.eyJ1IjoibWFzaHJhZnkiLCJhIjoiY21rYnJqd3UwMDc0NTNrcHMzZTNydGR6eiJ9.LJBgJ1mpL1Q9Xv9aoBTwNw';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/dark-v11',
  center: [-117.83, 33.68],
  zoom: 10.5,
  attributionControl: false,
});

map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

/* ══════════════════════════════
   RADIUS CIRCLE + USER PIN
   Visual radius overlay & basketball pin marker
   ══════════════════════════════ */
let userPinMarker = null;
let radiusSourceAdded = false;

// Basketball pin SVG (inline from you-pin.svg — includes "YOU" text)
const USER_PIN_SVG = `<svg width="36" height="63" viewBox="0 0 24 42" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M24 22C24 28.6274 16 42 12 42C7.5 42 0 28.6274 0 22C0 15.3726 5.37258 10 12 10C18.6274 10 24 15.3726 24 22Z" fill="white"/>
<g clip-path="url(#clip0_pin)">
<path d="M12 31.375C17.1777 31.375 21.375 27.1777 21.375 22C21.375 16.8223 17.1777 12.625 12 12.625C6.82233 12.625 2.625 16.8223 2.625 22C2.625 27.1777 6.82233 31.375 12 31.375Z" fill="url(#paint0_pin)"/>
<mask id="mask0_pin" style="mask-type:luminance" maskUnits="userSpaceOnUse" x="2" y="12" width="20" height="20"><path d="M12 31.375C17.1777 31.375 21.375 27.1777 21.375 22C21.375 16.8223 17.1777 12.625 12 12.625C6.82233 12.625 2.625 16.8223 2.625 22C2.625 27.1777 6.82233 31.375 12 31.375Z" fill="white"/></mask>
<g mask="url(#mask0_pin)"><path d="M1.947 22.819C1.947 22.819 4.647 25.706 11.961 25.706C19.275 25.706 22.038 22.819 22.038 22.819" stroke="#BE3A26" stroke-width="0.78" stroke-miterlimit="10"/></g>
<mask id="mask1_pin" style="mask-type:luminance" maskUnits="userSpaceOnUse" x="2" y="12" width="20" height="20"><path d="M12 31.375C17.1777 31.375 21.375 27.1777 21.375 22C21.375 16.8223 17.1777 12.625 12 12.625C6.82233 12.625 2.625 16.8223 2.625 22C2.625 27.1777 6.82233 31.375 12 31.375Z" fill="white"/></mask>
<g mask="url(#mask1_pin)"><path d="M12 12.011V31.944" stroke="#BE3A26" stroke-width="0.78" stroke-miterlimit="10"/></g>
<mask id="mask2_pin" style="mask-type:luminance" maskUnits="userSpaceOnUse" x="2" y="12" width="20" height="20"><path d="M12 31.375C17.1777 31.375 21.375 27.1777 21.375 22C21.375 16.8223 17.1777 12.625 12 12.625C6.82233 12.625 2.625 16.8223 2.625 22C2.625 27.1777 6.82233 31.375 12 31.375Z" fill="white"/></mask>
<g mask="url(#mask2_pin)"><path d="M3.956 15.997C3.956 15.997 7.503 17.534 8.664 22.024C9.825 26.513 6.656 31.378 6.656 31.378" stroke="#BE3A26" stroke-width="0.78" stroke-miterlimit="10"/></g>
<mask id="mask3_pin" style="mask-type:luminance" maskUnits="userSpaceOnUse" x="2" y="12" width="20" height="20"><path d="M12 31.375C17.1777 31.375 21.375 27.1777 21.375 22C21.375 16.8223 17.1777 12.625 12 12.625C6.82233 12.625 2.625 16.8223 2.625 22C2.625 27.1777 6.82233 31.375 12 31.375Z" fill="white"/></mask>
<g mask="url(#mask3_pin)"><path d="M20.013 15.997C20.013 15.997 16.466 17.534 15.305 22.024C14.144 26.513 17.313 31.378 17.313 31.378" stroke="#BE3A26" stroke-width="0.78" stroke-miterlimit="10"/></g>
</g>
<path d="M18.5507 6.13C17.9507 6.13 17.4373 6.023 17.0107 5.81C16.5907 5.59 16.2673 5.283 16.0407 4.89C15.814 4.49 15.7007 4.023 15.7007 3.49V0.22H17.6307V3.43C17.6307 3.817 17.7107 4.107 17.8707 4.3C18.0307 4.493 18.264 4.59 18.5707 4.59C18.8773 4.59 19.1073 4.493 19.2607 4.3C19.4207 4.107 19.5007 3.817 19.5007 3.43V0.22H21.3907V3.49C21.3907 4.023 21.2807 4.49 21.0607 4.89C20.8407 5.283 20.5173 5.59 20.0907 5.81C19.664 6.023 19.1507 6.13 18.5507 6.13Z" fill="white"/>
<path d="M11.5036 6.13C10.8703 6.13 10.3036 6 9.8036 5.74C9.3036 5.48 8.91027 5.123 8.6236 4.67C8.33694 4.21 8.1936 3.69 8.1936 3.11C8.1936 2.523 8.33694 2.003 8.6236 1.55C8.91027 1.097 9.3036 0.74 9.8036 0.48C10.3036 0.22 10.8703 0.09 11.5036 0.09C12.1369 0.09 12.7036 0.22 13.2036 0.48C13.7036 0.74 14.0969 1.097 14.3836 1.55C14.6703 2.003 14.8136 2.523 14.8136 3.11C14.8136 3.69 14.6703 4.21 14.3836 4.67C14.0969 5.123 13.7036 5.48 13.2036 5.74C12.7036 6 12.1369 6.13 11.5036 6.13ZM11.5036 4.59C11.7703 4.59 12.0036 4.527 12.2036 4.4C12.4103 4.273 12.5703 4.1 12.6836 3.88C12.8036 3.653 12.8636 3.397 12.8636 3.11C12.8636 2.817 12.8036 2.56 12.6836 2.34C12.5703 2.12 12.4103 1.947 12.2036 1.82C12.0036 1.693 11.7703 1.63 11.5036 1.63C11.2436 1.63 11.0103 1.693 10.8036 1.82C10.5969 1.94 10.4336 2.113 10.3136 2.34C10.1936 2.567 10.1336 2.823 10.1336 3.11C10.1336 3.397 10.1936 3.653 10.3136 3.88C10.4336 4.1 10.5969 4.273 10.8036 4.4C11.0103 4.527 11.2436 4.59 11.5036 4.59Z" fill="white"/>
<path d="M4.13494 6V3.5L4.48494 4.64L1.81494 0.22H3.85494L5.69494 3.28H4.61494L6.45494 0.22H8.38494L5.71494 4.64L6.06494 3.5V6H4.13494Z" fill="white"/>
<defs>
<radialGradient id="paint0_pin" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(11.937 16.318) scale(10.227)">
<stop offset="0.006" stop-color="#F8981D"/><stop offset="1" stop-color="#F47C20"/>
</radialGradient>
<clipPath id="clip0_pin"><rect width="20" height="20" fill="white" transform="translate(2 12)"/></clipPath>
</defs>
</svg>`;

function createGeoJSONCircle(lng, lat, radiusMi, points) {
  points = points || 64;
  const km = radiusMi * 1.60934;
  const ret = [];
  const distanceX = km / (111.32 * Math.cos(lat * Math.PI / 180));
  const distanceY = km / 110.574;
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    ret.push([lng + (distanceX * Math.cos(theta)), lat + (distanceY * Math.sin(theta))]);
  }
  ret.push(ret[0]); // close the ring
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ret] } };
}

function showRadiusVisuals() {
  if (userLat === null || userLng === null || !nearMeActive || radiusMiles === 0) return;

  const circleGeoJSON = createGeoJSONCircle(userLng, userLat, radiusMiles);

  // ── Radius circle layer ──
  if (radiusSourceAdded) {
    map.getSource('radius-circle')?.setData(circleGeoJSON);
    map.getSource('radius-pulse')?.setData(circleGeoJSON);
    // Make sure layers are visible
    map.setLayoutProperty('radius-fill', 'visibility', 'visible');
    map.setLayoutProperty('radius-stroke', 'visibility', 'visible');
    map.setLayoutProperty('radius-pulse-fill', 'visibility', 'visible');
  } else {
    map.addSource('radius-circle', { type: 'geojson', data: circleGeoJSON });
    map.addSource('radius-pulse', { type: 'geojson', data: circleGeoJSON });

    // Pulse layer (animated — sits below the main circle)
    map.addLayer({
      id: 'radius-pulse-fill',
      type: 'fill',
      source: 'radius-pulse',
      paint: { 'fill-color': '#F74501', 'fill-opacity': 0 }
    }, 'courts-dots');

    // Semi-transparent orange fill
    map.addLayer({
      id: 'radius-fill',
      type: 'fill',
      source: 'radius-circle',
      paint: { 'fill-color': '#F74501', 'fill-opacity': 0.10 }
    }, 'courts-dots');

    // Orange border stroke
    map.addLayer({
      id: 'radius-stroke',
      type: 'line',
      source: 'radius-circle',
      paint: { 'line-color': '#F74501', 'line-width': 2, 'line-opacity': 0.7 }
    }, 'courts-dots');

    radiusSourceAdded = true;
  }

  // ── User location pin ──
  if (!userPinMarker) {
    const pinEl = document.createElement('div');
    pinEl.innerHTML = USER_PIN_SVG;
    pinEl.style.cssText = 'cursor:pointer;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5));';
    userPinMarker = new mapboxgl.Marker({ element: pinEl, anchor: 'bottom' })
      .setLngLat([userLng, userLat])
      .addTo(map);
  } else {
    userPinMarker.setLngLat([userLng, userLat]);
    userPinMarker.addTo(map);
  }

  // Fire radar pulse
  triggerRadarPulse();
}

function hideRadiusVisuals() {
  if (radiusSourceAdded) {
    try {
      map.setLayoutProperty('radius-fill', 'visibility', 'none');
      map.setLayoutProperty('radius-stroke', 'visibility', 'none');
      map.setLayoutProperty('radius-pulse-fill', 'visibility', 'none');
    } catch (e) { /* layer may not exist yet */ }
  }
  if (userPinMarker) {
    userPinMarker.remove();
  }
}

function triggerRadarPulse() {
  if (!radiusSourceAdded) return;
  // Animate opacity: flash in then fade out over ~1.2s
  let start = null;
  const duration = 1200;
  function step(ts) {
    if (!start) start = ts;
    const progress = (ts - start) / duration;
    if (progress >= 1) {
      map.setPaintProperty('radius-pulse-fill', 'fill-opacity', 0);
      return;
    }
    // Quick rise, slow fade
    const opacity = progress < 0.2
      ? (progress / 0.2) * 0.25   // ramp up to 0.25
      : 0.25 * (1 - ((progress - 0.2) / 0.8)); // fade out
    map.setPaintProperty('radius-pulse-fill', 'fill-opacity', opacity);
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function renderMarkers() {
  // Build a filtered GeoJSON FeatureCollection
  const bounds = map.getBounds();
  const features = [];

  courts.forEach(court => {
    if (currentFilter === 'watching') {
      if (!userWatches.has(court.id)) return;
    } else if (currentFilter !== 'all' && court.status !== currentFilter) {
      return;
    }

    if (nearMeActive && userLat !== null && userLng !== null) {
      const dist = haversineMiles(userLat, userLng, court.lat, court.lng);
      if (dist > radiusMiles) return;
      court._distance = dist;
    } else if (currentFilter !== 'watching') {
      const padLng = (bounds.getEast() - bounds.getWest()) * 0.1;
      const padLat = (bounds.getNorth() - bounds.getSouth()) * 0.1;
      if (court.lng < bounds.getWest() - padLng || court.lng > bounds.getEast() + padLng ||
          court.lat < bounds.getSouth() - padLat || court.lat > bounds.getNorth() + padLat) {
        return;
      }
    }

    const isWatchedView = currentFilter === 'watching';
    const color = isWatchedView ? '#FACC15'
      : court.status === 'packed' ? '#FF5A1F'
      : court.status === 'active' ? '#22C55E'
      : '#3B82F6';
    const truncName = court.name && court.name.length > 30 ? court.name.slice(0, 28) + '…' : (court.name || '');

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [court.lng, court.lat] },
      properties: {
        id: court.id,
        name: truncName,
        color: color,
        status: court.status || 'quiet',
        isWatched: isWatchedView ? 1 : 0
      }
    });
  });

  visibleCourtCount = features.length;

  const geojson = { type: 'FeatureCollection', features: features };

  if (courtsLayersReady) {
    map.getSource('courts-source').setData(geojson);
  }

  if (typeof updateLastRenderCenter === 'function') updateLastRenderCenter();
  if (typeof hideSearchAreaBtn === 'function') hideSearchAreaBtn();
}

/* ══════════════════════════════
   FILTER
   ══════════════════════════════ */
function setFilter(filter, chipEl) {
  if (filter === 'watching' && !currentUser) {
    showSignUpModal('watch');
    // Reset mobile dropdown back to current filter since we blocked the change
    const mobileStatus = document.getElementById('mobileStatusFilter');
    if (mobileStatus) mobileStatus.value = currentFilter;
    return;
  }
  currentFilter = filter;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  if (chipEl) chipEl.classList.add('active');
  else {
    // Sync desktop chips from mobile dropdown
    document.querySelectorAll('.filter-chip').forEach(c => {
      if (c.dataset.filter === filter) c.classList.add('active');
    });
  }
  // Sync mobile dropdown
  const mobileStatus = document.getElementById('mobileStatusFilter');
  if (mobileStatus) {
    mobileStatus.value = filter;
    mobileStatus.classList.toggle('active', filter !== 'all');
  }
  renderMarkers();
}

function onMobileStatusChange(value) {
  setFilter(value, null);
}

let notificationsLoaded = false;

function openNotifications() {
  if (!currentUser) {
    showSignUpModal('notifications');
    return;
  }
  document.getElementById('alertsScreen').classList.add('open');
  if (!notificationsLoaded) {
    loadNotifications();
  }
}

function closeNotifications() {
  document.getElementById('alertsScreen').classList.remove('open');
}

async function loadNotifications() {
  const list = document.getElementById('alertsList');
  list.innerHTML = '<div class="alerts-empty"><div class="alerts-empty__icon">⏳</div><div class="alerts-empty__text">Loading...</div></div>';

  try {
    const notifications = await getNotifications(50);
    if (!notifications || notifications.length === 0) {
      list.innerHTML = `
        <div class="alerts-empty">
          <div class="alerts-empty__icon">🔔</div>
          <div class="alerts-empty__text">No alerts yet</div>
          <div class="alerts-empty__sub">Watch a court to get notified when players check in</div>
        </div>`;
      document.getElementById('alertsMarkAll').style.display = 'none';
      notificationsLoaded = true;
      return;
    }

    const hasUnread = notifications.some(n => !n.read);
    document.getElementById('alertsMarkAll').style.display = hasUnread ? 'block' : 'none';

    list.innerHTML = notifications.map(n => {
      const iconMap = {
        court_active: '🏀', court_heating_up: '🔥', court_packed: '🔥',
        post_sprayed: '🎨',
        player_joined: '👋', review_reminder: '📝', game_complete: '🏆', review_penalty: '⚠️'
      };
      const icon = iconMap[n.type] || '🏀';
      const notifTime = timeAgo(new Date(n.created_at));
      return `<div class="alert-card ${n.read ? '' : 'alert-card--unread'}" data-notification-id="${n.id}" onclick="handleNotificationTap('${n.id}', '${n.court_id || ''}', '${n.type || ''}', '${n.match_id || ''}', '${n.game_id || ''}')">
        <div class="alert-card__icon">${icon}</div>
        <div class="alert-card__body">
          <div class="alert-card__title">${escapeHtml(n.title)}</div>
          <div class="alert-card__text">${escapeHtml(n.body)}</div>
          <div class="alert-card__time">${notifTime}</div>
        </div>
      </div>`;
    }).join('');

    notificationsLoaded = true;
  } catch (err) {
    console.error('Failed to load notifications:', err);
    list.innerHTML = '<div class="alerts-empty"><div class="alerts-empty__text">Failed to load</div></div>';
  }
}

// formatNotificationTime removed — using shared timeAgo() from supabase-helpers.js

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function handleNotificationTap(notificationId, courtId, type, matchId, gameId) {
  await markNotificationRead(notificationId);
  const card = document.querySelector(`.alert-card[data-notification-id="${notificationId}"]`);
  if (card) card.classList.remove('alert-card--unread');
  updateNotificationBadge();

  // Game notification types
  if (type === 'player_joined' && gameId) {
    closeNotifications();
    window.location.href = 'allnet-phase2.html?mode=lobby&game_id=' + gameId;
  } else if (type === 'review_reminder' && gameId) {
    closeNotifications();
    window.location.href = 'allnet-phase2.html?mode=review&game_id=' + gameId;
  } else if (type === 'game_complete') {
    closeNotifications();
    window.location.href = 'allnet-career.html';
  // Existing types
  } else if (type === 'post_sprayed' && matchId) {
    closeNotifications();
    window.location.href = 'allnet-activity.html?match=' + matchId;
  } else if (courtId) {
    closeNotifications();
    const court = courts.find(c => c.id === courtId);
    if (court) openSheet(court);
  }
}

async function markAllNotificationsReadUI() {
  await markAllNotificationsRead();
  document.querySelectorAll('.alert-card--unread').forEach(card => {
    card.classList.remove('alert-card--unread');
  });
  document.getElementById('alertsMarkAll').style.display = 'none';
  updateNotificationBadge();
}

async function updateNotificationBadge() {
  if (!currentUser) return;
  try {
    const count = await getUnreadNotificationCount();
    const badge = document.getElementById('navBellBadge');
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  } catch (err) {
    console.error('Badge update failed:', err);
  }
}

/* ══════════════════════════════
   RADIUS FILTER — LOCATION-BASED
   Location stays client-side only. Never sent to server.
   ══════════════════════════════ */
let radiusMiles = 0;
let nearMeActive = false;
let userLat = null;
let userLng = null;

function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function onRadiusChange(value) {
  radiusMiles = parseInt(value);
  const sel = document.getElementById('radiusSelect');
  const mobileSel = document.getElementById('mobileRadiusFilter');

  // Sync both dropdowns
  if (sel) sel.value = value;
  if (mobileSel) {
    mobileSel.value = value;
    mobileSel.classList.toggle('active', radiusMiles > 0);
  }

  if (radiusMiles === 0) {
    // "Map Area" mode — show courts in current viewport, no radius filter
    nearMeActive = false;
    if (sel) sel.classList.remove('active');
    hideRadiusVisuals();
    renderMarkers();
    return;
  }

  if (userLat === null || userLng === null) {
    requestLocation(() => {
      nearMeActive = true;
      if (sel) sel.classList.add('active');
      renderMarkers();
      showRadiusVisuals();
      fitMapToRadius();
    });
  } else {
    nearMeActive = true;
    if (sel) sel.classList.add('active');
    renderMarkers();
    showRadiusVisuals();
    fitMapToRadius();
  }
}

function fitMapToRadius() {
  if (!userLat || !userLng || !radiusMiles || !map) return;
  // Convert miles to degrees (approximate)
  var latOffset = radiusMiles / 69.0;
  var lngOffset = radiusMiles / (69.0 * Math.cos(userLat * Math.PI / 180));
  var padding = 40;
  map.fitBounds(
    [[userLng - lngOffset, userLat - latOffset], [userLng + lngOffset, userLat + latOffset]],
    { padding: padding, duration: 800 }
  );
}

function requestLocation(onSuccess) {
  if (!navigator.geolocation) {
    showAlert('Not Supported', 'Geolocation is not supported by your browser.', { icon: '🚫' });
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      console.log('Location acquired (client-side only)');
      if (onSuccess) onSuccess();
    },
    (err) => {
      if (err.code === 1) {
        showAlert('Location Denied', 'Enable location in your browser settings to use the radius filter.', { icon: '📍' });
      } else {
        showAlert('Location Error', 'Could not get your location. Please try again.', { icon: '📍' });
      }
      document.getElementById('radiusSelect').value = '0';
      document.getElementById('radiusSelect').classList.remove('active');
      nearMeActive = false;
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
  );
}

function autoRequestLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;
        console.log('Auto-location acquired (client-side only)');

        // Default to 5mi radius on load
        onRadiusChange('5');
      },
      (err) => {
        console.log('Auto-location denied or failed, showing courts in viewport');
        renderMarkers();
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }
}

map.on('load', () => {
  // ── Set up native WebGL court layers (GPU-rendered, zero jitter) ──
  map.addSource('courts-source', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  });

  // Circle layer — court dots
  map.addLayer({
    id: 'courts-dots',
    type: 'circle',
    source: 'courts-source',
    paint: {
      'circle-radius': 8,
      'circle-color': ['get', 'color'],
      'circle-stroke-width': 2,
      'circle-stroke-color': 'rgba(255,255,255,0.85)'
    }
  });

  // Symbol layer — court name labels below dots
  map.addLayer({
    id: 'courts-labels',
    type: 'symbol',
    source: 'courts-source',
    layout: {
      'text-field': ['get', 'name'],
      'text-size': 11,
      'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
      'text-anchor': 'top',
      'text-offset': [0, 1],
      'text-max-width': 8,
      'text-allow-overlap': false,
      'text-optional': true,
      'text-line-height': 1.2
    },
    paint: {
      'text-color': 'rgba(255,255,255,0.85)',
      'text-halo-color': 'rgba(0,0,0,0.75)',
      'text-halo-width': 1
    }
  });

  courtsLayersReady = true;

  // Click handler — open court sheet (on both dots and labels)
  map.on('click', 'courts-dots', (e) => {
    if (!e.features || !e.features.length) return;
    const courtId = String(e.features[0].properties.id);
    const court = courts.find(c => String(c.id) === courtId);
    if (court) openSheet(court);
  });
  map.on('click', 'courts-labels', (e) => {
    if (!e.features || !e.features.length) return;
    const courtId = String(e.features[0].properties.id);
    const court = courts.find(c => String(c.id) === courtId);
    if (court) openSheet(court);
  });

  // Hover — pointer cursor on both layers
  map.on('mouseenter', 'courts-dots', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'courts-dots', () => {
    map.getCanvas().style.cursor = '';
  });
  map.on('mouseenter', 'courts-labels', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'courts-labels', () => {
    map.getCanvas().style.cursor = '';
  });

  renderMarkers();
});

/* ══════════════════════════════
   CENTER MAP
   ══════════════════════════════ */
/* ══════════════════════════════
   NAV DRAWER
   ══════════════════════════════ */
function openNavDrawer() {
  document.getElementById('navOverlay').classList.add('open');
  document.getElementById('navDrawer').classList.add('open');
}

function closeNavDrawer() {
  document.getElementById('navOverlay').classList.remove('open');
  document.getElementById('navDrawer').classList.remove('open');
}

function updateNavDrawerUser() {
  const navUser = document.getElementById('navUser');
  if (!navUser) return;
  if (currentUser && currentProfile) {
    navUser.style.display = 'flex';
    document.getElementById('navUserName').textContent = currentProfile.name || 'Player';
    document.getElementById('navUserStars').textContent = '⭐ ' + (currentProfile.stars_balance || 0).toLocaleString();
    const navAvatar = document.getElementById('navAvatar');
    if (navAvatar) navAvatar.innerHTML = buildCompositeAvatar();
  } else {
    navUser.style.display = 'none';
  }
}

function centerMap() {
  if (userLat && userLng) {
    map.flyTo({ center: [userLng, userLat], zoom: 12, duration: 1000 });
  } else {
    map.flyTo({ center: [-117.83, 33.68], zoom: 10.5, duration: 1000 });
  }
}

/* ══════════════════════════════
   SEARCH THIS AREA
   Shows button when user pans map
   significantly from last render
   ══════════════════════════════ */
let lastRenderCenter = null;

function updateLastRenderCenter() {
  const c = map.getCenter();
  lastRenderCenter = { lng: c.lng, lat: c.lat };
}

function showSearchAreaBtn() {
  document.getElementById('searchAreaBtn').classList.add('visible');
}

function hideSearchAreaBtn() {
  document.getElementById('searchAreaBtn').classList.remove('visible');
}

function searchThisArea() {
  // Switch to Map Area mode and render courts in current viewport
  nearMeActive = false;
  radiusMiles = 0;
  document.getElementById('radiusSelect').value = '0';
  document.getElementById('radiusSelect').classList.remove('active');
  hideRadiusVisuals();

  // Reset filter to "All Courts"
  currentFilter = 'all';
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  document.querySelector('.filter-chip[data-filter="all"]').classList.add('active');

  renderMarkers();
  hideSearchAreaBtn();

  // Count visible courts for feedback
  const count = visibleCourtCount;
  if (count > 0) {
    showToast(count + ' court' + (count !== 1 ? 's' : '') + ' in this area');
  } else {
    showToast('No courts found in this area');
  }
}

// Detect significant map panning — show button so user can refresh courts in viewport
map.on('moveend', () => {
  if (!lastRenderCenter || courts.length === 0) return;

  const c = map.getCenter();
  const moved = Math.abs(c.lng - lastRenderCenter.lng) + Math.abs(c.lat - lastRenderCenter.lat);

  // ~0.03 degrees ≈ 2 miles — show button after meaningful pan
  if (moved > 0.03) {
    showSearchAreaBtn();
  }
});

/* ══════════════════════════════
   BOTTOM SHEET — COURT DETAIL
   ══════════════════════════════ */
function openSheet(court) {
  if (userLat !== null && userLng !== null) {
    court._distance = haversineMiles(userLat, userLng, court.lat, court.lng);
  }
  const statusIcon = court.status === 'packed' ? '🔥' : court.status === 'active' ? '🏀' : '😴';
  const statusClass = court.status;
  const typeTag = court.type === 'indoor'
    ? '<span class="court-tag court-tag--indoor">Indoor</span>'
    : '<span class="court-tag court-tag--outdoor">Outdoor</span>';

  const maxForecast = Math.max(...court.forecast, 1);
  const today = new Date().getDay();
  const todayIdx = today === 0 ? 6 : today - 1;
  const dayLabelsFull = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const peakWindows = { low: 'Low traffic expected', med: 'Moderate \u2014 try 5\u20138 PM', high: 'Busy \u2014 peak around 5\u20138 PM' };
  const levelLabels = { low: 'Quiet', med: 'Moderate', high: 'Busy' };
  const todayVal = court.forecast[todayIdx] || 0;
  const todayLevel = todayVal >= 50 ? 'high' : todayVal >= 25 ? 'med' : 'low';
  const forecastBars = court.forecast.map((val, i) => {
    const h = Math.max(6, (val / maxForecast) * 78);
    const level = val >= 50 ? 'high' : val >= 25 ? 'med' : 'low';
    const isNow = i === todayIdx;
    return `<div class="forecast-bar-wrapper" onclick="toggleForecastTooltip(this)">
      <div class="forecast-tooltip">
        <div class="forecast-tooltip__day">${dayLabelsFull[i]}${isNow ? ' (Today)' : ''}</div>
        <div class="forecast-tooltip__level">${levelLabels[level]}</div>
        <div class="forecast-tooltip__peak">${peakWindows[level]}</div>
      </div>
      <div class="forecast-bar ${isNow ? 'forecast-bar--today' : ''}" style="height:${h}px;"></div>
      <span class="forecast-label ${isNow ? 'forecast-label--now' : ''}">${dayLabels[i]}</span>
    </div>`;
  }).join('');
  const checkinHTML = court.checkedIn.length > 0
    ? court.checkedIn.map(p => {
        const avatarContent = buildCompositeAvatarHtml({
          avatar_cutout_url: p.avatarCutoutUrl, avatar_url: p.avatarUrl,
          selected_cover: p.selectedCover, initials: p.initials, name: p.name
        });
        return `<div class="checkin-player" onclick="${`closeSheet();showPlayerCard('${p.name.replace(/'/g, "\\'")}'${p.userId ? `,'${p.userId}'` : ''})`}">
          <div class="checkin-player__avatar">${avatarContent}</div>
          <div class="checkin-player__info">
            <div class="checkin-player__name">${p.name}</div>
            <div class="checkin-player__meta">${p.time}</div>
          </div>
          ${p.badge ? '<span class="checkin-player__badge">Founding</span>' : ''}
        </div>`;
      }).join('')
    : '<div class="empty-checkins">No one checked in yet. Be the first!</div>';

  const isWatching = currentUser && court._watching;
  const watchBtn = `<button class="btn--watch ${isWatching ? 'btn--watch-active' : ''}" onclick="toggleWatch('${court.id}')" title="${isWatching ? 'Stop watching' : 'Watch this court'}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="${isWatching ? 'var(--yellow)' : 'none'}" stroke="${isWatching ? 'var(--yellow)' : 'var(--text-secondary)'}" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      </button>`;

  document.getElementById('sheetBody').innerHTML = `
    <div class="court-header">
      <div class="court-header__info">
        <div class="court-header__name">${court.name}</div>
        <div class="court-header__address">${court.address}${court._distance ? ' · <span style="color:var(--yellow);">' + court._distance.toFixed(1) + ' mi</span>' : ''}</div>
        <div class="court-header__tags">${typeTag}</div>
      </div>
      <div class="court-header__status">
        ${watchBtn}
        <div class="court-header__status-group">
          <div class="status-dot-lg status-dot-lg--${statusClass}">${statusIcon}</div>
          <span class="status-label status-label--${statusClass}">${court.status.charAt(0).toUpperCase() + court.status.slice(1)}</span>
        </div>
        <button class="btn--sheet-close" onclick="closeSheet()" aria-label="Close">✕</button>
      </div>
    </div>

    <div class="pulse-stats" style="grid-template-columns:1fr 1fr;">
      <div class="pulse-stat">
        <div class="pulse-stat__value" style="color:${court.status === 'packed' ? 'var(--orange)' : court.status === 'active' ? 'var(--green-live)' : 'var(--text-muted)'}">${court.players}</div>
        <div class="pulse-stat__label">Players Now</div>
      </div>
      <div class="pulse-stat">
        <div class="pulse-stat__value">${court.checkedIn.length}</div>
        <div class="pulse-stat__label">Checked In</div>
      </div>
    </div>

    <div class="forecast-section">
      <div class="forecast-title">// Weekly Forecast</div>
      <div class="forecast-chart-container">
        <div class="forecast-yaxis">
          <span class="forecast-yaxis__label ${todayLevel === 'high' ? 'forecast-yaxis__label--active' : ''}">Busy</span>
          <span class="forecast-yaxis__label ${todayLevel === 'med' ? 'forecast-yaxis__label--active' : ''}">Moderate</span>
          <span class="forecast-yaxis__label ${todayLevel === 'low' ? 'forecast-yaxis__label--active' : ''}">Quiet</span>
        </div>
        <div class="forecast-chart">${forecastBars}</div>
      </div>
    </div>

    <div class="checkins-section">
      <div class="forecast-title">// Checked In Now</div>
      <div class="checkin-list">${checkinHTML}</div>
    </div>

    <div class="leaderboard-section" id="courtLeaderboard" style="display:none;">
      <div class="leaderboard-title-row">
        <div class="forecast-title">// Court Leaders</div>
        <button class="leaderboard-info-btn" onclick="toggleLeaderboardTooltip()" title="How scores are calculated">?</button>
      </div>
      <div class="leaderboard-tooltip" id="leaderboardTooltip">
        <strong>Court Leader Score</strong><br>
        Score = (Skill × 40%) + (Social × 25%) + (Win% × 35%)<br>
        Players must have at least 1 completed game at this court to qualify.
      </div>
      <div id="leaderboardList"></div>
    </div>

    <div class="court-actions">
      ${checkinCourts.has(court.id)
        ? `<button class="btn btn--success" onclick="startGame('${court.name.replace(/'/g, "\\'")}')">🏀 Start a Game</button>
           <button class="btn btn--checkout" onclick="manualCheckout()">Check Out</button>`
        : `<button class="btn btn--primary" onclick="checkIn('${court.id}')">📍 I'm Here</button>`}
      <button class="btn btn--secondary" onclick="getDirections(${court.lat}, ${court.lng})">🧭 Directions</button>
    </div>
    <div class="court-report" id="courtReportSection">
      ${court._reported
        ? '<span class="court-report__done">⚑ You reported this listing</span>'
        : `<button class="court-report__btn" onclick="showReportModal('${court.id}')">⚑ Report incorrect listing</button>`}
    </div>
  `;

  document.getElementById('sheetOverlay').classList.add('active');
  document.getElementById('courtSheet').classList.add('open');
}

function closeSheet() {
  document.getElementById('sheetOverlay').classList.remove('active');
  document.getElementById('courtSheet').classList.remove('open');
  if (typeof _sheetLoading !== 'undefined') _sheetLoading = false;
}

function toggleForecastTooltip(wrapper) {
  const wasTapped = wrapper.classList.contains('tapped');
  document.querySelectorAll('.forecast-bar-wrapper.tapped').forEach(w => w.classList.remove('tapped'));
  if (!wasTapped) {
    wrapper.classList.add('tapped');
    setTimeout(() => wrapper.classList.remove('tapped'), 3000);
  }
}

/* ══════════════════════════════
   COURT LEADERBOARD
   ══════════════════════════════ */
function toggleLeaderboardTooltip() {
  const tip = document.getElementById('leaderboardTooltip');
  if (tip) tip.classList.toggle('visible');
}

async function fetchAndRenderLeaderboard(courtId) {
  const section = document.getElementById('courtLeaderboard');
  const list = document.getElementById('leaderboardList');
  if (!section || !list) return;

  try {
    const { data, error } = await supabase.rpc('get_court_leaderboard', { p_court_id: courtId });
    if (error || !data || data.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    const skillBars = '<span style="display:inline-flex;gap:1px;vertical-align:middle;margin-right:2px;"><span style="width:4px;height:10px;background:#F74501;display:inline-block;"></span><span style="width:4px;height:10px;background:#F74501;display:inline-block;"></span></span>';
    list.innerHTML = data.map((p, i) => {
      const rank = i + 1;
      const rankCls = rank <= 3 ? ' leaderboard-rank--' + rank : '';
      const avatarContent = (typeof buildCompositeAvatarHtml === 'function' && (p.avatar_cutout_url || p.avatar_url))
        ? buildCompositeAvatarHtml(p) : (p.initials || '??');
      const winLoss = p.total_wins + 'W-' + p.total_losses + 'L';
      return `<div class="leaderboard-row" onclick="showPlayerCard('${(p.name||'').replace(/'/g,"\\'")}','${p.user_id}')">
        <div class="leaderboard-rank${rankCls}">${rank}</div>
        <div class="leaderboard-avatar">${avatarContent}</div>
        <div class="leaderboard-info">
          <div class="leaderboard-name">${p.name || 'Unknown'}</div>
          <div class="leaderboard-stats">${skillBars}${Number(p.avg_skill).toFixed(1)} · ${winLoss}</div>
        </div>
        <div class="leaderboard-score">${Number(p.score).toFixed(2)}</div>
      </div>`;
    }).join('');
  } catch (err) {
    console.error('Leaderboard error:', err);
    section.style.display = 'none';
  }
}

/* ══════════════════════════════
   CHECK-IN
   ══════════════════════════════ */
async function checkIn(courtId) {
  const court = courts.find(c => c.id === courtId);
  if (!court) return;

  if (!currentUser) {
    showSignUpModal('checkin');
    return;
  }

  const proximity = validateProximity(court);
  if (!proximity.ok) {
    handleProximityFailure(proximity, court.name);
    return;
  }

  if (checkinCourts.has(courtId)) return;

  if (activeCheckin && activeCheckin.courtId !== courtId) {
    const oldName = activeCheckin.courtName;
    const confirmed = await showConfirm('Switch Courts?', `You're currently checked in at ${oldName}. Check out and move to ${court.name}?`, { icon: '📍', confirmText: 'Switch', cancelText: 'Stay' });
    if (!confirmed) return;
    performCheckout();
  }

  const userName = currentProfile?.name || 'You';
  const userInitials = currentProfile?.initials || 'U';
  const isFounding = currentProfile?.is_founding_hooper || false;
  const userAvatar = currentProfile?.avatar_url || null;
  court.checkedIn.unshift({ name: userName, initials: userInitials, time: 'Just now', badge: isFounding, avatarUrl: userAvatar });
  court.players += 1;

  if (court.players >= 10 && court.status !== 'packed') court.status = 'packed';
  else if (court.players > 0 && court.status === 'quiet') court.status = 'active';

  const timestamp = new Date();
  userCheckins.unshift({ courtId: court.id, courtName: court.name, time: timestamp });
  checkinCourts.add(court.id);

  updateProfileStats();
  startCheckinTimers(court.id, court.name);
  renderMarkers();
  openSheet(court);
  showToast(court.name, true);
}

function showToast(message, isCheckin) {
  const textEl = document.getElementById('toastText');
  if (isCheckin) {
    textEl.innerHTML = 'Checked in at <span style="color:var(--green-live);">' + message + '</span>';
  } else {
    textEl.textContent = message;
  }
  const toast = document.getElementById('toast');
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 3500);
}

/* ══════════════════════════════
   IN-APP ALERT MODAL
   Replaces native alert() calls
   ══════════════════════════════ */
let alertCallback = null;
let confirmResolve = null;

function showAlert(title, message, opts = {}) {
  const icon = opts.icon || '📍';
  const btnText = opts.btnText || 'Got It';
  alertCallback = opts.onClose || null;
  confirmResolve = null;
  document.getElementById('alertIcon').textContent = icon;
  document.getElementById('alertTitle').textContent = title;
  document.getElementById('alertMessage').textContent = message;
  document.getElementById('alertBtn').textContent = btnText;
  document.getElementById('alertCancelBtn').style.display = 'none';
  document.getElementById('alertModal').classList.add('active');
}

function showConfirm(title, message, opts = {}) {
  return new Promise(resolve => {
    const icon = opts.icon || '⚠️';
    const confirmText = opts.confirmText || 'Confirm';
    const cancelText = opts.cancelText || 'Cancel';
    confirmResolve = resolve;
    alertCallback = null;
    document.getElementById('alertIcon').textContent = icon;
    document.getElementById('alertTitle').textContent = title;
    document.getElementById('alertMessage').textContent = message;
    document.getElementById('alertBtn').textContent = confirmText;
    const cancelBtn = document.getElementById('alertCancelBtn');
    cancelBtn.textContent = cancelText;
    cancelBtn.style.display = 'flex';
    document.getElementById('alertModal').classList.add('active');
  });
}

function closeAlertModal(confirmed) {
  document.getElementById('alertModal').classList.remove('active');
  document.getElementById('alertCancelBtn').style.display = 'none';
  if (confirmResolve) { confirmResolve(!!confirmed); confirmResolve = null; }
  if (alertCallback) { alertCallback(); alertCallback = null; }
}

function getDirections(lat, lng) {
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
}

/* ══════════════════════════════
   SIGN-UP MODAL
   ══════════════════════════════ */
let signupContext = null;

function showSignUpModal(context) {
  signupContext = context || null;
  document.getElementById('signupModal').classList.add('active');
}

function closeSignUpModal() {
  document.getElementById('signupModal').classList.remove('active');
  signupContext = null;
}

async function oauthSignIn(provider) {
  if (!supabase) return;
  try {
    // Stash referral code before OAuth redirect (URL params are lost during redirect)
    var ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) localStorage.setItem('allnet_ref', ref);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: provider,
      options: { redirectTo: window.location.href.split('?')[0] }
    });
    if (error) {
      showAlert('Sign-In Failed', error.message, { icon: '⚠️' });
    }
  } catch (err) {
    showAlert('Sign-In Error', err.message, { icon: '⚠️' });
  }
}

/* ══════════════════════════════
   PROXIMITY VALIDATION
   ══════════════════════════════ */
const CHECKIN_RADIUS_MILES = 0.5;

function validateProximity(court) {
  if (userLat === null || userLng === null) {
    return { ok: false, reason: 'no_location' };
  }
  const dist = haversineMiles(userLat, userLng, court.lat, court.lng);
  if (dist > CHECKIN_RADIUS_MILES) {
    return { ok: false, reason: 'too_far', distance: dist };
  }
  return { ok: true, distance: dist };
}

function handleProximityFailure(result, courtName) {
  if (result.reason === 'no_location') {
    requestLocation(() => {
      showAlert('Location Found', 'Got your location! Please try checking in again.', { icon: '✅' });
    });
    return;
  }
  if (result.reason === 'too_far') {
    showAlert('Too Far Away', `You're ${result.distance.toFixed(2)} miles from ${courtName}. You need to be within ${CHECKIN_RADIUS_MILES} miles to check in.`, { icon: '📍' });
  }
}

/* ══════════════════════════════
   COURT REPORTING
   ══════════════════════════════ */
let reportingCourtId = null;
let reportReason = 'no_basketball_court';

function showReportModal(courtId) {
  if (!currentUser) {
    showSignUpModal('report');
    return;
  }
  reportingCourtId = courtId;
  reportReason = 'no_basketball_court';
  document.getElementById('reportNote').value = '';
  document.querySelectorAll('.report-modal__option').forEach(o => o.classList.remove('selected'));
  document.querySelector('.report-modal__option[data-reason="no_basketball_court"]').classList.add('selected');
  document.getElementById('reportSubmitBtn').disabled = false;
  document.getElementById('reportSubmitBtn').textContent = 'Submit Report';
  document.getElementById('reportModal').classList.add('active');
}

function closeReportModal() {
  document.getElementById('reportModal').classList.remove('active');
  reportingCourtId = null;
}

function selectReportReason(el) {
  document.querySelectorAll('.report-modal__option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  reportReason = el.dataset.reason;
}

async function submitReport() {
  if (!reportingCourtId || !currentUser) return;
  const btn = document.getElementById('reportSubmitBtn');
  const note = document.getElementById('reportNote').value.trim();
  btn.disabled = true;
  btn.textContent = 'Submitting...';
  try {
    await reportCourt(reportingCourtId, reportReason, note);
    const court = courts.find(c => c.id === reportingCourtId);
    if (court) court._reported = true;
    closeReportModal();
    const section = document.getElementById('courtReportSection');
    if (section) section.innerHTML = '<span class="court-report__done">⚑ You reported this listing — thank you!</span>';
    showToast('Report submitted');
  } catch (err) {
    if (err.message && err.message.includes('duplicate')) {
      showAlert('Already Reported', 'You have already reported this court.', { icon: '⚑' });
      closeReportModal();
    } else {
      btn.disabled = false;
      btn.textContent = 'Submit Report';
      showAlert('Report Failed', 'Failed to submit report: ' + err.message, { icon: '⚠️' });
    }
  }
}

/* ══════════════════════════════
   COURT WATCHING
   ══════════════════════════════ */
let userWatches = new Set();

async function loadUserWatches() {
  if (!currentUser) return;
  try {
    const { data } = await supabase.from('court_watches').select('court_id').eq('user_id', currentUser.id);
    if (data) {
      userWatches = new Set(data.map(w => w.court_id));
    }
  } catch (err) {
    console.error('Failed to load watches:', err);
  }
  updateWatchingChipVisibility();
}

function updateWatchingChipVisibility() {
  const chip = document.getElementById('watchingChip');
  const hasWatches = currentUser && userWatches.size > 0;
  if (chip) {
    chip.style.display = hasWatches ? 'flex' : 'none';
  }
  // Show/hide Watching option in mobile status dropdown
  const mobileStatus = document.getElementById('mobileStatusFilter');
  if (mobileStatus) {
    const watchOpt = mobileStatus.querySelector('option[value="watching"]');
    if (watchOpt) watchOpt.style.display = hasWatches ? '' : 'none';
    // If current filter is watching but no watches, reset to all
    if (!hasWatches && currentFilter === 'watching') {
      setFilter('all', null);
    }
  }
}

async function toggleWatch(courtId) {
  if (!currentUser) {
    showSignUpModal('watch');
    return;
  }
  const court = courts.find(c => c.id === courtId);

  if (userWatches.has(courtId)) {
    const { error } = await supabase.from('court_watches').delete()
      .eq('user_id', currentUser.id).eq('court_id', courtId);
    if (!error) {
      userWatches.delete(courtId);
      updateWatchingChipVisibility();
      if (currentFilter === 'watching' && userWatches.size === 0) {
        currentFilter = 'all';
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        document.querySelector('.filter-chip[data-filter="all"]').classList.add('active');
      }
      renderMarkers();
      if (court) { court._watching = false; openSheet(court); }
      showToast('You will no longer be notified when players check into ' + (court?.name || 'this court'));
    }
  } else {
    const { error } = await supabase.from('court_watches').insert({
      user_id: currentUser.id, court_id: courtId
    });
    if (!error) {
      userWatches.add(courtId);
      updateWatchingChipVisibility();
      renderMarkers();
      if (court) { court._watching = true; openSheet(court); }
      showToast('You will now be notified when more players check into ' + (court?.name || 'this court'));

      // Request push notification permission on first watch
      if (typeof PushManager_ !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        PushManager_.requestPermissionAndSubscribe();
      }
    }
  }
}

/* ══════════════════════════════
   CHECK-IN TIMER & CHECKOUT
   ══════════════════════════════ */
const NUDGE_MS = 90 * 60 * 1000;
const EXPIRE_MS = 120 * 60 * 1000;

let activeCheckin = null;
let nudgeTimer = null;
let expireTimer = null;

function startCheckinTimers(courtId, courtName, checkinTime) {
  clearCheckinTimers();
  const startTime = checkinTime || Date.now();
  activeCheckin = { courtId, courtName, time: startTime, checkinId: null };

  const elapsed = Date.now() - startTime;
  const nudgeRemaining = Math.max(0, NUDGE_MS - elapsed);
  const expireRemaining = Math.max(0, EXPIRE_MS - elapsed);

  if (expireRemaining <= 0) {
    // Already past 120min — auto checkout
    autoCheckout();
    return;
  }

  if (nudgeRemaining <= 0) {
    // Past 90min but not 120min — show nudge immediately
    showNudgeBanner(courtName);
  } else {
    nudgeTimer = setTimeout(() => { showNudgeBanner(courtName); }, nudgeRemaining);
  }
  expireTimer = setTimeout(() => { autoCheckout(); }, expireRemaining);
}

function clearCheckinTimers() {
  if (nudgeTimer) { clearTimeout(nudgeTimer); nudgeTimer = null; }
  if (expireTimer) { clearTimeout(expireTimer); expireTimer = null; }
}

function showNudgeBanner(courtName) {
  document.getElementById('nudgeCourtName').textContent = courtName;
  document.getElementById('nudgeBanner').classList.add('visible');
}

function hideNudgeBanner() {
  document.getElementById('nudgeBanner').classList.remove('visible');
}

function extendCheckin() {
  hideNudgeBanner();
  if (activeCheckin) {
    if (currentUser && activeCheckin.courtId && typeof activeCheckin.courtId === 'string' && activeCheckin.courtId.length > 10) {
      checkInAtCourt(activeCheckin.courtId).catch(err => console.error('Extend check-in failed:', err));
    }
    startCheckinTimers(activeCheckin.courtId, activeCheckin.courtName);
    showToast(activeCheckin.courtName + ' — extended');
  }
}

function autoCheckout() {
  performCheckout();
  showToast('Check-in expired');
}

function performCheckout() {
  hideNudgeBanner();
  clearCheckinTimers();

  if (activeCheckin) {
    const courtId = activeCheckin.courtId;

    if (currentUser && courtId && typeof courtId === 'string' && courtId.length > 10) {
      supabase.from('checkins')
        .update({ checked_out_at: new Date().toISOString() })
        .eq('court_id', courtId)
        .eq('user_id', currentUser.id)
        .is('checked_out_at', null)
        .then(() => console.log('Checked out from DB'))
        .catch(err => console.error('Checkout failed:', err));
    }

    checkinCourts.delete(courtId);
    const court = courts.find(c => c.id === courtId);
    if (court) {
      court.players = Math.max(0, court.players - 1);
      if (court.players === 0) court.status = 'quiet';
      else if (court.players < 10) court.status = 'active';
      court.checkedIn = court.checkedIn.filter(p => {
        const isMe = (currentProfile && p.name === currentProfile.name);
        return !isMe;
      });
    }
    renderMarkers();
    activeCheckin = null;
  }
}

async function manualCheckout() {
  // If activeCheckin wasn't restored (edge case), rebuild from checkinCourts
  if (!activeCheckin && checkinCourts.size > 0) {
    const courtId = checkinCourts.values().next().value;
    const court = courts.find(c => c.id === courtId);
    if (court) {
      activeCheckin = { courtId, courtName: court.name, time: Date.now(), checkinId: null };
    }
  }
  if (!activeCheckin) return;

  const courtName = activeCheckin.courtName;
  const courtId = activeCheckin.courtId;
  const confirmed = await showConfirm('Check Out?', `Leave ${courtName}?`, { icon: '👋', confirmText: 'Check Out', cancelText: 'Stay' });
  if (!confirmed) return;
  performCheckout();
  showToast('Checked out of ' + courtName);
  const court = courts.find(c => c.id === courtId);
  if (court) openSheet(court);
}

/* ══════════════════════════════
   PROFILE
   ══════════════════════════════ */
function handleProfileClick() {
  if (currentUser) {
    openProfile();
  } else {
    showSignUpModal('profile');
  }
}

function openProfile() {
  updateProfileStats();
  renderHistory();
  renderWatchedCourts();
  document.getElementById('profileScreen').classList.add('open');
  // Render card after screen is visible so fitNames can measure correctly
  requestAnimationFrame(function() {
    renderCareerCard();
  });
}

function closeProfile() {
  document.getElementById('profileScreen').classList.remove('open');
}

function updateProfileStats() {
  document.getElementById('profileCheckins').textContent = userCheckins.length;
  document.getElementById('profileCourts').textContent = checkinCourts.size;
}

function renderHistory() {
  const list = document.getElementById('historyList');
  if (userCheckins.length === 0) {
    list.innerHTML = '<div class="empty-checkins">No check-ins yet. Visit a court and tap "I\'m Here" to start building your history.</div>';
    return;
  }

  list.innerHTML = userCheckins.slice(0, 5).map(c => {
    const timeStr = formatTime(c.time);
    return `<div class="history-item">
      <div class="history-item__icon">📍</div>
      <div class="history-item__info">
        <div class="history-item__title">${c.courtName}</div>
        <div class="history-item__meta">Checked in</div>
      </div>
      <div class="history-item__time">${timeStr}</div>
    </div>`;
  }).join('');
}

function renderWatchedCourts() {
  const titleEl = document.getElementById('watchedCourtsTitle');
  const countEl = document.getElementById('watchedCount');
  const listEl = document.getElementById('watchedCourtsList');

  if (!currentUser || userWatches.size === 0) {
    titleEl.style.display = 'none';
    listEl.innerHTML = '';
    return;
  }

  titleEl.style.display = 'block';
  countEl.textContent = userWatches.size;

  const watchedCourts = courts.filter(c => userWatches.has(c.id));

  if (watchedCourts.length === 0) {
    listEl.innerHTML = '<div class="watched-courts-empty">Watch courts from the map to see them here.</div>';
    return;
  }

  listEl.innerHTML = watchedCourts.map(c => `
    <div class="watched-court-item" onclick="closeProfile();openSheet(courts.find(x=>x.id==='${c.id}'))">
      <div class="watched-court-item__icon">🔔</div>
      <div class="watched-court-item__name">${c.name}</div>
      <div class="watched-court-item__type">${c.type || ''}</div>
      <button class="watched-court-item__remove" onclick="event.stopPropagation();unwatchFromProfile('${c.id}')" title="Stop watching">✕</button>
    </div>
  `).join('');
}

async function unwatchFromProfile(courtId) {
  if (!currentUser) return;
  const { error } = await supabase.from('court_watches').delete()
    .eq('user_id', currentUser.id).eq('court_id', courtId);
  if (!error) {
    userWatches.delete(courtId);
    const court = courts.find(c => c.id === courtId);
    if (court) court._watching = false;
    updateWatchingChipVisibility();
    if (currentFilter === 'watching' && userWatches.size === 0) {
      currentFilter = 'all';
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      document.querySelector('.filter-chip[data-filter="all"]').classList.add('active');
    }
    renderMarkers();
    renderWatchedCourts();
    showToast('You will no longer be notified when players check into ' + (court?.name || 'this court'));
  }
}

function formatTime(date) {
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ══════════════════════════════
   UPLOAD PROCESSING OVERLAY
   ══════════════════════════════ */
function showUploadOverlay(text) {
  const o = document.getElementById('uploadOverlay');
  if (!o) return;
  document.getElementById('uploadOverlayText').textContent = text || 'Processing photo...';
  o.classList.add('active');
}
function hideUploadOverlay() {
  const o = document.getElementById('uploadOverlay');
  if (o) o.classList.remove('active');
}

// Timeout wrapper for async operations
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' timed out after ' + (ms/1000) + 's')), ms))
  ]);
}

// Max file size: 5MB
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

/* ══════════════════════════════
   PROFILE AVATAR — change from profile screen
   ══════════════════════════════ */
function triggerProfileAvatarUpload() {
  if (!currentUser) return;
  document.getElementById('profileAvatarInput').click();
}

async function handleProfileAvatarChange(input) {
  const file = input.files[0];
  if (!file || !currentUser) return;

  if (file.size > MAX_AVATAR_SIZE) {
    showAlert('File Too Large', 'Please select a photo under 5MB.', { icon: '⚠️' });
    input.value = '';
    return;
  }

  showUploadOverlay('Uploading photo...');
  try {
    const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
    const path = currentUser.id + '/avatar.' + ext;
    const { error: uploadError } = await withTimeout(
      supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type }),
      60000, 'Upload'
    );
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', currentUser.id);
    currentProfile.avatar_url = publicUrl;
    updateAvatarDisplays(publicUrl);

    // Await background removal — keep overlay visible
    showUploadOverlay('Removing background...');
    const cutoutUrl = await withTimeout(processAvatar(path), 60000, 'Background removal');
    hideUploadOverlay();
    if (cutoutUrl) {
      // Force re-render all displays with the new cache-busted cutout URL
      renderCareerCard();
      updateAvatarDisplays(currentProfile.avatar_url);
      updateNavDrawerUser();
      showToast('Career card updated 🏀');
    } else {
      showAlert('Photo Processing Failed', 'Background removal failed. Please try uploading a different photo with a clear, well-lit background.', { icon: '⚠️' });
    }
  } catch (err) {
    console.error('Profile avatar upload failed:', err);
    hideUploadOverlay();
    const avatarEl = document.getElementById('profileCardAvatar');
    if (avatarEl) avatarEl.textContent = currentProfile?.initials || 'U';
    showAlert('Upload Failed', err.message || 'Photo upload failed. Please try again.', { icon: '⚠️' });
  }
  input.value = '';
}

/* ══════════════════════════════
   ONBOARDING — Name + Photo
   Triggered post-OAuth for new users
   ══════════════════════════════ */
function checkOnboarding() {
  if (!currentUser || !currentProfile) return;
  // Show onboarding if first_name not set yet
  if (!currentProfile.first_name) {
    // Try to pre-fill from OAuth display name
    const fullName = (currentProfile.name || '').trim();
    const parts = fullName.split(/\s+/);
    if (parts.length >= 2) {
      document.getElementById('onboardFirstName').value = parts[0];
      document.getElementById('onboardLastName').value = parts.slice(1).join(' ');
    } else if (parts.length === 1 && parts[0]) {
      document.getElementById('onboardFirstName').value = parts[0];
    }
    document.getElementById('onboardingModal').classList.add('active');
    // Focus first empty field
    setTimeout(() => {
      const fn = document.getElementById('onboardFirstName');
      const ln = document.getElementById('onboardLastName');
      if (!fn.value) fn.focus();
      else if (!ln.value) ln.focus();
    }, 300);
  }
}

async function submitOnboardingName() {
  const firstName = document.getElementById('onboardFirstName').value.trim();
  const lastName = document.getElementById('onboardLastName').value.trim();
  const errorEl = document.getElementById('onboardNameError');

  // Validate
  if (!firstName || firstName.length < 2) {
    errorEl.textContent = 'Please enter your first name (at least 2 characters)';
    document.getElementById('onboardFirstName').focus();
    return;
  }
  if (!lastName || lastName.length < 2) {
    errorEl.textContent = 'Please enter your last name (at least 2 characters)';
    document.getElementById('onboardLastName').focus();
    return;
  }
  if (/\d/.test(firstName) || /\d/.test(lastName)) {
    errorEl.textContent = 'Names cannot contain numbers';
    return;
  }
  if (/[^a-zA-Z\s\-\']/.test(firstName) || /[^a-zA-Z\s\-\']/.test(lastName)) {
    errorEl.textContent = 'Please use letters only';
    return;
  }

  errorEl.textContent = '';
  const btn = document.getElementById('onboardNameBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const fullName = firstName + ' ' + lastName;
    const initials = (firstName[0] + lastName[0]).toUpperCase();

    const { error } = await supabase.from('profiles').update({
      first_name: firstName,
      last_name: lastName,
      name: fullName,
      initials: initials
    }).eq('id', currentUser.id);

    if (error) throw error;

    // Update local profile
    currentProfile.first_name = firstName;
    currentProfile.last_name = lastName;
    currentProfile.name = fullName;
    currentProfile.initials = initials;

    // Update all name/initials displays
    const profileBtn = document.getElementById('profileBtn');
    if (profileBtn.classList.contains('nav-bar__avatar') && !profileBtn.querySelector('img')) {
      profileBtn.textContent = initials;
    }
    const profileNameEl = document.querySelector('.profile-card__name');
    if (profileNameEl) profileNameEl.textContent = fullName;
    const profileAvatarEl = document.getElementById('profileCardAvatar');
    if (profileAvatarEl && !profileAvatarEl.querySelector('img')) {
      profileAvatarEl.textContent = initials;
    }

    // Advance to step 2
    document.getElementById('onboardStep1').style.display = 'none';
    document.getElementById('onboardStep2').style.display = 'flex';
    document.getElementById('onboardAvatarInitials').textContent = initials;

  } catch (err) {
    console.error('Failed to save name:', err);
    errorEl.textContent = 'Failed to save. Please try again.';
    btn.disabled = false;
    btn.textContent = 'Continue →';
  }
}

function previewOnboardAvatar(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = document.getElementById('onboardAvatarImg');
    img.src = e.target.result;
    img.style.display = 'block';
    document.getElementById('onboardAvatarInitials').style.display = 'none';
    document.getElementById('onboardAvatarLabel').textContent = 'Tap to change photo';
    document.getElementById('onboardPhotoBtn').disabled = false;
  };
  reader.readAsDataURL(file);
}

async function submitOnboardAvatar() {
  const file = document.getElementById('onboardAvatarInput').files[0];
  if (!file || !currentUser) return;

  const btn = document.getElementById('onboardPhotoBtn');
  const errorEl = document.getElementById('onboardPhotoError');

  if (file.size > MAX_AVATAR_SIZE) {
    errorEl.textContent = 'Photo is too large. Please select one under 5MB.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Uploading...';
  showUploadOverlay('Uploading photo...');

  try {
    const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
    const path = currentUser.id + '/avatar.' + ext;

    const { error: uploadError } = await withTimeout(
      supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type }),
      60000, 'Upload'
    );

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

    const { error: updateError } = await supabase.from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', currentUser.id);

    if (updateError) throw updateError;

    currentProfile.avatar_url = publicUrl;
    updateAvatarDisplays(publicUrl);

    // Await background removal — keep overlay visible
    showUploadOverlay('Removing background...');
    const cutoutUrl = await withTimeout(processAvatar(path), 60000, 'Background removal');
    hideUploadOverlay();

    if (cutoutUrl) {
      renderCareerCard();
      updateAvatarDisplays(currentProfile.avatar_url);
      updateNavDrawerUser();
      closeOnboarding();
      showToast('Welcome to AllNet, ' + currentProfile.first_name + '! 🏀');
    } else {
      errorEl.textContent = 'Background removal failed. Try a different photo with a clear background.';
      btn.disabled = false;
      btn.textContent = 'Upload Photo';
    }

  } catch (err) {
    console.error('Avatar upload error:', err);
    hideUploadOverlay();
    errorEl.textContent = 'Upload failed. Try a smaller photo or try again.';
    btn.disabled = false;
    btn.textContent = 'Upload Photo';
  }
}

function skipAvatarUpload() {
  closeOnboarding();
  showToast('Welcome to AllNet, ' + (currentProfile?.first_name || '') + '! Add a photo anytime from your profile 🏀');
}

function closeOnboarding() {
  document.getElementById('onboardingModal').classList.remove('active');
  // Reset for potential future re-open
  document.getElementById('onboardStep1').style.display = 'flex';
  document.getElementById('onboardStep2').style.display = 'none';
  const nameBtn = document.getElementById('onboardNameBtn');
  nameBtn.disabled = false;
  nameBtn.textContent = 'Continue →';

  // Start Play page tour for new users (after a short delay for page to settle)
  // Clear any stale tour flags from previous accounts on this browser
  if (typeof Tour !== 'undefined') {
    try {
      ['play','career','stars','activity','settings'].forEach(function(k) {
        localStorage.removeItem('allnet_tour_' + k);
      });
    } catch(e) {}
    setTimeout(function() {
      Tour.start('play', [
        { target: '#map', text: '<strong>Tap any court</strong> to see who\'s playing, check the weekly forecast, and check in.', button: 'Next →' },
        { target: '#mobileRadiusFilter', fallbackTarget: '#radiusWrapper', text: '<strong>Filter by distance</strong> to find courts near you. Your location stays private.', button: 'Next →' },
        { target: '#navBell', text: '<strong>Get notified</strong> when players check in at courts you\'re watching.', button: 'Next →' },
        { target: '.nav-bar__menu', text: '<strong>Explore AllNet</strong> — your Career card, Stars, Activity, and Settings are all here.', button: "Let's go! 🏀" }
      ]);
    }, 1000);
  }
}

/* ══════════════════════════════
   AVATAR DISPLAY — update all instances
   ══════════════════════════════ */
/* ══════════════════════════════
   BUILD COMPOSITE AVATAR
   Returns HTML string: cover bg + cutout layered inside a circle.
   Falls back to raw photo, then to initials.
   ══════════════════════════════ */
function buildCompositeAvatar() {
  // Delegate to shared function for consistent rendering across all pages
  return buildCompositeAvatarHtml(currentProfile || {});
}

function updateAvatarDisplays(url) {
  // Build composite (uses currentProfile.avatar_cutout_url + selected_cover if available)
  const html = buildCompositeAvatar();

  // Top bar profile button
  const profileBtn = document.getElementById('profileBtn');
  if (profileBtn && profileBtn.classList.contains('nav-bar__avatar')) {
    profileBtn.innerHTML = html;
  }
  // Profile screen large avatar
  const profileAvatar = document.getElementById('profileCardAvatar');
  if (profileAvatar) {
    profileAvatar.innerHTML = html;
  }
}

/* ══════════════════════════════
   COVERS — alias from shared component
   ══════════════════════════════ */
const COVERS = CareerCard.COVERS;

/* ══════════════════════════════
   RENDER CAREER CARD (Profile page)
   Uses shared CareerCard component
   ══════════════════════════════ */
function renderCareerCard() {
  const cardEl = document.getElementById('careerCard');
  if (!cardEl) return;

  cardEl.innerHTML = CareerCard.render({
    cardId: 'profileCC',
    firstName: currentProfile?.first_name || currentProfile?.name?.split(' ')[0] || '',
    lastName: currentProfile?.last_name || currentProfile?.name?.split(' ').slice(1).join(' ') || '',
    cutoutUrl: currentProfile?.avatar_cutout_url,
    avatarUrl: currentProfile?.avatar_url,
    coverSlug: currentProfile?.selected_cover || 'crossover',
    wins: currentProfile?.wins || 0,
    losses: currentProfile?.losses || 0,
    draws: currentProfile?.draws || 0,
    skillRating: currentProfile?.skill_rating ? Number(currentProfile.skill_rating).toFixed(1) : '—',
    socialRating: currentProfile?.social_rating ? Number(currentProfile.social_rating).toFixed(1) : '—',
    divisionLabel: '1V1',
    activeDivision: '1v1',
    showTabs: true,
    onTabClick: 'switchProfileCardDivision',
    showDeltas: false
  });

  requestAnimationFrame(function() { CareerCard.fitNames('profileCC'); });
}

// Profile card division switching
let profileCardDivStats = {};
let profileCardActiveDivision = '1v1';

function switchProfileCardDivision(div) {
  profileCardActiveDivision = div;
  const ds = profileCardDivStats[div];
  const cardEl = document.getElementById('careerCard');
  if (!cardEl) return;

  cardEl.innerHTML = CareerCard.render({
    cardId: 'profileCC',
    firstName: currentProfile?.first_name || currentProfile?.name?.split(' ')[0] || '',
    lastName: currentProfile?.last_name || currentProfile?.name?.split(' ').slice(1).join(' ') || '',
    cutoutUrl: currentProfile?.avatar_cutout_url,
    avatarUrl: currentProfile?.avatar_url,
    coverSlug: currentProfile?.selected_cover || 'crossover',
    wins: ds?.wins || 0,
    losses: ds?.losses || 0,
    draws: ds?.draws || 0,
    skillRating: ds?.skill_rating ? Number(ds.skill_rating).toFixed(1) : '—',
    socialRating: currentProfile?.social_rating ? Number(currentProfile.social_rating).toFixed(1) : '—',
    divisionLabel: div.toUpperCase(),
    activeDivision: div,
    showTabs: true,
    onTabClick: 'switchProfileCardDivision',
    showDeltas: false
  });

  requestAnimationFrame(function() { CareerCard.fitNames('profileCC'); });
}

// Load profile division stats after profile loads
async function loadProfileDivisionStats() {
  if (!currentUser) return;
  const { data } = await supabase.from('player_division_stats').select('*').eq('user_id', currentUser.id);
  if (data) data.forEach(function(r) { profileCardDivStats[r.division] = r; });

  // Auto-select most played division
  let best = '1v1', bg = 0;
  for (const dv in profileCardDivStats) {
    if (profileCardDivStats[dv].games_count > bg) { bg = profileCardDivStats[dv].games_count; best = dv; }
  }
  if (bg > 0) {
    profileCardActiveDivision = best;
    switchProfileCardDivision(best);
  }
}

function showCareerCardProcessing() {
  const cardEl = document.getElementById('careerCard');
  if (!cardEl) return;
  const coverUrl = CareerCard.getCoverUrl(currentProfile?.selected_cover || 'crossover');
  cardEl.innerHTML = `
    <div class="cc__cover" style="background-image:url('${coverUrl}')"></div>
    <div class="cc__overlay"></div>
    <div class="cc__placeholder">
      <div class="cc__placeholder-icon">⚡</div>
      <div class="cc__placeholder-text">Removing background...</div>
    </div>`;
}

/* ══════════════════════════════
   PROCESS AVATAR via Edge Function
   Calls remove.bg, saves cutout,
   updates profile + re-renders card
   ══════════════════════════════ */
async function processAvatar(storagePath) {
  showCareerCardProcessing();
  try {
    let token = null;
    const { data: sessionData } = await supabase.auth.getSession();
    token = sessionData?.session?.access_token;

    if (!token) {
      const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr || !refreshData?.session) throw new Error('Could not get auth session');
      token = refreshData.session.access_token;
    }

    const res = await fetch(SUPABASE_URL + '/functions/v1/avatar-process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ imagePath: storagePath })
    });

    const result = await res.json();
    if (!res.ok) {
      console.error('process-avatar response:', res.status, result);
      throw new Error(result.error || ('Server error ' + res.status));
    }

    currentProfile.avatar_cutout_url = result.cutoutUrl;
    if (!currentProfile.selected_cover) currentProfile.selected_cover = 'crossover';

    renderCareerCard();
    updateAvatarDisplays(currentProfile.avatar_url);
    return result.cutoutUrl;

  } catch (err) {
    console.error('processAvatar error:', err);
    renderCareerCard();
    return null;
  }
}

/* ══════════════════════════════
   GAME START — photo gate
   Checks for profile photo before
   navigating to allnet-phase2.html
   ══════════════════════════════ */
let pendingGameCourt = null;

async function startGame(courtName) {
  if (!currentProfile) return;

  // Gate 1: Check for existing active/lobby/review game
  try {
    const { data: activeGames } = await supabase
      .from('game_players')
      .select('game_id, team, status, game_sessions!inner(id, format, status, started_at, created_at, court_id, courts(name))')
      .eq('user_id', currentUser.id)
      .eq('status', 'active')
      .in('game_sessions.status', ['active', 'lobby', 'review']);

    const resumable = (activeGames || []).filter(g =>
      g.game_sessions && ['active', 'lobby', 'review'].includes(g.game_sessions.status)
    );

    if (resumable.length > 0) {
      resumable.sort((a, b) => new Date(b.game_sessions.created_at) - new Date(a.game_sessions.created_at));
      const g = resumable[0];
      const gs = g.game_sessions;
      const courtDisplayName = gs.courts?.name || 'Unknown Court';
      const isActive = gs.status === 'active';
      const isReview = gs.status === 'review';

      window._resumeGameData = { gameId: gs.id, status: gs.status, courtName: courtDisplayName, courtId: gs.court_id };

      document.getElementById('resumeModalTitle').textContent = isActive ? 'Active Game in Progress' : isReview ? 'Pending Reviews' : 'Game Waiting in Lobby';
      document.getElementById('resumeModalDesc').textContent = isActive
        ? 'You have an active game. Would you like to resume?'
        : isReview ? 'Your game ended but you have pending reviews to submit.'
        : 'You have a game waiting in the lobby. Would you like to return?';
      document.getElementById('resumeModalCourt').textContent = '📍 ' + courtDisplayName + ' · ' + gs.format.toUpperCase();
      document.getElementById('resumeModalPenalty').textContent = isActive
        ? 'Leaving an active game will reduce your social rating by 0.3.'
        : isReview ? 'Missing reviews will result in a rating penalty after the deadline.'
        : 'No penalty for leaving a lobby game.';
      document.getElementById('leaveResumeBtn').textContent = isReview ? 'Skip Reviews' : 'Leave Game';
      document.getElementById('resumeBtn').textContent = isReview ? 'Submit Reviews' : 'Resume Game';
      closeSheet();
      document.getElementById('resumeGameModal').classList.add('active');
      return;
    }
  } catch (err) { console.error('Active game check error:', err); }

  // Gate 2: Check for profile photo
  if (!currentProfile.avatar_url) {
    pendingGameCourt = courtName;
    const initials = currentProfile.initials || 'U';
    document.getElementById('promptAvatarInitials').textContent = initials;
    document.getElementById('promptAvatarInitials').style.display = 'block';
    document.getElementById('promptAvatarImg').style.display = 'none';
    document.getElementById('promptAvatarImg').src = '';
    document.getElementById('promptPhotoBtn').disabled = true;
    document.getElementById('promptPhotoBtn').textContent = 'Upload & Start Game';
    document.getElementById('promptPhotoError').textContent = '';
    document.getElementById('promptAvatarLabel').textContent = 'Tap to upload a photo';
    document.getElementById('photoPromptModal').classList.add('active');
  } else {
    // All clear — navigate to game creation
    window.location.href = 'allnet-phase2.html?court=' + encodeURIComponent(courtName);
  }
}

function closePhotoPromptModal() {
  document.getElementById('photoPromptModal').classList.remove('active');
  pendingGameCourt = null;
}

function previewPromptAvatar(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = document.getElementById('promptAvatarImg');
    img.src = e.target.result;
    img.style.display = 'block';
    document.getElementById('promptAvatarInitials').style.display = 'none';
    document.getElementById('promptAvatarLabel').textContent = 'Tap to change photo';
    document.getElementById('promptPhotoBtn').disabled = false;
  };
  reader.readAsDataURL(file);
}

async function submitPromptAvatar() {
  const file = document.getElementById('promptAvatarInput').files[0];
  if (!file || !currentUser) return;

  const btn = document.getElementById('promptPhotoBtn');
  const errorEl = document.getElementById('promptPhotoError');

  if (file.size > MAX_AVATAR_SIZE) {
    errorEl.textContent = 'Photo is too large. Please select one under 5MB.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Uploading...';
  showUploadOverlay('Uploading photo...');

  try {
    const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
    const path = currentUser.id + '/avatar.' + ext;

    const { error: uploadError } = await withTimeout(
      supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type }),
      60000, 'Upload'
    );

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', currentUser.id);
    currentProfile.avatar_url = publicUrl;
    updateAvatarDisplays(publicUrl);

    // Await background removal — keep overlay visible
    showUploadOverlay('Removing background...');
    const cutoutUrl = await withTimeout(processAvatar(path), 60000, 'Background removal');
    hideUploadOverlay();

    if (cutoutUrl) {
      renderCareerCard();
      updateAvatarDisplays(currentProfile.avatar_url);
      updateNavDrawerUser();
      closePhotoPromptModal();
      if (pendingGameCourt) {
        window.location.href = 'allnet-phase2.html?court=' + encodeURIComponent(pendingGameCourt);
      }
    } else {
      errorEl.textContent = 'Background removal failed. Try a different photo with a clear background.';
      btn.disabled = false;
      btn.textContent = 'Upload & Start Game';
    }

  } catch (err) {
    console.error('Prompt avatar upload error:', err);
    hideUploadOverlay();
    errorEl.textContent = 'Upload failed. Try a smaller photo or try again.';
    btn.disabled = false;
    btn.textContent = 'Upload & Start Game';
  }
}

/* ══════════════════════════════
   SUPABASE INTEGRATION LAYER
   ══════════════════════════════ */
let currentUser = null;
let currentProfile = null;
let dbCourts = null;

// ── Splash Screen ──
function dismissSplash() {
  const splash = document.getElementById('splashScreen');
  if (!splash || splash.classList.contains('dismiss')) return;
  splash.classList.add('dismiss');
  setTimeout(() => splash.remove(), 500);
}

async function initApp() {
  if (typeof supabase === 'undefined' || typeof fetchCourts !== 'function') {
    console.log('AllNet: Running in demo mode (no Supabase)');
    dismissSplash();
    return;
  }

  try {
    // ── Step 1: Establish session FIRST ──
    // On OAuth redirects, tokens are in the URL hash. getSession() detects and
    // exchanges them. This MUST run before any other async work so the session
    // is established before any authenticated API calls happen.
    if (!currentUser) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && session.user && !currentUser) {
        console.log('AllNet: getSession found session — loading profile');
        await loadUserProfile(session.user);
      } else if (!session) {
        console.log('AllNet: No session — user not logged in');
        const navRight = document.getElementById('navBarRight');
        if (navRight) navRight.style.opacity = '1';
      }
    }

    // ── Step 2: Load courts (no auth needed) ──
    const courtData = await fetchCourts();
    if (courtData && courtData.length > 0) {
      dbCourts = courtData;
      courts.length = 0;
      courtData.forEach(c => {
        courts.push({
          id: c.id,
          name: c.name,
          address: c.address,
          lat: parseFloat(c.lat),
          lng: parseFloat(c.lng),
          status: c.status || 'quiet',
          players: c.current_checkins || 0,
          type: c.court_type,
          forecast: [c.forecast_mon, c.forecast_tue, c.forecast_wed, c.forecast_thu, c.forecast_fri, c.forecast_sat, c.forecast_sun],
          checkedIn: []
        });
      });
      renderMarkers();
      console.log('AllNet: ' + courts.length + ' courts loaded from Supabase');

      // Now that courts are loaded, request location to center map
      setTimeout(autoRequestLocation, 500);
    }

    // Dismiss splash only after map has finished rendering dots
    if (courtsLayersReady) {
      // Map already loaded — dots are being painted, wait for idle
      map.once('idle', () => dismissSplash());
      // Safety: dismiss after 6s max in case idle never fires
      setTimeout(dismissSplash, 6000);
    } else {
      // Map hasn't loaded yet — it will call renderMarkers() on load,
      // then we wait for idle after that
      map.once('load', () => {
        map.once('idle', () => dismissSplash());
        setTimeout(dismissSplash, 6000);
      });
    }

    // Show toast if redirected from leave game
    const toastParam = new URLSearchParams(window.location.search).get('toast');
    if (toastParam === 'left_game') {
      setTimeout(() => showToast('You left the game'), 500);
      history.replaceState(null, '', window.location.pathname);
    } else if (toastParam === 'left_penalty') {
      setTimeout(() => showToast('You left the match. Social rating −0.3'), 500);
      history.replaceState(null, '', window.location.pathname);
    }

    // ── Step 4: Check for active/lobby game to resume ──
    if (currentUser && !toastParam) {
      try {
        const { data: activeGames } = await supabase
          .from('game_players')
          .select('game_id, team, status, game_sessions!inner(id, format, status, started_at, created_at, court_id, courts(name))')
          .eq('user_id', currentUser.id)
          .eq('status', 'active')
          .in('game_sessions.status', ['active', 'lobby', 'review']);

        const resumable = (activeGames || []).filter(g =>
          g.game_sessions && ['active', 'lobby', 'review'].includes(g.game_sessions.status)
        );
        // Sort by most recently created — always resume the newest game
        resumable.sort((a, b) => new Date(b.game_sessions.created_at) - new Date(a.game_sessions.created_at));
        if (resumable.length > 0) {
          // Auto-cleanup older stale games (keep only the newest)
          for (let i = 1; i < resumable.length; i++) {
            const staleId = resumable[i].game_sessions.id;
            supabase.from('game_players').update({ status: 'abandoned', left_at: new Date().toISOString() })
              .eq('game_id', staleId).eq('user_id', currentUser.id).then(() => {});
            supabase.from('game_sessions').update({ status: 'nulled', ended_at: new Date().toISOString() })
              .eq('id', staleId).then(() => {});
          }

          const g = resumable[0];
          const gs = g.game_sessions;
          const courtDisplayName = gs.courts?.name || 'Unknown Court';
          const isActive = gs.status === 'active';
          const isReview = gs.status === 'review';

          window._resumeGameData = { gameId: gs.id, status: gs.status, courtName: courtDisplayName, courtId: gs.court_id };

          document.getElementById('resumeModalTitle').textContent = isActive ? 'Active Game in Progress' : isReview ? 'Pending Reviews' : 'Game Waiting in Lobby';
          document.getElementById('resumeModalDesc').textContent = isActive
            ? 'You have an active game. Would you like to resume?'
            : isReview ? 'Your game ended but you have pending reviews to submit.'
            : 'You have a game waiting in the lobby. Would you like to return?';
          document.getElementById('resumeModalCourt').textContent = '📍 ' + courtDisplayName + ' · ' + gs.format.toUpperCase();
          document.getElementById('resumeModalPenalty').textContent = isActive
            ? 'Leaving an active game will reduce your social rating by 0.3.'
            : isReview ? 'Missing reviews will result in a rating penalty after the deadline.'
            : 'No penalty for leaving a lobby game.';
          document.getElementById('leaveResumeBtn').textContent = isReview ? 'Skip Reviews' : 'Leave Game';
          document.getElementById('resumeBtn').textContent = isReview ? 'Submit Reviews' : 'Resume Game';
          document.getElementById('resumeGameModal').classList.add('active');
        }
      } catch (err) { console.error('Resume check error:', err); }
    }
  } catch (err) {
    console.error('AllNet: Supabase init error', err);
    dismissSplash(); // Dismiss even on error so user isn't stuck
  }
}

// Override openSheet to show immediately, then load real data
let _sheetLoading = false;
const _originalOpenSheet = openSheet;
openSheet = async function(court) {
  // Double-tap guard
  if (_sheetLoading) return;

  // Set known local state immediately
  court._watching = userWatches.has(court.id);
  court._reported = false;
  // Show sheet instantly with static data + loading placeholder for check-ins
  court.checkedIn = [];
  court.players = court.players || 0;
  _originalOpenSheet(court);

  // Replace check-in list with loading spinner
  const checkinList = document.querySelector('.checkin-list');
  if (checkinList) {
    checkinList.innerHTML = '<div class="checkin-loading"><div class="checkin-loading__spinner"></div><span>Loading players...</span></div>';
  }

  // Hide report section until we know report status
  const reportSection = document.getElementById('courtReportSection');
  if (reportSection) reportSection.style.opacity = '0.3';

  // Fetch live data in parallel
  const isRealCourt = court.id && typeof court.id === 'string' && court.id.length > 10;
  if (isRealCourt) {
    _sheetLoading = true;
    try {
      // Court data (checkins) is public — fetch for all users
      // Report status requires auth — skip for non-authenticated
      const [reportResult, checkinResult] = await Promise.all([
        currentUser ? hasUserReported(court.id).catch(() => false) : Promise.resolve(false),
        fetchCourtWithCheckins(court.id).catch(() => ({ court: null, checkins: null }))
      ]);

      // If sheet was closed while loading, bail out
      if (!document.getElementById('courtSheet').classList.contains('open')) {
        _sheetLoading = false;
        return;
      }

      // Update check-in data
      const checkins = checkinResult.checkins;
      if (checkins) {
        court.checkedIn = checkins.map(c => ({
          name: c.profiles?.name || 'Unknown',
          initials: c.profiles?.initials || '??',
          time: timeAgo(new Date(c.checked_in_at)),
          badge: c.profiles?.is_founding_hooper || false,
          userId: c.user_id,
          avatarUrl: c.profiles?.avatar_url || null,
          avatarCutoutUrl: c.profiles?.avatar_cutout_url || null,
          selectedCover: c.profiles?.selected_cover || null
        }));
        court.players = checkins.length;
        court.status = checkins.length >= 10 ? 'packed' : checkins.length > 0 ? 'active' : 'quiet';
      }

      // Surgical DOM updates (no full re-render)
      _updateSheetLiveData(court, reportResult);

      // Fetch leaderboard (non-blocking, renders after main data)
      fetchAndRenderLeaderboard(court.id);
    } catch (err) {
      console.error('Failed to load court data:', err);
      // Show fallback in check-in list
      const cl = document.querySelector('.checkin-list');
      if (cl) cl.innerHTML = '<div class="empty-checkins">Could not load check-ins</div>';
    }
    _sheetLoading = false;
  }
};

// Update sheet DOM with fresh async data (no full re-render)
function _updateSheetLiveData(court, reported) {
  // Update player count
  const playerVal = document.querySelector('.pulse-stat__value');
  if (playerVal) {
    playerVal.textContent = court.players;
    playerVal.style.color = court.status === 'packed' ? 'var(--orange)' : court.status === 'active' ? 'var(--green-live)' : 'var(--text-muted)';
  }

  // Update checked-in count
  const statValues = document.querySelectorAll('.pulse-stat__value');
  if (statValues.length >= 2) statValues[1].textContent = court.checkedIn.length;

  // Update status dot + label
  const statusIcon = court.status === 'packed' ? '🔥' : court.status === 'active' ? '🏀' : '😴';
  const statusDot = document.querySelector('.status-dot-lg');
  if (statusDot) {
    statusDot.textContent = statusIcon;
    statusDot.className = 'status-dot-lg status-dot-lg--' + court.status;
  }
  const statusLabel = document.querySelector('.status-label');
  if (statusLabel) {
    statusLabel.textContent = court.status.charAt(0).toUpperCase() + court.status.slice(1);
    statusLabel.className = 'status-label status-label--' + court.status;
  }

  // Update check-in list
  const checkinList = document.querySelector('.checkin-list');
  if (checkinList) {
    if (court.checkedIn.length > 0) {
      checkinList.innerHTML = court.checkedIn.map(p => {
        const avatarContent = buildCompositeAvatarHtml({
          avatar_cutout_url: p.avatarCutoutUrl, avatar_url: p.avatarUrl,
          selected_cover: p.selectedCover, initials: p.initials, name: p.name
        });
        return `<div class="checkin-player" onclick="${`closeSheet();showPlayerCard('${p.name.replace(/'/g, "\\'")}'${p.userId ? `,'${p.userId}'` : ''})`}">
          <div class="checkin-player__avatar">${avatarContent}</div>
          <div class="checkin-player__info">
            <div class="checkin-player__name">${p.name}</div>
            <div class="checkin-player__meta">${p.time}</div>
          </div>
          ${p.badge ? '<span class="checkin-player__badge">Founding</span>' : ''}
        </div>`;
      }).join('');
    } else {
      checkinList.innerHTML = '<div class="empty-checkins">No one checked in yet. Be the first!</div>';
    }
  }

  // Update report section
  const reportSection = document.getElementById('courtReportSection');
  if (reportSection) {
    reportSection.style.opacity = '1';
    reportSection.innerHTML = reported
      ? '<span class="court-report__done">⚑ You reported this listing</span>'
      : `<button class="court-report__btn" onclick="showReportModal('${court.id}')">⚑ Report incorrect listing</button>`;
  }
}

// Override checkIn to write to Supabase
const _originalCheckIn = checkIn;
checkIn = async function(courtId) {
  if (currentUser && courtId && typeof courtId === 'string' && courtId.length > 10) {
    const court = courts.find(c => c.id === courtId);
    if (court) {
      const proximity = validateProximity(court);
      if (!proximity.ok) {
        handleProximityFailure(proximity, court.name);
        return;
      }
    }
    if (activeCheckin && activeCheckin.courtId !== courtId) {
      const oldName = activeCheckin.courtName;
      const newCourt = courts.find(c => c.id === courtId);
      const confirmed = await showConfirm('Switch Courts?', `You're currently checked in at ${oldName}. Check out and move to ${newCourt?.name || 'this court'}?`, { icon: '📍', confirmText: 'Switch', cancelText: 'Stay' });
      if (!confirmed) return;
      performCheckout();
      await new Promise(r => setTimeout(r, 300));
    }
    if (checkinCourts.has(courtId)) return;
    try {
      await checkInAtCourt(courtId);
      const court = courts.find(c => c.id === courtId);
      if (court) {
        court.players++;
        if (court.players >= 10) court.status = 'packed';
        else if (court.players > 0) court.status = 'active';
      }
      checkinCourts.add(courtId);
      userCheckins.unshift({ courtId, courtName: court?.name || 'Court', time: new Date() });
      updateProfileStats();
      startCheckinTimers(courtId, court?.name || 'Court');
      renderMarkers();
      openSheet(court);
      showToast(court?.name || 'Court', true);
    } catch (err) {
      console.error('Check-in failed:', err);
      showAlert('Check-In Failed', err.message, { icon: '⚠️' });
    }
  } else {
    _originalCheckIn(courtId);
  }
};

// timeAgo() defined in js/supabase-helpers.js

/* ══════════════════════════════
   LOAD USER PROFILE — single source of truth
   Called from auth listener and initApp getSession fallback.
   Never duplicated.
   ══════════════════════════════ */
async function loadUserProfile(user) {
  if (!user) return;
  console.log('AllNet: loadUserProfile called for', user.id);
  currentUser = user;
  try {
    currentProfile = await getUserProfile(user.id);
    console.log('AllNet: getUserProfile returned:', currentProfile ? currentProfile.name : 'null');
    if (currentProfile) {
      const btn = document.getElementById('profileBtn');
      btn.className = 'nav-bar__avatar';
      btn.innerHTML = buildCompositeAvatar();

      // Show bell icon and update badge
      const bellEl = document.getElementById('navBell');
      if (bellEl) bellEl.style.display = 'flex';
      updateNotificationBadge();

      const profileName = document.querySelector('.profile-card__name');
      if (profileName) profileName.textContent = currentProfile.name || 'Your Profile';

      const profileAvatar = document.getElementById('profileCardAvatar');
      if (profileAvatar) profileAvatar.innerHTML = buildCompositeAvatar();

      const profileLocation = document.querySelector('.profile-card__location');
      if (profileLocation) profileLocation.textContent = '📍 ' + (currentProfile.location || 'OC/LA');

      const profileDays = document.getElementById('profileDays');
      if (profileDays) {
        const daysSince = Math.floor((Date.now() - new Date(currentProfile.joined_at).getTime()) / 86400000);
        profileDays.textContent = daysSince || 1;
      }
      document.getElementById('profileCheckins').textContent = currentProfile.total_checkins || 0;
      document.getElementById('profileCourts').textContent = currentProfile.unique_courts || 0;

      renderCareerCard();
      loadProfileDivisionStats();
      checkOnboarding();
      checkRatingUpdates();

      // Show star balance in top bar
      const starsEl = document.getElementById('topBarStars');
      const starsCount = document.getElementById('topBarStarsCount');
      if (starsEl && starsCount) {
        starsCount.textContent = (currentProfile.stars_balance || 0).toLocaleString();
        starsEl.style.display = 'flex';
      }

      // Reveal nav bar right section (was hidden to prevent flash)
      const navRight = document.getElementById('navBarRight');
      if (navRight) navRight.style.opacity = '1';
    }

    const myCheckins = await getUserCheckins(currentUser.id);
    if (myCheckins) {
      userCheckins = myCheckins.map(c => ({
        courtId: c.court_id,
        courtName: c.courts?.name || 'Unknown',
        time: new Date(c.checked_in_at)
      }));
      // Only mark courts where user is ACTIVELY checked in (not checked out)
      myCheckins.filter(c => !c.checked_out_at).forEach(c => checkinCourts.add(c.court_id));
      updateProfileStats();

      // Restore activeCheckin and timers from the most recent active check-in
      const activeDbCheckin = myCheckins.find(c => !c.checked_out_at);
      if (activeDbCheckin) {
        const courtName = activeDbCheckin.courts?.name || 'Unknown';
        const checkinTime = new Date(activeDbCheckin.checked_in_at).getTime();
        startCheckinTimers(activeDbCheckin.court_id, courtName, checkinTime);
        console.log('AllNet: Restored active check-in at ' + courtName);
      }
    }

    await loadUserWatches();
    updateNavDrawerUser();

    // Re-subscribe to push notifications silently (if permission was granted before)
    if (typeof PushManager_ !== 'undefined') {
      PushManager_.resubscribeSilently().catch(err => console.error('Push resubscribe failed:', err));
      PushManager_.showA2HSBannerIfNeeded();
    }

    // Process referral if one was stashed before OAuth redirect
    // Priority: cookie (most reliable across OAuth) > localStorage > URL param
    try {
      function getCookieVal(name) {
        var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
        return match ? decodeURIComponent(match[1]) : '';
      }
      const storedRef = getCookieVal('allnet_ref')
        || localStorage.getItem('allnet_ref') 
        || new URLSearchParams(window.location.search).get('ref')
        || '';
      if (storedRef && currentProfile && !currentProfile.referred_by) {
        console.log('AllNet: Processing referral code:', storedRef);
        const { data: refResult, error: refErr } = await supabase.rpc('process_referral', { p_referral_code: storedRef });
        if (refErr) {
          console.error('AllNet: Referral RPC error:', refErr);
        } else if (refResult && refResult.success) {
          console.log('AllNet: Referral success! Awarded', refResult.stars_awarded, 'stars');
          currentProfile.stars_balance = (currentProfile.stars_balance || 0) + refResult.stars_awarded;
          const starsCount = document.getElementById('topBarStarsCount');
          if (starsCount) starsCount.textContent = currentProfile.stars_balance.toLocaleString();
          showToast('⭐ You earned ' + refResult.stars_awarded + ' Stars from a referral!');
        } else {
          console.log('AllNet: Referral not applied:', refResult?.error);
        }
        // Clean up all referral storage
        document.cookie = 'allnet_ref=;path=/;max-age=0';
        localStorage.removeItem('allnet_ref');
        if (new URLSearchParams(window.location.search).get('ref')) {
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
    } catch (refCatchErr) {
      console.error('AllNet: Referral processing failed:', refCatchErr);
      document.cookie = 'allnet_ref=;path=/;max-age=0';
      localStorage.removeItem('allnet_ref');
    }

    console.log('AllNet: Profile loaded — ' + currentProfile?.name);
  } catch (err) {
    console.error('AllNet: Failed to load profile', err);
  }
}

/* ══════════════════════════════
   LOG OUT
   ══════════════════════════════ */
async function logOut() {
  try {
    await supabase.auth.signOut();
    closeProfile();
    showToast('Logged out');
  } catch (err) {
    console.error('Sign out failed:', err);
  }
}

// ═══════════════════════════════════════════════
// BOOT SEQUENCE — order matters
// 1. Register auth listener FIRST (before any async work)
// 2. Then run initApp to load courts + proactive session check
// ═══════════════════════════════════════════════

// Step 1: Auth listener — catches OAuth redirects (SIGNED_IN / INITIAL_SESSION) and sign-outs.
// Registered BEFORE initApp so no events are missed.
// Both this and getSession() in initApp have !currentUser guards to prevent double-loading.
supabase.auth.onAuthStateChange(async (event, session) => {
  console.log('AllNet: Auth event:', event, 'session:', !!session, 'currentUser:', !!currentUser);

  if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session && !currentUser) {
    // Fresh OAuth redirect or returning user with stored session
    // Don't await inside the callback — let Supabase finish its internal
    // auth setup first, then load the profile on the next tick.
    console.log('AllNet: ' + event + ' — scheduling profile load');
    const user = session.user;
    setTimeout(() => loadUserProfile(user), 0);
  }

  if (event === 'SIGNED_OUT') {
    // Clear push subscription before wiping user state
    if (typeof PushManager_ !== 'undefined') {
      PushManager_.removeSubscription().catch(err => console.error('Push cleanup failed:', err));
    }
    currentUser = null;
    currentProfile = null;
    userWatches = new Set();
    userCheckins = [];
    checkinCourts = new Set();
    const btn = document.getElementById('profileBtn');
    btn.className = 'nav-bar__cta';
    btn.textContent = 'Get Started';
    btn.onclick = () => handleProfileClick();
    updateWatchingChipVisibility();
    renderMarkers();
    // Hide star balance and bell
    const starsEl = document.getElementById('topBarStars');
    if (starsEl) starsEl.style.display = 'none';
    const bellEl = document.getElementById('navBell');
    if (bellEl) bellEl.style.display = 'none';
    const bellBadge = document.getElementById('navBellBadge');
    if (bellBadge) bellBadge.style.display = 'none';
    notificationsLoaded = false;
    updateNavDrawerUser();
  }
});

// Step 2: Register service worker for push notifications
if (typeof PushManager_ !== 'undefined') {
  PushManager_.init();
}

// Step 3: Handle notification deep link (?court=xxx)
function handleCourtDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const courtId = params.get('court');
  if (courtId) {
    // Wait for courts to load, then open the sheet
    const checkInterval = setInterval(() => {
      if (window.courts && window.courts.length > 0) {
        clearInterval(checkInterval);
        const court = window.courts.find(c => c.id === courtId);
        if (court && typeof openSheet === 'function') {
          openSheet(court);
          // Clean up URL
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
    }, 200);
    // Safety: stop checking after 10 seconds
    setTimeout(() => clearInterval(checkInterval), 10000);
  }
}
handleCourtDeepLink();

// ═══════════════════════════════════════
// RESUME GAME — modal handlers
// ═══════════════════════════════════════
const LEAVE_PENALTY_AMOUNT = 0.3;

function resumeGame() {
  const data = window._resumeGameData;
  if (!data) return;
  document.getElementById('resumeGameModal').classList.remove('active');
  const mode = data.status === 'active' ? 'resume' : data.status === 'review' ? 'review' : 'lobby';
  window.location.href = 'allnet-phase2.html?mode=' + mode + '&game_id=' + data.gameId + '&court=' + encodeURIComponent(data.courtName);
}

async function leaveFromResume() {
  const data = window._resumeGameData;
  if (!data || !currentUser) return;
  const btn = document.getElementById('leaveResumeBtn');
  btn.textContent = 'Leaving...';
  btn.disabled = true;

  try {
    const isActive = data.status === 'active';
    const isReview = data.status === 'review';

    if (isReview) {
      // Skip reviews — no immediate penalty, pg_cron deadline will handle it
      // Just dismiss the modal
    } else if (isActive) {
      // Apply -0.3 social penalty
      await supabase.from('game_players')
        .update({ status: 'abandoned', left_at: new Date().toISOString() })
        .eq('game_id', data.gameId).eq('user_id', currentUser.id);

      const newSocial = Math.max(1.0, (currentProfile?.social_rating || 3.0) - LEAVE_PENALTY_AMOUNT);
      await supabase.from('profiles')
        .update({ social_rating: newSocial })
        .eq('id', currentUser.id);

      await supabase.from('notifications').insert({
        user_id: currentUser.id,
        type: 'leave_penalty',
        title: 'You left an active match',
        body: 'Social rating reduced by ' + LEAVE_PENALTY_AMOUNT.toFixed(1) + ' for leaving during a game.',
        game_id: data.gameId,
        read: false
      });

      // Auto-void if team empty
      const { data: remaining } = await supabase.from('game_players')
        .select('team, status').eq('game_id', data.gameId).eq('status', 'active');
      if (remaining) {
        const teamsWithPlayers = new Set(remaining.map(p => p.team));
        if (teamsWithPlayers.size < 2) {
          await supabase.from('game_sessions')
            .update({ status: 'nulled', ended_at: new Date().toISOString() })
            .eq('id', data.gameId);
        }
      }

      if (currentProfile) currentProfile.social_rating = newSocial;
    } else {
      // Lobby — no penalty, clean up
      await supabase.from('game_players')
        .delete().eq('game_id', data.gameId).eq('user_id', currentUser.id);

      // Reassign creator or cancel
      const { data: game } = await supabase.from('game_sessions')
        .select('creator_id').eq('id', data.gameId).single();
      if (game && game.creator_id === currentUser.id) {
        const { data: others } = await supabase.from('game_players')
          .select('user_id').eq('game_id', data.gameId).limit(1);
        if (others && others.length > 0) {
          await supabase.from('game_sessions')
            .update({ creator_id: others[0].user_id }).eq('id', data.gameId);
        } else {
          await supabase.from('game_sessions')
            .update({ status: 'cancelled' }).eq('id', data.gameId);
        }
      }
    }
  } catch (err) {
    console.error('Leave from resume error:', err);
  }

  document.getElementById('resumeGameModal').classList.remove('active');
  btn.textContent = 'Leave Game';
  btn.disabled = false;
  showToast(data.status === 'active' ? 'You left the match. Social rating −0.3' : data.status === 'review' ? 'Reviews skipped' : 'You left the game');
}

// Step 4: Init app — load courts, then check for existing session
initApp();
