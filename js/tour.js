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

  function _positionSpotlight(el) {
    var rect = el.getBoundingClientRect();
    var pad = 8;
    _spotlight.style.top = (rect.top - pad) + 'px';
    _spotlight.style.left = (rect.left - pad) + 'px';
    _spotlight.style.width = (rect.width + pad * 2) + 'px';
    _spotlight.style.height = (rect.height + pad * 2) + 'px';
  }

  function _positionTooltip(el) {
    var rect = el.getBoundingClientRect();
    var pad = 8;
    var spotBottom = rect.bottom + pad;
    var spotTop = rect.top - pad;
    var tooltipH = _tooltip.offsetHeight || 180;
    var gap = 14;
    var arrowEl = _tooltip.querySelector('.tour-tooltip__arrow');

    // Determine if tooltip fits below the spotlight
    var spaceBelow = window.innerHeight - spotBottom - gap;
    var spaceAbove = spotTop - gap;
    var placeBelow = spaceBelow >= tooltipH || spaceBelow >= spaceAbove;

    if (placeBelow) {
      _tooltip.style.top = (spotBottom + gap) + 'px';
      _tooltip.style.bottom = 'auto';
      if (arrowEl) {
        arrowEl.className = 'tour-tooltip__arrow tour-tooltip__arrow--top';
      }
    } else {
      _tooltip.style.top = Math.max(12, spotTop - gap - tooltipH) + 'px';
      _tooltip.style.bottom = 'auto';
      if (arrowEl) {
        arrowEl.className = 'tour-tooltip__arrow tour-tooltip__arrow--bottom';
      }
    }

    // Horizontal: center on spotlight, clamp to viewport
    var centerX = rect.left + rect.width / 2;
    var tooltipW = Math.min(320, window.innerWidth - 40);
    var left = centerX - tooltipW / 2;
    left = Math.max(20, Math.min(left, window.innerWidth - tooltipW - 20));
    _tooltip.style.left = left + 'px';

    // Position arrow to point at the center of the spotlight
    if (arrowEl) {
      var arrowLeft = centerX - left - 7;
      arrowLeft = Math.max(16, Math.min(arrowLeft, tooltipW - 30));
      arrowEl.style.left = arrowLeft + 'px';
    }
  }

  function _renderStep() {
    var step = _steps[_current];
    if (!step) { _end(); return; }

    var el = document.querySelector(step.target);
    if (!el || el.offsetParent === null && !el.closest('.nav-bar')) {
      // Target not found or hidden — try fallback target
      if (step.fallbackTarget) {
        el = document.querySelector(step.fallbackTarget);
      }
      if (!el || el.offsetParent === null && !el.closest('.nav-bar')) {
        _current++;
        if (_current < _steps.length) { _renderStep(); } else { _end(); }
        return;
      }
    }

    // Scroll element into view if needed
    var rect = el.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(function() { _renderStepPositioned(el, step); }, 350);
    } else {
      _renderStepPositioned(el, step);
    }
  }

  function _renderStepPositioned(el, step) {
    _positionSpotlight(el);

    var isLast = _current === _steps.length - 1;
    var stepLabel = 'Step ' + (_current + 1) + ' of ' + _steps.length;
    var btnText = step.button || (isLast ? "Got it! 🏀" : 'Next →');

    _tooltip.innerHTML =
      '<div class="tour-tooltip__arrow tour-tooltip__arrow--top"></div>' +
      '<div class="tour-tooltip__step">' + stepLabel + '</div>' +
      '<div class="tour-tooltip__text">' + step.text + '</div>' +
      '<div class="tour-tooltip__actions">' +
        '<button class="tour-tooltip__skip" onclick="Tour.end()">Skip tour</button>' +
        '<button class="tour-tooltip__next" onclick="Tour.next()">' + btnText + '</button>' +
      '</div>';

    // Position after content is rendered
    requestAnimationFrame(function() { _positionTooltip(el); });
  }

  function _end() {
    if (!_active) return;
    _active = false;
    _markSeen(_pageKey);
    if (_overlay) _overlay.classList.remove('active');
    // Clean up after transition
    setTimeout(function() {
      if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
      _overlay = null; _spotlight = null; _tooltip = null;
    }, 400);
  }

  // Handle window resize — reposition spotlight and tooltip
  function _onResize() {
    if (!_active || _current >= _steps.length) return;
    var step = _steps[_current];
    var el = document.querySelector(step.target);
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

    end: function() {
      _end();
      window.removeEventListener('resize', _onResize);
    },

    hasSeen: _hasSeen,

    // Allow triggering tour even if seen (for testing)
    forceStart: function(pageKey, steps) {
      try { localStorage.removeItem(_storageKey(pageKey)); } catch(e) {}
      this.start(pageKey, steps);
    }
  };
})();
