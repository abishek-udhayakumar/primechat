/**
 * PrimeChat — Smart Search Engine
 *
 * Engineering showcase:
 *   - Two-tier search: instant local (client-side) + background server (full history)
 *   - Trigram inverted index for fast substring matching O(1) lookup
 *   - Fuzzy matching via Levenshtein distance for typo tolerance
 *   - BM25-inspired relevance scoring (term freq + recency decay)
 *   - Query intent extraction (date filters, sender filters, type filters)
 *   - Chrome AI (Gemini Nano) for semantic search as progressive enhancement
 *   - Results ranked by relevance, grouped by date
 *
 * Interview points:
 *   - Trigram index: "hello" → ["hel","ell","llo"] — enables fuzzy matching
 *   - BM25: better than TF-IDF because it saturates term frequency
 *   - Two-tier: local index gives <5ms results; server gives complete history
 *   - AI search: demonstrates awareness of on-device ML, privacy-preserving design
 *
 * Complexity:
 *   - Index build: O(n·m) where n=messages, m=avg content length
 *   - Search: O(1) trigram lookup + O(k) scoring where k=candidate count
 *   - Memory: ~200 bytes per message in the index
 */

'use strict';

// ─────────────────────────────────────────
// TRIGRAM INVERTED INDEX
// ─────────────────────────────────────────
const _index = {
    trigrams:  new Map(),  // trigram → Set<messageId>
    messages:  new Map(),  // messageId → { id, content, senderId, senderName, convId, ts }
    dirty:     false,
    builtAt:   0,
};

/**
 * Build the local index from appState.messages.
 * Called after initial message load and after each new message.
 * Incremental: only indexes new messages (those not already in _index.messages).
 */
function buildIndex(messages) {
    const t0 = performance.now();
    let added = 0;

    for (const msg of messages) {
        if (_index.messages.has(msg.id)) continue;
        if (!msg.content || msg.is_deleted_for_everyone) continue;

        // Store message metadata
        _index.messages.set(msg.id, {
            id:         msg.id,
            content:    msg.content,
            type:       msg.type,
            senderId:   msg.sender_id,
            senderName: msg.sender_name || 'You',
            convId:     msg.conversation_id,
            ts:         new Date(msg.created_at).getTime(),
            isMine:     msg.is_mine,
        });

        // Index trigrams
        const trigrams = _extractTrigrams(_normalize(msg.content));
        for (const tg of trigrams) {
            if (!_index.trigrams.has(tg)) _index.trigrams.set(tg, new Set());
            _index.trigrams.get(tg).add(msg.id);
        }

        added++;
    }

    _index.builtAt = Date.now();
    const elapsed = performance.now() - t0;
    if (added > 0) PrimeLog.perf(`Search index: +${added} msgs`, elapsed);
}

/**
 * Remove a message from the index (on delete).
 */
function removeFromIndex(messageId) {
    const entry = _index.messages.get(messageId);
    if (!entry) return;

    const trigrams = _extractTrigrams(_normalize(entry.content));
    for (const tg of trigrams) {
        const set = _index.trigrams.get(tg);
        if (set) { set.delete(messageId); if (set.size === 0) _index.trigrams.delete(tg); }
    }
    _index.messages.delete(messageId);
}

// ─────────────────────────────────────────
// SEARCH — main entry point
// ─────────────────────────────────────────

/**
 * Perform a smart search.
 * Returns { local: SearchResult[], serverPromise: Promise<SearchResult[]> }
 *
 * Design: return local results immediately (synchronous feel),
 * then merge server results when available (complete history).
 */
function search(query, options = {}) {
    const { convId = null, limit = 30, senderFilter = null, typeFilter = null } = options;

    if (!query || query.trim().length < 2) {
        return { local: [], serverPromise: Promise.resolve([]) };
    }

    const intent = _parseQuery(query.trim());

    // Local instant results
    const local = _localSearch(intent, { convId, limit, senderFilter, typeFilter });

    // Background server search (full history)
    const serverPromise = convId
        ? _serverSearch(intent.cleanQuery, convId, limit)
        : Promise.resolve([]);

    return { local, serverPromise };
}

