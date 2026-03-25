/* ══════════════════════════════
   DATA — loaded from Supabase
   ══════════════════════════════ */
const courts = [];

const dayLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
let currentFilter = 'all';
let markers = [];
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
  if (!overlay || !cardEl) return;

  const { data: player } = await supabase.from('profiles')
    .select('id, first_name, last_name, name, avatar_cutout_url, selected_cover, social_rating, skill_rating')
    .eq('id', userId).single();
  if (!player) return;

  const { data: stats } = await supabase.from('player_division_stats')
    .select('*').eq('user_id', userId);

  const divStats = {};
  let bestDiv = '1v1', bestGames = 0;
  if (stats) stats.forEach(s => {
    divStats[s.division] = s;
    if (s.games_count > bestGames) { bestGames = s.games_count; bestDiv = s.division; }
  });

  overlay._playerData = { player, divStats, activeDivision: bestGames > 0 ? bestDiv : '1v1' };
  renderPlayerSheetCard();
  overlay.classList.add('active');
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

function renderMarkers() {
  markers.forEach(m => m.remove());
  markers = [];

  // Get current map viewport bounds for "Map Area" mode
  const bounds = map.getBounds();

  courts.forEach(court => {
    if (currentFilter === 'watching') {
      if (!userWatches.has(court.id)) return;
    } else if (currentFilter !== 'all' && court.status !== currentFilter) {
      return;
    }

    if (nearMeActive && userLat !== null && userLng !== null) {
      // Radius mode: filter by distance from user
      const dist = haversineMiles(userLat, userLng, court.lat, court.lng);
      if (dist > radiusMiles) return;
      court._distance = dist;
    } else if (currentFilter !== 'watching') {
      // Map Area mode: only show courts within viewport (with small padding)
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
    const size = isWatchedView ? 16 : (court.status === 'quiet' ? 12 : 14 + (court.players / 2.5));

    const el = document.createElement('div');
    el.style.cssText = 'display:flex;align-items:center;justify-content:center;cursor:pointer;';

    const dot = document.createElement('div');
    dot.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.85);transition:transform 0.15s ease;`;

    if (court.status !== 'quiet') {
      dot.style.boxShadow = `0 0 ${size}px ${Math.round(size/2)}px ${color}40`;
    }

    el.appendChild(dot);

    el.addEventListener('mouseenter', () => dot.style.transform = 'scale(1.2)');
    el.addEventListener('mouseleave', () => dot.style.transform = 'scale(1)');
    el.addEventListener('click', (e) => { e.stopPropagation(); openSheet(court); });

    const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([court.lng, court.lat])
      .addTo(map);

    markers.push(marker);
  });

  // Track where markers were rendered so we can detect significant panning
  if (typeof updateLastRenderCenter === 'function') updateLastRenderCenter();
  if (typeof hideSearchAreaBtn === 'function') hideSearchAreaBtn();
}

/* ══════════════════════════════
   FILTER
   ══════════════════════════════ */
function setFilter(filter, chipEl) {
  if (filter === 'watching' && !currentUser) {
    showSignUpModal('watch');
    return;
  }
  currentFilter = filter;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  chipEl.classList.add('active');
  renderMarkers();
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

  if (radiusMiles === 0) {
    // "Map Area" mode — show courts in current viewport, no radius filter
    nearMeActive = false;
    sel.classList.remove('active');
    renderMarkers();
    return;
  }

  if (userLat === null || userLng === null) {
    requestLocation(() => {
      nearMeActive = true;
      sel.classList.add('active');
      renderMarkers();
      const zoom = radiusMiles <= 5 ? 13 : radiusMiles <= 10 ? 12 : radiusMiles <= 15 ? 11 : 10;
      map.flyTo({ center: [userLng, userLat], zoom, duration: 800 });
    });
  } else {
    nearMeActive = true;
    sel.classList.add('active');
    renderMarkers();
    const zoom = radiusMiles <= 5 ? 13 : radiusMiles <= 10 ? 12 : radiusMiles <= 15 ? 11 : 10;
    map.flyTo({ center: [userLng, userLat], zoom, duration: 800 });
  }
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

        // Check if user is near any courts — if so, center map on them
        // Stay in "Map Area" mode (viewport-based), don't activate radius filter
        const nearbyCourts = courts.filter(c =>
          haversineMiles(userLat, userLng, c.lat, c.lng) <= 25
        );

        if (nearbyCourts.length > 0) {
          map.flyTo({ center: [userLng, userLat], zoom: 12, duration: 800 });
          // Re-render after fly completes to show courts in new viewport
          map.once('moveend', () => renderMarkers());
        } else {
          // User is far from all courts — stay on OC, render viewport courts
          renderMarkers();
          console.log('Auto-location: no courts nearby, staying on OC');
        }
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
  renderMarkers();
  // Delay autoRequestLocation until courts are loaded
  // initApp() will call autoRequestLocation after courts are populated
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

  // Reset filter to "All Courts"
  currentFilter = 'all';
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  document.querySelector('.filter-chip[data-filter="all"]').classList.add('active');

  renderMarkers();
  hideSearchAreaBtn();

  // Count visible markers for feedback
  const count = markers.length;
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
  const peakWindows = { low: 'Low traffic expected', med: 'Moderate \u2014 try 5\u20138 PM', high: 'Busy \u2014 peak around 5\u20138 PM', packed: 'Very busy \u2014 expect waits' };
  const levelLabels = { low: 'Quiet', med: 'Moderate', high: 'Busy', packed: 'Packed' };
  const forecastBars = court.forecast.map((val, i) => {
    const h = Math.max(6, (val / maxForecast) * 78);
    const level = val >= 80 ? 'packed' : val >= 50 ? 'high' : val >= 25 ? 'med' : 'low';
    const isNow = i === todayIdx;
    return `<div class="forecast-bar-wrapper" onclick="toggleForecastTooltip(this)">
      <div class="forecast-tooltip">
        <div class="forecast-tooltip__day">${dayLabelsFull[i]}${isNow ? ' (Today)' : ''}</div>
        <div class="forecast-tooltip__level forecast-tooltip__level--${level}">${levelLabels[level]}</div>
        <div class="forecast-tooltip__peak">${peakWindows[level]}</div>
      </div>
      <div class="forecast-bar forecast-bar--${level} ${isNow ? 'forecast-bar--now' : ''}" style="height:${h}px;"></div>
      <span class="forecast-label ${isNow ? 'forecast-label--now' : ''}">${dayLabels[i]}</span>
    </div>`;
  }).join('');

  const checkinHTML = court.checkedIn.length > 0
    ? court.checkedIn.map(p => {
        const avatarContent = p.avatarUrl
          ? `<img src="${p.avatarUrl}" class="avatar-img" alt="${p.name}">`
          : p.initials;
        return `<div class="checkin-player" onclick="${(currentProfile && p.name === currentProfile.name) ? 'closeSheet();openProfile()' : `closeSheet();showPlayerCard('${p.name}'${p.userId ? `,'${p.userId}'` : ''})`}">
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
        <div class="status-dot-lg status-dot-lg--${statusClass}">${statusIcon}</div>
        <span class="status-label status-label--${statusClass}">${court.status.charAt(0).toUpperCase() + court.status.slice(1)}</span>
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
          <span class="forecast-yaxis__label">Busy</span>
          <span class="forecast-yaxis__label">Moderate</span>
          <span class="forecast-yaxis__label">Quiet</span>
        </div>
        <div class="forecast-chart">${forecastBars}</div>
      </div>
    </div>

    <div class="checkins-section">
      <div class="forecast-title">// Checked In Now</div>
      <div class="checkin-list">${checkinHTML}</div>
    </div>

    <div class="court-actions">
      ${checkinCourts.has(court.id)
        ? `<button class="btn btn--success" onclick="startGame('${court.name.replace(/'/g, "\\'")}')">🏀 Start a Game</button>`
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
    const { error } = await supabase.auth.signInWithOAuth({
      provider: provider,
      options: { redirectTo: window.location.href }
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
const CHECKIN_RADIUS_MILES = 0.3;

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
    showAlert('Too Far Away', `You're ${result.distance.toFixed(1)} miles from ${courtName}. You need to be within ${CHECKIN_RADIUS_MILES} miles to check in.`, { icon: '📍' });
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
  if (chip) {
    chip.style.display = (currentUser && userWatches.size > 0) ? 'flex' : 'none';
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

function startCheckinTimers(courtId, courtName) {
  clearCheckinTimers();
  activeCheckin = { courtId, courtName, time: Date.now(), checkinId: null };
  nudgeTimer = setTimeout(() => { showNudgeBanner(courtName); }, NUDGE_MS);
  expireTimer = setTimeout(() => { autoCheckout(); }, EXPIRE_MS);
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

function manualCheckout() {
  performCheckout();
  showToast('Checked out');
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
  renderCareerCard();
  document.getElementById('profileScreen').classList.add('open');
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

  list.innerHTML = userCheckins.map(c => {
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
   PROFILE AVATAR — change from profile screen
   ══════════════════════════════ */
function triggerProfileAvatarUpload() {
  if (!currentUser) return;
  document.getElementById('profileAvatarInput').click();
}

async function handleProfileAvatarChange(input) {
  const file = input.files[0];
  if (!file || !currentUser) return;
  const avatarEl = document.getElementById('profileCardAvatar');
  avatarEl.innerHTML = '<span style="font-size:13px;color:var(--text-muted);">Uploading...</span>';
  try {
    const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
    const path = currentUser.id + '/avatar.' + ext;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', currentUser.id);
    currentProfile.avatar_url = publicUrl;
    updateAvatarDisplays(publicUrl);
    showToast('Profile photo updated — removing background... ⚡');
    // Process avatar in background — card will update when done
    processAvatar(path).then(() => {
      showToast('Career card updated 🏀');
    }).catch(err => console.error('processAvatar failed (non-fatal):', err));
  } catch (err) {
    console.error('Profile avatar upload failed:', err);
    avatarEl.textContent = currentProfile?.initials || 'U';
    showToast('Photo upload failed. Please try again.');
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
    if (profileBtn.classList.contains('top-bar__profile') && !profileBtn.querySelector('img')) {
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
  btn.disabled = true;
  btn.textContent = 'Uploading...';
  const errorEl = document.getElementById('onboardPhotoError');

  try {
    const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
    const path = currentUser.id + '/avatar.' + ext;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

    const { error: updateError } = await supabase.from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', currentUser.id);

    if (updateError) throw updateError;

    currentProfile.avatar_url = publicUrl;
    updateAvatarDisplays(publicUrl);
    closeOnboarding();
    showToast('Welcome to AllNet, ' + currentProfile.first_name + '! 🏀');

    // Kick off background removal after onboarding closes — non-blocking
    processAvatar(path).catch(err => console.error('processAvatar failed (non-fatal):', err));

  } catch (err) {
    console.error('Avatar upload error:', err);
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
  const cutoutUrl  = currentProfile?.avatar_cutout_url;
  const rawUrl     = currentProfile?.avatar_url;
  const cover      = currentProfile?.selected_cover || 'crossover';
  const coverUrl   = COVERS[cover] || COVERS.crossover;
  const initials   = currentProfile?.initials || 'U';

  if (cutoutUrl) {
    // Full composite: cover bg + transparent cutout on top
    return `<div class="avatar-composite">
      <div class="avatar-composite__cover" style="background-image:url('${coverUrl}')"></div>
      <img class="avatar-composite__cutout" src="${cutoutUrl}" alt="avatar" onerror="this.style.display='none'">
    </div>`;
  }
  if (rawUrl) {
    // Raw photo while cutout is still processing
    return `<img src="${rawUrl}" class="avatar-img" alt="Profile" onerror="this.style.display='none'">`;
  }
  // No photo yet — initials fallback
  return initials;
}

function updateAvatarDisplays(url) {
  // Build composite (uses currentProfile.avatar_cutout_url + selected_cover if available)
  const html = buildCompositeAvatar();

  // Top bar profile button
  const profileBtn = document.getElementById('profileBtn');
  if (profileBtn && profileBtn.classList.contains('top-bar__profile')) {
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
    // FIX 1: getSession() can return null after OAuth redirect.
    // Refresh session to guarantee a valid token before calling the edge function.
    let token = null;
    const { data: sessionData } = await supabase.auth.getSession();
    token = sessionData?.session?.access_token;

    if (!token) {
      const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr || !refreshData?.session) throw new Error('Could not get auth session');
      token = refreshData.session.access_token;
    }

    // FIX 2: Supabase Edge Functions require BOTH headers:
    //   Authorization: Bearer <user-token>  — authenticates the user
    //   apikey: <anon-key>                  — identifies the project to the gateway
    // Without 'apikey', the gateway returns 401 before our function code runs at all.
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

    // Refresh career card AND both avatar circles with the new composite
    renderCareerCard();
    updateAvatarDisplays(currentProfile.avatar_url);
    return result.cutoutUrl;

  } catch (err) {
    // FIX 3 & 4: Show visible toast and always reset card — never leave stuck on spinner
    console.error('processAvatar error:', err);
    renderCareerCard();
    showToast('Career card processing failed — try re-uploading your photo');
    return null;
  }
}

/* ══════════════════════════════
   GAME START — photo gate
   Checks for profile photo before
   navigating to allnet-phase2.html
   ══════════════════════════════ */
let pendingGameCourt = null;

function startGame(courtName) {
  if (!currentProfile) return;

  if (!currentProfile.avatar_url) {
    // Gate: require photo before joining a game
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
  btn.disabled = true;
  btn.textContent = 'Uploading...';
  const errorEl = document.getElementById('promptPhotoError');

  try {
    const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
    const path = currentUser.id + '/avatar.' + ext;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', currentUser.id);
    currentProfile.avatar_url = publicUrl;
    updateAvatarDisplays(publicUrl);

    closePhotoPromptModal();

    // Kick off background removal — non-blocking, navigates to game after
    processAvatar(path).catch(err => console.error('processAvatar failed (non-fatal):', err));

    if (pendingGameCourt) {
      window.location.href = 'allnet-phase2.html?court=' + encodeURIComponent(pendingGameCourt);
    }

  } catch (err) {
    console.error('Prompt avatar upload error:', err);
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

async function initApp() {
  if (typeof supabase === 'undefined' || typeof fetchCourts !== 'function') {
    console.log('AllNet: Running in demo mode (no Supabase)');
    return;
  }

  try {
    // ── Step 1: Establish session FIRST ──
    // On OAuth redirects, tokens are in the URL hash. getSession() detects and
    // exchanges them. This MUST run before any other async work so the session
    // is established before any authenticated API calls happen.
    if (!currentUser) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && session.user) {
        console.log('AllNet: getSession found session — loading profile');
        await loadUserProfile(session.user);
      } else {
        console.log('AllNet: No session — user not logged in');
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
  } catch (err) {
    console.error('AllNet: Supabase init error', err);
  }
}

// Override openSheet to load real check-ins from Supabase
const _originalOpenSheet = openSheet;
openSheet = async function(court) {
  court._watching = userWatches.has(court.id);
  if (currentUser && court.id && typeof court.id === 'string' && court.id.length > 10) {
    try {
      court._reported = await hasUserReported(court.id);
    } catch (err) { court._reported = false; }
    try {
      const { court: freshCourt, checkins } = await fetchCourtWithCheckins(court.id);
      if (checkins) {
        court.checkedIn = checkins.map(c => ({
          name: c.profiles?.name || 'Unknown',
          initials: c.profiles?.initials || '??',
          time: timeAgo(new Date(c.checked_in_at)),
          badge: c.profiles?.is_founding_hooper || false,
          userId: c.user_id,
          avatarUrl: c.profiles?.avatar_url || null
        }));
        court.players = checkins.length;
        court.status = checkins.length >= 10 ? 'packed' : checkins.length > 0 ? 'active' : 'quiet';
      }
    } catch (err) { console.error('Failed to load check-ins:', err); }
  }
  _originalOpenSheet(court);
};

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

// Override showPlayerCard to use Supabase
const _originalShowPlayerCard = showPlayerCard;
showPlayerCard = async function(name, userId) {
  if (currentUser && userId) {
    try {
      const card = await getPlayerCard(userId);
      if (card) {
        const avatarEl = document.getElementById('pmAvatar');
        if (card.avatar_url) {
          avatarEl.innerHTML = `<img src="${card.avatar_url}" class="avatar-img" alt="${card.name}">`;
        } else {
          avatarEl.textContent = card.initials || '??';
        }
        document.getElementById('pmName').textContent = card.name;
        document.getElementById('pmMeta').textContent = '📍 ' + (card.location || 'OC/LA');
        document.getElementById('pmBadge').style.display = card.is_founding_hooper ? 'inline-block' : 'none';
        document.getElementById('pmWins').textContent = card.wins || 0;
        document.getElementById('pmLosses').textContent = card.losses || 0;
        document.getElementById('pmDraws').textContent = card.draws || 0;
        document.getElementById('pmSkill').textContent = card.skill_rating ? card.skill_rating.toFixed(1) : '—';
        document.getElementById('pmSocial').textContent = card.social_rating ? card.social_rating.toFixed(1) : '—';
        const games = card.recent_games || [];
        document.getElementById('pmHistory').innerHTML = games.length > 0 ? games.map(g => {
          const cls = g.result === 'W' ? 'w' : g.result === 'L' ? 'l' : 'd';
          return '<div class="player-modal__game"><div class="player-modal__game-result player-modal__game-result--' + cls + '">' + g.result + '</div><div class="player-modal__game-detail">' + g.format + ' at ' + (g.court_name || 'Court') + '</div><div class="player-modal__game-time">' + timeAgo(new Date(g.played_at)) + '</div></div>';
        }).join('') : '<div style="text-align:center;color:var(--text-muted);padding:12px;font-size:13px;">No games yet</div>';
        document.getElementById('playerModal').classList.add('active');
        return;
      }
    } catch (err) { console.error('Failed to load player card:', err); }
  }
  _originalShowPlayerCard(name);
};

function timeAgo(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

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
      btn.className = 'top-bar__profile';
      btn.innerHTML = buildCompositeAvatar();

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
    }

    const myCheckins = await getUserCheckins(currentUser.id);
    if (myCheckins) {
      userCheckins = myCheckins.map(c => ({
        courtId: c.court_id,
        courtName: c.courts?.name || 'Unknown',
        time: new Date(c.checked_in_at)
      }));
      myCheckins.forEach(c => checkinCourts.add(c.court_id));
      updateProfileStats();
    }

    await loadUserWatches();
    updateNavDrawerUser();
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
    currentUser = null;
    currentProfile = null;
    userWatches = new Set();
    userCheckins = [];
    checkinCourts = new Set();
    const btn = document.getElementById('profileBtn');
    btn.className = 'top-bar__cta';
    btn.textContent = 'Get Started';
    btn.onclick = () => handleProfileClick();
    updateWatchingChipVisibility();
    renderMarkers();
    // Hide star balance
    const starsEl = document.getElementById('topBarStars');
    if (starsEl) starsEl.style.display = 'none';
    updateNavDrawerUser();
  }
});

// Step 2: Init app — load courts, then check for existing session
initApp();
