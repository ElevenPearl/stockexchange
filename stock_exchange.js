const MAX_SHARES=200000,CHAIRMAN_MIN=50000,DIRECTOR_MIN=100000;
const COMPANIES=[
  {name:'WOCKHARDT',start:20,color:'#a78bfa'},
  {name:'HDFC Bank',start:25,color:'#38bdf8'},
  {name:'TISCO',start:40,color:'#fb923c'},
  {name:'ONGC',start:55,color:'#34d399'},
  {name:'Reliance',start:75,color:'#f472b6'},
  {name:'Infosys',start:80,color:'#facc15'},
];
const AVATARS=['#7c3aed','#0ea5e9','#ea580c','#16a34a','#db2777','#ca8a04','#dc2626','#2563eb'];

// ── FIREBASE SETUP ──
// Replace these values with the Web app configuration from:
// Firebase Console > Project settings > Your apps > Web app.
const firebaseConfig={
  apiKey:'AIzaSyCb-MXy4VILVf4LJ_Dqj4fm2pZ1hscdyqo',
  authDomain:'stock-exchange-2f5a5.firebaseapp.com',
  databaseURL:'https://stock-exchange-2f5a5-default-rtdb.firebaseio.com',
  projectId:'stock-exchange-2f5a5',
  storageBucket:'stock-exchange-2f5a5.firebasestorage.app',
  messagingSenderId:'734720967052',
  appId:'1:734720967052:web:b8f8d7bfadd2b89e5496a9'
};
const FIREBASE_PATH='stockExchange/root';
let firebaseRootRef=null;
let applyingRemoteState=false;

function firebaseIsConfigured(){
  return firebaseConfig.apiKey!=='YOUR_API_KEY'&&!firebaseConfig.databaseURL.includes('YOUR_PROJECT_ID');
}
function setSyncStatus(state,text){
  const el=document.getElementById('sync-status');
  const label=document.getElementById('sync-status-text');
  if(el)el.className='sync-status '+state;
  if(label)label.textContent=text;
}

// ── MULTI-GAME STATE ──
// { activeGameId: string|null, games: { [id]: { name, createdAt, prices, players, log } } }
function freshGame(name){
  return{name,createdAt:Date.now(),
    prices:Object.fromEntries(COMPANIES.map(c=>[c.name,{cur:c.start,prev:c.start}])),
    players:[],log:[]};
}
function loadRoot(){try{return JSON.parse(localStorage.getItem('se_root_v2'));}catch{return null;}}
function saveRoot(){
  localStorage.setItem('se_root_v2',JSON.stringify(root));
  if(firebaseRootRef&&!applyingRemoteState){
    firebaseRootRef.set(root).catch(err=>{
      console.error('Firebase save failed:',err);
      setSyncStatus('error','Sync failed');
      toast('Cloud sync failed. Changes are saved on this device.');
    });
  }
}

function normalizeRoot(state){
  state=state||{activeGameId:null,games:{}};
  if(!state.games)state.games={};
  if(!state.activeGameId)state.activeGameId=null;
  Object.values(state.games).forEach(game=>{
    if(!Array.isArray(game.players))game.players=[];
    if(!Array.isArray(game.log))game.log=[];
  });
  return state;
}

let root=normalizeRoot(loadRoot());

// migrate old single-game data
(function(){
  try{
    const old=JSON.parse(localStorage.getItem('se_state'));
    if(old&&old.prices&&!Object.keys(root.games).length){
      const id='game_'+Date.now();
      const g=freshGame('My Game');
      g.prices=old.prices;g.players=old.players||[];g.log=old.log||[];
      root.games[id]=g;root.activeGameId=id;
      localStorage.removeItem('se_state');saveRoot();
    }
  }catch(e){}
})();

