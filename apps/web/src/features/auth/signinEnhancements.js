import './auth.js';

if (false) {
/**
 * Animyx Auth Redesign Enhancements
 * Handles form entry animations and UI interactions for the minimalist theme.
 */

function initFormEntrance() {
  const container = document.querySelector(".auth-grid-container");
  if (!container) return;
  
  const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reducedMotion) return;

  // Add a simple stagger to the form sections
  requestAnimationFrame(() => {
    container.style.opacity = "1";
    container.style.transform = "translateY(0)";
  });
}

/**
 * Sync focus states for the minimalist inputs
 */
function initInputBehaviors() {
  const inputs = document.querySelectorAll('.auth-input');
  inputs.forEach(input => {
    const parent = input.closest('.form-group-minimal');
    if (!parent) return;

    input.addEventListener('focus', () => {
      parent.classList.add('focused');
    });

    input.addEventListener('blur', () => {
      parent.classList.remove('focused');
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initFormEntrance();
  initInputBehaviors();
});
}
