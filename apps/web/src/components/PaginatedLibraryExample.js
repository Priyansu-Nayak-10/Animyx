/**
 * Example Usage: Paginated Library Component
 * 
 * Shows how to integrate PaginationManager with a Vue component
 * Demonstrates: loading paginated data, managing page state, rendering list
 */

import {
  PaginationManager,
  PaginationButtons,
  PaginationIndicator,
  JumpToPage,
  PaginatedApiClient
} from './Pagination.js';

export default {
  name: 'PaginatedLibrary',
  components: {
    PaginationButtons,
    PaginationIndicator,
    JumpToPage
  },
  template: `
    <div class="paginated-library">
      <!-- Header -->
      <div class="library-header">
        <h2>My Anime Library</h2>
        <div class="filter-bar">
          <select v-model="statusFilter" @change="resetAndFetch">
            <option value="">All Status</option>
            <option value="watching">Watching</option>
            <option value="completed">Completed</option>
            <option value="paused">Paused</option>
          </select>
          <input 
            v-model="searchQuery"
            @input="debouncedSearch"
            placeholder="Search library..."
            type="text"
          />
        </div>
      </div>

      <!-- Content Area -->
      <div class="library-content">
        <!-- Loading State -->
        <div v-if="isLoading" class="loading-state">
          <div class="spinner"></div>
          Loading anime...
        </div>

        <!-- Error State -->
        <div v-if="error" class="error-state">
          <p>{{ error }}</p>
          <button @click="resetAndFetch" class="btn">Retry</button>
        </div>

        <!-- Empty State -->
        <div v-if="!isLoading && !error && items.length === 0" class="empty-state">
          <p>No anime in your library</p>
        </div>

        <!-- Data Grid -->
        <div v-if="!isLoading && items.length > 0" class="anime-grid">
          <div 
            v-for="anime in items"
            :key="anime.id"
            class="anime-card"
          >
            <img :src="anime.image_url" :alt="anime.title" class="anime-image" />
            <div class="anime-info">
              <h3>{{ anime.title }}</h3>
              <p class="status">{{ anime.status }}</p>
              <p class="progress" v-if="anime.episodes_watched">
                {{ anime.episodes_watched }} / {{ anime.total_episodes }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination Controls -->
      <div v-if="totalPages > 1" class="pagination-area">
        <div class="pagination-options">
          <label>
            Items per page:
            <select v-model.number="pagination.pageSize" @change="resetAndFetch">
              <option :value="10">10</option>
              <option :value="25">25</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
          </label>
          
          <jump-to-page 
            :current-page="pagination.currentPage"
            :total-pages="totalPages"
            @change-page="goToPage"
          />
        </div>

        <!-- Main Pagination Controls -->
        <pagination-buttons
          :current-page="pagination.currentPage"
          :total-pages="totalPages"
          :total-count="pagination.totalCount"
          :has-next="hasNextPage"
          :has-previous="hasPreviousPage"
          @change-page="goToPage"
        />

        <!-- Page Number Indicator -->
        <pagination-indicator
          :current-page="pagination.currentPage"
          :total-pages="totalPages"
          :page-numbers="pageNumbers"
          @change-page="goToPage"
        />
      </div>

      <!-- Footer Info -->
      <div v-if="items.length > 0" class="pagination-footer">
        Showing {{ startItem }} to {{ endItem }} of {{ pagination.totalCount }} items
      </div>
    </div>
  `,

  data() {
    return {
      items: [],
      isLoading: false,
      error: null,
      statusFilter: '',
      searchQuery: '',
      searchTimeout: null,
      
      pagination: new PaginationManager({
        currentPage: 1,
        pageSize: 25,
        totalCount: 0
      }),

      // API Client
      apiClient: new PaginatedApiClient(process.env.VUE_APP_API_URL)
    };
  },

  computed: {
    totalPages() {
      return this.pagination.totalPages;
    },

    hasNextPage() {
      return this.pagination.hasNextPage;
    },

    hasPreviousPage() {
      return this.pagination.hasPreviousPage;
    },

    pageNumbers() {
      return this.pagination.pageNumbers;
    },

    startItem() {
      if (this.items.length === 0) return 0;
      return (this.pagination.currentPage - 1) * this.pagination.pageSize + 1;
    },

    endItem() {
      return Math.min(
        this.pagination.currentPage * this.pagination.pageSize,
        this.pagination.totalCount
      );
    }
  },

  methods: {
    /**
     * Fetch data from API
     */
    async fetchData() {
      this.isLoading = true;
      this.error = null;

      try {
        const endpoint = '/api/users/me/followed';
        const params = new URLSearchParams({
          page: this.pagination.currentPage,
          limit: this.pagination.pageSize,
          status: this.statusFilter,
          search: this.searchQuery
        });

        const url = `${endpoint}?${params}`;
        const response = await this.apiClient.fetchPage(
          url.replace(process.env.VUE_APP_API_URL, ''),
          this.pagination.currentPage,
          this.pagination.pageSize,
          { token: this.$store.state.authToken }
        );

        this.items = response.data;
        this.pagination.updateTotal(response.meta.totalCount);

      } catch (err) {
        this.error = err.message || 'Failed to load anime';
        this.items = [];
      } finally {
        this.isLoading = false;
      }
    },

    /**
     * Navigate to specific page
     */
    goToPage(pageNum) {
      if (this.pagination.goToPage(pageNum)) {
        this.fetchData();
        this.scrollToTop();
      }
    },

    /**
     * Reset pagination and fetch
     */
    resetAndFetch() {
      this.pagination.currentPage = 1;
      this.fetchData();
    },

    /**
     * Debounced search
     */
    debouncedSearch() {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        this.resetAndFetch();
      }, 300);
    },

    /**
     * Scroll to top of content area
     */
    scrollToTop() {
      this.$el.querySelector('.library-content').scrollTop = 0;
    }
  },

  mounted() {
    this.fetchData();
  },

  beforeUnmount() {
    clearTimeout(this.searchTimeout);
  }
};
