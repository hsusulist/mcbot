async function checkStatus() {
    try {
        const response = await fetch('/api/bot/status');
        const data = await response.json();
        
        const statusBadge = document.getElementById('bot-status');
        const statusText = document.getElementById('status-text');
        
        if (data.has_token) {
            statusBadge.className = 'status-badge online';
            statusText.textContent = 'Bot Online';
        } else {
            statusBadge.className = 'status-badge offline';
            statusText.textContent = 'Bot Offline';
        }
    } catch (error) {
        console.error('Error checking status:', error);
    }
}

checkStatus();
setInterval(checkStatus, 5000);
