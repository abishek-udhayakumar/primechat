/**
 * PrimeChat — Sidebar & Conversation List
 * Uses new avatar-wrapper + status-dot CSS pattern
 */

'use strict';

const CONV_PAGE_SIZE = 20;
let _convOffset  = 0;
let _convHasMore = true;
let _convLoading = false;
let _convObserver = null; // IntersectionObserver for infinite scroll

window.initSidebar = () => {
    _loadConversationPage(true); // initial load
    _bindSearch();

    document.getElementById('newChatBtn')?.addEventListener('click', () => {
        document.getElementById('searchInput')?.focus();
    });

    // Sidebar kept fresh by notifications.js polling
};

// Called by notifications.js polling (full refresh of visible conversations)
window.loadConversations = async function loadConversations() {
    try {
        const res = await api(`/chat/conversations?limit=${CONV_PAGE_SIZE}&offset=0`);
        if (res?.success) {
            window.appState.conversations = _remapConversations(res.data.conversations);
            _convOffset  = window.appState.conversations.length;
            _convHasMore = res.data.has_more ?? false;
            renderConversations();
            _setupInfiniteScroll();
        }
    } catch (e) {
        console.error('[PrimeChat] loadConversations failed', e);
    }
};

// Load the next page (called by IntersectionObserver or scroll)
async function _loadConversationPage(reset = false) {
    if (_convLoading) return;
    if (!reset && !_convHasMore) return;

    _convLoading = true;

    if (reset) {
        _convOffset  = 0;
        _convHasMore = true;
    }

    try {
        const res = await api(`/chat/conversations?limit=${CONV_PAGE_SIZE}&offset=${_convOffset}`);
        if (!res?.success) return;

        const newConvs = _remapConversations(res.data.conversations || []);
        _convHasMore   = res.data.has_more ?? false;

        if (reset) {
            window.appState.conversations = newConvs;
        } else {
            // Append, deduplicating by id
            const existingIds = new Set(window.appState.conversations.map(c => c.conversation_id));
            newConvs.forEach(c => {
                if (!existingIds.has(c.conversation_id)) {
                    window.appState.conversations.push(c);
                }
            });
        }

        _convOffset = window.appState.conversations.length;
        renderConversations();
        _setupInfiniteScroll(); // re-attach sentinel
    } catch (e) {
        console.error('[PrimeChat] Conversation page load failed', e);
    } finally {
        _convLoading = false;
    }
}

// Remap shorthand API response to full object
function _remapConversations(list) {
    return (list || []).map(conv => {
        // Support both shorthand and full format
        if (conv.other_user) return conv; // already full
        return {
            conversation_id : conv.i,
            type            : conv.t,
            unread_count    : conv.uc ?? 0,
            other_user      : {
                id           : conv.u?.i,
                username     : conv.u?.u,
                display_name : conv.u?.n,
                avatar_url   : conv.u?.a,
                status       : conv.u?.s,
                about        : conv.u?.ab,
            },
            last_message    : conv.m ? {
                content  : conv.m.c,
                time     : conv.m.tm,
                is_mine  : conv.m.im,
                type     : conv.m.ty,
            } : null,
        };
    });
}

// Attach IntersectionObserver sentinel to load next page
function _setupInfiniteScroll() {
    const list = document.getElementById('conversationList');
    if (!list) return;

    // Disconnect old observer
    if (_convObserver) { _convObserver.disconnect(); _convObserver = null; }

    if (!_convHasMore) {
        // Remove any existing sentinel
        list.querySelector('.conv-load-sentinel')?.remove();
        return;
    }

    let sentinel = list.querySelector('.conv-load-sentinel');
    if (!sentinel) {
        sentinel = document.createElement('div');
        sentinel.className = 'conv-load-sentinel';
        sentinel.style.cssText = 'height:1px;width:100%;';
        list.appendChild(sentinel);
    }

    if (!('IntersectionObserver' in window)) {
        // Fallback: load on scroll
        list.addEventListener('scroll', () => {
            if (list.scrollTop + list.clientHeight >= list.scrollHeight - 40) {
                _loadConversationPage();
            }
        }, { passive: true });
        return;
    }

    _convObserver = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) _loadConversationPage();
    }, { root: list, threshold: 0.1 });
    _convObserver.observe(sentinel);
}

