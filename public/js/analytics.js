/**
 * PrimeChat — Delivery Analytics Dashboard
 *
 * Engineering showcase:
 *   - Client-side metric computation (no server round-trip)
 *   - SVG sparklines rendered with pure math (no chart library)
 *   - Privacy-by-design: all data computed from already-fetched messages
 *   - Real metrics: delivery rate, read rate, avg response time, volume by hour
 *   - Responsive layout: adapts to conversation length
 *
 * Interview points:
 *   - Why client-side? The data is already in appState — no new API needed.
 *     This pattern (compute from existing data) is key at product companies.
 *   - SVG sparklines: demonstrates SVG path generation without dependencies
 *   - Response time: calculated as time between message pairs (me → them → me),
 *     which is a proxy for engagement velocity.
 *   - Trade-off: Data only covers messages currently loaded in appState (~200).
 *     Full analytics would need a server-side aggregation endpoint.
 *
 * Metrics computed:
 *   - Total messages sent / received
 *   - Delivery rate (sent vs delivered)
 *   - Read rate (delivered vs read)
 *   - Average response time (me → reply from them)
 *   - Messages by hour of day (24-bucket histogram)
 *   - Messages by day of week (7-bucket histogram)
 *   - Conversation streak (consecutive days with messages)
 */

'use strict';

// ─────────────────────────────────────────
// METRIC COMPUTATION
// ─────────────────────────────────────────

function computeAnalytics(messages) {
    if (!messages || messages.length === 0) {
        return _emptyMetrics();
    }

    const mine   = messages.filter(m => m.is_mine && !m.is_deleted_for_everyone);
    const theirs = messages.filter(m => !m.is_mine && !m.is_deleted_for_everyone);

    // ── Delivery / Read rates ──
    const delivered = mine.filter(m => ['delivered', 'read'].includes(m.read_status));
    const read      = mine.filter(m => m.read_status === 'read');
    const deliveryRate = mine.length ? (delivered.length / mine.length) * 100 : 0;
    const readRate     = mine.length ? (read.length     / mine.length) * 100 : 0;

    // ── Average response time ──
    // For each of my messages, find the next reply from them
    let totalResponseMs = 0, responseCount = 0;
    for (let i = 0; i < mine.length; i++) {
        const sentAt = new Date(mine[i].created_at).getTime();
        // Find first their message after this one
        const reply = theirs.find(m => new Date(m.created_at).getTime() > sentAt);
        if (reply) {
            const replyAt = new Date(reply.created_at).getTime();
            const diffMs  = replyAt - sentAt;
            // Only count reasonable response times (< 24h = likely real response)
            if (diffMs > 0 && diffMs < 86_400_000) {
                totalResponseMs += diffMs;
                responseCount++;
            }
        }
    }
    const avgResponseMs   = responseCount ? totalResponseMs / responseCount : null;
    const avgResponseText = avgResponseMs ? _formatDuration(avgResponseMs) : 'N/A';

    // ── Volume by hour (24-bucket) ──
    const byHour = new Array(24).fill(0);
    for (const m of messages) {
        const h = new Date(m.created_at).getHours();
        byHour[h]++;
    }

    // ── Volume by day of week ──
    const byDay = new Array(7).fill(0);
    for (const m of messages) {
        const d = new Date(m.created_at).getDay(); // 0=Sun
        byDay[d]++;
    }

    // ── Message types breakdown ──
    const types = {};
    for (const m of messages) {
        types[m.type || 'text'] = (types[m.type || 'text'] || 0) + 1;
    }

    // ── Streak: consecutive days with messages ──
    const daysSeen = new Set(messages.map(m => {
        const d = new Date(m.created_at);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }));
    const streak = _computeStreak(daysSeen);

    // ── Peak activity hour ──
    const peakHour    = byHour.indexOf(Math.max(...byHour));
    const peakHourStr = peakHour === -1 ? 'N/A'
        : `${peakHour === 0 ? 12 : peakHour > 12 ? peakHour - 12 : peakHour}${peakHour < 12 ? 'am' : 'pm'}`;

    return {
        total:          messages.length,
        sent:           mine.length,
        received:       theirs.length,
        deliveryRate:   deliveryRate.toFixed(1),
        readRate:       readRate.toFixed(1),
        avgResponseMs,
        avgResponseText,
        byHour,
        byDay,
        types,
        streak,
        peakHourStr,
        firstMessage:   messages[0]?.created_at,
        lastMessage:    messages[messages.length - 1]?.created_at,
    };
}

