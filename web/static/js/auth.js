// auth.js — inject auth buttons and pre-start overlay
(async ()=>{
  async function me(){ try{ const r=await fetch('/api/me'); return await r.json(); }catch(e){return {success:true,user:null};} }
  function makeButton(text,id,cls){ const b=document.createElement('button'); b.textContent=text; if(id) b.id=id; b.className = cls||'btn'; return b; }

  function ensureTopBar(){ const tb=document.querySelector('.top-bar'); if(tb) return tb; const mc=document.querySelector('.main-content'); if(mc){ const div=document.createElement('div'); div.className='top-bar'; mc.parentNode.insertBefore(div, mc); return div; } return null; }

  const resp = await me(); const user = resp && resp.user ? resp.user : null;
  const top = ensureTopBar();
  if(top){
    const authWrap = document.createElement('div'); authWrap.className='auth-controls';
    if(user){
      const name = document.createElement('span'); name.textContent = user.username; name.style.marginRight='8px'; authWrap.appendChild(name);
      const out = makeButton('Logout','logout-btn','btn'); out.addEventListener('click', async ()=>{ await fetch('/api/logout',{method:'POST'}); window.location.reload(); }); authWrap.appendChild(out);
    } else {
      const l = makeButton('Login','login-btn','btn'); l.addEventListener('click', ()=> location.href='/login');
      const r = makeButton('Register','register-btn','btn btn-primary'); r.addEventListener('click', ()=> location.href='/register');
      authWrap.appendChild(l); authWrap.appendChild(r);
    }
    authWrap.style.marginLeft='auto'; authWrap.style.display='flex'; authWrap.style.gap='8px'; authWrap.style.alignItems='center';
    top.appendChild(authWrap);
  }

  // pre-start overlay: if no account and only on the homepage or setup page, show overlay prompting to create account
  try{
    if(!user && ['/','/setup'].includes(window.location.pathname)){
      const overlay = document.createElement('div'); overlay.id='prestart-overlay'; overlay.innerHTML = `
        <div class="overlay-card">
          <h2>Before we start</h2>
          <p>Let's create an account to continue. Your account will remember your bots.</p>
          <div style="margin-top:12px;display:flex;gap:8px;justify-content:center;">
            <button id="ov-register" class="btn btn-primary">Create Account</button>
            <button id="ov-login" class="btn">I already have an account</button>
          </div>
        </div>`;
      overlay.style.position='fixed'; overlay.style.inset='0'; overlay.style.background='rgba(0,0,0,0.6)'; overlay.style.display='flex'; overlay.style.alignItems='center'; overlay.style.justifyContent='center'; overlay.style.zIndex='2000';
      document.body.appendChild(overlay);
      document.getElementById('ov-register').addEventListener('click', ()=> location.href='/register');
      document.getElementById('ov-login').addEventListener('click', ()=> location.href='/login');
    }
  }catch(e){}
})();
