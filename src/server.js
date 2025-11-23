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

// Static + extensionless mapping
app.use(async (req,res,next)=>{ try{ const urlPath = decodeURIComponent(req.path); if (path.extname(urlPath) === ''){ const candidate = path.join(__dirname,'..','web', urlPath + '.html'); try{ await fs.access(candidate); return res.sendFile(candidate); }catch(_){} const idx = path.join(__dirname,'..','web', urlPath, 'index.html'); try{ await fs.access(idx); return res.sendFile(idx);}catch(_){} } }catch(e){} next(); });
app.use('/', express.static(path.join(__dirname,'..','web')));

// migrate and start
(async ()=>{ const bots = await loadBots(); if(process.env.DISCORD_BOT_TOKEN && bots.length===0){ const token = process.env.DISCORD_BOT_TOKEN; const id = randomUUID(); bots.push({ id, name:'MigratedBot', userTag:null, token, online:false, ownerId:null }); await saveBots(bots); } for(const b of bots) startBotInstance(b).catch(()=>{}); })();

app.get('/health',(req,res)=>res.json({ok:true}));

app.get('/api/bots', async (req,res)=>{ const bots = await loadBots(); res.json({ success:true, bots: bots.map(b=>({ id:b.id, name:b.name, userTag:b.userTag, online:!!b.online, ownerId:b.ownerId||null })) }); });

app.get('/api/bot/status', async (req,res)=>{ const bots = await loadBots(); res.json({ has_token: bots.length>0, online_count: bots.filter(b=>b.online).length }); });

app.post('/api/register', async (req,res)=>{ try{ const { username,password,type,email } = req.body||{}; if(!username||!password) return res.status(400).json({success:false}); if(type==='email' && !email) return res.status(400).json({success:false}); const user = await createUser({ username,password,type,email }); return res.json({ success:true, user }); }catch(e){ res.status(400).json({ success:false }); } });

app.post('/api/login', async (req,res)=>{ try{ const { username,password } = req.body||{}; if(!username||!password) return res.status(400).json({success:false}); const user = await authenticateUser(username,password); if(!user) return res.status(401).json({success:false}); const token = await createSession(user.id); res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; SameSite=Strict`); res.json({ success:true, user }); }catch(e){ res.status(500).json({ success:false }); } });

app.post('/api/logout', async (req,res)=>{ try{ const cookie = (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('session=')); if(cookie){ const token = cookie.split('=')[1]; const sessions = await loadSessions(); delete sessions[token]; await saveSessions(sessions); } res.setHeader('Set-Cookie', `session=; HttpOnly; Path=/; Max-Age=0`); res.json({ success:true }); }catch(e){ res.status(500).json({ success:false }); } });

app.get('/api/me', async (req,res)=>{ const u = await getUserFromRequest(req); res.json({ success:true, user: u }); });

app.post('/api/bots', async (req,res)=>{ try{ const user = await getUserFromRequest(req); if(!user) return res.status(401).json({ success:false }); const setupKey = process.env.SETUP_KEY; if(!setupKey) return res.status(503).json({ success:false }); const clientKey = (req.headers['x-setup-key']||req.body.setup_key||'').toString(); if(clientKey !== setupKey) return res.status(401).json({ success:false }); const { token, name } = req.body||{}; if(!token) return res.status(400).json({ success:false }); const trimmed = token.trim(); try{ const { Client, GatewayIntentBits } = await import('discord.js'); const temp = new Client({ intents:[GatewayIntentBits.Guilds] }); await temp.login(trimmed); const tag = temp.user.tag; await temp.destroy(); const bots = await loadBots(); const id = randomUUID(); const entry = { id, name: name||tag, userTag: tag, token: trimmed, online:false, ownerId: user.id }; bots.push(entry); await saveBots(bots); startBotInstance(entry).catch(()=>{}); return res.json({ success:true, bot: { id: entry.id, name: entry.name, userTag: entry.userTag } }); }catch(err){ return res.status(400).json({ success:false, message:'token validation failed' }); } }catch(e){ res.status(500).json({ success:false }); } });

app.post('/api/bots/:id/start', async (req,res)=>{ const id=req.params.id; const bots=await loadBots(); const bot=bots.find(x=>x.id===id); if(!bot) return res.status(404).json({success:false}); const user=await getUserFromRequest(req); if(!user) return res.status(401).json({success:false}); if(bot.ownerId!==user.id) return res.status(403).json({success:false}); await startBotInstance(bot); bot.online=!!global.__botClients[bot.id]; await saveBots(bots); res.json({ success:true, online:bot.online }); });

app.post('/api/bots/:id/stop', async (req,res)=>{ const id=req.params.id; const bots=await loadBots(); const bot=bots.find(x=>x.id===id); if(!bot) return res.status(404).json({success:false}); const user=await getUserFromRequest(req); if(!user) return res.status(401).json({success:false}); if(bot.ownerId!==user.id) return res.status(403).json({success:false}); await stopBotInstance(bot.id); bot.online=false; await saveBots(bots); res.json({ success:true }); });

app.post('/api/token/save', async (req,res)=>{ try{ const { token } = req.body||{}; const setupKey = process.env.SETUP_KEY; if(!setupKey) return res.status(503).json({ success:false }); const clientKey = (req.headers['x-setup-key']||req.body.setup_key||'').toString(); if(clientKey !== setupKey) return res.status(401).json({ success:false }); if(!token) return res.status(400).json({ success:false }); const envPath = path.join(__dirname,'..','.env'); await fs.writeFile(envPath, `DISCORD_BOT_TOKEN=${token}\n`, 'utf8'); process.env.DISCORD_BOT_TOKEN = token; res.json({ success:true }); }catch(e){ res.status(500).json({ success:false }); } });

app.listen(PORT, ()=>console.log(`🌐 Web server running at http://localhost:${PORT}`));

console.log('Server initialized');
