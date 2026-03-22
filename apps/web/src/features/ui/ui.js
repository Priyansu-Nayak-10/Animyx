function initToast({ root = document.body } = {}) {
  let container = null;
  const timeoutIds = new Set();

  function ensureContainer() {
    if (container && container.isConnected) return container;
    container = document.createElement("div");
    container.id = "Animyx-toast-root";
    container.className = "animyx-toast-stack";
    root.appendChild(container);
    return container;
  }

  function show(message, type = "info", durationMs = 2200) {
    const host = ensureContainer();
    const node = document.createElement("div");
    node.textContent = String(message || "");
    node.className = `animyx-toast${type === "error" ? " is-error" : ""}`;
    host.appendChild(node);
    requestAnimationFrame(() => {
      node.classList.add("is-visible");
    });

    const hideId = setTimeout(() => {
      node.classList.remove("is-visible");
      const removeId = setTimeout(() => {
        node.remove();
        timeoutIds.delete(removeId);
      }, 220);
      timeoutIds.add(removeId);
      timeoutIds.delete(hideId);
    }, Math.max(500, Number(durationMs) || 2200));
    timeoutIds.add(hideId);
  }

  return Object.freeze({
    render() {},
    show,
    destroy() {
      timeoutIds.forEach((id) => clearTimeout(id));
      timeoutIds.clear();
      if (container) container.remove();
      container = null;
    }
  });
}

function initTheme({
  storage = globalThis.localStorage,
  root = document.body
} = {}) {
  function applyStoredTheme() {
    root.classList.add("dark");
    document.documentElement.setAttribute("data-theme", "dark");
    storage?.setItem?.("Animyx_theme", "dark");
  }

  applyStoredTheme();

  return Object.freeze({
    render: applyStoredTheme,
    destroy() {}
  });
}

function initChartTooltips({ tooltipId = "chart-tooltip" } = {}) {
  const tooltip = document.getElementById(tooltipId);
  if (!tooltip) return { destroy() {} };
  const decoder = document.createElement("textarea");
  let rafId = 0;
  let pendingEvent = null;
  let activeTarget = null;
  const legendTooltipSelector = ".donut-slice, .genre-bar-item, .insight-legend-item, .si-legend-item, .legend-item";
  const activityTooltipScopeSelector = ".insight-activity-chart, .activity-chart-panel";

  function decodeHtml(value) {
    decoder.innerHTML = String(value || "");
    return decoder.value;
  }

  function renderTooltip(eventPayload) {
    const rawTarget = eventPayload?.target;
    if (rawTarget?.closest?.(activityTooltipScopeSelector)) {
      if (activeTarget) {
        activeTarget = null;
        tooltip.classList.remove("active");
      }
      return;
    }

    const target = rawTarget?.closest?.(legendTooltipSelector);
    if (!target) {
      activeTarget = null;
      tooltip.classList.remove("active");
      return;
    }

    const html = target.getAttribute("data-tooltip-html") || "";
    const text = target.getAttribute("data-tooltip") || "";
    if (!html && !text) {
      activeTarget = null;
      tooltip.classList.remove("active");
      return;
    }

    if (activeTarget !== target) {
      activeTarget = target;
      if (html) {
        tooltip.innerHTML = decodeHtml(html);
        tooltip.classList.add("is-rich");
      } else {
        tooltip.textContent = text;
        tooltip.classList.remove("is-rich");
      }
    }
    tooltip.classList.add("active");

    const x = Number(eventPayload?.clientX || 0) + 15;
    const y = Number(eventPayload?.clientY || 0) - 35;
    const width = tooltip.offsetWidth;
    const maxX = window.innerWidth - width - 20;
    const minY = 20;
    tooltip.style.left = `${Math.min(x, maxX)}px`;
    tooltip.style.top = `${Math.max(y, minY)}px`;
  }

  function onMouseMove(e) {
    const target = e?.target;
    if (!activeTarget && !target?.closest?.(legendTooltipSelector) && !target?.closest?.(activityTooltipScopeSelector)) {
      return;
    }
    pendingEvent = {
      clientX: e.clientX,
      clientY: e.clientY,
      target
    };
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      renderTooltip(pendingEvent);
    });
  }

  function onMouseLeave() {
    pendingEvent = null;
    activeTarget = null;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    tooltip.classList.remove("active");
  }

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseleave", onMouseLeave);

  return Object.freeze({
    destroy() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onMouseLeave);
      if (rafId) cancelAnimationFrame(rafId);
      tooltip.classList.remove("active");
    }
  });
}

function initUI({
  toastOptions = {},
  themeOptions = {}
} = {}) {
  const toast = initToast(toastOptions);
  const theme = initTheme({ ...themeOptions, toast });
  const chartTooltips = initChartTooltips();

  return Object.freeze({
    toast,
    theme,
    chartTooltips,
    destroy() {
      theme?.destroy?.();
      toast?.destroy?.();
      chartTooltips?.destroy?.();
    }
  });
}

export { initUI };
