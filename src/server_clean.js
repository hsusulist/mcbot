import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import { randomUUID, randomBytes, scryptSync } from 'crypto';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// simple extensionless .html serving and static
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

app.get('/health', (req,res)=>res.json({ ok:true }));

app.get('/api/bots', async (req,res)=>{
  const dataDir = path.join(__dirname,'..','data');
  try{
    const raw = await fs.readFile(path.join(dataDir,'bots.json'),'utf8').catch(()=>null);
    const bots = raw ? JSON.parse(raw) : [];
    return res.json({ success:true, bots: bots.map(b=>({ id:b.id, name:b.name, userTag:b.userTag||null, online:!!b.online, ownerId:b.ownerId||null })) });
  }catch(e){ return res.status(500).json({ success:false }); }
});

// Helper: get current user from session cookie
async function getUserFromReq(req){
  const cookie = (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('session='));
  if(!cookie) return null;
  const token = cookie.split('=')[1];
  const sessions = await loadJson(SESSIONS_FILE, {});
  const s = sessions[token]; if(!s) return null;
  const users = await loadJson(USERS_FILE, []);
  return users.find(x=>x.id===s.userId) || null;
}

// Create a bot (requires login). If SETUP_KEY env var is set, require header X-SETUP-KEY to match.
app.post('/api/bots', async (req,res)=>{
  try{
    const body = req.body || {};
    // setup key removed: allow logged-in users to add bots without an extra header
    const user = await getUserFromReq(req);
    if(!user) return res.status(401).json({ success:false, message:'login required' });
    const token = body.token || '';
    if(!token || token.length < 50) return res.status(400).json({ success:false, message:'invalid token' });
    const botsFile = path.join(__dirname,'..','data','bots.json');
    const bots = await loadJson(botsFile, []);
    const id = randomUUID();
    const bot = { id, name: body.name || 'Unnamed', token: token, ownerId: user.id, online: false, userTag: null };
    bots.push(bot);
    await saveJson(botsFile, bots);
    return res.json({ success:true, id });
  }catch(e){ console.error('create bot err',e); res.status(500).json({ success:false }); }
});

// Start/Stop bot (owner only) — just flip the online flag in this clean server
app.post('/api/bots/:id/start', async (req,res)=>{
  try{
    const user = await getUserFromReq(req); if(!user) return res.status(401).json({ success:false, message:'login required' });
    const id = req.params.id; const f = path.join(__dirname,'..','data','bots.json'); const bots = await loadJson(f, []);
    const b = bots.find(x=>x.id===id); if(!b) return res.status(404).json({ success:false, message:'not found' });
    if(b.ownerId !== user.id) return res.status(403).json({ success:false, message:'not owner' });
    b.online = true; await saveJson(f,bots); return res.json({ success:true });
  }catch(e){ console.error(e); res.status(500).json({ success:false }); }
});

app.post('/api/bots/:id/stop', async (req,res)=>{
  try{
    const user = await getUserFromReq(req); if(!user) return res.status(401).json({ success:false, message:'login required' });
    const id = req.params.id; const f = path.join(__dirname,'..','data','bots.json'); const bots = await loadJson(f, []);
    const b = bots.find(x=>x.id===id); if(!b) return res.status(404).json({ success:false, message:'not found' });
    if(b.ownerId !== user.id) return res.status(403).json({ success:false, message:'not owner' });
    b.online = false; await saveJson(f,bots); return res.json({ success:true });
  }catch(e){ console.error(e); res.status(500).json({ success:false }); }
});

app.delete('/api/bots/:id', async (req,res)=>{
  try{
    const user = await getUserFromReq(req); if(!user) return res.status(401).json({ success:false, message:'login required' });
    const id = req.params.id; const f = path.join(__dirname,'..','data','bots.json'); const bots = await loadJson(f, []);
    const idx = bots.findIndex(x=>x.id===id); if(idx===-1) return res.status(404).json({ success:false, message:'not found' });
    if(bots[idx].ownerId !== user.id) return res.status(403).json({ success:false, message:'not owner' });
    bots.splice(idx,1); await saveJson(f,bots); return res.json({ success:true });
  }catch(e){ console.error(e); res.status(500).json({ success:false }); }
});