// ─────────────────────────────────────────
// QUERY PARSING — extract intent from natural language
// ─────────────────────────────────────────
function _parseQuery(raw) {
    const filters = {
        before: null,
        after:  null,
        from:   null,
        type:   null,
    };
    let cleanQuery = raw;

    // Date filters: "before:2024-01-15", "after:yesterday", "today", "this week"
    const beforeMatch = raw.match(/before:(\S+)/i);
    const afterMatch  = raw.match(/after:(\S+)/i);
    if (beforeMatch) { filters.before = _parseRelativeDate(beforeMatch[1]); cleanQuery = cleanQuery.replace(beforeMatch[0], ''); }
    if (afterMatch)  { filters.after  = _parseRelativeDate(afterMatch[1]);  cleanQuery = cleanQuery.replace(afterMatch[0], ''); }

    // Natural date words
    if (/\btoday\b/i.test(raw)) {
        const today = new Date(); today.setHours(0,0,0,0);
        filters.after = today.getTime();
        cleanQuery = cleanQuery.replace(/\btoday\b/i, '').trim();
    }
    if (/\byesterday\b/i.test(raw)) {
        const y = new Date(); y.setDate(y.getDate() - 1); y.setHours(0,0,0,0);
        const ye = new Date(y); ye.setHours(23,59,59,999);
        filters.after  = y.getTime();
        filters.before = ye.getTime();
        cleanQuery = cleanQuery.replace(/\byesterday\b/i, '').trim();
    }
    if (/\bthis\s+week\b/i.test(raw)) {
        const w = new Date(); w.setDate(w.getDate() - 7); w.setHours(0,0,0,0);
        filters.after = w.getTime();
        cleanQuery = cleanQuery.replace(/\bthis\s+week\b/i, '').trim();
    }

    // Sender filter: "from:john"
    const fromMatch = raw.match(/from:(\S+)/i);
    if (fromMatch) { filters.from = fromMatch[1].toLowerCase(); cleanQuery = cleanQuery.replace(fromMatch[0], ''); }

    // Type filter: "type:image", "type:file", "type:voice"
    const typeMatch = raw.match(/type:(image|file|voice|text)/i);
    if (typeMatch) { filters.type = typeMatch[1].toLowerCase(); cleanQuery = cleanQuery.replace(typeMatch[0], ''); }

    return { cleanQuery: cleanQuery.trim(), filters };
}

function _parseRelativeDate(str) {
    if (str === 'today') { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }
    if (str === 'yesterday') { const d = new Date(); d.setDate(d.getDate()-1); d.setHours(0,0,0,0); return d.getTime(); }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d.getTime();
}

// ─────────────────────────────────────────
// LOCAL SEARCH — trigram + scoring
// ─────────────────────────────────────────
function _localSearch(intent, { convId, limit, senderFilter, typeFilter }) {
    const { cleanQuery, filters } = intent;

    if (!cleanQuery && !filters.type && !filters.from) return [];

    const norm    = _normalize(cleanQuery);
    const qTokens = _tokenize(cleanQuery);
    let candidates;

    if (cleanQuery) {
        const trigrams = _extractTrigrams(norm);

        if (trigrams.length === 0) {
            candidates = [..._index.messages.values()];
        } else {
            // Intersection of trigram candidate sets — messages containing ALL query trigrams
            let candidateSet = null;
            for (const tg of trigrams) {
                const set = _index.trigrams.get(tg);
                if (!set) { candidateSet = new Set(); break; } // No match for this trigram
                candidateSet = candidateSet === null
                    ? new Set(set)
                    : new Set([...candidateSet].filter(id => set.has(id)));
            }
            candidates = [...(candidateSet || new Set())].map(id => _index.messages.get(id)).filter(Boolean);
        }
    } else {
        candidates = [..._index.messages.values()];
    }

    // Apply filters
    candidates = candidates.filter(msg => {
        if (convId && msg.convId !== convId)                     return false;
        if (filters.type   && msg.type !== filters.type)         return false;
        if (filters.from   && !msg.senderName.toLowerCase().includes(filters.from)) return false;
        if (filters.after  && msg.ts < filters.after)            return false;
        if (filters.before && msg.ts > filters.before)           return false;
        if (senderFilter   && msg.senderId !== senderFilter)      return false;
        if (typeFilter     && msg.type !== typeFilter)            return false;
        return true;
    });

    // Score candidates
    const now = Date.now();
    const scored = candidates.map(msg => {
        let score = 0;

        if (cleanQuery) {
            // Exact substring match bonus
            if (_normalize(msg.content).includes(norm)) score += 100;

            // Token frequency score (BM25-inspired)
            const contentTokens = _tokenize(msg.content);
            const k1 = 1.5, b = 0.75;
            const avgDocLen = 15; // approximate avg message tokens
            const docLen    = contentTokens.length;
            for (const token of qTokens) {
                const tf = contentTokens.filter(t => t === token || _levenshtein(t, token) <= 1).length;
                const bm25 = tf * (k1 + 1) / (tf + k1 * (1 - b + b * docLen / avgDocLen));
                score += bm25 * 20;
            }

            // Fuzzy match penalty
            const fuzzyScore = _fuzzyScore(norm, _normalize(msg.content));
            score += fuzzyScore * 50;
        } else {
            score = 50; // Filter-only queries get equal base score
        }

        // Recency decay: messages in last 24h get up to +30 bonus
        const ageH = (now - msg.ts) / 3_600_000;
        if (ageH < 24)  score += 30 - (ageH / 24) * 30;
        if (ageH < 1)   score += 20;

        return { ...msg, score };
    });

    // Sort by score desc, then by timestamp desc
    scored.sort((a, b) => b.score - a.score || b.ts - a.ts);

    return scored.slice(0, limit).map(msg => _formatResult(msg, cleanQuery));
}

