async function saveToken() {
    const tokenInput = document.getElementById('token');
    const setupKeyInput = document.getElementById('setupKey');
    const resultDiv = document.getElementById('validation-result');
    const token = tokenInput.value.trim();
    const button = document.querySelector('.btn-primary');
    const setupKey = setupKeyInput ? setupKeyInput.value.trim() : '';
    
    if (!token) {
        resultDiv.className = 'validation-result error show';
        resultDiv.innerHTML = '<strong>❌ Error:</strong> Please enter a token!';
        return;
    }
    
    if (token.length < 50) {
        resultDiv.className = 'validation-result error show';
        resultDiv.innerHTML = '<strong>❌ Error:</strong> Token appears to be too short. Discord bot tokens are usually much longer.';
        return;
    }
    
    const parts = token.split('.');
    if (parts.length !== 3) {
        resultDiv.className = 'validation-result error show';
        resultDiv.innerHTML = '<strong>❌ Error:</strong> Invalid token format. Discord bot tokens have 3 parts separated by dots.';
        return;
    }
    
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span> <span>Saving...</span>';
    
    try {
        const response = await fetch('/api/token/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-SETUP-KEY': setupKey
            },
            body: JSON.stringify({ token: token, setup_key: setupKey })
        });
        
        const data = await response.json();
        
        if (data.success) {
            resultDiv.className = 'validation-result success show';
            resultDiv.innerHTML = `
                <strong>✅ Success!</strong> Your bot token has been saved securely.<br><br>
                <strong>What happens next:</strong><br>
                • Token is saved to .env file (excluded from Git)<br>
                • Safe to push your code to GitHub<br>
                • The Discord Bot workflow will restart automatically<br>
                • Check the bot status indicator to confirm it's online<br><br>
                <strong>Next Steps:</strong><br>
                1. Make sure you've enabled all Privileged Intents in Discord Developer Portal<br>
                2. Invite your bot to your server using the OAuth2 URL Generator<br>
                3. Use <code>a help</code> in your Discord server to see all commands!
            `;
            tokenInput.value = '';
            
            setTimeout(() => {
                window.location.href = '/';
            }, 5000);
        } else {
            resultDiv.className = 'validation-result error show';
            resultDiv.innerHTML = `<strong>❌ Error:</strong> ${data.message}`;
        }
    } catch (error) {
        resultDiv.className = 'validation-result error show';
        resultDiv.innerHTML = `<strong>❌ Error:</strong> Failed to save token. Please try again.`;
        console.error('Error:', error);
    } finally {
        button.disabled = false;
        button.innerHTML = '<span>💾 Save Token & Start Bot</span>';
    }
}

document.getElementById('token').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveToken();
    }
});
