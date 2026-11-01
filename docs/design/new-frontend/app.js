const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),2600)}
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}

/* ---------- Saved progress (this browser only, resets daily) ---------- */
const KEY='eklavya-study-v1';
const today=new Date().toISOString().slice(0,10);
let state={day:today,known:[],route:{recall:true,concept:false,cards:false},sound:true,doubts:[]};
try{
  const s=JSON.parse(localStorage.getItem(KEY)||'null');
  if(s){
    state.sound=s.sound!==false;
    state.doubts=Array.isArray(s.doubts)?s.doubts.slice(0,5):[];
    if(s.day===today){state.known=Array.isArray(s.known)?s.known:[];state.route=Object.assign(state.route,s.route||{})}
  }
}catch(e){}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}}

/* ---------- Greeting ---------- */
(function(){
  const now=new Date(),h=now.getHours();
  $('#greet').textContent=h<5?'Up late,':h<12?'Good morning,':h<17?'Good afternoon,':'Good evening,';
  $('#todayDate').textContent=now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'2-digit'}).toUpperCase()+' · A LITTLE PROGRESS ADDS UP';
  if(/Mac|iPhone|iPad/.test(navigator.platform||''))$('#kbdHint').textContent='⌘ K';
})();

/* ---------- Sound: synthesized page turns, spoken answers ---------- */
let actx=null;
function setSoundBtn(){const b=$('#soundBtn');b.setAttribute('aria-pressed',state.sound);b.textContent=state.sound?'Sound on':'Sound off'}
setSoundBtn();
function pageTurn(){
  if(!state.sound)return;
  try{
    actx=actx||new (window.AudioContext||window.webkitAudioContext)();
    if(actx.state==='suspended')actx.resume();
    const dur=.22,sr=actx.sampleRate,buf=actx.createBuffer(1,Math.floor(sr*dur),sr),d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++){const t=i/d.length;d[i]=(Math.random()*2-1)*Math.pow(1-t,2.2)*(t<.08?t/.08:1)}
    const src=actx.createBufferSource();src.buffer=buf;
    const f=actx.createBiquadFilter();f.type='bandpass';f.Q.value=.8;
    f.frequency.setValueAtTime(3200,actx.currentTime);f.frequency.exponentialRampToValueAtTime(900,actx.currentTime+dur);
    const g=actx.createGain();g.gain.value=.35;
    src.connect(f).connect(g).connect(actx.destination);src.start();
  }catch(e){}
}
function speak(text){
  if(!state.sound||!('speechSynthesis' in window))return;
  try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='en-IN';u.rate=1;speechSynthesis.speak(u)}catch(e){}
}
function stopSpeaking(){try{if('speechSynthesis' in window)speechSynthesis.cancel()}catch(e){}}