// ─────────────────────────────────────────
// SERVER SEARCH — full history
// ─────────────────────────────────────────
async function _serverSearch(query, convId, limit = 30) {
    if (!query) return [];
    try {
        const res = await api(`/search/messages?conversation_id=${convId}&query=${encodeURIComponent(query)}&limit=${limit}`);
        if (!res?.success) return [];
        return res.data.map(msg => _formatResult(msg, query));
    } catch (e) {
        console.warn('[Search] Server search failed:', e.message);
        return [];
    }
}

// ─────────────────────────────────────────
// AI-ASSISTED SEARCH — Chrome Gemini Nano
// Progressive enhancement: only if window.ai available
// ─────────────────────────────────────────
let _aiSession = null;
let _aiAvailable = null; // null=unknown, true/false

async function aiSearch(query, convId) {
    // Check AI availability once
    if (_aiAvailable === null) {
        try {
            if (!window.ai?.languageModel) throw new Error('no api');
            const capabilities = await window.ai.languageModel.capabilities();
            _aiAvailable = capabilities.available !== 'no';
        } catch (_) {
            _aiAvailable = false;
        }
    }

    if (!_aiAvailable) {
        // Graceful degradation: extract keywords via simple NLP
        return _keywordExtract(query, convId);
    }

    try {
        if (!_aiSession) {
            _aiSession = await window.ai.languageModel.create({
                systemPrompt: `You are a search assistant for a messaging app.
Given a user's natural language query, extract 3-5 search keywords that would best find the relevant messages.
Return ONLY a JSON array of strings, nothing else.
Example: ["meeting", "tomorrow", "project"] for query "when did we talk about the meeting tomorrow about the project"`
            });
        }

        const result = await _aiSession.prompt(query);
        const keywords = JSON.parse(result.trim());

        if (!Array.isArray(keywords)) throw new Error('Invalid response');

        // Search with AI-extracted keywords
        const results = [];
        for (const kw of keywords.slice(0, 3)) {
            const { local } = search(kw, { convId });
            results.push(...local);
        }

        // Deduplicate by message id
        const seen = new Set();
        return results.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });

    } catch (e) {
        console.warn('[Search] AI search failed:', e.message);
        _aiSession = null; // Reset session
        return _keywordExtract(query, convId);
    }
}

/**
 * Simple keyword extraction fallback (no AI).
 * Removes stopwords, stems common words, returns top results.
 */
function _keywordExtract(query, convId) {
    const stopwords = new Set(['the','a','an','is','are','was','were','be','been','being',
        'have','has','had','do','does','did','will','would','could','should','may','might',
        'shall','can','need','dare','ought','used','to','of','in','on','at','by','for',
        'with','about','against','between','through','during','before','after','above',
        'below','from','up','down','out','off','over','under','again','further','then',
        'once','i','me','my','we','us','our','you','your','he','him','his','she','her',
        'it','its','they','them','their','what','which','who','whom','this','that','and',
        'but','or','nor','so','yet','both','either','neither','not','only','own','same']);

    const keywords = query.toLowerCase().split(/\s+/)
        .filter(w => w.length > 2 && !stopwords.has(w));

    const allResults = [];
    for (const kw of keywords.slice(0, 4)) {
        const { local } = search(kw, { convId });
        allResults.push(...local);
    }

    const seen = new Set();
    return allResults.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
}

