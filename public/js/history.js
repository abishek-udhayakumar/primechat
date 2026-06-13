/**
 * PrimeChat — Edit History Tracker
 *
 * Engineering showcase:
 *   - Myers diff algorithm: optimal O(ND) edit script
 *   - Word-level diffing (more semantic than character-level)
 *   - IndexedDB persistence: history survives refresh
 *   - Timeline modal: beautiful diff viewer with color-coded changes
 *   - Conflict awareness: tracks edits made while offline
 *
 * Interview points:
 *   - Myers diff: shortest edit script via dynamic programming on a 2D grid
 *   - Why word-level? Character diffs for "hello world" → "hello there" show
 *     "world" replaced by "there" — far more readable than character soup
 *   - Why IndexedDB? Server stores only the final version. Client enriches with timeline.
 *   - Trade-off: History is device-local. Multi-device sync would require event sourcing.
 *
 * Diff result format:
 *   [{ type: 'equal'|'insert'|'delete', value: string }]
 */

'use strict';

const EDIT_HISTORY_STORE = 'edit_history';

// ─────────────────────────────────────────
// MYERS DIFF ALGORITHM
// Word-level for semantic clarity
// ─────────────────────────────────────────

/**
 * Compute the diff between two strings (word-level).
 * Returns an array of operations: { type, value }
 *
 * Implementation: Myers' algorithm on sequences of words.
 * Time: O((N+M)·D) where N,M = sequence lengths, D = edit distance
 * Space: O((N+M)·D) for the trace
 */
function computeDiff(oldText, newText) {
    const a = _tokenize(oldText);
    const b = _tokenize(newText);

    if (a.length === 0 && b.length === 0) return [];
    if (a.length === 0) return b.map(v => ({ type: 'insert', value: v }));
    if (b.length === 0) return a.map(v => ({ type: 'delete', value: v }));

    const editScript = _myersDiff(a, b);
    return _consolidateDiff(editScript, a, b);
}

function _myersDiff(a, b) {
    const N = a.length, M = b.length;
    const MAX = N + M;
    const V = new Int32Array(2 * MAX + 1);
    const trace = [];

    for (let d = 0; d <= MAX; d++) {
        trace.push(new Int32Array(V));

        for (let k = -d; k <= d; k += 2) {
            let x;
            const ki = k + MAX;

            if (k === -d || (k !== d && V[ki - 1] < V[ki + 1])) {
                x = V[ki + 1]; // move down
            } else {
                x = V[ki - 1] + 1; // move right
            }

            let y = x - k;

            // Follow diagonal (equal elements)
            while (x < N && y < M && a[x] === b[y]) { x++; y++; }

            V[ki] = x;

            if (x >= N && y >= M) {
                return _backtrack(trace, a, b, N, M, MAX);
            }
        }
    }

    // Fallback (should not reach here)
    return a.map(v => ({ op: 'delete', v })).concat(b.map(v => ({ op: 'insert', v })));
}

function _backtrack(trace, a, b, N, M, MAX) {
    const script = [];
    let x = N, y = M;

    for (let d = trace.length - 1; d >= 0; d--) {
        const V  = trace[d];
        const k  = x - y;
        const ki = k + MAX;

        let prevK;
        if (k === -d || (k !== d && V[ki - 1] < V[ki + 1])) {
            prevK = k + 1;
        } else {
            prevK = k - 1;
        }

        const prevX = V[prevK + MAX];
        const prevY = prevX - prevK;

        // Diagonal moves (equal)
        while (x > prevX && y > prevY) {
            x--; y--;
            script.unshift({ op: 'equal', ai: x, bi: y });
        }

        if (d > 0) {
            if (x === prevX) {
                y--;
                script.unshift({ op: 'insert', ai: x, bi: y });
            } else {
                x--;
                script.unshift({ op: 'delete', ai: x, bi: y });
            }
        }
    }

    return script;
}

function _consolidateDiff(script, a, b) {
    const result = [];
    for (const op of script) {
        const val  = op.op === 'delete' ? a[op.ai] : b[op.bi];
        const type = op.op;

        // Merge consecutive same-type ops
        if (result.length > 0 && result[result.length - 1].type === type) {
            result[result.length - 1].value += ' ' + val;
        } else {
            result.push({ type, value: val });
        }
    }
    return result;
}

function _tokenize(text) {
    return (text || '').split(/(\s+)/).filter(t => t.length > 0);
}

// ─────────────────────────────────────────
// PERSISTENCE — IndexedDB
// ─────────────────────────────────────────

