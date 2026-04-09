// ═══════════════════════════════════════════════
// Claude AI Assistant panel module
// ═══════════════════════════════════════════════

function toggleClaude(){
  document.getElementById('claudePanel').style.transform=document.getElementById('claudePanel').style.transform==='translateX(0px)'||document.getElementById('claudePanel').classList.contains('visible')?'translateX(100%)':'translateX(0)';
}

function cpSug(t){
  document.getElementById('cpInput').value=t;
  cpSend();
}

async function cpSend(){
  const inp=document.getElementById('cpInput');
  const msg=inp.value.trim(); if(!msg)return;
  inp.value='';
  addCpMsg(msg,'user');
  const load=addCpMsg('Pensando...','ai loading');
  try{
    const ctx=`Eres el asistente IA de ${EMPRESA?.nombre||'una empresa de instalaciones'}, empresa de fontanería, calefacción, AC y energías renovables. Responde en español, de forma concisa y práctica.`;
    const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1000,system:ctx,messages:[{role:'user',content:msg}]})});
    const data=await res.json();
    load.textContent=data.content?.[0]?.text||'Sin respuesta';
    load.style.fontStyle='normal';load.style.color='';
  }catch(e){load.textContent='⚠️ Chat IA requiere configuración adicional.';load.style.fontStyle='normal';}
}

function addCpMsg(txt,type){
  const msgs=document.getElementById('cpMsgs');
  const div=document.createElement('div');
  const isUser=type==='user';
  div.style.cssText=`background:${isUser?'var(--azul)':'var(--gris-50)'};color:${isUser?'#fff':'var(--gris-800)'};padding:10px 12px;border-radius:12px;font-size:12.5px;line-height:1.5;align-self:${isUser?'flex-end':'flex-start'};border-${isUser?'bottom-right':'bottom-left'}-radius:3px;max-width:85%;${type==='ai loading'?'font-style:italic;color:var(--gris-400)':''}`;
  div.textContent=txt;
  msgs.appendChild(div);
  msgs.scrollTop=msgs.scrollHeight;
  return div;
}