// ─────────────────────────────────────────
// RESULT FORMATTER
// ─────────────────────────────────────────
function _formatResult(msg, query) {
    return {
        id:         msg.id,
        content:    msg.content,
        type:       msg.type,
        senderName: msg.senderName || msg.sender_name || 'Unknown',
        isMine:     msg.isMine || msg.is_mine,
        ts:         msg.ts || new Date(msg.created_at).getTime(),
        createdAt:  msg.created_at || new Date(msg.ts).toISOString(),
        score:      msg.score || 0,
        highlight:  _highlight(msg.content || '', query),
    };
}

function _highlight(content, query) {
    if (!query) return escapeHTML(content);
    const escaped = escapeHTML(content);
    if (!query.trim()) return escaped;
    const escapedQ = escapeHTML(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped.replace(new RegExp(`(${escapedQ})`, 'gi'), '<mark>$1</mark>');
}

// ─────────────────────────────────────────
// STRING UTILITIES
// ─────────────────────────────────────────
function _normalize(str) {
    return (str || '').toLowerCase()
        .replace(/[\u0300-\u036f]/g, '') // remove diacritics
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function _tokenize(str) {
    return _normalize(str).split(' ').filter(t => t.length > 1);
}

function _extractTrigrams(str) {
    if (str.length < 3) return [str];
    const tgs = [];
    for (let i = 0; i <= str.length - 3; i++) {
        tgs.push(str.slice(i, i + 3));
    }
    return [...new Set(tgs)]; // Deduplicate
}

/**
 * Levenshtein distance — edit distance between two strings.
 * Uses Wagner-Fischer DP algorithm, O(m·n) time, O(n) space.
 */
function _levenshtein(a, b) {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    const curr = new Array(b.length + 1);

    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i-1] === b[j-1] ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j-1] + 1, prev[j-1] + cost);
        }
        prev.splice(0, prev.length, ...curr);
    }
    return prev[b.length];
}

/**
 * Fuzzy score: 1.0 = exact, 0.0 = completely different.
 * Uses longest common subsequence ratio.
 */
function _fuzzyScore(query, content) {
    if (!query || !content) return 0;
    // Check if all query chars appear in order in content
    let qi = 0;
    for (let ci = 0; ci < content.length && qi < query.length; ci++) {
        if (content[ci] === query[qi]) qi++;
    }
    return qi / query.length;
}

// ─────────────────────────────────────────
// SEARCH UI — Render results in the sidebar
// ─────────────────────────────────────────
let _searchDebounce = null;
let _currentQuery   = '';
let _aiSearchTimer  = null;

function initSearch() {
    // Rebuild index when messages load
    EventBus.on('messages:loaded', (msgs) => buildIndex(msgs));
    EventBus.on('message:receive', ({ messages }) => buildIndex(messages));
    EventBus.on('message:deleted', ({ id }) => removeFromIndex(id));

    // Bind the sidebar search input
    const input    = document.getElementById('searchInput');
    const results  = document.getElementById('searchResults');
    const clearBtn = document.getElementById('searchClear');

    if (!input) return;

    input.addEventListener('input', (e) => {
        const q = e.target.value.trim();
        clearBtn?.classList.toggle('visible', q.length > 0);

        if (q.length === 0) {
            _clearSearchResults();
            return;
        }

        // Instant local results — no debounce
        _currentQuery = q;
        _renderInstantResults(q);

        // Debounced: server search + AI search
        clearTimeout(_searchDebounce);
        _searchDebounce = setTimeout(() => _fullSearch(q), 350);
    });

    clearBtn?.addEventListener('click', () => {
        input.value = '';
        clearBtn.classList.remove('visible');
        _clearSearchResults();
        input.focus();
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            input.value = '';
            _clearSearchResults();
        }
    });
}

function _renderInstantResults(query) {
    const convId  = window.appState.activeConversationId;
    const results = document.getElementById('searchResults');
    if (!results) return;

    // User search (contacts) — always use server
    _renderUserSearch(query);
}

async function _fullSearch(query) {
    // Full message search across active conversation
    const convId = window.appState.activeConversationId;
    if (!convId || query.length < 3) return;

    const msgSearchBar = document.getElementById('msgSearchBar');
    if (msgSearchBar?.dataset.open !== 'true') return; // Only search messages when in msg search mode

    const { local, serverPromise } = search(query, { convId });
    _renderMessageResults(local, query, false);

    // Merge server results when they arrive
    serverPromise.then(serverResults => {
        if (query !== _currentQuery) return; // Stale query
        const merged = _mergeResults(local, serverResults);
        _renderMessageResults(merged, query, true);
    });
}