// --- Simple auth: users + sessions stored in data/
const USERS_FILE = path.join(__dirname,'..','data','users.json');
const SESSIONS_FILE = path.join(__dirname,'..','data','sessions.json');
async function ensureData(){ try{ await fs.mkdir(path.join(__dirname,'..','data'),{recursive:true}); }catch(e){} }
async function loadJson(file, fallback){ await ensureData(); const raw = await fs.readFile(file,'utf8').catch(()=>null); return raw ? JSON.parse(raw) : fallback; }
async function saveJson(file, value){ await ensureData(); await fs.writeFile(file, JSON.stringify(value,null,2),'utf8'); }

function hashPassword(password, salt){ return scryptSync(password, salt, 64).toString('hex'); }
function makePasswordHash(password){ const salt = randomBytes(12).toString('hex'); return `${salt}$${hashPassword(password,salt)}`; }
function verifyPassword(password, stored){ try{ const [salt,key]=stored.split('$'); return hashPassword(password,salt)===key; }catch(e){return false;} }

app.post('/api/register', async (req,res)=>{
  try{
    const { username, password, type, email } = req.body||{};
    if(!username||!password) return res.status(400).json({ success:false, message:'username and password required' });
    const users = await loadJson(USERS_FILE, []);
    if(users.find(u=>u.username===username)) return res.status(400).json({ success:false, message:'username exists' });
    const id = randomUUID();
    const passwordHash = makePasswordHash(password);
    users.push({ id, username, passwordHash, type: type||'noemail', email: email||null });
    await saveJson(USERS_FILE, users);
    return res.json({ success:true });
  }catch(e){ console.error('reg err',e); res.status(500).json({ success:false }); }
});

app.post('/api/login', async (req,res)=>{
  try{
    const { username, password } = req.body||{};
    if(!username||!password) return res.status(400).json({ success:false, message:'username and password required' });
    const users = await loadJson(USERS_FILE, []);
    const u = users.find(x=>x.username===username);
    if(!u || !verifyPassword(password, u.passwordHash)) return res.status(401).json({ success:false, message:'invalid credentials' });
    const sessions = await loadJson(SESSIONS_FILE, {});
    const token = randomBytes(24).toString('hex');
    sessions[token] = { userId: u.id, created: Date.now() };
    await saveJson(SESSIONS_FILE, sessions);
    res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; SameSite=Strict`);
    return res.json({ success:true, user:{ id:u.id, username:u.username } });
  }catch(e){ console.error('login err',e); res.status(500).json({ success:false }); }
});

app.post('/api/logout', async (req,res)=>{
  try{
    const cookie = (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('session='));
    if(cookie){ const token = cookie.split('=')[1]; const sessions = await loadJson(SESSIONS_FILE, {}); delete sessions[token]; await saveJson(SESSIONS_FILE, sessions); }
    res.setHeader('Set-Cookie', `session=; HttpOnly; Path=/; Max-Age=0`);
    return res.json({ success:true });
  }catch(e){ res.status(500).json({ success:false }); }
});

app.get('/api/me', async (req,res)=>{
  try{
    const cookie = (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('session='));
    if(!cookie) return res.json({ success:true, user:null });
    const token = cookie.split('=')[1];
    const sessions = await loadJson(SESSIONS_FILE, {});
    const s = sessions[token]; if(!s) return res.json({ success:true, user:null });
    const users = await loadJson(USERS_FILE, []);
    const u = users.find(x=>x.id===s.userId); if(!u) return res.json({ success:true, user:null });
    return res.json({ success:true, user:{ id:u.id, username:u.username } });
  }catch(e){ res.status(500).json({ success:false }); }
});

app.listen(PORT, ()=>{ console.log(`🌐 Clean server running at http://localhost:${PORT}`); });

console.log('server_clean ready');
