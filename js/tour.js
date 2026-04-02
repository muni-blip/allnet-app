/* ═══════════════════════════════
   ALLNET TOUR — Guided Tooltip Callouts
   Usage: Tour.start('play', [ { target: '#el', text: '...', button: 'Next' } ])
   ═══════════════════════════════ */
var Tour = (function() {
  var _overlay = null;
  var _spotlight = null;
  var _tooltip = null;
  var _steps = [];
  var _current = 0;
  var _pageKey = '';
  var _active = false;
  var MAX_SPOTLIGHT_H = 160;

  function _storageKey(page) { return 'allnet_tour_' + page; }

  function _hasSeen(page) {
    try { return localStorage.getItem(_storageKey(page)) === '1'; } catch(e) { return false; }
  }

  function _markSeen(page) {
    try { localStorage.setItem(_storageKey(page), '1'); } catch(e) {}
  }

  function _createElements() {
    if (_overlay) return;
    _overlay = document.createElement('div');
    _overlay.className = 'tour-overlay';
    _spotlight = document.createElement('div');
    _spotlight.className = 'tour-spotlight';
    _tooltip = document.createElement('div');
    _tooltip.className = 'tour-tooltip';
    _overlay.appendChild(_spotlight);
    _overlay.appendChild(_tooltip);
    document.body.appendChild(_overlay);
  }

  function _getSpotlightRect(el) {
    var rect = el.getBoundingClientRect();
    var pad = 8;
    var vh = window.innerHeight;
    var vw = window.innerWidth;

    var top = rect.top - pad;
    var left = Math.max(4, rect.left - pad);
    var w = Math.min(rect.width + pad * 2, vw - 8);
    var h = rect.height + pad * 2;

    // Clamp height for tall elements — center on visible portion
    if (h > MAX_SPOTLIGHT_H) {
      var visibleCenter = Math.max(0, Math.min(rect.top + rect.height / 2, vh));
      top = visibleCenter - MAX_SPOTLIGHT_H / 2;
      h = MAX_SPOTLIGHT_H;
    }

    // Clamp within viewport
    if (top < 4) top = 4;
    if (top + h > vh - 4) top = vh - 4 - h;

    return { top: top, left: left, width: w, height: h };
  }

  function _positionSpotlight(el) {
    var r = _getSpotlightRect(el);
    _spotlight.style.top = r.top + 'px';
    _spotlight.style.left = r.left + 'px';
    _spotlight.style.width = r.width + 'px';
    _spotlight.style.height = r.height + 'px';
  }

  function _positionTooltip(el) {
    var sr = _getSpotlightRect(el);
    var spotCenter = sr.top + sr.height / 2;
    var vh = window.innerHeight;
    var vw = window.innerWidth;

    // Fixed position: spotlight in top 60% → tooltip at bottom; else tooltip at top
    if (spotCenter < vh * 0.6) {
      _tooltip.style.bottom = '16px';
      _tooltip.style.top = 'auto';
    } else {
      _tooltip.style.top = '70px';
      _tooltip.style.bottom = 'auto';
    }

    // Center horizontally
    var tooltipW = Math.min(320, vw - 40);
    _tooltip.style.left = ((vw - tooltipW) / 2) + 'px';
    _tooltip.style.width = tooltipW + 'px';
  }

  function _findElement(step) {
    var el = document.querySelector(step.target);
    if (_isVisible(el)) return el;
    if (step.fallbackTarget) {
      el = document.querySelector(step.fallbackTarget);
      if (_isVisible(el)) return el;
    }
    return null;
  }

  function _isVisible(el) {
    if (!el) return false;
    // Elements in fixed containers (nav-bar) are always considered visible
    if (el.closest('.nav-bar') || el.closest('.balance-hero')) return true;
    return el.offsetParent !== null;
  }

  function _renderStep() {
    var step = _steps[_current];
    if (!step) { _end(); return; }

    var el = _findElement(step);
    if (!el) {
      _current++;
      if (_current < _steps.length) { _renderStep(); } else { _end(); }
      return;
    }

    _positionSpotlight(el);

    var isLast = _current === _steps.length - 1;
    var stepLabel = 'Step ' + (_current + 1) + ' of ' + _steps.length;
    var btnText = step.button || (isLast ? "Got it! 🏀" : 'Next →');

    _tooltip.innerHTML =
      '<div class="tour-tooltip__step">' + stepLabel + '</div>' +
      '<div class="tour-tooltip__text">' + step.text + '</div>' +
      '<div class="tour-tooltip__actions">' +
        '<button class="tour-tooltip__skip" onclick="Tour.end()">Skip tour</button>' +
        '<button class="tour-tooltip__next" onclick="Tour.next()">' + btnText + '</button>' +
      '</div>';

    requestAnimationFrame(function() { _positionTooltip(el); });
  }

  function _end() {
    if (!_active) return;
    _active = false;
    _markSeen(_pageKey);
    if (_overlay) _overlay.classList.remove('active');
    setTimeout(function() {
      if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
      _overlay = null; _spotlight = null; _tooltip = null;
    }, 400);
    window.removeEventListener('resize', _onResize);
  }

  function _onResize() {
    if (!_active || _current >= _steps.length) return;
    var el = _findElement(_steps[_current]);
    if (el) {
      _positionSpotlight(el);
      _positionTooltip(el);
    }
  }

  return {
    start: function(pageKey, steps) {
      if (_active) return;
      if (_hasSeen(pageKey)) return;
      if (!steps || steps.length === 0) return;
      _pageKey = pageKey;
      _steps = steps;
      _current = 0;
      _active = true;
      _createElements();
      _overlay.classList.add('active');
      _renderStep();
      window.addEventListener('resize', _onResize);
    },

    next: function() {
      if (!_active) return;
      _current++;
      if (_current >= _steps.length) { _end(); return; }
      _renderStep();
    },

    end: function() { _end(); },
    hasSeen: _hasSeen,

    forceStart: function(pageKey, steps) {
      try { localStorage.removeItem(_storageKey(pageKey)); } catch(e) {}
      this.start(pageKey, steps);
    }
  };
})();
