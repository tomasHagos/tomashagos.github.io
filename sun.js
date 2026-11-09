/*
 * Loaded first, in <head>, before anything is drawn.
 *
 * 1. Day / night: where the sun is in Winnipeg right now, worked out from the
 *    date and time (no network needed). The time on the visitor's own clock
 *    doesn't matter: it's always Winnipeg's sky.
 *      PortfolioSun.daylight()  1 = full day, 0 = night, in between at dawn/dusk
 *      ?time=day | night | dusk   forces one for previewing
 *
 * 2. Boot: decides 2D vs 3D *before* the page paints. When the visitor will
 *    get 3D, it hides the 2D map until the first 3D frame is ready, so the 2D
 *    map no longer flashes and then jumps to 3D.
 */
(function(){
  var LAT = 49.8954, LON = -97.1385;           // Winnipeg
  var RAD = Math.PI / 180;

  // Sun altitude in degrees (simplified NOAA formulas; good to about a degree).
  function altitude(date){
    var d = date.getTime() / 864e5 + 2440587.5 - 2451545.0;     // days since J2000
    var g = (357.529 + 0.98560028 * d) * RAD;
    var q = 280.459 + 0.98564736 * d;
    var L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
    var e = (23.439 - 0.00000036 * d) * RAD;
    var ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
    var dec = Math.asin(Math.sin(e) * Math.sin(L));
    var gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
    var ha = gmst * 15 * RAD + LON * RAD - ra;
    return Math.asin(Math.sin(LAT * RAD) * Math.sin(dec) + Math.cos(LAT * RAD) * Math.cos(dec) * Math.cos(ha)) / RAD;
  }
  var forced = null;
  try { forced = new URLSearchParams(location.search).get('time'); } catch (e) {}
  // Smooth 0..1: full night below -6° (end of civil twilight), full day above 5°.
  function daylight(date){
    if (forced === 'day') return 1;
    if (forced === 'night') return 0;
    if (forced === 'dusk') return .4;
    var a = altitude(date || new Date()), t = Math.min(1, Math.max(0, (a + 6) / 11));
    return t * t * (3 - 2 * t);
  }
  window.PortfolioSun = { altitude: altitude, daylight: daylight, city: 'Winnipeg' };

  /* ---------- boot: avoid the 2D -> 3D flash ---------- */
  var html = document.documentElement;
  var day = daylight();
  if (day < .5) html.classList.add('boot-night');
  var mode = null;
  try { mode = localStorage.getItem('portfolio-view'); } catch (e) {}
  try { var v = new URLSearchParams(location.search).get('view'); if (v === '2d' || v === '3d') mode = v; } catch (e) {}
  var gl = false;
  try { var c = document.createElement('canvas'); gl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) {}
  if (mode !== '2d' && gl){
    html.classList.add('boot-3d');
    // Safety net: if 3D never shows up (slow network, script error), show the 2D map.
    setTimeout(function(){ if (html.classList.contains('boot-3d') && !window.Portfolio3D) html.classList.remove('boot-3d'); }, 8000);
  }
})();
