/**
 * Frontend Pagination Component
 * 
 * Reusable pagination component for Vue.js / Vanilla JS
 * Supports multiple pagination patterns: buttons, infinite scroll, jump-to-page
 */

export class PaginationManager {
  constructor(options = {}) {
    this.currentPage = options.currentPage || 1;
    this.pageSize = options.pageSize || 50;
    this.totalCount = options.totalCount || 0;
    this.maxPages = options.maxPages || 10;
    this.onPageChange = options.onPageChange || (() => {});
  }

  get totalPages() {
    return Math.ceil(this.totalCount / this.pageSize);
  }

  get hasNextPage() {
    return this.currentPage < this.totalPages;
  }

  get hasPreviousPage() {
    return this.currentPage > 1;
  }

  get pageNumbers() {
    const pages = [];
    const startPage = Math.max(1, this.currentPage - Math.floor(this.maxPages / 2));
    const endPage = Math.min(this.totalPages, startPage + this.maxPages - 1);
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  }

  goToPage(pageNum) {
    if (pageNum < 1 || pageNum > this.totalPages) {
      return false;
    }
    this.currentPage = pageNum;
    this.onPageChange(pageNum);
    return true;
  }

  nextPage() {
    if (this.hasNextPage) {
      return this.goToPage(this.currentPage + 1);
    }
    return false;
  }

  previousPage() {
    if (this.hasPreviousPage) {
      return this.goToPage(this.currentPage - 1);
    }
    return false;
  }

  updateTotal(totalCount) {
    this.totalCount = totalCount;
    // If current page is now beyond total pages, go to last page
    if (this.currentPage > this.totalPages && this.totalPages > 0) {
      this.currentPage = this.totalPages;
    }
  }
}

/**
 * Vue Component: Pagination Buttons
 * Basic pagination with Previous/Next buttons
 */
export const PaginationButtons = {
  template: `
    <div class="pagination-controls">
      <button 
        @click="previousPage" 
        :disabled="!hasPrevious"
        class="btn btn-pagination"
      >
        ← Previous
      </button>

      <span class="pagination-info">
        Page {{ currentPage }} of {{ totalPages }}
        <span v-if="totalCount" class="total-items">
          ({{ totalCount }} items)
        </span>
      </span>

      <button 
        @click="nextPage" 
        :disabled="!hasNext"
        class="btn btn-pagination"
      >
        Next →
      </button>
    </div>
  `,
  props: {
    currentPage: Number,
    totalPages: Number,
    totalCount: Number,
    hasNext: Boolean,
    hasPrevious: Boolean
  },
  methods: {
    previousPage() {
      this.$emit('change-page', this.currentPage - 1);
    },
    nextPage() {
      this.$emit('change-page', this.currentPage + 1);
    }
  }
};

/**
 * Vue Component: Pagination Indicator with Page Numbers
 * Shows numbered page buttons
 */
export const PaginationIndicator = {
  template: `
    <div class="pagination-indicator">
      <!-- First page button -->
      <button 
        v-if="pageNumbers[0] > 1"
        @click="goToPage(1)"
        class="btn btn-page"
      >
        1
      </button>
      
      <!-- Ellipsis if gap at start -->
      <span v-if="pageNumbers[0] > 2" class="pagination-ellipsis">...</span>

      <!-- Page number buttons -->
      <button 
        v-for="pageNum in pageNumbers"
        :key="pageNum"
        @click="goToPage(pageNum)"
        :class="['btn', 'btn-page', { active: pageNum === currentPage }]"
      >
        {{ pageNum }}
      </button>

      <!-- Ellipsis if gap at end -->
      <span v-if="pageNumbers[pageNumbers.length - 1] < totalPages - 1" class="pagination-ellipsis">...</span>

      <!-- Last page button -->
      <button 
        v-if="pageNumbers[pageNumbers.length - 1] < totalPages"
        @click="goToPage(totalPages)"
        class="btn btn-page"
      >
        {{ totalPages }}
      </button>
    </div>
  `,
  props: {
    currentPage: Number,
    totalPages: Number,
    pageNumbers: Array
  },
  methods: {
    goToPage(pageNum) {
      this.$emit('change-page', pageNum);
    }
  }
};

/**
 * Vue Component: Infinite Scroll Pagination
 * Automatically loads more items when scrolling to bottom
 */