/* ---------- Notes and retrieval (BM25 over passages) ---------- */
const NOTES=[
 {doc:'Introduction to ML',topic:'Supervised learning',text:'In supervised learning, a model learns from labeled examples, where each input comes with the correct output. Regression predicts a continuous value, such as a house price. Classification predicts a category, such as spam or not spam.'},
 {doc:'Introduction to ML',topic:'Loss functions',text:'A loss function measures how far the model\'s predictions are from the true values. Mean squared error is common for regression, and cross-entropy is common for classification. Training means adjusting the parameters to make the loss smaller.'},
 {doc:'Introduction to ML',topic:'Gradient descent',text:'Gradient descent is an optimization method that reduces the loss step by step. At each step it computes the gradient, which points in the direction of steepest increase, and moves the parameters a small amount in the opposite direction. The update rule is theta equals theta minus alpha times the gradient of J.'},
 {doc:'Introduction to ML',topic:'Learning rate',text:'The learning rate alpha controls the size of each gradient descent step. If the learning rate is too large, updates overshoot the minimum and the loss can oscillate or diverge. If it is too small, training converges very slowly.'},
 {doc:'Introduction to ML',topic:'Gradient descent variants',text:'Batch gradient descent uses the whole dataset for each update. Stochastic gradient descent uses one example at a time, which is noisy but fast. Mini-batch gradient descent uses small batches and is the usual choice in practice.'},
 {doc:'Introduction to ML',topic:'Bias and variance',text:'Bias is error from overly simple assumptions, which causes underfitting. Variance is error from being too sensitive to the training data, which causes overfitting. A good model balances bias and variance.'},
 {doc:'Introduction to ML',topic:'Evaluation',text:'Models are evaluated on data they did not see during training. A validation set is used to tune choices such as the learning rate, and a test set gives the final estimate. Accuracy, precision and recall are common classification metrics.'},
 {doc:'Neural Networks',topic:'Neurons',text:'An artificial neuron computes a weighted sum of its inputs, adds a bias, and passes the result through an activation function. A perceptron is a single neuron used as a linear classifier.'},
 {doc:'Neural Networks',topic:'Activation functions',text:'Activation functions such as ReLU, sigmoid and tanh add non-linearity. Without them, a stack of layers would collapse into a single linear transformation, no matter how deep the network is.'},
 {doc:'Neural Networks',topic:'Backpropagation',text:'Backpropagation computes the gradient of the loss with respect to every weight. It applies the chain rule from the output layer backwards to the input layer, reusing intermediate results. Gradient descent then uses these gradients to update the weights.'},
 {doc:'Neural Networks',topic:'Overfitting',text:'A network is overfitting when training loss keeps falling while validation loss starts to rise. Dropout, weight decay and early stopping are common ways to reduce overfitting.'},
 {doc:'Deep Learning list',topic:'CNNs',text:'A convolutional neural network, or CNN, slides small learned filters across an image to detect local patterns such as edges and textures. Pooling layers downsample the feature maps, keeping the strongest signal in each region. CNNs are the standard choice for image tasks.'},
 {doc:'Deep Learning list',topic:'RNNs',text:'A recurrent neural network, or RNN, processes a sequence one step at a time and carries a hidden state forward. This lets it use earlier context, but plain RNNs struggle with long sequences because gradients vanish. LSTMs and GRUs add gates to keep information longer.'},
 {doc:'Deep Learning list',topic:'Transformers',text:'Transformers replace recurrence with self-attention. Each token weighs how much it should draw on every other token in the sequence, so long-range context is handled in parallel. Transformers power most modern language models.'},
 {doc:'Deep Learning list',topic:'Comparing architectures',text:'CNNs suit grid-like data such as images because they exploit spatial locality. RNNs suit sequences such as text or audio because they model order over time. Transformers also handle sequences and have largely replaced RNNs for language.'}
];
const STOP=new Set('a an the is are was were be been to of in on for and or what how why does do did can could would should explain me my i notes note from with between difference differ compare simple words give tell about this that these it its you please define meaning mean means which when where who whats there their them then than so if as at by into kya hai hain hota hoti ka ki ke mein me ko samjhao samjhaiye batao bataiye kaise kyun aur ek se toh ho jab agar yeh woh bada chhota kam zyada'.split(' '));
const SYN={gd:['gradient','descent'],sgd:['stochastic','gradient'],lr:['learning','rate'],backprop:['backpropagation'],nn:['neural','network'],ml:['machine','learning'],dl:['deep','learning'],cnn:['cnn','convolutional'],rnn:['rnn','recurrent'],overfit:['overfitting'],underfit:['underfitting'],attention:['attention','self']};
function stem(w){if(w.length>5&&w.endsWith('ing'))return w.slice(0,-3);if(w.length>4&&w.endsWith('ed'))return w.slice(0,-2);if(w.length>3&&w.endsWith('s')&&!w.endsWith('ss'))return w.slice(0,-1);return w}
function terms(text,query){
  const out=[];
  for(const raw of text.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/)){
    if(!raw||raw.length<2||STOP.has(raw))continue;
    const ex=query&&SYN[raw]?SYN[raw]:[raw];
    for(const w of ex)out.push(stem(w));
  }
  return out;
}
let INDEX=null;
function buildIndex(){
  const docs=NOTES.map(n=>{const t=terms(n.text+' '+n.topic);const tf={};t.forEach(w=>tf[w]=(tf[w]||0)+1);return{tf,len:t.length}});
  const df={};docs.forEach(d=>Object.keys(d.tf).forEach(w=>df[w]=(df[w]||0)+1));
  const avg=docs.reduce((s,d)=>s+d.len,0)/docs.length;
  INDEX={docs,df,avg,N:docs.length};
}
buildIndex();
function search(q){
  const t0=performance.now();
  const qt=[...new Set(terms(q,true))];
  const {docs,df,avg,N}=INDEX,k1=1.2,b=.75;
  const scored=docs.map((d,i)=>{
    let s=0,hit=0;
    for(const w of qt){const f=d.tf[w];if(!f)continue;hit++;const idf=Math.log(1+(N-df[w]+.5)/(df[w]+.5));s+=idf*f*(k1+1)/(f+k1*(1-b+b*d.len/avg))}
    return{i,s,hit};
  }).filter(x=>x.s>0).sort((a,b)=>b.s-a.s);
  const top=scored.slice(0,3).filter((x,j)=>j===0||x.s>=scored[0].s*.45).slice(0,2);
  const covered=new Set();top.forEach(x=>qt.forEach(w=>{if(INDEX.docs[x.i].tf[w])covered.add(w)}));
  return{q,qt,top,coverage:qt.length?covered.size/qt.length:0,ms:performance.now()-t0};
}
function bestSentences(text,qt,n){
  const ss=text.split(/(?<=[.!?])\s+/);
  const sc=ss.map((s,i)=>({i,s,v:terms(s).filter(w=>qt.includes(w)).length}));
  return sc.slice().sort((a,b)=>b.v-a.v||a.i-b.i).slice(0,n).sort((a,b)=>a.i-b.i).map(x=>x.s).join(' ');
}
function highlight(node,text,qt){
  if(!qt.length){node.textContent=text;return}
  const esc=qt.map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  const re=new RegExp('\\b(?:'+esc.join('|')+')\\w*','gi');
  let last=0;
  for(const m of text.matchAll(re)){node.append(text.slice(last,m.index));node.append(el('mark',null,m[0]));last=m.index+m[0].length}
  node.append(text.slice(last));
}
const NOT_FOUND='That isn\'t in your library yet. Your notes cover machine learning basics, neural networks and deep learning. Try gradient descent, overfitting or CNNs.';
function shortAnswer(r){
  if(!r.top.length)return NOT_FOUND;
  return bestSentences(NOTES[r.top[0].i].text,r.qt,2);
}