function initFirebaseSync(){
  if(!firebaseIsConfigured()){
    setSyncStatus('offline','Firebase setup needed');
    console.warn('Add your Firebase Web app configuration to firebaseConfig in stock_exchange.js.');
    return;
  }
  if(typeof firebase==='undefined'){
    setSyncStatus('error','SDK unavailable');
    console.error('Firebase SDK did not load. Check the internet connection.');
    return;
  }

  try{
    setSyncStatus('connecting','Connecting…');
    if(!firebase.apps.length)firebase.initializeApp(firebaseConfig);
    const database=firebase.database();
    firebaseRootRef=database.ref(FIREBASE_PATH);

    database.ref('.info/connected').on('value',snapshot=>{
      const online=snapshot.val()===true;
      setSyncStatus(online?'online':'connecting',online?'Cloud synced':'Connecting…');
    });

    firebaseRootRef.once('value').then(snapshot=>{
      if(snapshot.exists())return;
      // The first connected device uploads any games already saved locally.
      return firebaseRootRef.set(root);
    }).catch(err=>{
      console.error('Firebase initial sync failed:',err);
      setSyncStatus('error','Sync failed');
    });

    firebaseRootRef.on('value',snapshot=>{
      const cloudRoot=snapshot.val();
      if(!cloudRoot||JSON.stringify(cloudRoot)===JSON.stringify(root))return;
      applyingRemoteState=true;
      root=normalizeRoot(cloudRoot);
      localStorage.setItem('se_root_v2',JSON.stringify(root));
      applyingRemoteState=false;
      refreshAll();
      if(document.getElementById('game-overlay').classList.contains('show'))renderGameOverlay();
    },err=>{
      console.error('Firebase listener failed:',err);
      setSyncStatus('error','Permission denied');
      toast('Firebase sync error: check your database rules.');
    });
  }catch(err){
    console.error('Firebase initialization failed:',err);
    setSyncStatus('error','Setup error');
  }
}

function gs(){return root.activeGameId?root.games[root.activeGameId]:null;}
function escH(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// ── GAME OVERLAY ──
function openGameOverlay(){renderGameOverlay();document.getElementById('game-overlay').classList.add('show');}
function closeGameOverlay(){document.getElementById('game-overlay').classList.remove('show');}

function renderGameOverlay(){
  const ids=Object.keys(root.games);
  const el=document.getElementById('game-list');
  if(!ids.length){el.innerHTML='<div class="empty" style="background:var(--surface2);border-radius:8px;">No games yet. Create one below.</div>';return;}
  el.innerHTML=ids.slice().reverse().map(id=>{
    const g=root.games[id];const isCur=id===root.activeGameId;
    const date=new Date(g.createdAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit'});
    return`<div class="game-item${isCur?' current':''}" onclick="switchGame('${id}')">
      <div class="gi-info"><div class="gi-name">${escH(g.name)}</div><div class="gi-meta">${g.players.length} player${g.players.length!==1?'s':''} &middot; ${date}</div></div>
      ${isCur?'<span class="gi-badge">ACTIVE</span>':'<span style="color:var(--muted);font-size:.8rem;">&#9654;</span>'}
    </div>`;
  }).join('');
}

function createGame(){
  const name=document.getElementById('new-game-name').value.trim();
  if(!name){toast('Enter a game name');return;}
  const id='game_'+Date.now();
  root.games[id]=freshGame(name);root.activeGameId=id;
  saveRoot();document.getElementById('new-game-name').value='';
  closeGameOverlay();toast('Game "'+name+'" created \u2713');refreshAll();
}

function switchGame(id){
  root.activeGameId=id;saveRoot();closeGameOverlay();
  toast('Switched to "'+root.games[id].name+'"');refreshAll();
}

function deleteActiveGame(){
  const s=gs();if(!s)return;
  if(!confirm('Delete game "'+s.name+'"? Cannot be undone.'))return;
  const name=s.name;delete root.games[root.activeGameId];
  const rem=Object.keys(root.games);
  root.activeGameId=rem.length?rem[rem.length-1]:null;
  saveRoot();toast('Game "'+name+'" deleted');refreshAll();
}

// ── HELPERS ──
function totalSharesInMarket(co){const s=gs();if(!s)return 0;return s.players.reduce((a,p)=>a+(p.holdings[co]||0),0);}
function playerTags(p){
  const tags=[];
  for(const c of COMPANIES){
    const qty=p.holdings[c.name]||0;
    if(qty>=DIRECTOR_MIN)tags.push({label:'Director \u2013 '+c.name,cls:'tag-director'});
    else if(qty>=CHAIRMAN_MIN)tags.push({label:'Chairman \u2013 '+c.name,cls:'tag-chairman'});
  }
  return tags;
}
function netWorth(p){const s=gs();let w=p.cash;if(s)for(const c of COMPANIES)w+=(p.holdings[c.name]||0)*s.prices[c.name].cur;return w;}
function addLog(msg){const s=gs();if(!s)return;const time=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});s.log.push({time,msg});if(s.log.length>100)s.log.shift();}

