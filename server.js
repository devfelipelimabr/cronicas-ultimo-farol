'use strict';
// Backend de validação — Crônicas do Último Farol
// Zero dependências: node server.js
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const SECRET=process.env.SECRET||crypto.randomBytes(32).toString('hex');
const PORT=+(process.env.PORT||3000);
const ROOT=path.join(__dirname,'public');
const LB_FILE=path.join(__dirname,'leaderboard.json');

let LB=[];
try{LB=JSON.parse(fs.readFileSync(LB_FILE,'utf8'))}catch(e){}
const saveLB=()=>{try{fs.writeFileSync(LB_FILE,JSON.stringify(LB.slice(0,200)))}catch(e){}};

// ===== contas de jogador (login opcional: conta grava nome no placar; visitante joga anônimo) =====
const PUB=process.env.PUBLIC_URL||'https://my-first-sprite-b5y5k.sprites.app';
let OAUTH={};try{OAUTH=JSON.parse(fs.readFileSync(path.join(__dirname,'oauth.json'),'utf8'))}catch(e){}
const USERS_FILE=path.join(__dirname,'users.json');
let USERS={};try{USERS=JSON.parse(fs.readFileSync(USERS_FILE,'utf8'))}catch(e){}
const saveUsers=()=>{try{fs.writeFileSync(USERS_FILE,JSON.stringify(USERS))}catch(e){}};
const hashPass=(pass,salt)=>crypto.scryptSync(''+pass,salt,32).toString('hex');
function authName(req){const h=req.headers.authorization||'',m=h.match(/^Bearer (.+)$/);if(!m)return null;
 try{const[p,s]=m[1].split('.'),pl=JSON.parse(Buffer.from(p,'base64url').toString());
  if(sign(pl)!==s)return null;if(Date.now()-pl.t>30*24*3600e3)return null;
  return USERS[pl.n]?USERS[pl.n].name:null}catch(e){return null}}

// ===== PVP · estado e helpers =====
const PVP_WAVES=6,PVP_PACKS={sombras:30,velozes:35,blindados:50,medico:60,espectro:70};
const pvpQueue=[],pvpMatches=new Map();
function sse(res){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write('retry: 3000\n\n')}
function ev(res,obj){try{res.write('data: '+JSON.stringify(obj)+'\n\n')}catch(e){}}
function pvpEnd(match,winner,reason){
  if(match.over)return;match.over=true;clearTimeout(match.grace);
  for(const s of['a','b']){const p=match.players[s];if(!p||!p.res)continue;
    try{ev(p.res,{ev:'end',result:winner?(s===winner?'win':'loss'):'draw',reason,wave:p.wave||0,hp:p.hp||0,opp:match.players[s==='a'?'b':'a'].name});p.res.end()}catch(e){}}
  setTimeout(()=>pvpMatches.delete(match.id),60000);
}

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.json':'application/json','.webmanifest':'application/manifest+json'};
const sign=o=>crypto.createHmac('sha256',SECRET).update(JSON.stringify(o)).digest('base64url');

// rate limit simples: 60 req/min por IP nas rotas /api
const rate=new Map();
setInterval(()=>rate.clear(),60000);
function limited(ip){let n=rate.get(ip)||0;if(n>60)return true;rate.set(ip,n+1);return false}

// inimigos máximos por onda (mesma fórmula do cliente + folga p/ divisores)
function tot(w,st,endless){let n=6+w*3+st*2;let boss=(w===3&&!endless)||(endless&&w>=4&&w%4===0);return n+(boss?1:0)}

function jsend(res,code,o){res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(o))}
function body(req){return new Promise(r=>{let d='';req.on('data',c=>{d+=c;if(d.length>1e4){r(null)}});req.on('end',()=>{try{r(JSON.parse(d))}catch(e){r(null)}})})}

