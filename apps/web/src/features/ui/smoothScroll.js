/**
 * smoothScroll.js
 *
 * Implements inertial smooth scrolling using Lenis on the main viewport.
 */

let lenis;

export function initSmoothScroll() {
  const viewport = document.querySelector('.main-viewport');
  if (!viewport || typeof Lenis === 'undefined') return;

  lenis = new Lenis({
    wrapper: viewport,
    content: viewport.firstElementChild || viewport,
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // Exponential ease-out
    direction: 'vertical',
    gestureDirection: 'vertical',
    smooth: true,
    mouseMultiplier: 1,
    smoothTouch: false,
    touchMultiplier: 2,
    infinite: false,
  });

  function raf(time) {
    if (lenis) {
      lenis.raf(time);
    }
    requestAnimationFrame(raf);
  }

  requestAnimationFrame(raf);
}

export function stopSmoothScroll() {
  if (lenis) {
    lenis.stop();
  }
}

export function startSmoothScroll() {
  if (lenis) {
    lenis.start();
  }
}

export function scrollToTop() {
  if (lenis) {
    lenis.scrollTo(0, {
      duration: 1.5,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) // Exponential ease
    });
  } else {
    document.querySelector('.main-viewport')?.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