// ── NAV ──
let currentPage='market';
function goto(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  document.querySelectorAll('.nav-btn')[['market','players','bank','calc'].indexOf(page)].classList.add('active');
  currentPage=page;
  if(page==='market')renderMarket();
  else if(page==='players')renderLobby();
  else if(page==='bank')renderBank();
  else if(page==='calc')renderCalcPage();
}
function updateNavBadge(){const s=gs();document.getElementById('nav-game-name').textContent=s?s.name:'No Game';}
function refreshAll(){
  updateNavBadge();activePlayer=null;
  if(currentPage==='market')renderMarket();
  else if(currentPage==='players')renderLobby();
  else if(currentPage==='bank')renderBank();
  else if(currentPage==='calc')renderCalcPage();
}

// ── MARKET ──
function renderMarket(){
  const s=gs();
  const bar=document.getElementById('market-game-bar');
  const noG=document.getElementById('no-game-market');
  if(s){
    bar.style.display='flex';noG.style.display='none';
    document.getElementById('market-game-name').textContent=s.name;
    document.getElementById('market-game-sub').textContent=s.players.length+' player'+(s.players.length!==1?'s':'')+' in game';
  }else{bar.style.display='none';noG.style.display='block';}
  renderTicker();renderPriceCards();renderLeaderboard();renderLog();
}

function renderTicker(){
  const s=gs();const inner=document.getElementById('ticker');
  if(!s){inner.innerHTML='';return;}
  const items=COMPANIES.map(c=>{
    const p=s.prices[c.name];const diff=p.cur-p.prev;
    const cls=diff>0?'tick-up':diff<0?'tick-down':'tick-flat';
    const sign=diff>0?'\u25b2':diff<0?'\u25bc':'\u2014';
    return`<span class="tick-item"><span class="tick-name" style="color:${c.color}">${c.name}</span><span class="tick-price">\u20b9${p.cur}</span><span class="tick-delta ${cls}">${sign}${Math.abs(diff)}</span></span>`;
  }).join('');
  inner.innerHTML=items+items;
}

function renderPriceCards(){
  const s=gs();const el=document.getElementById('price-cards');
  if(!s){el.innerHTML='';return;}
  el.innerHTML=COMPANIES.map(c=>{
    const p=s.prices[c.name];const diff=p.cur-p.prev;
    const pct=p.prev?((diff/p.prev)*100).toFixed(1):'0.0';
    const cls=diff>0?'tick-up':diff<0?'tick-down':'tick-flat';
    const sign=diff>0?'\u25b2':diff<0?'\u25bc':'';
    const mkt=totalSharesInMarket(c.name);
    const mktPct=((mkt/MAX_SHARES)*100).toFixed(1);
    return`<div class="stock-card" data-co="${c.name}"><div class="sc-name">${c.name}</div><div class="sc-price"><span>\u20b9</span>${p.cur}</div><div class="sc-delta ${cls}">${sign} ${Math.abs(diff)} (${pct}%)</div><div class="sc-mktinfo">Market: ${mkt.toLocaleString('en-IN')} / ${MAX_SHARES.toLocaleString('en-IN')} (${mktPct}%)</div></div>`;
  }).join('');
}

function renderLeaderboard(){
  const s=gs();const el=document.getElementById('leaderboard');
  if(!s||!s.players.length){el.innerHTML='<div class="empty">No players yet.</div>';return;}
  const ranked=[...s.players].map(p=>({...p,wealth:netWorth(p)})).sort((a,b)=>b.wealth-a.wealth);
  el.innerHTML=ranked.map((p,i)=>{
    const rC=i===0?'gold':i===1?'silver':i===2?'bronze':'';
    const rowC=i===0?'rank1':i===1?'rank2':i===2?'rank3':'';
    const tags=playerTags(p);
    const tagH=tags.map(t=>`<span class="tag ${t.cls}">\u2605 ${t.label}</span>`).join(' ');
    return`<div class="leader-row ${rowC}"><div class="lr-rank ${rC}">#${i+1}</div><div class="lr-avatar" style="background:${p.color}22;color:${p.color}">${p.name[0].toUpperCase()}</div><div class="lr-name">${escH(p.name)}${tagH?'<br><span style="font-weight:400;font-size:.72rem;">'+tagH+'</span>':''}</div><div class="lr-wealth">\u20b9${p.wealth.toLocaleString('en-IN')}</div></div>`;
  }).join('');
}

