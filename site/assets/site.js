// Plays the muted demo videos while they are on screen, unless the visitor prefers reduced motion.
// Every video keeps its controls, so it can always be paused. Nothing here talks to the network.
(function () {
  var videos = document.querySelectorAll("video[data-autoplay]");
  if (!videos.length || !("IntersectionObserver" in window)) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;
  var paused = new WeakSet();
  videos.forEach(function (v) {
    v.addEventListener("pause", function () { if (!v.dataset.auto) paused.add(v); v.dataset.auto = ""; });
    v.addEventListener("play", function () { paused.delete(v); });
  });
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var v = e.target;
      if (e.isIntersecting && e.intersectionRatio >= 0.5) {
        if (!paused.has(v) && v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
      } else if (!v.paused) {
        v.dataset.auto = "1"; // paused by scrolling away, not by the visitor
        v.pause();
      }
    });
  }, { threshold: [0, 0.5] });
  videos.forEach(function (v) { io.observe(v); });
})();
