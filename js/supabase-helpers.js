// ═══════════════════════════════════════════════
// AllNet — Supabase Client Configuration
// ═══════════════════════════════════════════════
// SQL MIGRATION — run once in Supabase SQL editor:
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name text;
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name text;
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;
// -- Create avatars storage bucket (in Supabase Dashboard > Storage):
// -- Bucket name: avatars, Public: true

var SUPABASE_URL = 'https://orrpowyewsioyxztwkdq.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ycnBvd3lld3Npb3l4enR3a2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3ODAwNzMsImV4cCI6MjA4OTM1NjA3M30.4K6ZT-eNOGbvXxJkN_Dt7aLv80GlC0rrTLcIUPExwp0';

let sb;
try {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch(e) {
  console.error('Supabase client creation failed:', e);
}
var supabase = sb;
console.log('Supabase client:', supabase ? 'OK' : 'FAILED', 'window.supabase:', typeof window.supabase);

// ── Auth helpers ──
async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function getUserProfile(userId) {
  const id = userId || (await getUser())?.id;
  if (!id) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', id).single();
  return data;
}

async function signUp(email, password, name, location) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, location } }
  });
  if (error) throw error;
  if (data.user) {
    await supabase.from('profiles').update({ location, name, initials: name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) }).eq('id', data.user.id);
  }
  return data;
}

async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signOut() {
  if (typeof posthogReset === 'function') posthogReset();
  await supabase.auth.signOut();
}

// ── Court helpers ──
async function fetchCourts() {
  const { data, error } = await supabase.from('courts').select('*').order('name');
  if (error) throw error;
  return data;
}

async function fetchCourtWithCheckins(courtId) {
  const { data: court } = await supabase.from('courts').select('*').eq('id', courtId).single();
  const { data: checkins } = await supabase
    .from('checkins')
    .select('*, profiles(name, initials, is_founding_hooper, avatar_url, avatar_cutout_url, selected_cover)')
    .eq('court_id', courtId)
    .gte('checked_in_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
    .is('checked_out_at', null)
    .order('checked_in_at', { ascending: false });
  return { court, checkins: checkins || [] };
}

// ── Check-in helpers ──
async function checkInAtCourt(courtId) {
  const user = await getUser();
  if (!user) throw new Error('Not logged in');
  const { data, error } = await supabase.from('checkins').insert({ user_id: user.id, court_id: courtId });
  if (error) throw error;
  return data;
}

async function getUserCheckins(userId) {
  const { data } = await supabase
    .from('checkins')
    .select('*, courts(name)')
    .eq('user_id', userId)
    .order('checked_in_at', { ascending: false })
    .limit(20);
  return data || [];
}

// ── Game session helpers ──
async function createGameSession(courtId, format, teamSize, codeA, codeB) {
  const user = await getUser();
  if (!user) throw new Error('Not logged in');
  const { data, error } = await supabase.from('game_sessions').insert({
    court_id: courtId,
    creator_id: user.id,
    format,
    team_size: teamSize,
    code_a: codeA,
    code_b: codeB,
    status: 'lobby'
  }).select().single();
  if (error) throw error;
  await supabase.from('game_players').insert({ game_id: data.id, user_id: user.id, team: 'a' });
  return data;
}

async function joinGameByCode(code) {
  const { data: gameA } = await supabase.from('game_sessions')
    .select('*').eq('code_a', code).in('status', ['lobby', 'active']).maybeSingle();
  const { data: gameB } = await supabase.from('game_sessions')
    .select('*').eq('code_b', code).in('status', ['lobby', 'active']).maybeSingle();
  const game = gameA || gameB;
  if (!game) throw new Error('Game not found');
  const team = gameA ? 'a' : 'b';
  const user = await getUser();
  if (!user) throw new Error('Not logged in');

  // Check if already in this game
  const { data: existing } = await supabase.from('game_players')
    .select('id').eq('game_id', game.id).eq('user_id', user.id).maybeSingle();
  if (existing) throw new Error('You are already in this game');

  // Check team capacity
  const { data: teamPlayers } = await supabase.from('game_players')
    .select('id').eq('game_id', game.id).eq('team', team).eq('status', 'active');
  if (teamPlayers && teamPlayers.length >= game.team_size) throw new Error('This team is full');

  const { error } = await supabase.from('game_players').insert({ game_id: game.id, user_id: user.id, team });
  if (error) throw error;
  return { game, team };
}

async function startGameSession(gameId) {
  await supabase.from('game_sessions').update({ status: 'active', started_at: new Date().toISOString() }).eq('id', gameId);
}

async function endGameSession(gameId, durationSeconds) {
  await supabase.from('game_sessions').update({
    status: 'review',
    ended_at: new Date().toISOString(),
    duration_seconds: durationSeconds
  }).eq('id', gameId);
}

async function completeGame(gameId, winner) {
  await supabase.from('game_sessions').update({ status: 'completed', winner }).eq('id', gameId);
}

async function getGamePlayers(gameId) {
  const { data } = await supabase.from('game_players')
    .select('*, profiles(name, initials, is_founding_hooper)')
    .eq('game_id', gameId);
  return data || [];
}

// ── Review helpers ──
async function submitReview(gameId, revieweeId, skillRating, socialRating, relationship) {
  const user = await getUser();
  if (!user) throw new Error('Not logged in');
  const { error } = await supabase.from('reviews').insert({
    game_id: gameId,
    reviewer_id: user.id,
    reviewee_id: revieweeId,
    skill_rating: skillRating,
    social_rating: socialRating,
    relationship
  });
  if (error) throw error;
}

// ── Player card helper ──
async function getPlayerCard(userId) {
  const { data } = await supabase.from('player_cards').select('*').eq('id', userId).single();
  return data;
}

// ── Court report helpers ──
async function reportCourt(courtId, reason, note) {
  const user = await getUser();
  if (!user) throw new Error('Not logged in');
  const { error } = await supabase.from('court_reports').insert({
    court_id: courtId,
    user_id: user.id,
    reason: reason || 'no_basketball_court',
    note: note || null
  });
  if (error) throw error;
}

async function hasUserReported(courtId) {
  const user = await getUser();
  if (!user) return false;
  const { data } = await supabase.from('court_reports')
    .select('id')
    .eq('court_id', courtId)
    .eq('user_id', user.id)
    .maybeSingle();
  return !!data;
}

// ── Realtime subscriptions ──
function subscribeToCheckins(courtId, callback) {
  return supabase.channel('checkins-' + courtId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'checkins', filter: 'court_id=eq.' + courtId }, callback)
    .subscribe();
}

