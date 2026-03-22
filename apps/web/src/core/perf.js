/**
 * core/perf.js
 * Shared performance utilities for Animyx frontend.
 *
 * Exports:
 *   - lazyImageObserver  : single shared IntersectionObserver for lazy images
 *   - sectionRevealObserver : single shared IO for card reveal animations
 *   - requestCache       : promise-level deduplicator / cache for GET fetches
 *   - debounce           : debounce function factory
 *   - throttle           : throttle function factory
 *   - rafSchedule        : schedule work in the next animation frame (deduplicated)
 */

// ─── Shared Lazy-Image Observer ───────────────────────────────────────────────
//
// One IntersectionObserver shared across ALL images instead of one per card.
// Cards call lazyImageObserver.observe(imgEl) and we handle from here.
//

const _lazyImageCallbacks = new WeakMap();

const _lazyIO = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const img = /** @type {HTMLImageElement} */ (entry.target);
      // Load via data-src or data-lazy-src
      const src = img.dataset.lazySrc || img.dataset.src;
      if (src && !img.src) {
        img.src = src;
      } else if (src && img.src !== src) {
        img.src = src;
      }
      img.removeAttribute('data-lazy-src');
      img.removeAttribute('data-src');
      img.addEventListener('load',  () => img.classList.add('img-loaded', 'is-loaded'), { once: true });
      img.addEventListener('error', () => img.classList.add('img-error'),              { once: true });
      // Fire optional per-image callback
      const cb = _lazyImageCallbacks.get(img);
      if (cb) { cb(img); _lazyImageCallbacks.delete(img); }
      _lazyIO.unobserve(img);
    }
  },
  { rootMargin: '80px 0px', threshold: 0 }
);

/**
 * Observe an <img> element for lazy loading.
 * • If the image is already in the viewport, it loads immediately.
 * • Otherwise it loads when it enters the viewport + 80px.
 *
 * @param {HTMLImageElement} img
 * @param {function} [onLoad]  Optional callback fired once the src is assigned.
 */
export function observeLazyImage(img, onLoad) {
  if (!(img instanceof HTMLImageElement)) return;
  // Already loaded → just add class
  if (img.complete && img.naturalWidth > 0) {
    img.classList.add('img-loaded', 'is-loaded');
    return;
  }
  if (onLoad) _lazyImageCallbacks.set(img, onLoad);
  _lazyIO.observe(img);
}

/**
 * Stop observing an image (call on element removal).
 * @param {HTMLImageElement} img
 */
export function unobserveLazyImage(img) {
  _lazyIO.unobserve(img);
  _lazyImageCallbacks.delete(img);
}


// ─── Shared Section-Reveal Observer ──────────────────────────────────────────
//
// One IntersectionObserver that adds 'animyx-reveal-visible' when elements
// scroll into view. Replaces the per-feature usage of initSectionReveal.
//

const _revealed = new WeakSet();

const _revealIO = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting || _revealed.has(entry.target)) continue;
      entry.target.classList.add('animyx-reveal-visible');
      _revealed.add(entry.target);
      _revealIO.unobserve(entry.target);
    }
  },
  { threshold: 0.1, rootMargin: '0px 0px -6% 0px' }
);

/**
 * Register an element for scroll-reveal animation.
 * The element must already have (or will receive) the 'animyx-reveal' class.
 * @param {HTMLElement} el
 */
export function observeReveal(el) {
  if (!(el instanceof HTMLElement) || _revealed.has(el)) return;
  el.classList.add('animyx-reveal');
  _revealIO.observe(el);
}

/** Stop observing an element.  @param {HTMLElement} el */
export function unobserveReveal(el) { _revealIO.unobserve(el); }


// ─── Request Deduplicator / Cache ─────────────────────────────────────────────
//
// Prevents the same URL from being fetched multiple times concurrently.
// A second call for an in-flight URL returns the SAME promise.
// Responses are cached for `ttl` ms (default 30 s).
//

const _inflight = new Map();   // url → Promise<Response>
const _cache    = new Map();   // url → { data, expiresAt }

/**
 * Deduplicated GET fetch with optional TTL cache.
 *
 * @param {string}  url
 * @param {object}  [opts]
 * @param {number}  [opts.ttl=30000]    Cache duration in ms (0 = no cache)
 * @param {object}  [opts.fetchOpts]    Passed to native fetch()
 * @returns {Promise<any>}              Parsed JSON body
 */
export async function cachedFetch(url, { ttl = 30_000, fetchOpts = {} } = {}) {
  // 1. Return cached result if still fresh
  const cached = _cache.get(url);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  // 2. Return in-flight promise if one exists
  if (_inflight.has(url)) {
    return _inflight.get(url);
  }

  // 3. Create new request
  const promise = fetch(url, fetchOpts)
    .then((res) => {
      if (!res.ok) throw new Error(`[cachedFetch] ${url} → ${res.status}`);
      return res.json();
    })
    .then((data) => {
      if (ttl > 0) _cache.set(url, { data, expiresAt: Date.now() + ttl });
      _inflight.delete(url);
      return data;
    })
    .catch((err) => {
      _inflight.delete(url);
      throw err;
    });

  _inflight.set(url, promise);
  return promise;
}

/** Manually invalidate a cached URL. */
export function invalidateCache(url) {
  _cache.delete(url);
  _inflight.delete(url);
}

/** Clear the entire response cache. */
export function clearCache() {
  _cache.clear();
  _inflight.clear();
}


// ─── Debounce ─────────────────────────────────────────────────────────────────

/**
 * Returns a debounced version of fn that delays invocation by `wait` ms.
 * @template {(...args: any[]) => any} T
 * @param {T} fn
 * @param {number} wait
 * @returns {T & { cancel(): void }}
 */
export function debounce(fn, wait) {
  let timer;
  function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  }
  debounced.cancel = () => clearTimeout(timer);
  return /** @type {any} */ (debounced);
}


// ─── Throttle ─────────────────────────────────────────────────────────────────

/**
 * Returns a throttled version of fn that fires at most once per `limit` ms.
 * @template {(...args: any[]) => any} T
 * @param {T} fn
 * @param {number} limit
 * @returns {T}
 */
export function throttle(fn, limit) {
  let lastCall = 0;
  return function throttled(...args) {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      return fn.apply(this, args);
    }
  };
}


// ─── rAF Scheduler ────────────────────────────────────────────────────────────

let _rafPending = false;
const _rafQueue = new Set();

/**
 * Schedule a callback in the next animation frame.
 * Multiple calls with the same function reference are deduped.
 * @param {() => void} cb
 */
export function rafSchedule(cb) {
  _rafQueue.add(cb);
  if (!_rafPending) {
    _rafPending = true;
    requestAnimationFrame(() => {
      _rafPending = false;
      const callbacks = [..._rafQueue];
      _rafQueue.clear();
      for (const fn of callbacks) { try { fn(); } catch (_) {} }
    });
  }
}
