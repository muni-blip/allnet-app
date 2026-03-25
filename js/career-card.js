/* ═══════════════════════════════════════
   CAREER CARD — Shared JS Component
   ═══════════════════════════════════════
   Usage:
     var html = CareerCard.render({
       cardId: 'myCard',
       firstName: 'KOBE', lastName: 'BRYANT',
       cutoutUrl: '...', coverSlug: 'crossover',
       wins: 37, losses: 12, draws: 1,
       skillRating: '2.7', socialRating: '4.2',
       divisionLabel: '1V1',
       activeDivision: '1v1',
       showTabs: true,
       onTabClick: 'switchDivision',
       // Variant A (post-review) deltas:
       showDeltas: false,
       skillDelta: null, socialDelta: null, winsDelta: null
     });
     document.getElementById('container').innerHTML = html;
     CareerCard.fitNames('myCard');
   ═══════════════════════════════════════ */

var CareerCard = (function() {

  var SUPABASE_COVERS_URL = 'https://orrpowyewsioyxztwkdq.supabase.co/storage/v1/object/public/covers';
  var COVERS = {
    crossover: SUPABASE_COVERS_URL + '/Crossover.png',
    rally:     SUPABASE_COVERS_URL + '/Rally.png',
    flowstate: SUPABASE_COVERS_URL + '/Flowstate.png',
    fastbreak: SUPABASE_COVERS_URL + '/Fastbreak.png',
    shatter:   SUPABASE_COVERS_URL + '/Shatter.png',
    showtime:  SUPABASE_COVERS_URL + '/Showtime.png',
    fadeaway:  SUPABASE_COVERS_URL + '/Fadeaway.png'
  };

  function getCoverUrl(slug) {
    return COVERS[slug] || COVERS.crossover;
  }

  /* ── Render full card HTML ── */
  function render(opts) {
    var id       = opts.cardId || 'cc';
    var fn       = (opts.firstName || '').toUpperCase();
    var ln       = (opts.lastName || '').toUpperCase();
    var cut      = opts.cutoutUrl;
    var coverUrl = getCoverUrl(opts.coverSlug || 'crossover');
    var w        = opts.wins || 0;
    var l        = opts.losses || 0;
    var d        = opts.draws || 0;
    var sk       = opts.skillRating || '—';
    var so       = opts.socialRating || '—';
    var dl       = (opts.divisionLabel || '1V1').toUpperCase();
    var showTabs = opts.showTabs !== false;
    var tabFn    = opts.onTabClick || 'switchDivision';
    var active   = opts.activeDivision || '1v1';
    var showD    = opts.showDeltas === true;
    var skD      = opts.skillDelta;
    var soD      = opts.socialDelta;
    var wD       = opts.winsDelta;

    // Empty state — only when viewing own card with no photo AND no stats
    // (controlled by caller via opts.showPlaceholder)
    if (!cut && opts.showPlaceholder) {
      return '<div class="cc__cover" style="background-image:url(\'' + coverUrl + '\')"></div>' +
        '<div class="cc__overlay"></div>' +
        '<div class="cc__placeholder">' +
          '<div class="cc__placeholder-icon">📷</div>' +
          '<div class="cc__placeholder-text">Upload a photo to generate your career card</div>' +
        '</div>';
    }

    // Player frame — only if cutout exists
    var playerFrameHtml = cut
      ? '<div class="cc__player-frame"><img src="' + cut + '" alt="' + fn + ' ' + ln + '" onerror="this.style.display=\'none\'"></div>'
      : '';

    // W/L/D with optional delta
    var wDeltaHtml = (showD && wD && wD > 0) ? '<div class="cc__wld-delta">+' + wD + '</div>' : '';
    var lDeltaHtml = (showD && opts.lossesDelta && opts.lossesDelta > 0) ? '<div class="cc__wld-delta">+' + opts.lossesDelta + '</div>' : '';
    var dDeltaHtml = (showD && opts.drawsDelta && opts.drawsDelta > 0) ? '<div class="cc__wld-delta">+' + opts.drawsDelta + '</div>' : '';

    // Rating deltas
    var skDeltaHtml = '';
    if (showD && skD !== null && skD !== undefined) {
      var skNum = Number(skD);
      var skSign = skNum >= 0 ? '+' : '';
      var skClass = skNum >= 0 ? '' : ' cc__rating-delta--down';
      skDeltaHtml = '<span class="cc__rating-delta' + skClass + '">' + skSign + skNum.toFixed(1) + ' ↗</span>';
    }
    var soDeltaHtml = '';
    if (showD && soD !== null && soD !== undefined) {
      var soNum = Number(soD);
      var soSign = soNum >= 0 ? '+' : '';
      var soClass = soNum >= 0 ? '' : ' cc__rating-delta--down';
      soDeltaHtml = '<span class="cc__rating-delta' + soClass + '">' + soSign + soNum.toFixed(1) + ' ↗</span>';
    }

    // Division tabs
    var tabsHtml = '';
    if (showTabs) {
      var divs = ['1v1','2v2','3v3','4v4','5v5'];
      tabsHtml = '<div class="cc__div-tabs">' +
        divs.map(function(dv) {
          return '<button class="cc__div-tab' + (dv === active ? ' cc__div-tab--active' : '') +
            '" onclick="' + tabFn + '(\'' + dv + '\')">' + dv + '</button>';
        }).join('') +
      '</div>';
    }

    // Star SVG
    var starSvg = '<svg width="16" height="16" viewBox="0 0 16 16" fill="#facc15">' +
      '<polygon points="8,1 10.2,5.6 15.2,6.2 11.6,9.6 12.4,14.6 8,12.2 3.6,14.6 4.4,9.6 0.8,6.2 5.8,5.6"/></svg>';

    // Skill bars icon
    var skillIcon = '<span class="cc__skill-icon"><div class="cc__skill-bar-item"></div><div class="cc__skill-bar-item"></div></span>';

    return '' +
      '<div class="cc__cover" style="background-image:url(\'' + coverUrl + '\')"></div>' +
      playerFrameHtml +
      '<div class="cc__overlay"></div>' +

      // Name row 1: [firstName] [gradient bar]
      '<div class="cc__name-row cc__name-row--1">' +
        '<span class="cc__name-text" id="' + id + '_fn">' + fn + '</span>' +
        '<div class="cc__accent-bar" id="' + id + '_barO"></div>' +
      '</div>' +

      // Name row 2: [gradient bar] [lastName]
      '<div class="cc__name-row cc__name-row--2">' +
        '<div class="cc__accent-bar" id="' + id + '_barB"></div>' +
        '<span class="cc__name-text" id="' + id + '_ln">' + ln + '</span>' +
      '</div>' +

      // W / L / D
      '<div class="cc__wld">' +
        '<div class="cc__wld-col cc__wld-col--w"><div class="cc__wld-label">W</div><div class="cc__wld-value">' + w + '</div>' + wDeltaHtml + '</div>' +
        '<div class="cc__wld-col cc__wld-col--l"><div class="cc__wld-label">L</div><div class="cc__wld-value">' + l + '</div>' + lDeltaHtml + '</div>' +
        '<div class="cc__wld-col cc__wld-col--d"><div class="cc__wld-label">D</div><div class="cc__wld-value">' + d + '</div>' + dDeltaHtml + '</div>' +
      '</div>' +

      // Skill rating (top)
      '<div class="cc__skill-row">' +
        '<span class="cc__rating-label">' + dl + ' SKILL RATING</span>' +
        '<span class="cc__rating-val">' + skillIcon + '<span class="cc__rating-num">' + sk + '</span>' + skDeltaHtml + '</span>' +
      '</div>' +

      // Social rating (bottom)
      '<div class="cc__social-row">' +
        '<span class="cc__rating-label">SOCIAL RATING</span>' +
        '<span class="cc__rating-val">' + starSvg + '<span class="cc__rating-num">' + so + '</span>' + soDeltaHtml + '</span>' +
      '</div>' +

      tabsHtml;
  }

  /* ── Dynamic name sizing ── */
  function fitNames(cardId) {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    var rowWidth = 320; // 343 - 11 left - 12 right
    var gapPx = 8;
    var minBar = 24;
    var maxFont = 40;
    var minFont = 18;

    // First name
    var fnEl = document.getElementById(cardId + '_fn');
    var barO = document.getElementById(cardId + '_barO');
    if (fnEl && barO) {
      var fn = fnEl.textContent;
      var fs = maxFont;
      while (fs >= minFont) {
        ctx.font = '800 ' + fs + 'px Montserrat';
        var tw = ctx.measureText(fn).width;
        if (tw + gapPx + minBar <= rowWidth) break;
        fs--;
      }
      fnEl.style.fontSize = fs + 'px';
      var remaining = rowWidth - ctx.measureText(fn).width - gapPx;
      if (remaining < minBar) barO.classList.add('cc__accent-bar--hidden');
      else barO.classList.remove('cc__accent-bar--hidden');
    }

    // Last name
    var lnEl = document.getElementById(cardId + '_ln');
    var barB = document.getElementById(cardId + '_barB');
    if (lnEl && barB) {
      var ln = lnEl.textContent;
      var fs2 = maxFont;
      while (fs2 >= minFont) {
        ctx.font = '800 ' + fs2 + 'px Montserrat';
        var tw2 = ctx.measureText(ln).width;
        if (tw2 + gapPx + minBar <= rowWidth) break;
        fs2--;
      }
      lnEl.style.fontSize = fs2 + 'px';
      var remaining2 = rowWidth - ctx.measureText(ln).width - gapPx;
      if (remaining2 < minBar) barB.classList.add('cc__accent-bar--hidden');
      else barB.classList.remove('cc__accent-bar--hidden');
    }
  }

  /* ── Rolodex digit-strip animation ──
     Each digit gets its own vertical strip (0–9) that physically
     scrolls via translateY. Color flashes white→green→white (positive)
     or white→red→white (negative).

     containerId: the element ID of the .cc card container
     opts: { winsFrom, winsTo, lossesFrom, lossesTo, drawsFrom, drawsTo,
             skillFrom, skillTo, socialFrom, socialTo, duration, stagger }
  */
  function animateValues(containerId, opts) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var duration = opts.duration || 1200;
    var stagger  = opts.stagger  || 250;

    // Collect targets
    var targets = [];
    var wEl = container.querySelector('.cc__wld-col--w .cc__wld-value');
    var lEl = container.querySelector('.cc__wld-col--l .cc__wld-value');
    var dEl = container.querySelector('.cc__wld-col--d .cc__wld-value');
    if (wEl && opts.winsFrom != null)   targets.push({ el: wEl, from: opts.winsFrom,   to: opts.winsTo,   dec: 0, delay: 0 });
    if (lEl && opts.lossesFrom != null) targets.push({ el: lEl, from: opts.lossesFrom, to: opts.lossesTo, dec: 0, delay: 0 });
    if (dEl && opts.drawsFrom != null)  targets.push({ el: dEl, from: opts.drawsFrom,  to: opts.drawsTo,  dec: 0, delay: 0 });

    var skillNum = container.querySelector('.cc__skill-row .cc__rating-num');
    if (skillNum && opts.skillFrom != null) targets.push({ el: skillNum, from: opts.skillFrom, to: opts.skillTo, dec: 1, delay: stagger });

    var socialNum = container.querySelector('.cc__social-row .cc__rating-num');
    if (socialNum && opts.socialFrom != null) targets.push({ el: socialNum, from: opts.socialFrom, to: opts.socialTo, dec: 1, delay: stagger * 2 });

    // Build rolodex for each target
    targets.forEach(function(t) {
      _buildRolodex(t.el, t.from, t.to, t.dec, t.delay, duration);
    });
  }

  /* ── Build rolodex columns for a single number element ── */
  function _buildRolodex(el, fromVal, toVal, decimals, delay, duration) {
    var fromStr = decimals > 0 ? Number(fromVal).toFixed(decimals) : String(Math.round(fromVal));
    var toStr   = decimals > 0 ? Number(toVal).toFixed(decimals)   : String(Math.round(toVal));

    // Pad to same length
    var maxLen = Math.max(fromStr.length, toStr.length);
    while (fromStr.length < maxLen) fromStr = ' ' + fromStr;
    while (toStr.length < maxLen)   toStr   = ' ' + toStr;

    // Character height from line-height
    var cs = window.getComputedStyle(el);
    var charH = parseInt(cs.lineHeight);
    if (!charH || isNaN(charH)) charH = parseInt(cs.fontSize) || 32;

    var delta = toVal - fromVal;
    var flashColor = delta > 0 ? '#34d399' : (delta < 0 ? '#f87171' : null);

    // Build one column per character
    var html = '';
    for (var i = 0; i < maxLen; i++) {
      var fc = fromStr[i];
      var tc = toStr[i];

      // Decimal point — static
      if (fc === '.' || tc === '.') {
        html += '<div style="height:' + charH + 'px;display:flex;align-items:center;justify-content:center;">.</div>';
        continue;
      }

      // Same digit or both spaces — static
      if (fc === tc) {
        var ch = (tc === ' ') ? '' : tc;
        html += '<div style="height:' + charH + 'px;display:flex;align-items:center;justify-content:center;">' + ch + '</div>';
        continue;
      }

      // Animated digit column
      var fd = (fc === ' ') ? 0 : parseInt(fc);
      var td = (tc === ' ') ? 0 : parseInt(tc);

      // Vertical strip: digits 0 through 9
      var strip = '';
      for (var d = 0; d <= 9; d++) {
        strip += '<div style="height:' + charH + 'px;display:flex;align-items:center;justify-content:center;">' + d + '</div>';
      }

      html += '<div style="height:' + charH + 'px;overflow:hidden;">' +
        '<div class="cc__rolo-strip" data-rolo-to="' + td + '" data-rolo-h="' + charH + '" ' +
        'style="transform:translateY(' + (-fd * charH) + 'px);">' +
        strip + '</div></div>';
    }

    // Replace element content with rolodex columns
    el.style.display = 'inline-flex';
    el.style.justifyContent = 'center';
    el.innerHTML = html;

    // Animate after delay
    setTimeout(function() {
      // Scroll each digit strip to its target
      var strips = el.querySelectorAll('.cc__rolo-strip');
      strips.forEach(function(strip, idx) {
        var td = parseInt(strip.getAttribute('data-rolo-to'));
        var h  = parseInt(strip.getAttribute('data-rolo-h'));
        strip.style.transition = 'transform ' + duration + 'ms cubic-bezier(0.16, 1, 0.3, 1)';
        // Per-digit stagger for slot-machine cascade
        setTimeout(function() {
          strip.style.transform = 'translateY(' + (-td * h) + 'px)';
        }, idx * 80);
      });

      // Color flash: white → green/red → white
      if (flashColor) {
        el.style.transition = 'color ' + Math.round(duration * 0.25) + 'ms ease';
        el.style.color = flashColor;
        setTimeout(function() {
          el.style.transition = 'color ' + Math.round(duration * 0.5) + 'ms ease';
          el.style.color = '';
        }, Math.round(duration * 0.35));
      }
    }, delay);
  }

  // Public API
  return {
    render: render,
    fitNames: fitNames,
    animateValues: animateValues,
    getCoverUrl: getCoverUrl,
    COVERS: COVERS
  };

})();
