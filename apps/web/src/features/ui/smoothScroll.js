/**
 * smoothScroll.js — No-op shim
 *
 * Native CSS `scroll-behavior: smooth` on .main-viewport handles all
 * smooth scrolling across mouse, trackpad, keyboard and touch. A custom
 * JS wheel listener is unnecessary and breaks trackpad/touchpad gestures.
 */

export function initSmoothScroll() {
  // Native CSS scroll-behavior: smooth is applied to .main-viewport in main.css
  // No JS interception needed — this preserves all device scroll behaviours.
}

export function stopSmoothScroll() {}
export function startSmoothScroll() {}
