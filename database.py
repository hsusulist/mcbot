import sqlite3
import json
from datetime import datetime, timedelta
import random

class Database:
    def __init__(self, db_name='minecraft_bot.db'):
        self.db_name = db_name
        self.init_db()
    
    def get_connection(self):
        return sqlite3.connect(self.db_name)
    
    def init_db(self):
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                balance INTEGER DEFAULT 0,
                daily_quests TEXT,
                last_quest_reset TEXT,
                total_earned INTEGER DEFAULT 0,
                total_spent INTEGER DEFAULT 0
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS server_settings (
                guild_id INTEGER PRIMARY KEY,
                server_ip TEXT,
                server_port INTEGER,
                console_channel_id INTEGER,
                welcome_channel_id INTEGER,
                console_enabled INTEGER DEFAULT 1,
                welcome_enabled INTEGER DEFAULT 1
            )
        ''')
        
        try:
            cursor.execute('ALTER TABLE server_settings ADD COLUMN welcome_channel_id INTEGER')
            conn.commit()
        except sqlite3.OperationalError:
            pass
        
        try:
            cursor.execute('ALTER TABLE server_settings ADD COLUMN console_enabled INTEGER DEFAULT 1')
            conn.commit()
        except sqlite3.OperationalError:
            pass
        
        try:
            cursor.execute('ALTER TABLE server_settings ADD COLUMN welcome_enabled INTEGER DEFAULT 1')
            conn.commit()
        except sqlite3.OperationalError:
            pass
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS quest_progress (
                user_id INTEGER,
                quest_id INTEGER,
                progress INTEGER DEFAULT 0,
                completed INTEGER DEFAULT 0,
                PRIMARY KEY (user_id, quest_id)
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def get_user(self, user_id, username):
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM users WHERE user_id = ?', (user_id,))
        user = cursor.fetchone()
        
        if not user:
            cursor.execute('''
                INSERT INTO users (user_id, username, balance, daily_quests, last_quest_reset)
                VALUES (?, ?, 0, '[]', ?)
            ''', (user_id, username, datetime.now().isoformat()))
            conn.commit()
            cursor.execute('SELECT * FROM users WHERE user_id = ?', (user_id,))
            user = cursor.fetchone()
        
        conn.close()
        return user
    
    def update_balance(self, user_id, amount):
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute('UPDATE users SET balance = balance + ? WHERE user_id = ?', (amount, user_id))
        
        if amount > 0:
            cursor.execute('UPDATE users SET total_earned = total_earned + ? WHERE user_id = ?', (amount, user_id))
        else:
            cursor.execute('UPDATE users SET total_spent = total_spent + ? WHERE user_id = ?', (abs(amount), user_id))
        
        conn.commit()
        conn.close()
    
    def get_balance(self, user_id):
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT balance FROM users WHERE user_id = ?', (user_id,))
        result = cursor.fetchone()
        conn.close()
        return result[0] if result else 0
    
    def get_daily_quests(self, user_id):
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT daily_quests, last_quest_reset FROM users WHERE user_id = ?', (user_id,))
        result = cursor.fetchone()
        conn.close()
        
        if result:
            quests = json.loads(result[0]) if result[0] else []
            last_reset = datetime.fromisoformat(result[1])
            return quests, last_reset
        return [], datetime.now()
    
    def set_daily_quests(self, user_id, quests):
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE users 
            SET daily_quests = ?, last_quest_reset = ?
            WHERE user_id = ?
        ''', (json.dumps(quests), datetime.now().isoformat(), user_id))
        conn.commit()
        conn.close()
    
    def get_quest_progress(self, user_id, quest_id):
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT progress, completed FROM quest_progress 
            WHERE user_id = ? AND quest_id = ?
        ''', (user_id, quest_id))
        result = cursor.fetchone()
        conn.close()
        return result if result else (0, 0)
    
    def update_quest_progress(self, user_id, quest_id, progress, completed=0):
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT OR REPLACE INTO quest_progress (user_id, quest_id, progress, completed)
            VALUES (?, ?, ?, ?)
        ''', (user_id, quest_id, progress, completed))
        conn.commit()
        conn.close()
    
    def reset_quest_progress(self, user_id):
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM quest_progress WHERE user_id = ?', (user_id,))
        conn.commit()
        conn.close()
    
    def set_server_settings(self, guild_id, server_ip=None, server_port=None, console_channel_id=None, welcome_channel_id=None, console_enabled=None, welcome_enabled=None):
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM server_settings WHERE guild_id = ?', (guild_id,))
        exists = cursor.fetchone()
        
        if exists:
            if server_ip:
                cursor.execute('UPDATE server_settings SET server_ip = ? WHERE guild_id = ?', (server_ip, guild_id))
            if server_port:
                cursor.execute('UPDATE server_settings SET server_port = ? WHERE guild_id = ?', (server_port, guild_id))
            if console_channel_id is not None:
                cursor.execute('UPDATE server_settings SET console_channel_id = ? WHERE guild_id = ?', (console_channel_id, guild_id))
            if welcome_channel_id is not None:
                cursor.execute('UPDATE server_settings SET welcome_channel_id = ? WHERE guild_id = ?', (welcome_channel_id, guild_id))
            if console_enabled is not None:
                cursor.execute('UPDATE server_settings SET console_enabled = ? WHERE guild_id = ?', (console_enabled, guild_id))
            if welcome_enabled is not None:
                cursor.execute('UPDATE server_settings SET welcome_enabled = ? WHERE guild_id = ?', (welcome_enabled, guild_id))
        else:
            cursor.execute('''
                INSERT INTO server_settings (guild_id, server_ip, server_port, console_channel_id, welcome_channel_id, console_enabled, welcome_enabled)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (guild_id, server_ip, server_port, console_channel_id, welcome_channel_id, console_enabled if console_enabled is not None else 1, welcome_enabled if welcome_enabled is not None else 1))
        
        conn.commit()
        conn.close()
    
    def get_server_settings(self, guild_id):
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM server_settings WHERE guild_id = ?', (guild_id,))
        result = cursor.fetchone()
        conn.close()
        return result
    
    def get_leaderboard(self, limit=10):
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT user_id, username, balance 
            FROM users 
            ORDER BY balance DESC 
            LIMIT ?
        ''', (limit,))
        results = cursor.fetchall()
        conn.close()
        return results
