/**
 * PrimeChat — Standardized Lazy Loading Module
 * Manages scroll-triggered pagination and scroll stability.
 */

'use strict';

window.LazyLoader = {
    state: {
        isLoading: false,
        hasMore: true,
        renderedIds: new Set(),
        container: null,
        conversationId: null
    },

    init(containerId) {
        this.state.container = document.getElementById(containerId);
        this.reset();
    },

    reset(convId = null) {
        this.state.isLoading = false;
        this.state.hasMore = true;
        this.state.renderedIds.clear();
        this.state.conversationId = convId;
    },

    /**
     * Deduplicate and track rendered message IDs
     */
    track(messages) {
        return messages.filter(msg => {
            if (this.state.renderedIds.has(msg.id)) return false;
            this.state.renderedIds.add(msg.id);
            return true;
        });
    },

    /**
     * Unified scroll handler for lazy loading
     */
    handleScroll(callback) {
        const c = this.state.container;
        if (!c) return;

        // Trigger only when near the top
        if (c.scrollTop < 50 && !this.state.isLoading && this.state.hasMore) {
            callback();
        }
    },

    /**
     * High-performance message prepending with scroll stability
     */
    async loadOlder(fetchFn, renderFn) {
        if (this.state.isLoading || !this.state.hasMore) return;

        const container = this.state.container;
        if (!container) return;

        this.state.isLoading = true;
        
        // Capture height before prepending
        const oldScrollHeight = container.scrollHeight;

        try {
            const data = await fetchFn();
            if (!data) return;

            const newMsgs = this.track(data.messages || []);
            this.state.hasMore = data.hasMore;

            if (newMsgs.length > 0) {
                // Use requestAnimationFrame for smooth DOM insertion
                requestAnimationFrame(() => {
                    renderFn(newMsgs);
                    
                    // Restore exact scroll position
                    // Height compensation: newScrollHeight - oldScrollHeight
                    const compensation = container.scrollHeight - oldScrollHeight;
                    container.scrollTop = compensation;
                    
                    // Double-check on next frame for browser inconsistencies
                    requestAnimationFrame(() => {
                        container.scrollTop = container.scrollHeight - oldScrollHeight;
                    });
                });
            }
        } catch (e) {
            console.error('[LazyLoader] Failed to load history:', e);
        } finally {
            this.state.isLoading = false;
        }
    }
};
