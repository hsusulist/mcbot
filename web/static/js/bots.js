async function loadBots() {
    const list = document.getElementById('bots-list');
    list.innerHTML = '<div class="loading">Loading bots...</div>';
    try {
        const [res, meRes] = await Promise.all([fetch('/api/bots'), fetch('/api/me')]);
        const data = await res.json();
        const meData = await meRes.json();
        const me = meData.user || null;
        if (!data.success) throw new Error('Failed to load');
        const bots = data.bots || [];
        renderBots(bots, me);
    } catch (e) {
        list.innerHTML = '<div class="error">Failed to load bots</div>';
        console.error(e);
    }
}

function renderBots(bots, me) {
    const list = document.getElementById('bots-list');
    if (!bots.length) {
        list.innerHTML = '<div class="empty">No bots configured yet. Use Setup to add one.</div>';
        return;
    }
    const rows = bots.map(b => {
        const status = b.online ? 'Online' : 'Offline';
        const owner = b.ownerId ? (me && me.id === b.ownerId) : false;
        return `
            <div class="bot-row">
                <div class="bot-info">
                    <div class="bot-name">${escapeHTML(b.name || '')}</div>
                    <div class="bot-tag">${escapeHTML(b.userTag || '')} · <small>${status}</small></div>
                </div>
                <div class="bot-actions">
                    ${owner ? `<button class="btn" data-id="${b.id}" data-action="start">Start</button><button class="btn" data-id="${b.id}" data-action="stop">Stop</button>` : `<small>Owner-only controls</small>`}
                </div>
            </div>
        `;
    }).join('\n');
    list.innerHTML = rows;

    document.getElementById('search').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        const filtered = bots.filter(b => (b.name||'').toLowerCase().includes(q) || (b.userTag||'').toLowerCase().includes(q));
        renderBots(filtered);
    });

    list.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = btn.getAttribute('data-id');
            const action = btn.getAttribute('data-action');
            btn.disabled = true;
            btn.textContent = action === 'start' ? 'Starting...' : 'Stopping...';
            try {
                const res = await fetch(`/api/bots/${id}/${action}`, { method: 'POST' });
                const data = await res.json();
                if (!data.success) throw new Error(data.message || 'Failed');
                await loadBots();
            } catch (err) {
                alert('Action failed: ' + (err.message || err));
            } finally {
                btn.disabled = false;
                btn.textContent = action === 'start' ? 'Start' : 'Stop';
            }
        });
    });
}

function escapeHTML(s) { return String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

loadBots();