const server=http.createServer(async(req,res)=>{
const ip=req.socket.remoteAddress||'',u=new URL(req.url,'http://x');

if(u.pathname.startsWith('/api/')){
  if(limited(ip))return jsend(res,429,{error:'rate limit'});
  // ===== OAuth (Google/GitHub) — configure /app/oauth.json =====
  if(u.pathname==='/api/oauth/github'&&req.method==='GET'){
    const c=(OAUTH.github||{}).id;
    if(!c)return jsend(res,404,{error:'OAuth GitHub não configurado (oauth.json)'});
    const st=Buffer.from(JSON.stringify({r:crypto.randomBytes(6).toString('hex'),t:Date.now()})).toString('base64url')+'.'+sign({t:Date.now()});
    res.writeHead(302,{Location:'https://github.com/login/oauth/authorize?client_id='+c+'&redirect_uri='+encodeURIComponent(PUB+'/api/oauth/github/callback')+'&scope=read:user&state='+st});
    return res.end();
  }
  if(u.pathname==='/api/oauth/github/callback'&&req.method==='GET'){
    const cfg=OAUTH.github||{},code=u.searchParams.get('code');
    if(!code||!cfg.id)return jsend(res,400,{error:'callback inválido'});
    try{
      const tk=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/vnd.github+json'},body:JSON.stringify({client_id:cfg.id,client_secret:cfg.secret,code})}).then(r=>r.json());
      if(!tk.access_token)return jsend(res,502,{error:'troca de token recusada'});
      const gh=await fetch('https://api.github.com/user',{headers:{Authorization:'Bearer '+tk.access_token,Accept:'application/vnd.github+json'}}).then(r=>r.json());
      if(!gh.login)return jsend(res,502,{error:'perfil indisponível'});
      const name=(''+(gh.name||gh.login)).slice(0,16),key=('gh_'+gh.login).toLowerCase();
      if(!USERS[key]){USERS[key]={name,salt:'-',hash:'-',oauth:'github',created:Date.now()};saveUsers()}
      const pl={n:key,t:Date.now()};
      res.writeHead(302,{Location:'/#ses='+Buffer.from(JSON.stringify(pl)).toString('base64url')+'.'+sign(pl)+','+encodeURIComponent(USERS[key].name)});
      return res.end();
    }catch(e){return jsend(res,502,{error:'falha oauth: '+e.message})}
  }
  if(u.pathname==='/api/oauth/google'&&req.method==='GET'){
    const c=(OAUTH.google||{}).id;
    if(!c)return jsend(res,404,{error:'OAuth Google não configurado (oauth.json)'});
    const st=Buffer.from(JSON.stringify({r:crypto.randomBytes(6).toString('hex'),t:Date.now()})).toString('base64url')+'.'+sign({t:Date.now()});
    res.writeHead(302,{Location:'https://accounts.google.com/o/oauth2/v2/auth?client_id='+c+'&redirect_uri='+encodeURIComponent(PUB+'/api/oauth/google/callback')+'&response_type=code&scope=openid%20email%20profile&state='+st});
    return res.end();
  }
  if(u.pathname==='/api/oauth/google/callback'&&req.method==='GET'){
    const cfg=OAUTH.google||{},code=u.searchParams.get('code');
    if(!code||!cfg.id)return jsend(res,400,{error:'callback inválido'});
    try{
      const tk=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:cfg.id,client_secret:cfg.secret,code,redirect_uri:PUB+'/api/oauth/google/callback',grant_type:'authorization_code'})}).then(r=>r.json());
      if(!tk.id_token)return jsend(res,502,{error:'troca de token recusada'});
      const payload=JSON.parse(Buffer.from(tk.id_token.split('.')[1],'base64url').toString());
      const email=(''+(payload.email||'')).toLowerCase();
      if(!email)return jsend(res,502,{error:'email não fornecido pelo escopo'});
      const name=(''+(payload.name||email.split('@')[0])).slice(0,16),key=('gg_'+email).toLowerCase();
      if(!USERS[key]){USERS[key]={name,salt:'-',hash:'-',oauth:'google',created:Date.now()};saveUsers()}
      const pl={n:key,t:Date.now()};
      res.writeHead(302,{Location:'/#ses='+Buffer.from(JSON.stringify(pl)).toString('base64url')+'.'+sign(pl)+','+encodeURIComponent(USERS[key].name)});
      return res.end();
    }catch(e){return jsend(res,502,{error:'falha oauth: '+e.message})}
  }

  if(u.pathname==='/api/register'&&req.method==='POST'){
    const b=await body(req);if(!b)return jsend(res,400,{error:'json inválido'});
    const name=(''+(b.name||'')).trim().slice(0,16),pass=''+(b.pass||'');
    if(!/^[\wÀ-ÿ .-]{2,16}$/.test(name)||pass.length<4)return jsend(res,400,{error:'nome inválido ou senha curta (mínimo 4 caracteres)'});
    const key=name.toLowerCase();
    if(USERS[key])return jsend(res,409,{error:'nome já em uso'});
    const salt=crypto.randomBytes(8).toString('hex');
    USERS[key]={name,salt,hash:hashPass(pass,salt),created:Date.now()};saveUsers();
    const pl={n:key,t:Date.now()};
    return jsend(res,201,{token:Buffer.from(JSON.stringify(pl)).toString('base64url')+'.'+sign(pl),name});
  }
  if(u.pathname==='/api/login'&&req.method==='POST'){
    const b=await body(req);if(!b)return jsend(res,400,{error:'json inválido'});
    const key=(''+(b.name||'')).trim().toLowerCase(),u2=USERS[key];
    if(!u2||u2.hash!==hashPass(''+(b.pass||''),u2.salt))return jsend(res,401,{error:'nome ou senha inválidos'});
    const pl={n:key,t:Date.now()};
    return jsend(res,200,{token:Buffer.from(JSON.stringify(pl)).toString('base64url')+'.'+sign(pl),name:u2.name});
  }
  if(req.method==='POST'&&u.pathname==='/api/run/start'){
    let b=await body(req);if(!b)return jsend(res,400,{error:'json inválido'});
    let st=Math.max(0,Math.min(20,~~b.stage||0)),lv=Math.max(1,Math.min(99,~~b.lv||1));
    let runId=crypto.randomBytes(6).toString('hex');
    const user=authName(req); // null = visitante: joga, mas pontua como anônimo
    let runa=['vida','guerra','tesouro','tempo'].includes(b.runa)?b.runa:null; // runa equipada entra assinada no token
    let payload={runId,st,lv,endless:!!b.endless,runa,user,t:Date.now()};
    return jsend(res,200,{token:Buffer.from(JSON.stringify(payload)).toString('base64url')+'.'+sign(payload),runId});
  }
  if(req.method==='POST'&&u.pathname==='/api/run/report'){
    let b=await body(req);
    if(!b||typeof b.token!=='string')return jsend(res,400,{error:'json inválido'});
    let parts=b.token.split('.'),payload;
    try{payload=JSON.parse(Buffer.from(parts[0],'base64url').toString())}catch(e){return jsend(res,400,{error:'token malformado'})}
    if(parts.length!==2||sign(payload)!==parts[1])return jsend(res,403,{error:'assinatura inválida'});
    if(Date.now()-payload.t>12*3600e3)return jsend(res,403,{error:'token expirado'});
    const w=~~b.wave,k=~~b.kills,du=~~b.duration,g=~~b.gold,x=~~b.xp,lk=~~b.leaks,fr=~~b.frags||0;
    if(!(w>=0&&w<=999)||k<0||du<0||g<0||x<0||lk<0||fr<0||fr>100)return jsend(res,400,{error:'campos inválidos'});
    // limites físicos do jogo: abates, ouro, xp e duração impossíveis = cheat rejeitado
    let maxE=0,maxG=0,maxF=0;for(let i=1;i<=w;i++){maxE+=tot(i,payload.st,payload.endless);maxG+=20+5*i+10;
      let boss=(i===3&&!payload.endless)||(payload.endless&&i>=4&&i%4===0);maxF+=i*2+5+(boss?10:0)}
    maxE=Math.ceil(maxE*1.6)+10; // folga para Divisores (2 sombras extras)
    maxF=Math.min(100,maxF);
    let baseGold=payload.endless?250:120+payload.st*30;
    // recompensa máx ×2 de combo + juros do tesouro (até 50/onda) + folga de preparação
    let maxGold=baseGold+maxG+Math.ceil(k*40*2*(payload.runa==='tesouro'?1.25:1))+55*w;
    let maxXp=Math.ceil(k*12*2)+payload.lv*60;
    if(fr>maxF)return jsend(res,422,{error:'fragmentos impossíveis'});
    if(k>maxE)return jsend(res,422,{error:'abates impossíveis'});
    if(lk>maxE)return jsend(res,422,{error:'vazamentos impossíveis'});
    if(du<=0)return jsend(res,422,{error:'duração ausente'});
    if(du<Math.max(15,w*18))return jsend(res,422,{error:'duração impossível'});
    if(g>maxGold)return jsend(res,422,{error:'ouro impossível'});
    if(x>maxXp)return jsend(res,422,{error:'xp impossível'});
    if(w>0){
      let e={runId:payload.runId,name:payload.user||('Visitante '+payload.runId.slice(0,4)),stage:payload.st,wave:w,gold:g,kills:k,xp:x,leaks:lk,endless:!!payload.endless,at:Date.now()};
      let i=LB.findIndex(o=>o.runId===e.runId);
      if(i>=0){if(e.wave>LB[i].wave||(e.wave===LB[i].wave&&e.gold>LB[i].gold))LB[i]=e}else LB.push(e);
      LB.sort((a,b)=>b.wave-a.wave||b.gold-a.gold);LB=LB.slice(0,200);saveLB();
    }
    return jsend(res,200,{ok:true,validated:true});
  }
  if(req.method==='GET'&&u.pathname==='/api/leaderboard')return jsend(res,200,LB.slice(0,10));

  // ===== PVP · Duelo de Guardiões (SSE, zero dependências) =====
  if(u.pathname==='/api/pvp/queue'&&req.method==='GET'){
    sse(res);
    const name=(''+(u.searchParams.get('name')||'Guardião')).slice(0,16);
    const me={res,name,token:crypto.randomBytes(8).toString('hex')};
    ev(res,{ev:'queued',token:me.token});
    const other=pvpQueue.find(e=>e.res!==res);
    if(!other){
      pvpQueue.push(me);
      me.to=setTimeout(()=>{const i=pvpQueue.indexOf(me);if(i>=0){pvpQueue.splice(i,1);ev(res,{ev:'timeout'})}},90000);
      req.on('close',()=>{clearTimeout(me.to);const i=pvpQueue.indexOf(me);if(i>=0)pvpQueue.splice(i,1)});
      return;
    }
    clearTimeout(other.to);
    pvpQueue.splice(pvpQueue.indexOf(other),1);
    const id=crypto.randomBytes(4).toString('hex');
    const match={id,stage:0,over:false,grace:null,players:{
      a:{res:other.res,name:other.name,token:other.token,hp:20,wave:0,gold:0,kills:0,dead:false},
      b:{res:me.res,name:me.name,token:me.token,hp:20,wave:0,gold:0,kills:0,dead:false}}};
    pvpMatches.set(id,match);
    for(const s of['a','b']){const p=match.players[s];
      ev(p.res,{ev:'matched',matchId:id,side:s,opp:match.players[s==='a'?'b':'a'].name,stage:0,waves:PVP_WAVES,token:p.token});
      p.res.req.on('close',()=>{if(!match.over){pvpEnd(match,s==='a'?'b':'a','abandono')}});
      p.res.on('close',()=>{if(!match.over){pvpEnd(match,s==='a'?'b':'a','abandono')}});
    }
    return;
  }
  if(u.pathname==='/api/pvp/action'&&req.method==='POST'){
    const b=await body(req);
    if(!b||typeof b.matchId!=='string'||typeof b.token!=='string')return jsend(res,400,{error:'json inválido'});
    const match=pvpMatches.get(b.matchId);
    if(!match||match.over)return jsend(res,403,{error:'partida inválida'});
    const side=match.players.a.token===b.token?'a':match.players.b.token===b.token?'b':null;
    if(!side)return jsend(res,403,{error:'token inválido'});
    const p=match.players[side],o=match.players[side==='a'?'b':'a'];
    if(b.type==='send'){
      const cost=PVP_PACKS[b.pack]||0;
      if(!cost)return jsend(res,400,{error:'pacote inválido'});
      // affordabilidade: ouro relatizado menos o já gasto em envios (folga até o 1º report)
      const avail=(p.gold||0)-(p.spent||0)+500;
      if(avail<cost)return jsend(res,422,{error:'ouro insuficiente para envio'});
      p.spent=(p.spent||0)+cost;
      ev(o.res,{ev:'send',pack:b.pack,from:p.name});
      return jsend(res,200,{ok:true,spent:p.spent});
    }
    if(b.type==='report'||b.type==='result'){
      const w=~~b.wave,g=~~b.gold,k=~~b.kills,fr=~~b.frags||0;
      if(!(w>=0&&w<=PVP_WAVES)||g<0||k<0||fr<0||fr>100)return jsend(res,400,{error:'campos inválidos'});
      let maxE=0,maxG=0,maxF=0;for(let i=1;i<=w;i++){maxE+=tot(i,0,false);maxG+=20+5*i+10;maxF+=i*2+5+(i===3?10:0)}
      maxE=Math.ceil(maxE*1.6)+10;maxF=Math.min(100,maxF);
      // ouro: base + bônus + kills×2combo + juros (55/onda) + folga Fortaleza/preparo
      if(k>maxE||fr>maxF||g>120+maxG+Math.ceil(k*40*2)+55*w+200)return jsend(res,422,{error:'stats impossíveis'});
      p.hp=Math.max(0,Math.min(35,~~b.hp));p.wave=w;p.gold=g;p.kills=k;
      ev(o.res,{ev:'opp',wave:w,hp:p.hp,name:p.name});
      if(b.type==='result'){
        if(o.wave>=PVP_WAVES||o.dead){pvpEnd(match,p.hp>o.hp?side:p.hp<o.hp?(side==='a'?'b':'a'):null,'pontuação')}
        else if(!match.grace){match.grace=setTimeout(()=>{if(!match.over){const A=match.players.a,B=match.players.b;
          pvpEnd(match,A.hp>B.hp?'a':B.hp>A.hp?'b':null,'tempo esgotado')}},90000)}
      }
      return jsend(res,200,{ok:true});
    }
    if(b.type==='defeat'){
      p.dead=true;p.hp=0;
      ev(o.res,{ev:'opp',wave:p.wave,hp:0,name:p.name});
      pvpEnd(match,side==='a'?'b':'a','nocaute');
      return jsend(res,200,{ok:true});
    }
    return jsend(res,400,{error:'ação inválida'});
  }
  return jsend(res,404,{error:'rota não encontrada'});
}

// arquivos estáticos
let fp=path.normalize(path.join(ROOT,u.pathname==='/'?'index.html':decodeURIComponent(u.pathname)));
if(!fp.startsWith(ROOT))return jsend(res,403,{error:'proibido'});
fs.readFile(fp,(e,d)=>{if(e)return jsend(res,404,{error:'não encontrado'});res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(d)});
});

server.listen(PORT,()=>console.log('⚔ Crônicas do Último Farol → http://localhost:'+PORT));
