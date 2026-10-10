/* NMS Alphabet Translator — Portal Glyph Reader (2026-10-10)
   Reads the 12 portal glyphs from a screenshot, entirely in the browser
   (nothing is uploaded). Finds the row of 12 glyphs, matches each one
   against the 16 known portal glyph shapes, then lets the traveller check
   and fix any glyph before opening the address on the Galactic Map or
   dialling it on the Hub. Also works as a plain tap-to-dial keypad.
   Core reader: window.NMSGlyphReader.read(imageData) -> {hex, scores, boxes} */
(function () {
  "use strict";
  var HEX = "0123456789ABCDEF";
  var NAMES = ["Sunset", "Bird", "Face", "Diplo", "Eclipse", "Balloon", "Boat", "Bug",
    "Dragonfly", "Galaxy", "Voxel", "Fish", "Tent", "Rocket", "Tree", "Atlas"];
  var N = 36; // template grid size

  /* ---------------- image helpers ---------------- */
  function luminance(d, n) {
    var L = new Uint8Array(n);
    for (var i = 0, j = 0; i < n; i++, j += 4) {
      var a = d[j + 3] / 255;
      // transparent pixels count as black background
      L[i] = (0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]) * a | 0;
    }
    return L;
  }
  function otsu(L, idxs) {
    var h = new Float64Array(256), n = 0, i;
    if (idxs) { for (i = 0; i < idxs.length; i++) h[L[idxs[i]]]++; n = idxs.length; }
    else { for (i = 0; i < L.length; i++) h[L[i]]++; n = L.length; }
    var sum = 0; for (i = 0; i < 256; i++) sum += i * h[i];
    var sB = 0, wB = 0, best = 0, t = 128;
    for (i = 0; i < 256; i++) {
      wB += h[i]; if (!wB) continue;
      var wF = n - wB; if (!wF) break;
      sB += i * h[i];
      var mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; t = i; }
    }
    return t;
  }
  // foreground = pixels clearly brighter (or darker) than the local background
  function binarize(L, w, h, invert, t) {
    var m = new Uint8Array(w * h);
    for (var i = 0; i < m.length; i++) m[i] = invert ? (L[i] < t ? 1 : 0) : (L[i] > t ? 1 : 0);
    return m;
  }
  function components(m, w, h) {
    var lab = new Int32Array(w * h), out = [], stack = new Int32Array(w * h), id = 0;
    for (var s = 0; s < m.length; s++) {
      if (!m[s] || lab[s]) continue;
      id++; var sp = 0; stack[sp++] = s; lab[s] = id;
      var c = { id: id, x0: w, y0: h, x1: 0, y1: 0, n: 0 };
      while (sp) {
        var p = stack[--sp], x = p % w, y = (p / w) | 0;
        c.n++; if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
        for (var dy = -1; dy <= 1; dy++) {
          var yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (var dx = -1; dx <= 1; dx++) {
            var xx = x + dx; if (xx < 0 || xx >= w) continue;
            var q = yy * w + xx; if (m[q] && !lab[q]) { lab[q] = id; stack[sp++] = q; }
          }
        }
      }
      c.w = c.x1 - c.x0 + 1; c.h = c.y1 - c.y0 + 1; c.cx = (c.x0 + c.x1) / 2; c.cy = (c.y0 + c.y1) / 2;
      out.push(c);
    }
    return { list: out, lab: lab };
  }

  /* -------- normalised feature: crop to bbox, fit in N x N keeping aspect, blur -------- */
  function feature(getPix, x0, y0, x1, y1) {
    var bw = x1 - x0 + 1, bh = y1 - y0 + 1, s = Math.max(bw, bh);
    var g = new Float32Array(N * N), cnt = new Float32Array(N * N);
    var ox = (s - bw) / 2, oy = (s - bh) / 2;
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var gx = Math.min(N - 1, ((x - x0 + ox) / s * N) | 0), gy = Math.min(N - 1, ((y - y0 + oy) / s * N) | 0);
      g[gy * N + gx] += getPix(x, y); cnt[gy * N + gx]++;
    }
    for (var i = 0; i < g.length; i++) g[i] = cnt[i] ? g[i] / cnt[i] : 0;
    // thicken strokes so stroke width / glow differences matter less
    var b = blur(blur(g));
    var norm = 0; for (i = 0; i < b.length; i++) norm += b[i] * b[i];
    norm = Math.sqrt(norm) || 1; for (i = 0; i < b.length; i++) b[i] /= norm;
    return { v: b, aspect: bw / bh };
  }
  function blur(g) {
    var o = new Float32Array(N * N);
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var s = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < N && yy < N) s += g[yy * N + xx];
      }
      o[y * N + x] = s / 9;
    }
    return o;
  }

  /* ---------------- templates ---------------- */
  var TPL = null;
  function loadTemplates(base) {
    if (TPL) return Promise.resolve(TPL);
    return Promise.all(HEX.split("").map(function (c) {
      return new Promise(function (res, rej) {
        var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej;
        im.src = base + "g-" + c + ".png";
      });
    })).then(function (ims) {
      TPL = ims.map(function (im) {
        var cv = document.createElement("canvas"); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
        var cx = cv.getContext("2d"); cx.drawImage(im, 0, 0);
        var d = cx.getImageData(0, 0, cv.width, cv.height).data, w = cv.width, h = cv.height;
        var x0 = w, y0 = h, x1 = 0, y1 = 0;
        for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 150) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        return feature(function (x, y) { return d[(y * w + x) * 4 + 3] > 150 ? 1 : 0; }, x0, y0, x1, y1);
      });
      return TPL;
    });
  }
  function match(f) {
    var res = [];
    for (var k = 0; k < 16; k++) {
      var t = TPL[k], dot = 0;
      for (var i = 0; i < t.v.length; i++) dot += t.v[i] * f.v[i];
      var ar = Math.abs(Math.log(f.aspect / t.aspect));
      res.push({ k: k, s: dot - 0.12 * ar });
    }
    res.sort(function (a, b) { return b.s - a.s; });
    return res;
  }

  /* ---------------- finding the row of 12 ---------------- */
  // group the components of a candidate row into glyph clusters by x overlap
  function clusters(comps, H) {
    comps = comps.slice().sort(function (a, b) { return a.x0 - b.x0; });
    var out = [];
    comps.forEach(function (c) {
      var last = out[out.length - 1];
      if (last && c.x0 - last.x1 <= Math.max(1, H * 0.06)) {
        last.items.push(c); last.x1 = Math.max(last.x1, c.x1); last.y0 = Math.min(last.y0, c.y0); last.y1 = Math.max(last.y1, c.y1);
      } else out.push({ items: [c], x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1 });
    });
    return out;
  }
  function mergeTo(cl, n) {
    cl = cl.map(function (c) { return { items: c.items.slice(), x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1 }; });
    while (cl.length > n) {
      var bi = 0, bg = Infinity;
      for (var i = 0; i < cl.length - 1; i++) {
        // prefer merging a small fragment into its neighbour
        var g = (cl[i + 1].x0 - cl[i].x1) + 0.5 * Math.min(cl[i].x1 - cl[i].x0, cl[i + 1].x1 - cl[i + 1].x0);
        if (g < bg) { bg = g; bi = i; }
      }
      var a = cl[bi], b = cl[bi + 1];
      cl.splice(bi, 2, { items: a.items.concat(b.items), x0: a.x0, x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) });
    }
    return cl;
  }
  function featOf(items, lab, w) {
    var ids = {}, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    items.forEach(function (c) { ids[c.id] = 1; x0 = Math.min(x0, c.x0); x1 = Math.max(x1, c.x1); y0 = Math.min(y0, c.y0); y1 = Math.max(y1, c.y1); });
    return { f: feature(function (x, y) { return ids[lab[y * w + x]] ? 1 : 0; }, x0, y0, x1, y1), box: [x0, y0, x1, y1] };
  }
  function scoreSet(set, lab, w) {
    // each glyph is matched as found, and again without thin lines stuck to its left/right edge
    // (a UI bracket or box side that touches the glyph); whichever matches a real glyph better wins
    var ms = [];
    set = set.map(function (g) {
      var full = featOf(g.items, lab, w), best = { m: match(full.f), box: full.box, items: g.items };
      if (g.items.length > 1) {
        var H = g.y1 - g.y0 + 1, W2 = g.x1 - g.x0 + 1;
        var keep = g.items.filter(function (c) {
          var thin = Math.min(c.w, c.h) <= Math.max(2, 0.12 * Math.max(H, W2));
          var edge = c.x0 <= g.x0 + 1 || c.x1 >= g.x1 - 1 || c.y0 <= g.y0 + 1 || c.y1 >= g.y1 - 1;
          return !(thin && edge && Math.max(c.w, c.h) > 0.5 * Math.max(H, W2));
        });
        var tries = [];
        if (keep.length && keep.length < g.items.length) tries.push(keep);
        // also try leaving out any single piece on the left/right edge (a bracket or part of a box)
        if (g.items.length <= 8) g.items.forEach(function (c) {
          if (c.x0 <= g.x0 + 1 || c.x1 >= g.x1 - 1) tries.push(g.items.filter(function (o) { return o !== c; }));
        });
        tries.forEach(function (its) {
          if (!its.length) return;
          var alt = featOf(its, lab, w), am = match(alt.f);
          if (am[0].s > best.m[0].s + 0.03) best = { m: am, box: alt.box, items: its };
        });
      }
      ms.push(best.m);
      return { items: best.items, x0: best.box[0], y0: best.box[1], x1: best.box[2], y1: best.box[3] };
    });
    var mean = 0;
    ms.forEach(function (m) { mean += m[0].s; }); mean /= ms.length;
    // even spacing is a strong hint that this is a real glyph strip
    var cs = set.map(function (g) { return (g.x0 + g.x1) / 2; }), steps = [];
    for (var i = 1; i < cs.length; i++) steps.push(cs[i] - cs[i - 1]);
    var avg = steps.reduce(function (a, b) { return a + b; }, 0) / steps.length, dev = 0;
    steps.forEach(function (s) { dev += Math.abs(s - avg); }); dev /= steps.length * (avg || 1);
    var hs = set.map(function (g) { return g.y1 - g.y0 + 1; }), hmax = Math.max.apply(null, hs);
    return { ms: ms, mean: mean, total: mean - 0.25 * dev, set: set };
  }

  // hollow rectangles (the boxes some UIs draw round each glyph) are not glyphs
  function isFrame(c, lab, w) {
    if (c.w < 8 || c.h < 8 || c.n > 0.45 * c.w * c.h) return false;
    function side(horizontal, pos) { // fraction of the side that has a pixel within 2px of the edge
      var hit = 0, len = horizontal ? c.w : c.h;
      for (var k = 0; k < len; k++) {
        var on = false;
        for (var e = 0; e < 3 && !on; e++) {
          var x = horizontal ? c.x0 + k : (pos ? c.x1 - e : c.x0 + e), y = horizontal ? (pos ? c.y1 - e : c.y0 + e) : c.y0 + k;
          if (lab[y * w + x] === c.id) on = true;
        }
        if (on) hit++;
      }
      return hit / len;
    }
    return side(true, 0) > 0.6 && side(true, 1) > 0.6 && side(false, 0) > 0.6 && side(false, 1) > 0.6;
  }

  function readFromImageData(img, opts) {
    opts = opts || {};
    var w = img.width, h = img.height, n = w * h, d = img.data;
    var best = null;
    // brightness variants: plain luminance (both polarities), plus "whiteness" (bright and
    // colourless) so coloured UI such as the game's cyan glyph boxes or orange brackets drops out,
    // and its mirror for dark glyphs on a light page
    var L = luminance(d, n), MN = new Uint8Array(n), MX = new Uint8Array(n);
    for (var i = 0, j = 0; i < n; i++, j += 4) {
      var a = d[j + 3] / 255;
      var lo = Math.min(d[j], d[j + 1], d[j + 2]), hi = Math.max(d[j], d[j + 1], d[j + 2]);
      MN[i] = Math.max(0, lo - (hi - lo)) * a | 0;            // bright AND colourless
      MX[i] = Math.min(255, hi + (hi - lo)) * a | 0;          // dark AND colourless (inverted use)
    }
    var variants = [[L, false], [L, true], [MN, false], [MX, true]];
    if (opts.only != null) variants = [variants[opts.only]];
    variants.forEach(function (vr) {
      var C = vr[0], inv = vr[1], t = otsu(C);
      var ths = [t, inv ? Math.max(10, t - 40) : Math.min(245, t + 40)];
      if (C === MN) ths.push(100, 150); if (C === MX) ths.push(155, 105);
      ths.forEach(function (th) {
        var m = binarize(C, w, h, inv, th), cc = components(m, w, h);
        var minH = Math.max(5, h * 0.012), list = cc.list.filter(function (c) {
          return c.n >= 3 && c.h <= h * 0.6 && c.w <= w * 0.25 && !(c.x0 === 0 && c.x1 === w - 1) && !isFrame(c, cc.lab, w);
        });
        var anchors = list.filter(function (c) { return c.h >= minH && c.w >= 3; });
        if (opts.crop) anchors = anchors.slice().sort(function (a, b) { return b.h - a.h; }).slice(0, 8);
        else anchors = anchors.slice().sort(function (a, b) { return b.n - a.n; }).slice(0, 160);
        var tried = {};
        anchors.forEach(function (a) {
          var H = a.h, band0 = a.cy - H * 0.95, band1 = a.cy + H * 0.95;
          var row = list.filter(function (c) { return c.cy >= band0 && c.cy <= band1 && c.h <= H * 1.8; });
          if (opts.crop) row = list;
          var cl = clusters(row, H);
          // split rows where a big gap breaks the strip
          var runs = [[]];
          cl.forEach(function (c, i) {
            if (i && c.x0 - cl[i - 1].x1 > H * 2.6 && !opts.crop) runs.push([]);
            runs[runs.length - 1].push(c);
          });
          runs.forEach(function (r) {
            var big = r.filter(function (c) { return (c.y1 - c.y0 + 1) >= H * 0.45; });
            if (big.length < 12) return;
            var key = (C === L ? 'L' : C === MN ? 'N' : 'X') + inv + ":" + th + ":" + r[0].x0 + ":" + r[r.length - 1].x1 + ":" + Math.round(a.cy / 4);
            if (tried[key]) return; tried[key] = 1;
            var cands = [];
            if (r.length === 12) cands.push(r);
            else if (r.length > 12) {
              cands.push(mergeTo(r, 12));
              if (r.length <= 40) for (var i = 0; i + 12 <= r.length; i++) cands.push(r.slice(i, i + 12));
            }
            cands.forEach(function (set) {
              var sc = scoreSet(set, cc.lab, w);
              if (!best || sc.total > best.total) { best = sc; best.inv = inv; }
            });
          });
        });
      });
    });
    if (!best) return null;
    return {
      hex: best.ms.map(function (m) { return HEX[m[0].k]; }).join(""),
      glyphs: best.ms.map(function (m) {
        var conf = Math.max(0, Math.min(1, (m[0].s - 0.45) / 0.4)) * Math.min(1, (m[0].s - m[1].s) / 0.08 + 0.2);
        return { k: m[0].k, s: m[0].s, alt: m[1].k, conf: Math.max(0, Math.min(1, conf)) };
      }),
      boxes: best.set.map(function (g) { return [g.x0, g.y0, g.x1, g.y1]; }),
      score: best.mean, inverted: best.inv
    };
  }

  function imageToData(src, maxW) {
    var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height, s = Math.min(1, (maxW || 1400) / w);
    var cv = document.createElement("canvas"); cv.width = Math.round(w * s); cv.height = Math.round(h * s);
    var cx = cv.getContext("2d"); cx.drawImage(src, 0, 0, cv.width, cv.height);
    return { data: cx.getImageData(0, 0, cv.width, cv.height), scale: s, canvas: cv };
  }

  window.NMSGlyphReader = {
    HEX: HEX, NAMES: NAMES, loadTemplates: loadTemplates,
    read: function (imageData, opts) { return readFromImageData(imageData, opts); },
    imageToData: imageToData
  };

  /* ================= UI ================= */
  var BASE = "glyphs/";
  var GALAXIES = null;
  var MAP = "https://map.nomansskyhub.app/";
  var HUB = "https://nomansskyhub.app/";

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function traveller() { try { var m = document.cookie.match(/(?:^|; )nmsTraveller=([^;]*)/); return m ? JSON.parse(decodeURIComponent(m[1])) : {}; } catch (e) { return {}; } }

  function buildUI() {
    var toggle = document.querySelector(".mode-toggle"), enBtn = document.getElementById("modeEnBtn"), glBtn = document.getElementById("modeGlyphBtn");
    var enMode = document.getElementById("enMode"), glyphMode = document.getElementById("glyphMode");
    if (!toggle || !enBtn) return;
    var btn = el("button", "mode-btn gr-mode-btn", "&#9651; Portal Glyphs");
    btn.type = "button"; btn.id = "modePortalBtn";
    toggle.appendChild(btn);

    var box = el("section", "gr-wrap"); box.id = "portalMode"; box.style.display = "none";
    box.innerHTML =
      '<div class="gr-panel">' +
      '<div class="gr-head"><span class="gr-kick">// Portal glyph reader //</span><h2>Read a portal address from a screenshot</h2>' +
      '<p>Drop, paste or pick a screenshot showing the 12 glyphs in a row &mdash; from the game&rsquo;s photo mode, a base or discovery page, or a Reddit post. It&rsquo;s read on your device; nothing is uploaded.</p></div>' +
      '<div class="gr-pick-row"><label class="gr-drop" id="grDrop" tabindex="0"><input type="file" accept="image/*" id="grFile" hidden>' +
      '<span class="gr-drop-ic">&#9635;</span><span class="gr-drop-t">Choose a screenshot</span><span class="gr-drop-s">or drag it here &middot; or paste (Ctrl+V)</span></label>' +
      '<button type="button" class="gr-drop gr-cam" id="grScan"><span class="gr-drop-ic">&#9673;</span><span class="gr-drop-t">Scan with camera</span><span class="gr-drop-s">point at the screen, it reads by itself</span></button></div>' +
      '<label class="gr-photo-link"><input type="file" accept="image/*" capture="environment" id="grCamFile" hidden>or take a single photo instead</label>' +
      '<p class="gr-tip">Best results: a screenshot, or a photo taken straight-on and close so the 12 glyphs fill the width. Glyphs in boxes, like the game&rsquo;s own address bar, are fine.</p>' +
      '<div class="gr-stage" id="grStage" hidden><canvas id="grCanvas"></canvas><div class="gr-stage-note" id="grNote"></div></div>' +
      '<div class="gr-result">' +
      '<div class="gr-lbl">Glyph address <span class="gr-help">tap a glyph to change it</span></div>' +
      '<div class="gr-slots" id="grSlots"></div>' +
      '<div class="gr-hexrow"><span class="gr-lbl">Hex</span><span class="gr-hex" id="grHex">&mdash;</span></div>' +
      '<div class="gr-galrow"><label class="gr-lbl" for="grGal">Galaxy</label><select id="grGal"></select></div>' +
      '<div class="gr-actions">' +
      '<a class="gr-btn primary" id="grMap" target="_blank" rel="noopener">Open on Galactic Map &rarr;</a>' +
      '<a class="gr-btn" id="grHub" target="_blank" rel="noopener">Dial on the Hub</a>' +
      '<button class="gr-btn" type="button" id="grCopy">Copy hex</button>' +
      '<button class="gr-btn" type="button" id="grClear">Clear</button></div>' +
      '</div>' +
      '<div class="gr-lbl gr-pad-lbl">Or tap the glyphs yourself</div><div class="gr-pad" id="grPad"></div>' +
      '</div>' +
      '<div class="gr-live" id="grLive" hidden><div class="gr-live-box"><video id="grVideo" playsinline muted autoplay></video>' +
      '<div class="gr-live-guide" id="grGuide"><i></i><i></i><i></i><i></i></div>' +
      '<div class="gr-live-top">Line up the 12 glyphs inside the box</div>' +
      '<div class="gr-live-status" id="grLiveStatus">Starting camera…</div>' +
      '<button type="button" class="gr-btn" id="grLiveX">Cancel</button></div></div>' +
      '<div class="gr-pick" id="grPick" hidden><div class="gr-pick-box"><div class="gr-lbl">Pick the right glyph</div><div class="gr-pick-grid" id="grPickGrid"></div><button class="gr-btn" type="button" id="grPickX">Cancel</button></div></div>';
    (glyphMode || enMode).parentNode.insertBefore(box, (glyphMode || enMode).nextSibling);

    function show(on) {
      box.style.display = on ? "" : "none";
      if (on) { enMode.style.display = "none"; if (glyphMode) glyphMode.style.display = "none"; [enBtn, glBtn].forEach(function (b) { b && b.classList.remove("active"); }); btn.classList.add("active"); }
      else btn.classList.remove("active");
      try { localStorage.setItem("nms_translator_portal", on ? "1" : "0"); } catch (e) {}
    }
    btn.addEventListener("click", function () { show(true); if (history.replaceState) history.replaceState(null, "", "#portal"); });
    [enBtn, glBtn].forEach(function (b) { b && b.addEventListener("click", function () { show(false); if (location.hash === "#portal" && history.replaceState) history.replaceState(null, "", location.pathname + location.search); }); });

    var addr = [], conf = [], slots = box.querySelector("#grSlots"), hexEl = box.querySelector("#grHex"), gal = box.querySelector("#grGal");
    var mapA = box.querySelector("#grMap"), hubA = box.querySelector("#grHub");
    var t = traveller(), gi = typeof t.g === "number" ? t.g : 0;
    try { var sg = parseInt(localStorage.getItem("nms_translator_gal"), 10); if (!isNaN(sg)) gi = sg; } catch (e) {}

    function glyphImg(k) { return '<img src="' + BASE + 'g-' + HEX[k] + '.png" alt="' + NAMES[k] + ' (' + HEX[k] + ')">'; }
    function render() {
      var h = "";
      for (var i = 0; i < 12; i++) {
        var k = addr[i], c = conf[i];
        h += '<button type="button" class="gr-slot' + (k == null ? ' empty' : '') + (c != null && c < 0.5 ? ' unsure' : '') + '" data-i="' + i + '" title="' + (k == null ? 'Empty' : NAMES[k] + ' (' + HEX[k] + ')' + (c != null && c < 0.5 ? ' &mdash; please check' : '')) + '">' + (k == null ? '<span>' + (i + 1) + '</span>' : glyphImg(k)) + '</button>';
      }
      slots.innerHTML = h;
      var full = addr.length === 12 && addr.every(function (k) { return k != null; });
      var hex = addr.map(function (k) { return k == null ? "·" : HEX[k]; }).join("");
      hexEl.textContent = addr.length ? hex : "—";
      var g = gal.value || gi;
      mapA.classList.toggle("off", !full); hubA.classList.toggle("off", !full);
      if (full) {
        mapA.href = MAP + "?arrival=1&addr=" + hex + "&galaxy=" + g;
        hubA.href = HUB + "?g=" + g + "&a=" + hex + "#dialer";
      } else { mapA.removeAttribute("href"); hubA.removeAttribute("href"); }
    }
    slots.addEventListener("click", function (e) {
      var b = e.target.closest(".gr-slot"); if (!b) return;
      openPicker(+b.dataset.i);
    });
    // keypad
    var pad = box.querySelector("#grPad"), ph = "";
    for (var k = 0; k < 16; k++) ph += '<button type="button" class="gr-key" data-k="' + k + '" title="' + NAMES[k] + ' (' + HEX[k] + ')">' + glyphImg(k) + '<i>' + HEX[k] + '</i></button>';
    ph += '<button type="button" class="gr-key gr-back" title="Backspace">&#9003;</button>';
    pad.innerHTML = ph;
    pad.addEventListener("click", function (e) {
      var b = e.target.closest(".gr-key"); if (!b) return;
      if (b.classList.contains("gr-back")) { var j = lastFilled(); if (j >= 0) { addr[j] = null; conf[j] = null; } }
      else { var i = addr.indexOf(null); if (i < 0) i = addr.length; if (i < 12) { addr[i] = +b.dataset.k; conf[i] = null; } }
      trim(); render();
    });
    function lastFilled() { for (var i = 11; i >= 0; i--) if (addr[i] != null) return i; return -1; }
    function trim() { while (addr.length && addr[addr.length - 1] == null) { addr.pop(); conf.pop(); } }

    // picker
    var pick = box.querySelector("#grPick"), pickGrid = box.querySelector("#grPickGrid"), pickI = 0;
    var pg = ""; for (k = 0; k < 16; k++) pg += '<button type="button" class="gr-key" data-k="' + k + '">' + glyphImg(k) + '<i>' + NAMES[k] + '</i></button>';
    pickGrid.innerHTML = pg;
    function openPicker(i) { pickI = i; pick.hidden = false; }
    pickGrid.addEventListener("click", function (e) {
      var b = e.target.closest(".gr-key"); if (!b) return;
      while (addr.length <= pickI) { addr.push(null); conf.push(null); }
      addr[pickI] = +b.dataset.k; conf[pickI] = 1; pick.hidden = true; trim(); render();
    });
    box.querySelector("#grPickX").addEventListener("click", function () { pick.hidden = true; });
    pick.addEventListener("click", function (e) { if (e.target === pick) pick.hidden = true; });

    box.querySelector("#grCopy").addEventListener("click", function () {
      var hex = hexEl.textContent; if (!/^[0-9A-F]{12}$/.test(hex)) return note("Fill all 12 glyphs first.");
      (navigator.clipboard ? navigator.clipboard.writeText(hex) : Promise.reject()).then(function () { note("Copied " + hex); }, function () { note(hex); });
    });
    box.querySelector("#grClear").addEventListener("click", function () { addr = []; conf = []; stage.hidden = true; render(); });
    [mapA, hubA].forEach(function (a) { a.addEventListener("click", function (e) { if (a.classList.contains("off")) { e.preventDefault(); note("Fill all 12 glyphs first."); } }); });

    // galaxies
    fetch("galaxies.json").then(function (r) { return r.json(); }).then(function (list) {
      GALAXIES = list;
      gal.innerHTML = list.map(function (n, i) { return '<option value="' + i + '">' + (i + 1) + ' · ' + n + '</option>'; }).join("");
      gal.value = gi; render();
    }).catch(function () { gal.innerHTML = '<option value="0">1 · Euclid</option>'; });
    gal.addEventListener("change", function () { try { localStorage.setItem("nms_translator_gal", gal.value); } catch (e) {} render(); });

    // reading
    var stage = box.querySelector("#grStage"), cv = box.querySelector("#grCanvas"), noteEl = box.querySelector("#grNote");
    function note(s) { noteEl.textContent = s; noteEl.parentNode.hidden = false; }
    var cur = null, drag = null;
    function handleFile(file) {
      if (!file || !/^image\//.test(file.type)) return;
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () { URL.revokeObjectURL(url); runRead(im); };
      im.src = url;
    }
    function runRead(im, crop) {
      stage.hidden = false; note("Scanning for glyphs…");
      loadTemplates(BASE).then(function () {
        var src = imageToData(im, 1400);
        cur = { im: im, src: src };
        var data = src.data, off = [0, 0], cropK = 1;
        if (crop) {
          var x0 = Math.max(0, Math.round(Math.min(crop[0], crop[2]))), y0 = Math.max(0, Math.round(Math.min(crop[1], crop[3])));
          var x1 = Math.min(data.width, Math.round(Math.max(crop[0], crop[2]))), y1 = Math.min(data.height, Math.round(Math.max(crop[1], crop[3])));
          var cw = Math.max(4, x1 - x0), ch = Math.max(4, y1 - y0), k = Math.max(1, Math.min(4, 110 / ch));
          var up = document.createElement("canvas"); up.width = Math.round(cw * k); up.height = Math.round(ch * k);
          var ux = up.getContext("2d"); ux.imageSmoothingQuality = "high"; ux.drawImage(src.canvas, x0, y0, cw, ch, 0, 0, up.width, up.height);
          data = ux.getImageData(0, 0, up.width, up.height); off = [x0, y0]; cropK = k;
        }
        var r = readFromImageData(data, { crop: !!crop });
        if (r && r.score < 0.68) r = null;
        draw(r, off, cropK);
        if (!r || r.score < 0.75) {
          note(r ? "Not sure about this one — drag a box around just the 12 glyphs to read them again, or fix glyphs by tapping them." : "Couldn’t find 12 glyphs in a row. Drag a box around them on the picture, or tap them in below.");
        } else {
          var unsure = r.glyphs.filter(function (g) { return g.conf < 0.5; }).length;
          note(unsure ? "Read it — " + unsure + " glyph" + (unsure > 1 ? "s" : "") + " marked amber: please check " + (unsure > 1 ? "them" : "it") + " against your screenshot." : "Read it! Check the glyphs match, then open it on the map.");
        }
        if (r) { addr = r.glyphs.map(function (g) { return g.k; }); conf = r.glyphs.map(function (g) { return g.conf; }); render(); }
      }).catch(function () { note("Couldn’t load the glyph shapes. Check your connection and try again."); });
    }
    function draw(r, off, k) {
      k = k || 1;
      var c = cur.src.canvas; cv.width = c.width; cv.height = c.height;
      var x = cv.getContext("2d"); x.drawImage(c, 0, 0);
      if (!r) return;
      x.lineWidth = Math.max(2, c.width / 400);
      r.boxes.forEach(function (b, i) {
        x.strokeStyle = r.glyphs[i].conf < 0.5 ? "#f0a500" : "#00e5ff";
        x.strokeRect(b[0] / k + off[0] - 3, b[1] / k + off[1] - 3, (b[2] - b[0]) / k + 6, (b[3] - b[1]) / k + 6);
      });
    }
    function cvPos(e) { var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * cv.width, (e.clientY - r.top) / r.height * cv.height]; }
    cv.addEventListener("pointerdown", function (e) { if (!cur) return; drag = cvPos(e).concat(cvPos(e)); cv.setPointerCapture(e.pointerId); });
    cv.addEventListener("pointermove", function (e) {
      if (!drag) return; var p = cvPos(e); drag[2] = p[0]; drag[3] = p[1];
      var x = cv.getContext("2d"); x.drawImage(cur.src.canvas, 0, 0); x.strokeStyle = "#00e5ff"; x.setLineDash([8, 6]); x.lineWidth = Math.max(2, cv.width / 400);
      x.strokeRect(drag[0], drag[1], drag[2] - drag[0], drag[3] - drag[1]); x.setLineDash([]);
    });
    cv.addEventListener("pointerup", function () {
      if (!drag) return; var d = drag; drag = null;
      if (Math.abs(d[2] - d[0]) > 20 && Math.abs(d[3] - d[1]) > 8) runRead(cur.im, d);
    });

    var file = box.querySelector("#grFile"), drop = box.querySelector("#grDrop"), cam = box.querySelector("#grCamFile");
    file.addEventListener("change", function () { handleFile(file.files[0]); file.value = ""; });
    cam.addEventListener("change", function () { handleFile(cam.files[0]); cam.value = ""; });
    /* ---- live camera scan (like a bank card scanner): reads frames until the same 12 glyphs
       come back twice in a row, then fills them in. Runs on the device; no frames leave it. ---- */
    var live = box.querySelector("#grLive"), video = box.querySelector("#grVideo"), guide = box.querySelector("#grGuide"), lst = box.querySelector("#grLiveStatus");
    var stream = null, scanning = false, lastHex = "", hits = 0, grab = document.createElement("canvas");
    function stopScan() { scanning = false; if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; live.hidden = true; }
    function scanTick() {
      if (!scanning) return;
      if (!video.videoWidth) { setTimeout(scanTick, 200); return; }
      // read the whole camera frame (the box is only a guide): the reader finds the row itself
      var g = [0, 0, video.videoWidth, video.videoHeight], k = Math.min(1, 1100 / g[2]);
      grab.width = Math.round(g[2] * k); grab.height = Math.round(g[3] * k);
      var gx = grab.getContext("2d"); gx.drawImage(video, g[0], g[1], g[2], g[3], 0, 0, grab.width, grab.height);
      var r = null; try { r = readFromImageData(gx.getImageData(0, 0, grab.width, grab.height)); } catch (e) {}
      if (r && r.score >= 0.8) {
        hits = r.hex === lastHex ? hits + 1 : 1; lastHex = r.hex;
        lst.textContent = hits >= 2 ? "Got it!" : "Reading\u2026 hold steady";
        guide.classList.add("lock");
        if (hits >= 2) {
          var shot = document.createElement("canvas"); shot.width = grab.width; shot.height = grab.height; shot.getContext("2d").drawImage(grab, 0, 0);
          stopScan(); try { navigator.vibrate && navigator.vibrate(60); } catch (e) {}
          addr = r.glyphs.map(function (q) { return q.k; }); conf = r.glyphs.map(function (q) { return q.conf; }); render();
          cur = { im: shot, src: { canvas: shot } }; cv.width = shot.width; cv.height = shot.height; cv.getContext("2d").drawImage(shot, 0, 0);
          stage.hidden = false;
          var uns = r.glyphs.filter(function (q) { return q.conf < 0.5; }).length;
          note(uns ? "Scanned \u2014 check the " + uns + " amber glyph" + (uns > 1 ? "s" : "") + " against the screen." : "Scanned! Check the glyphs match, then open it on the map.");
          box.querySelector("#grSlots").scrollIntoView({ block: "center", behavior: "smooth" });
          return;
        }
      } else { guide.classList.remove("lock"); lst.textContent = "Looking for 12 glyphs\u2026 fill the box, keep it straight"; hits = 0; }
      setTimeout(scanTick, 120);
    }
    box.querySelector("#grScan").addEventListener("click", function () {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { cam.click(); return; }
      live.hidden = false; lst.textContent = "Starting camera\u2026"; lastHex = ""; hits = 0;
      loadTemplates(BASE).then(function () {
        return navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      }).then(function (st) {
        stream = st; video.srcObject = st; scanning = true; return video.play();
      }).then(function () { lst.textContent = "Looking for 12 glyphs\u2026"; setTimeout(scanTick, 300); })
        .catch(function () { stopScan(); note("Couldn\u2019t open the camera \u2014 allow camera access, or take a single photo instead."); stage.hidden = false; cam.click(); });
    });
    box.querySelector("#grLiveX").addEventListener("click", stopScan);
    document.addEventListener("visibilitychange", function () { if (document.hidden && scanning) stopScan(); });
    drop.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } });
    ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
    drop.addEventListener("drop", function (e) { handleFile(e.dataTransfer.files[0]); });
    document.addEventListener("paste", function (e) {
      if (box.style.display === "none") return;
      var it = [].slice.call((e.clipboardData || {}).items || []).filter(function (i) { return /^image\//.test(i.type); })[0];
      if (it) { e.preventDefault(); handleFile(it.getAsFile()); }
    });

    // share links: ?a=HEX&g=N opens the reader filled in
    var qs = new URLSearchParams(location.search), qa = (qs.get("a") || "").toUpperCase(), qg = parseInt(qs.get("g"), 10);
    if (!isNaN(qg)) gi = qg;
    if (/^[0-9A-F]{12}$/.test(qa)) { addr = qa.split("").map(function (c) { return HEX.indexOf(c); }); conf = addr.map(function () { return null; }); }
    render();
    if (location.hash === "#portal" || /^[0-9A-F]{12}$/.test(qa)) show(true);
    window.NMSGlyphReader.ui = { load: runRead, state: function () { return { addr: addr.slice(), conf: conf.slice(), hex: hexEl.textContent }; } };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", buildUI); else buildUI();
})();
