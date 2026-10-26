/* EuroVid — pagina pentru clienți: harta vie, apelul cu asistentul, prețurile. */
(function () {
  'use strict';

  /* ---------- Setări de lansare ---------- */
  // Numărul real se pune în `tel` (ex. '+40372000000'). Cât e gol, butoanele nu sună nicăieri
  // (0372 000 000 poate fi al cuiva) și duc la apelul demonstrativ.
  var PHONE = { display: '0372 000 000', tel: null };
  // Adresa care primește formularul „te sunăm noi". Goală = formularul spune că pornește la lansare.
  var CALLBACK_URL = null;
  // PREȚURI PROVIZORII — de înlocuit cu tarifele reale ale partenerilor.
  var SERVICES = [
    { id: 'fosa', name: 'Fosă septică', desc: 'Golire completă, cu transportul și descărcarea la stația de epurare.', base: 300, perM3: 25 },
    { id: 'bazin', name: 'Bazin vidanjabil', desc: 'Pentru casele fără canalizare. Poți cere golire la dată fixă, în fiecare lună.', base: 300, perM3: 25 },
    { id: 'grasimi', name: 'Separator de grăsimi', desc: 'Pentru restaurante, cantine și spălătorii auto.', base: 400, perM3: 40 },
    { id: 'canal', name: 'Desfundare canalizare', desc: 'Cu jet de apă sub presiune, pentru țevi și cămine înfundate.', flat: 350 }
  ];
  // Apelul demonstrativ. Cu `audio` gol, replicile apar pe rând după timpii de mai jos (secunde);
  // cu fișier, timpii trebuie să fie cei din înregistrare.
  var CALL = {
    audio: null,
    length: 31,
    lines: [
      { who: 'ai', at: 0.4, text: 'EuroVid, bună ziua! Cu ce vă pot ajuta?' },
      { who: 'cl', at: 3.4, text: 'Bună ziua. Am o fosă septică de vreo 6 metri cubi, în Ploiești, pe strada Florilor.' },
      { who: 'ai', at: 9.4, text: 'Vă pot trimite un echipaj chiar azi, la 10:30. Pentru 6 m³, prețul este 450 de lei, cu transport inclus. Confirmați?' },
      { who: 'cl', at: 19.4, text: 'Da, confirm.' },
      { who: 'ai', at: 21.2, text: 'Gata, sunteți programat. Ion ajunge la 10:30, iar acum vă trimit un SMS cu numărul lui. O zi bună!' }
    ],
    quoteAt: 14.5, confirmAt: 20.4, departAt: 28.5
  };
  var WHO = { ai: 'Asistentul EuroVid', cl: 'Client' };

  var doc = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var narrowMq = window.matchMedia('(max-width: 900px)');
  function narrow() { return narrowMq.matches; }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  /* ---------- Bara de sus ---------- */
  var top = $('[data-top]');
  function onTopScroll() { top.classList.toggle('is-solid', window.scrollY > 24); }
  window.addEventListener('scroll', onTopScroll, { passive: true });
  onTopScroll();

  /* ---------- Butoanele de apel ---------- */
  $$('[data-phone-display]').forEach(function (el) { el.textContent = PHONE.display; });
  var toastEl = null, toastTimer = 0;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('p');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 5200);
  }
  $$('[data-call]').forEach(function (a) {
    if (PHONE.tel) { a.href = 'tel:' + PHONE.tel; return; }
    a.addEventListener('click', function (e) {
      e.preventDefault();
      toast('Linia se deschide la lansare. Până atunci, ascultă cum decurge un apel.');
      var card = $('[data-callcard]'), r = card.getBoundingClientRect();
      // pe calculator apelul e deja pe ecran; pe telefon e mai jos și îl aducem în față
      if (r.top < 70 || r.bottom > window.innerHeight) card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      setTimeout(function () { if (!player.playing) startCall(); }, reduce ? 0 : 650);
    });
  });

  /* ---------- „Te sunăm noi" ---------- */
  var cbOpen = $('[data-callback-open]');
  var cbForm = $('[data-callback-form]');
  var cbMsg = $('[data-callback-msg]');
  cbOpen.addEventListener('click', function () {
    cbForm.hidden = false;
    $('input', cbForm).focus();
  });
  cbForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var raw = $('input', cbForm).value.replace(/[\s.\-()]/g, '');
    cbMsg.hidden = false;
    if (!/^(\+?40|0)7\d{8}$/.test(raw)) {
      cbMsg.textContent = 'Scrie un număr de mobil, de forma 07xx xxx xxx.';
      return;
    }
    if (!CALLBACK_URL) {
      cbMsg.textContent = 'Formularul pornește la lansare. Până atunci, ascultă cum decurge un apel cu asistentul.';
      return;
    }
    cbMsg.textContent = 'Se trimite…';
    fetch(CALLBACK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telefon: raw }) })
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        cbMsg.textContent = 'Gata. Te sunăm în cel mult un minut.';
      })
      .catch(function () { cbMsg.textContent = 'Nu s-a trimis. Încearcă din nou peste câteva secunde.'; });
  });

  /* ---------- Harta ---------- */
  var DATA = window.EV_ROUTES;
  var stage = $('[data-stage]');
  var mapEl = $('#map');
  var map = null;
  var home = DATA && DATA.home;
  var trucks = [];
  var ion = null;
  var routeAhead, routeDone, homeEl, radarEl, ticketEl;
  var step = 0;          // pasul activ: 0 = deschiderea, 1–5 = „Cum funcționează"
  var heroIon = { t: 0, from: 0, to: 0, start: 0, dur: 0 }; // Ion pornit de apelul din deschidere

  function dist(a, b) {
    var dy = (b[0] - a[0]) * 111320;
    var dx = (b[1] - a[1]) * 111320 * Math.cos(a[0] * Math.PI / 180);
    return Math.sqrt(dx * dx + dy * dy);
  }
  function prep(pts) {
    var cum = [0];
    for (var i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
    return { pts: pts, cum: cum, len: cum[cum.length - 1] };
  }
  // punctul de pe traseu la fracția t, plus indexul segmentului (pentru partea parcursă)
  function along(P, t) {
    var s = clamp(t, 0, 1) * P.len;
    var lo = 0, hi = P.cum.length - 1;
    while (lo < hi - 1) { var mid = (lo + hi) >> 1; if (P.cum[mid] <= s) lo = mid; else hi = mid; }
    var seg = P.cum[hi] - P.cum[lo] || 1;
    var f = (s - P.cum[lo]) / seg;
    var a = P.pts[lo], b = P.pts[hi];
    return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], i: lo };
  }

  function divIcon(html) { return L.divIcon({ className: 'mk', html: html, iconSize: [0, 0], iconAnchor: [0, 0] }); }

  function initMap() {
    if (!window.L || !DATA) return;
    map = L.map(mapEl, {
      zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, touchZoom: false,
      doubleClickZoom: false, boxZoom: false, keyboard: false, zoomSnap: 0, inertia: false
    });
    // deschiderea: orașul de sus, apoi coborâm la client (vederea trebuie pusă înainte de pini — Leaflet nu-i desenează fără ea)
    map.setView(home, narrow() ? 10.8 : 11.4, { animate: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, keepBuffer: 4 }).addTo(map);

    routeAhead = L.polyline([], { className: 'route-ahead', interactive: false }).addTo(map);
    routeDone = L.polyline([], { className: 'route-done', interactive: false }).addTo(map);

    var homeMarker = L.marker(home, {
      icon: divIcon('<div class="home"><span class="radar"></span><i class="pulse"></i><i class="dot"></i><span class="tag">Tu · Str. Florilor 12</span>' +
        '<div class="ticket"><small>Fosă septică · 6 m³</small><b>450 <span>lei</span></b><p>Azi, 10:30 · vine Ion</p><p class="ok">Programare confirmată</p></div></div>'),
      zIndexOffset: 1000, interactive: false, keyboard: false
    }).addTo(map);
    homeEl = homeMarker.getElement();
    radarEl = $('.radar', homeEl);
    ticketEl = $('.ticket', homeEl);

    DATA.trucks.forEach(function (t) {
      var cls = t.state === 'la o fosă' ? 'is-busy' : t.state === 'pe drum' ? 'is-moving' : 'is-free';
      if (t.id === 'ion') cls += ' is-best';
      var m = L.marker(t.at, { icon: divIcon('<div class="truck ' + cls + '"><i class="dot"></i><span class="tag"></span></div>'), interactive: false, keyboard: false, zIndexOffset: t.id === 'ion' ? 900 : 0 }).addTo(map);
      var el = m.getElement();
      var o = {
        data: t, marker: m, el: $('.truck', el), tag: $('.tag', el),
        path: t.path ? prep(t.path) : null,
        loop: t.loop ? prep(t.loop) : null,
        s: Math.random() * 1000, t: 0
      };
      trucks.push(o);
      if (t.id === 'ion') ion = o;
    });

    var free = DATA.trucks.filter(function (t) { return t.state === 'liber'; }).length;
    $$('[data-free-count]').forEach(function (el) { el.textContent = String(free); });

    applyStep(0, false);
    map.on('zoom', sizeRadar);
    loop();
  }

  /* încadrare: punctul țintă cade în mijlocul zonei libere (fără panoul de text) */
  // zona din ecran în care se vede harta; etichetele camioanelor ies la dreapta, de aceea marginea din dreapta e mai lată
  function freeRect() {
    var s = map.getSize(), W = s.x, H = s.y;
    if (narrow()) {
      if (step === 0) return { x0: 0, y0: H * 0.6, x1: W, y1: H * 0.94 };
      if (step === 5) return { x0: W * 0.04, y0: H * 0.14, x1: W * 0.5, y1: H * 0.6 };
      if (step === 3 || step === 4) return { x0: W * 0.08, y0: H * 0.3, x1: W * 0.62, y1: H * 0.62 };
      return { x0: W * 0.06, y0: H * 0.14, x1: W * 0.76, y1: H * 0.6 };
    }
    if (step === 0) {
      if (W >= 1360) return { x0: W * 0.5, y0: H * 0.14, x1: W * 0.78, y1: H * 0.78 };
      // ecrane mai mici: între text și marginea din dreapta, deasupra apelului
      var h = $('.hero').getBoundingClientRect(), c = $('.hero-copy').getBoundingClientRect(), k = $('[data-callcard]').getBoundingClientRect();
      return { x0: c.right + 24, y0: 90, x1: W - 24, y1: Math.max(300, k.top - h.top - 24) };
    }
    if (step === 3 || step === 4) return { x0: W * 0.46, y0: H * 0.22, x1: W * 0.86, y1: H * 0.9 };
    return { x0: W * 0.42, y0: H * 0.14, x1: W * 0.9, y1: H * 0.9 };
  }
  function centerFor(target, zoom) {
    var s = map.getSize(), r = freeRect();
    var dx = (r.x0 + r.x1) / 2 - s.x / 2, dy = (r.y0 + r.y1) / 2 - s.y / 2;
    return map.unproject(map.project(target, zoom).subtract([dx, dy]), zoom);
  }
  function go(target, zoom, instant) {
    var c = centerFor(target, zoom);
    if (instant || reduce) map.setView(c, zoom, { animate: false });
    else map.flyTo(c, zoom, { duration: 1.5, easeLinearity: 0.25 });
  }
  function goBounds(bounds, instant) {
    var s = map.getSize(), r = freeRect();
    var pad = L.point(s.x - (r.x1 - r.x0) + 40, s.y - (r.y1 - r.y0) + 40);
    var z = Math.min(map.getBoundsZoom(bounds, false, pad), 16);
    go(bounds.getCenter(), z, instant);
  }
  function mpp(zoom) { return 156543.03 * Math.cos(home[0] * Math.PI / 180) / Math.pow(2, zoom); }
  var radarMeters = 0;
  function sizeRadar() {
    if (!radarMeters) return;
    var d = 2 * radarMeters / mpp(map.getZoom());
    radarEl.style.width = radarEl.style.height = d.toFixed(0) + 'px';
  }

  function label(o, text) { if (o.tag.textContent !== text) o.tag.textContent = text; }
  function baseLabels() {
    trucks.forEach(function (o) {
      if (o === ion) label(o, 'Ion · ' + etaMin(ion.t) + ' min');
      else label(o, o.data.state);
    });
  }
  function etaMin(t) { return Math.max(0, Math.ceil(ion.data.toHome.min * (1 - t))); }

  function setRoute(show, t) {
    if (!show) { routeAhead.setLatLngs([]); routeDone.setLatLngs([]); return; }
    var a = along(ion.path, t);
    routeDone.setLatLngs(t > 0 ? ion.path.pts.slice(0, a.i + 1).concat([a.p]) : []);
    routeAhead.setLatLngs(t < 1 ? [a.p].concat(ion.path.pts.slice(a.i + 1)) : []);
  }

  function applyStep(n, instant) {
    step = n;
    stage.setAttribute('data-step', String(n));
    if (!map) return;
    mapEl.classList.toggle('lbl-off', n === 1);
    mapEl.classList.toggle('only-best', n >= 3);
    radarEl.classList.toggle('is-on', n === 2 && !reduce);
    ticketEl.classList.toggle('is-on', n === 3 || (n === 0 && player.quoted));
    ticketEl.classList.toggle('is-confirmed', n === 3 ? false : player.confirmed);

    if (n === 0) {
      ion.t = heroIon.t;
      baseLabels();
      go(home, narrow() ? 12.4 : 13.1, instant);
    } else if (n === 1) {
      ion.t = 0;
      go(home, 15.4, instant);
    } else if (n === 2) {
      ion.t = 0;
      radarMeters = 0;
      var b = L.latLngBounds([home]);
      trucks.forEach(function (o) {
        b.extend(o.marker.getLatLng());
        if (o.data.state === 'liber') radarMeters = Math.max(radarMeters, dist(home, [o.marker.getLatLng().lat, o.marker.getLatLng().lng]));
        if (o === ion) label(o, 'Ion · ' + o.data.toHome.min + ' min · cel mai aproape');
        else label(o, o.data.state === 'liber' ? o.data.toHome.min + ' min' : o.data.state);
      });
      radarMeters *= 1.08;
      sizeRadar();
      goBounds(b, instant);
    } else if (n === 3 || n === 4) {
      if (n === 3) ion.t = 0;
      label(ion, 'Ion · ' + etaMin(ion.t) + ' min');
      goBounds(L.latLngBounds(ion.path.pts).extend(home), instant);
    } else if (n === 5) {
      ion.t = 1;
      label(ion, 'Ion a ajuns');
      go(home, 16, instant);
    }
    ion.el.classList.toggle('is-arrived', ion.t >= 1);
    setRoute(n === 0 || n >= 3, ion.t);
    if (n === 4) scrub();
    playShot(n === 5);
  }

  /* mișcarea: camioanele libere se plimbă pe străzile lor, Ion merge pe traseul spre client */
  var running = false, stageVisible = true, last = 0;
  var SPEED = 46; // m/s pe hartă — accelerat, ca mișcarea să se vadă
  function frame(now) {
    if (!running) return;
    var dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    trucks.forEach(function (o) {
      if (o === ion || !o.loop || reduce) return;
      o.s = (o.s + SPEED * dt) % o.loop.len;
      o.marker.setLatLng(along(o.loop, o.s / o.loop.len).p);
    });
    if (heroIon.dur && step === 0) {
      var k = clamp((now - heroIon.start) / heroIon.dur, 0, 1);
      heroIon.t = heroIon.from + (heroIon.to - heroIon.from) * k;
      if (k >= 1) heroIon.dur = 0;
      ion.t = heroIon.t;
      label(ion, ion.t >= 1 ? 'Ion a ajuns' : 'Ion · ' + etaMin(ion.t) + ' min');
      ion.el.classList.toggle('is-arrived', ion.t >= 1);
      setRoute(true, ion.t);
    }
    ion.marker.setLatLng(along(ion.path, ion.t).p);
    requestAnimationFrame(frame);
  }
  function loop() {
    var want = stageVisible && !document.hidden;
    if (want && !running) { running = true; last = 0; requestAnimationFrame(frame); }
    else if (!want) running = false;
  }
  document.addEventListener('visibilitychange', loop);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { stageVisible = es[0].isIntersecting; loop(); }).observe(stage);
  }

  /* pașii: cel care trece prin mijlocul ecranului e activ */
  var stepEls = [$('.hero')].concat($$('.step'));
  if ('IntersectionObserver' in window) {
    var sio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var n = e.target.classList.contains('hero') ? 0 : Number(e.target.getAttribute('data-step-n'));
        if (n !== step) applyStep(n);
      });
    }, { rootMargin: '-50% 0px -50% 0px' });
    stepEls.forEach(function (el) { sio.observe(el); });
  }

  /* pasul 4: autovidanja înaintează odată cu derularea */
  var step4 = $('.step[data-step-n="4"]');
  var etaEl = $('[data-eta]');
  var scrollTick = false;
  function scrub() {
    var r = step4.getBoundingClientRect(), vh = window.innerHeight;
    var t = clamp((vh * 0.5 - r.top) / (r.height - vh * 0.6), 0, 1);
    ion.t = t;
    var eta = etaMin(t);
    label(ion, t >= 1 ? 'Ion a ajuns' : 'Ion · ' + eta + ' min');
    ion.el.classList.toggle('is-arrived', t >= 1);
    etaEl.textContent = t >= 1 ? 'acum' : eta + ' min';
    setRoute(true, t);
  }
  window.addEventListener('scroll', function () {
    if (scrollTick || step !== 4 || !map) return;
    scrollTick = true;
    requestAnimationFrame(function () { scrollTick = false; if (step === 4) scrub(); });
  }, { passive: true });

  /* telefonul echipajului la pasul 5 */
  var shot = $('[data-phone-shot] video');
  function playShot(on) {
    if (!shot) return;
    if (on) {
      if (!shot.getAttribute('src')) shot.src = shot.getAttribute('data-src');
      if (!reduce) { var p = shot.play(); if (p && p.catch) p.catch(function () {}); }
    } else if (!shot.paused) shot.pause();
  }

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (map) { map.invalidateSize(); applyStep(step, true); } }, 150);
  });

  /* ---------- Apelul ---------- */
  var card = $('[data-callcard]');
  var playBtn = $('[data-call-play]');
  var linesEl = $('[data-call-lines]');
  var okEl = $('[data-call-ok]');
  var waveEl = $('[data-wave]');
  var player = { playing: false, t: 0, shown: -1, quoted: false, confirmed: false, departed: false, audio: null, raf: 0, last: 0 };
  var BARS = 52;
  var bars = [];
  for (var i = 0; i < BARS; i++) {
    var b = document.createElement('i');
    b.style.setProperty('--h', (22 + 78 * Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23))).toFixed(0) + '%');
    waveEl.appendChild(b);
    bars.push(b);
  }
  $('[data-call-title]').textContent = CALL.audio ? 'Ascultă un apel' : 'Vezi un apel cu asistentul';
  $('[data-call-length]').textContent = Math.floor(CALL.length / 60) + ':' + String(CALL.length % 60).padStart(2, '0');
  playBtn.setAttribute('aria-label', CALL.audio ? 'Ascultă apelul' : 'Pornește apelul');

  function lineEl(l) {
    var p = document.createElement('p');
    p.className = 'cc-line ' + l.who;
    var s = document.createElement('small');
    s.textContent = WHO[l.who];
    p.appendChild(s);
    p.appendChild(document.createTextNode(l.text));
    return p;
  }
  // înainte de pornire: rezumatul apelului (ce cere clientul, ce răspunde asistentul)
  function preview() {
    linesEl.textContent = '';
    linesEl.appendChild(lineEl(CALL.lines[1]));
    linesEl.appendChild(lineEl(CALL.lines[2]));
    okEl.hidden = false;
    bars.forEach(function (b, k) { b.classList.toggle('on', k < BARS * 0.62); b.classList.remove('hot'); });
  }
  preview();

  function renderWave() {
    var at = player.t / CALL.length * BARS;
    bars.forEach(function (b, k) {
      b.classList.toggle('on', k < at);
      b.classList.toggle('hot', player.playing && Math.abs(k - at) < 1.5);
    });
  }
  function tickCall(now) {
    if (!player.playing) return;
    if (player.audio) player.t = player.audio.currentTime;
    else { player.t += player.last ? (now - player.last) / 1000 : 0; player.last = now; }
    while (player.shown + 1 < CALL.lines.length && player.t >= CALL.lines[player.shown + 1].at) {
      player.shown++;
      linesEl.appendChild(lineEl(CALL.lines[player.shown]));
      while (linesEl.children.length > 3) linesEl.removeChild(linesEl.firstChild);
    }
    if (!player.quoted && player.t >= CALL.quoteAt) { player.quoted = true; if (step === 0 && map) ticketEl.classList.add('is-on'); }
    if (!player.confirmed && player.t >= CALL.confirmAt) {
      player.confirmed = true;
      okEl.hidden = false;
      if (step === 0 && map) ticketEl.classList.add('is-confirmed');
    }
    if (!player.departed && player.t >= CALL.departAt) {
      player.departed = true;
      if (map) { heroIon.from = heroIon.t; heroIon.to = 1; heroIon.start = performance.now(); heroIon.dur = reduce ? 1 : 16000; }
    }
    renderWave();
    if (player.t >= CALL.length) { stopCall(true); return; }
    player.raf = requestAnimationFrame(tickCall);
  }
  function startCall() {
    player.t = 0; player.shown = -1; player.last = 0;
    player.quoted = player.confirmed = player.departed = false;
    linesEl.textContent = '';
    okEl.hidden = true;
    if (map) {
      ticketEl.classList.remove('is-on', 'is-confirmed');
      heroIon.t = 0; heroIon.dur = 0;
      if (step === 0) { ion.t = 0; baseLabels(); ion.el.classList.remove('is-arrived'); setRoute(true, 0); }
    }
    if (CALL.audio) {
      if (!player.audio) player.audio = new Audio(CALL.audio);
      player.audio.currentTime = 0;
      var p = player.audio.play();
      if (p && p.catch) p.catch(function () {});
    }
    player.playing = true;
    card.classList.add('is-playing', 'has-run');
    playBtn.setAttribute('aria-label', 'Oprește apelul');
    player.raf = requestAnimationFrame(tickCall);
  }
  function stopCall(finished) {
    player.playing = false;
    cancelAnimationFrame(player.raf);
    if (player.audio) player.audio.pause();
    card.classList.remove('is-playing');
    playBtn.setAttribute('aria-label', CALL.audio ? 'Ascultă din nou' : 'Pornește din nou');
    renderWave();
    if (finished) bars.forEach(function (b) { b.classList.add('on'); });
  }
  playBtn.addEventListener('click', function () { if (player.playing) stopCall(false); else startCall(); });

  /* ---------- Ce vidanjăm + prețuri ---------- */
  function price(s, m3) { return s.flat || s.base + s.perM3 * m3; }
  var list = $('[data-svc-list]');
  SERVICES.forEach(function (s) {
    var li = document.createElement('li');
    li.className = 'svc';
    li.innerHTML = '<h3></h3><p></p><span class="svc-price">de la <b></b></span>';
    $('h3', li).textContent = s.name;
    $('p', li).textContent = s.desc;
    $('b', li).textContent = fmt(price(s, 2)) + ' lei';
    list.appendChild(li);
  });

  var tabs = $('[data-q-tabs]');
  var m3In = $('[data-q-m3]');
  var m3Out = $('[data-q-m3-out]');
  var volEl = $('[data-q-vol]');
  var priceEl = $('[data-q-price]');
  var fromEl = $('[data-q-from]');
  var metaEl = $('[data-q-meta]');
  var current = SERVICES[0];
  var shown = price(current, 6);
  SERVICES.forEach(function (s, k) {
    var bt = document.createElement('button');
    bt.type = 'button';
    bt.className = 'q-tab';
    bt.setAttribute('role', 'radio');
    bt.setAttribute('aria-checked', k === 0 ? 'true' : 'false');
    bt.tabIndex = k === 0 ? 0 : -1;
    bt.textContent = s.name;
    bt.addEventListener('click', function () { pick(s); });
    bt.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      var next = SERVICES[(SERVICES.indexOf(current) + d + SERVICES.length) % SERVICES.length];
      pick(next);
      tabs.children[SERVICES.indexOf(next)].focus();
    });
    tabs.appendChild(bt);
  });
  function pick(s) {
    current = s;
    $$('.q-tab', tabs).forEach(function (bt, k) {
      var on = SERVICES[k] === s;
      bt.setAttribute('aria-checked', on ? 'true' : 'false');
      bt.tabIndex = on ? 0 : -1;
    });
    updateQuote();
  }
  var tween = 0;
  function updateQuote() {
    var m3 = Number(m3In.value);
    m3Out.textContent = m3 + ' m³';
    volEl.hidden = !!current.flat;
    fromEl.hidden = !current.flat;
    metaEl.textContent = current.flat ? 'pentru un cămin sau o porțiune de țeavă' : 'transport și descărcare incluse';
    var to = price(current, m3), from = shown;
    cancelAnimationFrame(tween);
    if (reduce) { shown = to; priceEl.textContent = fmt(to); return; }
    var t0 = 0;
    (function stepTween(now) {
      if (!t0) t0 = now;
      var k = clamp((now - t0) / 280, 0, 1);
      shown = from + (to - from) * (1 - Math.pow(1 - k, 3));
      priceEl.textContent = fmt(shown);
      if (k < 1) tween = requestAnimationFrame(stepTween);
    })(performance.now());
  }
  m3In.addEventListener('input', updateQuote);
  updateQuote();

  /* ---------- Înregistrarea pentru colaboratori: pornește doar când e pe ecran ---------- */
  var webm = document.createElement('video').canPlayType('video/webm; codecs="vp9"') !== '';
  $$('[data-autoplay-visible]').forEach(function (v) {
    if (!('IntersectionObserver' in window)) return;
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) {
          if (!v.getAttribute('src')) v.src = v.getAttribute('data-src') + (webm ? '.webm' : '.mp4');
          if (!reduce) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
        } else if (!v.paused) v.pause();
      });
    }, { threshold: 0.35 }).observe(v);
  });

  /* ---------- Pornirea ---------- */
  initMap();
  setTimeout(function () { doc.classList.add('is-loaded'); }, 60);
})();
