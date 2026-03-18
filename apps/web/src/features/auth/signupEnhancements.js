import './auth.js';

if (false) {
function initSignupStrengthMeter() {
  const passwordInput = document.getElementById("password");
  const strengthWrap = document.getElementById("pwd-strength");
  const strengthLabel = document.getElementById("strength-label");
  const bars = [
    document.getElementById("s1"),
    document.getElementById("s2"),
    document.getElementById("s3"),
    document.getElementById("s4")
  ];
  if (!passwordInput || !strengthWrap || !strengthLabel || bars.some((b) => !b)) return;

  const levels = [
    { label: "Too weak", cls: "filled-weak", fill: 1 },
    { label: "Needs work", cls: "filled-fair", fill: 2 },
    { label: "Good", cls: "filled-good", fill: 3 },
    { label: "Strong", cls: "filled-strong", fill: 4 }
  ];

  function getStrength(value) {
    let score = 0;
    if (value.length >= 8) score += 1;
    if (/[A-Z]/.test(value)) score += 1;
    if (/[0-9]/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;
    return Math.min(score, 4);
  }

  passwordInput.addEventListener("input", () => {
    const value = String(passwordInput.value || "");
    if (!value) {
      strengthWrap.classList.remove("visible");
      bars.forEach((bar) => { bar.className = ""; });
      strengthLabel.textContent = "Enter a password";
      return;
    }

    strengthWrap.classList.add("visible");
    const levelIndex = Math.max(0, getStrength(value) - 1);
    const level = levels[levelIndex];
    bars.forEach((bar, idx) => {
      bar.className = idx < level.fill ? level.cls : "";
    });
    strengthLabel.textContent = level.label;
  });
}

function initParticles() {
  const canvas = document.getElementById("auth-particles");
  if (!canvas) return;
  const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reducedMotion) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let frameId = 0;
  let particles = [];

  function resize() {
    width = canvas.width = canvas.offsetWidth;
    height = canvas.height = canvas.offsetHeight;
  }

  function random(min, max) {
    return Math.random() * (max - min) + min;
  }

  function createParticle() {
    const palette = ["168,85,247", "236,72,153", "6,182,212"];
    return {
      x: random(0, width),
      y: random(0, height),
      r: random(0.8, 2.2),
      dx: random(-0.25, 0.25),
      dy: random(-0.55, -0.12),
      alpha: random(0.2, 0.65),
      color: palette[Math.floor(Math.random() * palette.length)]
    };
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    particles.forEach((particle) => {
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${particle.color},${particle.alpha})`;
      ctx.fill();
      particle.x += particle.dx;
      particle.y += particle.dy;
      if (particle.y < -5 || particle.x < -5 || particle.x > width + 5) {
        Object.assign(particle, createParticle(), { y: height + 5 });
      }
    });
    frameId = requestAnimationFrame(draw);
  }

  resize();
  particles = Array.from({ length: 70 }, createParticle);
  frameId = requestAnimationFrame(draw);

  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
      return;
    }
    if (!document.hidden && !frameId) frameId = requestAnimationFrame(draw);
  });
}

function initEntrance() {
  const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reducedMotion) return;
  const inner = document.getElementById("auth-form-inner");
  if (!inner) return;
  requestAnimationFrame(() => requestAnimationFrame(() => inner.classList.add("animate-enter")));
}

document.addEventListener("DOMContentLoaded", () => {
  initParticles();
  initEntrance();
  initSignupStrengthMeter();
});
}
