/**
 * features/ui/premium.js
 * Premium interaction suite: 3D Tilts, Parallax Backgrounds, and Interactive Mascot.
 */

export function initPremiumEffects() {
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile) return;

    initBackgroundParallax();
    init3DTilt();
    initMascotBehavior();
    console.log('[Animyx] ✨ Premium Effects Initialized');
}

/**
 * Adds a subtle parallax effect to the background grid
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

/**
 * Lightweight 3D Tilt implementation for cards
 */
function init3DTilt() {
    // We use event delegation for performance
    document.addEventListener('mouseover', (e) => {
        const card = e.target.closest('.tilt-card, .anime-card, .reco-card, .hero-slide');
        if (!card || card.dataset.tiltInitialized) return;

        card.dataset.tiltInitialized = "true";
        card.style.transition = "transform 0.1s var(--ease-out-expo)";
        
        card.addEventListener('mousemove', (me) => {
            const rect = card.getBoundingClientRect();
            const x = me.clientX - rect.left;
            const y = me.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = (centerY - y) / 10; // Adjust sensitivity
            const rotateY = (x - centerX) / 10;
            
            requestAnimationFrame(() => {
                card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
            });
        });

        card.addEventListener('mouseleave', () => {
            requestAnimationFrame(() => {
                card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
                card.style.transition = "transform 0.5s var(--ease-out-expo)";
            });
        });
    });
}

/**
 * Mascot personality and behavior
 */
function initMascotBehavior() {
    const mascot = document.getElementById('mascot-container');
    const bubble = document.getElementById('mascot-bubble');
    if (!mascot || !bubble) return;

    const greetings = [
        "What's on your list today?",
        "That's a solid choice!",
        "Nice to see you again!",
        "Feeling like a binge session?",
        "Don't forget to stay hydrated!",
        "Did you see that new episode?",
        "Updating your library? Good move."
    ];

    // Buoyancy animation loop
    let startTime = null;
    const animateMascot = (timestamp) => {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        
        // Sine wave for floating
        const y = Math.sin(elapsed / 1000) * 5;
        
        mascot.style.transform = `translateY(${y}px)`;
        requestAnimationFrame(animateMascot);
    };
    requestAnimationFrame(animateMascot);

    // Random greeting on click
    mascot.addEventListener('click', () => {
        const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
        bubble.textContent = randomGreeting;
        
        // Visual feedback
        mascot.style.transform = "scale(1.2) rotate(10deg)";
        setTimeout(() => {
            mascot.style.transform = "scale(1)";
        }, 200);
    });

    // Cursor tracking (subtle head tilt)
    window.addEventListener('mousemove', (e) => {
        const rect = mascot.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const angleX = (e.clientY - centerY) / 50;
        const angleY = (e.clientX - centerX) / 50;
        
        const img = mascot.querySelector('img');
        if (img) {
            img.style.transform = `rotateX(${-angleX}deg) rotateY(${angleY}deg)`;
        }
    }, { passive: true });
}
