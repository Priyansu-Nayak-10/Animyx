/**
 * features/dashboard/milestones.js
 */

export function initMilestones({ libraryStore, toast = null }) {
  const MILESTONE_STORAGE_KEY = "animex_dismissed_milestones";
  const dismissed = new Set(JSON.parse(localStorage.getItem(MILESTONE_STORAGE_KEY) || "[]"));

  const milestones = [
    { id: "starter", title: "Rising Star", threshold: 1, text: "Completed your first anime!", icon: "star" },
    { id: "veteran", title: "Anime Veteran", threshold: 25, text: "Completed 25 series. True dedication!", icon: "workspace_premium" },
    { id: "legend", title: "Legendary Viewer", threshold: 100, text: "100 series finished! You are a master.", icon: "military_tech" }
  ];

  function render() {
    const stats = libraryStore.getStats();
    const container = document.getElementById("milestones-container");
    if (!container) return;

    const available = milestones.filter(m => stats.completed >= m.threshold && !dismissed.has(m.id));
    if (!available.length) {
      container.innerHTML = "";
      return;
    }

    container.innerHTML = available.map(m => `
      <div class="milestone-toast" data-id="${m.id}">
        <span class="material-icons">${m.icon}</span>
        <div class="milestone-content">
          <strong>${m.title}</strong>
          <p>${m.text}</p>
        </div>
        <button class="milestone-close" data-action="dismiss-milestone">✕</button>
      </div>
    `).join("");
  }

  function onDismiss(e) {
    const btn = e.target.closest("[data-action='dismiss-milestone']");
    if (!btn) return;
    const id = btn.closest(".milestone-toast").dataset.id;
    dismissed.add(id);
    localStorage.setItem(MILESTONE_STORAGE_KEY, JSON.stringify([...dismissed]));
    render();
  }

  const el = document.getElementById("milestones-container");
  el?.addEventListener("click", onDismiss);

  const unsub = libraryStore.subscribe(render);
  render();

  return {
    destroy() {
      unsub();
      el?.removeEventListener("click", onDismiss);
    }
  };
}
