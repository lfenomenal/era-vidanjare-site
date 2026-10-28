/* EuroVid — pagina pentru clienți: harta vie, apelul cu asistentul, prețurile. */
(function () {
  'use strict';

  /* ---------- Setări de lansare ---------- */
  // Numărul real se pune în `tel` (ex. '+40372000000'). Cât e gol, butoanele nu sună nicăieri
  // (0372 000 000 poate fi al cuiva) și duc la apelul demonstrativ.
  var PHONE = { display: '0372 000 000', tel: null };
  // Apelul de probă cu asistentul (agent ElevenLabs, în browser, cu microfonul). Cât `id` e gol, butoanele duc la
  // apelul înregistrat de mai jos. Agentul se face cu agent/sync.mjs (vezi agent/README.md); prețurile i le trimitem de aici.
  var AGENT = { id: 'agent_6101m5x2kds2exw8dbrc26dh9zn1', sdk: 'https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.28.0/+esm' };
  // Adresa care primește programările online. Goală = formularul spune că pornește la lansare și nu trimite nimic.
  var BOOKING_URL = null;
  // PREȚURILE EuroVid (lei), de la Mircea, 27 oct 2026. Tot de aici le primește și agentul, la fiecare apel.
  var TRANSPORT = 1600;   // pe cursă: echipa, autovidanja și dusul reziduurilor la eliminare
  var MAX_M3 = 10;        // cât ia o autovidanjă la o cursă
  var MIN_ORE = 2;        // desfundare, decolmatare, inspecție video
  var SERVICES = [
    { id: 'fosa', name: 'Fosă septică', unit: 'm3', rate: 350 },
    { id: 'grasimi', name: 'Separator de grăsimi', unit: 'm3', rate: 800 },
    { id: 'hidrocarburi', name: 'Separator de hidrocarburi', unit: 'm3', rate: 1800 },
    { id: 'desfundare', name: 'Desfundare', unit: 'ora', rate: 600 },
    { id: 'decolmatare', name: 'Spălare și decolmatare', unit: 'ora', rate: 1000 },
    { id: 'cctv', name: 'Inspecție video', unit: 'ora', rate: 1000 }
  ];
  var CLIENT = {
    pf: 'Persoane fizice: venim pe o rază de 100 km (mai departe, când strângem cel puțin 5 vidanjări în zonă). Primești nota de comandă pe SMS și plătești online.',
    pj: 'Firme: venim pe o rază de 200 km. Primești factură, cu plata în 5 zile.'
  };
  // Apelul demonstrativ: asistentul = vocea Microsoft Alina, clientul = Mircea (înregistrat de el; voice/mix2.py).
  // Timpii replicilor (secunde) și forma de undă sunt cei din înregistrare; cu `audio` gol, replicile apar doar ca text.
  var CALL = {
    audio: 'media/apel.mp3?v=4',
    length: 37.3,
    lines: [
      { who: 'ai', at: 0.5, text: 'Bună ziua, EuroVid aici. Cu ce vă pot ajuta?' },
      { who: 'cl', at: 5.02, text: 'Bună ziua. Am o fosă septică de vreo 6 metri cubi, în Ploiești, pe strada Florilor.' },
      { who: 'ai', at: 12.25, text: 'Vă pot trimite un echipaj chiar azi, la 10:30. Pentru 6 m³, prețul este 3.700 de lei, cu transportul inclus. Confirmați programarea?' },
      { who: 'cl', at: 24.21, text: 'Da, confirm.' },
      { who: 'ai', at: 26.21, text: 'Gata, sunteți programat. Ion ajunge la 10:30. Acum vă trimit pe SMS nota de comandă și linkul de plată. O zi bună!' }
    ],
    wave: [77, 98, 94, 35, 64, 80, 38, 22, 97, 75, 100, 87, 83, 84, 89, 86, 47, 95, 83, 66, 82, 69, 18, 91, 67, 87, 81, 63, 80, 46, 60, 83, 81, 46, 92, 36, 66, 74, 87, 24, 83, 97, 75, 33, 84, 95, 82, 78, 70, 18, 87, 26],
    quoteAt: 18.5, confirmAt: 24.7, departAt: 28
  };
  var SPEAKER = { ai: 'Asistentul EuroVid', cl: 'Client' };

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

  /* semnul de derulare duce la primul pas, cu tot ecranul pentru el */
  $('[data-scroll-cue]').addEventListener('click', function (e) {
    e.preventDefault();
    window.scrollTo({ top: window.scrollY + $('#cum').getBoundingClientRect().top, behavior: reduce ? 'auto' : 'smooth' });
  });

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
      var card = $('[data-callcard]'), r = card.getBoundingClientRect();
      // pe calculator apelul e deja pe ecran; pe telefon e mai jos și îl aducem în față
      if (r.top < 70 || r.bottom > window.innerHeight) card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      if (live.status !== 'off') return;
      if (liveReady()) { startLive(); return; }
      toast('Linia se deschide la lansare. Până atunci, ascultă cum decurge un apel.');
      // pornește în același clic: telefoanele lasă sunetul să meargă doar așa
      if (!player.playing) startCall();
    });
  });

  /* ---------- Harta ---------- */
  var DATA = window.EV_ROUTES;
  var stage = $('[data-stage]');
  var mapEl = $('#map');
  var map = null;
  var home = DATA && DATA.home;
  var trucks = [];
  var ion = null;
  var routeAhead, routeDone, homeEl, radarEl, ticketEl, homeTagEl;
  var ticketHtml = '', homeTag = ''; // bilețelul și eticheta apelului înregistrat, refăcute după un apel de probă
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
        '<div class="ticket"><small>Fosă septică · 6 m³</small><b>3.700 <span>lei</span></b><p>Azi, 10:30 · vine Ion</p><p class="ok">Programare confirmată</p></div></div>'),
      zIndexOffset: 1000, interactive: false, keyboard: false
    }).addTo(map);
    homeEl = homeMarker.getElement();
    radarEl = $('.radar', homeEl);
    ticketEl = $('.ticket', homeEl);
    homeTagEl = $('.tag', homeEl);
    ticketHtml = ticketEl.innerHTML;
    homeTag = homeTagEl.textContent;

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
    b.style.setProperty('--h', (CALL.wave ? CALL.wave[i] : 22 + 78 * Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23))).toFixed(0) + '%');
    waveEl.appendChild(b);
    bars.push(b);
  }
  var titleEl = $('[data-call-title]');
  var subEl = $('[data-call-length]').parentNode;
  var okText = okEl.lastChild.textContent;
  titleEl.textContent = CALL.audio ? 'Ascultă un apel' : 'Vezi un apel cu asistentul';
  var secs = Math.round(CALL.length);
  $('[data-call-length]').textContent = mmss(secs);
  var subHtml = subEl.innerHTML;
  playBtn.setAttribute('aria-label', CALL.audio ? 'Ascultă apelul' : 'Pornește apelul');
  function mmss(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  function lineEl(l) {
    var p = document.createElement('p');
    p.className = 'cc-line ' + l.who;
    var s = document.createElement('small');
    s.textContent = l.label || SPEAKER[l.who];
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
    if (player.t >= CALL.length || (player.audio && player.audio.ended)) { stopCall(true); return; }
    player.raf = requestAnimationFrame(tickCall);
  }
  function startCall() {
    player.t = 0; player.shown = -1; player.last = 0;
    player.quoted = player.confirmed = player.departed = false;
    linesEl.textContent = '';
    okEl.hidden = true;
    okEl.lastChild.textContent = okText;
    if (map) {
      ticketEl.innerHTML = ticketHtml;
      homeTagEl.textContent = homeTag;
      ticketEl.classList.remove('is-on', 'is-confirmed');
      heroIon.t = 0; heroIon.dur = 0;
      if (step === 0) { ion.t = 0; baseLabels(); ion.el.classList.remove('is-arrived'); setRoute(true, 0); }
    }
    if (CALL.audio) {
      if (!player.audio) { player.audio = new Audio(CALL.audio); player.audio.preload = 'auto'; }
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
  playBtn.addEventListener('click', function () {
    if (live.status !== 'off') endLive();
    else if (player.playing) stopCall(false);
    else startCall();
  });

  /* ---------- Apelul de probă: vorbești cu asistentul ---------- */
  var live = { status: 'off', conv: null, sdk: null, failed: false, t0: 0, raf: 0, last: 0, shownSec: -1, levels: [] };
  function liveReady() {
    return !!(AGENT.id && !live.failed && window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }
  function loadSdk() {
    if (!live.sdk) live.sdk = import(AGENT.sdk);
    return live.sdk;
  }
  // prețurile pentru agent, din aceleași constante ca pagina; prima linie bate exemplele vechi din prompt până la sync
  function preturi() {
    var ex = SERVICES[0], ore = SERVICES[3];
    return [
      'ACESTEA SUNT PREȚURILE ACTUALE ȘI ÎNLOCUIESC ORICE ALT PREȚ, EXEMPLU SAU REGULĂ DE CALCUL DIN INSTRUCȚIUNI.',
      'Transport: ' + TRANSPORT + ' lei pe fiecare cursă (echipa, autovidanja și dusul reziduurilor la eliminare). O autovidanjă ia cel mult ' + MAX_M3 + ' metri cubi la o cursă; ce trece peste se face cu încă o cursă și încă un transport.'
    ].concat(SERVICES.map(function (s) {
      return s.unit === 'm3'
        ? 'Vidanjare ' + s.name.toLowerCase() + ': ' + s.rate + ' lei pe metru cub.'
        : s.name + ': ' + s.rate + ' lei pe oră, minim ' + MIN_ORE + ' ore.';
    })).concat([
      'Calcul la vidanjare: curse × ' + TRANSPORT + ' + metri cubi × prețul pe metru cub. Exemplu: ' + ex.name.toLowerCase() + ' de 6 metri cubi = ' + TRANSPORT + ' + 6 × ' + ex.rate + ' = ' + quote(ex, 6).total + ' de lei.',
      'Calcul la desfundare, decolmatare și inspecție video: un transport de ' + TRANSPORT + ' lei + ore × prețul pe oră, minim ' + MIN_ORE + ' ore; ce trece peste se adaugă. Exemplu: desfundare 2 ore = ' + quote(ore, 2).total + ' de lei.',
      'Reparații, înlocuiri de fose sau bazine, igienizarea subsolurilor și întreținerea canalizării: preț după evaluare la fața locului; nu dai o sumă.',
      CLIENT.pf.replace('Primești', 'Primesc').replace('plătești', 'plătesc'),
      CLIENT.pj.replace('Primești', 'Primesc'),
      'Abonament anual, doar pentru persoane fizice: 3500 de lei pe an, 3 intervenții (vidanjare sau desfundare) plus un tratament cu enzime.'
    ]).join('\n');
  }
  function acum() {
    try {
      return new Date().toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return new Date().toLocaleString('ro-RO'); }
  }
  function liveLine(who, text) {
    linesEl.appendChild(lineEl({ who: who, text: text, label: who === 'cl' ? 'Tu' : null }));
    while (linesEl.children.length > 3) linesEl.removeChild(linesEl.firstChild);
  }

  function startLive() {
    if (player.playing) stopCall(false);
    live.status = 'connecting';
    live.shownSec = -1;
    linesEl.textContent = '';
    okEl.hidden = true;
    card.classList.add('is-live', 'has-run');
    titleEl.textContent = 'Se conectează…';
    subEl.textContent = 'Apel de probă · nu pleacă nicio mașină';
    playBtn.setAttribute('aria-label', 'Închide apelul');
    toast('Apel de probă cu asistentul. Permite microfonul și vorbește ca la telefon.');
    var best = DATA && DATA.trucks.filter(function (t) { return t.id === 'ion'; })[0];
    loadSdk().then(function (m) {
      if (live.status !== 'connecting') return null; // a închis înainte să se conecteze
      return m.Conversation.startSession({
        agentId: AGENT.id,
        connectionType: 'webrtc',
        dynamicVariables: {
          preturi: preturi(),
          acum: acum(),
          sofer: best ? best.name : 'Ion',
          minute_sosire: best ? best.toHome.min : 7
        },
        clientTools: { arata_comanda: showOrder },
        onConnect: function () {
          if (live.status !== 'connecting') return;
          live.status = 'on';
          live.t0 = performance.now();
          titleEl.textContent = 'Vorbești cu asistentul';
        },
        onMessage: function (msg) {
          // când omul tace, ElevenLabs trimite „...” drept replica lui
          if (msg.message && !/^[\s.…]*$/.test(msg.message)) liveLine(msg.source === 'ai' ? 'ai' : 'cl', msg.message);
        },
        onModeChange: function (m) { bars.forEach(function (b) { b.classList.toggle('on', m.mode === 'speaking'); }); },
        onDisconnect: function (d) { liveEnded(d && d.reason === 'error'); }
      });
    }).then(function (conv) {
      if (!conv) return;
      live.conv = conv;
      if (live.status === 'off') { conv.endSession(); return; }
      live.levels = bars.map(function () { return 0; });
      live.raf = requestAnimationFrame(tickLive);
    }).catch(function (err) {
      liveEnded(true, err && err.name === 'NotAllowedError');
    });
  }
  function endLive() {
    if (live.conv) live.conv.endSession();
    else liveEnded(false);
  }
  // după apel rămân pe ecran replicile și comanda; butonul revine la apelul înregistrat
  function liveEnded(failed, noMic) {
    if (live.status === 'off') return;
    var wasOn = live.status === 'on';
    live.status = 'off';
    live.conv = null;
    cancelAnimationFrame(live.raf);
    card.classList.remove('is-live');
    bars.forEach(function (b, k) {
      b.classList.remove('on');
      b.style.setProperty('--h', (CALL.wave ? CALL.wave[k] : 50) + '%');
    });
    titleEl.textContent = CALL.audio ? 'Ascultă un apel' : 'Vezi un apel cu asistentul';
    subEl.innerHTML = subHtml;
    playBtn.setAttribute('aria-label', CALL.audio ? 'Ascultă apelul' : 'Pornește apelul');
    if (noMic) { toast('Fără microfon nu putem vorbi. Ascultă cum decurge un apel.'); return; }
    if (failed && !wasOn) {
      // asistentul nu răspunde (de ex. s-au terminat minutele de probă): de acum butoanele duc la înregistrare
      live.failed = true;
      toast('Asistentul nu e disponibil acum. Ascultă cum decurge un apel.');
      startCall();
    }
  }
  function tickLive(now) {
    if (live.status === 'off') return;
    var c = live.conv;
    if (live.status === 'on') {
      var sec = Math.floor((now - live.t0) / 1000);
      if (sec !== live.shownSec) { live.shownSec = sec; subEl.textContent = 'Apel de probă · ' + mmss(sec); }
    }
    if (c && !reduce && now - live.last > 70) {
      live.last = now;
      live.levels.push(Math.max(c.getOutputVolume() || 0, c.getInputVolume() || 0));
      live.levels.shift();
      bars.forEach(function (b, k) { b.style.setProperty('--h', (14 + 86 * Math.min(1, live.levels[k] * 2.4)).toFixed(0) + '%'); });
    }
    live.raf = requestAnimationFrame(tickLive);
  }
  // unealta agentului, chemată după ce omul confirmă: comanda apare pe hartă, ca la apelul înregistrat
  function showOrder(p) {
    p = p || {};
    var now = !p.ora || /^acum$/i.test(String(p.ora).trim());
    var who = (DATA && DATA.trucks.filter(function (t) { return t.id === 'ion'; })[0] || { name: 'Ion' }).name;
    okEl.lastChild.textContent = 'Programare confirmată · ' + who + (now ? ' pleacă spre tine' : ' vine la ' + p.ora);
    okEl.hidden = false;
    if (!map) return;
    var m3 = Number(p.metri_cubi) || 0;
    $('small', ticketEl).textContent = (p.serviciu || 'Vidanjare') + (m3 ? ' · ' + m3 + ' m³' : '');
    $('b', ticketEl).firstChild.textContent = fmt(Number(p.pret_lei) || 0) + ' ';
    $('p', ticketEl).textContent = (now ? 'Acum' : p.ora) + ' · vine ' + who;
    if (p.adresa) homeTagEl.textContent = 'Tu · ' + p.adresa;
    player.quoted = player.confirmed = true;
    if (step === 0) ticketEl.classList.add('is-on', 'is-confirmed');
    if (now) {
      heroIon.t = 0;
      heroIon.from = 0; heroIon.to = 1; heroIon.start = performance.now(); heroIon.dur = reduce ? 1 : 16000;
    }
  }
  // biblioteca se încarcă din timp: pe iPhone sunetul trebuie deblocat chiar la atingerea butonului
  if (liveReady()) window.addEventListener('load', function () { setTimeout(function () { loadSdk().catch(function () { live.failed = true; }); }, 1200); });

  /* ---------- Prețuri: calculul, pentru exemplele agentului (pe pagină nu mai apar) ---------- */
  // vidanjare: transport pe fiecare cursă (max 10 m³ la o cursă) + m³ × tarif
  // desfundare, decolmatare, inspecție: un transport + ore × tarif, minim 2 ore
  function quote(s, qty) {
    if (s.unit === 'm3') {
      var curse = Math.max(1, Math.ceil(qty / MAX_M3));
      return { total: curse * TRANSPORT + qty * s.rate, rows: [
        ['Transport', curse + (curse === 1 ? ' cursă' : ' curse') + ' × ' + fmt(TRANSPORT) + ' lei', curse * TRANSPORT],
        ['Vidanjare', qty + ' m³ × ' + fmt(s.rate) + ' lei', qty * s.rate]
      ] };
    }
    var ore = Math.max(MIN_ORE, qty);
    return { total: TRANSPORT + ore * s.rate, rows: [
      ['Transport echipă', '1 cursă × ' + fmt(TRANSPORT) + ' lei', TRANSPORT],
      [s.name, ore + ' ore × ' + fmt(s.rate) + ' lei', ore * s.rate]
    ] };
  }

  /* ---------- Programare intervenție ---------- */
  var book = $('[data-book]');
  var bookMsg = $('[data-book-msg]');
  var cuiRow = $('[data-b-cui]');
  var nameLabel = $('[data-b-name-label]');
  function bookWho() {
    var pj = $('#b-pj').checked;
    cuiRow.hidden = !pj;
    nameLabel.textContent = pj ? 'Numele firmei' : 'Nume și prenume';
    $('#b-name').autocomplete = pj ? 'organization' : 'name';
  }
  $$('input[name="tip"]', book).forEach(function (r) { r.addEventListener('change', bookWho); });
  bookWho();
  $$('[data-plan]').forEach(function (a) {
    a.addEventListener('click', function () { $('#b-pf').checked = true; bookWho(); $('#b-svc').value = 'abonament'; });
  });
  function bookError(field, msg) {
    bookMsg.className = 'b-msg is-err';
    bookMsg.textContent = msg;
    field.setAttribute('aria-invalid', 'true');
    field.focus();
  }
  book.addEventListener('input', function (e) { if (e.target.removeAttribute) e.target.removeAttribute('aria-invalid'); });
  book.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('#b-name'), phone = $('#b-phone'), loc = $('#b-loc'), svc = $('#b-svc');
    var tel = phone.value.replace(/[\s.\-()]/g, '');
    if (name.value.trim().length < 3) return bookError(name, $('#b-pj').checked ? 'Scrie numele firmei.' : 'Scrie numele și prenumele.');
    if (!/^(\+?40|0)\d{9}$/.test(tel)) return bookError(phone, 'Scrie un număr de telefon, de forma 07xx xxx xxx.');
    if (loc.value.trim().length < 8) return bookError(loc, 'Scrie locația completă: localitatea, strada, numărul.');
    if (!svc.value) return bookError(svc, 'Alege ce ai nevoie.');
    if (svc.value === 'abonament' && $('#b-pj').checked) return bookError(svc, 'Abonamentul anual e pentru persoane fizice. Pentru firme, alege intervenția de care ai nevoie.');
    if (!BOOKING_URL) {
      bookMsg.className = 'b-msg';
      bookMsg.textContent = 'Programarea online pornește la lansarea EuroVid. Datele tale nu au fost trimise nicăieri.';
      return;
    }
    bookMsg.className = 'b-msg';
    bookMsg.textContent = 'Se trimite…';
    var data = {};
    new FormData(book).forEach(function (v, k) { data[k] = v; });
    fetch(BOOKING_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        book.reset(); bookWho();
        bookMsg.textContent = 'Am primit programarea. Te sună asistentul să confirme prețul și ora.';
      })
      .catch(function () { bookMsg.className = 'b-msg is-err'; bookMsg.textContent = 'Nu s-a trimis. Încearcă din nou peste câteva secunde.'; });
  });

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
