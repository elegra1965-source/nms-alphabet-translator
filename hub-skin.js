/* NMS Alphabet Translator — "Hub skin" v3.0
   Adds the Hub/Weather atmosphere, a glyph hero, HUD corner brackets,
   line icons, and the current network name in the footer. No dependencies. */
(function () {
  // fonts shared with the Hub + Weather App
  if (!document.querySelector('link[href*="family=Orbitron"]')) {
    var f = document.createElement('link');
    f.rel = 'stylesheet';
    f.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;800&family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap';
    document.head.appendChild(f);
  }

  function run() {
    var page = document.querySelector('.page');
    if (!page || page.dataset.hs) return;
    page.dataset.hs = '1';

    // atmosphere layers
    ['hs-grid', 'hs-orb1', 'hs-orb2', 'hs-scan', 'hs-vig'].forEach(function (c) {
      var d = document.createElement('div'); d.className = 'hs-atm ' + c; d.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(d, document.body.firstChild);
    });

    // hero: status badge + the title written in the alien alphabet
    var h1 = page.querySelector('h1');
    if (h1) {
      var hero = document.createElement('div');
      hero.className = 'hs-hero';
      hero.innerHTML = '<span class="hs-badge"><i></i>Free · No Man’s Sky Hub</span>' +
                       '<div class="hs-glyphs" aria-hidden="true">TRANSLATOR</div>';
      page.insertBefore(hero, h1);
    }

    // NMS-font text decodes to English and back (same rhythm as the Weather app:
    // ~6s alien glyphs, ~3s English "· DECODED", glitch on each switch)
    var heroG = page.querySelector('.hs-glyphs'), out = document.getElementById('out');
    var lastEn = null;
    function flip() {
      var en = Math.floor(Date.now() / 1000) % 9 >= 6;
      if (en === lastEn) return; lastEn = en;
      if (heroG) {
        heroG.classList.toggle('hs-en', en);
        heroG.innerHTML = en ? 'TRANSLATOR <small>· DECODED</small>' : 'TRANSLATOR';
        heroG.classList.remove('hs-glitch'); void heroG.offsetWidth; heroG.classList.add('hs-glitch');
      }
      if (out) out.classList.toggle('hs-en', en); // only visible while the box is empty (example text)
    }
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) { flip(); setInterval(flip, 500); }

    // HUD corner brackets
    document.querySelectorAll('.trans-box, .chart').forEach(function (p) {
      ['tl', 'br'].forEach(function (k) { var s = document.createElement('span'); s.className = 'hs-c ' + k; p.appendChild(s); });
    });

    // emoji -> line icons
    var ICON = {
      '\u{1F310}': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
      '\u{1F4F1}': '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M12 7v7M9 11.5l3 3 3-3M10 18.5h4"/>'
    };
    document.querySelectorAll('.lang-ic, .install-btn span:first-child').forEach(function (el) {
      var k = el.textContent.trim().replace('️', '');
      if (ICON[k]) el.innerHTML = '<span class="hs-ico" aria-hidden="true"><svg viewBox="0 0 24 24">' + ICON[k] + '</svg></span>';
    });

    // footer: old network name -> current Hub name
    var w = document.createTreeWalker(document.querySelector('footer') || document.body, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) {
      if (/Command Network/i.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/Command Network/ig, 'No Man’s Sky Hub');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
