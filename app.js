// ===== FIREBASE =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBt193mClty0jKJNAqkms29tjOqmh2yafA",
  authDomain: "imovel-pro-gerson.firebaseapp.com",
  projectId: "imovel-pro-gerson",
  messagingSenderId: "86696290419",
  appId: "1:86696290419:web:21e94f796415f737256206"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// ===== CONSTANTES =====
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// ===== ESTADO =====
let DB = { props:[], inqs:[], imoveis:[], pags:[], repasses:[], taxas:[], fotos:[], docs:[] };
let currentUser = null;
let curPage = 'dashboard';
let curImovelId = null;
let curPagMonth = null;
let curRepMonth = null;
let chipFilter = { imoveis:'todos', pag:'todos' };
let curDetTab = 'geral';
let fotoFileBase64 = null;
let unsubListeners = [];

// ===== UTILS =====
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2); }
function fmt(v){ return 'R$ '+Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtShort(v){ return 'R$ '+Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0}); }
function initials(n){ return (n||'').trim().split(' ').filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase()||'?'; }
function avColor(n){ const c=['#2D6A4F','#1558C0','#880e4f','#4527a0','#00695c','#bf360c','#37474f','#6a1b9a']; return c[(n||'').charCodeAt(0)%c.length]; }

function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2800);
}

function setSyncIcon(s){
  const el=document.getElementById('sync-icon'); if(!el)return;
  if(s==='ok'){el.className='ti ti-cloud-check';el.style.color='var(--accent)';}
  else if(s==='saving'){el.className='ti ti-cloud-upload';el.style.color='var(--warn-text)';}
  else{el.className='ti ti-cloud-off';el.style.color='var(--danger-text)';}
}

// ===== AUTH =====
function toggleSenha(){
  const i=document.getElementById('login-senha');
  const ic=document.getElementById('btn-olho').querySelector('i');
  i.type=i.type==='password'?'text':'password';
  ic.className=i.type==='password'?'ti ti-eye':'ti ti-eye-off';
}
window.toggleSenha=toggleSenha;

async function fazerLogin(){
  const email=document.getElementById('login-email').value.trim();
  const senha=document.getElementById('login-senha').value;
  const erro=document.getElementById('login-erro');
  const btnTxt=document.getElementById('login-btn-txt');
  const btnLoad=document.getElementById('login-btn-load');
  const btn=document.getElementById('login-btn');
  if(!email||!senha){erro.style.display='';erro.textContent='Preencha e-mail e senha.';return;}
  erro.style.display='none';
  btnTxt.style.display='none';btnLoad.style.display='';btn.disabled=true;
  try{
    await signInWithEmailAndPassword(auth,email,senha);
  }catch(e){
    btnTxt.style.display='';btnLoad.style.display='none';btn.disabled=false;
    erro.style.display='';
    const msgs={'auth/invalid-credential':'E-mail ou senha incorretos.','auth/user-not-found':'Usuário não encontrado.','auth/wrong-password':'Senha incorreta.','auth/too-many-requests':'Muitas tentativas. Aguarde.'};
    erro.textContent=msgs[e.code]||'Erro ao entrar. Tente novamente.';
  }
}
window.fazerLogin=fazerLogin;

function confirmarLogout(){
  if(confirm('Deseja sair do sistema?')) signOut(auth);
}
window.confirmarLogout=confirmarLogout;

// ===== FIRESTORE =====
function userCol(c){ return collection(db,'users',currentUser.uid,c); }
function userDoc(c,id){ return doc(db,'users',currentUser.uid,c,id); }

function iniciarListeners(){
  unsubListeners.forEach(u=>u()); unsubListeners=[];
  const cols=['props','inqs','imoveis','pags','repasses','taxas','fotos','docs'];
  let n=0;
  cols.forEach(c=>{
    const u=onSnapshot(userCol(c),snap=>{
      DB[c]=snap.docs.map(d=>({id:d.id,...d.data()}));
      n++;
      if(n>=cols.length){renderTudo();setSyncIcon('ok');}
      else{renderNavBadges();}
    },()=>setSyncIcon('erro'));
    unsubListeners.push(u);
  });
}

async function fsSet(c,obj){
  setSyncIcon('saving');
  try{await setDoc(userDoc(c,obj.id),obj);setSyncIcon('ok');}
  catch(e){setSyncIcon('erro');showToast('❌ Erro ao salvar. Verifique conexão.');throw e;}
}

async function fsDel(c,id){
  setSyncIcon('saving');
  try{await deleteDoc(userDoc(c,id));setSyncIcon('ok');}
  catch(e){setSyncIcon('erro');showToast('❌ Erro ao excluir.');throw e;}
}

