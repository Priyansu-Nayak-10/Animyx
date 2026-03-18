/**
 * features/dashboard/carousel.js
 */

import { escapeHtml } from "./utils.js";
import { getTopOngoingAnikoto } from "../../core/appCore.js";
import { STATUS } from "../../store.js";

const DEFAULT_INTERVAL_MS = 5000;

function formatScheduleText(anime) {
  if (String(anime?.status || "").toLowerCase().includes("airing")) return "Currently airing";
  return "Schedule unavailable";
}

export function initHeroCarousel({
  store,
  libraryStore,
  toast = null,
  onViewDetails = null,
  intervalMs = DEFAULT_INTERVAL_MS,
  timers = globalThis
}) {
  const root = document.getElementById("hero-carousel");
  if (!root) return { render() { }, destroy() { } };

  const slidesHost = root.querySelector(".hero-slides");
  const indicatorsHost = root.querySelector(".hero-indicators");
  const prevBtn = root.querySelector(".hero-prev");
  const nextBtn = root.querySelector(".hero-next");

  let items = [];
  let index = 0;
  let intervalId = 0;

  function setActive(nextIndex) {
    const slides = root.querySelectorAll(".hero-slide");
    const dots = root.querySelectorAll(".hero-indicator");
    slides.forEach((slide, i) => slide.classList.toggle("is-active", i === nextIndex));
    dots.forEach((dot, i) => dot.classList.toggle("active", i === nextIndex));
    index = nextIndex;
  }

  function render(topOngoingOverride = null) {
    const state = store.getState();
    const libraryItems = libraryStore?.getAll?.() || [];
    const topOngoing = Array.isArray(topOngoingOverride)
      ? topOngoingOverride
      : getTopOngoingAnikoto(state, 10, libraryItems);
    items = topOngoing;
    index = 0;
    if (!slidesHost || !indicatorsHost) return;

    if (!items.length) {
      slidesHost.innerHTML = '<article class="hero-slide is-active"><div class="hero-slide-overlay"></div><div class="hero-slide-content"><h2 class="hero-title">No currently airing anime available</h2><p class="hero-countdown">Try refreshing datasets.</p></div></article>';
      indicatorsHost.innerHTML = "";
      return;
    }

    slidesHost.innerHTML = items.map((anime, i) => {
      const title = escapeHtml(String(anime?.title || "Unknown Title"));
      const image = escapeHtml(String(anime?.image || ""));
      const score = Number.isFinite(Number(anime?.score)) ? Number(anime.score).toFixed(2) : "N/A";
      const episodes = (() => {
        const n = Number(anime?.episodes);
        if (Number.isFinite(n) && n > 0) return n;
        const st = String(anime?.status || '').toLowerCase();
        return st.includes('airing') ? 'Ongoing' : 'Unknown';
      })();

      const genres = (anime?.genres || []).slice(0, 4).map((genre) => `<span class="hero-genre-chip" data-genre="${escapeHtml(genre)}">${escapeHtml(genre)}</span>`).join("");
      return `<article class="hero-slide ${i === 0 ? "is-active" : ""}" data-index="${i}">
        <img class="hero-slide-bg" src="${image}" alt="${title}" loading="lazy" decoding="async" />
        <div class="hero-slide-overlay"></div>
        <div class="hero-slide-content">
          <p class="hero-subtitle">Top Currently Airing</p>
          <h2 class="hero-title">${title}</h2>
          <div class="hero-meta"><span class="hero-score-badge">Score ${score}</span><span class="hero-episodes">${episodes} eps</span></div>
          <p class="hero-countdown">${escapeHtml(formatScheduleText(anime))}</p>
          <div class="hero-genres">${genres}</div>
          <div class="hero-actions">
            <button class="hero-btn hero-add-watchlist" type="button" data-hero-action="add" data-id="${Number(anime?.malId || 0)}">Add to Watchlist</button>
            <button class="hero-btn hero-view-details" type="button" data-hero-action="details" data-id="${Number(anime?.malId || 0)}">View Details</button>
          </div>
        </div>
      </article>`;
    }).join("");

    indicatorsHost.innerHTML = items.map((_, i) => `<button class="hero-indicator ${i === 0 ? "active" : ""}" type="button" data-hero-dot="${i}" aria-label="Go to slide ${i + 1}"></button>`).join("");
    const images = slidesHost.querySelectorAll(".hero-slide-bg");
    images.forEach((image) => {
      const markLoaded = () => image.classList.add("is-loaded");
      if (image.complete && image.naturalWidth > 0) {
        markLoaded();
        return;
      }
      image.addEventListener("load", markLoaded, { once: true });
      image.addEventListener("error", markLoaded, { once: true });
    });
  }

  function goNext() {
    if (items.length < 2) return;
    setActive((index + 1) % items.length);
  }

  function goPrev() {
    if (items.length < 2) return;
    setActive((index - 1 + items.length) % items.length);
  }

  function restartAutoPlay() {
    if (intervalId) timers.clearInterval(intervalId);
    if (items.length < 2) return;
    intervalId = timers.setInterval(goNext, Math.max(1200, Number(intervalMs) || DEFAULT_INTERVAL_MS));
  }

  async function onClick(event) {
    const dot = event.target.closest("[data-hero-dot]");
    if (dot) {
      const nextIndex = Number(dot.getAttribute("data-hero-dot") || 0);
      if (Number.isFinite(nextIndex)) setActive(Math.max(0, Math.min(items.length - 1, nextIndex)));
      restartAutoPlay();
      return;
    }
    const actionBtn = event.target.closest("[data-hero-action]");
    if (!actionBtn) return;
    const action = String(actionBtn.getAttribute("data-hero-action") || "");
    const malId = Number(actionBtn.getAttribute("data-id") || 0);
    if (!malId) return;
    const anime = items.find((row) => Number(row?.malId || 0) === malId);
    if (!anime) return;
    if (action === "add") {
      libraryStore.upsert({ ...anime, status: STATUS.WATCHING }, STATUS.WATCHING);
      toast?.show?.("Added to watchlist");
      restartAutoPlay();
      return;
    }
    if (action === "details") {
      if (typeof onViewDetails === "function") await onViewDetails(anime);
      restartAutoPlay();
    }
  }

  prevBtn?.addEventListener("click", () => { goPrev(); restartAutoPlay(); });
  nextBtn?.addEventListener("click", () => { goNext(); restartAutoPlay(); });
  root.addEventListener("click", onClick);

  const unsubscribe = store.subscribe(() => { render(); restartAutoPlay(); });
  render();
  restartAutoPlay();

  return Object.freeze({
    render,
    destroy() {
      unsubscribe();
      root.removeEventListener("click", onClick);
      if (intervalId) timers.clearInterval(intervalId);
    }
  });
}