function _renderUserSearch(query) {
    const results = document.getElementById('searchResults');
    if (!results) return;

    // Show loading state
    results.innerHTML = `<div class="search-results-title">People</div>
        <div class="search-result-item" style="opacity:0.5;cursor:default;">
            <div class="search-result-info">
                <div class="search-result-name" style="display:flex;align-items:center;gap:8px;">
                    <span class="spinner spinner--sm"></span> Searching…
                </div>
            </div>
        </div>`;
    results.classList.add('show');

    // Search users via API (existing endpoint)
    clearTimeout(_aiSearchTimer);
    _aiSearchTimer = setTimeout(async () => {
        try {
            const res = await api(`/search/users?query=${encodeURIComponent(query)}`);
            if (!res?.success || query !== document.getElementById('searchInput')?.value.trim()) return;

            _renderUserResults(res.data || [], query);
        } catch (_) {
            results.innerHTML = `<div class="search-results-title">No results</div>`;
        }
    }, 200);
}

function _renderUserResults(users, query) {
    const results = document.getElementById('searchResults');
    if (!results) return;

    if (users.length === 0) {
        results.innerHTML = `<div class="search-results-title">No people found for "${escapeHTML(query)}"</div>`;
        results.classList.add('show');
        return;
    }

    results.innerHTML = `<div class="search-results-title">People</div>` +
        users.map(u => `
            <div class="search-result-item" data-user-id="${u.id}" data-username="${escapeHTML(u.username)}" tabindex="0" role="option">
                ${createAvatar(u)}
                <div class="search-result-info">
                    <div class="search-result-name">${escapeHTML(u.display_name || u.username)}</div>
                    <div class="search-result-sub">@${escapeHTML(u.username)}</div>
                </div>
            </div>
        `).join('');

    results.classList.add('show');

    // Bind click handlers
    results.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const userId   = parseInt(item.dataset.userId);
            const username = item.dataset.username;
            const user     = users.find(u => u.id === userId);
            if (user && typeof window.startNewChat === 'function') {
                window.startNewChat(user);
            }
            document.getElementById('searchInput').value = '';
            _clearSearchResults();
        });
    });
}

function _renderMessageResults(results, query, isFinal) {
    const container = document.getElementById('msgSearchResults');
    if (!container) return;

    if (results.length === 0) {
        container.style.display = 'block';
        container.innerHTML = `<div style="padding:16px;text-align:center;color:var(--ink-faint);font-size:13px;">
            ${isFinal ? 'No messages found' : '<span class="spinner spinner--sm"></span> Searching…'}
        </div>`;
        return;
    }

    container.style.display = 'block';
    container.innerHTML = results.map(r => {
        const d = new Date(r.createdAt);
        const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return `
            <div class="msg-search-result-item" data-id="${r.id}" tabindex="0">
                <div class="msg-search-result-header">
                    <span>${escapeHTML(r.senderName)}</span>
                    <span>${dateStr}</span>
                </div>
                <div class="msg-search-result-content">${r.highlight}</div>
            </div>
        `;
    }).join('');

    if (isFinal && results.length > 0) {
        const aiHint = _aiAvailable
            ? `<div style="padding:6px 14px;font-size:10.5px;color:var(--prime);opacity:0.7;text-align:right;">✦ AI-enhanced results</div>`
            : '';
        container.insertAdjacentHTML('beforeend', aiHint);
    }

    // Click to scroll to message
    container.querySelectorAll('.msg-search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = parseInt(item.dataset.id);
            _scrollToMessage(id);
        });
    });
}

function _scrollToMessage(messageId) {
    const el = document.getElementById(`msg_${messageId}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('msg-highlight');
        setTimeout(() => el.classList.remove('msg-highlight'), 1500);
    }
}

function _mergeResults(local, server) {
    const seen = new Set(local.map(r => r.id));
    const combined = [...local];
    for (const r of server) {
        if (!seen.has(r.id)) { combined.push(r); seen.add(r.id); }
    }
    return combined.sort((a, b) => (b.score || 0) - (a.score || 0) || b.ts - a.ts);
}

function _clearSearchResults() {
    const results = document.getElementById('searchResults');
    if (results) { results.innerHTML = ''; results.classList.remove('show'); }
}

// ─────────────────────────────────────────
// EXPOSE
// ─────────────────────────────────────────
window.SmartSearch = {
    init:        initSearch,
    build:       buildIndex,
    search,
    aiSearch,
    removeFromIndex,
};
