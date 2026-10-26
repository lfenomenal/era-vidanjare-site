/* EuroVid — site de prezentare: deschiderea, ziua de lucru, fișa din birou. */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var body = document.body;

  /* ---------- Deschiderea: ceața se ridică, titlul urcă ---------- */
  var heroVideo = document.querySelector('.hero-video');
  var loaded = false;
  function reveal() {
    if (loaded) return;
    loaded = true;
    // un cadru de pauză ca tranziția să pornească din starea inițială (nu din rAF: în tab-uri ascunse nu rulează)
    setTimeout(function () { body.classList.add('is-loaded'); }, 30);
  }
  if (heroVideo) {
    if (heroVideo.readyState >= 2) reveal();
    heroVideo.addEventListener('canplay', reveal, { once: true });
    var p = heroVideo.play && heroVideo.play();
    if (p && p.catch) p.catch(function () { /* autoplay blocat: rămâne posterul */ });
  }
  setTimeout(reveal, 1200);

  /* ---------- Bara de sus devine plină după deschidere ---------- */
  var top = document.querySelector('[data-top]');
  var hero = document.querySelector('[data-hero]');
  var heroMedia = document.querySelector('[data-hero-media]');
  var heroCopy = document.querySelector('[data-hero-copy]');

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var y = window.scrollY;
      var h = hero ? hero.offsetHeight : 600;
      if (top) top.classList.toggle('is-solid', y > h * 0.72);
      if (!reduce && y < h * 1.1) {
        if (heroMedia) heroMedia.style.transform = 'translate3d(0,' + (y * 0.32).toFixed(1) + 'px,0)';
        if (heroCopy) {
          heroCopy.style.transform = 'translate3d(0,' + (y * -0.12).toFixed(1) + 'px,0)';
          heroCopy.style.opacity = String(Math.max(0, 1 - y / (h * 0.75)));
        }
      }
      panOffice();
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- O zi de lucru: pasul activ schimbă clipul ---------- */
  // Segmentele din înregistrarea de pe telefon (secunde). Fiecare pas rulează în buclă doar partea lui.
  var SEGMENTS = {
    'teren-a': { video: 'teren', from: 0, to: 8 },
    'teren-b': { video: 'teren', from: 8, to: 18 },
    'teren-c': { video: 'teren', from: 18, to: null }
  };
  var webm = document.createElement('video').canPlayType('video/webm; codecs="vp9"') !== '';

  var videos = {};
  document.querySelectorAll('[data-clip-video]').forEach(function (v) { videos[v.getAttribute('data-clip-video')] = v; });
  var frames = {};
  document.querySelectorAll('[data-frame-el]').forEach(function (f) { frames[f.getAttribute('data-frame-el')] = f; });

  function ensureSrc(v) {
    if (v.getAttribute('src')) return;
    var name = v.getAttribute('data-clip-video');
    v.src = 'media/' + name + (webm ? '.webm' : '.mp4');
    v.preload = 'auto';
  }

  var current = null;
  var segment = null;

  function activate(step) {
    var clip = step.getAttribute('data-clip');
    var frameName = step.getAttribute('data-frame');
    if (current === clip) return;
    current = clip;

    document.querySelectorAll('.step').forEach(function (s) { s.classList.toggle('is-active', s === step); });
    Object.keys(frames).forEach(function (k) { frames[k].classList.toggle('is-hidden', k !== frameName); });

    segment = SEGMENTS[clip] || { video: clip, from: 0, to: null };
    var v = videos[segment.video];
    Object.keys(videos).forEach(function (k) {
      var other = videos[k];
      var on = other === v;
      other.classList.toggle('is-on', on);
      if (!on && !other.paused) other.pause();
    });
    if (!v) return;
    ensureSrc(v);
    if (reduce) return;
    var start = function () {
      try { v.currentTime = segment.from; } catch (e) { /* încă nu are metadate */ }
      var pr = v.play();
      if (pr && pr.catch) pr.catch(function () {});
    };
    if (v.readyState >= 1) start(); else v.addEventListener('loadedmetadata', start, { once: true });
  }

  // „Camera" din clipurile de desktop: se apropie de locul unde se întâmplă acțiunea.
  // [secunda, zoom, origine X %, origine Y %] — potrivite pe înregistrările reale.
  var CAMERA = {
    dispatch: [[0, 1, 50, 50], [1.1, 1.75, 22, 46], [3.3, 1.45, 56, 56], [5.5, 1.85, 93, 70], [7.6, 1.9, 93, 22], [9, 1.5, 92, 8], [10.8, 1, 50, 50]],
    birou: [[0, 1, 50, 50], [1.7, 1.45, 40, 52], [3.6, 1.7, 30, 66], [6.2, 1.45, 78, 46], [9.4, 1.35, 40, 70], [12, 1, 50, 50]]
  };
  function aim(v) {
    var keys = CAMERA[v.getAttribute('data-clip-video')];
    if (!keys || reduce) return;
    var k = keys[0];
    for (var i = 0; i < keys.length; i++) if (v.currentTime >= keys[i][0]) k = keys[i];
    var want = k.join(',');
    if (v._aim === want) return;
    v._aim = want;
    v.style.transformOrigin = k[2] + '% ' + k[3] + '%';
    v.style.transform = 'scale(' + k[1] + ')';
  }

  Object.keys(videos).forEach(function (k) {
    var v = videos[k];
    v.addEventListener('timeupdate', function () {
      aim(v);
      if (!segment || videos[segment.video] !== v || reduce) return;
      var end = segment.to == null ? v.duration - 0.05 : segment.to;
      if (v.currentTime >= end) v.currentTime = segment.from;
    });
    v.addEventListener('ended', function () {
      if (!segment || reduce) return;
      v.currentTime = segment.from;
      v.play();
    });
  });

  var steps = Array.prototype.slice.call(document.querySelectorAll('.step'));
  if ('IntersectionObserver' in window && steps.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) activate(e.target); });
    }, {
      // pe telefon textul pasului stă în jumătatea de jos (sus e ecranul), deci linia de activare coboară
      rootMargin: window.matchMedia('(max-width: 900px)').matches ? '-72% 0px -24% 0px' : '-48% 0px -48% 0px'
    });
    steps.forEach(function (s) { io.observe(s); });

    // Încarcă clipurile din timp, când secțiunea se apropie.
    var day = document.querySelector('.day');
    var pre = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) {
        Object.keys(videos).forEach(function (k) { ensureSrc(videos[k]); });
        pre.disconnect();
      }
    }, { rootMargin: '900px 0px' });
    if (day) pre.observe(day);
  } else if (steps[0]) {
    activate(steps[0]);
  }
  if (steps[0]) activate(steps[0]);

  /* ---------- Fișa din birou: pan lent la derulare ---------- */
  var pan = document.querySelector('[data-pan]');
  function panOffice() {
    if (!pan || reduce) return;
    var r = pan.getBoundingClientRect();
    var vh = window.innerHeight;
    var p = (vh - r.top) / (vh + r.height);
    p = Math.min(1, Math.max(0, p));
    // imaginea e mai înaltă decât rama (16:9); la derulare o plimbăm de sus până jos
    pan.style.setProperty('--pan', (-p * 25).toFixed(2) + '%');
  }
  onScroll();
})();