function renderLog(){
  const s=gs();const el=document.getElementById('log-feed');
  if(!s||!s.log.length){el.innerHTML='<div class="empty">No activity yet.</div>';return;}
  el.innerHTML=[...s.log].reverse().map(l=>`<div class="log-item"><div class="log-time">${l.time}</div><div class="log-msg">${l.msg}</div></div>`).join('');
}

// ── PLAYERS ──
let activePlayer=null;
function renderLobby(){
  const s=gs();
  const list=document.getElementById('player-list');
  const noP=document.getElementById('no-players');
  const noG=document.getElementById('no-game-players');
  document.getElementById('player-lobby').style.display='';
  document.getElementById('player-detail').classList.remove('active');
  activePlayer=null;
  if(!s){list.innerHTML='';noP.style.display='none';noG.style.display='block';return;}
  noG.style.display='none';
  if(!s.players.length){list.innerHTML='';noP.style.display='block';return;}
  noP.style.display='none';
  list.innerHTML=s.players.map((p,i)=>{
    const tags=playerTags(p);
    const top=tags.find(t=>t.cls==='tag-director')||tags.find(t=>t.cls==='tag-chairman');
    const tagH=top?`<div class="pc-tag"><span class="tag ${top.cls}" style="font-size:.62rem;">\u2605 ${top.label.split('\u2013')[0].trim()}</span></div>`:'';
    return`<div class="player-chip" onclick="openPlayer(${i})"><div class="pc-avatar" style="background:${p.color}22;color:${p.color}">${p.name[0].toUpperCase()}</div><div class="pc-name">${escH(p.name)}</div><div class="pc-cash">\u20b9${p.cash.toLocaleString('en-IN')}</div>${tagH}</div>`;
  }).join('');
}

function openPlayer(idx){
  const s=gs();if(!s)return;
  activePlayer=idx;const p=s.players[idx];
  document.getElementById('player-lobby').style.display='none';
  document.getElementById('player-detail').classList.add('active');
  document.getElementById('pd-avatar').style.cssText=`background:${p.color}22;color:${p.color}`;
  document.getElementById('pd-avatar').textContent=p.name[0].toUpperCase();
  document.getElementById('pd-name').textContent=p.name;
  document.getElementById('pd-cash').textContent='\u20b9'+p.cash.toLocaleString('en-IN');
  document.getElementById('pd-net').textContent='\u20b9'+netWorth(p).toLocaleString('en-IN');
  document.getElementById('cash-input').value='';
  const opts=COMPANIES.map(c=>`<option>${c.name}</option>`).join('');
  document.getElementById('hold-company').innerHTML=opts;
  document.getElementById('sell-company').innerHTML=opts;
  onBuyCoChange();onSellCoChange();
  renderPlayerHeader(p);renderPlayerHoldings(p);
}

function renderPlayerHeader(p){
  const tags=playerTags(p);
  document.getElementById('pd-tags').innerHTML=tags.map(t=>`<span class="tag ${t.cls}">\u2605 ${t.label}</span>`).join('');
}

function renderPlayerHoldings(p){
  const s=gs();
  document.getElementById('pd-holdings').innerHTML=COMPANIES.map(c=>{
    const qty=p.holdings[c.name]||0;const price=s?s.prices[c.name].cur:0;const val=qty*price;
    let st='';
    if(qty>=DIRECTOR_MIN)st=`<span class="tag tag-director" style="font-size:.65rem;">\u2605 Director</span>`;
    else if(qty>=CHAIRMAN_MIN)st=`<span class="tag tag-chairman" style="font-size:.65rem;">\u2605 Chairman</span>`;
    return`<tr><td><span class="dot" style="background:${c.color}"></span>${c.name}</td><td>${qty.toLocaleString('en-IN')}</td><td>\u20b9${price}</td><td style="color:${val>0?'var(--green)':'var(--muted)'}">\u20b9${val.toLocaleString('en-IN')}</td><td>${st}</td></tr>`;
  }).join('');
}

function showLobby(){
  document.getElementById('player-lobby').style.display='';
  document.getElementById('player-detail').classList.remove('active');
  activePlayer=null;
}

