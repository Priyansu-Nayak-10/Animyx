/**
 * smoothScroll.js
 *
 * Inertial smooth scrolling via Lenis v1.1.x
 * Upgrades:
 *  - Tuned lerp (0.065) for a silkier, more premium feel
 *  - cancelAnimationFrame cleanup on destroy
 *  - Scroll progress bar (thin line at top of viewport)
 *  - getLenis() export for external modules
 *  - Velocity-aware scroll class on body (scroll-fast / scroll-slow)
 */

let lenis = null;
let rafId = null;
let progressBar = null;

/* ─── Progress bar ──────────────────────────────────────────── */
function createProgressBar(viewport) {
  const bar = document.createElement('div');
  bar.id = 'scroll-progress-bar';
  bar.setAttribute('aria-hidden', 'true');
  viewport.style.position = 'relative'; // ensure correct stacking context
  viewport.prepend(bar);
  return bar;
}

function updateProgress(viewport, bar) {
  const scrollTop    = viewport.scrollTop;
  const scrollHeight = viewport.scrollHeight - viewport.clientHeight;
  const pct = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
  bar.style.width = `${pct}%`;

  // Velocity class: helps nav/sticky elements react to scroll speed
  if (pct > 2) {
    document.body.classList.add('is-scrolling');
  } else {
    document.body.classList.remove('is-scrolling');
  }
}

/* ─── Core init ─────────────────────────────────────────────── */
export function initSmoothScroll() {
  const viewport = document.querySelector('.main-viewport');
  if (!viewport || typeof Lenis === 'undefined') return;

  progressBar = createProgressBar(viewport);

  lenis = new Lenis({
    wrapper: viewport,
    content: viewport.firstElementChild || viewport,
    lerp: 0.065,                  // ↓ from 0.08 — silkier, more premium glide
    orientation: 'vertical',
    gestureOrientation: 'vertical',
    smoothWheel: true,
    touchMultiplier: 2.2,
    wheelMultiplier: 1,
    infinite: false,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // exponential ease-out
  });

  // Sync scroll progress bar with Lenis scroll position
  lenis.on('scroll', ({ scroll, limit }) => {
    const pct = limit > 0 ? (scroll / limit) * 100 : 0;
    progressBar.style.width = `${pct}%`;

    // Body class for velocity-sensitive UI
    document.body.classList.toggle('is-scrolling', pct > 1 && pct < 99);
  });

  function raf(time) {
    if (!lenis) return;
    lenis.raf(time);
    rafId = requestAnimationFrame(raf);
  }

  rafId = requestAnimationFrame(raf);
}

/* ─── Controls ──────────────────────────────────────────────── */
export function stopSmoothScroll() {
  lenis?.stop();
}

export function startSmoothScroll() {
  lenis?.start();
}

/** Scroll-to-top with exponential ease (matches Lenis easing) */
export function scrollToTop() {
  if (lenis) {
    lenis.scrollTo(0, {
      duration: 1.4,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    });
  } else {
    document.querySelector('.main-viewport')?.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/** Scroll to any target element or offset (exported for future use) */
export function scrollTo(target, options = {}) {
  if (lenis) {
    lenis.scrollTo(target, { duration: 1.2, ...options });
  }
}

/** Expose the raw Lenis instance for advanced usage */
export function getLenis() {
  return lenis;
}

/** Full teardown — called if the app needs to remount */
export function destroySmoothScroll() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (lenis) {
    lenis.destroy();
    lenis = null;
  }
  if (progressBar) {
    progressBar.remove();
    progressBar = null;
  }
  document.body.classList.remove('is-scrolling');
}
