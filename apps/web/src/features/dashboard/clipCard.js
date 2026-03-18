/**
 * features/dashboard/clipCard.js
 */

export const DASHBOARD_CLIP_KEY = "Animyx_fav_clip";

function readClipValue(storage) {
  return String(storage?.getItem?.(DASHBOARD_CLIP_KEY) || "").trim();
}

function inferMediaTagFromDataUrl(value) {
  if (String(value || "").startsWith("data:video/")) return "video";
  return "img";
}

export function initClipCard({ storage = globalThis.localStorage } = {}) {
  const card = document.querySelector(".clip-placeholder-card");
  if (!card) return { render() { }, destroy() { } };

  let clipSignature = "";
  let livePreviewUrl = "";
  let livePreviewTag = "img";

  function clearLivePreview() {
    if (!livePreviewUrl) return;
    URL.revokeObjectURL(livePreviewUrl);
    livePreviewUrl = "";
    livePreviewTag = "img";
  }

  function render() {
    const saved = livePreviewUrl || readClipValue(storage);
    const nextSignature = saved ? `filled:${saved.length}:${saved.slice(0, 96)}` : "empty";
    if (clipSignature === nextSignature) return;
    clipSignature = nextSignature;

    if (!saved) {
      card.innerHTML = `
        <input type="file" id="clip-upload" accept="video/*,image/*" hidden />
        <span class="placeholder-text">Insert Your Favorite Clip</span>
      `;
      card.classList.remove("has-media");
      return;
    }

    const mediaTag = livePreviewUrl ? livePreviewTag : inferMediaTagFromDataUrl(saved);
    const mediaMarkup = mediaTag === "video"
      ? `<video class="clip-media" src="${saved}" autoplay muted loop playsinline preload="metadata" aria-label="Favorite clip preview"></video>`
      : `<img class="clip-media" src="${saved}" alt="Favorite clip preview" loading="lazy" />`;
    card.innerHTML = `
      ${mediaMarkup}
      <button type="button" class="remove-clip" aria-label="Remove favorite clip">Remove</button>
    `;
    card.classList.add("has-media");
  }

  function onClick(event) {
    const removeButton = event.target.closest(".remove-clip");
    if (removeButton) {
      event.preventDefault();
      clearLivePreview();
      storage?.removeItem?.(DASHBOARD_CLIP_KEY);
      render();
      return;
    }
    const uploadInput = card.querySelector("#clip-upload");
    if (!uploadInput) return;
    uploadInput.click();
  }

  function onChange(event) {
    const input = event.target.closest("#clip-upload");
    if (!input) return;
    const file = input.files?.[0];
    if (!file) return;
    clearLivePreview();
    livePreviewUrl = URL.createObjectURL(file);
    livePreviewTag = String(file.type || "").toLowerCase().startsWith("video/") ? "video" : "img";

    if (livePreviewTag === "img") {
      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result || "");
        if (value) storage?.setItem?.(DASHBOARD_CLIP_KEY, value);
      };
      reader.readAsDataURL(file);
    } else {
      storage?.removeItem?.(DASHBOARD_CLIP_KEY);
    }
    render();
    input.value = "";
  }

  card.addEventListener("click", onClick);
  card.addEventListener("change", onChange);
  render();

  return Object.freeze({
    render,
    destroy() {
      clearLivePreview();
      card.removeEventListener("click", onClick);
      card.removeEventListener("change", onChange);
    }
  });
}
