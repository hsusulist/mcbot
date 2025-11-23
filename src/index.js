import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import { randomUUID, randomBytes, scryptSync, createHash } from 'crypto';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// static + extensionless mapping
app.use(async (req,res,next)=>{
  try{
    const urlPath = decodeURIComponent(req.path);
    if(path.extname(urlPath)===''){
      const candidate = path.join(__dirname,'..','web', urlPath + '.html');
      try{ await fs.access(candidate); return res.sendFile(candidate); }catch(_){}
      const idx = path.join(__dirname,'..','web', urlPath, 'index.html');
      try{ await fs.access(idx); return res.sendFile(idx); }catch(_){}
    }
  }catch(e){}
  next();
});
app.use('/', express.static(path.join(__dirname,'..','web')));

const DATA_DIR = path.join(__dirname,'..','data');
const BOTS_FILE = path.join(DATA_DIR,'bots.json');
const USERS_FILE = path.join(DATA_DIR,'users.json');
const SESSIONS_FILE = path.join(DATA_DIR,'sessions.json');

async function ensureDataDir(){ try{ await fs.mkdir(DATA_DIR,{ recursive:true }); }catch(e){} }
async function loadJson(file,fallback){ await ensureDataDir(); const raw = await fs.readFile(file,'utf8').catch(()=>null); return raw?JSON.parse(raw):fallback; }
async function saveJson(file,val){ await ensureDataDir(); await fs.writeFile(file, JSON.stringify(val,null,2),'utf8'); }

const loadBots = async ()=> await loadJson(BOTS_FILE, []);
const saveBots = async (v)=> await saveJson(BOTS_FILE, v);
const loadUsers = async ()=> await loadJson(USERS_FILE, []);
const saveUsers = async (v)=> await saveJson(USERS_FILE, v);
const loadSessions = async ()=> await loadJson(SESSIONS_FILE, {});
const saveSessions = async (v)=> await saveJson(SESSIONS_FILE, v);

function hashPassword(password, salt){ return scryptSync(password, salt, 64).toString('hex'); }
function timingSafeEqual(a,b){ try{ if(a.length!==b.length) return false; const ha=createHash('sha256').update(a).digest(); const hb=createHash('sha256').update(b).digest(); return ha.equals(hb); }catch(e){return false;} }
function buildPasswordHash(password){ const salt = randomBytes(12).toString('hex'); const key = hashPassword(password, salt); return `${salt}$${key}`; }
function verifyPassword(password, stored){ try{ const [salt,key]=stored.split('$'); const derived = hashPassword(password, salt); return timingSafeEqual(Buffer.from(derived,'hex'), Buffer.from(key,'hex')); }catch(e){return false;} }

async function createUser({ username, password, type, email }){
  const users = await loadUsers();
  if(users.find(u=>u.username===username)) throw new Error('Username already exists');
  const id = randomUUID();
  const passwordHash = buildPasswordHash(password);
  const user = { id, username, type: type||'noemail', email: email||null, passwordHash };
  users.push(user); await saveUsers(users); return { id: user.id, username: user.username, type: user.type, email: user.email };
}

async function authenticateUser(username,password){ const users = await loadUsers(); const u = users.find(x=>x.username===username); if(!u) return null; if(!verifyPassword(password,u.passwordHash)) return null; return { id: u.id, username: u.username, type: u.type, email: u.email }; }

async function createSession(userId){ const sessions = await loadSessions(); const token = randomBytes(24).toString('hex'); sessions[token] = { userId, created: Date.now() }; await saveSessions(sessions); return token; }

async function getUserFromRequest(req){ try{ const cookie = (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('session=')); if(!cookie) return null; const token = cookie.split('=')[1]; if(!token) return null; const sessions = await loadSessions(); const s = sessions[token]; if(!s) return null; const users = await loadUsers(); const u = users.find(x=>x.id===s.userId); if(!u) return null; return { id: u.id, username: u.username, type: u.type, email: u.email }; }catch(e){ return null; } }

// in-memory clients map
global.__botClients = global.__botClients || {};
async function startBotInstance(bot){ if(!bot||!bot.token) return; if(global.__botClients[bot.id]) return; try{ const { Client, GatewayIntentBits } = await import('discord.js'); const client = new Client({ intents:[GatewayIntentBits.Guilds] }); client.once('ready', ()=>{ console.log(`🤖 Bot ${bot.name||bot.id} logged in as ${client.user.tag}`); }); client.on('error',(e)=>console.error('Discord client error', bot.id, e && e.message ? e.message : e)); await client.login(bot.token); global.__botClients[bot.id]=client; bot.online = true; }catch(err){ console.error('Failed to start bot', bot.id, err && err.message ? err.message : err); bot.online=false; } }
async function stopBotInstance(botId){ const client = global.__botClients[botId]; if(!client) return; try{ await client.destroy(); }catch(e){} delete global.__botClients[botId]; }

// migrate single env token if present
(async ()=>{ const bots = await loadBots(); if(process.env.DISCORD_BOT_TOKEN && bots.length===0){ const id = randomUUID(); bots.push({ id, name:'MigratedBot', userTag:null, token: process.env.DISCORD_BOT_TOKEN, online:false, ownerId:null }); await saveBots(bots); } for(const b of bots){ startBotInstance(b).catch(()=>{}); } })();

app.get('/health',(req,res)=>res.json({ ok:true }));

app.get('/api/bots', async (req,res)=>{ const bots = await loadBots(); res.json({ success:true, bots: bots.map(b=>({ id:b.id, name:b.name, userTag:b.userTag||null, online:!!b.online, ownerId:b.ownerId||null })) }); });

app.get('/api/bot/status', async (req,res)=>{ const bots = await loadBots(); res.json({ has_token: bots.length>0, online_count: bots.filter(b=>b.online).length }); });

app.post('/api/register', async (req,res)=>{ try{ const { username, password, type, email } = req.body||{}; if(!username||!password) return res.status(400).json({ success:false, message:'username and password required' }); try{ const user = await createUser({ username,password,type,email }); return res.json({ success:true, user }); }catch(e){ return res.status(400).json({ success:false, message: e.message||'Failed to create user' }); } }catch(e){ console.error('register error',e); res.status(500).json({ success:false, message:'server error' }); } });

