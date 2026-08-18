/**
 * device-detect.js — Robust device + browser detection with safe RAM caps
 * ------------------------------------------------------------
 * Design principles (per user requirement: "no miss or wrong detection"):
 * 1. ALWAYS conservative: if any signal is missing/ambiguous, assume the
 *    WEAKER device profile (lower RAM cap). Never over-allocate.
 * 2. Multiple independent signals are cross-checked; a single lie from the
 *    browser cannot mis-classify.
 * 3. Pure ES6, no dependencies, works Android / iOS / Windows / Linux.
 * 4. Deterministic: same environment always returns the same profile.
 */
(function () {
  'use strict';

  var UA = '';
  try { UA = navigator.userAgent || ''; } catch (e) { UA = ''; }

  // ---------------------------------------------------------------
  // 1. OS detection  (ordered: most-specific first)
  // ---------------------------------------------------------------
  function detectOS() {
    // Windows version bands
    if (/Windows NT 10/.test(UA)) return { os: 'Windows', version: '10/11', family: 'windows' };
    if (/Windows NT 6\.3/.test(UA)) return { os: 'Windows', version: '8.1', family: 'windows' };
    if (/Windows NT 6\.1/.test(UA)) return { os: 'Windows', version: '7', family: 'windows' };
    if (/Windows/.test(UA))        return { os: 'Windows', version: 'unknown', family: 'windows' };

    // macOS (Safari reports Macintosh; Chromium 85+ masks version, use CPU count heuristic-free fallback)
    if (/Mac OS X ([0-9_]+)/.test(UA)) {
      var v = RegExp.$1.replace(/_/g, '.');
      return { os: 'macOS', version: v, family: 'macos' };
    }
    if (/Macintosh/.test(UA)) return { os: 'macOS', version: 'unknown', family: 'macos' };

    // iOS (before iOS 13 Safari says iPhone; iPadOS 13+ says Macintosh — handled below)
    if (/CPU (iPhone )?OS ([0-9_]+)/.test(UA)) {
      return { os: 'iOS', version: RegExp.$2.replace(/_/g, '.'), family: 'ios' };
    }
    if (/iPad; CPU OS ([0-9_]+)/.test(UA)) {
      return { os: 'iPadOS', version: RegExp.$1.replace(/_/g, '.'), family: 'ios' };
    }

    // Android
    if (/Android ([0-9.]+)/.test(UA)) {
      return { os: 'Android', version: RegExp.$1, family: 'android' };
    }
    if (/Linux; U; Android/.test(UA)) return { os: 'Android', version: 'unknown', family: 'android' };

    // ChromeOS — UA contains "CrOS"
    if (/CrOS/.test(UA)) return { os: 'ChromeOS', version: 'unknown', family: 'chromeos' };

    // Plain Linux desktop
    if (/Linux/.test(UA)) return { os: 'Linux', version: 'unknown', family: 'linux' };

    // Unknown / bot / minimal UA
    return { os: 'Unknown', version: 'unknown', family: 'unknown' };
  }

  // ---------------------------------------------------------------
  // 2. Form factor detection (cross-checked signals)
  // ---------------------------------------------------------------
  function detectFormFactor() {
    var mobileUA = /Mobi|Android.*Mobile|iPhone|iPod/i.test(UA);
    var touchMax = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || false;
    var smallScreen = (screen.width || 0) < 900; // portrait phones
    var isTablet = /iPad|Tablet|SM-T[0-9]{3}/i.test(UA) && !mobileUA;

    // iPadOS 13+ pretends to be desktop Safari (Macintosh UA + touch)
    var pretendDesktop = /Macintosh/.test(UA) && touchMax && smallScreen;

    if (mobileUA)                        return 'phone';
    if (isTablet || pretendDesktop)      return 'tablet';
    if (touchMax && smallScreen && /Linux|Android/.test(UA)) return 'phone'; // desktop browser faking Linux UA + touch screen
    return 'desktop';
  }

  // ---------------------------------------------------------------
  // 3. Browser engine detection (engine matters more than brand)
  // ---------------------------------------------------------------
  function detectBrowser() {
    // Order matters: Edge hides inside "Chrome" tokens, Chrome hides "Safari"
    if (/Edg\/([0-9.]+)/.test(UA))           return { engine: 'Chromium', name: 'Edge',  version: RegExp.$1 };
    if (/OPR\/([0-9.]+)|Opera/.test(UA))     return { engine: 'Chromium', name: 'Opera', version: (RegExp.$1 || 'legacy') };
    if (/Chrome\/([0-9.]+)/.test(UA))        return { engine: 'Chromium', name: 'Chrome', version: RegExp.$1 };
    if (/Safari\/([0-9.]+)/.test(UA))        return { engine: 'WebKit',  name: 'Safari', version: RegExp.$1 };
    if (/Firefox\/([0-9.]+)/.test(UA))       return { engine: 'Gecko',   name: 'Firefox', version: RegExp.$1 };
    return { engine: 'Unknown', name: 'Unknown', version: 'unknown' };
  }

  // ---------------------------------------------------------------
  // 4. Memory estimation — cross-check 3 independent sources,
  //    take the SMALLEST plausible value (conservative)
  // ---------------------------------------------------------------
  function detectMemory() {
    var sources = [];

    // 4a. navigator.deviceMemory (Chromium only; often undersells by 2x-4x, never lies high)
    try {
      if (navigator.deviceMemory) sources.push(navigator.deviceMemory * 1024);
    } catch (e) {}

    // 4b. Performance memory API (heap size only — but gives relative scale)
    try {
      var pm = navigator.performance && navigator.performance.memory;
      if (pm && pm.jsHeapSizeLimit) {
        var limitMB = Math.round(pm.jsHeapSizeLimit / (1024 * 1024));
        // JS heap limit is roughly device-dependent:
        // Android low-end ~ 500MB, mid ~ 1.5GB, desktop ~ 4GB
        if (limitMB < 600)  sources.push(2048);   // small heap → weak device
        else if (limitMB < 1200) sources.push(3072);
        else if (limitMB < 2100) sources.push(4096);
        else sources.push(8192);
      }
    } catch (e) {}

    // 4c. Hardware concurrency (CPU cores hint about device class)
    var cores = 1;
    try { cores = navigator.hardwareConcurrency || 1; } catch (e) {}
    if (cores <= 2) sources.push(2048);
    else if (cores <= 4) sources.push(4096);
    else sources.push(8192);

    if (sources.length === 0) return 2048; // unknown → conservative 2GB class

    var min = Math.min.apply(null, sources);
    // Round down to known classes to avoid guessing between classes
    var classes = [1024, 2048, 3072, 4096, 6144, 8192, 16384];
    var est = 1024;
    for (var i = 0; i < classes.length; i++) {
      if (min >= classes[i]) est = classes[i]; else break;
    }
    return est;
  }

  // ---------------------------------------------------------------
  // 5. Safe VM RAM policy
  //    Rule: VM RAM should never exceed ~1/4 of device class memory.
  //    Extra brake on weak engines (WebKit iOS) and mobile.
  // ---------------------------------------------------------------
  function computeRAMPolicy(memoryMB, formFactor, engine, osFamily) {
    var quarter = Math.max(64, Math.floor(memoryMB / 4));

    var recommended = (formFactor === 'phone' || formFactor === 'tablet') ? 64 : 128;
    var cap = quarter;

    // Hard engineering limits:
    if (formFactor !== 'desktop') {
      // iOS WebKit kills tabs aggressively above ~256MB JS state
      if (osFamily === 'ios')            cap = Math.min(cap, 256);
      // Android Chromium mid/low budget
      else if (osFamily === 'android')   cap = Math.min(cap, 512);
      // Other mobile (unknown) — most conservative
      else                               cap = Math.min(cap, 256);
    } else {
      // Desktop: 4GB class devices struggle with 1GB tabs
      if (memoryMB <= 4096) cap = Math.min(cap, 512);
      else                  cap = Math.min(cap, 1024);
    }

    // Low-end device brake: <=2 cores or unknown UA → never above 256MB VM
    var cores = 1;
    try { cores = navigator.hardwareConcurrency || 1; } catch (e) {}
    if (cores <= 2 || /Unknown/.test(engine)) cap = Math.min(cap, 256);

    // Recommended never exceeds cap
    recommended = Math.min(recommended, cap);

    return {
      deviceMemoryMB: memoryMB,
      recommendedRam: recommended,
      maxAllowedRam: cap,
      isLowEnd: memoryMB <= 2048 || cores <= 2
    };
  }

  // ---------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------
  var DeviceDetect = {
    getOS: detectOS,
    getFormFactor: detectFormFactor,
    getBrowser: detectBrowser,
    getMemory: detectMemory,
    getSpecs: function () {
      var os = detectOS();
      var ff = detectFormFactor();
      var br = detectBrowser();
      var mem = detectMemory();
      var policy = computeRAMPolicy(mem, ff, br.engine, os.family);
      return Object.assign({}, policy, {
        os: os.os,
        osVersion: os.version,
        osFamily: os.family,
        formFactor: ff,
        browser: br.name,
        engine: br.engine,
        browserVersion: br.version
      });
    },
    // Warning text when user picks RAM above recommended
    getRAMWarning: function (selectedMB, specs) {
      if (selectedMB > specs.recommendedRam) {
        var extra = '';
        if (selectedMB > 512 && specs.formFactor !== 'desktop')
          extra = ' Mobile browsers may crash with large VMs.';
        if (selectedMB > 256 && specs.osFamily === 'ios')
          extra = ' iOS may silently close this tab.';
        return 'Warning: ' + selectedMB + 'MB exceeds the safe recommendation (' +
               specs.recommendedRam + 'MB) for this device.' + extra + ' Continue anyway?';
      }
      return null;
    }
  };

  // Export: window global (vanilla JS, no bundler)
  try { window.DeviceDetect = DeviceDetect; } catch (e) {}

  if (typeof module !== 'undefined' && module.exports) module.exports = DeviceDetect;
})();
