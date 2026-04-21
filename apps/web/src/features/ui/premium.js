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

    let moveX = 0, moveY = 0;
    
    window.addEventListener('mousemove', (e) => {
        moveX = (e.clientX - window.innerWidth / 2) / 50;
        moveY = (e.clientY - window.innerHeight / 2) / 50;
        
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
        
        card.addEventListener('mousemove', (me) => {
            const rect = card.getBoundingClientRect();
            const x = me.clientX - rect.left;
            const y = me.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            // Adjust sensitivity (lower = more tilt)
            const rotateX = (centerY - y) / 12;
            const rotateY = (x - centerX) / 12;
            
            requestAnimationFrame(() => {
                // Remove transition during move for buttery smoothness
                card.style.transition = "none";
                card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
            });
        });

        card.addEventListener('mouseleave', () => {
            requestAnimationFrame(() => {
                // Restore transition for smooth reset
                card.style.transition = "transform 0.6s var(--ease-out-expo)";
                card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
            });
        });
    });
}

/**
 * Mascot personality and behavior
 */
function initMascotBehavior() {
    const mascot = document.getElementById('mascot-container');
    const floatWrapper = document.getElementById('mascot-float-wrapper');
    const bubble = document.getElementById('mascot-bubble');
    const img = document.getElementById('mascot-img');
    
    if (!mascot || !floatWrapper || !bubble || !img) return;

    const greetings = [
        "What's on your list today?",
        "That's a solid choice!",
        "Nice to see you again!",
        "Feeling like a binge session?",
        "Don't forget to stay hydrated!",
        "Did you see that new episode?",
        "Updating your library? Good move."
    ];

    // Layer 1: Buoyancy animation (Applied to wrapper)
    let startTime = null;
    const animateMascot = (timestamp) => {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        
        // Sine wave for floating
        const y = Math.sin(elapsed / 1200) * 8; // Slightly slower, larger float
        const rot = Math.sin(elapsed / 2000) * 2; // Subtle swaying
        
        floatWrapper.style.transform = `translateY(${y}px) rotate(${rot}deg)`;
        requestAnimationFrame(animateMascot);
    };
    requestAnimationFrame(animateMascot);

    // Layer 2: Interaction Logic (Applied to container/img)
    const handleAction = () => {
        const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
        bubble.textContent = randomGreeting;
        
        // Push animation to image layer to avoid conflict with float loop
        img.style.transform = "scale(1.2) rotate(10deg)";
        img.style.transition = "transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
        
        setTimeout(() => {
           img.style.transform = "scale(1) rotate(0deg)";
        }, 300);
    };

    mascot.addEventListener('click', handleAction);
    
    // Keyboard accessibility
    mascot.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleAction();
        }
    });

    // Cursor tracking (Applied directly to img transform, but managed carefully)
    window.addEventListener('mousemove', (e) => {
        // Only track if not currently in click-feedback
        if (img.style.transition.includes('0.2s')) return;

        const rect = mascot.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        // Limit tilt angle
        const angleX = Math.max(-15, Math.min(15, (e.clientY - centerY) / 40));
        const angleY = Math.max(-15, Math.min(15, (e.clientX - centerX) / 40));
        
        requestAnimationFrame(() => {
            img.style.transition = "transform 0.1s ease-out";
            img.style.transform = `rotateX(${-angleX}deg) rotateY(${angleY}deg)`;
        });
    }, { passive: true });
}
