import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// Middleware: map extensionless routes to .html (e.g., /setup -> web/setup.html)
app.use(async (req, res, next) => {
  try {
    const urlPath = decodeURIComponent(req.path);
    if (path.extname(urlPath) === '') {
      const candidate = path.join(__dirname, '..', 'web', urlPath + '.html');
      try {
        await fs.access(candidate);
        return res.sendFile(candidate);
      } catch (_) {
        const indexCandidate = path.join(__dirname, '..', 'web', urlPath, 'index.html');
        try {
          await fs.access(indexCandidate);
          return res.sendFile(indexCandidate);
        } catch (_) {
          // fallthrough to static handler
        }
      }
    }
  } catch (err) {
    // ignore and continue
  }
  next();
});

// Serve the static site in /web
app.use('/', express.static(path.join(__dirname, '..', 'web')));

app.get('/health', (req, res) => res.json({ ok: true }));

// API: save Discord bot token
app.post('/api/token/save', async (req, res) => {
  try {
    const { token } = req.body || {};
    const setupKey = process.env.SETUP_KEY;

    // Require a setup key to prevent unauthorized token uploads
    if (!setupKey) {
      return res.status(503).json({ success: false, message: 'Server not configured for web setup. Set SETUP_KEY in environment.' });
    }

    const clientKey = (req.headers['x-setup-key'] || req.body.setup_key || '').toString();
    if (clientKey !== setupKey) {
      return res.status(401).json({ success: false, message: 'Unauthorized: invalid setup key' });
    }
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, message: 'Token missing' });
    }

    const trimmed = token.trim();
    if (trimmed.length < 50) {
      return res.status(400).json({ success: false, message: 'Token appears to be too short' });
    }
    if (trimmed.split('.').length !== 3) {
      return res.status(400).json({ success: false, message: 'Invalid token format' });
    }

    // Write to .env (overwrite or create)
    const envPath = path.join(__dirname, '..', '.env');
    const content = `DISCORD_BOT_TOKEN=${trimmed}\n`;
    await fs.writeFile(envPath, content, { encoding: 'utf8' });

    // update process.env so subsequent code can read it
    process.env.DISCORD_BOT_TOKEN = trimmed;

    // Try to start or restart discord.js client if available
    try {
      // Dynamically import discord.js and login
      const { Client, GatewayIntentBits } = await import('discord.js');

      // If there's an existing client, destroy it cleanly first
      if (global.__discord_client) {
        try {
          await global.__discord_client.destroy();
        } catch (e) {
          console.error('Error destroying existing discord client:', e && e.message ? e.message : e);
        }
        global.__discord_client = null;
      }

      global.__discord_client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
      global.__discord_client.once('ready', () => console.log(`🤖 Discord bot logged in as ${global.__discord_client.user.tag}`));
      global.__discord_client.on('error', (e) => console.error('Discord client error:', e));

      // Attempt login
      await global.__discord_client.login(trimmed);
      console.log('Discord client login successful');
      return res.json({ success: true });
    } catch (err) {
      // If discord.js not installed or login fails, return failure so UI doesn't mislead user
      console.error('Could not start discord client:', err && err.message ? err.message : err);
      // If a client object exists, destroy it
      try { if (global.__discord_client) await global.__discord_client.destroy(); } catch (e) {}
      global.__discord_client = null;
      return res.status(400).json({ success: false, message: 'Token saved but bot start failed: ' + (err.message || String(err)) });
    }
  } catch (err) {
    console.error('Error saving token:', err);
    return res.status(500).json({ success: false, message: 'Failed to save token' });
  }
});

app.listen(PORT, () => {
  console.log(`🌐 Web server running at http://localhost:${PORT}`);
});

// Discord bot (optional) — only start if token provided
if (process.env.DISCORD_BOT_TOKEN) {
  try {
    const { Client, GatewayIntentBits } = await import('discord.js');
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

    client.once('ready', () => {
      console.log(`🤖 Discord bot logged in as ${client.user.tag}`);
    });

    client.on('error', (err) => console.error('Discord client error:', err));

    client.login(process.env.DISCORD_BOT_TOKEN).catch((err) => {
      console.error('Failed to login Discord bot:', err.message || err);
    });
  } catch (err) {
    console.error('discord.js not available — run `npm install` to enable bot:', err.message || err);
  }
} else {
  console.log('⚠️  DISCORD_BOT_TOKEN not set — Discord bot will not start.');
}