function _emptyMetrics() {
    return {
        total: 0, sent: 0, received: 0,
        deliveryRate: '0', readRate: '0',
        avgResponseText: 'N/A', avgResponseMs: null,
        byHour: new Array(24).fill(0), byDay: new Array(7).fill(0),
        types: {}, streak: 0, peakHourStr: 'N/A',
    };
}

function _computeStreak(daysSeen) {
    if (daysSeen.size === 0) return 0;
    let streak = 1;
    const today = new Date();
    for (let i = 1; i <= 365; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (daysSeen.has(key)) streak++;
        else break;
    }
    return streak;
}

function _formatDuration(ms) {
    const s  = Math.floor(ms / 1000);
    const m  = Math.floor(s / 60);
    const h  = Math.floor(m / 60);
    if (h > 0)  return `${h}h ${m % 60}m`;
    if (m > 0)  return `${m}m`;
    return `${s}s`;
}

// ─────────────────────────────────────────
// SVG SPARKLINES — no chart library
// ─────────────────────────────────────────

/**
 * Generate a smooth SVG sparkline path from data array.
 * Uses cubic Bezier curves through control points for smoothness.
 */
function generateSparkline(data, width, height, color = 'var(--prime)') {
    if (!data || data.length < 2) return '';

    const max  = Math.max(...data, 1);
    const xStep = width / (data.length - 1);

    const points = data.map((val, i) => ({
        x: i * xStep,
        y: height - (val / max) * (height - 4) - 2,
    }));

    // Smooth path using cardinal spline
    const d = _smoothPath(points);

    // Area fill
    const firstX = points[0].x, lastX = points[points.length - 1].x;
    const areaD  = `${d} L${lastX},${height} L${firstX},${height} Z`;

    const id = `sg-${Math.random().toString(36).slice(2)}`;

    return `
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="overflow:visible;">
            <defs>
                <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
                    <stop offset="100%" stop-color="${color}" stop-opacity="0.0"/>
                </linearGradient>
            </defs>
            <path d="${areaD}" fill="url(#${id})" stroke="none"/>
            <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    `;
}

function _smoothPath(points) {
    if (points.length < 2) return '';

    let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;

    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1], curr = points[i];
        const tension = 0.4;
        const cp1x = prev.x + (curr.x - prev.x) * tension;
        const cp1y = prev.y;
        const cp2x = curr.x - (curr.x - prev.x) * tension;
        const cp2y = curr.y;
        d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
    }

    return d;
}

/**
 * Render a bar chart (for hour/day histograms)
 */