app.post('/api/login', async (req,res)=>{ try{ const { username, password } = req.body||{}; if(!username||!password) return res.status(400).json({ success:false, message:'username and password required' }); const user = await authenticateUser(username,password); if(!user) return res.status(401).json({ success:false, message:'invalid credentials' }); const token = await createSession(user.id); res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; SameSite=Strict`); res.json({ success:true, user }); }catch(e){ console.error('login error',e); res.status(500).json({ success:false, message:'server error' }); } });

app.post('/api/logout', async (req,res)=>{ try{ const cookie = (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('session=')); if(cookie){ const token = cookie.split('=')[1]; const sessions = await loadSessions(); delete sessions[token]; await saveSessions(sessions); } res.setHeader('Set-Cookie', `session=; HttpOnly; Path=/; Max-Age=0`); res.json({ success:true }); }catch(e){ res.status(500).json({ success:false }); } });

app.get('/api/me', async (req,res)=>{ const user = await getUserFromRequest(req); if(!user) return res.json({ success:true, user:null }); res.json({ success:true, user }); });

// alias paths (common typos / capitalization)
app.get('/mybot', (req,res)=>{ res.redirect(302, '/mybots'); });
app.get('/Bots', (req,res)=>{ res.redirect(302, '/bots'); });

// create bot - SETUP_KEY optional (enforced only if set)
app.post('/api/bots', async (req,res)=>{ try{ const user = await getUserFromRequest(req); if(!user) return res.status(401).json({ success:false, message:'Authentication required' }); const setupKey = process.env.SETUP_KEY; if(setupKey){ const clientKey = (req.headers['x-setup-key']||req.body.setup_key||'').toString(); if(clientKey !== setupKey) return res.status(401).json({ success:false, message:'Unauthorized: invalid setup key' }); }
    const { token, name } = req.body||{}; if(!token||typeof token!=='string') return res.status(400).json({ success:false, message:'Token missing' }); const trimmed = token.trim(); if(trimmed.split('.').length!==3) return res.status(400).json({ success:false, message:'Invalid token' });
    try{ const { Client, GatewayIntentBits } = await import('discord.js'); const temp = new Client({ intents:[GatewayIntentBits.Guilds] }); await temp.login(trimmed); const tag = temp.user.tag; await temp.destroy(); const bots = await loadBots(); const id = randomUUID(); const entry = { id, name: name||tag, userTag: tag, token: trimmed, online:false, ownerId: user.id }; bots.push(entry); await saveBots(bots); startBotInstance(entry).catch(()=>{}); return res.json({ success:true, bot: { id: entry.id, name: entry.name, userTag: entry.userTag, ownerId: entry.ownerId } }); }catch(err){ return res.status(400).json({ success:false, message:'Failed to validate token: '+(err.message||String(err)) }); } }catch(err){ console.error('Error creating bot',err); return res.status(500).json({ success:false, message:'Server error' }); } });

app.post('/api/bots/:id/start', async (req,res)=>{ const id=req.params.id; const bots=await loadBots(); const bot=bots.find(b=>b.id===id); if(!bot) return res.status(404).json({ success:false, message:'Bot not found' }); const user=await getUserFromRequest(req); if(!user) return res.status(401).json({ success:false, message:'Authentication required' }); if(bot.ownerId!==user.id) return res.status(403).json({ success:false, message:'Only owner' }); await startBotInstance(bot); bot.online = !!global.__botClients[bot.id]; await saveBots(bots); res.json({ success:true, online: bot.online }); });

app.post('/api/bots/:id/stop', async (req,res)=>{ const id=req.params.id; const bots=await loadBots(); const bot=bots.find(b=>b.id===id); if(!bot) return res.status(404).json({ success:false }); const user=await getUserFromRequest(req); if(!user) return res.status(401).json({ success:false }); if(bot.ownerId!==user.id) return res.status(403).json({ success:false }); await stopBotInstance(bot.id); bot.online=false; await saveBots(bots); res.json({ success:true }); });

// delete bot (owner-only)
app.delete('/api/bots/:id', async (req,res)=>{ try{ const id=req.params.id; const bots = await loadBots(); const idx = bots.findIndex(b=>b.id===id); if(idx===-1) return res.status(404).json({ success:false, message:'Not found' }); const user = await getUserFromRequest(req); if(!user) return res.status(401).json({ success:false, message:'Auth required' }); const bot = bots[idx]; if(bot.ownerId!==user.id) return res.status(403).json({ success:false, message:'Only owner' }); await stopBotInstance(bot.id); bots.splice(idx,1); await saveBots(bots); return res.json({ success:true }); }catch(e){ console.error('delete bot err',e); res.status(500).json({ success:false }); } });

// legacy token save
app.post('/api/token/save', async (req,res)=>{ try{ const { token } = req.body||{}; const setupKey = process.env.SETUP_KEY; if(setupKey){ const clientKey = (req.headers['x-setup-key']||req.body.setup_key||'').toString(); if(clientKey !== setupKey) return res.status(401).json({ success:false, message:'Unauthorized' }); }
    if(!token||typeof token!=='string') return res.status(400).json({ success:false }); const trimmed = token.trim(); if(trimmed.split('.').length!==3) return res.status(400).json({ success:false, message:'Invalid token' }); const envPath = path.join(__dirname,'..','.env'); await fs.writeFile(envPath, `DISCORD_BOT_TOKEN=${trimmed}\n`, 'utf8'); process.env.DISCORD_BOT_TOKEN = trimmed; return res.json({ success:true }); }catch(e){ console.error('token save error',e); res.status(500).json({ success:false }); } });

app.listen(PORT, ()=>{ console.log(`🌐 Web server running at http://localhost:${PORT}`); });

console.log('Server initialized');
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import { randomUUID, randomBytes, scryptSync, createHash } from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// Serve extensionless routes to .html
app.use(async (req, res, next) => {
  try {
    const urlPath = decodeURIComponent(req.path);
    if (path.extname(urlPath) === '') {
      const candidate = path.join(__dirname, '..', 'web', urlPath + '.html');
      try { await fs.access(candidate); return res.sendFile(candidate); } catch (_) {}
      const indexCandidate = path.join(__dirname, '..', 'web', urlPath, 'index.html');
      try { await fs.access(indexCandidate); return res.sendFile(indexCandidate); } catch(_){ }
    }
  } catch (e) {}
  next();
});

app.use('/', express.static(path.join(__dirname, '..', 'web')));

const DATA_DIR = path.join(__dirname, '..', 'data');
const BOTS_FILE = path.join(DATA_DIR, 'bots.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

async function ensureDataDir(){ try{ await fs.mkdir(DATA_DIR, { recursive: true }); }catch(e){} }
async function loadJson(file, fallback){ await ensureDataDir(); const raw = await fs.readFile(file,'utf8').catch(()=>null); return raw ? JSON.parse(raw) : fallback; }
async function saveJson(file, value){ await ensureDataDir(); await fs.writeFile(file, JSON.stringify(value, null, 2), 'utf8'); }

const loadBots = async ()=> await loadJson(BOTS_FILE, []);
const saveBots = async (v)=> await saveJson(BOTS_FILE, v);
const loadUsers = async ()=> await loadJson(USERS_FILE, []);
const saveUsers = async (v)=> await saveJson(USERS_FILE, v);
const loadSessions = async ()=> await loadJson(SESSIONS_FILE, {});
const saveSessions = async (v)=> await saveJson(SESSIONS_FILE, v);

function hashPassword(password, salt){ const key=scryptSync(password, salt, 64).toString('hex'); return `${salt}$${key}`; }
function timingSafeEqual(a,b){ try{ if(a.length!==b.length) return false; const ha=createHash('sha256').update(a).digest(); const hb=createHash('sha256').update(b).digest(); return ha.equals(hb); }catch(e){return false;} }
function verifyPassword(password, stored){ try{ const [salt,key]=stored.split('$'); const derived=scryptSync(password,salt,64).toString('hex'); return timingSafeEqual(Buffer.from(derived,'hex'), Buffer.from(key,'hex')); }catch(e){return false;} }

async function createUser({ username, password, type, email }){
  const users = await loadUsers();
  if(users.find(u=>u.username===username)) throw new Error('Username already exists');
  const salt = randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const id = randomUUID();
  const user={ id, username, type: type||'noemail', email: email||null, passwordHash };
  users.push(user); await saveUsers(users); return { id: user.id, username: user.username, type: user.type, email: user.email };
}

async function authenticateUser(username, password){ const users = await loadUsers(); const u = users.find(x=>x.username===username); if(!u) return null; if(!verifyPassword(password, u.passwordHash)) return null; return { id: u.id, username: u.username, type: u.type, email: u.email }; }

async function createSession(userId){ const sessions = await loadSessions(); const token = randomBytes(24).toString('hex'); sessions[token] = { userId, created: Date.now() }; await saveSessions(sessions); return token; }

async function getUserFromRequest(req){ try{ const cookie = (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('session=')); if(!cookie) return null; const token = cookie.split('=')[1]; if(!token) return null; const sessions = await loadSessions(); const s = sessions[token]; if(!s) return null; const users = await loadUsers(); const u = users.find(x=>x.id===s.userId); if(!u) return null; return { id:u.id, username:u.username, type:u.type, email:u.email }; }catch(e){ return null; } }

global.__botClients = global.__botClients || {};
async function startBotInstance(bot){ if(!bot || !bot.token) return; if(global.__botClients[bot.id]) return; try{ const { Client, GatewayIntentBits } = await import('discord.js'); const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] }); client.once('ready', async ()=>{ console.log(`🤖 Bot ${bot.name||bot.id} logged in as ${client.user.tag}`); bot.userTag = client.user.tag; bot.online = true; const bots = await loadBots(); const idx = bots.findIndex(b=>b.id===bot.id); if(idx!==-1){ bots[idx]=bot; await saveBots(bots); } }); client.on('error', (e)=>console.error('Discord client error for', bot.id, e && e.message ? e.message : e)); await client.login(bot.token); global.__botClients[bot.id] = client; bot.online = true; }catch(err){ console.error('Failed to start bot', bot.id, err && err.message ? err.message : err); bot.online=false; } }
async function stopBotInstance(botId){ const client = global.__botClients[botId]; if(!client) return; try{ await client.destroy(); }catch(e){} delete global.__botClients[botId]; }

// On startup migrate single-token .env into bots.json and start bots
(async ()=>{ const bots = await loadBots(); if(process.env.DISCORD_BOT_TOKEN && bots.length===0){ const token = process.env.DISCORD_BOT_TOKEN; const id = randomUUID(); bots.push({ id, name:'MigratedBot', userTag:null, token, online:false, ownerId:null }); await saveBots(bots); } for(const bot of bots){ startBotInstance(bot).catch(()=>{}); } })();

app.get('/health', (req,res)=>res.json({ ok:true }));

app.get('/api/bots', async (req,res)=>{ const bots = await loadBots(); const out = bots.map(b=>({ id:b.id, name:b.name, userTag:b.userTag, online:!!b.online, ownerId:b.ownerId||null })); res.json({ success:true, bots: out }); });

app.get('/api/bot/status', async (req,res)=>{ const bots = await loadBots(); const online = bots.filter(b=>b.online).length; res.json({ has_token: bots.length>0, online_count: online }); });

// Register / Login / Logout / Me
app.post('/api/register', async (req,res)=>{ try{ const { username, password, type, email } = req.body||{}; if(!username||!password) return res.status(400).json({ success:false, message:'username and password required' }); if(type==='email' && !email) return res.status(400).json({ success:false, message:'email required for email account' }); try{ const user = await createUser({ username, password, type, email }); return res.json({ success:true, user }); }catch(e){ return res.status(400).json({ success:false, message: e.message||'Failed to create user' }); } }catch(e){ console.error('register error',e); res.status(500).json({ success:false, message:'server error' }); } });

app.post('/api/login', async (req,res)=>{ try{ const { username, password } = req.body||{}; if(!username||!password) return res.status(400).json({ success:false, message:'username and password required' }); const user = await authenticateUser(username, password); if(!user) return res.status(401).json({ success:false, message:'invalid credentials' }); const token = await createSession(user.id); res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; SameSite=Strict`); res.json({ success:true, user }); }catch(e){ console.error('login error',e); res.status(500).json({ success:false, message:'server error' }); } });

app.post('/api/logout', async (req,res)=>{ try{ const cookie = (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('session=')); if(cookie){ const token = cookie.split('=')[1]; const sessions = await loadSessions(); delete sessions[token]; await saveSessions(sessions); } res.setHeader('Set-Cookie', `session=; HttpOnly; Path=/; Max-Age=0`); res.json({ success:true }); }catch(e){ res.status(500).json({ success:false }); } });

app.get('/api/me', async (req,res)=>{ const user = await getUserFromRequest(req); if(!user) return res.json({ success:true, user:null }); res.json({ success:true, user }); });

// Create bot (authenticated). SETUP_KEY is optional: enforced only if set in env.
app.post('/api/bots', async (req,res)=>{ try{ const user = await getUserFromRequest(req); if(!user) return res.status(401).json({ success:false, message:'Authentication required' }); const setupKey = process.env.SETUP_KEY; if(setupKey){ const clientKey = (req.headers['x-setup-key'] || req.body.setup_key || '').toString(); if(clientKey !== setupKey) return res.status(401).json({ success:false, message:'Unauthorized: invalid setup key' }); }
    const { token, name } = req.body||{}; if(!token || typeof token !== 'string') return res.status(400).json({ success:false, message:'Token missing' }); const trimmed = token.trim(); if(trimmed.split('.').length!==3) return res.status(400).json({ success:false, message:'Invalid token' });
    try{ const { Client, GatewayIntentBits } = await import('discord.js'); const temp = new Client({ intents: [GatewayIntentBits.Guilds] }); await temp.login(trimmed); const tag = temp.user.tag; await temp.destroy(); const bots = await loadBots(); const id = randomUUID(); const entry = { id, name: name||tag, userTag: tag, token: trimmed, online:false, ownerId: user.id }; bots.push(entry); await saveBots(bots); startBotInstance(entry).catch(()=>{}); return res.json({ success:true, bot: { id: entry.id, name: entry.name, userTag: entry.userTag, ownerId: entry.ownerId } }); }catch(err){ return res.status(400).json({ success:false, message:'Failed to validate token: '+(err.message||String(err)) }); } }catch(err){ console.error('Error creating bot:', err); return res.status(500).json({ success:false, message:'Server error' }); } });

// Start/Stop (owner-only)
app.post('/api/bots/:id/start', async (req,res)=>{ const id = req.params.id; const bots = await loadBots(); const bot = bots.find(b=>b.id===id); if(!bot) return res.status(404).json({ success:false, message:'Bot not found' }); const user = await getUserFromRequest(req); if(!user) return res.status(401).json({ success:false, message:'Authentication required' }); if(bot.ownerId !== user.id) return res.status(403).json({ success:false, message:'Only the owner can start this bot' }); await startBotInstance(bot); bot.online = !!global.__botClients[bot.id]; await saveBots(bots); res.json({ success:true, online: bot.online }); });

app.post('/api/bots/:id/stop', async (req,res)=>{ const id = req.params.id; const bots = await loadBots(); const bot = bots.find(b=>b.id===id); if(!bot) return res.status(404).json({ success:false, message:'Bot not found' }); const user = await getUserFromRequest(req); if(!user) return res.status(401).json({ success:false, message:'Authentication required' }); if(bot.ownerId !== user.id) return res.status(403).json({ success:false, message:'Only the owner can stop this bot' }); await stopBotInstance(bot.id); bot.online = false; await saveBots(bots); res.json({ success:true }); });

// Legacy: write single token to .env — allow when SETUP_KEY not set, otherwise require it.
app.post('/api/token/save', async (req,res)=>{ try{ const { token } = req.body||{}; const setupKey = process.env.SETUP_KEY; if(setupKey){ const clientKey = (req.headers['x-setup-key'] || req.body.setup_key || '').toString(); if(clientKey !== setupKey) return res.status(401).json({ success:false, message:'Unauthorized: invalid setup key' }); }
    if(!token || typeof token !== 'string') return res.status(400).json({ success:false, message:'Token missing' }); const trimmed = token.trim(); if(trimmed.split('.').length!==3) return res.status(400).json({ success:false, message:'Invalid token format' }); const envPath = path.join(__dirname, '..', '.env'); await fs.writeFile(envPath, `DISCORD_BOT_TOKEN=${trimmed}\n`, 'utf8'); process.env.DISCORD_BOT_TOKEN = trimmed; return res.json({ success:true }); }catch(e){ console.error('token save error',e); res.status(500).json({ success:false, message:'Failed to save token' }); } });

app.listen(PORT, ()=>{ console.log(`🌐 Web server running at http://localhost:${PORT}`); });

console.log('Server initialized');
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// Serve extensionless routes to .html
app.use(async (req, res, next) => {
  try {
    const urlPath = decodeURIComponent(req.path);
    if (path.extname(urlPath) === '') {
      const candidate = path.join(__dirname, '..', 'web', urlPath + '.html');
      try { await fs.access(candidate); return res.sendFile(candidate); } catch (_) {}
      const indexCandidate = path.join(__dirname, '..', 'web', urlPath, 'index.html');
      try { await fs.access(indexCandidate); return res.sendFile(indexCandidate); } catch(_){}
    }
  } catch (e) {}
  next();
});

app.use('/', express.static(path.join(__dirname, '..', 'web')));

const DATA_DIR = path.join(__dirname, '..', 'data');
const BOTS_FILE = path.join(DATA_DIR, 'bots.json');

async function ensureDataDir(){ try{ await fs.mkdir(DATA_DIR, { recursive: true }); }catch(e){} }
async function loadJson(file, fallback){ await ensureDataDir(); const raw = await fs.readFile(file,'utf8').catch(()=>null); return raw ? JSON.parse(raw) : fallback; }
async function saveJson(file, value){ await ensureDataDir(); await fs.writeFile(file, JSON.stringify(value, null, 2), 'utf8'); }

const loadBots = async ()=> await loadJson(BOTS_FILE, []);
const saveBots = async (v)=> await saveJson(BOTS_FILE, v);

// lightweight in-memory clients map
global.__botClients = global.__botClients || {};

async function startBotInstance(bot){ if(!bot || !bot.token) return; if(global.__botClients[bot.id]) return; try{ const { Client, GatewayIntentBits } = await import('discord.js'); const client = new Client({ intents: [GatewayIntentBits.Guilds] }); client.once('ready', ()=>{ console.log(`🤖 Bot ${bot.name||bot.id} logged in as ${client.user.tag}`); }); client.on('error', (e)=>console.error('Discord client error for', bot.id, e && e.message ? e.message : e)); await client.login(bot.token); global.__botClients[bot.id] = client; bot.online = true; }catch(err){ console.error('Failed to start bot', bot.id, err && err.message ? err.message : err); bot.online=false; } }
async function stopBotInstance(botId){ const client = global.__botClients[botId]; if(!client) return; try{ await client.destroy(); }catch(e){} delete global.__botClients[botId]; }

// migrate legacy single token into data file and start saved bots
(async ()=>{ const bots = await loadBots(); if(process.env.DISCORD_BOT_TOKEN && bots.length===0){ const id = randomUUID(); bots.push({ id, name:'MigratedBot', token: process.env.DISCORD_BOT_TOKEN, ownerId:null }); await saveBots(bots); } for(const b of bots){ startBotInstance(b).catch(()=>{}); } })();

app.get('/health', (req,res)=>res.json({ ok:true }));

app.get('/api/bots', async (req,res)=>{ const bots = await loadBots(); res.json({ success:true, bots: bots.map(b=>({ id:b.id, name:b.name, userTag:b.userTag||null, online:!!b.online, ownerId:b.ownerId||null })) }); });

app.get('/api/bot/status', async (req,res)=>{ const bots = await loadBots(); res.json({ has_token: bots.length>0, online_count: bots.filter(b=>b.online).length }); });

// Legacy: save token (requires SETUP_KEY header/body)
app.post('/api/token/save', async (req,res)=>{ try{ const setupKey = process.env.SETUP_KEY; if(!setupKey) return res.status(503).json({ success:false, message:'SETUP_KEY not configured' }); const clientKey = (req.headers['x-setup-key'] || req.body.setup_key || '').toString(); if(clientKey !== setupKey) return res.status(401).json({ success:false, message:'invalid setup key' }); const { token, name } = req.body||{}; if(!token) return res.status(400).json({ success:false, message:'token missing' }); const trimmed = token.trim(); // basic format check
  if(trimmed.split('.').length!==3) return res.status(400).json({ success:false, message:'invalid token' });
  try{ const { Client, GatewayIntentBits } = await import('discord.js'); const temp = new Client({ intents: [GatewayIntentBits.Guilds] }); await temp.login(trimmed); const tag = temp.user.tag; await temp.destroy(); const bots = await loadBots(); const id = randomUUID(); const entry = { id, name: name||tag, userTag: tag, token: trimmed, ownerId:null }; bots.push(entry); await saveBots(bots); startBotInstance(entry).catch(()=>{}); return res.json({ success:true, bot: { id: entry.id, name: entry.name, userTag: entry.userTag } }); }catch(err){ return res.status(400).json({ success:false, message:'token validation failed: '+(err.message||String(err)) }); } }catch(e){ console.error('token save error',e); res.status(500).json({ success:false, message:'server error' }); } });

app.listen(PORT, ()=>{ console.log(`🌐 Web server running at http://localhost:${PORT}`); });

console.log('Server initialized');
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import { randomUUID, randomBytes, scryptSync, createHash } from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// Serve extensionless routes to .html
app.use(async (req, res, next) => {
  try {
    const urlPath = decodeURIComponent(req.path);
    if (path.extname(urlPath) === '') {
      const candidate = path.join(__dirname, '..', 'web', urlPath + '.html');
      try { await fs.access(candidate); return res.sendFile(candidate); } catch (_) {}
      const indexCandidate = path.join(__dirname, '..', 'web', urlPath, 'index.html');
      try { await fs.access(indexCandidate); return res.sendFile(indexCandidate); } catch(_){}
    }
  } catch (e) {}
  next();
});

app.use('/', express.static(path.join(__dirname, '..', 'web')));

const DATA_DIR = path.join(__dirname, '..', 'data');
const BOTS_FILE = path.join(DATA_DIR, 'bots.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

async function ensureDataDir(){ try{ await fs.mkdir(DATA_DIR, { recursive: true }); }catch(e){} }

async function loadJson(file, fallback){ await ensureDataDir(); const raw = await fs.readFile(file,'utf8').catch(()=>null); return raw ? JSON.parse(raw) : fallback; }
async function saveJson(file, value){ await ensureDataDir(); await fs.writeFile(file, JSON.stringify(value, null, 2), 'utf8'); }

const loadBots = async ()=> await loadJson(BOTS_FILE, []);
const saveBots = async (v)=> await saveJson(BOTS_FILE, v);
const loadUsers = async ()=> await loadJson(USERS_FILE, []);
const saveUsers = async (v)=> await saveJson(USERS_FILE, v);
const loadSessions = async ()=> await loadJson(SESSIONS_FILE, {});
const saveSessions = async (v)=> await saveJson(SESSIONS_FILE, v);

function hashPassword(password, salt){ const key=scryptSync(password, salt, 64).toString('hex'); return `${salt}$${key}`; }
function verifyPassword(password, stored){ try{ const [salt,key]=stored.split('$'); const derived=scryptSync(password,salt,64).toString('hex'); return timingSafeEqual(Buffer.from(derived,'hex'), Buffer.from(key,'hex')); }catch(e){return false;} }
function timingSafeEqual(a,b){ try{ if(a.length!==b.length) return false; const ha=createHash('sha256').update(a).digest(); const hb=createHash('sha256').update(b).digest(); return ha.equals(hb); }catch(e){return false;} }

async function createUser({ username, password, type, email }){
  const users = await loadUsers();
  if(users.find(u=>u.username===username)) throw new Error('Username already exists');
  const salt = randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const id = randomUUID();
  const user={ id, username, type: type||'noemail', email: email||null, passwordHash };
  users.push(user); await saveUsers(users); return { id: user.id, username: user.username, type: user.type, email: user.email };
}

async function authenticateUser(username, password){ const users = await loadUsers(); const u = users.find(x=>x.username===username); if(!u) return null; if(!verifyPassword(password, u.passwordHash)) return null; return { id: u.id, username: u.username, type: u.type, email: u.email }; }

async function createSession(userId){ const sessions = await loadSessions(); const token = randomBytes(24).toString('hex'); sessions[token] = { userId, created: Date.now() }; await saveSessions(sessions); return token; }

async function getUserFromRequest(req){ try{ const cookie = (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('session=')); if(!cookie) return null; const token = cookie.split('=')[1]; if(!token) return null; const sessions = await loadSessions(); const s = sessions[token]; if(!s) return null; const users = await loadUsers(); const u = users.find(x=>x.id===s.userId); if(!u) return null; return { id:u.id, username:u.username, type:u.type, email:u.email }; }catch(e){ return null; } }

// in-memory map of running discord clients by bot id
global.__botClients = global.__botClients || {};

async function startBotInstance(bot){ if(!bot || !bot.token) return; if(global.__botClients[bot.id]) return; try{ const { Client, GatewayIntentBits } = await import('discord.js'); const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] }); client.once('ready', async ()=>{ console.log(`🤖 Bot ${bot.name||bot.id} logged in as ${client.user.tag}`); bot.userTag = client.user.tag; bot.online = true; const bots = await loadBots(); const idx = bots.findIndex(b=>b.id===bot.id); if(idx!==-1){ bots[idx]=bot; await saveBots(bots); } }); client.on('error', (e)=>console.error('Discord client error for', bot.id, e && e.message ? e.message : e)); await client.login(bot.token); global.__botClients[bot.id] = client; bot.online = true; }catch(err){ console.error('Failed to start bot', bot.id, err && err.message ? err.message : err); bot.online=false; } }

async function stopBotInstance(botId){ const client = global.__botClients[botId]; if(!client) return; try{ await client.destroy(); }catch(e){} delete global.__botClients[botId]; }

// On startup migrate single-token .env into bots.json if present
(async ()=>{ const bots = await loadBots(); if(process.env.DISCORD_BOT_TOKEN && bots.length===0){ const token = process.env.DISCORD_BOT_TOKEN; const id = randomUUID(); bots.push({ id, name:'MigratedBot', userTag:null, token, online:false, ownerId:null }); await saveBots(bots); } for(const bot of bots){ startBotInstance(bot).catch(()=>{}); } })();

app.get('/health', (req,res)=>res.json({ ok:true }));

// List bots (no tokens returned)
app.get('/api/bots', async (req,res)=>{ const bots = await loadBots(); const out = bots.map(b=>({ id:b.id, name:b.name, userTag:b.userTag, online:!!b.online, ownerId:b.ownerId||null })); res.json({ success:true, bots: out }); });

app.get('/api/bot/status', async (req,res)=>{ const bots = await loadBots(); const online = bots.filter(b=>b.online).length; res.json({ has_token: bots.length>0, online_count: online }); });

// Register / Login / Logout / Me
app.post('/api/register', async (req,res)=>{ try{ const { username, password, type, email } = req.body||{}; if(!username||!password) return res.status(400).json({ success:false, message:'username and password required' }); if(type==='email' && !email) return res.status(400).json({ success:false, message:'email required for email account' }); try{ const user = await createUser({ username, password, type, email }); return res.json({ success:true, user }); }catch(e){ return res.status(400).json({ success:false, message: e.message||'Failed to create user' }); } }catch(e){ console.error('register error',e); res.status(500).json({ success:false, message:'server error' }); } });

app.post('/api/login', async (req,res)=>{ try{ const { username, password } = req.body||{}; if(!username||!password) return res.status(400).json({ success:false, message:'username and password required' }); const user = await authenticateUser(username, password); if(!user) return res.status(401).json({ success:false, message:'invalid credentials' }); const token = await createSession(user.id); res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; SameSite=Strict`); res.json({ success:true, user }); }catch(e){ console.error('login error',e); res.status(500).json({ success:false, message:'server error' }); } });

app.post('/api/logout', async (req,res)=>{ try{ const cookie = (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('session=')); if(cookie){ const token = cookie.split('=')[1]; const sessions = await loadSessions(); delete sessions[token]; await saveSessions(sessions); } res.setHeader('Set-Cookie', `session=; HttpOnly; Path=/; Max-Age=0`); res.json({ success:true }); }catch(e){ res.status(500).json({ success:false }); } });

app.get('/api/me', async (req,res)=>{ const user = await getUserFromRequest(req); if(!user) return res.json({ success:true, user:null }); res.json({ success:true, user }); });

// Create bot (authenticated + setup key)
app.post('/api/bots', async (req,res)=>{ try{ const user = await getUserFromRequest(req); if(!user) return res.status(401).json({ success:false, message:'Authentication required' }); const setupKey = process.env.SETUP_KEY; if(!setupKey) return res.status(503).json({ success:false, message:'Server not configured for web setup. Set SETUP_KEY in environment.' }); const clientKey = (req.headers['x-setup-key'] || req.body.setup_key || '').toString(); if(clientKey !== setupKey) return res.status(401).json({ success:false, message:'Unauthorized: invalid setup key' }); const { token, name } = req.body||{}; if(!token || typeof token !== 'string') return res.status(400).json({ success:false, message:'Token missing' }); const trimmed = token.trim(); if(trimmed.length<50 || trimmed.split('.').length!==3) return res.status(400).json({ success:false, message:'Invalid token' }); try{ const { Client, GatewayIntentBits } = await import('discord.js'); const temp = new Client({ intents: [GatewayIntentBits.Guilds] }); await temp.login(trimmed); const tag = temp.user.tag; await temp.destroy(); const bots = await loadBots(); const id = randomUUID(); const entry = { id, name: name||tag, userTag: tag, token: trimmed, online:false, ownerId: user.id }; bots.push(entry); await saveBots(bots); startBotInstance(entry).catch(()=>{}); return res.json({ success:true, bot: { id: entry.id, name: entry.name, userTag: entry.userTag, ownerId: entry.ownerId } }); }catch(err){ return res.status(400).json({ success:false, message:'Failed to validate token: '+(err.message||String(err)) }); } }catch(err){ console.error('Error creating bot:', err); return res.status(500).json({ success:false, message:'Server error' }); } });

// Start/Stop (owner-only)
app.post('/api/bots/:id/start', async (req,res)=>{ const id = req.params.id; const bots = await loadBots(); const bot = bots.find(b=>b.id===id); if(!bot) return res.status(404).json({ success:false, message:'Bot not found' }); const user = await getUserFromRequest(req); if(!user) return res.status(401).json({ success:false, message:'Authentication required' }); if(bot.ownerId !== user.id) return res.status(403).json({ success:false, message:'Only the owner can start this bot' }); await startBotInstance(bot); bot.online = !!global.__botClients[bot.id]; await saveBots(bots); res.json({ success:true, online: bot.online }); });

app.post('/api/bots/:id/stop', async (req,res)=>{ const id = req.params.id; const bots = await loadBots(); const bot = bots.find(b=>b.id===id); if(!bot) return res.status(404).json({ success:false, message:'Bot not found' }); const user = await getUserFromRequest(req); if(!user) return res.status(401).json({ success:false, message:'Authentication required' }); if(bot.ownerId !== user.id) return res.status(403).json({ success:false, message:'Only the owner can stop this bot' }); await stopBotInstance(bot.id); bot.online = false; await saveBots(bots); res.json({ success:true }); });

// Keep legacy /api/token/save for single-token workflows (optional)
app.post('/api/token/save', async (req,res)=>{ try{ const { token } = req.body||{}; const setupKey = process.env.SETUP_KEY; if(!setupKey) return res.status(503).json({ success:false, message:'Server not configured for web setup. Set SETUP_KEY in environment.' }); const clientKey = (req.headers['x-setup-key'] || req.body.setup_key || '').toString(); if(clientKey !== setupKey) return res.status(401).json({ success:false, message:'Unauthorized: invalid setup key' }); if(!token || typeof token !== 'string') return res.status(400).json({ success:false, message:'Token missing' }); const trimmed = token.trim(); if(trimmed.length<50 || trimmed.split('.').length!==3) return res.status(400).json({ success:false, message:'Invalid token format' }); // write to .env
  const envPath = path.join(__dirname, '..', '.env'); await fs.writeFile(envPath, `DISCORD_BOT_TOKEN=${trimmed}\n`, 'utf8'); process.env.DISCORD_BOT_TOKEN = trimmed; return res.json({ success:true }); }catch(e){ console.error('token save error',e); res.status(500).json({ success:false, message:'Failed to save token' }); } });

app.listen(PORT, ()=>{ console.log(`🌐 Web server running at http://localhost:${PORT}`); });

// Replace file with a clean, consolidated implementation
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import { randomUUID, randomBytes, scryptSync, createHash } from 'crypto';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// Serve extensionless routes to .html
app.use(async (req, res, next) => {
  try {
    const urlPath = decodeURIComponent(req.path);
    if (path.extname(urlPath) === '') {
      const candidate = path.join(__dirname, '..', 'web', urlPath + '.html');
      try { await fs.access(candidate); return res.sendFile(candidate); } catch (_) {}
      const indexCandidate = path.join(__dirname, '..', 'web', urlPath, 'index.html');
      try { await fs.access(indexCandidate); return res.sendFile(indexCandidate); } catch(_){ }
    }
  } catch (e) {}
  next();
});

app.use('/', express.static(path.join(__dirname, '..', 'web')));

const DATA_DIR = path.join(__dirname, '..', 'data');
const BOTS_FILE = path.join(DATA_DIR, 'bots.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

async function ensureDataDir(){ try{ await fs.mkdir(DATA_DIR, { recursive: true }); }catch(e){} }
async function loadJson(file, fallback){ await ensureDataDir(); const raw = await fs.readFile(file,'utf8').catch(()=>null); return raw ? JSON.parse(raw) : fallback; }
async function saveJson(file, value){ await ensureDataDir(); await fs.writeFile(file, JSON.stringify(value, null, 2), 'utf8'); }

const loadBots = async ()=> await loadJson(BOTS_FILE, []);
const saveBots = async (v)=> await saveJson(BOTS_FILE, v);
const loadUsers = async ()=> await loadJson(USERS_FILE, []);
const saveUsers = async (v)=> await saveJson(USERS_FILE, v);
const loadSessions = async ()=> await loadJson(SESSIONS_FILE, {});
const saveSessions = async (v)=> await saveJson(SESSIONS_FILE, v);

function hashPassword(password, salt){ const key=scryptSync(password, salt, 64).toString('hex'); return `${salt}$${key}`; }
function timingSafeEqual(a,b){ try{ if(a.length!==b.length) return false; const ha=createHash('sha256').update(a).digest(); const hb=createHash('sha256').update(b).digest(); return ha.equals(hb); }catch(e){return false;} }
function verifyPassword(password, stored){ try{ const [salt,key]=stored.split('$'); const derived=scryptSync(password,salt,64).toString('hex'); return timingSafeEqual(Buffer.from(derived,'hex'), Buffer.from(key,'hex')); }catch(e){return false;} }

async function createUser({ username, password, type, email }){
  const users = await loadUsers();
  if(users.find(u=>u.username===username)) throw new Error('Username already exists');
  const salt = randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const id = randomUUID();
  const user={ id, username, type: type||'noemail', email: email||null, passwordHash };
  users.push(user); await saveUsers(users); return { id: user.id, username: user.username, type: user.type, email: user.email };
}

async function authenticateUser(username, password){ const users = await loadUsers(); const u = users.find(x=>x.username===username); if(!u) return null; if(!verifyPassword(password, u.passwordHash)) return null; return { id: u.id, username: u.username, type: u.type, email: u.email }; }

async function createSession(userId){ const sessions = await loadSessions(); const token = randomBytes(24).toString('hex'); sessions[token] = { userId, created: Date.now() }; await saveSessions(sessions); return token; }

async function getUserFromRequest(req){ try{ const cookie = (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('session=')); if(!cookie) return null; const token = cookie.split('=')[1]; if(!token) return null; const sessions = await loadSessions(); const s = sessions[token]; if(!s) return null; const users = await loadUsers(); const u = users.find(x=>x.id===s.userId); if(!u) return null; return { id:u.id, username:u.username, type:u.type, email:u.email }; }catch(e){ return null; } }

global.__botClients = global.__botClients || {};
async function startBotInstance(bot){ if(!bot || !bot.token) return; if(global.__botClients[bot.id]) return; try{ const { Client, GatewayIntentBits } = await import('discord.js'); const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] }); client.once('ready', async ()=>{ console.log(`🤖 Bot ${bot.name||bot.id} logged in as ${client.user.tag}`); bot.userTag = client.user.tag; bot.online = true; const bots = await loadBots(); const idx = bots.findIndex(b=>b.id===bot.id); if(idx!==-1){ bots[idx]=bot; await saveBots(bots); } }); client.on('error', (e)=>console.error('Discord client error for', bot.id, e && e.message ? e.message : e)); await client.login(bot.token); global.__botClients[bot.id] = client; bot.online = true; }catch(err){ console.error('Failed to start bot', bot.id, err && err.message ? err.message : err); bot.online=false; } }
async function stopBotInstance(botId){ const client = global.__botClients[botId]; if(!client) return; try{ await client.destroy(); }catch(e){} delete global.__botClients[botId]; }

// On startup migrate single-token .env into bots.json and start bots
(async ()=>{ const bots = await loadBots(); if(process.env.DISCORD_BOT_TOKEN && bots.length===0){ const token = process.env.DISCORD_BOT_TOKEN; const id = randomUUID(); bots.push({ id, name:'MigratedBot', userTag:null, token, online:false, ownerId:null }); await saveBots(bots); } for(const bot of bots){ startBotInstance(bot).catch(()=>{}); } })();

app.get('/health', (req,res)=>res.json({ ok:true }));

app.get('/api/bots', async (req,res)=>{ const bots = await loadBots(); const out = bots.map(b=>({ id:b.id, name:b.name, userTag:b.userTag, online:!!b.online, ownerId:b.ownerId||null })); res.json({ success:true, bots: out }); });

app.get('/api/bot/status', async (req,res)=>{ const bots = await loadBots(); const online = bots.filter(b=>b.online).length; res.json({ has_token: bots.length>0, online_count: online }); });

app.post('/api/register', async (req,res)=>{ try{ const { username, password, type, email } = req.body||{}; if(!username||!password) return res.status(400).json({ success:false, message:'username and password required' }); if(type==='email' && !email) return res.status(400).json({ success:false, message:'email required for email account' }); try{ const user = await createUser({ username, password, type, email }); return res.json({ success:true, user }); }catch(e){ return res.status(400).json({ success:false, message: e.message||'Failed to create user' }); } }catch(e){ console.error('register error',e); res.status(500).json({ success:false, message:'server error' }); } });

app.post('/api/login', async (req,res)=>{ try{ const { username, password } = req.body||{}; if(!username||!password) return res.status(400).json({ success:false, message:'username and password required' }); const user = await authenticateUser(username, password); if(!user) return res.status(401).json({ success:false, message:'invalid credentials' }); const token = await createSession(user.id); res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; SameSite=Strict`); res.json({ success:true, user }); }catch(e){ console.error('login error',e); res.status(500).json({ success:false, message:'server error' }); } });

app.post('/api/logout', async (req,res)=>{ try{ const cookie = (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('session=')); if(cookie){ const token = cookie.split('=')[1]; const sessions = await loadSessions(); delete sessions[token]; await saveSessions(sessions); } res.setHeader('Set-Cookie', `session=; HttpOnly; Path=/; Max-Age=0`); res.json({ success:true }); }catch(e){ res.status(500).json({ success:false }); } });

app.get('/api/me', async (req,res)=>{ const user = await getUserFromRequest(req); if(!user) return res.json({ success:true, user:null }); res.json({ success:true, user }); });

app.post('/api/bots', async (req,res)=>{ try{ const user = await getUserFromRequest(req); if(!user) return res.status(401).json({ success:false, message:'Authentication required' }); const setupKey = process.env.SETUP_KEY; if(!setupKey) return res.status(503).json({ success:false, message:'Server not configured for web setup. Set SETUP_KEY in environment.' }); const clientKey = (req.headers['x-setup-key'] || req.body.setup_key || '').toString(); if(clientKey !== setupKey) return res.status(401).json({ success:false, message:'Unauthorized: invalid setup key' }); const { token, name } = req.body||{}; if(!token || typeof token !== 'string') return res.status(400).json({ success:false, message:'Token missing' }); const trimmed = token.trim(); if(trimmed.length<50 || trimmed.split('.').length!==3) return res.status(400).json({ success:false, message:'Invalid token' }); try{ const { Client, GatewayIntentBits } = await import('discord.js'); const temp = new Client({ intents: [GatewayIntentBits.Guilds] }); await temp.login(trimmed); const tag = temp.user.tag; await temp.destroy(); const bots = await loadBots(); const id = randomUUID(); const entry = { id, name: name||tag, userTag: tag, token: trimmed, online:false, ownerId: user.id }; bots.push(entry); await saveBots(bots); startBotInstance(entry).catch(()=>{}); return res.json({ success:true, bot: { id: entry.id, name: entry.name, userTag: entry.userTag, ownerId: entry.ownerId } }); }catch(err){ return res.status(400).json({ success:false, message:'Failed to validate token: '+(err.message||String(err)) }); } }catch(err){ console.error('Error creating bot:', err); return res.status(500).json({ success:false, message:'Server error' }); } });

app.post('/api/bots/:id/start', async (req,res)=>{ const id = req.params.id; const bots = await loadBots(); const bot = bots.find(b=>b.id===id); if(!bot) return res.status(404).json({ success:false, message:'Bot not found' }); const user = await getUserFromRequest(req); if(!user) return res.status(401).json({ success:false, message:'Authentication required' }); if(bot.ownerId !== user.id) return res.status(403).json({ success:false, message:'Only the owner can start this bot' }); await startBotInstance(bot); bot.online = !!global.__botClients[bot.id]; await saveBots(bots); res.json({ success:true, online: bot.online }); });

app.post('/api/bots/:id/stop', async (req,res)=>{ const id = req.params.id; const bots = await loadBots(); const bot = bots.find(b=>b.id===id); if(!bot) return res.status(404).json({ success:false, message:'Bot not found' }); const user = await getUserFromRequest(req); if(!user) return res.status(401).json({ success:false, message:'Authentication required' }); if(bot.ownerId !== user.id) return res.status(403).json({ success:false, message:'Only the owner can stop this bot' }); await stopBotInstance(bot.id); bot.online = false; await saveBots(bots); res.json({ success:true }); });

app.post('/api/token/save', async (req,res)=>{ try{ const { token } = req.body||{}; const setupKey = process.env.SETUP_KEY; if(!setupKey) return res.status(503).json({ success:false, message:'Server not configured for web setup. Set SETUP_KEY in environment.' }); const clientKey = (req.headers['x-setup-key'] || req.body.setup_key || '').toString(); if(clientKey !== setupKey) return res.status(401).json({ success:false, message:'Unauthorized: invalid setup key' }); if(!token || typeof token !== 'string') return res.status(400).json({ success:false, message:'Token missing' }); const trimmed = token.trim(); if(trimmed.length<50 || trimmed.split('.').length!==3) return res.status(400).json({ success:false, message:'Invalid token format' }); const envPath = path.join(__dirname, '..', '.env'); await fs.writeFile(envPath, `DISCORD_BOT_TOKEN=${trimmed}\n`, 'utf8'); process.env.DISCORD_BOT_TOKEN = trimmed; return res.json({ success:true }); }catch(e){ console.error('token save error',e); res.status(500).json({ success:false, message:'Failed to save token' }); } });

app.listen(PORT, ()=>{ console.log(`🌐 Web server running at http://localhost:${PORT}`); });

console.log('Server initialized');

  const id = req.params.id;
  const bots = await loadBots();
  const bot = bots.find(b => b.id === id);
  if (!bot) return res.status(404).json({ success: false, message: 'Bot not found' });
  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ success: false, message: 'Authentication required' });
  if (bot.ownerId !== user.id) return res.status(403).json({ success: false, message: 'Only the owner can start this bot' });
  await startBotInstance(bot);
  bot.online = !!global.__botClients[bot.id];
  await saveBots(bots);
  import express from 'express';
  import path from 'path';
  import { fileURLToPath } from 'url';
  import dotenv from 'dotenv';
  import { promises as fs } from 'fs';
  import { randomUUID, randomBytes, scryptSync, createHash } from 'crypto';

  dotenv.config();

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const app = express();
  app.use(express.json());
  const PORT = process.env.PORT || 3000;

  // Serve extensionless routes to .html
  app.use(async (req, res, next) => {
    try {
      const urlPath = decodeURIComponent(req.path);
      if (path.extname(urlPath) === '') {
        const candidate = path.join(__dirname, '..', 'web', urlPath + '.html');
        try { await fs.access(candidate); return res.sendFile(candidate); } catch (_) {}
        const indexCandidate = path.join(__dirname, '..', 'web', urlPath, 'index.html');
        try { await fs.access(indexCandidate); return res.sendFile(indexCandidate); } catch(_){}
      }
    } catch (e) {}
    next();
  });

  app.use('/', express.static(path.join(__dirname, '..', 'web')));

  const DATA_DIR = path.join(__dirname, '..', 'data');
  const BOTS_FILE = path.join(DATA_DIR, 'bots.json');
  const USERS_FILE = path.join(DATA_DIR, 'users.json');
  const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

  async function ensureDataDir(){ try{ await fs.mkdir(DATA_DIR, { recursive: true }); }catch(e){} }

  async function loadJson(file, fallback){ await ensureDataDir(); const raw = await fs.readFile(file,'utf8').catch(()=>null); return raw ? JSON.parse(raw) : fallback; }
  async function saveJson(file, value){ await ensureDataDir(); await fs.writeFile(file, JSON.stringify(value, null, 2), 'utf8'); }

  const loadBots = async ()=> await loadJson(BOTS_FILE, []);
  const saveBots = async (v)=> await saveJson(BOTS_FILE, v);
  const loadUsers = async ()=> await loadJson(USERS_FILE, []);
  const saveUsers = async (v)=> await saveJson(USERS_FILE, v);
  const loadSessions = async ()=> await loadJson(SESSIONS_FILE, {});
  const saveSessions = async (v)=> await saveJson(SESSIONS_FILE, v);

  function hashPassword(password, salt){ const key=scryptSync(password, salt, 64).toString('hex'); return `${salt}$${key}`; }
  function timingSafeEqual(a,b){ try{ if(a.length!==b.length) return false; const ha=createHash('sha256').update(a).digest(); const hb=createHash('sha256').update(b).digest(); return ha.equals(hb); }catch(e){return false;} }
  function verifyPassword(password, stored){ try{ const [salt,key]=stored.split('$'); const derived=scryptSync(password,salt,64).toString('hex'); return timingSafeEqual(Buffer.from(derived,'hex'), Buffer.from(key,'hex')); }catch(e){return false;} }

  async function createUser({ username, password, type, email }){
    const users = await loadUsers();
    if(users.find(u=>u.username===username)) throw new Error('Username already exists');
    const salt = randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const id = randomUUID();
    const user={ id, username, type: type||'noemail', email: email||null, passwordHash };
    users.push(user); await saveUsers(users); return { id: user.id, username: user.username, type: user.type, email: user.email };
  }

  async function authenticateUser(username, password){ const users = await loadUsers(); const u = users.find(x=>x.username===username); if(!u) return null; if(!verifyPassword(password, u.passwordHash)) return null; return { id: u.id, username: u.username, type: u.type, email: u.email }; }

  async function createSession(userId){ const sessions = await loadSessions(); const token = randomBytes(24).toString('hex'); sessions[token] = { userId, created: Date.now() }; await saveSessions(sessions); return token; }

  async function getUserFromRequest(req){ try{ const cookie = (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('session=')); if(!cookie) return null; const token = cookie.split('=')[1]; if(!token) return null; const sessions = await loadSessions(); const s = sessions[token]; if(!s) return null; const users = await loadUsers(); const u = users.find(x=>x.id===s.userId); if(!u) return null; return { id:u.id, username:u.username, type:u.type, email:u.email }; }catch(e){ return null; } }

  // in-memory map of running discord clients by bot id
  global.__botClients = global.__botClients || {};

  async function startBotInstance(bot){ if(!bot || !bot.token) return; if(global.__botClients[bot.id]) return; try{ const { Client, GatewayIntentBits } = await import('discord.js'); const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] }); client.once('ready', async ()=>{ console.log(`🤖 Bot ${bot.name||bot.id} logged in as ${client.user.tag}`); bot.userTag = client.user.tag; bot.online = true; const bots = await loadBots(); const idx = bots.findIndex(b=>b.id===bot.id); if(idx!==-1){ bots[idx]=bot; await saveBots(bots); } }); client.on('error', (e)=>console.error('Discord client error for', bot.id, e && e.message ? e.message : e)); await client.login(bot.token); global.__botClients[bot.id] = client; bot.online = true; }catch(err){ console.error('Failed to start bot', bot.id, err && err.message ? err.message : err); bot.online=false; } }

  async function stopBotInstance(botId){ const client = global.__botClients[botId]; if(!client) return; try{ await client.destroy(); }catch(e){} delete global.__botClients[botId]; }

  // On startup migrate single-token .env into bots.json if present and start saved bots
  (async ()=>{ const bots = await loadBots(); if(process.env.DISCORD_BOT_TOKEN && bots.length===0){ const token = process.env.DISCORD_BOT_TOKEN; const id = randomUUID(); bots.push({ id, name:'MigratedBot', userTag:null, token, online:false, ownerId:null }); await saveBots(bots); } for(const bot of bots){ startBotInstance(bot).catch(()=>{}); } })();

  app.get('/health', (req,res)=>res.json({ ok:true }));

  // List bots (no tokens returned)
  app.get('/api/bots', async (req,res)=>{ const bots = await loadBots(); const out = bots.map(b=>({ id:b.id, name:b.name, userTag:b.userTag, online:!!b.online, ownerId:b.ownerId||null })); res.json({ success:true, bots: out }); });

  app.get('/api/bot/status', async (req,res)=>{ const bots = await loadBots(); const online = bots.filter(b=>b.online).length; res.json({ has_token: bots.length>0, online_count: online }); });

  // Register / Login / Logout / Me
  app.post('/api/register', async (req,res)=>{ try{ const { username, password, type, email } = req.body||{}; if(!username||!password) return res.status(400).json({ success:false, message:'username and password required' }); if(type==='email' && !email) return res.status(400).json({ success:false, message:'email required for email account' }); try{ const user = await createUser({ username, password, type, email }); return res.json({ success:true, user }); }catch(e){ return res.status(400).json({ success:false, message: e.message||'Failed to create user' }); } }catch(e){ console.error('register error',e); res.status(500).json({ success:false, message:'server error' }); } });

  app.post('/api/login', async (req,res)=>{ try{ const { username, password } = req.body||{}; if(!username||!password) return res.status(400).json({ success:false, message:'username and password required' }); const user = await authenticateUser(username, password); if(!user) return res.status(401).json({ success:false, message:'invalid credentials' }); const token = await createSession(user.id); res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; SameSite=Strict`); res.json({ success:true, user }); }catch(e){ console.error('login error',e); res.status(500).json({ success:false, message:'server error' }); } });

  app.post('/api/logout', async (req,res)=>{ try{ const cookie = (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('session=')); if(cookie){ const token = cookie.split('=')[1]; const sessions = await loadSessions(); delete sessions[token]; await saveSessions(sessions); } res.setHeader('Set-Cookie', `session=; HttpOnly; Path=/; Max-Age=0`); res.json({ success:true }); }catch(e){ res.status(500).json({ success:false }); } });

  app.get('/api/me', async (req,res)=>{ const user = await getUserFromRequest(req); if(!user) return res.json({ success:true, user:null }); res.json({ success:true, user }); });

  // Create bot (authenticated + setup key)
  app.post('/api/bots', async (req,res)=>{ try{ const user = await getUserFromRequest(req); if(!user) return res.status(401).json({ success:false, message:'Authentication required' }); const setupKey = process.env.SETUP_KEY; if(!setupKey) return res.status(503).json({ success:false, message:'Server not configured for web setup. Set SETUP_KEY in environment.' }); const clientKey = (req.headers['x-setup-key'] || req.body.setup_key || '').toString(); if(clientKey !== setupKey) return res.status(401).json({ success:false, message:'Unauthorized: invalid setup key' }); const { token, name } = req.body||{}; if(!token || typeof token !== 'string') return res.status(400).json({ success:false, message:'Token missing' }); const trimmed = token.trim(); if(trimmed.length<50 || trimmed.split('.').length!==3) return res.status(400).json({ success:false, message:'Invalid token' }); try{ const { Client, GatewayIntentBits } = await import('discord.js'); const temp = new Client({ intents: [GatewayIntentBits.Guilds] }); await temp.login(trimmed); const tag = temp.user.tag; await temp.destroy(); const bots = await loadBots(); const id = randomUUID(); const entry = { id, name: name||tag, userTag: tag, token: trimmed, online:false, ownerId: user.id }; bots.push(entry); await saveBots(bots); startBotInstance(entry).catch(()=>{}); return res.json({ success:true, bot: { id: entry.id, name: entry.name, userTag: entry.userTag, ownerId: entry.ownerId } }); }catch(err){ return res.status(400).json({ success:false, message:'Failed to validate token: '+(err.message||String(err)) }); } }catch(err){ console.error('Error creating bot:', err); return res.status(500).json({ success:false, message:'Server error' }); } });

  // Start/Stop (owner-only)
  app.post('/api/bots/:id/start', async (req,res)=>{ const id = req.params.id; const bots = await loadBots(); const bot = bots.find(b=>b.id===id); if(!bot) return res.status(404).json({ success:false, message:'Bot not found' }); const user = await getUserFromRequest(req); if(!user) return res.status(401).json({ success:false, message:'Authentication required' }); if(bot.ownerId !== user.id) return res.status(403).json({ success:false, message:'Only the owner can start this bot' }); await startBotInstance(bot); bot.online = !!global.__botClients[bot.id]; await saveBots(bots); res.json({ success:true, online: bot.online }); });

  app.post('/api/bots/:id/stop', async (req,res)=>{ const id = req.params.id; const bots = await loadBots(); const bot = bots.find(b=>b.id===id); if(!bot) return res.status(404).json({ success:false, message:'Bot not found' }); const user = await getUserFromRequest(req); if(!user) return res.status(401).json({ success:false, message:'Authentication required' }); if(bot.ownerId !== user.id) return res.status(403).json({ success:false, message:'Only the owner can stop this bot' }); await stopBotInstance(bot.id); bot.online = false; await saveBots(bots); res.json({ success:true }); });

  // Legacy: write single token to .env (kept for compatibility but not recommended)
  app.post('/api/token/save', async (req,res)=>{ try{ const { token } = req.body||{}; const setupKey = process.env.SETUP_KEY; if(!setupKey) return res.status(503).json({ success:false, message:'Server not configured for web setup. Set SETUP_KEY in environment.' }); const clientKey = (req.headers['x-setup-key'] || req.body.setup_key || '').toString(); if(clientKey !== setupKey) return res.status(401).json({ success:false, message:'Unauthorized: invalid setup key' }); if(!token || typeof token !== 'string') return res.status(400).json({ success:false, message:'Token missing' }); const trimmed = token.trim(); if(trimmed.length<50 || trimmed.split('.').length!==3) return res.status(400).json({ success:false, message:'Invalid token format' }); const envPath = path.join(__dirname, '..', '.env'); await fs.writeFile(envPath, `DISCORD_BOT_TOKEN=${trimmed}\n`, 'utf8'); process.env.DISCORD_BOT_TOKEN = trimmed; return res.json({ success:true }); }catch(e){ console.error('token save error',e); res.status(500).json({ success:false, message:'Failed to save token' }); } });

  app.listen(PORT, ()=>{ console.log(`🌐 Web server running at http://localhost:${PORT}`); });

  console.log('Server initialized');
    const setupKey = process.env.SETUP_KEY;
    if (!setupKey) return res.status(503).json({ success: false, message: 'Server not configured for web setup. Set SETUP_KEY in environment.' });
    const clientKey = (req.headers['x-setup-key'] || req.body.setup_key || '').toString();
    if (clientKey !== setupKey) return res.status(401).json({ success: false, message: 'Unauthorized: invalid setup key' });

    const { token, name } = req.body || {};
    if (!token || typeof token !== 'string') return res.status(400).json({ success: false, message: 'Token missing' });
    const trimmed = token.trim();
    if (trimmed.length < 50 || trimmed.split('.').length !== 3) return res.status(400).json({ success: false, message: 'Invalid token' });

    // Validate token by attempting a temporary login to get the bot user tag
    try {
      const { Client, GatewayIntentBits } = await import('discord.js');
      const temp = new Client({ intents: [GatewayIntentBits.Guilds] });
      await temp.login(trimmed);
      const tag = temp.user.tag;
      await temp.destroy();

      // Save bot entry
      const bots = await loadBots();
      const id = randomUUID();
      const entry = { id, name: name || tag, userTag: tag, token: trimmed, online: false };
      bots.push(entry);
      await saveBots(bots);

      // Start persistent instance
      startBotInstance(entry).catch(() => {});

      return res.json({ success: true, bot: { id: entry.id, name: entry.name, userTag: entry.userTag } });
    } catch (err) {
      return res.status(400).json({ success: false, message: 'Failed to validate token: ' + (err.message || String(err)) });
    }
  } catch (err) {
    console.error('Error creating bot:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/bots/:id/start', async (req, res) => {
  const id = req.params.id;
  const bots = await loadBots();
  const bot = bots.find(b => b.id === id);
  if (!bot) return res.status(404).json({ success: false, message: 'Bot not found' });
  await startBotInstance(bot);
  bot.online = !!global.__botClients[bot.id];
  await saveBots(bots);
  import express from 'express';
  import path from 'path';
  import { fileURLToPath } from 'url';
  import dotenv from 'dotenv';
  import { promises as fs } from 'fs';
  import { randomUUID, randomBytes, scryptSync, createHash } from 'crypto';

  dotenv.config();
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const app = express();
  app.use(express.json());
  const PORT = process.env.PORT || 3000;

  const DATA_DIR = path.join(__dirname, '..', 'data');
  const BOTS_FILE = path.join(DATA_DIR, 'bots.json');
  const USERS_FILE = path.join(DATA_DIR, 'users.json');
  const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

  async function ensureDataDir(){ try{ await fs.mkdir(DATA_DIR, { recursive: true }); }catch(e){} }
  async function loadJson(file, fallback){ await ensureDataDir(); const raw = await fs.readFile(file,'utf8').catch(()=>null); return raw ? JSON.parse(raw) : fallback; }
  async function saveJson(file, value){ await ensureDataDir(); await fs.writeFile(file, JSON.stringify(value, null, 2), 'utf8'); }

  const loadBots = async ()=> await loadJson(BOTS_FILE, []);
  const saveBots = async (v)=> await saveJson(BOTS_FILE, v);
  const loadUsers = async ()=> await loadJson(USERS_FILE, []);
  const saveUsers = async (v)=> await saveJson(USERS_FILE, v);
  const loadSessions = async ()=> await loadJson(SESSIONS_FILE, {});
  const saveSessions = async (v)=> await saveJson(SESSIONS_FILE, v);

  function hashPassword(password, salt){ const key=scryptSync(password, salt, 64).toString('hex'); return `${salt}$${key}`; }
  function timingSafeEqual(a,b){ try{ if(a.length!==b.length) return false; const ha=createHash('sha256').update(a).digest(); const hb=createHash('sha256').update(b).digest(); return ha.equals(hb); }catch(e){return false;} }
  function verifyPassword(password, stored){ try{ const [salt,key]=stored.split('$'); const derived=scryptSync(password,salt,64).toString('hex'); return timingSafeEqual(Buffer.from(derived,'hex'), Buffer.from(key,'hex')); }catch(e){return false;} }

  async function createUser({ username, password, type, email }){
    const users = await loadUsers();
    if(users.find(u=>u.username===username)) throw new Error('Username already exists');
    const salt = randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const id = randomUUID();
    const user={ id, username, type: type||'noemail', email: email||null, passwordHash };
    users.push(user); await saveUsers(users); return { id: user.id, username: user.username, type: user.type, email: user.email };
  }

  async function authenticateUser(username, password){ const users = await loadUsers(); const u = users.find(x=>x.username===username); if(!u) return null; if(!verifyPassword(password, u.passwordHash)) return null; return { id: u.id, username: u.username, type: u.type, email: u.email }; }

  async function createSession(userId){ const sessions = await loadSessions(); const token = randomBytes(24).toString('hex'); sessions[token] = { userId, created: Date.now() }; await saveSessions(sessions); return token; }

  async function getUserFromRequest(req){ try{ const cookie = (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('session=')); if(!cookie) return null; const token = cookie.split('=')[1]; if(!token) return null; const sessions = await loadSessions(); const s = sessions[token]; if(!s) return null; const users = await loadUsers(); const u = users.find(x=>x.id===s.userId); if(!u) return null; return { id:u.id, username:u.username, type:u.type, email:u.email }; }catch(e){ return null; } }

  global.__botClients = global.__botClients || {};
  async function startBotInstance(bot){ if(!bot || !bot.token) return; if(global.__botClients[bot.id]) return; try{ const { Client, GatewayIntentBits } = await import('discord.js'); const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] }); client.once('ready', async ()=>{ console.log(`🤖 Bot ${bot.name||bot.id} logged in as ${client.user.tag}`); bot.userTag = client.user.tag; bot.online = true; const bots = await loadBots(); const idx = bots.findIndex(b=>b.id===bot.id); if(idx!==-1){ bots[idx]=bot; await saveBots(bots); } }); client.on('error', (e)=>console.error('Discord client error for', bot.id, e && e.message ? e.message : e)); await client.login(bot.token); global.__botClients[bot.id] = client; bot.online = true; }catch(err){ console.error('Failed to start bot', bot.id, err && err.message ? err.message : err); bot.online=false; } }
  async function stopBotInstance(botId){ const client = global.__botClients[botId]; if(!client) return; try{ await client.destroy(); }catch(e){} delete global.__botClients[botId]; }

  // Serve static site + extensionless mapping
  app.use(async (req,res,next)=>{ try{ const urlPath = decodeURIComponent(req.path); if (path.extname(urlPath) === ''){ const candidate = path.join(__dirname,'..','web', urlPath + '.html'); try{ await fs.access(candidate); return res.sendFile(candidate); }catch(_){} const idx = path.join(__dirname,'..','web', urlPath, 'index.html'); try{ await fs.access(idx); return res.sendFile(idx);}catch(_){} } }catch(e){} next(); });
  app.use('/', express.static(path.join(__dirname,'..','web')));

  // Migrate legacy token and start saved bots
  (async ()=>{ const bots = await loadBots(); if(process.env.DISCORD_BOT_TOKEN && bots.length===0){ const token = process.env.DISCORD_BOT_TOKEN; const id = randomUUID(); bots.push({ id, name:'MigratedBot', userTag:null, token, online:false, ownerId:null }); await saveBots(bots); } for(const b of bots) startBotInstance(b).catch(()=>{}); })();

  app.get('/health',(req,res)=>res.json({ok:true}));

  app.get('/api/bots', async (req,res)=>{ const bots = await loadBots(); res.json({ success:true, bots: bots.map(b=>({ id:b.id, name:b.name, userTag:b.userTag, online:!!b.online, ownerId:b.ownerId||null })) }); });

  app.get('/api/bot/status', async (req,res)=>{ const bots = await loadBots(); res.json({ has_token: bots.length>0, online_count: bots.filter(b=>b.online).length }); });

  app.post('/api/register', async (req,res)=>{ try{ const { username,password,type,email } = req.body||{}; if(!username||!password) return res.status(400).json({success:false,message:'username and password required'}); if(type==='email' && !email) return res.status(400).json({success:false,message:'email required for email account'}); const user = await createUser({ username,password,type,email }); return res.json({ success:true, user }); }catch(e){ res.status(400).json({ success:false, message: e.message||'failed' }); } });

  app.post('/api/login', async (req,res)=>{ try{ const { username,password } = req.body||{}; if(!username||!password) return res.status(400).json({success:false}); const user = await authenticateUser(username,password); if(!user) return res.status(401).json({success:false}); const token = await createSession(user.id); res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; SameSite=Strict`); res.json({ success:true, user }); }catch(e){ res.status(500).json({ success:false }); } });

  app.post('/api/logout', async (req,res)=>{ try{ const cookie = (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('session=')); if(cookie){ const token = cookie.split('=')[1]; const sessions = await loadSessions(); delete sessions[token]; await saveSessions(sessions); } res.setHeader('Set-Cookie', `session=; HttpOnly; Path=/; Max-Age=0`); res.json({ success:true }); }catch(e){ res.status(500).json({ success:false }); } });

  app.get('/api/me', async (req,res)=>{ const u = await getUserFromRequest(req); res.json({ success:true, user: u }); });

  app.post('/api/bots', async (req,res)=>{ try{ const user = await getUserFromRequest(req); if(!user) return res.status(401).json({ success:false, message:'auth required' }); const setupKey = process.env.SETUP_KEY; if(!setupKey) return res.status(503).json({ success:false, message:'SETUP_KEY missing' }); const clientKey = (req.headers['x-setup-key']||req.body.setup_key||'').toString(); if(clientKey !== setupKey) return res.status(401).json({ success:false, message:'invalid setup key' }); const { token, name } = req.body||{}; if(!token) return res.status(400).json({ success:false, message:'token missing' }); const trimmed = token.trim(); if(trimmed.split('.').length!==3) return res.status(400).json({ success:false, message:'invalid token' }); try{ const { Client, GatewayIntentBits } = await import('discord.js'); const temp = new Client({ intents:[GatewayIntentBits.Guilds] }); await temp.login(trimmed); const tag = temp.user.tag; await temp.destroy(); const bots = await loadBots(); const id = randomUUID(); const entry = { id, name: name||tag, userTag: tag, token: trimmed, online:false, ownerId: user.id }; bots.push(entry); await saveBots(bots); startBotInstance(entry).catch(()=>{}); return res.json({ success:true, bot: { id: entry.id, name: entry.name, userTag: entry.userTag } }); }catch(err){ return res.status(400).json({ success:false, message: 'token validation failed' }); } }catch(e){ res.status(500).json({ success:false }); } });

  app.post('/api/bots/:id/start', async (req,res)=>{ const id=req.params.id; const bots=await loadBots(); const bot=bots.find(x=>x.id===id); if(!bot) return res.status(404).json({success:false}); const user=await getUserFromRequest(req); if(!user) return res.status(401).json({success:false}); if(bot.ownerId!==user.id) return res.status(403).json({success:false}); await startBotInstance(bot); bot.online=!!global.__botClients[bot.id]; await saveBots(bots); res.json({ success:true, online:bot.online }); });

  app.post('/api/bots/:id/stop', async (req,res)=>{ const id=req.params.id; const bots=await loadBots(); const bot=bots.find(x=>x.id===id); if(!bot) return res.status(404).json({success:false}); const user=await getUserFromRequest(req); if(!user) return res.status(401).json({success:false}); if(bot.ownerId!==user.id) return res.status(403).json({success:false}); await stopBotInstance(bot.id); bot.online=false; await saveBots(bots); res.json({ success:true }); });

  app.post('/api/token/save', async (req,res)=>{ try{ const { token } = req.body||{}; const setupKey = process.env.SETUP_KEY; if(!setupKey) return res.status(503).json({ success:false, message:'SETUP_KEY missing' }); const clientKey = (req.headers['x-setup-key']||req.body.setup_key||'').toString(); if(clientKey !== setupKey) return res.status(401).json({ success:false }); if(!token) return res.status(400).json({ success:false }); const envPath = path.join(__dirname,'..','.env'); await fs.writeFile(envPath, `DISCORD_BOT_TOKEN=${token}\n`, 'utf8'); process.env.DISCORD_BOT_TOKEN = token; res.json({ success:true }); }catch(e){ res.status(500).json({ success:false }); } });

  app.listen(PORT, ()=>console.log(`🌐 Web server running at http://localhost:${PORT}`));

  console.log('Server initialized');