function renderConversations() {
    const list = document.getElementById('conversationList');
    if (!list) return;

    const conversations = window.appState.conversations || [];

    if (!conversations.length) {
        list.innerHTML = `
            <div class="py-10 px-4 text-center text-secondary text-sm leading-relaxed flex flex-col items-center justify-center gap-1">
                <svg class="w-10 h-10 text-tertiary mb-3 animate-orb-float" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span>No conversations yet.</span>
                <span class="text-xs text-tertiary">Search for a contact to start chatting.</span>
            </div>`;
        return;
    }

    // Build a map of what's currently in the DOM
    const existingItems = {};
    list.querySelectorAll('.conversation-item[data-conv-id]').forEach(el => {
        existingItems[el.dataset.convId] = el;
    });

    const chatOpen = !document.getElementById('activeChatView')?.classList.contains('hidden');
    const desiredOrder = conversations.map(c => String(c.conversation_id));

    // Check if order matches current DOM order
    const currentOrder = Array.from(list.querySelectorAll('.conversation-item[data-conv-id]')).map(el => el.dataset.convId);
    const orderChanged = desiredOrder.length !== currentOrder.length ||
        desiredOrder.some((id, i) => id !== currentOrder[i]);

    // Update or create each item
    const frag = orderChanged ? document.createDocumentFragment() : null;

    conversations.forEach(conv => {
        const convIdStr = String(conv.conversation_id);
        const isActive  = chatOpen && window.appState.activeConversationId === conv.conversation_id;
        const user      = conv.other_user;
        const lastMsg   = conv.last_message;
        const existing  = existingItems[convIdStr];

        if (existing && !orderChanged) {
            // ── DIFF UPDATE: only patch changed parts ──
            const hasUnread = conv.unread_count > 0 && !isActive;
            existing.className = `conversation-item${isActive ? ' active' : ''}${hasUnread ? ' unread' : ''}`;

            // Update status dot
            const dot = existing.querySelector('.status-dot');
            if (dot) dot.className = `status-dot${user.status === 'online' ? ' online' : ''}`;

            // Update time
            const time = existing.querySelector('.conversation-item-time');
            if (time) time.textContent = formatTime(lastMsg?.time);

            // Update preview text
            const previewSpan = existing.querySelector('.conversation-item-preview span:last-child');
            if (previewSpan) previewSpan.textContent = lastMsg?.content || '';

            // Update badge
            const badgeWrap = existing.querySelector('.conversation-unread');
            if (badgeWrap) {
                if (conv.unread_count > 0 && !isActive) {
                    badgeWrap.innerHTML = `<div class="badge">${conv.unread_count > 99 ? '99+' : conv.unread_count}</div>`;
                } else {
                    badgeWrap.innerHTML = '';
                }
            }
        } else {
            // ── FULL BUILD: new item or order changed ──
            const item = _buildConversationItem(conv, isActive);
            if (frag) {
                frag.appendChild(item);
            } else {
                // Shouldn't reach here, but safety
                list.appendChild(item);
            }
        }

        delete existingItems[convIdStr];
    });

    // If order changed, replace entire list contents
    if (orderChanged && frag) {
        list.innerHTML = '';
        list.appendChild(frag);
    }

    // Remove items no longer in the list
    Object.values(existingItems).forEach(el => el.remove());
}

/** Build a single conversation item DOM node */
function _buildConversationItem(conv, isActive) {
    const user    = conv.other_user;
    const lastMsg = conv.last_message;

    const item = document.createElement('div');
    const hasUnread = conv.unread_count > 0 && !isActive;
    item.className = `conversation-item${isActive ? ' active' : ''}${hasUnread ? ' unread' : ''}`;
    item.dataset.convId = conv.conversation_id;
    item.addEventListener('click', () => openConversation(conv.conversation_id, user));

    // Avatar with status dot
    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'avatar-wrapper';
    avatarWrap.innerHTML = createAvatar(user, 'avatar--md');
    const dot = document.createElement('div');
    dot.className = `status-dot${user.status === 'online' ? ' online' : ''}`;
    avatarWrap.appendChild(dot);

    // Content
    const content = document.createElement('div');
    content.className = 'conversation-item-content';

    // Top row: name + time
    const top = document.createElement('div');
    top.className = 'conversation-item-top';
    top.innerHTML = `
        <div class="conversation-item-name">${escapeHTML(user.display_name)}</div>
        <div class="conversation-item-time">${formatTime(lastMsg?.time)}</div>`;

    // Bottom row: preview + badge
    const bottom = document.createElement('div');
    bottom.className = 'conversation-item-bottom';

    const preview = document.createElement('div');
    preview.className = 'conversation-item-preview';

    if (lastMsg?.is_mine) {
        const ticks = document.createElement('span');
        ticks.className = 'mini-ticks';
        ticks.innerHTML = `<svg viewBox="0 0 24 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6 6 10 14 2"/><polyline points="10 10 14 14 22 6"/></svg>`;
        preview.appendChild(ticks);
    }

    const previewText = document.createElement('span');
    previewText.textContent = lastMsg?.content || '';
    preview.appendChild(previewText);

    const badgeWrap = document.createElement('div');
    badgeWrap.className = 'conversation-unread';
    if (conv.unread_count > 0 && !isActive) {
        const badge = document.createElement('div');
        badge.className = 'badge';
        badge.textContent = conv.unread_count > 99 ? '99+' : conv.unread_count;
        badgeWrap.appendChild(badge);
    }

    bottom.appendChild(preview);
    bottom.appendChild(badgeWrap);
    content.appendChild(top);
    content.appendChild(bottom);
    item.appendChild(avatarWrap);
    item.appendChild(content);

    return item;
}

