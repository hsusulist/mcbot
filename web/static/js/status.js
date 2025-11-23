async function checkStatus() {
    try {
        const response = await fetch('/api/bot/status');
        const data = await response.json();
        
        const statusBadge = document.getElementById('bot-status');
        const statusText = document.getElementById('status-text');
        if (data.has_token) {
            statusBadge.className = 'status-badge online';
            const count = data.online_count || 0;
            statusText.textContent = count > 0 ? `${count} bot(s) online` : 'No bots online';
        } else {
            statusBadge.className = 'status-badge offline';
            statusText.textContent = 'No bots configured';
        }
    } catch (error) {
        console.error('Error checking status:', error);
    }
}

checkStatus();
setInterval(checkStatus, 5000);