/* ---------- Ask view ---------- */
function renderDoubts(){
  const w=$('#doubts');w.replaceChildren();
  state.doubts.forEach(q=>{const b=el('button',null,q);b.dataset.fill=q;b.dataset.autoask='1';w.append(b)});
  $('#doubtWrap').hidden=!state.doubts.length;
}
renderDoubts();
function runAsk(q){
  const r=search(q);
  const box=$('#answer');box.replaceChildren();
  const a=el('div','answer');
  const head=el('div','ahead');
  if(r.top.length){
    head.append(el('span','strength'+(r.coverage<.6?' partial':''),r.coverage<.6?'Partial match':'Strong match'));
  }else head.append(el('span','strength partial','Not in your notes'));
  head.append(el('span','mono','Searched '+NOTES.length+' passages in '+r.ms.toFixed(1)+' ms'));
  a.append(head);
  if(!r.top.length){a.append(el('p',null,NOT_FOUND))}
  else{
    a.append(el('p',null,'Here is what your notes say.'));
    r.top.forEach(x=>{
      const n=NOTES[x.i],p=el('div','passage'),t=el('p');
      highlight(t,bestSentences(n.text,r.qt,3),r.qt);
      p.append(t,el('span','mono',n.doc+' · '+n.topic));a.append(p);
    });
  }
  box.append(a);
  state.doubts=[q,...state.doubts.filter(d=>d!==q)].slice(0,5);save();renderDoubts();
}
$('#askForm').addEventListener('submit',e=>{
  e.preventDefault();
  const q=$('#askIn').value.trim();
  if(!q){$('#askErr').textContent='Enter a question first.';$('#askIn').focus();return}
  $('#askErr').textContent='';runAsk(q);
});
$('#askIn').addEventListener('input',()=>$('#askErr').textContent='');
$('#askIn').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))$('#askForm').requestSubmit()});