async function performSearch(query) {
    const resultsEl = document.getElementById('searchResults');
    resultsEl.innerHTML = `<div class="p-6 text-center"><div class="spinner spinner--md mx-auto"></div></div>`;
    resultsEl.classList.add('show');

    try {
        const res = await api(`/search/users?q=${encodeURIComponent(query)}`);
        if (!res?.success) return;

        const users = res.data.users || [];
        const frag  = document.createDocumentFragment();

        const title = document.createElement('div');
        title.className = 'search-results-title';
        title.textContent = users.length ? 'People' : 'No results';
        frag.appendChild(title);

        users.forEach(user => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `
                ${createAvatar(user, 'avatar--md')}
                <div class="search-result-info">
                    <div class="search-result-name">${escapeHTML(user.display_name)}</div>
                    <div class="search-result-sub">@${escapeHTML(user.username)}</div>
                </div>`;
            item.addEventListener('click', () => startNewChat(user.id, user));
            frag.appendChild(item);
        });

        resultsEl.innerHTML = '';
        resultsEl.appendChild(frag);
    } catch (e) {
        console.error('[PrimeChat] Search failed', e);
    }
}

window.startNewChat = (recipientId, userObj) => {
    // Clear search
    document.getElementById('searchResults').classList.remove('show');
    document.getElementById('searchInput').value = '';
    document.getElementById('searchClear').classList.remove('show');

    // Check if existing conversation
    const existing = window.appState.conversations.find(c => c.other_user.id === recipientId);
    if (existing) {
        openConversation(existing.conversation_id, existing.other_user);
        return;
    }

    // New conversation — set up state, conversation created on first send
    window.appState.activeConversationId = null;
    window.appState.activeOtherUser      = userObj;
    window.appState.messages             = [];
    window.appState.lastMessageId        = 0;

    document.getElementById('chatEmpty').classList.add('hidden');
    document.getElementById('activeChatView').classList.remove('hidden');

    document.getElementById('chatHeaderName').textContent = userObj.display_name;
    document.getElementById('chatHeaderAvatar').innerHTML = createAvatar(userObj);
    document.getElementById('chatHeaderStatus').textContent =
        userObj.status === 'online' ? 'online' : 'offline';
    document.getElementById('chatHeaderStatus').className =
        `chat-header-status${userObj.status === 'online' ? ' online' : ''}`;

    // Show start-of-conversation system message
    const container = document.getElementById('messagesContainer');
    container.innerHTML = '';
    const sysMsg = document.createElement('div');
    sysMsg.className = 'message-system';
    sysMsg.innerHTML = `<span>Start of your conversation with ${escapeHTML(userObj.display_name)}</span>`;
    container.appendChild(sysMsg);

    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.add('hidden-mobile');
    }

    document.getElementById('messageInput')?.focus();
};

function _bindSearch() {
    const input = document.getElementById('searchInput');
    const clear = document.getElementById('searchClear');
    if (!input) return;

    input.addEventListener('input', debounce(e => {
        const q = e.target.value.trim();
        clear?.classList.toggle('visible', q.length > 0);
        if (q.length > 0) {
            performSearch(q);
        } else {
            document.getElementById('searchResults').classList.remove('show');
        }
    }, 300));

    clear?.addEventListener('click', () => {
        input.value = '';
        clear.classList.remove('visible');
        document.getElementById('searchResults').classList.remove('show');
        input.focus();
    });
}