function onBuyCoChange(){
  const s=gs();if(!s)return;
  const co=document.getElementById('hold-company').value;
  const avail=MAX_SHARES-totalSharesInMarket(co);
  document.getElementById('buy-price-hint').textContent='\u20b9'+s.prices[co].cur+'/share \u00b7 Available: '+avail.toLocaleString('en-IN');
  document.getElementById('hold-qty').value='';document.getElementById('buy-cost-preview').textContent='';
}
function updateBuyCost(){
  const s=gs();if(!s)return;
  const co=document.getElementById('hold-company').value;const qty=parseInt(document.getElementById('hold-qty').value);
  if(!co||isNaN(qty)||qty<=0){document.getElementById('buy-cost-preview').textContent='';return;}
  const price=s.prices[co].cur;
  document.getElementById('buy-cost-preview').textContent='Cost: '+qty+' \u00d7 \u20b9'+price+' = \u20b9'+(qty*price).toLocaleString('en-IN');
}
function buyShares(){
  const s=gs();if(!s)return;
  const co=document.getElementById('hold-company').value;const qty=parseInt(document.getElementById('hold-qty').value);
  if(isNaN(qty)||qty<=0){toast('Enter valid shares to buy');return;}
  const p=s.players[activePlayer];const price=s.prices[co].cur;const cost=qty*price;
  const avail=MAX_SHARES-totalSharesInMarket(co);
  if(qty>avail){toast('Only '+avail.toLocaleString('en-IN')+' shares available');return;}
  if(cost>p.cash){toast('Not enough cash (need \u20b9'+cost.toLocaleString('en-IN')+')');return;}
  p.holdings[co]=(p.holdings[co]||0)+qty;p.cash-=cost;
  addLog('<b>'+p.name+'</b> bought '+qty.toLocaleString('en-IN')+' \u00d7 '+co+' @ \u20b9'+price+' = \u20b9'+cost.toLocaleString('en-IN'));
  saveRoot();
  document.getElementById('pd-cash').textContent='\u20b9'+p.cash.toLocaleString('en-IN');
  document.getElementById('pd-net').textContent='\u20b9'+netWorth(p).toLocaleString('en-IN');
  document.getElementById('hold-qty').value='';document.getElementById('buy-cost-preview').textContent='';
  onBuyCoChange();onSellCoChange();renderPlayerHeader(p);renderPlayerHoldings(p);
  toast('Bought '+qty.toLocaleString('en-IN')+' shares of '+co+' \u2713');
}

function onSellCoChange(){
  const s=gs();if(!s)return;
  const co=document.getElementById('sell-company').value;const p=s.players[activePlayer];
  const held=(p&&p.holdings[co])||0;
  document.getElementById('sell-shares-calc').textContent='\u20b9'+s.prices[co].cur+'/share \u00b7 You hold: '+held.toLocaleString('en-IN');
  document.getElementById('sell-qty').value='';document.getElementById('sell-preview').textContent='';
}
function updateSellCalc(){
  const s=gs();if(!s)return;
  const co=document.getElementById('sell-company').value;const qty=parseInt(document.getElementById('sell-qty').value);
  if(isNaN(qty)||qty<=0){document.getElementById('sell-preview').textContent='';return;}
  const p=s.players[activePlayer];const held=(p&&p.holdings[co])||0;const price=s.prices[co].cur;
  document.getElementById('sell-preview').textContent=qty>held
    ?'\u26a0 You only hold '+held.toLocaleString('en-IN')+' shares'
    :"You'll receive: "+qty+' \u00d7 \u20b9'+price+' = \u20b9'+(qty*price).toLocaleString('en-IN');
}
function sellShares(){
  const s=gs();if(!s)return;
  const co=document.getElementById('sell-company').value;const qty=parseInt(document.getElementById('sell-qty').value);
  if(isNaN(qty)||qty<=0){toast('Enter shares to sell');return;}
  const p=s.players[activePlayer];const held=p.holdings[co]||0;
  if(qty>held){toast('You only hold '+held.toLocaleString('en-IN')+' shares of '+co);return;}
  const price=s.prices[co].cur;const earned=qty*price;
  p.holdings[co]=held-qty;p.cash+=earned;
  addLog('<b>'+p.name+'</b> sold '+qty.toLocaleString('en-IN')+' \u00d7 '+co+' @ \u20b9'+price+' = \u20b9'+earned.toLocaleString('en-IN'));
  saveRoot();
  document.getElementById('pd-cash').textContent='\u20b9'+p.cash.toLocaleString('en-IN');
  document.getElementById('pd-net').textContent='\u20b9'+netWorth(p).toLocaleString('en-IN');
  document.getElementById('sell-qty').value='';document.getElementById('sell-preview').textContent='';
  onSellCoChange();onBuyCoChange();renderPlayerHeader(p);renderPlayerHoldings(p);
  toast('Sold '+qty.toLocaleString('en-IN')+' shares of '+co+' \u2713');
}

