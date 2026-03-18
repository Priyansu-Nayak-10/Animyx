import { authFetch, apiUrl } from '../../config.js';

let notifications = [];
let unreadCount = 0;

const getBadgeEl = () => document.getElementById('notif-badge');
const getListEl = () => document.getElementById('notif-list');
const getToastRoot = () => document.getElementById('toast-root');

function typeIcon(type) {
  return ({
    sequel_announced: 'TV',
    new_episode: 'EP',
    dub_released: 'DUB',
    news: 'NEWS',
    SEQUEL_ANNOUNCED: 'TV',
    FINISHED_AIRING: 'END',
    DUB_AVAILABLE: 'DUB',
    WATCH_REMINDER: 'REM'
  }[type] || 'ALRT');
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function updateBadge() {
  const badge = getBadgeEl();
  if (!badge) return;
  badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
  badge.style.display = unreadCount > 0 ? 'flex' : 'none';
}

function buildNotificationItem(notification) {
  const item = document.createElement('div');
  item.className = `notif-item ${notification.is_read ? '' : 'unread'}`;
  item.dataset.id = String(notification.id);

  const icon = document.createElement('span');
  icon.className = 'notif-type-icon';
  icon.textContent = typeIcon(notification.type);

  const body = document.createElement('div');
  body.className = 'notif-body';

  const message = document.createElement('p');
  message.className = 'notif-message';
  message.textContent = String(notification.message || 'Notification');

  const created = document.createElement('small');
  created.className = 'notif-time';
  created.textContent = timeAgo(notification.created_at);

  body.appendChild(message);
  body.appendChild(created);
  item.appendChild(icon);
  item.appendChild(body);

  if (!notification.is_read) {
    const markReadBtn = document.createElement('button');
    markReadBtn.className = 'notif-read-btn';
    markReadBtn.type = 'button';
    markReadBtn.textContent = 'Read';
    markReadBtn.addEventListener('click', () => {
      void markRead(notification.id);
    });
    item.appendChild(markReadBtn);
  }

  return item;
}

function renderList() {
  const list = getListEl();
  if (!list) return;
  list.textContent = '';

  if (!notifications.length) {
    const empty = document.createElement('div');
    empty.className = 'notif-empty';
    empty.textContent = 'No notifications yet';
    list.appendChild(empty);
    return;
  }

  notifications.forEach((notification) => {
    list.appendChild(buildNotificationItem(notification));
  });
}

function showToast(notification) {
  const root = getToastRoot();
  if (!root) return;

  const toast = document.createElement('div');
  toast.className = 'toast-notif';

  const label = document.createElement('span');
  label.textContent = typeIcon(notification.type);

  const message = document.createElement('p');
  message.textContent = String(notification.message || 'New notification');

  toast.appendChild(label);
  toast.appendChild(message);
  root.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

export async function loadNotifications() {
  try {
    const allNotifications = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const res = await authFetch(apiUrl(`/notifications/me?page=${page}&limit=100`));
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      const items = Array.isArray(json?.data) ? json.data : [];
      
      if (items.length === 0) break;
      allNotifications.push(...items);

      // Check if there are more pages using meta information
      const meta = json?.meta;
      if (!meta?.hasNext) {
        hasMore = false;
      } else {
        page += 1;
        // Add a small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    notifications = allNotifications;
    unreadCount = notifications.filter((item) => !item.is_read).length;
    renderList();
    updateBadge();
  } catch (error) {
    console.error('[Notifications] Load failed:', error);
  }
}

export function onSocketNotification(notification) {
  notifications.unshift(notification);
  unreadCount += 1;
  updateBadge();
  renderList();
  showToast(notification);
}

export async function markRead(id) {
  try {
    await authFetch(apiUrl(`/notifications/${id}/read`), { method: 'PATCH' });
    const found = notifications.find((entry) => entry.id === id);
    if (found && !found.is_read) {
      found.is_read = true;
      unreadCount = Math.max(0, unreadCount - 1);
    }
    renderList();
    updateBadge();
  } catch (error) {
    console.error('[Notifications] markRead failed:', error);
  }
}

export async function clearAllNotifications() {
  try {
    await authFetch(apiUrl('/notifications/me/clear'), { method: 'DELETE' });
    notifications = [];
    unreadCount = 0;
    renderList();
    updateBadge();
  } catch (error) {
    console.error('[Notifications] clearAll failed:', error);
  }
}
