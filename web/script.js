function validateToken() {
    const tokenInput = document.getElementById('token');
    const resultDiv = document.getElementById('validation-result');
    const token = tokenInput.value.trim();
    
    if (!token) {
        resultDiv.className = 'error';
        resultDiv.textContent = '❌ Please enter a token!';
        return;
    }
    
    if (token.length < 50) {
        resultDiv.className = 'error';
        resultDiv.textContent = '❌ Token appears to be too short. Discord bot tokens are usually much longer.';
        return;
    }
    
    const parts = token.split('.');
    if (parts.length !== 3) {
        resultDiv.className = 'error';
        resultDiv.textContent = '❌ Invalid token format. Discord bot tokens have 3 parts separated by dots.';
        return;
    }
    
    resultDiv.className = 'success';
    resultDiv.innerHTML = `
        ✅ <strong>Token format looks valid!</strong><br>
        <br>
        <strong>Next steps:</strong><br>
        1. Click the 🔒 lock icon in the left sidebar<br>
        2. Click "Secrets"<br>
        3. Add key: <code>DISCORD_BOT_TOKEN</code><br>
        4. Paste your token as the value<br>
        5. Click "Add secret"<br>
        <br>
        <strong>⚠️ Do NOT share this token with anyone!</strong>
    `;
}

document.addEventListener('DOMContentLoaded', function() {
    const tokenInput = document.getElementById('token');
    if (tokenInput) {
        tokenInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                validateToken();
            }
        });
    }
});