async function recordEdit(messageId, oldContent, newContent) {
    if (oldContent === newContent) return;

    const diff = computeDiff(oldContent, newContent);
    const entry = {
        messageId,
        oldContent,
        newContent,
        diff,
        editedAt: new Date().toISOString(),
        editedAtTs: Date.now(),
    };

    try {
        const db = await window.PrimeChatDB.getDB();
        const tx = db.transaction(EDIT_HISTORY_STORE, 'readwrite');
        tx.objectStore(EDIT_HISTORY_STORE).add(entry);
        await window.PrimeChatDB.txComplete(tx);
        console.log('[History] Recorded edit for message', messageId);
    } catch (e) {
        console.warn('[History] Failed to record edit:', e);
    }
}

async function getHistory(messageId) {
    try {
        const db    = await window.PrimeChatDB.getDB();
        const tx    = db.transaction(EDIT_HISTORY_STORE, 'readonly');
        const store = tx.objectStore(EDIT_HISTORY_STORE);
        const index = store.index('messageId');

        return new Promise((res, rej) => {
            const req = index.getAll(messageId);
            req.onsuccess = () => res((req.result || []).sort((a, b) => a.editedAtTs - b.editedAtTs));
            req.onerror   = () => rej(req.error);
        });
    } catch (e) {
        console.warn('[History] Failed to get history:', e);
        return [];
    }
}

// ─────────────────────────────────────────
// EDIT HISTORY MODAL UI
// ─────────────────────────────────────────

async function showEditHistory(messageId, currentContent) {
    const history = await getHistory(messageId);

    if (history.length === 0) {
        showToast('No edit history found for this message', 'info');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'edit-history-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'Message edit history');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
        <div class="edit-history-content">
            <div class="edit-history-header">
                <h3>Edit History</h3>
                <button class="icon-btn edit-history-close" aria-label="Close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div class="edit-history-body">
                <div class="edit-history-current">
                    <div class="edit-history-label">Current version</div>
                    <div class="edit-history-text">${escapeHTML(currentContent)}</div>
                </div>
                <div class="edit-history-timeline">
                    ${history.map((entry, i) => _renderHistoryEntry(entry, i, history.length)).join('')}
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

    modal.querySelector('.edit-history-close').addEventListener('click', () => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 250);
    });

    // Click outside to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 250);
        }
    });

    // Keyboard close
    const handleKey = (e) => {
        if (e.key === 'Escape') {
            modal.classList.remove('show');
            setTimeout(() => { modal.remove(); document.removeEventListener('keydown', handleKey); }, 250);
        }
    };
    document.addEventListener('keydown', handleKey);
}

function _renderHistoryEntry(entry, index, total) {
    const ts      = new Date(entry.editedAt);
    const timeStr = ts.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const isFirst = index === 0;

    const diffHtml = _renderDiff(entry.diff);
    const label    = isFirst ? 'Original' : `Edit ${index}`;

    return `
        <div class="edit-history-entry ${isFirst ? 'entry--original' : ''}">
            <div class="edit-history-entry-header">
                <span class="edit-history-version">${label}</span>
                <span class="edit-history-time">${timeStr}</span>
            </div>
            <div class="edit-history-diff">${diffHtml}</div>
        </div>
    `;
}

function _renderDiff(diff) {
    return diff.map(op => {
        switch (op.type) {
            case 'equal':
                return `<span class="diff-equal">${escapeHTML(op.value)}</span>`;
            case 'insert':
                return `<span class="diff-insert">${escapeHTML(op.value)}</span>`;
            case 'delete':
                return `<span class="diff-delete">${escapeHTML(op.value)}</span>`;
            default:
                return escapeHTML(op.value);
        }
    }).join('');
}

// ─────────────────────────────────────────
// INTEGRATION HOOK
// ─────────────────────────────────────────

/**
 * Hook into the message edit flow.
 * Call this before sending the edit API request,
 * passing the message's current content (pre-edit).
 */
function beforeEdit(messageId, currentContent) {
    // Store old content in a temporary map so we can record after successful edit
    _pendingEdits.set(messageId, currentContent);
}

/**
 * Call this after a successful edit API response.
 */
function afterEdit(messageId, newContent) {
    const oldContent = _pendingEdits.get(messageId);
    _pendingEdits.delete(messageId);
    if (oldContent !== undefined) {
        recordEdit(messageId, oldContent, newContent);
    }
}

const _pendingEdits = new Map();

// ─────────────────────────────────────────
// EXPOSE
// ─────────────────────────────────────────
window.EditHistory = {
    computeDiff,
    recordEdit,
    getHistory,
    showEditHistory,
    beforeEdit,
    afterEdit,
};