function updateCash(){
  const s=gs();if(!s)return;
  const val=parseFloat(document.getElementById('cash-input').value);
  if(isNaN(val)||val<0){toast('Enter a valid amount');return;}
  const p=s.players[activePlayer];const old=p.cash;p.cash=val;
  addLog('<b>'+p.name+'</b> cash updated: \u20b9'+old.toLocaleString('en-IN')+' \u2192 \u20b9'+val.toLocaleString('en-IN'));
  saveRoot();
  document.getElementById('pd-cash').textContent='\u20b9'+val.toLocaleString('en-IN');
  document.getElementById('pd-net').textContent='\u20b9'+netWorth(p).toLocaleString('en-IN');
  document.getElementById('cash-input').value='';toast('Cash updated \u2713');
}

// ── BANK ──
function renderBank(){
  const s=gs();const ids=Object.keys(root.games);
  document.getElementById('bank-game-name').textContent=s?s.name:'None';
  document.getElementById('bank-game-sub').textContent=s?(s.players.length+' players \u00b7 created '+new Date(s.createdAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit'})):'';
  document.getElementById('bank-all-games').innerHTML=ids.length
    ?'All games: '+ids.map(id=>'<b style="color:'+(id===root.activeGameId?'var(--accent)':'var(--text)')+'">'+escH(root.games[id].name)+'</b> ('+root.games[id].players.length+'p)').join(' &middot; ')
    :'No games saved yet.';
  if(!s){
    document.getElementById('bank-active-section').style.display='none';
    document.getElementById('bank-no-game').style.display='block';return;
  }
  document.getElementById('bank-active-section').style.display='';
  document.getElementById('bank-no-game').style.display='none';
  renderBankPrices();renderBankPlayers();
}

function renderBankPrices(){
  const s=gs();if(!s)return;
  document.getElementById('bank-prices').innerHTML=COMPANIES.map(c=>{
    const p=s.prices[c.name];const mkt=totalSharesInMarket(c.name);
    return`<div class="bank-card" data-co="${c.name}"><div class="bc-top"><div class="bc-name">${c.name}</div><div class="bc-cur">\u20b9${p.cur}</div></div><div style="font-size:.72rem;color:var(--muted);margin-bottom:8px;font-family:'IBM Plex Mono',monospace;">Market: ${mkt.toLocaleString('en-IN')} / ${MAX_SHARES.toLocaleString('en-IN')}</div><div class="bc-row" style="gap:8px;align-items:center;"><label>New Price</label><input type="number" id="price-${c.name.replace(/ /g,'_')}" value="${p.cur}" min="1" style="flex:1;"><button class="btn btn-sm" onclick="updatePrice('${c.name}')">Set</button></div></div>`;
  }).join('');
}

function updatePrice(coName){
  const s=gs();if(!s)return;
  const val=parseFloat(document.getElementById('price-'+coName.replace(/ /g,'_')).value);
  if(isNaN(val)||val<=0){toast('Enter a valid price');return;}
  const p=s.prices[coName];const old=p.cur;p.prev=old;p.cur=val;
  addLog('Bank updated <b>'+coName+'</b>: \u20b9'+old+' \u2192 \u20b9'+val);
  saveRoot();renderBankPrices();toast(coName+' \u2192 \u20b9'+val+' \u2713');
}

function addPlayer(){
  const s=gs();if(!s){toast('No active game');return;}
  const name=document.getElementById('new-player-name').value.trim();
  const cash=parseFloat(document.getElementById('new-player-cash').value);
  if(!name){toast('Enter player name');return;}
  if(s.players.find(p=>p.name.toLowerCase()===name.toLowerCase())){toast('Name already taken');return;}
  const color=AVATARS[s.players.length%AVATARS.length];
  const holdings=Object.fromEntries(COMPANIES.map(c=>[c.name,0]));
  const startCash=isNaN(cash)?10000:cash;
  s.players.push({name,cash:startCash,holdings,color});
  addLog('Player <b>'+name+'</b> joined with \u20b9'+startCash.toLocaleString('en-IN'));
  saveRoot();document.getElementById('new-player-name').value='';
  renderBankPlayers();toast(name+' added \u2713');
}

function renderBankPlayers(){
  const s=gs();if(!s)return;
  const el=document.getElementById('bank-players');
  if(!s.players.length){el.innerHTML='<div class="empty">No players yet.</div>';return;}
  el.innerHTML='<h2>Players</h2>'+s.players.map((p,i)=>
    `<div class="leader-row"><div class="lr-avatar" style="background:${p.color}22;color:${p.color}">${p.name[0].toUpperCase()}</div><div class="lr-name">${escH(p.name)}</div><span class="badge">\u20b9${p.cash.toLocaleString('en-IN')} cash</span><button class="btn btn-sm btn-danger" onclick="removePlayer(${i})">Remove</button></div>`
  ).join('');
}

function removePlayer(idx){
  const s=gs();if(!s)return;const name=s.players[idx].name;
  s.players.splice(idx,1);addLog('Player <b>'+name+'</b> removed');
  saveRoot();renderBankPlayers();toast(name+' removed');
}

// ── CALC ──
function renderCalcPage(){
  const opts=COMPANIES.map(c=>`<option>${c.name}</option>`).join('');
  document.getElementById('qc-company').innerHTML=opts;
  document.getElementById('cp-company').innerHTML=opts;
  onCpChange();
}
function onCpChange(){
  const s=gs();if(!s)return;
  const co=document.getElementById('cp-company').value;const price=s.prices[co].cur;
  document.getElementById('cp-display').textContent='Current Price: \u20b9'+price;
  cVal=String(price);cExpr='';cOp=null;cPrev=null;cJustEq=false;calcRender();
}
function calcTrade(){
  const s=gs();if(!s)return;
  const co=document.getElementById('qc-company').value;const qty=parseInt(document.getElementById('qc-shares').value);
  if(isNaN(qty)||qty<=0){document.getElementById('qc-result').textContent='Enter valid shares';return;}
  const price=s.prices[co].cur;
  document.getElementById('qc-result').textContent=qty.toLocaleString('en-IN')+' \u00d7 \u20b9'+price+' = \u20b9'+(price*qty).toLocaleString('en-IN');
}

let cExpr='',cVal='0',cOp=null,cPrev=null,cJustEq=false;
function calcRender(){
  document.getElementById('calc-val').textContent=parseFloat(cVal).toLocaleString('en-IN',{maximumFractionDigits:10});
  document.getElementById('calc-expr').textContent=cExpr;
}
function calcNum(n){
  if(cJustEq){cVal='0';cExpr='';cJustEq=false;}
  if(n==='.'&&cVal.includes('.'))return;
  cVal=cVal==='0'&&n!=='.'?n:cVal+n;calcRender();
}
function calcOp(op){
  cJustEq=false;
  if(op==='+-'){cVal=String(-parseFloat(cVal));calcRender();return;}
  if(op==='%'){cVal=String(parseFloat(cVal)/100);calcRender();return;}
  if(cOp&&cPrev!==null)calcEq(true);
  cPrev=parseFloat(cVal);cOp=op;cExpr=cPrev+' '+op;cVal='0';calcRender();
}
function calcEq(chain){
  if(cOp===null||cPrev===null)return;
  const b=parseFloat(cVal);let result;
  if(cOp==='+')result=cPrev+b;
  else if(cOp==='-')result=cPrev-b;
  else if(cOp==='*')result=cPrev*b;
  else if(cOp==='/')result=b!==0?cPrev/b:'Error';
  if(!chain)cExpr=cPrev+' '+cOp+' '+b+' =';
  cVal=String(result);
  if(!chain){cOp=null;cPrev=null;cJustEq=true;}
  calcRender();
}
function calcAC(){cExpr='';cVal='0';cOp=null;cPrev=null;cJustEq=false;calcRender();}

// ── TOAST ──
let toastTimer;
function toast(msg){
  const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400);
}

// ── INIT ──
updateNavBadge();
renderMarket();
initFirebaseSync();
setInterval(()=>{if(currentPage==='market')renderMarket();},5000);
document.getElementById('game-overlay').addEventListener('click',function(e){if(e.target===this)closeGameOverlay();});