function subscribeToGamePlayers(gameId, callback) {
  return supabase.channel('game-' + gameId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_players', filter: 'game_id=eq.' + gameId }, callback)
    .subscribe();
}

// ── Notification helpers ──
async function getNotifications(limit) {
  const user = await getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit || 50);
  return data || [];
}

async function getUnreadNotificationCount() {
  const user = await getUser();
  if (!user) return 0;
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('read', false);
  return count || 0;
}

async function markNotificationRead(notificationId) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId);
  return !error;
}

async function markAllNotificationsRead() {
  const user = await getUser();
  if (!user) return false;
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', user.id)
    .eq('read', false);
  return !error;
}

async function updatePushPreference(key, value) {
  const user = await getUser();
  if (!user) return false;
  const { error } = await supabase
    .from('profiles')
    .update({ [key]: value })
    .eq('id', user.id);
  return !error;
}

// ── Shared time formatting (Instagram-style) ──
function timeAgo(date) {
  if (!(date instanceof Date)) date = new Date(date);
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return m === 1 ? '1 minute ago' : m + ' minutes ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? '1 hour ago' : h + ' hours ago';
  const d = Math.floor(h / 24);
  if (d < 7) return d === 1 ? '1 day ago' : d + ' days ago';
  const now = new Date();
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  if (date.getFullYear() === now.getFullYear()) {
    return months[date.getMonth()] + ' ' + date.getDate();
  }
  return months[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
}

/* ═══════════════════════════════════════
   SHARED COMPOSITE AVATAR BUILDER
   Creates a circular avatar with cutout + cover bg.
   Works for any profile object with avatar_cutout_url,
   avatar_url, selected_cover, initials fields.
   ═══════════════════════════════════════ */
var _COVERS_BASE = 'https://orrpowyewsioyxztwkdq.supabase.co/storage/v1/object/public/covers';
var _COVERS_MAP = {
  crossover: _COVERS_BASE + '/Crossover.png', rally: _COVERS_BASE + '/Rally.png',
  flowstate: _COVERS_BASE + '/Flowstate.png', fastbreak: _COVERS_BASE + '/Fastbreak.png',
  shatter: _COVERS_BASE + '/Shatter.png', showtime: _COVERS_BASE + '/Showtime.png',
  fadeaway: _COVERS_BASE + '/Fadeaway.png'
};

function buildCompositeAvatarHtml(profile) {
  if (!profile) return '??';
  var cutout = profile.avatar_cutout_url;
  var rawUrl = profile.avatar_url;
  var cover = profile.selected_cover || 'crossover';
  var coverUrl = _COVERS_MAP[cover] || _COVERS_MAP.crossover;
  var initials = profile.initials || (profile.name || '??').split(' ').map(function(w) { return w[0]; }).join('').toUpperCase().slice(0, 2);

  if (cutout) {
    return '<div class="av-comp" style="position:relative;width:100%;height:100%;border-radius:50%;overflow:hidden;">' +
      '<div style="position:absolute;inset:0;background-image:url(\'' + coverUrl + '\');background-size:cover;background-position:center;"></div>' +
      '<img src="' + cutout + '" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1;" onerror="this.style.display=\'none\'">' +
    '</div>';
  }
  if (rawUrl) {
    return '<img src="' + rawUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="">';
  }
  return initials;
}

/* ═══════════════════════════════════════
   SHARED NAV BAR — populates stars, bell, avatar
   on any page that includes the .nav-bar element.
   Call from each page's init after Supabase is ready.
   ═══════════════════════════════════════ */
async function initNavBar() {
  var starsEl = document.getElementById('topBarStars');
  var starsCount = document.getElementById('topBarStarsCount');
  var bellEl = document.getElementById('navBell');
  var badgeEl = document.getElementById('navBellBadge');
  var profileBtn = document.getElementById('profileBtn');
  var navRight = document.getElementById('navBarRight');
  if (!profileBtn) return; // no nav bar on this page

  try {
    var session = (await supabase.auth.getSession()).data.session;
    if (!session) {
      // Not logged in — reveal "Get Started" CTA
      if (navRight) navRight.style.opacity = '1';
      return;
    }

    var profile = await getUserProfile(session.user.id);
    if (!profile) {
      if (navRight) navRight.style.opacity = '1';
      return;
    }

    // Stars
    if (starsEl && starsCount) {
      starsCount.textContent = (profile.stars_balance || 0).toLocaleString();
      starsEl.style.display = 'flex';
    }

    // Bell + unread badge
    if (bellEl) {
      bellEl.style.display = 'flex';
      try {
        var { count } = await supabase
          .from('notifications').select('id', { count: 'exact', head: true })
          .eq('user_id', session.user.id).eq('read', false);
        if (badgeEl) {
          if (count && count > 0) {
            badgeEl.textContent = count > 99 ? '99+' : count;
            badgeEl.style.display = 'flex';
          } else {
            badgeEl.style.display = 'none';
          }
        }
      } catch (e) { if (badgeEl) badgeEl.style.display = 'none'; }
    }

    // Avatar — replace CTA with composite avatar
    profileBtn.className = 'nav-bar__avatar';
    profileBtn.onclick = function() { openSharedProfile(); };
    profileBtn.innerHTML = buildCompositeAvatarHtml(profile);

    // Reveal nav bar right section with correct content
    if (navRight) navRight.style.opacity = '1';
  } catch (err) {
    console.error('initNavBar error:', err);
    if (navRight) navRight.style.opacity = '1';
  }
}

// Fallback handlers for secondary pages (overridden by app.js on Play page)
if (typeof openNotifications === 'undefined') {
  var _sharedNotifsLoaded = false;

  var openNotifications = function() {
    // Inject notifications panel if it doesn't exist on this page
    if (!document.getElementById('sharedAlertsScreen')) {
      var panel = document.createElement('div');
      panel.className = 'alerts-screen';
      panel.id = 'sharedAlertsScreen';
      panel.innerHTML = '<button class="profile-back" onclick="closeSharedNotifications()">← Back</button>' +
        '<div class="alerts-content">' +
          '<div class="alerts-header">' +
            '<div class="alerts-title">Notifications</div>' +
            '<button class="alerts-mark-all" id="sp_alertsMarkAll" onclick="sharedMarkAllRead()" style="display:none;">Mark all read</button>' +
          '</div>' +
          '<div class="alerts-list" id="sp_alertsList">' +
            '<div class="alerts-empty"><div class="alerts-empty__icon">⏳</div><div class="alerts-empty__text">Loading...</div></div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(panel);
    }
    document.getElementById('sharedAlertsScreen').classList.add('open');
    if (!_sharedNotifsLoaded) loadSharedNotifications();
  };

  var closeSharedNotifications = function() {
    var panel = document.getElementById('sharedAlertsScreen');
    if (panel) panel.classList.remove('open');
  };

  var loadSharedNotifications = async function() {
    var list = document.getElementById('sp_alertsList');
    try {
      var notifications = await getNotifications(50);
      if (!notifications || notifications.length === 0) {
        list.innerHTML = '<div class="alerts-empty"><div class="alerts-empty__icon">🔔</div><div class="alerts-empty__text">No alerts yet</div><div class="alerts-empty__sub">Watch a court to get notified when players check in</div></div>';
        document.getElementById('sp_alertsMarkAll').style.display = 'none';
        _sharedNotifsLoaded = true;
        return;
      }
      var hasUnread = notifications.some(function(n) { return !n.read; });
      document.getElementById('sp_alertsMarkAll').style.display = hasUnread ? 'block' : 'none';

      list.innerHTML = notifications.map(function(n) {
        var iconMap = { court_active:'🏀', court_heating_up:'🔥', court_packed:'🔥', post_sprayed:'🎨', player_joined:'👋', review_reminder:'📝', game_complete:'🏆', review_penalty:'⚠️' };
        var icon = iconMap[n.type] || '🏀';
        var t = timeAgo(new Date(n.created_at));
        return '<div class="alert-card ' + (n.read ? '' : 'alert-card--unread') + '" data-notification-id="' + n.id + '" onclick="sharedNotifTap(\'' + n.id + '\',\'' + (n.court_id||'') + '\',\'' + (n.type||'') + '\',\'' + (n.match_id||'') + '\',\'' + (n.game_id||'') + '\')">' +
          '<div class="alert-card__icon">' + icon + '</div>' +
          '<div class="alert-card__body"><div class="alert-card__title">' + n.title + '</div><div class="alert-card__text">' + n.body + '</div><div class="alert-card__time">' + t + '</div></div></div>';
      }).join('');
      _sharedNotifsLoaded = true;
    } catch (err) {
      console.error('Failed to load notifications:', err);
      list.innerHTML = '<div class="alerts-empty"><div class="alerts-empty__text">Failed to load</div></div>';
    }
  };

  var sharedNotifTap = async function(id, courtId, type, matchId, gameId) {
    await markNotificationRead(id);
    var card = document.querySelector('.alert-card[data-notification-id="' + id + '"]');
    if (card) card.classList.remove('alert-card--unread');
    // Update badge
    var badgeEl = document.getElementById('navBellBadge');
    if (badgeEl) {
      var curr = parseInt(badgeEl.textContent) || 0;
      if (curr > 1) { badgeEl.textContent = curr - 1; }
      else { badgeEl.style.display = 'none'; }
    }
    // Navigate based on type
    if (type === 'player_joined' && gameId) {
      window.location.href = 'allnet-phase2.html?mode=lobby&game_id=' + gameId;
    } else if (type === 'review_reminder' && gameId) {
      window.location.href = 'allnet-phase2.html?mode=review&game_id=' + gameId;
    } else if (type === 'game_complete') {
      window.location.href = 'allnet-career.html';
    } else if (type === 'post_sprayed' && matchId) {
      window.location.href = 'allnet-activity.html?match=' + matchId;
    } else if (courtId) {
      window.location.href = 'allnet-app.html?court=' + courtId;
    }
  };

  var sharedMarkAllRead = async function() {
    await markAllNotificationsRead();
    document.querySelectorAll('.alert-card--unread').forEach(function(c) { c.classList.remove('alert-card--unread'); });
    document.getElementById('sp_alertsMarkAll').style.display = 'none';
    var badgeEl = document.getElementById('navBellBadge');
    if (badgeEl) badgeEl.style.display = 'none';
  };
}
if (typeof handleProfileClick === 'undefined') {
  var handleProfileClick = function() { openSharedProfile(); };
}

/* ══════════════════════════════
   SHARED PROFILE PANEL
   Works on any page — injects HTML on first open, fetches data from Supabase
   On the Play page, app.js overrides openSharedProfile with its richer openProfile()
   ══════════════════════════════ */
function _injectProfilePanel() {
  if (document.getElementById('sharedProfileScreen')) return;
  var panel = document.createElement('div');
  panel.className = 'profile-screen';
  panel.id = 'sharedProfileScreen';
  panel.innerHTML = '<button class="profile-back" onclick="closeSharedProfile()">← Back</button>' +
    '<div class="profile-content">' +
      '<div class="profile-card">' +
        '<div class="profile-card__avatar" id="sp_avatar">U</div>' +
        '<div class="profile-card__name" id="sp_name">Your Profile</div>' +
        '<div class="profile-card__location">📍 OC/LA</div>' +
        '<div class="profile-card__founding-badge">🏅 Founding Hooper</div>' +
      '</div>' +
      '<div class="profile-stats">' +
        '<div class="profile-stat"><div class="profile-stat__value" id="sp_days">—</div><div class="profile-stat__label">Days In</div></div>' +
        '<div class="profile-stat"><div class="profile-stat__value" id="sp_checkins">—</div><div class="profile-stat__label">Check-ins</div></div>' +
        '<div class="profile-stat"><div class="profile-stat__value" id="sp_courts">—</div><div class="profile-stat__label">Courts</div></div>' +
      '</div>' +
      '<div class="profile-section-title">// Recent Activity</div>' +
      '<div class="history-list" id="sp_history"><div class="empty-checkins">Loading...</div></div>' +
      '<button class="logout-btn" onclick="sharedLogOut()">Log Out</button>' +
    '</div>';
  document.body.appendChild(panel);
}

async function openSharedProfile() {
  try {
    var sess = (await supabase.auth.getSession()).data.session;
    if (!sess) return;
    var profile = await getUserProfile(sess.user.id);
    if (!profile) return;

    _injectProfilePanel();
    var panel = document.getElementById('sharedProfileScreen');

    // Avatar
    var avatarEl = document.getElementById('sp_avatar');
    if (avatarEl) avatarEl.innerHTML = buildCompositeAvatarHtml(profile);

    // Name
    var nameEl = document.getElementById('sp_name');
    if (nameEl) nameEl.textContent = (profile.first_name || '') + ' ' + (profile.last_name || '');

    // Stats
    var created = profile.created_at ? new Date(profile.created_at) : new Date();
    var days = Math.max(1, Math.floor((Date.now() - created.getTime()) / 86400000));
    var daysEl = document.getElementById('sp_days');
    if (daysEl) daysEl.textContent = days;

    // Checkins
    var checkins = await getUserCheckins(sess.user.id);
    var checkinsEl = document.getElementById('sp_checkins');
    if (checkinsEl) checkinsEl.textContent = checkins ? checkins.length : 0;

    // Unique courts
    var courtsEl = document.getElementById('sp_courts');
    if (courtsEl && checkins) {
      var unique = new Set(checkins.map(function(c) { return c.court_id; }));
      courtsEl.textContent = unique.size;
    }

    // Recent history (5 most recent)
    var histEl = document.getElementById('sp_history');
    if (histEl && checkins && checkins.length > 0) {
      histEl.innerHTML = checkins.slice(0, 5).map(function(c) {
        var t = new Date(c.checked_in_at);
        var diff = Math.floor((Date.now() - t.getTime()) / 1000);
        var timeStr = diff < 60 ? 'Just now' : diff < 3600 ? Math.floor(diff/60) + 'm ago' : t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return '<div class="history-item"><div class="history-item__icon">📍</div>' +
          '<div class="history-item__info"><div class="history-item__title">' + (c.courts?.name || 'Court') + '</div>' +
          '<div class="history-item__meta">Checked in</div></div>' +
          '<div class="history-item__time">' + timeStr + '</div></div>';
      }).join('');
    } else if (histEl) {
      histEl.innerHTML = '<div class="empty-checkins">No check-ins yet. Visit a court and tap "I\'m Here" to start building your history.</div>';
    }

    panel.classList.add('open');
  } catch (err) {
    console.error('openSharedProfile error:', err);
  }
}

function closeSharedProfile() {
  var panel = document.getElementById('sharedProfileScreen');
  if (panel) panel.classList.remove('open');
}

async function sharedLogOut() {
  await supabase.auth.signOut();
  window.location.href = 'allnet-app.html';
}

/* ══════════════════════════════
   BLOCK SWIPE-BACK/FORWARD NAVIGATION
   iOS Safari ignores overscroll-behavior-x: none.
   This touch handler detects horizontal swipes and blocks them.
   ══════════════════════════════ */
(function() {
  var startX = 0, startY = 0;
  document.addEventListener('touchstart', function(e) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchmove', function(e) {
    var dx = Math.abs(e.touches[0].clientX - startX);
    var dy = Math.abs(e.touches[0].clientY - startY);
    // If gesture is more horizontal than vertical and started near edge, block it
    if (dx > dy && dx > 10 && (startX < 30 || startX > window.innerWidth - 30)) {
      e.preventDefault();
    }
  }, { passive: false });
})();