function generateBarChart(data, labels, width, height) {
    const max   = Math.max(...data, 1);
    const barW  = Math.floor((width - data.length * 2) / data.length);
    const barGap = 2;

    const bars = data.map((val, i) => {
        const barH = Math.max((val / max) * (height - 16), val > 0 ? 3 : 0);
        const x    = i * (barW + barGap);
        const y    = height - barH - 16;
        const alpha = 0.3 + (val / max) * 0.7;
        return `
            <rect x="${x}" y="${y}" width="${barW}" height="${barH}"
                  rx="2" fill="var(--prime)" opacity="${alpha.toFixed(2)}"/>
            ${labels && labels[i] ? `<text x="${x + barW/2}" y="${height - 2}" text-anchor="middle"
                  font-size="8" fill="var(--ink-faint)" font-family="Inter,sans-serif">${labels[i]}</text>` : ''}
        `;
    }).join('');

    return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${bars}</svg>`;
}

// ─────────────────────────────────────────
// ANALYTICS MODAL
// ─────────────────────────────────────────

function showAnalytics() {
    const messages = window.appState?.messages || [];
    const user     = window.appState?.activeOtherUser;
    const metrics  = computeAnalytics(messages);

    const existing = document.getElementById('analyticsModal');
    if (existing) existing.remove();

    const dayLabels  = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    const hourLabels = Array.from({ length: 24 }, (_, i) =>
        i % 6 === 0 ? (i === 0 ? '12a' : i === 12 ? '12p' : i > 12 ? `${i-12}p` : `${i}a`) : '');

    const modal = document.createElement('div');
    modal.id        = 'analyticsModal';
    modal.className = 'analytics-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'Conversation analytics');
    modal.setAttribute('aria-modal', 'true');

    const since = metrics.firstMessage
        ? `Since ${new Date(metrics.firstMessage).toLocaleDateString([], { month: 'short', year: 'numeric' })}`
        : '';

    modal.innerHTML = `
        <div class="analytics-panel">
            <div class="analytics-header">
                <div>
                    <h3>Conversation Analytics</h3>
                    <p class="analytics-since">${since}</p>
                </div>
                <button class="icon-btn analytics-close" aria-label="Close analytics">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>

            <div class="analytics-body">

                <!-- Stats grid -->
                <div class="analytics-stats">
                    <div class="analytics-stat">
                        <div class="analytics-stat-value">${metrics.total}</div>
                        <div class="analytics-stat-label">Total Messages</div>
                    </div>
                    <div class="analytics-stat">
                        <div class="analytics-stat-value">${metrics.deliveryRate}%</div>
                        <div class="analytics-stat-label">Delivery Rate</div>
                    </div>
                    <div class="analytics-stat">
                        <div class="analytics-stat-value">${metrics.readRate}%</div>
                        <div class="analytics-stat-label">Read Rate</div>
                    </div>
                    <div class="analytics-stat">
                        <div class="analytics-stat-value">${metrics.avgResponseText}</div>
                        <div class="analytics-stat-label">Avg Response</div>
                    </div>
                </div>

                <!-- Delivery / Read rate bars -->
                <div class="analytics-card">
                    <div class="analytics-card-title">Engagement</div>
                    <div class="analytics-rate-row">
                        <span class="analytics-rate-label">Delivered</span>
                        <div class="analytics-rate-track">
                            <div class="analytics-rate-fill" style="width:${metrics.deliveryRate}%;background:var(--prime);"></div>
                        </div>
                        <span class="analytics-rate-pct">${metrics.deliveryRate}%</span>
                    </div>
                    <div class="analytics-rate-row">
                        <span class="analytics-rate-label">Read</span>
                        <div class="analytics-rate-track">
                            <div class="analytics-rate-fill" style="width:${metrics.readRate}%;background:var(--online);"></div>
                        </div>
                        <span class="analytics-rate-pct">${metrics.readRate}%</span>
                    </div>
                </div>

                <!-- Hourly activity -->
                <div class="analytics-card">
                    <div class="analytics-card-title">
                        Activity by Hour
                        <span class="analytics-card-hint">Peak: ${metrics.peakHourStr}</span>
                    </div>
                    <div class="analytics-chart">
                        ${generateBarChart(metrics.byHour, hourLabels, 320, 64)}
                    </div>
                </div>

                <!-- Day of week -->
                <div class="analytics-card">
                    <div class="analytics-card-title">
                        Activity by Day
                        <span class="analytics-card-hint">${metrics.streak}-day streak 🔥</span>
                    </div>
                    <div class="analytics-chart">
                        ${generateBarChart(metrics.byDay, dayLabels, 320, 64)}
                    </div>
                </div>

                <!-- Message split -->
                <div class="analytics-card">
                    <div class="analytics-card-title">Message Split</div>
                    <div class="analytics-split">
                        <div class="analytics-split-bar">
                            <div class="analytics-split-sent" style="flex:${metrics.sent || 1}"></div>
                            <div class="analytics-split-recv" style="flex:${metrics.received || 1}"></div>
                        </div>
                        <div class="analytics-split-labels">
                            <span>You: ${metrics.sent}</span>
                            <span>Them: ${metrics.received}</span>
                        </div>
                    </div>
                </div>

                <!-- Message types -->
                ${Object.keys(metrics.types).length > 1 ? `
                <div class="analytics-card">
                    <div class="analytics-card-title">Media Breakdown</div>
                    <div class="analytics-types">
                        ${Object.entries(metrics.types).map(([type, count]) => `
                            <div class="analytics-type-item">
                                <span class="analytics-type-icon">${_typeIcon(type)}</span>
                                <span class="analytics-type-label">${_capitalize(type)}</span>
                                <span class="analytics-type-count">${count}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                <div class="analytics-footer">
                    Based on ${metrics.total} messages loaded. Full history available via export.
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

    modal.querySelector('.analytics-close').addEventListener('click', () => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 280);
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 280);
        }
    });

    const onKey = (e) => {
        if (e.key === 'Escape') {
            modal.classList.remove('show');
            setTimeout(() => { modal.remove(); document.removeEventListener('keydown', onKey); }, 280);
        }
    };
    document.addEventListener('keydown', onKey);
}

function _typeIcon(type) {
    const icons = { text: '💬', image: '🖼️', file: '📎', voice: '🎤' };
    return icons[type] || '📄';
}

function _capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// ─────────────────────────────────────────
// EXPOSE
// ─────────────────────────────────────────
window.Analytics = {
    compute: computeAnalytics,
    show:    showAnalytics,
    sparkline: generateSparkline,
    barChart:  generateBarChart,
};
