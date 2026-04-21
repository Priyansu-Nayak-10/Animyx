/**
 * features/ui/premium.js
 * Premium interaction suite: Parallax Background.
 * Note: 3D Card Tilt and Mascot animations removed (visually noisy).
 */

export function initPremiumEffects() {
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile) return;

    initBackgroundParallax();
}

/**
 * Adds a subtle parallax effect to the background grid.
 * The background grid shifts opposite to mouse position, creating a depth illusion.
 */
function initBackgroundParallax() {
    const grid = document.getElementById('bg-grid-overlay');
    if (!grid) return;

    window.addEventListener('mousemove', (e) => {
        const moveX = (e.clientX - window.innerWidth / 2) / 50;
        const moveY = (e.clientY - window.innerHeight / 2) / 50;

        requestAnimationFrame(() => {
            grid.style.transform = `translate3d(${moveX}px, ${moveY}px, 0)`;
        });
    }, { passive: true });
}