/* ---------- Views ---------- */
const VIEWS=['today','notes','study','ask','progress','flashcards','groups'];
let current=null;
function setView(name){
  if(!VIEWS.includes(name))name='today';
  if(name===current)return;
  current=name;
  $$('.view').forEach(v=>v.hidden=v.id!=='v-'+name);
  $$('[data-view]').forEach(b=>{if(b.closest('.nav,.mnav'))b.dataset.view===name?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current')});
  $('#crumb').textContent={today:'Today',notes:'My notes',study:'Study room',ask:'Ask Eklavya',progress:'Progress',flashcards:'Flashcards',groups:'Study groups'}[name];
  window.scrollTo({top:0});
  if(location.hash.slice(1)!==name)history.replaceState(null,'','#'+name);
  name==='study'?startOrbit():stopOrbit();
  if(name==='progress')drawMap();
}
const initialHash=location.hash.slice(1);

/* ---------- Today's route ---------- */
function renderRoute(){
  const order=['recall','concept','cards'];let firstOpen=null,done=0;
  order.forEach(k=>{
    const b=$('.step[data-step="'+k+'"]'),isDone=!!state.route[k];
    if(isDone)done++;else if(!firstOpen)firstOpen=k;
    b.classList.toggle('done',isDone);b.classList.toggle('cur',!isDone&&firstOpen===k);
    $('.mk',b).textContent=isDone?'✓':String(order.indexOf(k)+1).padStart(2,'0');
  });
  $('#routeLabel').textContent=done===3?'All 3 steps done. Nice work.':done+' of 3 steps done';
  $('#routeBar').style.width=Math.round(done/3*100)+'%';
}
function markRoute(k){if(state.route[k])return;state.route[k]=true;save();renderRoute();toast(k==='concept'?'Step 2 done: you worked through a concept.':'Step 3 done: today\'s deck is clear.')}

/* ---------- Flashcards ---------- */
const CARDS=[
  {id:'c1',t:'Machine Learning',q:'What is the goal of gradient descent?',a:'Find parameters that reduce the loss function, one small step at a time.'},
  {id:'c2',t:'Machine Learning',q:'What happens if the learning rate is too large?',a:'Updates overshoot the minimum, so the loss can oscillate or diverge.'},
  {id:'c3',t:'Machine Learning',q:'What is the difference between bias and variance?',a:'Bias is error from overly simple assumptions. Variance is error from sensitivity to the training data.'},
  {id:'c4',t:'Neural Networks',q:'Why does a network need activation functions?',a:'They add non-linearity. Without them, stacked layers collapse into one linear map.'},
  {id:'c5',t:'Neural Networks',q:'What does backpropagation compute?',a:'Gradients of the loss with respect to each weight, using the chain rule backwards.'},
  {id:'c6',t:'Neural Networks',q:'What is a sign of overfitting?',a:'Training loss keeps falling while validation loss starts rising.'},
  {id:'c7',t:'Deep Learning',q:'What does a pooling layer do in a CNN?',a:'It downsamples feature maps, keeping the strongest signal in each region.'},
  {id:'c8',t:'Deep Learning',q:'What is the core idea of self-attention?',a:'Each token weighs how much it should draw on every other token in the sequence.'}
];
const byId=Object.fromEntries(CARDS.map(c=>[c.id,c]));
let queue=CARDS.map(c=>c.id).filter(id=>!state.known.includes(id)),pos=0;
const pad=n=>String(n).padStart(2,'0');
function showCard(){
  $('#fcard').classList.remove('flipped');
  const left=queue.length;
  if(!left){
    $('#fTopic').textContent='Done for today';$('#fq').textContent='All caught up.';$('#fa').textContent='Come back tomorrow, or reset the deck to practise again.';
    $('#fPos').textContent='Deck clear';
  }else{
    pos=Math.min(pos,left-1);
    const c=byId[queue[pos]];
    $('#fTopic').textContent=c.t;$('#fq').textContent=c.q;$('#fa').textContent=c.a;
    $('#fPos').textContent='Card '+pad(pos+1)+' of '+pad(left);
  }
  $('#rateRow').hidden=!left;
  $('#due').textContent=left;$('#dueNav').textContent=left;
  $('#routeCards').textContent=left?left+(left===1?' card':' cards')+' due today':'Deck clear';
  $('#statKnown').textContent=(CARDS.length-left)+' / '+CARDS.length;
}
function rate(r){
  if(!queue.length)return;
  const id=queue[pos];
  if(r==='known'){queue.splice(pos,1);if(!state.known.includes(id))state.known.push(id);if(pos>=queue.length)pos=0}
  else{queue.push(queue.splice(pos,1)[0]);if(pos>=queue.length)pos=0}
  save();pageTurn();showCard();
  if(!queue.length)markRoute('cards');
  else toast(r==='known'?'Got it. '+queue.length+' left today.':r==='hard'?'Marked hard. It comes back soon.':'Again. It\'s at the back of the deck.');
}
$('#fcard').addEventListener('click',()=>{if(queue.length){$('#fcard').classList.toggle('flipped');pageTurn()}});
$('#fPrev').addEventListener('click',()=>{if(queue.length>1){pos=(pos-1+queue.length)%queue.length;pageTurn();showCard()}});
$('#fNext').addEventListener('click',()=>{if(queue.length>1){pos=(pos+1)%queue.length;pageTurn();showCard()}});
showCard();renderRoute();

/* ---------- Orbit: drag, arrow keys, pause on hover, back nodes unfocusable ---------- */
const orbit=$('#orbit'),onodes=$$('.onode');
let oAngle=0,oPaused=false,oDrag=null,oMoved=false,oRAF=null,oLast=0;
function renderOrbit(){
  const R=Math.min(190,orbit.clientWidth*.3);
  onodes.forEach((n,i)=>{
    const a=i*72+oAngle,c=Math.cos(a*Math.PI/180),back=c<.15;
    n.style.transform='rotateY('+a.toFixed(2)+'deg) translateZ('+R.toFixed(0)+'px)';
    n.style.opacity=back?0:(.45+.55*c).toFixed(2);
    n.style.pointerEvents=back?'none':'';
    n.tabIndex=back?-1:0;
    back?n.setAttribute('aria-hidden','true'):n.removeAttribute('aria-hidden');
  });
}
function tick(t){
  const dt=oLast?Math.min(64,t-oLast):16;oLast=t;
  if(!oPaused&&!oDrag&&!reduce)oAngle-=dt*.012;
  renderOrbit();oRAF=requestAnimationFrame(tick);
}
function startOrbit(){if(!oRAF){oLast=0;oRAF=requestAnimationFrame(tick)}}
function stopOrbit(){if(oRAF){cancelAnimationFrame(oRAF);oRAF=null}}
renderOrbit();
orbit.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')oPaused=true});
orbit.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')oPaused=false});
orbit.addEventListener('focusin',()=>oPaused=true);
orbit.addEventListener('focusout',()=>oPaused=false);
orbit.addEventListener('pointerdown',e=>{oDrag={x:e.clientX,a:oAngle};oMoved=false});
window.addEventListener('pointermove',e=>{if(!oDrag)return;const dx=e.clientX-oDrag.x;if(Math.abs(dx)>6){oMoved=true;orbit.classList.add('dragging')}oAngle=oDrag.a+dx*.35});
window.addEventListener('pointerup',()=>{if(oDrag){oDrag=null;orbit.classList.remove('dragging')}});
orbit.addEventListener('click',e=>{if(oMoved){e.stopPropagation();e.preventDefault();oMoved=false}},true);
orbit.addEventListener('keydown',e=>{
  if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;
  e.preventDefault();oAngle+=e.key==='ArrowLeft'?72:-72;renderOrbit();
  const front=onodes.reduce((best,n,i)=>{const c=Math.cos((i*72+oAngle)*Math.PI/180);return c>best.c?{c,n}:best},{c:-2,n:null}).n;
  if(front)front.focus();
});

/* ---------- Concept map ---------- */
const TOPICS={
  ml:{name:'Machine Learning',m:72,x:16,y:42,q:'What is supervised learning?',open:'Machine Learning'},
  nn:{name:'Neural Networks',m:48,x:50,y:13,q:'What does an artificial neuron compute?',open:'Neural Networks'},
  gd:{name:'Gradient Descent',m:64,x:33,y:72,q:'Explain gradient descent in simple words.',open:'Machine Learning · Gradient Descent'},
  bp:{name:'Backpropagation',m:41,x:82,y:30,q:'What does backpropagation compute?',open:'Neural Networks · Backpropagation'},
  dl:{name:'Deep Learning',m:84,x:68,y:60,q:'What is the difference between CNN and RNN?',open:'Deep Learning'},
  cnn:{name:'CNN',m:86,x:52,y:89,q:'How does a CNN work?',open:'Deep Learning · CNN'},
  att:{name:'Self-attention',m:70,x:83,y:87,q:'What is self-attention in transformers?',open:'Deep Learning · Transformers'}
};
const EDGES=[['ml','gd'],['ml','nn'],['nn','bp'],['gd','bp'],['nn','dl'],['dl','cnn'],['dl','att']];
const status=m=>m>=80?['st-strong','Strong']:m>=60?['st-grow','Growing']:['st-low','Revisit'];
const cmap=$('#cmap'),svg=$('#cmapSvg');let selected=null;
EDGES.forEach(([a,b],i)=>{
  const l=document.createElementNS('http://www.w3.org/2000/svg','line');
  l.setAttribute('x1',TOPICS[a].x+'%');l.setAttribute('y1',TOPICS[a].y+'%');l.setAttribute('x2',TOPICS[b].x+'%');l.setAttribute('y2',TOPICS[b].y+'%');
  l.setAttribute('pathLength','100');l.setAttribute('class','edge');l.style.setProperty('--i',i);l.dataset.a=a;l.dataset.b=b;svg.append(l);
});
Object.entries(TOPICS).forEach(([id,t])=>{
  const b=el('button','cnode');b.dataset.node=id;b.style.left=t.x+'%';b.style.top=t.y+'%';b.setAttribute('aria-pressed','false');
  const dot=el('i',status(t.m)[0]);b.append(dot,document.createTextNode(t.name));
  b.setAttribute('aria-label',t.name+', '+t.m+'% mastery');
  b.addEventListener('mouseenter',()=>focusNode(id));b.addEventListener('mouseleave',()=>focusNode(selected));
  b.addEventListener('focus',()=>focusNode(id));b.addEventListener('blur',()=>focusNode(selected));
  b.addEventListener('click',()=>selectNode(id));
  cmap.append(b);
});
function neighbors(id){return EDGES.filter(e=>e.includes(id)).map(e=>e[0]===id?e[1]:e[0])}
function focusNode(id){
  cmap.classList.toggle('focus',!!id);
  const nb=id?neighbors(id):[];
  $$('.cnode',cmap).forEach(n=>n.classList.toggle('dim',!!id&&n.dataset.node!==id&&!nb.includes(n.dataset.node)));
  $$('.edge',svg).forEach(l=>l.classList.toggle('hot',!!id&&(l.dataset.a===id||l.dataset.b===id)));
}
function selectNode(id){
  selected=id;const t=TOPICS[id],[cls,label]=status(t.m);
  $$('.cnode',cmap).forEach(n=>n.setAttribute('aria-pressed',n.dataset.node===id));
  $('#dStatus').textContent=label+' · '+t.m+'% mastery';$('#dName').textContent=t.name;
  $('#dText').textContent='Connects to '+neighbors(id).map(n=>TOPICS[n].name).join(', ')+'.';
  $('#dActs').hidden=false;focusNode(id);
}
$('#dStudy').addEventListener('click',()=>{if(selected)openVoice(TOPICS[selected].open,'learn')});
$('#dAsk').addEventListener('click',()=>{if(!selected)return;setView('ask');$('#askIn').value=TOPICS[selected].q;runAsk(TOPICS[selected].q)});
function drawMap(){cmap.classList.remove('drawn');void cmap.offsetWidth;requestAnimationFrame(()=>cmap.classList.add('drawn'))}

/* ---------- Voice session ---------- */
const MODES={
  learn:['Learn','Chaliye, ek simple example se shuru karte hain. Sochiye aap ek hill par khade hain aur neeche jaana hai. Har step chhota rakhiye, aur dekhiye ki zameen kis taraf jhuk rahi hai. Yahi gradient descent hai.'],
  test:['Test','Quick check. Gradient descent kis direction mein move karta hai, aur kyun? Apna answer type kijiye ya boliye, main notes se check karunga.'],
  revise:['Revise','Five-minute recap. Loss batata hai hum kitna galat hain. Gradient batata hai kis taraf jaana hai. Learning rate batata hai step kitna bada ho.'],
  viva:['Viva','Viva mode. First question: learning rate bahut bada ho toh kya hota hai? Apne words mein explain kijiye.'],
  debate:['Debate','Debate time. Claim: transformers ne RNNs ko poori tarah replace kar diya hai. Aap agree karte hain? Evidence ke saath bataiye.'],
  free:['Free talk','Jo bhi poochna hai, poochiye. Main aapke notes mein se answer dhoondhunga.']
};
let lastFocus=null,typeTimer=null,barRaf=null,sessionTopic='',sessionStart=0,rec=null,listening=false;
function openVoice(topic,mode){
  mode=MODES[mode]?mode:'learn';
  lastFocus=document.activeElement;sessionTopic=topic;sessionStart=Date.now();
  $('#vtopic').textContent=topic;$('#vmode').textContent='Eklavya live · '+MODES[mode][0];
  $('#vq').textContent='';$('#vsrc').textContent='';$('#vIn').value='';
  $('#voice').hidden=false;pageTurn();
  typeText(MODES[mode][1]);speak(MODES[mode][1]);startBars();
  $('#vIn').focus({preventScroll:true});
}
function closeVoice(){
  if($('#voice').hidden)return;
  $('#voice').hidden=true;stopListening();stopSpeaking();
  clearInterval(typeTimer);cancelAnimationFrame(barRaf);barRaf=null;
  if(/Gradient/.test(sessionTopic)&&Date.now()-sessionStart>4000)markRoute('concept');
  if(lastFocus&&lastFocus.focus)lastFocus.focus({preventScroll:true});
}
function typeText(text){
  const t=$('#vtx');clearInterval(typeTimer);
  if(reduce){t.textContent=text;return}
  let i=0;t.textContent='';
  typeTimer=setInterval(()=>{t.textContent=text.slice(0,++i);if(i>=text.length)clearInterval(typeTimer)},22);
}
function startBars(){
  const bars=$$('#vbars i');cancelAnimationFrame(barRaf);
  if(reduce){bars.forEach(b=>b.style.height='18px');return}
  const lv=bars.map(()=>14);
  (function step(){bars.forEach((b,i)=>{lv[i]=Math.max(6,Math.min(40,lv[i]+(Math.random()-.5)*(listening?22:14)));b.style.height=lv[i].toFixed(0)+'px'});barRaf=requestAnimationFrame(step)})();
}
function answerVoice(q){
  const r=search(q),ans=shortAnswer(r);
  $('#vq').textContent='You asked: “'+q+'”';
  typeText(ans);speak(ans);
  $('#vsrc').textContent=r.top.length?'From '+NOTES[r.top[0].i].doc+' · '+NOTES[r.top[0].i].topic:'';
}
$('#vForm').addEventListener('submit',e=>{
  e.preventDefault();const q=$('#vIn').value.trim();
  if(!q){$('#vIn').placeholder='Type a question first';$('#vIn').focus();return}
  $('#vIn').value='';answerVoice(q);
});
function stopListening(){listening=false;$('#vbody').classList.remove('listening');const b=$('#micBtn');b.setAttribute('aria-pressed','false');b.textContent='Start mic';if(rec){try{rec.stop()}catch(e){}}}
$('#micBtn').addEventListener('click',()=>{
  if(listening){stopListening();return}
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){toast('This browser has no speech recognition. Type your question instead.');return}
  try{
    rec=new SR();rec.lang='en-IN';rec.interimResults=true;rec.maxAlternatives=1;
    rec.onresult=e=>{let fin='',interim='';for(const r of e.results){(r.isFinal?(fin+=r[0].transcript):(interim+=r[0].transcript))}$('#vq').textContent=(fin||interim)?'Hearing: “'+(fin||interim)+'”':'';if(fin){stopListening();answerVoice(fin.trim())}};
    rec.onerror=e=>{stopListening();toast(e.error==='not-allowed'||e.error==='service-not-allowed'?'The microphone is blocked here. It works when you host the page yourself. You can type instead.':'Couldn\'t hear that. Try again or type your question.')};
    rec.onend=()=>{if(listening)stopListening()};
    stopSpeaking();rec.start();listening=true;$('#vbody').classList.add('listening');
    const b=$('#micBtn');b.setAttribute('aria-pressed','true');b.textContent='Listening… tap to stop';
  }catch(e){stopListening();toast('The microphone is blocked here. You can type instead.')}
});
$('#voice').addEventListener('click',e=>{if(e.target.id==='voice')closeVoice()});

/* ---------- Search palette ---------- */
const PAL=[
  ...VIEWS.map(v=>({label:{today:'Today',notes:'My notes',study:'Study room',ask:'Ask Eklavya',progress:'Progress',flashcards:'Flashcards',groups:'Study groups'}[v],kind:'Page',run:()=>setView(v)})),
  ...Object.entries(TOPICS).map(([id,t])=>({label:t.name,kind:'Topic',run:()=>{setView('progress');selectNode(id)}})),
  {label:'Start a voice session',kind:'Action',run:()=>openVoice('Machine Learning · Gradient Descent','learn')},
  {label:'Start a mock round',kind:'Action',run:()=>mockRound()}
];
function openPal(){lastFocus=document.activeElement;$('#palette').hidden=false;$('#palIn').value='';renderPal('');$('#palIn').focus()}
function closePal(){if($('#palette').hidden)return;$('#palette').hidden=true;if(lastFocus&&lastFocus.focus)lastFocus.focus({preventScroll:true})}
function renderPal(q){
  const list=$('#plist');list.replaceChildren();q=q.toLowerCase().trim();
  const items=PAL.filter(p=>!q||p.label.toLowerCase().includes(q)).slice(0,9);
  if(!items.length){list.append(el('p','mono','No match. Press Enter to ask your notes instead.'))}
  items.forEach(p=>{const b=el('button');b.append(el('span',null,p.label),el('span','mono',p.kind));b.addEventListener('click',()=>{closePal();p.run()});list.append(b)});
}
$('#palIn').addEventListener('input',e=>renderPal(e.target.value));
$('#palIn').addEventListener('keydown',e=>{
  if(e.key==='ArrowDown'){e.preventDefault();const f=$('#plist button');if(f)f.focus()}
  if(e.key==='Enter'){e.preventDefault();const f=$('#plist button');if(f)f.click();else{const q=$('#palIn').value.trim();if(q){closePal();setView('ask');$('#askIn').value=q;runAsk(q)}}}
});
$('#plist').addEventListener('keydown',e=>{
  const bs=$$('#plist button'),i=bs.indexOf(document.activeElement);
  if(e.key==='ArrowDown'&&i<bs.length-1){e.preventDefault();bs[i+1].focus()}
  if(e.key==='ArrowUp'){e.preventDefault();i>0?bs[i-1].focus():$('#palIn').focus()}
});
$('#palette').addEventListener('click',e=>{if(e.target.id==='palette')closePal()});

/* ---------- Notes upload: .txt becomes searchable ---------- */
function addDoc(name,info,searchable){
  const a=el('article','doc'),c=el('div','cov',name.slice(0,2).toUpperCase());c.style.background='var(--blue-pale)';
  const d=el('div');d.append(el('h3',null,name),el('p',null,info));a.append(c,d);
  if(searchable){const b=el('button','btn-ghost','Ask ↗');b.addEventListener('click',()=>{setView('ask');$('#askIn').value='';$('#askIn').placeholder='Ask something from '+name+'…';$('#askIn').focus()});a.append(b)}
  $('#docs').prepend(a);
  if(searchable){const s=el('div','src'),bd=el('span','badge','TXT'),sp=el('span');sp.append(el('b',null,name),el('small',null,info));s.append(bd,sp);$('#srcList').append(s)}
}
function chunk(text){
  const ss=text.replace(/\s+/g,' ').trim().split(/(?<=[.!?])\s+/);const out=[];let cur='';
  for(const s of ss){if((cur+' '+s).length>420&&cur){out.push(cur.trim());cur=s}else cur+=' '+s}
  if(cur.trim())out.push(cur.trim());return out.slice(0,200);
}
function handleFiles(list){
  [...list].forEach(f=>{
    if(f.size>10*1024*1024){toast(f.name+' is over 10 MB.');return}
    if(/\.(txt|md)$/i.test(f.name)||f.type==='text/plain'){
      const r=new FileReader();
      r.onload=()=>{const parts=chunk(String(r.result||''));if(!parts.length){toast(f.name+' looks empty.');return}
        parts.forEach((t,i)=>NOTES.push({doc:f.name,topic:'Part '+(i+1),text:t}));buildIndex();
        addDoc(f.name,'Your notes · '+parts.length+' passages · Searchable now',true);
        toast('Added '+f.name+'. Ask about it now.')};
      r.onerror=()=>toast('Couldn\'t read '+f.name+'.');
      r.readAsText(f);
    }else{addDoc(f.name,'Waiting for the backend to read this file type',false);toast('PDFs and photos need the backend. Plain text works now.')}
  });
}
(function(){
  const z=$('#drop');
  ['dragenter','dragover'].forEach(ev=>z.addEventListener(ev,e=>{e.preventDefault();z.classList.add('dragging')}));
  ['dragleave','drop'].forEach(ev=>z.addEventListener(ev,e=>{e.preventDefault();z.classList.remove('dragging')}));
  z.addEventListener('drop',e=>handleFiles(e.dataTransfer.files));
  $('#file').addEventListener('change',e=>{handleFiles(e.target.files);e.target.value=''});
})();

/* ---------- Misc controls ---------- */
function mockRound(){
  queue=CARDS.map(c=>c.id).sort(()=>Math.random()-.5);pos=0;state.known=[];save();
  setView('flashcards');showCard();toast('Mock round: all 8 cards, shuffled.');
}
$('#soundBtn').addEventListener('click',()=>{state.sound=!state.sound;save();setSoundBtn();if(!state.sound)stopSpeaking();else pageTurn()});
$('#howBtn').addEventListener('click',()=>{const open=$('#howList').hidden;$('#howList').hidden=!open;$('#howBtn').setAttribute('aria-expanded',open)});

document.addEventListener('click',e=>{
  const o=e.target.closest('[data-open]');
  if(o){openVoice(o.dataset.open,o.dataset.mode);return}
  const v=e.target.closest('[data-view]');
  if(v){setView(v.dataset.view);return}
  const tp=e.target.closest('[data-topic]');
  if(tp){setView('progress');selectNode(tp.dataset.topic);return}
  const f=e.target.closest('[data-fill]');
  if(f){$('#askIn').value=f.dataset.fill;$('#askErr').textContent='';if(f.dataset.autoask)runAsk(f.dataset.fill);else $('#askIn').focus();return}
  const r=e.target.closest('[data-rate]');
  if(r){rate(r.dataset.rate);return}
  if(e.target.closest('[data-close]')){closeVoice();return}
  const a=e.target.closest('[data-action]');
  if(!a)return;
  const act=a.dataset.action;
  if(act==='upload')$('#file').click();
  else if(act==='search')openPal();
  else if(act==='recall')toast('Quick recall is already done for today.');
  else if(act==='mock')mockRound();
  else if(act==='resetDeck'){state.known=[];state.route.cards=false;queue=CARDS.map(c=>c.id);pos=0;save();showCard();renderRoute();toast('Today\'s deck is reset.')}
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(!$('#palette').hidden)closePal();else if(!$('#voice').hidden)closeVoice();else endIntro()}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#palette').hidden?openPal():closePal()}
});

