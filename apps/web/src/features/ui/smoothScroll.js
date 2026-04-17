import Lenis from 'lenis';

let lenis;

export function initSmoothScroll() {
  if (lenis) return lenis;

  const viewport = document.querySelector('.main-viewport');
  if (!viewport) return;
  lenis = new Lenis({
    wrapper: viewport,
    
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // Custom out-expo easing
    direction: 'vertical',
    gestureDirection: 'vertical',
    smooth: true,
    mouseMultiplier: 1,
    smoothTouch: false,
    touchMultiplier: 2,
    infinite: false,
  });

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }

  requestAnimationFrame(raf);
  return lenis;
}

export function getLenis() {
  return lenis;
}

export function stopSmoothScroll() {
  if (lenis) lenis.stop();
}

export function startSmoothScroll() {
  if (lenis) lenis.start();
}
