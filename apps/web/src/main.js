import { startApp } from './app.js';
import { scrollToTop } from './features/ui/smoothScroll.js';

startApp();

/* --- UI Enhancements --- */
function initEnhancements() {
  // 1. Global Keyboard Shortcut for Search (Ctrl+K / Cmd+K)
  const searchInput = document.getElementById('global-search-input');
  if (searchInput) {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInput.focus();
      }
    });

    // 2. Clear Search Input Button
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) {
      searchInput.addEventListener('input', () => {
        clearBtn.style.display = searchInput.value.length > 0 ? 'flex' : 'none';
      });
      
      clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        clearBtn.style.display = 'none';
        searchInput.focus();
      });
    }
  }

  // 3. Back to Top Floating Action Button
  const backToTopBtn = document.getElementById('back-to-top-btn');
  if (backToTopBtn) {
    // The main scroll container is likely .main-viewport or .view-container
    const scrollContainer = document.querySelector('.main-viewport') || window;
    
    scrollContainer.addEventListener('scroll', () => {
      const scrollPos = scrollContainer.scrollTop !== undefined ? scrollContainer.scrollTop : window.scrollY;
      if (scrollPos > 300) {
        backToTopBtn.classList.add('is-visible');
      } else {
        backToTopBtn.classList.remove('is-visible');
      }
    }, { passive: true });

    backToTopBtn.addEventListener('click', () => {
      scrollToTop();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initEnhancements, 100);
});
