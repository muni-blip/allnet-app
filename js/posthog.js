// ═══════════════════════════════════════════════
// AllNet — PostHog Analytics
// ═══════════════════════════════════════════════
// Loads PostHog JS SDK, provides identify + track helpers.
// Included on every page BEFORE supabase-helpers.js.

!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

posthog.init('phc_cnyzcI8G4d4i5TD5Zg31NLZUUD88khAf07jJ42W34Ay', {
  api_host: 'https://us.i.posthog.com',
  person_profiles: 'identified_only',
  capture_pageview: true,
  capture_pageleave: true,
  autocapture: true
});

// ── Identify user after auth resolves ──
// Call this from loadUserProfile / page-level auth flows
function posthogIdentify(profile) {
  if (!profile || !profile.id) return;
  try {
    posthog.identify(profile.id, {
      name: ((profile.first_name || '') + ' ' + (profile.last_name || '')).trim() || profile.name || '',
      username: profile.username || '',
      short_code: profile.short_code || '',
      is_founding_hooper: !!profile.is_founding_hooper,
      founding_number: profile.founding_number || null,
      stars_balance: profile.stars_balance || 0,
      skill_rating: profile.skill_rating || 0,
      social_rating: profile.social_rating || 0,
      total_checkins: profile.total_checkins || 0,
      unique_courts: profile.unique_courts || 0,
      signup_date: profile.created_at || profile.joined_at || null
    });
  } catch (e) {
    console.error('PostHog identify error:', e);
  }
}

// ── Lightweight track wrapper ──
// Usage: phTrack('check_in', { court_name: 'Life Time Irvine' })
function phTrack(event, props) {
  try {
    posthog.capture(event, props || {});
  } catch (e) {
    console.error('PostHog track error:', e);
  }
}

// ── Reset on sign out ──
function posthogReset() {
  try { posthog.reset(); } catch (e) {}
}
