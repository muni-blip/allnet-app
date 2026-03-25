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

    // Empty state
    if (!cut) {
      return '<div class="cc__cover" style="background-image:url(\'' + coverUrl + '\')"></div>' +
        '<div class="cc__overlay"></div>' +
        '<div class="cc__placeholder">' +
          '<div class="cc__placeholder-icon">📷</div>' +
          '<div class="cc__placeholder-text">Upload a photo to generate your career card</div>' +
        '</div>';
    }

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
      '<div class="cc__player-frame"><img src="' + cut + '" alt="' + fn + ' ' + ln + '" onerror="this.style.display=\'none\'"></div>' +
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

  /* ── Rolodex number animation ──
     Counts from old→new with easeOutCubic.
     Call after render() + fitNames().
     opts: { winsFrom, winsTo, lossesFrom, lossesTo, drawsFrom, drawsTo,
             skillFrom, skillTo, socialFrom, socialTo, duration, stagger }
  */
  function animateValues(cardId, opts) {
    var container = document.getElementById(cardId);
    if (!container) return;

    var duration = opts.duration || 1400;
    var stagger  = opts.stagger  || 200;
    var anims = [];

    // W / L / D — integer values
    var wEl = container.querySelector('.cc__wld-col--w .cc__wld-value');
    var lEl = container.querySelector('.cc__wld-col--l .cc__wld-value');
    var dEl = container.querySelector('.cc__wld-col--d .cc__wld-value');

    if (wEl && opts.winsFrom != null)   anims.push({ el: wEl, from: opts.winsFrom,   to: opts.winsTo,   dec: 0, delay: 0 });
    if (lEl && opts.lossesFrom != null) anims.push({ el: lEl, from: opts.lossesFrom, to: opts.lossesTo, dec: 0, delay: 0 });
    if (dEl && opts.drawsFrom != null)  anims.push({ el: dEl, from: opts.drawsFrom,  to: opts.drawsTo,  dec: 0, delay: 0 });

    // Skill rating — 1 decimal
    var skillNum = container.querySelector('.cc__skill-row .cc__rating-num');
    if (skillNum && opts.skillFrom != null) anims.push({ el: skillNum, from: opts.skillFrom, to: opts.skillTo, dec: 1, delay: stagger });

    // Social rating — 1 decimal
    var socialNum = container.querySelector('.cc__social-row .cc__rating-num');
    if (socialNum && opts.socialFrom != null) anims.push({ el: socialNum, from: opts.socialFrom, to: opts.socialTo, dec: 1, delay: stagger * 2 });

    // Hide deltas initially, reveal after animation
    var deltas = container.querySelectorAll('.cc__wld-delta, .cc__rating-delta');
    deltas.forEach(function(d) { d.style.opacity = '0'; d.style.transition = 'none'; });

    // Set old values immediately
    anims.forEach(function(a) {
      a.el.textContent = a.dec > 0 ? Number(a.from).toFixed(a.dec) : String(Math.round(a.from));
    });

    // easeOutCubic: fast start, gentle settle
    function ease(t) { return 1 - Math.pow(1 - t, 3); }

    // Run each animation with its delay
    anims.forEach(function(a) {
      setTimeout(function() {
        var start = performance.now();
        function tick(now) {
          var elapsed = now - start;
          var progress = Math.min(elapsed / duration, 1);
          var current = a.from + (a.to - a.from) * ease(progress);

          if (a.dec > 0) {
            a.el.textContent = current.toFixed(a.dec);
          } else {
            a.el.textContent = String(Math.round(current));
          }

          if (progress < 1) {
            requestAnimationFrame(tick);
          }
        }
        requestAnimationFrame(tick);
      }, a.delay);
    });

    // Fade in deltas after all animations finish
    var totalTime = (stagger * 2) + duration + 100;
    setTimeout(function() {
      deltas.forEach(function(d, i) {
        setTimeout(function() {
          d.style.transition = 'opacity 0.4s ease';
          d.style.opacity = '1';
        }, i * 120);
      });
    }, totalTime);
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
