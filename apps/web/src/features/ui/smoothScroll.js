/**
 * smoothScroll.js — Native momentum scroll controller
 *
 * Lenis is incompatible with Animyx's App Shell (overflow-container scroll).
 * We use a native JS momentum approach instead: intercept wheel events and
 * apply smooth eased scroll within the .main-viewport container.
 */

let destroyed = false;
let animFrame;

function easeOutExpo(t) {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function smoothScrollTo(el, targetScrollTop, duration = 500) {
  const startScrollTop = el.scrollTop;
  const distance = targetScrollTop - startScrollTop;
  if (Math.abs(distance) < 1) return;

  let startTime = null;

  function step(timestamp) {
    if (destroyed) return;
    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);
    el.scrollTop = startScrollTop + distance * easeOutExpo(progress);
    if (progress < 1) {
      animFrame = requestAnimationFrame(step);
    }
  }

  cancelAnimationFrame(animFrame);
  animFrame = requestAnimationFrame(step);
}

export function initSmoothScroll() {
  const viewport = document.querySelector('.main-viewport');
  if (!viewport) return;

  destroyed = false;

  // Small accumulated scroll target
  let targetScrollTop = viewport.scrollTop;

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    // Accumulate scroll delta with momentum multiplier
    targetScrollTop += e.deltaY * 1.4;
    // Clamp to scrollable range
    const maxScroll = viewport.scrollHeight - viewport.clientHeight;
    targetScrollTop = Math.max(0, Math.min(targetScrollTop, maxScroll));
    smoothScrollTo(viewport, targetScrollTop, 600);
  }, { passive: false });

  // Keep target in sync when scrolled by other means (e.g. keyboard, touch)
  viewport.addEventListener('scroll', () => {
    // Only sync if not currently animating (to avoid fighting with animation)
    cancelAnimationFrame(animFrame);
    targetScrollTop = viewport.scrollTop;
  }, { passive: true });
}

export function stopSmoothScroll() {
  destroyed = true;
  cancelAnimationFrame(animFrame);
}

export function startSmoothScroll() {
  destroyed = false;
}