export const InfiniteScrollPagination = {
  template: `
    <div 
      ref="container"
      class="infinite-scroll-container"
    >
      <slot name="items"></slot>
      
      <div ref="sentinel" class="infinite-scroll-sentinel"></div>
      
      <div v-if="isLoading" class="loading-indicator">
        Loading more items...
      </div>
      
      <div v-if="!hasMore && items.length > 0" class="end-of-list">
        No more items to load
      </div>
    </div>
  `,
  props: {
    items: Array,
    hasMore: Boolean,
    isLoading: Boolean
  },
  mounted() {
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        entries => {
          if (entries[0].isIntersecting && this.hasMore && !this.isLoading) {
            this.$emit('load-more');
          }
        },
        { threshold: 0.1 }
      );
      observer.observe(this.$refs.sentinel);
    }
  },
  methods: {
    scrollToTop() {
      this.$refs.container.scrollTop = 0;
    }
  }
};

/**
 * Vue Component: Jump to Page Input
 * Allows users to jump directly to a specific page
 */
export const JumpToPage = {
  template: `
    <div class="jump-to-page">
      <input 
        v-model.number="pageInput"
        type="number"
        :min="1"
        :max="totalPages"
        @keyup.enter="jumpToPage"
        class="page-input"
        placeholder="Page #"
      />
      <button @click="jumpToPage" class="btn btn-jump">Go</button>
    </div>
  `,
  data() {
    return {
      pageInput: null
    };
  },
  props: {
    currentPage: Number,
    totalPages: Number
  },
  methods: {
    jumpToPage() {
      const page = parseInt(this.pageInput, 10);
      if (page >= 1 && page <= this.totalPages) {
        this.$emit('change-page', page);
        this.pageInput = null;
      }
    }
  }
};

/**
 * API Client with Pagination Support
 * Handles pagination logic at API layer
 */
export class PaginatedApiClient {
  constructor(baseURL) {
    this.baseURL = baseURL;
    this.cache = new Map();
  }

  /**
   * Fetch paginated data
   */
  async fetchPage(endpoint, page = 1, limit = 50, options = {}) {
    const cacheKey = `${endpoint}:${page}:${limit}`;
    
    // Check cache
    if (!options.skipCache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const url = new URL(`${this.baseURL}${endpoint}`);
      url.searchParams.append('page', page);
      url.searchParams.append('limit', limit);

      const response = await fetch(url, {
        headers: {
          'Authorization': options.token ? `Bearer ${options.token}` : '',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      // Cache result
      this.cache.set(cacheKey, data);
      
      // Auto-clear cache after 5 minutes
      setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000);

      return data;
    } catch (error) {
      console.error(`Failed to fetch ${endpoint}:`, error);
      throw error;
    }
  }

  /**
   * Fetch all items (multiple pages)
   */
  async fetchAll(endpoint, limit = 50, options = {}) {
    const allItems = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const { data, meta } = await this.fetchPage(endpoint, page, limit, options);
      allItems.push(...data);
      hasMore = meta.hasNext;
      page++;
    }

    return allItems;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

/**
 * CSS Styles for Pagination Components
 */
export const paginationStyles = `
.pagination-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 1rem;
  margin: 1rem 0;
}

.pagination-info {
  font-weight: 500;
  color: #333;
}

.total-items {
  font-size: 0.9em;
  color: #666;
}

.pagination-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin: 1rem 0;
  flex-wrap: wrap;
}

.btn-page {
  min-width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-page:hover {
  background: #f0f0f0;
}

.btn-page.active {
  background: #007bff;
  color: white;
  border-color: #007bff;
}

.btn-page:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination-ellipsis {
  padding: 0.5rem;
  color: #999;
}

.btn-pagination {
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-pagination:hover:not(:disabled) {
  background: #f0f0f0;
  border-color: #999;
}

.btn-pagination:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.infinite-scroll-container {
  position: relative;
  overflow-y: auto;
}

.infinite-scroll-sentinel {
  height: 20px;
  margin: 1rem 0;
}

.loading-indicator {
  text-align: center;
  padding: 1rem;
  color: #666;
}

.end-of-list {
  text-align: center;
  padding: 1rem;
  color: #999;
  font-size: 0.9em;
}

.jump-to-page {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.page-input {
  width: 60px;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1em;
}

.btn-jump {
  padding: 0.5rem 1rem;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-jump:hover {
  background: #0056b3;
}
`;

export default {
  PaginationManager,
  PaginationButtons,
  PaginationIndicator,
  InfiniteScrollPagination,
  JumpToPage,
  PaginatedApiClient,
  paginationStyles
};
