from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import os
import subprocess
import signal

app = Flask(__name__, template_folder='web', static_folder='web/static')
CORS(app)

app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

bot_process = None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/setup')
def setup():
    return render_template('setup.html')

@app.route('/commands')
def commands():
    return render_template('commands.html')

@app.route('/quests')
def quests():
    return render_template('quests.html')

@app.route('/features')
def features():
    return render_template('features.html')

@app.route('/api/token/status')
def token_status():
    has_token = os.getenv('DISCORD_BOT_TOKEN') is not None
    return jsonify({'has_token': has_token})

@app.route('/api/token/save', methods=['POST'])
def save_token():
    data = request.get_json()
    token = data.get('token', '').strip()
    
    if not token:
        return jsonify({'success': False, 'message': 'Token cannot be empty'}), 400
    
    if len(token) < 50:
        return jsonify({'success': False, 'message': 'Token appears to be too short'}), 400
    
    parts = token.split('.')
    if len(parts) != 3:
        return jsonify({'success': False, 'message': 'Invalid token format'}), 400
    
    os.environ['DISCORD_BOT_TOKEN'] = token
    
    return jsonify({'success': True, 'message': 'Token saved successfully! Bot will restart automatically.'})

@app.route('/api/bot/status')
def bot_status():
    has_token = os.getenv('DISCORD_BOT_TOKEN') is not None
    return jsonify({'running': has_token, 'has_token': has_token})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