/* ---------- 3D: the desk and subject cards lean toward the pointer ---------- */
if(!reduce){
  const stage=$('#stage'),book=$('#book');
  stage.addEventListener('pointermove',e=>{
    const r=stage.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
    stage.style.setProperty('--px',x.toFixed(3));stage.style.setProperty('--py',y.toFixed(3));
    book.style.setProperty('--tx',(-y*22).toFixed(1)+'deg');book.style.setProperty('--ty',(x*26).toFixed(1)+'deg');
  });
  stage.addEventListener('pointerleave',()=>{stage.style.setProperty('--px',0);stage.style.setProperty('--py',0);book.style.setProperty('--tx','0deg');book.style.setProperty('--ty','0deg')});
  $$('.sub').forEach(c=>{
    c.addEventListener('pointermove',e=>{const r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;c.style.setProperty('--tx',(-y*8).toFixed(1)+'deg');c.style.setProperty('--ty',(x*10).toFixed(1)+'deg')});
    c.addEventListener('pointerleave',()=>{c.style.setProperty('--tx','0deg');c.style.setProperty('--ty','0deg')});
  });
}

/* ---------- Start on the requested view ---------- */
setView(initialHash||'today');
window.addEventListener('hashchange',()=>setView(location.hash.slice(1)));

/* ---------- Intro: once per visit, skipped for deep links; the book lands in the hero ---------- */
const intro=$('#intro');let introOpened=false,introDone=true;
function unlock(){$('.shell').inert=false;$('.mnav').inert=false;document.body.classList.add('ready')}
function endIntro(){
  if(introDone)return;introDone=true;clearTimeout(endIntro.t);
  const stage=$('#stage'),flt=$('.float');
  const finish=()=>{intro.hidden=true;stage.classList.remove('waiting');unlock()};
  const tr=flt.getBoundingClientRect();
  const canFly=introOpened&&current==='today'&&tr.top>=0&&tr.bottom<=innerHeight&&tr.width>0;
  if(!canFly){stage.classList.remove('waiting');intro.classList.add('out');$('.shell').classList.add('enter');setTimeout(finish,320);return}
  const fly=$('#ifly'),fr=fly.getBoundingClientRect();
  const dx=(tr.left+tr.width/2)-(fr.left+fr.width/2),dy=(tr.top+tr.height/2)-(fr.top+fr.height/2);
  fly.style.transition='transform .9s cubic-bezier(.65,0,.25,1)';
  fly.style.transform='translate('+dx.toFixed(1)+'px,'+dy.toFixed(1)+'px) scale('+(260/400).toFixed(3)+')';
  intro.classList.add('landing');intro.style.cursor='default';
  setTimeout(()=>{stage.classList.remove('waiting');intro.classList.add('out');pageTurn()},900);
  setTimeout(finish,1220);
}
(function(){
  let seen=false;try{seen=sessionStorage.getItem('eklavya-intro')==='1'}catch(e){}
  if(reduce||seen||initialHash){unlock();return}
  try{sessionStorage.setItem('eklavya-intro','1')}catch(e){}
  introDone=false;intro.hidden=false;$('#stage').classList.add('waiting');
  $('.shell').inert=true;$('.mnav').inert=true;
  requestAnimationFrame(()=>requestAnimationFrame(()=>intro.classList.add('go')));
  setTimeout(()=>introOpened=true,2300);
  endIntro.t=setTimeout(endIntro,3300);
  intro.addEventListener('click',endIntro);
  $('#skip').focus({preventScroll:true});
})();
