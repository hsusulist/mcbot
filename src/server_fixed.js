import express from 'express';
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

app.use(async (req,res,next)=>{
  try{
    const urlPath = decodeURIComponent(req.path);
    if(path.extname(urlPath)===''){
      const candidate = path.join(__dirname,'..','web', urlPath+'.html');
      try{ await fs.access(candidate); return res.sendFile(candidate); }catch(_){}
      const idx = path.join(__dirname,'..','web', urlPath, 'index.html');
      try{ await fs.access(idx); return res.sendFile(idx); }catch(_){}
    }
  }catch(e){}
  next();
});

app.use('/', express.static(path.join(__dirname,'..','web')));

app.get('/health',(req,res)=>res.json({ ok:true }));
app.get('/api/bots', async (req,res)=>{ const f = path.join(__dirname,'..','data','bots.json'); const raw = await fs.readFile(f,'utf8').catch(()=>null); const bots = raw?JSON.parse(raw):[]; res.json({ success:true, bots: bots.map(b=>({ id:b.id, name:b.name, online:!!b.online })) }); });

app.listen(PORT, ()=>console.log(`🌐 Fixed server running at http://localhost:${PORT}`));

console.log('Server (fixed) initialized');