// ===== EXPORTAR =====
function exportarDados(){
  const blob=new Blob([JSON.stringify(DB,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`imobiGest_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(a.href);
  showToast('✅ Backup exportado!');
}
window.exportarDados=exportarDados;

// ===== NAVEGAÇÃO =====
function goPage(id,imovelId){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  const nav=document.getElementById('nav-'+id);
  if(nav)nav.classList.add('active');
  curPage=id;
  if(id==='imoveis')renderImoveis();
  else if(id==='pagamentos')renderPagamentos();
  else if(id==='proprietarios')renderProps();
  else if(id==='inquilinos')renderInqs();
  else if(id==='repasses')renderRepasses();
  else if(id==='dashboard')renderDashboard();
  else if(id==='alertas')renderAlertas();
  else if(id==='detalhe'){curImovelId=imovelId;curDetTab='geral';setDetTabDireto('geral');renderDetalhe();}
  window.scrollTo(0,0);
}
window.goPage=goPage;

// ===== SUB-ABAS DETALHE =====
function setDetTab(el,tab){
  document.querySelectorAll('.sub-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  setDetTabDireto(tab);
}
window.setDetTab=setDetTab;

function setDetTabDireto(tab){
  curDetTab=tab;
  ['geral','taxas','fotos','historico'].forEach(t=>{
    const el=document.getElementById('det-tab-'+t);
    if(el) el.style.display=t===tab?'block':'none';
  });
  document.querySelectorAll('.sub-tab').forEach(btn=>{
    if(btn.getAttribute('onclick')&&btn.getAttribute('onclick').includes("'"+tab+"'")) btn.classList.add('active');
  });
  if(tab==='taxas')renderTaxas();
  else if(tab==='fotos')renderFotos();
  else if(tab==='historico')renderHistorico();
}

// ===== MODAIS =====
function openModal(id){
  const now=new Date();
  if(id==='modal-pag'){
    document.getElementById('mpag-mes').value=now.toISOString().slice(0,7);
    document.getElementById('mpag-data').value=now.toISOString().slice(0,10);
    document.getElementById('mpag-edit-id').value='';
    document.getElementById('mpag-title').textContent='Registrar pagamento';
    populatePagSelect();
  }
  if(id==='modal-imovel'){
    document.getElementById('mi-edit-id').value='';
    document.getElementById('mi-title').textContent='Cadastrar imóvel';
    ['mi-nome','mi-end','mi-obs'].forEach(x=>document.getElementById(x).value='');
    document.getElementById('mi-valor').value='';
    document.getElementById('mi-venc').value='';
    document.getElementById('mi-com').value='10';
    populateSelects();
  }
  if(id==='modal-prop'){
    document.getElementById('mp-edit-id').value='';
    document.getElementById('mp-title').textContent='Cadastrar proprietário';
    ['mp-nome','mp-cpf','mp-tel','mp-email','mp-pix','mp-end','mp-banco','mp-obs'].forEach(x=>document.getElementById(x).value='');
  }
  if(id==='modal-inq'){
    document.getElementById('minq-edit-id').value='';
    document.getElementById('minq-title').textContent='Cadastrar inquilino';
    ['minq-nome','minq-cpf','minq-tel','minq-email','minq-obs','minq-aval-nome','minq-aval-cpf','minq-aval-tel','minq-aval-email','minq-aval-end'].forEach(x=>document.getElementById(x).value='');
    document.getElementById('minq-ini').value='';
    document.getElementById('minq-fim').value='';
  }
  if(id==='modal-rep') document.getElementById('mrep-data').value=now.toISOString().slice(0,10);
  document.getElementById(id).classList.add('open');
}
window.openModal=openModal;

function closeModal(id){ document.getElementById(id).classList.remove('open'); }
window.closeModal=closeModal;

document.querySelectorAll('.modal-overlay').forEach(m=>{
  m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open');});
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape') document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open'));
});

// ===== SELECTS =====
function populateSelects(){
  const ps=document.getElementById('mi-prop');
  const is=document.getElementById('mi-inq');
  ps.innerHTML='<option value="">Selecionar proprietário...</option>';
  is.innerHTML='<option value="">Selecionar inquilino...</option>';
  DB.props.forEach(p=>ps.innerHTML+=`<option value="${p.id}">${p.nome}</option>`);
  DB.inqs.forEach(i=>is.innerHTML+=`<option value="${i.id}">${i.nome}</option>`);
}

function populatePagSelect(){
  const s=document.getElementById('mpag-imovel');
  s.innerHTML='<option value="">Selecionar imóvel...</option>';
  DB.imoveis.forEach(im=>{
    const inq=DB.inqs.find(i=>i.id===im.inqId);
    s.innerHTML+=`<option value="${im.id}">${im.nome}${inq?' — '+inq.nome:''}</option>`;
  });
  if(curImovelId) s.value=curImovelId;
}

// ===== SALVAR =====
async function saveProp(){
  const id=document.getElementById('mp-edit-id').value||uid();
  const obj={id,nome:document.getElementById('mp-nome').value.trim(),cpf:document.getElementById('mp-cpf').value.trim(),tel:document.getElementById('mp-tel').value.trim(),email:document.getElementById('mp-email').value.trim(),pixTipo:document.getElementById('mp-pix-tipo').value,pix:document.getElementById('mp-pix').value.trim(),end:document.getElementById('mp-end').value.trim(),banco:document.getElementById('mp-banco').value.trim(),obs:document.getElementById('mp-obs').value.trim()};
  if(!obj.nome){showToast('⚠️ Informe o nome');return;}
  try{await fsSet('props',obj);closeModal('modal-prop');showToast('✅ Proprietário salvo!');}catch(e){}
}
window.saveProp=saveProp;

async function saveInq(){
  const id=document.getElementById('minq-edit-id').value||uid();
  const obj={id,nome:document.getElementById('minq-nome').value.trim(),cpf:document.getElementById('minq-cpf').value.trim(),tel:document.getElementById('minq-tel').value.trim(),email:document.getElementById('minq-email').value.trim(),ini:document.getElementById('minq-ini').value,fim:document.getElementById('minq-fim').value,obs:document.getElementById('minq-obs').value.trim(),avalNome:document.getElementById('minq-aval-nome').value.trim(),avalCpf:document.getElementById('minq-aval-cpf').value.trim(),avalTel:document.getElementById('minq-aval-tel').value.trim(),avalEmail:document.getElementById('minq-aval-email').value.trim(),avalEnd:document.getElementById('minq-aval-end').value.trim()};
  if(!obj.nome){showToast('⚠️ Informe o nome');return;}
  try{await fsSet('inqs',obj);closeModal('modal-inq');showToast('✅ Inquilino salvo!');}catch(e){}
}
window.saveInq=saveInq;

async function saveImovel(){
  const id=document.getElementById('mi-edit-id').value||uid();
  const obj={id,nome:document.getElementById('mi-nome').value.trim(),end:document.getElementById('mi-end').value.trim(),valor:parseFloat(document.getElementById('mi-valor').value)||0,venc:parseInt(document.getElementById('mi-venc').value)||10,propId:document.getElementById('mi-prop').value,inqId:document.getElementById('mi-inq').value,comissao:parseFloat(document.getElementById('mi-com').value)||10,obs:document.getElementById('mi-obs').value.trim()};
  if(!obj.nome){showToast('⚠️ Informe o nome do imóvel');return;}
  if(!obj.valor){showToast('⚠️ Informe o valor do aluguel');return;}
  try{await fsSet('imoveis',obj);closeModal('modal-imovel');showToast('✅ Imóvel salvo!');}catch(e){}
}
window.saveImovel=saveImovel;

async function savePag(){
  const id=document.getElementById('mpag-edit-id').value||uid();
  const imovelId=document.getElementById('mpag-imovel').value;
  if(!imovelId){showToast('⚠️ Selecione o imóvel');return;}
  const mes=document.getElementById('mpag-mes').value;
  if(!mes){showToast('⚠️ Informe o mês');return;}
  const obj={id,imovelId,mes,data:document.getElementById('mpag-data').value,valor:parseFloat(document.getElementById('mpag-valor').value)||0,status:document.getElementById('mpag-status').value,obs:document.getElementById('mpag-obs').value.trim()};
  try{await fsSet('pags',obj);closeModal('modal-pag');showToast('✅ Pagamento registrado!');}catch(e){}
}
window.savePag=savePag;

async function saveRepasse(){
  const imovelId=document.getElementById('mrep-imovel-id').value;
  const mes=document.getElementById('mrep-mes').value;
  const id=imovelId+'_'+mes;
  const obj={id,imovelId,mes,data:document.getElementById('mrep-data').value,valor:parseFloat(document.getElementById('mrep-valor').value)||0,obs:document.getElementById('mrep-obs').value.trim()};
  try{await fsSet('repasses',obj);closeModal('modal-rep');showToast('✅ Repasse confirmado!');}catch(e){}
}
window.saveRepasse=saveRepasse;

// ===== TAXAS =====
function openModalTaxa(editId){
  document.getElementById('mtaxa-imovel-id').value=curImovelId;
  if(editId){
    const t=DB.taxas.find(x=>x.id===editId); if(!t)return;
    document.getElementById('mtaxa-edit-id').value=t.id;
    document.getElementById('mtaxa-title').textContent='Editar taxa';
    document.getElementById('mtaxa-tipo').value=t.tipo;
    document.getElementById('mtaxa-outro').value=t.tipoOutro||'';
    document.getElementById('mtaxa-resp').value=t.resp||'Inquilino';
    document.getElementById('mtaxa-valor').value=t.valor||'';
    document.getElementById('mtaxa-periodo').value=t.periodo||'Mensal';
    document.getElementById('mtaxa-venc').value=t.venc||'';
    document.getElementById('mtaxa-obs').value=t.obs||'';
  } else {
    document.getElementById('mtaxa-edit-id').value='';
    document.getElementById('mtaxa-title').textContent='Adicionar taxa';
    ['mtaxa-outro','mtaxa-valor','mtaxa-venc','mtaxa-obs'].forEach(x=>document.getElementById(x).value='');
    document.getElementById('mtaxa-tipo').value='IPTU';
    document.getElementById('mtaxa-resp').value='Inquilino';
    document.getElementById('mtaxa-periodo').value='Mensal';
  }
  document.getElementById('mtaxa-outro-wrap').style.display=document.getElementById('mtaxa-tipo').value==='Outra'?'block':'none';
  document.getElementById('modal-taxa').classList.add('open');
}
window.openModalTaxa=openModalTaxa;

document.addEventListener('DOMContentLoaded',()=>{
  const tipoSel=document.getElementById('mtaxa-tipo');
  if(tipoSel) tipoSel.addEventListener('change',()=>{
    document.getElementById('mtaxa-outro-wrap').style.display=tipoSel.value==='Outra'?'block':'none';
  });
});

async function saveTaxa(){
  const id=document.getElementById('mtaxa-edit-id').value||uid();
  const tipo=document.getElementById('mtaxa-tipo').value;
  const obj={id,imovelId:document.getElementById('mtaxa-imovel-id').value,tipo,tipoOutro:tipo==='Outra'?document.getElementById('mtaxa-outro').value.trim():'',resp:document.getElementById('mtaxa-resp').value,valor:parseFloat(document.getElementById('mtaxa-valor').value)||0,periodo:document.getElementById('mtaxa-periodo').value,venc:document.getElementById('mtaxa-venc').value.trim(),obs:document.getElementById('mtaxa-obs').value.trim()};
  if(!obj.imovelId){showToast('⚠️ Erro: imóvel não identificado');return;}
  try{await fsSet('taxas',obj);closeModal('modal-taxa');renderTaxas();showToast('✅ Taxa salva!');}catch(e){}
}
window.saveTaxa=saveTaxa;

async function delTaxa(id){
  if(!confirm('Excluir esta taxa?'))return;
  try{await fsDel('taxas',id);renderTaxas();showToast('Taxa removida');}catch(e){}
}
window.delTaxa=delTaxa;

function renderTaxas(){
  const tbody=document.getElementById('det-taxas-tbody');
  if(!tbody)return;
  const taxas=DB.taxas.filter(t=>t.imovelId===curImovelId);
  if(!taxas.length){tbody.innerHTML=`<tr><td colspan="5"><div class="empty-state" style="padding:24px"><i class="ti ti-receipt-tax"></i><p>Nenhuma taxa cadastrada</p><span>Clique em "Adicionar taxa" para começar</span></div></td></tr>`;return;}
  tbody.innerHTML=taxas.map(t=>`<tr>
    <td><strong>${t.tipo==='Outra'?t.tipoOutro:t.tipo}</strong></td>
    <td>${t.resp||'—'}</td>
    <td style="font-weight:600;color:var(--accent)">${t.valor?fmt(t.valor):'—'}</td>
    <td style="font-size:12px">${t.periodo||'—'}${t.venc?' · dia/mês: '+t.venc:''}</td>
    <td><div class="acts">
      <button class="btn btn-sm" onclick="openModalTaxa('${t.id}')"><i class="ti ti-edit"></i> Editar</button>
      <button class="btn btn-sm btn-danger" onclick="delTaxa('${t.id}')"><i class="ti ti-trash"></i> Excluir</button>
    </div></td>
  </tr>`).join('');
}

// ===== FOTOS / VISTORIAS =====
function openModalFoto(){
  document.getElementById('mfoto-imovel-id').value=curImovelId;
  document.getElementById('mfoto-tipo').value='Vistoria periódica';
  document.getElementById('mfoto-data').value=new Date().toISOString().slice(0,10);
  document.getElementById('mfoto-desc').value='';
  document.getElementById('foto-preview-area').style.display='none';
  document.getElementById('foto-upload-progress').style.display='none';
  fotoFileBase64=null;
  document.getElementById('foto-file-input').value='';
  document.getElementById('modal-foto').classList.add('open');
}
window.openModalFoto=openModalFoto;

function previewFoto(event){
  const file=event.target.files[0]; if(!file)return;
  if(file.size>5*1024*1024){showToast('⚠️ Arquivo maior que 5MB');return;}
  const reader=new FileReader();
  reader.onload=e=>{
    fotoFileBase64=e.target.result;
    document.getElementById('foto-preview-img').src=fotoFileBase64;
    document.getElementById('foto-preview-area').style.display='block';
  };
  reader.readAsDataURL(file);
}
window.previewFoto=previewFoto;

async function salvarFoto(){
  const imovelId=document.getElementById('mfoto-imovel-id').value;
  const tipo=document.getElementById('mfoto-tipo').value;
  const data=document.getElementById('mfoto-data').value;
  const desc=document.getElementById('mfoto-desc').value.trim();
  if(!imovelId){showToast('⚠️ Erro: imóvel não identificado');return;}

  // Comprimir imagem se existir
  let fotoBase64='';
  if(fotoFileBase64){
    try{
      fotoBase64=await comprimirImagem(fotoFileBase64,800,0.7);
      // Verificar tamanho (~1MB limite Firestore por campo)
      if(fotoBase64.length>1_300_000){
        fotoBase64=await comprimirImagem(fotoFileBase64,600,0.5);
      }
      if(fotoBase64.length>1_300_000){
        showToast('⚠️ Imagem muito grande mesmo comprimida. Use uma foto menor.');
        return;
      }
    }catch(e){showToast('❌ Erro ao processar imagem');return;}
  }

  const id=uid();
  const obj={id,imovelId,tipo,data,desc,fotoBase64,criadoEm:new Date().toISOString()};
  try{await fsSet('fotos',obj);closeModal('modal-foto');renderFotos();showToast('✅ Registro salvo!');}catch(e){}
}
window.salvarFoto=salvarFoto;

// Comprime imagem via canvas
function comprimirImagem(base64,maxWidth,quality){
  return new Promise((res,rej)=>{
    const img=new Image();
    img.onload=()=>{
      const canvas=document.createElement('canvas');
      let w=img.width,h=img.height;
      if(w>maxWidth){h=Math.round(h*maxWidth/w);w=maxWidth;}
      canvas.width=w;canvas.height=h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      res(canvas.toDataURL('image/jpeg',quality));
    };
    img.onerror=rej;
    img.src=base64;
  });
}

async function delFoto(id){
  if(!confirm('Excluir este registro?'))return;
  try{await fsDel('fotos',id);renderFotos();showToast('Registro removido');}catch(e){}
}
window.delFoto=delFoto;

function renderFotos(){
  const grid=document.getElementById('det-fotos-grid');
  if(!grid)return;
  const fotos=DB.fotos.filter(f=>f.imovelId===curImovelId).sort((a,b)=>b.data.localeCompare(a.data));
  if(!fotos.length){grid.innerHTML=`<div style="grid-column:1/-1"><div class="empty-state" style="padding:32px"><i class="ti ti-camera"></i><p>Nenhuma foto ou vistoria</p><span>Clique em "Adicionar" para registrar</span></div></div>`;return;}
  grid.innerHTML=fotos.map(f=>`
    <div class="foto-card">
      ${f.fotoBase64?`<img src="${f.fotoBase64}" alt="Foto" loading="lazy">`:`<div style="height:120px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:36px;color:var(--border2)"><i class="ti ti-camera"></i></div>`}
      <div class="foto-card-body">
        <div class="foto-card-tipo">${f.tipo}</div>
        <div class="foto-card-data"><i class="ti ti-calendar" style="font-size:11px"></i> ${f.data?f.data.split('-').reverse().join('/'):'—'}</div>
        <div class="foto-card-desc">${f.desc||'Sem descrição'}</div>
        <div style="margin-top:8px;display:flex;gap:6px">
          ${f.fotoBase64?`<a href="${f.fotoBase64}" download="vistoria.jpg" class="btn btn-sm" style="font-size:11px"><i class="ti ti-download"></i>Baixar</a>`:''}
          <button class="btn btn-sm btn-danger" style="font-size:11px" onclick="delFoto('${f.id}')"><i class="ti ti-trash"></i></button>
        </div>
      </div>
    </div>`).join('');
}

// ===== DOCUMENTOS DO INQUILINO =====
function abrirDocs(inqId){
  const inq=DB.inqs.find(i=>i.id===inqId); if(!inq)return;
  document.getElementById('mdocs-inq-id').value=inqId;
  document.getElementById('mdocs-title').textContent=`Documentos — ${inq.nome}`;
  document.getElementById('doc-file-input').value='';
  document.getElementById('doc-upload-progress').style.display='none';
  renderDocsList(inqId);
  document.getElementById('modal-docs').classList.add('open');
}
window.abrirDocs=abrirDocs;

function renderDocsList(inqId){
  const lista=document.getElementById('mdocs-lista');
  const docs=DB.docs.filter(d=>d.inqId===inqId).sort((a,b)=>b.criadoEm.localeCompare(a.criadoEm));
  if(!docs.length){lista.innerHTML=`<div style="text-align:center;padding:20px;color:var(--text2);font-size:13px"><i class="ti ti-file-off" style="font-size:28px;display:block;margin-bottom:8px;color:var(--border2)"></i>Nenhum documento ainda</div>`;return;}
  lista.innerHTML=docs.map(d=>`
    <div class="doc-item">
      <div class="doc-icon"><i class="ti ti-file-description"></i></div>
      <div style="flex:1;min-width:0">
        <div class="doc-nome">${d.nome}</div>
        <div class="doc-data">Enviado em ${d.criadoEm?d.criadoEm.slice(0,10).split('-').reverse().join('/'):'—'}</div>
      </div>
      <div style="display:flex;gap:6px">
        <a href="${d.base64||d.url||'#'}" download="${d.nome}" class="btn btn-sm"><i class="ti ti-download"></i>Baixar</a>
        <button class="btn btn-sm btn-danger" onclick="delDoc('${d.id}')"><i class="ti ti-trash"></i></button>
      </div>
    </div>`).join('');
}

async function uploadDocumento(event){
  const file=event.target.files[0]; if(!file)return;
  if(file.size>900*1024){showToast('⚠️ Arquivo maior que 900KB. Comprima o PDF antes de enviar.');event.target.value='';return;}
  const inqId=document.getElementById('mdocs-inq-id').value;
  const progArea=document.getElementById('doc-upload-progress');
  const progFill=document.getElementById('doc-prog-fill');
  const progTxt=document.getElementById('doc-progress-txt');
  progArea.style.display='block';
  progTxt.textContent='Salvando '+file.name+'...';
  progFill.style.width='30%';
  const id=uid();
  try{
    const base64=await new Promise((res,rej)=>{
      const reader=new FileReader();
      reader.onload=e=>res(e.target.result);
      reader.onerror=rej;
      reader.readAsDataURL(file);
    });
    progFill.style.width='70%';
    const obj={id,inqId,nome:file.name,base64,criadoEm:new Date().toISOString()};
    await fsSet('docs',obj);
    progFill.style.width='100%';
    setTimeout(()=>{progArea.style.display='none';},400);
    renderDocsList(inqId);
    showToast('✅ Documento salvo!');
  }catch(e){progArea.style.display='none';showToast('❌ Erro ao salvar documento. Tente um arquivo menor.');}
  event.target.value='';
}
window.uploadDocumento=uploadDocumento;

async function delDoc(id){
  if(!confirm('Excluir este documento?'))return;
  try{
    await fsDel('docs',id);
    renderDocsList(document.getElementById('mdocs-inq-id').value);
    showToast('Documento removido');
  }catch(e){}
}
window.delDoc=delDoc;

// ===== ALERTAS =====
function calcularAlertas(){
  const hoje=new Date(); hoje.setHours(0,0,0,0);
  const alertas=[];
  DB.inqs.forEach(inq=>{
    if(!inq.fim)return;
    const fim=new Date(inq.fim+'T00:00:00');
    const dias=Math.round((fim-hoje)/(1000*60*60*24));
    const im=DB.imoveis.find(x=>x.inqId===inq.id);
    if(dias<0){
      alertas.push({tipo:'critico',icone:'ti-alert-circle',titulo:'Contrato vencido',subtitulo:`${inq.nome}${im?' — '+im.nome:''}`,detalhe:`Venceu em ${inq.fim.split('-').reverse().join('/')}. Regularize ou renove o contrato.`,inqId:inq.id,inqNome:inq.nome,inqTel:inq.tel,dias});
    } else if(dias<=30){
      alertas.push({tipo:'critico',icone:'ti-clock-exclamation',titulo:'Contrato vence em '+dias+' dia'+(dias!==1?'s':''),subtitulo:`${inq.nome}${im?' — '+im.nome:''}`,detalhe:`Vencimento: ${inq.fim.split('-').reverse().join('/')}. Entre em contato para verificar renovação.`,inqId:inq.id,inqNome:inq.nome,inqTel:inq.tel,dias});
    } else if(dias<=60){
      alertas.push({tipo:'atencao',icone:'ti-clock',titulo:'Contrato vence em '+dias+' dias',subtitulo:`${inq.nome}${im?' — '+im.nome:''}`,detalhe:`Vencimento: ${inq.fim.split('-').reverse().join('/')}. Atenção: 2 meses para o vencimento.`,inqId:inq.id,inqNome:inq.nome,inqTel:inq.tel,dias});
    }
  });
  return alertas.sort((a,b)=>a.dias-b.dias);
}

function renderAlertas(){
  const alertas=calcularAlertas();
  document.getElementById('alertas-sub').textContent=alertas.length?`${alertas.length} alerta(s) ativo(s)`:'Nenhum alerta no momento';
  const lista=document.getElementById('alertas-lista');
  if(!alertas.length){
    lista.innerHTML=`<div class="empty-state"><i class="ti ti-bell-check"></i><p>Nenhum alerta no momento</p><span>Todos os contratos estão em dia. Os alertas aparecem 60 dias antes do vencimento.</span></div>`;
    return;
  }
  lista.innerHTML=alertas.map(a=>`
    <div class="alerta-card ${a.tipo}">
      <div style="display:flex;align-items:flex-start;gap:14px;flex:1">
        <div class="alerta-icon ${a.tipo}"><i class="ti ${a.icone}"></i></div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:14px;margin-bottom:2px">${a.titulo}</div>
          <div style="font-size:12.5px;color:var(--text2);margin-bottom:4px">${a.subtitulo}</div>
          <div style="font-size:12px;color:var(--text3)">${a.detalhe}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
        <button class="btn btn-sm whats-btn" onclick="whatsRenovacao('${a.inqId}')"><i class="ti ti-brand-whatsapp"></i>Avisar</button>
      </div>
    </div>`).join('');
}

// ===== DELETAR =====
async function delImovel(id){
  if(!confirm('Excluir este imóvel? Pagamentos, taxas e fotos relacionados também serão removidos.'))return;
  const pags=DB.pags.filter(p=>p.imovelId===id);
  const reps=DB.repasses.filter(r=>r.imovelId===id);
  const taxas=DB.taxas.filter(t=>t.imovelId===id);
  const fotos=DB.fotos.filter(f=>f.imovelId===id);
  try{
    await fsDel('imoveis',id);
    for(const p of pags) await fsDel('pags',p.id);
    for(const r of reps) await fsDel('repasses',r.id);
    for(const t of taxas) await fsDel('taxas',t.id);
    for(const f of fotos) await fsDel('fotos',f.id);
    showToast('Imóvel removido');
  }catch(e){}
}
window.delImovel=delImovel;

async function delProp(id){
  if(!confirm('Excluir este proprietário?'))return;
  try{await fsDel('props',id);showToast('Proprietário removido');}catch(e){}
}
window.delProp=delProp;

async function delInq(id){
  if(!confirm('Excluir este inquilino? Documentos também serão removidos.'))return;
  const docs=DB.docs.filter(d=>d.inqId===id);
  try{
    await fsDel('inqs',id);
    for(const d of docs) await fsDel('docs',d.id);
    showToast('Inquilino removido');
  }catch(e){}
}
window.delInq=delInq;

async function delPag(id){
  if(!confirm('Excluir este pagamento?'))return;
  try{await fsDel('pags',id);showToast('Pagamento removido');}catch(e){}
}
window.delPag=delPag;

// ===== EDITAR =====
function editProp(id){
  const p=DB.props.find(x=>x.id===id);if(!p)return;
  document.getElementById('mp-edit-id').value=p.id;
  document.getElementById('mp-title').textContent='Editar proprietário';
  ['nome','cpf','tel','email','pix','end','banco','obs'].forEach(f=>document.getElementById('mp-'+f).value=p[f]||'');
  document.getElementById('mp-pix-tipo').value=p.pixTipo||'email';
  document.getElementById('modal-prop').classList.add('open');
}
window.editProp=editProp;

function editInq(id){
  const i=DB.inqs.find(x=>x.id===id);if(!i)return;
  document.getElementById('minq-edit-id').value=i.id;
  document.getElementById('minq-title').textContent='Editar inquilino';
  ['nome','cpf','tel','email','obs'].forEach(f=>document.getElementById('minq-'+f).value=i[f]||'');
  document.getElementById('minq-aval-nome').value=i.avalNome||'';
  document.getElementById('minq-aval-cpf').value=i.avalCpf||'';
  document.getElementById('minq-aval-tel').value=i.avalTel||'';
  document.getElementById('minq-aval-email').value=i.avalEmail||'';
  document.getElementById('minq-aval-end').value=i.avalEnd||'';
  document.getElementById('minq-ini').value=i.ini||'';
  document.getElementById('minq-fim').value=i.fim||'';
  document.getElementById('modal-inq').classList.add('open');
}
window.editInq=editInq;

function editImovel(id){
  const im=DB.imoveis.find(x=>x.id===id);if(!im)return;
  document.getElementById('mi-edit-id').value=im.id;
  document.getElementById('mi-title').textContent='Editar imóvel';
  document.getElementById('mi-nome').value=im.nome||'';
  document.getElementById('mi-end').value=im.end||'';
  document.getElementById('mi-valor').value=im.valor||'';
  document.getElementById('mi-venc').value=im.venc||'';
  document.getElementById('mi-com').value=im.comissao||10;
  document.getElementById('mi-obs').value=im.obs||'';
  populateSelects();
  document.getElementById('mi-prop').value=im.propId||'';
  document.getElementById('mi-inq').value=im.inqId||'';
  document.getElementById('modal-imovel').classList.add('open');
}
window.editImovel=editImovel;

function editPag(id){
  const p=DB.pags.find(x=>x.id===id);if(!p)return;
  document.getElementById('mpag-edit-id').value=p.id;
  document.getElementById('mpag-title').textContent='Editar pagamento';
  populatePagSelect();
  document.getElementById('mpag-imovel').value=p.imovelId||'';
  document.getElementById('mpag-mes').value=p.mes||'';
  document.getElementById('mpag-data').value=p.data||'';
  document.getElementById('mpag-valor').value=p.valor||'';
  document.getElementById('mpag-status').value=p.status||'pago';
  document.getElementById('mpag-obs').value=p.obs||'';
  document.getElementById('modal-pag').classList.add('open');
}
window.editPag=editPag;

// ===== STATUS =====
function getImovelStatus(im){
  const now=new Date();
  const mes=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const pag=DB.pags.find(p=>p.imovelId===im.id&&p.mes===mes);
  return pag?pag.status:'pendente';
}

function badgeHtml(s){
  if(s==='pago')return '<span class="badge badge-ok"><i class="ti ti-check"></i>Pago</span>';
  if(s==='atrasado')return '<span class="badge badge-late"><i class="ti ti-alert-circle"></i>Atrasado</span>';
  return '<span class="badge badge-pend"><i class="ti ti-clock"></i>Pendente</span>';
}

// ===== CHIPS =====
function setChip(el,group,val){
  document.querySelectorAll(`#chips-${group} .chip`).forEach(c=>c.classList.remove('active'));
  el.classList.add('active');chipFilter[group]=val;
  if(group==='imoveis')renderImoveis();
  else if(group==='pag')renderPagamentos();
}
window.setChip=setChip;

// ===== RENDER IMÓVEIS =====
function renderImoveis(){
  const q=(document.getElementById('search-imoveis').value||'').toLowerCase();
  const f=chipFilter.imoveis;
  const list=DB.imoveis.filter(im=>{
    const status=getImovelStatus(im);
    const inq=DB.inqs.find(i=>i.id===im.inqId);
    const prop=DB.props.find(p=>p.id===im.propId);
    const match=!q||(im.nome+im.end+(inq?inq.nome:'')+(prop?prop.nome:'')).toLowerCase().includes(q);
    return match&&(f==='todos'||status===f);
  });
  document.getElementById('imoveis-sub').textContent=`${DB.imoveis.length} imóvel(is) cadastrado(s)`;
  const tbody=document.getElementById('imoveis-tbody');
  if(!list.length){tbody.innerHTML=`<tr><td colspan="7"><div class="empty-state"><i class="ti ti-building-estate"></i><p>${DB.imoveis.length?'Nenhum resultado':'Nenhum imóvel cadastrado'}</p><span>${DB.imoveis.length?'Tente outro filtro':'Clique em "Cadastrar" para começar'}</span></div></td></tr>`;return;}
  const now=new Date();
  const mes=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  tbody.innerHTML=list.map(im=>{
    const inq=DB.inqs.find(i=>i.id===im.inqId);
    const prop=DB.props.find(p=>p.id===im.propId);
    const status=getImovelStatus(im);
    return `<tr>
      <td><strong class="link-text" onclick="goPage('detalhe','${im.id}')">${im.nome||'—'}</strong></td>
      <td>${inq?inq.nome:'<span style="color:var(--text3)">—</span>'}</td>
      <td>${prop?prop.nome:'<span style="color:var(--text3)">—</span>'}</td>
      <td style="font-weight:600;color:var(--accent)">${fmtShort(im.valor)}</td>
      <td>Dia ${im.venc||'—'}</td>
      <td>${badgeHtml(status)}</td>
      <td><div class="acts">
        <button class="btn btn-sm" title="Ver detalhes" onclick="goPage('detalhe','${im.id}')"><i class="ti ti-eye"></i> Ver</button>
        <button class="btn btn-sm" title="Editar" onclick="editImovel('${im.id}')"><i class="ti ti-edit"></i> Editar</button>
        ${status!=='pago'
          ?`<button class="btn btn-sm whats-btn" title="Cobrar via WhatsApp" onclick="whatsCobrancaInquilino('${im.id}','${mes}')"><i class="ti ti-brand-whatsapp"></i></button>`
          :`<button class="btn btn-sm whats-btn" title="Confirmar recebimento" onclick="whatsConfirmacaoInquilino('${im.id}','${mes}')"><i class="ti ti-brand-whatsapp"></i></button>`}
        <button class="btn btn-sm btn-danger" title="Excluir" onclick="delImovel('${im.id}')"><i class="ti ti-trash"></i> Excluir</button>
      </div></td>
    </tr>`;
  }).join('');
}

// ===== RENDER PROPS =====
function renderProps(){
  const q=(document.getElementById('search-prop').value||'').toLowerCase();
  const list=DB.props.filter(p=>!q||(p.nome+p.pix+p.tel+p.email).toLowerCase().includes(q));
  document.getElementById('prop-sub').textContent=`${DB.props.length} proprietário(s)`;
  const tbody=document.getElementById('prop-tbody');
  if(!list.length){tbody.innerHTML=`<tr><td colspan="5"><div class="empty-state"><i class="ti ti-user-circle"></i><p>${DB.props.length?'Nenhum resultado':'Nenhum proprietário'}</p><span>${DB.props.length?'Tente outro filtro':'Clique em "Cadastrar" para começar'}</span></div></td></tr>`;return;}
  tbody.innerHTML=list.map(p=>`<tr>
    <td><div style="display:flex;align-items:center;gap:9px"><div class="av-sm" style="background:${avColor(p.nome)};color:#fff">${initials(p.nome)}</div><strong>${p.nome}</strong></div></td>
    <td><div style="display:flex;align-items:center;gap:6px"><span style="font-size:12px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;max-width:150px">${p.pix||'—'}</span>${p.pix?`<button class="btn btn-sm" style="padding:2px 7px;flex-shrink:0" onclick="copiarPix('${p.pix}')"><i class="ti ti-copy"></i></button>`:''}</div></td>
    <td>${p.tel||'—'}</td>
    <td style="font-size:12px">${p.email||'—'}</td>
    <td><div class="acts">
      <button class="btn btn-sm whats-btn" onclick="whatsPersonalizado('${p.nome}','${p.tel}')"><i class="ti ti-brand-whatsapp"></i></button>
      <button class="btn btn-sm" onclick="editProp('${p.id}')"><i class="ti ti-edit"></i> Editar</button>
      <button class="btn btn-sm btn-danger" onclick="delProp('${p.id}')"><i class="ti ti-trash"></i> Excluir</button>
    </div></td>
  </tr>`).join('');
}

// ===== RENDER INQUILINOS =====
function renderInqs(){
  const q=(document.getElementById('search-inq').value||'').toLowerCase();
  const list=DB.inqs.filter(i=>!q||(i.nome+i.tel+i.email).toLowerCase().includes(q));
  document.getElementById('inq-sub').textContent=`${DB.inqs.length} inquilino(s)`;
  const tbody=document.getElementById('inq-tbody');
  if(!list.length){tbody.innerHTML=`<tr><td colspan="6"><div class="empty-state"><i class="ti ti-users"></i><p>${DB.inqs.length?'Nenhum resultado':'Nenhum inquilino'}</p><span>${DB.inqs.length?'Tente outro filtro':'Clique em "Cadastrar" para começar'}</span></div></td></tr>`;return;}
  const hoje=new Date();hoje.setHours(0,0,0,0);
  tbody.innerHTML=list.map(i=>{
    const im=DB.imoveis.find(x=>x.inqId===i.id);
    const contrato=i.ini&&i.fim?i.ini.slice(0,7)+' → '+i.fim.slice(0,7):'—';
    const ndocs=DB.docs.filter(d=>d.inqId===i.id).length;
    let contratoStatus='';
    if(i.fim){
      const fim=new Date(i.fim+'T00:00:00');
      const dias=Math.round((fim-hoje)/(1000*60*60*24));
      if(dias<0) contratoStatus='<span class="badge badge-late" style="font-size:10px">Vencido</span>';
      else if(dias<=30) contratoStatus='<span class="badge badge-late" style="font-size:10px">'+dias+'d</span>';
      else if(dias<=60) contratoStatus='<span class="badge badge-pend" style="font-size:10px">'+dias+'d</span>';
    }
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:9px"><div class="av-sm" style="background:${avColor(i.nome)};color:#fff">${initials(i.nome)}</div><strong>${i.nome}</strong></div></td>
      <td>${im?`<span class="link-text" onclick="goPage('detalhe','${im.id}')">${im.nome}</span>`:'<span style="color:var(--text3)">Sem vínculo</span>'}</td>
      <td>${i.tel||'—'}</td>
      <td style="font-size:12px">${contrato} ${contratoStatus}</td>
      <td><button class="btn btn-sm" onclick="abrirDocs('${i.id}')"><i class="ti ti-files"></i>${ndocs>0?` (${ndocs})`:''}</button></td>
      <td><div class="acts">
        ${im?`<button class="btn btn-sm whats-btn" onclick="whatsCobrancaInquilino('${im.id}',null)"><i class="ti ti-brand-whatsapp"></i></button>`:`<button class="btn btn-sm whats-btn" onclick="whatsPersonalizado('${i.nome}','${i.tel}')"><i class="ti ti-brand-whatsapp"></i></button>`}
        <button class="btn btn-sm" onclick="editInq('${i.id}')"><i class="ti ti-edit"></i> Editar</button>
        <button class="btn btn-sm btn-danger" onclick="delInq('${i.id}')"><i class="ti ti-trash"></i> Excluir</button>
      </div></td>
    </tr>`;
  }).join('');
}

// ===== RENDER PAGAMENTOS =====
function renderPagamentos(){
  const now=new Date();
  if(!curPagMonth) curPagMonth={y:now.getFullYear(),m:now.getMonth()};
  const mesStr=`${curPagMonth.y}-${String(curPagMonth.m+1).padStart(2,'0')}`;
  document.getElementById('pag-month-lbl').textContent=`${MONTHS[curPagMonth.m]} ${curPagMonth.y}`;
  const f=chipFilter.pag;
  const lista=DB.imoveis.map(im=>{
    const pag=DB.pags.find(p=>p.imovelId===im.id&&p.mes===mesStr);
    const inq=DB.inqs.find(i=>i.id===im.inqId);
    const status=pag?pag.status:'pendente';
    return{im,pag,inq,status};
  }).filter(x=>f==='todos'||x.status===f);
  const total=DB.pags.filter(p=>p.mes===mesStr&&p.status==='pago').reduce((s,p)=>s+p.valor,0);
  const pagos=lista.filter(x=>x.status==='pago').length;
  const pend=lista.filter(x=>x.status==='pendente').length;
  document.getElementById('pag-sub').textContent=`${MONTHS[curPagMonth.m]} ${curPagMonth.y} · ${pagos} pagos · ${pend} pendentes · ${fmtShort(total)} recebido`;
  const tbody=document.getElementById('pag-tbody');
  if(!lista.length){tbody.innerHTML=`<tr><td colspan="6"><div class="empty-state"><i class="ti ti-receipt"></i><p>Nenhum registro</p><span>${DB.imoveis.length?'Nenhum pagamento neste período':'Cadastre imóveis para começar'}</span></div></td></tr>`;return;}
  tbody.innerHTML=lista.map(({im,pag,inq,status})=>`<tr>
    <td><strong class="link-text" onclick="goPage('detalhe','${im.id}')">${im.nome}</strong></td>
    <td>${inq?inq.nome:'—'}</td>
    <td style="font-weight:600">${pag?fmtShort(pag.valor):fmtShort(im.valor)}</td>
    <td style="font-size:12px;color:var(--text2)">${pag&&pag.data?pag.data.split('-').reverse().join('/'):'—'}</td>
    <td>${badgeHtml(status)}</td>
    <td><div class="acts">
      ${status==='pago'
        ?`<button class="btn btn-sm whats-btn" onclick="whatsConfirmacaoInquilino('${im.id}','${mesStr}')"><i class="ti ti-brand-whatsapp"></i></button>
           <button class="btn btn-sm" onclick="editPag('${pag.id}')"><i class="ti ti-edit"></i></button>
           <button class="btn btn-sm btn-danger" onclick="delPag('${pag.id}')"><i class="ti ti-trash"></i></button>`
        :`<button class="btn btn-sm whats-btn" onclick="whatsCobrancaInquilino('${im.id}','${mesStr}')"><i class="ti ti-brand-whatsapp"></i></button>
           <button class="btn btn-primary btn-sm" onclick="curImovelId='${im.id}';openModal('modal-pag')"><i class="ti ti-plus"></i>Registrar</button>`}
    </div></td>
  </tr>`).join('');
}

function changeMonth(dir){
  if(!curPagMonth){const n=new Date();curPagMonth={y:n.getFullYear(),m:n.getMonth()};}
  curPagMonth.m+=dir;
  if(curPagMonth.m>11){curPagMonth.m=0;curPagMonth.y++;}
  if(curPagMonth.m<0){curPagMonth.m=11;curPagMonth.y--;}
  renderPagamentos();
}
window.changeMonth=changeMonth;

// ===== RENDER REPASSES =====
function renderRepasses(){
  const now=new Date();
  if(!curRepMonth) curRepMonth={y:now.getFullYear(),m:now.getMonth()};
  const mesStr=`${curRepMonth.y}-${String(curRepMonth.m+1).padStart(2,'0')}`;
  document.getElementById('rep-month-lbl').textContent=`${MONTHS[curRepMonth.m]} ${curRepMonth.y}`;
  document.getElementById('rep-banner-title').textContent=`Repasse de ${MONTHS[curRepMonth.m]} ${curRepMonth.y}`;
  let totalLiq=0;let repassados=0;
  const rows=DB.imoveis.map(im=>{
    const prop=DB.props.find(p=>p.id===im.propId);
    const pag=DB.pags.find(p=>p.imovelId===im.id&&p.mes===mesStr&&p.status==='pago');
    if(!pag)return null;
    const com=(im.comissao||10)/100*pag.valor;
    const liq=pag.valor-com;
    totalLiq+=liq;
    const rep=DB.repasses.find(r=>r.imovelId===im.id&&r.mes===mesStr);
    if(rep)repassados++;
    return{im,prop,pag,com,liq,rep};
  }).filter(Boolean);
  document.getElementById('rep-total').textContent=fmtShort(totalLiq);
  document.getElementById('rep-sub').textContent=`Dia 15 · ${rows.length} prop. com pagamento confirmado · ${repassados} repassados`;
  document.getElementById('rep-banner-sub').textContent=`${rows.length} proprietário(s) · ${repassados} já repassados`;
  const tbody=document.getElementById('rep-tbody');
  if(!rows.length){tbody.innerHTML=`<tr><td colspan="6"><div class="empty-state"><i class="ti ti-send"></i><p>Nenhum pagamento confirmado</p><span>Os repasses aparecem quando pagamentos são marcados como "Pago"</span></div></td></tr>`;return;}
  tbody.innerHTML=rows.map(({im,prop,pag,com,liq,rep})=>`<tr>
    <td><div style="display:flex;align-items:center;gap:8px">
      <div class="av-sm" style="background:${avColor(prop?prop.nome:im.nome)};color:#fff;font-size:10px">${initials(prop?prop.nome:im.nome)}</div>
      <div><div style="font-size:13px;font-weight:600">${prop?prop.nome:'Sem proprietário'}</div>${prop&&prop.pix?`<div style="font-size:10px;color:var(--text3)">${prop.pix}</div>`:''}</div>
    </div></td>
    <td style="font-size:12px">${im.nome}</td>
    <td>${fmtShort(pag.valor)}</td>
    <td style="color:var(--text2);font-size:12px">- ${fmtShort(com)}</td>
    <td style="font-weight:600;color:var(--accent)">${fmtShort(liq)}</td>
    <td><div style="display:flex;flex-direction:column;gap:5px">
      ${rep
        ?`<span class="badge badge-ok"><i class="ti ti-check"></i>Repassado em ${rep.data?rep.data.split('-').reverse().join('/'):'—'}</span>
           <button class="btn btn-sm whats-btn" style="font-size:11px" onclick="whatsRepasseProprietario('${im.id}','${mesStr}')"><i class="ti ti-brand-whatsapp"></i>Avisar</button>`
        :`${prop&&prop.pix?`<button class="btn btn-sm" style="font-size:11px" onclick="copiarPix('${prop.pix}')"><i class="ti ti-copy"></i>Copiar PIX</button>`:''}
          <button class="btn btn-sm whats-btn" style="font-size:11px" onclick="whatsAtrasoProprietario('${im.id}')"><i class="ti ti-brand-whatsapp"></i>Avisar atraso</button>
          <button class="btn btn-primary btn-sm" style="font-size:11px" onclick="openRepModal('${im.id}','${mesStr}','${prop?prop.nome:''}','${prop?prop.pix:''}','${liq}')"><i class="ti ti-check"></i>Marcar repassado</button>`}
    </div></td>
  </tr>`).join('');
}

function changeRepMonth(dir){
  if(!curRepMonth){const n=new Date();curRepMonth={y:n.getFullYear(),m:n.getMonth()};}
  curRepMonth.m+=dir;
  if(curRepMonth.m>11){curRepMonth.m=0;curRepMonth.y++;}
  if(curRepMonth.m<0){curRepMonth.m=11;curRepMonth.y--;}
  renderRepasses();
}
window.changeRepMonth=changeRepMonth;

function openRepModal(imovelId,mes,propNome,pix,liq){
  document.getElementById('mrep-imovel-id').value=imovelId;
  document.getElementById('mrep-mes').value=mes;
  document.getElementById('mrep-sub').textContent=propNome||'Proprietário';
  document.getElementById('mrep-valor').value=parseFloat(liq).toFixed(2);
  document.getElementById('mrep-pix-area').innerHTML=pix?`<div class="pix-box"><i class="ti ti-brand-mastercard" style="color:var(--accent-text);font-size:18px"></i><span class="pix-key">${pix}</span><button class="btn btn-sm" onclick="copiarPix('${pix}')"><i class="ti ti-copy"></i>Copiar</button></div>`:'';
  document.getElementById('mrep-obs').value='';
  document.getElementById('modal-rep').classList.add('open');
}
window.openRepModal=openRepModal;

// ===== RENDER DETALHE =====
function renderDetalhe(){
  const im=DB.imoveis.find(x=>x.id===curImovelId);
  if(!im){goPage('imoveis');return;}
  const prop=DB.props.find(p=>p.id===im.propId);
  const inq=DB.inqs.find(i=>i.id===im.inqId);
  document.getElementById('det-nome').textContent=im.nome;
  document.getElementById('det-end').textContent=im.end||'Sem endereço';
  document.getElementById('det-edit-btn').onclick=()=>editImovel(im.id);
  document.getElementById('det-obs-info').textContent=im.obs||'Nenhuma observação cadastrada.';
  document.getElementById('det-prop-info').innerHTML=prop
    ?`<div style="display:flex;align-items:center;gap:9px;margin-bottom:12px"><div class="av-sm" style="background:${avColor(prop.nome)};color:#fff">${initials(prop.nome)}</div><div><div style="font-weight:600;font-size:13px">${prop.nome}</div><div style="font-size:11px;color:var(--text2)">${prop.tel||''}</div></div></div>
      ${prop.pix?`<div class="pix-box"><i class="ti ti-brand-mastercard" style="color:var(--accent-text);font-size:16px"></i><span class="pix-key">${prop.pix}</span><button class="btn btn-sm" onclick="copiarPix('${prop.pix}')"><i class="ti ti-copy"></i></button></div>`:''}
      <div class="info-row"><span class="info-lbl">Email</span><span class="info-val" style="font-size:11px">${prop.email||'—'}</span></div>
      <div class="info-row"><span class="info-lbl">Banco</span><span class="info-val">${prop.banco||'—'}</span></div>
      <div class="info-row"><span class="info-lbl">Comissão Gerson</span><span class="info-val">${im.comissao||10}%</span></div>
      <div style="display:flex;gap:6px;margin-top:12px">
        <button class="btn btn-sm whats-btn" style="flex:1;justify-content:center" onclick="whatsRepasseProprietario('${im.id}',null)"><i class="ti ti-brand-whatsapp"></i>Avisar repasse</button>
        <button class="btn btn-sm whats-btn" style="flex:1;justify-content:center" onclick="whatsAtrasoProprietario('${im.id}')"><i class="ti ti-brand-whatsapp"></i>Avisar atraso</button>
      </div>`
    :'<p style="font-size:12px;color:var(--text2)">Nenhum proprietário vinculado.</p>';
  document.getElementById('det-inq-info').innerHTML=inq
    ?`<div style="display:flex;align-items:center;gap:9px;margin-bottom:12px"><div class="av-sm" style="background:${avColor(inq.nome)};color:#fff">${initials(inq.nome)}</div><div><div style="font-weight:600;font-size:13px">${inq.nome}</div><div style="font-size:11px;color:var(--text2)">${inq.tel||''}</div></div></div>
      <div class="info-row"><span class="info-lbl">Aluguel</span><span class="info-val" style="color:var(--accent)">${fmt(im.valor)}/mês</span></div>
      <div class="info-row"><span class="info-lbl">Vencimento</span><span class="info-val">Dia ${im.venc||'—'}</span></div>
      ${inq.ini?`<div class="info-row"><span class="info-lbl">Contrato</span><span class="info-val" style="font-size:11px">${inq.ini.slice(0,7)} → ${inq.fim?inq.fim.slice(0,7):'Indeterminado'}</span></div>`:''}
      <div class="info-row"><span class="info-lbl">Email</span><span class="info-val" style="font-size:11px">${inq.email||'—'}</span></div>
      ${inq.avalNome?`<div class="info-row"><span class="info-lbl">Avalista</span><span class="info-val" style="font-size:11px">${inq.avalNome}${inq.avalTel?' · '+inq.avalTel:''}</span></div>`:''}
      <div style="display:flex;gap:6px;margin-top:12px">
        <button class="btn btn-sm whats-btn" style="flex:1;justify-content:center" onclick="whatsCobrancaInquilino('${im.id}',null)"><i class="ti ti-brand-whatsapp"></i>Cobrar aluguel</button>
        <button class="btn btn-sm whats-btn" style="flex:1;justify-content:center" onclick="whatsAvisoVencimento('${im.id}')"><i class="ti ti-brand-whatsapp"></i>Aviso vencimento</button>
      </div>`
    :'<p style="font-size:12px;color:var(--text2)">Nenhum inquilino vinculado.</p>';
  if(curDetTab==='taxas') renderTaxas();
  else if(curDetTab==='fotos') renderFotos();
  else if(curDetTab==='historico') renderHistorico();
}

function renderHistorico(){
  const im=DB.imoveis.find(x=>x.id===curImovelId); if(!im)return;
  const pags=DB.pags.filter(p=>p.imovelId===im.id).sort((a,b)=>b.mes.localeCompare(a.mes));
  const nowMes=new Date();
  const cells=[];
  for(let i=11;i>=0;i--){
    const d=new Date(nowMes.getFullYear(),nowMes.getMonth()-i,1);
    const mes=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const p=pags.find(x=>x.mes===mes);
    const cls=p?(p.status==='pago'?'paid':p.status==='atrasado'?'late':'pend'):'';
    cells.push(`<div class="hist-cell ${cls}" title="${MONTHS[d.getMonth()]} ${d.getFullYear()}">${MONTHS_SHORT[d.getMonth()]}</div>`);
  }
  document.getElementById('det-hist-cells').innerHTML=cells.join('');
  const tbody=document.getElementById('det-hist-tbody');
  if(!pags.length){tbody.innerHTML=`<tr><td colspan="5"><div class="empty-state" style="padding:24px"><i class="ti ti-clock"></i><p>Sem histórico</p><span>Nenhum pagamento registrado ainda</span></div></td></tr>`;return;}
  tbody.innerHTML=pags.map(p=>{
    const[y,m]=p.mes.split('-');
    return`<tr><td>${MONTHS[parseInt(m)-1]} ${y}</td><td style="font-weight:600">${fmt(p.valor)}</td><td style="font-size:12px;color:var(--text2)">${p.data?p.data.split('-').reverse().join('/'):'—'}</td><td>${badgeHtml(p.status)}</td><td style="font-size:12px;color:var(--text2)">${p.obs||'—'}</td></tr>`;
  }).join('');
}

// ===== DASHBOARD =====
function renderDashboard(){
  const now=new Date();
  const mes=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const hora=now.getHours();
  const saudacao=hora<12?'Bom dia':hora<18?'Boa tarde':'Boa noite';
  document.getElementById('dash-greeting').textContent=`${saudacao}, Gerson! 👋`;
  document.getElementById('dash-sub').textContent=`${MONTHS[now.getMonth()]} ${now.getFullYear()} · ${DB.imoveis.length} imóvel(is) gerenciado(s)`;
  const pagos=DB.imoveis.filter(im=>{const p=DB.pags.find(x=>x.imovelId===im.id&&x.mes===mes);return p&&p.status==='pago';});
  const total=DB.pags.filter(p=>p.mes===mes&&p.status==='pago').reduce((s,p)=>s+p.valor,0);
  const pend=DB.imoveis.filter(im=>{const p=DB.pags.find(x=>x.imovelId===im.id&&x.mes===mes);return!p||p.status==='pendente';});
  const late=DB.imoveis.filter(im=>{const p=DB.pags.find(x=>x.imovelId===im.id&&x.mes===mes);return p&&p.status==='atrasado';});
  const comissao=DB.pags.filter(p=>p.mes===mes&&p.status==='pago').reduce((s,p)=>{const im=DB.imoveis.find(x=>x.id===p.imovelId);return s+(im?(im.comissao||10)/100*p.valor:0);},0);
  document.getElementById('ds-recebido').textContent=fmtShort(total);
  document.getElementById('ds-recebido-sub').textContent=`${pagos.length} de ${DB.imoveis.length} pagos`;
  document.getElementById('ds-prog').style.width=DB.imoveis.length?Math.round(pagos.length/DB.imoveis.length*100)+'%':'0%';
  document.getElementById('ds-pend').textContent=pend.length;
  document.getElementById('ds-late').textContent=late.length;
  document.getElementById('ds-late-sub').textContent=late.length?'atenção necessária ⚠️':'mês limpo ✨';
  document.getElementById('ds-comissao').textContent=fmtShort(comissao);
  document.getElementById('ds-com-sub').textContent=`sobre ${fmtShort(total)} recebido`;
  // Banner alertas
  const alertas=calcularAlertas();
  const bannerAl=document.getElementById('dash-alertas-banner');
  if(alertas.length){
    bannerAl.style.display='flex';
    document.getElementById('dash-alerta-txt').textContent=`${alertas.length} contrato(s) vencendo em breve`;
    document.getElementById('dash-alerta-sub').textContent=alertas.slice(0,2).map(a=>a.inqNome).join(', ')+(alertas.length>2?` e mais ${alertas.length-2}`:'');
  }else{bannerAl.style.display='none';}
  // Pendentes
  const pendImoveis=DB.imoveis.filter(im=>{const p=DB.pags.find(x=>x.imovelId===im.id&&x.mes===mes);return!p||p.status!=='pago';});
  const pendList=document.getElementById('dash-pend-list');
  if(!pendImoveis.length){
    pendList.innerHTML=`<div class="empty-state" style="padding:24px"><i class="ti ti-check"></i><p>Tudo em dia! Parabéns!</p><span>Todos os imóveis estão com pagamento confirmado</span></div>`;
  }else{
    pendList.innerHTML=`<table><thead><tr><th style="width:30%">Imóvel</th><th style="width:22%">Inquilino</th><th style="width:16%">Valor</th><th style="width:14%">Status</th><th style="width:125px"></th></tr></thead><tbody>`+
    pendImoveis.map(im=>{
      const inq=DB.inqs.find(i=>i.id===im.inqId);
      const p=DB.pags.find(x=>x.imovelId===im.id&&x.mes===mes);
      return`<tr><td><strong class="link-text" onclick="goPage('detalhe','${im.id}')">${im.nome}</strong></td><td>${inq?inq.nome:'—'}</td><td style="font-weight:600">${fmtShort(im.valor)}</td><td>${badgeHtml(p?p.status:'pendente')}</td><td><div class="acts"><button class="btn btn-sm whats-btn" onclick="whatsCobrancaInquilino('${im.id}','${mes}')"><i class="ti ti-brand-whatsapp"></i></button><button class="btn btn-primary btn-sm" onclick="curImovelId='${im.id}';openModal('modal-pag')"><i class="ti ti-plus"></i>Registrar</button></div></td></tr>`;
    }).join('')+'</tbody></table>';
  }
  // Banner repasse
  const totalLiq=pagos.reduce((s,im)=>{const p=DB.pags.find(x=>x.imovelId===im.id&&x.mes===mes);return s+(p?p.valor-(im.comissao||10)/100*p.valor:0);},0);
  const banner=document.getElementById('dash-repasse-banner');
  if(pagos.length>0){
    banner.style.display='flex';
    document.getElementById('dash-rep-title').textContent=`Repasse de ${MONTHS[now.getMonth()]} — dia 15`;
    document.getElementById('dash-rep-sub').textContent=`${pagos.length} proprietário(s) com pagamento confirmado`;
    document.getElementById('dash-rep-val').textContent=fmtShort(totalLiq);
  }else{banner.style.display='none';}
}

// ===== NAV BADGES =====
function renderNavBadges(){
  document.getElementById('nb-imoveis').textContent=DB.imoveis.length;
  const now=new Date();
  const mes=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const pend=DB.imoveis.filter(im=>{const p=DB.pags.find(x=>x.imovelId===im.id&&x.mes===mes);return!p||p.status!=='pago';}).length;
  const nb=document.getElementById('nb-pag');
  if(pend>0){nb.style.display='';nb.textContent=pend;}else{nb.style.display='none';}
  const alertas=calcularAlertas();
  const nba=document.getElementById('nb-alertas');
  if(alertas.length){nba.style.display='';nba.textContent=alertas.length;}else{nba.style.display='none';}
  document.getElementById('notif-dot').style.display=(pend>0||alertas.length>0)?'':'none';
}

function renderTudo(){
  renderDashboard();renderNavBadges();
  if(curPage==='imoveis')renderImoveis();
  else if(curPage==='pagamentos')renderPagamentos();
  else if(curPage==='repasses')renderRepasses();
  else if(curPage==='proprietarios')renderProps();
  else if(curPage==='inquilinos')renderInqs();
  else if(curPage==='alertas')renderAlertas();
  else if(curPage==='detalhe')renderDetalhe();
}

// ===== COPIAR PIX =====
function copiarPix(pix){
  navigator.clipboard.writeText(pix).then(()=>showToast('✅ Chave PIX copiada!')).catch(()=>showToast('PIX: '+pix));
}
window.copiarPix=copiarPix;

// ===== WHATSAPP =====
function limparTel(tel){
  if(!tel)return'';
  let n=tel.replace(/\D/g,'');
  if(n.startsWith('0'))n=n.slice(1);
  if(n.length===11||n.length===10)n='55'+n;
  return n;
}
function abrirWhatsApp(tel,msg){
  const n=limparTel(tel);
  if(!n){showToast('⚠️ Número não cadastrado');return;}
  window.open(`https://wa.me/${n}?text=${encodeURIComponent(msg)}`,'_blank');
}
function abrirModalWhats(titulo,tel,msg){
  document.getElementById('mw-titulo').textContent=titulo;
  document.getElementById('mw-tel').value=tel||'';
  document.getElementById('mw-msg').value=msg;
  document.getElementById('mw-preview').textContent=msg;
  document.getElementById('mw-msg').oninput=function(){document.getElementById('mw-preview').textContent=this.value;};
  document.getElementById('modal-whats').classList.add('open');
}
function enviarWhatsApp(){
  const tel=document.getElementById('mw-tel').value.trim();
  const msg=document.getElementById('mw-msg').value.trim();
  if(!tel){showToast('⚠️ Informe o número');return;}
  abrirWhatsApp(tel,msg);closeModal('modal-whats');showToast('📱 Abrindo WhatsApp...');
}
window.enviarWhatsApp=enviarWhatsApp;

function whatsCobrancaInquilino(imovelId,mesRef){
  const im=DB.imoveis.find(x=>x.id===imovelId);if(!im)return;
  const inq=DB.inqs.find(i=>i.id===im.inqId);if(!inq){showToast('⚠️ Inquilino não cadastrado');return;}
  const now=new Date();
  const mes=mesRef||`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const[y,m]=mes.split('-');
  const nomeMes=MONTHS[parseInt(m)-1]+' '+y;
  const msg=`Olá, ${inq.nome}! Tudo bem?\n\nPassando para lembrar que o aluguel referente a *${nomeMes}* do imóvel *${im.nome}* está com vencimento no dia *${im.venc}*.\n\n💰 *Valor: ${fmt(im.valor)}*\n\nApós realizar o pagamento, por favor envie o comprovante para minha confirmação.\n\nQualquer dúvida estou à disposição! 😊\n\nAtenciosamente,\n*Gerson Rosa — Corretor de Imóveis*`;
  abrirModalWhats(`Cobrar inquilino — ${inq.nome}`,inq.tel,msg);
}
window.whatsCobrancaInquilino=whatsCobrancaInquilino;

function whatsConfirmacaoInquilino(imovelId,mesRef){
  const im=DB.imoveis.find(x=>x.id===imovelId);if(!im)return;
  const inq=DB.inqs.find(i=>i.id===im.inqId);if(!inq){showToast('⚠️ Inquilino não cadastrado');return;}
  const now=new Date();
  const mes=mesRef||`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const[y,m]=mes.split('-');
  const nomeMes=MONTHS[parseInt(m)-1]+' '+y;
  const pag=DB.pags.find(p=>p.imovelId===imovelId&&p.mes===mes);
  const valor=pag?fmt(pag.valor):fmt(im.valor);
  const msg=`Olá, ${inq.nome}! Tudo bem?\n\n✅ Confirmo o recebimento do pagamento referente a *${nomeMes}* no valor de *${valor}*.\n\nObrigado pela pontualidade! 👍\n\nAtenciosamente,\n*Gerson Rosa — Corretor de Imóveis*`;
  abrirModalWhats(`Confirmar recebimento — ${inq.nome}`,inq.tel,msg);
}
window.whatsConfirmacaoInquilino=whatsConfirmacaoInquilino;

function whatsAvisoVencimento(imovelId){
  const im=DB.imoveis.find(x=>x.id===imovelId);if(!im)return;
  const inq=DB.inqs.find(i=>i.id===im.inqId);if(!inq){showToast('⚠️ Inquilino não cadastrado');return;}
  const now=new Date();
  const nomeMes=MONTHS[now.getMonth()]+' '+now.getFullYear();
  const msg=`Olá, ${inq.nome}! Tudo bem?\n\nPassando para lembrar que o vencimento do aluguel de *${nomeMes}* do imóvel *${im.nome}* será no dia *${im.venc}*.\n\n💰 *Valor: ${fmt(im.valor)}*\n\nApós o pagamento, envie o comprovante. 😊\n\nAtenciosamente,\n*Gerson Rosa — Corretor de Imóveis*`;
  abrirModalWhats(`Aviso de vencimento — ${inq.nome}`,inq.tel,msg);
}
window.whatsAvisoVencimento=whatsAvisoVencimento;

function whatsRenovacao(inqId){
  const inq=DB.inqs.find(i=>i.id===inqId);if(!inq)return;
  const im=DB.imoveis.find(x=>x.inqId===inqId);
  const fim=inq.fim?inq.fim.split('-').reverse().join('/'):'em breve';
  const msg=`Olá, ${inq.nome}! Tudo bem?\n\nPassando para informar que o contrato de locação${im?' do imóvel *'+im.nome+'*':''} vence em *${fim}*.\n\nGostaria de saber se você tem interesse em *renovar o contrato*? 📋\n\nPor favor, me responda para que possamos providenciar a documentação necessária com antecedência.\n\nQualquer dúvida estou à disposição!\n\nAtenciosamente,\n*Gerson Rosa — Corretor de Imóveis*`;
  abrirModalWhats(`Renovação de contrato — ${inq.nome}`,inq.tel,msg);
}
window.whatsRenovacao=whatsRenovacao;

function whatsRepasseProprietario(imovelId,mesRef){
  const im=DB.imoveis.find(x=>x.id===imovelId);if(!im)return;
  const prop=DB.props.find(p=>p.id===im.propId);if(!prop){showToast('⚠️ Proprietário não cadastrado');return;}
  const now=new Date();
  const mes=mesRef||`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const[y,m]=mes.split('-');
  const nomeMes=MONTHS[parseInt(m)-1]+' '+y;
  const pag=DB.pags.find(p=>p.imovelId===imovelId&&p.mes===mes&&p.status==='pago');
  const valorAluguel=pag?pag.valor:im.valor;
  const comissao=(im.comissao||10)/100*valorAluguel;
  const liquido=valorAluguel-comissao;
  const msg=`Olá, ${prop.nome}! Tudo bem?\n\nInformo que realizei o repasse referente ao aluguel de *${nomeMes}* do imóvel *${im.nome}*.\n\n📋 *Detalhamento:*\n• Aluguel recebido: ${fmt(valorAluguel)}\n• Comissão (${im.comissao||10}%): - ${fmt(comissao)}\n• *Valor repassado: ${fmt(liquido)}*\n\n${prop.pix?`💳 *Chave PIX:* ${prop.pix}\n\n`:''}Qualquer dúvida estou à disposição!\n\nAtenciosamente,\n*Gerson Rosa — Corretor de Imóveis*`;
  abrirModalWhats(`Aviso de repasse — ${prop.nome}`,prop.tel,msg);
}
window.whatsRepasseProprietario=whatsRepasseProprietario;

function whatsAtrasoProprietario(imovelId){
  const im=DB.imoveis.find(x=>x.id===imovelId);if(!im)return;
  const prop=DB.props.find(p=>p.id===im.propId);if(!prop){showToast('⚠️ Proprietário não cadastrado');return;}
  const inq=DB.inqs.find(i=>i.id===im.inqId);
  const now=new Date();
  const nomeMes=MONTHS[now.getMonth()]+' '+now.getFullYear();
  const msg=`Olá, ${prop.nome}! Tudo bem?\n\nInformo que o aluguel de *${nomeMes}* do imóvel *${im.nome}* ainda não foi recebido${inq?` de *${inq.nome}*`:''}.\n\nJá estou realizando a cobrança e farei o repasse assim que receber.\n\nMantenho você informado!\n\nAtenciosamente,\n*Gerson Rosa — Corretor de Imóveis*`;
  abrirModalWhats(`Informar atraso — ${prop.nome}`,prop.tel,msg);
}
window.whatsAtrasoProprietario=whatsAtrasoProprietario;

function whatsPersonalizado(nome,tel){
  abrirModalWhats(`Mensagem para ${nome}`,tel,`Olá, ${nome}! Tudo bem?\n\n\n\nAtenciosamente,\n*Gerson Rosa — Corretor de Imóveis*`);
}
window.whatsPersonalizado=whatsPersonalizado;

// ===== AUTH STATE =====
onAuthStateChanged(auth,user=>{
  document.getElementById('tela-loading').style.display='none';
  if(user){
    currentUser=user;
    document.getElementById('tela-login').style.display='none';
    document.getElementById('app').style.display='grid';
    iniciarListeners();
  }else{
    currentUser=null;
    unsubListeners.forEach(u=>u());unsubListeners=[];
    DB={props:[],inqs:[],imoveis:[],pags:[],repasses:[],taxas:[],fotos:[],docs:[]};
    document.getElementById('app').style.display='none';
    document.getElementById('tela-login').style.display='flex';
  }
});

Object.defineProperty(window,'curImovelId',{get:()=>curImovelId,set:v=>{curImovelId=v;}});
