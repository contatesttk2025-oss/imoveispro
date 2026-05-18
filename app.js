// ===== FIREBASE =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBt193mClty0jKJNAqkms29tjOqmh2yafA",
  authDomain: "imovel-pro-gerson.firebaseapp.com",
  projectId: "imovel-pro-gerson",
  storageBucket: "imovel-pro-gerson.firebasestorage.app",
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
let DB = { props: [], inqs: [], imoveis: [], pags: [], repasses: [] };
let currentUser = null;
let curPage = 'dashboard';
let curImovelId = null;
let curPagMonth = null;
let curRepMonth = null;
let chipFilter = { imoveis: 'todos', pag: 'todos' };
let unsubListeners = [];

// ===== UTILS =====
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function fmt(v) { return 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtShort(v) { return 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0}); }
function initials(n) { return (n||'').trim().split(' ').filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase()||'?'; }
function avColor(n) { const c=['#2D6A4F','#1558C0','#880e4f','#4527a0','#00695c','#bf360c','#37474f','#6a1b9a']; return c[(n||'').charCodeAt(0)%c.length]; }

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

function setSyncIcon(estado) {
  const el = document.getElementById('sync-icon');
  if (!el) return;
  if (estado === 'ok') { el.className = 'ti ti-cloud-check'; el.style.color = 'var(--accent)'; }
  else if (estado === 'saving') { el.className = 'ti ti-cloud-upload'; el.style.color = 'var(--warn-text)'; }
  else { el.className = 'ti ti-cloud-off'; el.style.color = 'var(--danger-text)'; }
}

// ===== AUTH =====
function toggleSenha() {
  const inp = document.getElementById('login-senha');
  const ico = document.getElementById('btn-olho').querySelector('i');
  if (inp.type === 'password') { inp.type = 'text'; ico.className = 'ti ti-eye-off'; }
  else { inp.type = 'password'; ico.className = 'ti ti-eye'; }
}
window.toggleSenha = toggleSenha;

async function fazerLogin() {
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;
  const erro = document.getElementById('login-erro');
  const btnTxt = document.getElementById('login-btn-txt');
  const btnLoad = document.getElementById('login-btn-load');
  const btn = document.getElementById('login-btn');
  if (!email || !senha) { erro.style.display=''; erro.textContent='Preencha e-mail e senha.'; return; }
  erro.style.display = 'none';
  btnTxt.style.display = 'none'; btnLoad.style.display = ''; btn.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, senha);
  } catch(e) {
    btnTxt.style.display = ''; btnLoad.style.display = 'none'; btn.disabled = false;
    erro.style.display = '';
    const msgs = { 'auth/invalid-credential':'E-mail ou senha incorretos.', 'auth/user-not-found':'Usuário não encontrado.', 'auth/wrong-password':'Senha incorreta.', 'auth/too-many-requests':'Muitas tentativas. Aguarde um momento.' };
    erro.textContent = msgs[e.code] || 'Erro ao entrar. Tente novamente.';
  }
}
window.fazerLogin = fazerLogin;

function confirmarLogout() {
  if (confirm('Deseja sair do sistema?')) { signOut(auth); }
}
window.confirmarLogout = confirmarLogout;

// ===== FIRESTORE LISTENERS =====
function userCol(col) {
  return collection(db, 'users', currentUser.uid, col);
}
function userDoc(col, id) {
  return doc(db, 'users', currentUser.uid, col, id);
}

function iniciarListeners() {
  unsubListeners.forEach(u => u());
  unsubListeners = [];
  const colecoes = ['props','inqs','imoveis','pags','repasses'];
  let carregados = 0;
  colecoes.forEach(col => {
    const unsub = onSnapshot(userCol(col), snap => {
      DB[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      carregados++;
      if (carregados >= colecoes.length) {
        renderTudo();
        setSyncIcon('ok');
      } else {
        renderNavBadges();
        if (curPage === 'dashboard') renderDashboard();
        else if (curPage === 'imoveis') renderImoveis();
        else if (curPage === 'pagamentos') renderPagamentos();
        else if (curPage === 'repasses') renderRepasses();
        else if (curPage === 'proprietarios') renderProps();
        else if (curPage === 'inquilinos') renderInqs();
        else if (curPage === 'detalhe') renderDetalhe();
      }
    }, err => { console.error(err); setSyncIcon('erro'); });
    unsubListeners.push(unsub);
  });
}

// ===== SALVAR NO FIRESTORE =====
async function fsSet(col, obj) {
  setSyncIcon('saving');
  try {
    await setDoc(userDoc(col, obj.id), obj);
    setSyncIcon('ok');
  } catch(e) { setSyncIcon('erro'); showToast('❌ Erro ao salvar. Verifique a conexão.'); throw e; }
}

async function fsDel(col, id) {
  setSyncIcon('saving');
  try {
    await deleteDoc(userDoc(col, id));
    setSyncIcon('ok');
  } catch(e) { setSyncIcon('erro'); showToast('❌ Erro ao excluir.'); throw e; }
}

// ===== EXPORTAR =====
function exportarDados() {
  const blob = new Blob([JSON.stringify(DB, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `imovelPro_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('✅ Backup exportado!');
}
window.exportarDados = exportarDados;

// ===== NAVEGAÇÃO =====
function goPage(id, imovelId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  const nav = document.getElementById('nav-'+id);
  if (nav) nav.classList.add('active');
  curPage = id;
  if (id==='imoveis') renderImoveis();
  else if (id==='pagamentos') renderPagamentos();
  else if (id==='proprietarios') renderProps();
  else if (id==='inquilinos') renderInqs();
  else if (id==='repasses') renderRepasses();
  else if (id==='dashboard') renderDashboard();
  else if (id==='detalhe') { curImovelId=imovelId; renderDetalhe(); }
  window.scrollTo(0,0);
}
window.goPage = goPage;

// ===== MODAIS =====
function openModal(id) {
  const now = new Date();
  if (id==='modal-pag') {
    document.getElementById('mpag-mes').value = now.toISOString().slice(0,7);
    document.getElementById('mpag-data').value = now.toISOString().slice(0,10);
    document.getElementById('mpag-edit-id').value = '';
    document.getElementById('mpag-title').textContent = 'Registrar pagamento';
    populatePagSelect();
  }
  if (id==='modal-imovel') {
    document.getElementById('mi-edit-id').value = '';
    document.getElementById('mi-title').textContent = 'Cadastrar imóvel';
    ['mi-nome','mi-end','mi-obs'].forEach(x => document.getElementById(x).value='');
    document.getElementById('mi-valor').value='';
    document.getElementById('mi-venc').value='';
    document.getElementById('mi-com').value='10';
    populateSelects();
  }
  if (id==='modal-prop') {
    document.getElementById('mp-edit-id').value='';
    document.getElementById('mp-title').textContent='Cadastrar proprietário';
    ['mp-nome','mp-cpf','mp-tel','mp-email','mp-pix','mp-end','mp-banco','mp-obs'].forEach(x=>document.getElementById(x).value='');
  }
  if (id==='modal-inq') {
    document.getElementById('minq-edit-id').value='';
    document.getElementById('minq-title').textContent='Cadastrar inquilino';
    ['minq-nome','minq-cpf','minq-tel','minq-email','minq-obs'].forEach(x=>document.getElementById(x).value='');
    document.getElementById('minq-ini').value='';
    document.getElementById('minq-fim').value='';
  }
  if (id==='modal-rep') { document.getElementById('mrep-data').value=now.toISOString().slice(0,10); document.getElementById('mrep-obs').value=''; }
  document.getElementById(id).classList.add('open');
}
window.openModal = openModal;

function closeModal(id) { document.getElementById(id).classList.remove('open'); }
window.closeModal = closeModal;

document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target===m) m.classList.remove('open'); });
});
document.addEventListener('keydown', e => {
  if (e.key==='Escape') document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open'));
});

// ===== SELECTS =====
function populateSelects() {
  const ps = document.getElementById('mi-prop');
  const is = document.getElementById('mi-inq');
  ps.innerHTML='<option value="">Selecionar proprietário...</option>';
  is.innerHTML='<option value="">Selecionar inquilino...</option>';
  DB.props.forEach(p => ps.innerHTML+=`<option value="${p.id}">${p.nome}</option>`);
  DB.inqs.forEach(i => is.innerHTML+=`<option value="${i.id}">${i.nome}</option>`);
}

function populatePagSelect() {
  const s = document.getElementById('mpag-imovel');
  s.innerHTML='<option value="">Selecionar imóvel...</option>';
  DB.imoveis.forEach(im => {
    const inq = DB.inqs.find(i=>i.id===im.inqId);
    s.innerHTML+=`<option value="${im.id}">${im.nome}${inq?' — '+inq.nome:''}</option>`;
  });
  if (curImovelId) s.value=curImovelId;
}

// ===== SALVAR PROPRIETÁRIO =====
async function saveProp() {
  const id = document.getElementById('mp-edit-id').value||uid();
  const obj = { id, nome:document.getElementById('mp-nome').value.trim(), cpf:document.getElementById('mp-cpf').value.trim(), tel:document.getElementById('mp-tel').value.trim(), email:document.getElementById('mp-email').value.trim(), pixTipo:document.getElementById('mp-pix-tipo').value, pix:document.getElementById('mp-pix').value.trim(), end:document.getElementById('mp-end').value.trim(), banco:document.getElementById('mp-banco').value.trim(), obs:document.getElementById('mp-obs').value.trim() };
  if (!obj.nome) { showToast('⚠️ Informe o nome'); return; }
  try { await fsSet('props',obj); closeModal('modal-prop'); showToast('✅ Proprietário salvo!'); } catch(e){}
}
window.saveProp = saveProp;

// ===== SALVAR INQUILINO =====
async function saveInq() {
  const id = document.getElementById('minq-edit-id').value||uid();
  const obj = { id, nome:document.getElementById('minq-nome').value.trim(), cpf:document.getElementById('minq-cpf').value.trim(), tel:document.getElementById('minq-tel').value.trim(), email:document.getElementById('minq-email').value.trim(), ini:document.getElementById('minq-ini').value, fim:document.getElementById('minq-fim').value, obs:document.getElementById('minq-obs').value.trim() };
  if (!obj.nome) { showToast('⚠️ Informe o nome'); return; }
  try { await fsSet('inqs',obj); closeModal('modal-inq'); showToast('✅ Inquilino salvo!'); } catch(e){}
}
window.saveInq = saveInq;

// ===== SALVAR IMÓVEL =====
async function saveImovel() {
  const id = document.getElementById('mi-edit-id').value||uid();
  const obj = { id, nome:document.getElementById('mi-nome').value.trim(), end:document.getElementById('mi-end').value.trim(), valor:parseFloat(document.getElementById('mi-valor').value)||0, venc:parseInt(document.getElementById('mi-venc').value)||10, propId:document.getElementById('mi-prop').value, inqId:document.getElementById('mi-inq').value, comissao:parseFloat(document.getElementById('mi-com').value)||10, obs:document.getElementById('mi-obs').value.trim() };
  if (!obj.nome) { showToast('⚠️ Informe o nome do imóvel'); return; }
  if (!obj.valor) { showToast('⚠️ Informe o valor do aluguel'); return; }
  try { await fsSet('imoveis',obj); closeModal('modal-imovel'); showToast('✅ Imóvel salvo!'); } catch(e){}
}
window.saveImovel = saveImovel;

// ===== SALVAR PAGAMENTO =====
async function savePag() {
  const id = document.getElementById('mpag-edit-id').value||uid();
  const imovelId = document.getElementById('mpag-imovel').value;
  if (!imovelId) { showToast('⚠️ Selecione o imóvel'); return; }
  const mes = document.getElementById('mpag-mes').value;
  if (!mes) { showToast('⚠️ Informe o mês'); return; }
  const obj = { id, imovelId, mes, data:document.getElementById('mpag-data').value, valor:parseFloat(document.getElementById('mpag-valor').value)||0, status:document.getElementById('mpag-status').value, obs:document.getElementById('mpag-obs').value.trim() };
  try { await fsSet('pags',obj); closeModal('modal-pag'); showToast('✅ Pagamento registrado!'); } catch(e){}
}
window.savePag = savePag;

// ===== SALVAR REPASSE =====
async function saveRepasse() {
  const imovelId = document.getElementById('mrep-imovel-id').value;
  const mes = document.getElementById('mrep-mes').value;
  const id = imovelId+'_'+mes;
  const obj = { id, imovelId, mes, data:document.getElementById('mrep-data').value, valor:parseFloat(document.getElementById('mrep-valor').value)||0, obs:document.getElementById('mrep-obs').value.trim() };
  try { await fsSet('repasses',obj); closeModal('modal-rep'); showToast('✅ Repasse confirmado!'); } catch(e){}
}
window.saveRepasse = saveRepasse;

// ===== DELETAR =====
async function delImovel(id) {
  if (!confirm('Excluir este imóvel? Os pagamentos relacionados também serão removidos.')) return;
  const pags = DB.pags.filter(p=>p.imovelId===id);
  const reps = DB.repasses.filter(r=>r.imovelId===id);
  try {
    await fsDel('imoveis',id);
    for (const p of pags) await fsDel('pags',p.id);
    for (const r of reps) await fsDel('repasses',r.id);
    showToast('Imóvel removido');
  } catch(e){}
}
window.delImovel = delImovel;

async function delProp(id) {
  if (!confirm('Excluir este proprietário?')) return;
  try { await fsDel('props',id); showToast('Proprietário removido'); } catch(e){}
}
window.delProp = delProp;

async function delInq(id) {
  if (!confirm('Excluir este inquilino?')) return;
  try { await fsDel('inqs',id); showToast('Inquilino removido'); } catch(e){}
}
window.delInq = delInq;

async function delPag(id) {
  if (!confirm('Excluir este pagamento?')) return;
  try { await fsDel('pags',id); showToast('Pagamento removido'); } catch(e){}
}
window.delPag = delPag;

// ===== EDITAR =====
function editProp(id) {
  const p = DB.props.find(x=>x.id===id); if (!p) return;
  document.getElementById('mp-edit-id').value=p.id;
  document.getElementById('mp-title').textContent='Editar proprietário';
  ['nome','cpf','tel','email','pix','end','banco','obs'].forEach(f => document.getElementById('mp-'+f).value=p[f]||'');
  document.getElementById('mp-pix-tipo').value=p.pixTipo||'email';
  document.getElementById('modal-prop').classList.add('open');
}
window.editProp = editProp;

function editInq(id) {
  const i = DB.inqs.find(x=>x.id===id); if (!i) return;
  document.getElementById('minq-edit-id').value=i.id;
  document.getElementById('minq-title').textContent='Editar inquilino';
  ['nome','cpf','tel','email','obs'].forEach(f => document.getElementById('minq-'+f).value=i[f]||'');
  document.getElementById('minq-ini').value=i.ini||'';
  document.getElementById('minq-fim').value=i.fim||'';
  document.getElementById('modal-inq').classList.add('open');
}
window.editInq = editInq;

function editImovel(id) {
  const im = DB.imoveis.find(x=>x.id===id); if (!im) return;
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
window.editImovel = editImovel;

function editPag(id) {
  const p = DB.pags.find(x=>x.id===id); if (!p) return;
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
window.editPag = editPag;

// ===== STATUS =====
function getImovelStatus(im) {
  const now = new Date();
  const mes = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const pag = DB.pags.find(p=>p.imovelId===im.id&&p.mes===mes);
  return pag ? pag.status : 'pendente';
}

function badgeHtml(s) {
  if (s==='pago') return '<span class="badge badge-ok"><i class="ti ti-check"></i>Pago</span>';
  if (s==='atrasado') return '<span class="badge badge-late"><i class="ti ti-alert-circle"></i>Atrasado</span>';
  return '<span class="badge badge-pend"><i class="ti ti-clock"></i>Pendente</span>';
}

// ===== CHIPS =====
function setChip(el, group, val) {
  document.querySelectorAll(`#chips-${group} .chip`).forEach(c=>c.classList.remove('active'));
  el.classList.add('active'); chipFilter[group]=val;
  if (group==='imoveis') renderImoveis();
  else if (group==='pag') renderPagamentos();
}
window.setChip = setChip;

// ===== RENDER IMÓVEIS =====
function renderImoveis() {
  const q = (document.getElementById('search-imoveis').value||'').toLowerCase();
  const f = chipFilter.imoveis;
  const list = DB.imoveis.filter(im => {
    const status = getImovelStatus(im);
    const inq = DB.inqs.find(i=>i.id===im.inqId);
    const prop = DB.props.find(p=>p.id===im.propId);
    const match = !q||(im.nome+im.end+(inq?inq.nome:'')+(prop?prop.nome:'')).toLowerCase().includes(q);
    return match && (f==='todos'||status===f);
  });
  document.getElementById('imoveis-sub').textContent = `${DB.imoveis.length} imóvel(is) cadastrado(s)`;
  const tbody = document.getElementById('imoveis-tbody');
  if (!list.length) { tbody.innerHTML=`<tr><td colspan="7"><div class="empty-state"><i class="ti ti-building-estate"></i><p>${DB.imoveis.length?'Nenhum resultado':'Nenhum imóvel cadastrado'}</p><span>${DB.imoveis.length?'Tente outro filtro':'Clique em "Cadastrar" para começar'}</span></div></td></tr>`; return; }
  const now = new Date();
  const mes = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  tbody.innerHTML = list.map(im => {
    const inq = DB.inqs.find(i=>i.id===im.inqId);
    const prop = DB.props.find(p=>p.id===im.propId);
    const status = getImovelStatus(im);
    return `<tr>
      <td><strong class="link-text" onclick="goPage('detalhe','${im.id}')">${im.nome||'—'}</strong></td>
      <td>${inq?inq.nome:'<span style="color:var(--text3)">—</span>'}</td>
      <td>${prop?prop.nome:'<span style="color:var(--text3)">—</span>'}</td>
      <td style="font-weight:600;color:var(--accent)">${fmtShort(im.valor)}</td>
      <td>Dia ${im.venc||'—'}</td>
      <td>${badgeHtml(status)}</td>
      <td><div class="acts">
        <button class="btn btn-sm" title="Ver" onclick="goPage('detalhe','${im.id}')"><i class="ti ti-eye"></i></button>
        <button class="btn btn-sm" title="Editar" onclick="editImovel('${im.id}')"><i class="ti ti-edit"></i></button>
        ${status!=='pago'
          ?`<button class="btn btn-sm whats-btn" title="Cobrar via WhatsApp" onclick="whatsCobrancaInquilino('${im.id}','${mes}')"><i class="ti ti-brand-whatsapp"></i></button>`
          :`<button class="btn btn-sm whats-btn" title="Confirmar recebimento" onclick="whatsConfirmacaoInquilino('${im.id}','${mes}')"><i class="ti ti-brand-whatsapp"></i></button>`}
        <button class="btn btn-sm btn-danger" title="Excluir" onclick="delImovel('${im.id}')"><i class="ti ti-trash"></i></button>
      </div></td>
    </tr>`;
  }).join('');
}

// ===== RENDER PROPRIETÁRIOS =====
function renderProps() {
  const q = (document.getElementById('search-prop').value||'').toLowerCase();
  const list = DB.props.filter(p=>!q||(p.nome+p.pix+p.tel+p.email).toLowerCase().includes(q));
  document.getElementById('prop-sub').textContent=`${DB.props.length} proprietário(s)`;
  const tbody = document.getElementById('prop-tbody');
  if (!list.length) { tbody.innerHTML=`<tr><td colspan="5"><div class="empty-state"><i class="ti ti-user-circle"></i><p>${DB.props.length?'Nenhum resultado':'Nenhum proprietário'}</p><span>${DB.props.length?'Tente outro filtro':'Clique em "Cadastrar" para começar'}</span></div></td></tr>`; return; }
  tbody.innerHTML = list.map(p=>`<tr>
    <td><div style="display:flex;align-items:center;gap:9px"><div class="av-sm" style="background:${avColor(p.nome)};color:#fff">${initials(p.nome)}</div><strong>${p.nome}</strong></div></td>
    <td><div style="display:flex;align-items:center;gap:6px"><span style="font-size:12px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;max-width:160px">${p.pix||'—'}</span>${p.pix?`<button class="btn btn-sm" style="padding:2px 7px;flex-shrink:0" onclick="copiarPix('${p.pix}')"><i class="ti ti-copy"></i></button>`:''}</div></td>
    <td>${p.tel||'—'}</td>
    <td style="font-size:12px">${p.email||'—'}</td>
    <td><div class="acts">
      <button class="btn btn-sm whats-btn" title="WhatsApp" onclick="whatsPersonalizado('${p.nome}','${p.tel}')"><i class="ti ti-brand-whatsapp"></i></button>
      <button class="btn btn-sm" onclick="editProp('${p.id}')"><i class="ti ti-edit"></i></button>
      <button class="btn btn-sm btn-danger" onclick="delProp('${p.id}')"><i class="ti ti-trash"></i></button>
    </div></td>
  </tr>`).join('');
}

// ===== RENDER INQUILINOS =====
function renderInqs() {
  const q = (document.getElementById('search-inq').value||'').toLowerCase();
  const list = DB.inqs.filter(i=>!q||(i.nome+i.tel+i.email).toLowerCase().includes(q));
  document.getElementById('inq-sub').textContent=`${DB.inqs.length} inquilino(s)`;
  const tbody = document.getElementById('inq-tbody');
  if (!list.length) { tbody.innerHTML=`<tr><td colspan="5"><div class="empty-state"><i class="ti ti-users"></i><p>${DB.inqs.length?'Nenhum resultado':'Nenhum inquilino'}</p><span>${DB.inqs.length?'Tente outro filtro':'Clique em "Cadastrar" para começar'}</span></div></td></tr>`; return; }
  tbody.innerHTML = list.map(i=>{
    const im = DB.imoveis.find(x=>x.inqId===i.id);
    const contrato = i.ini&&i.fim?i.ini.slice(0,7)+' → '+i.fim.slice(0,7):'—';
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:9px"><div class="av-sm" style="background:${avColor(i.nome)};color:#fff">${initials(i.nome)}</div><strong>${i.nome}</strong></div></td>
      <td>${im?`<span class="link-text" onclick="goPage('detalhe','${im.id}')">${im.nome}</span>`:'<span style="color:var(--text3)">Sem vínculo</span>'}</td>
      <td>${i.tel||'—'}</td>
      <td style="font-size:12px">${contrato}</td>
      <td><div class="acts">
        ${im?`<button class="btn btn-sm whats-btn" title="Cobrar" onclick="whatsCobrancaInquilino('${im.id}',null)"><i class="ti ti-brand-whatsapp"></i></button>`:`<button class="btn btn-sm whats-btn" title="WhatsApp" onclick="whatsPersonalizado('${i.nome}','${i.tel}')"><i class="ti ti-brand-whatsapp"></i></button>`}
        <button class="btn btn-sm" onclick="editInq('${i.id}')"><i class="ti ti-edit"></i></button>
        <button class="btn btn-sm btn-danger" onclick="delInq('${i.id}')"><i class="ti ti-trash"></i></button>
      </div></td>
    </tr>`;
  }).join('');
}

// ===== RENDER PAGAMENTOS =====
function renderPagamentos() {
  const now = new Date();
  if (!curPagMonth) curPagMonth={y:now.getFullYear(),m:now.getMonth()};
  const mesStr=`${curPagMonth.y}-${String(curPagMonth.m+1).padStart(2,'0')}`;
  document.getElementById('pag-month-lbl').textContent=`${MONTHS[curPagMonth.m]} ${curPagMonth.y}`;
  const f = chipFilter.pag;
  const lista = DB.imoveis.map(im=>{
    const pag=DB.pags.find(p=>p.imovelId===im.id&&p.mes===mesStr);
    const inq=DB.inqs.find(i=>i.id===im.inqId);
    const status=pag?pag.status:'pendente';
    return {im,pag,inq,status};
  }).filter(x=>f==='todos'||x.status===f);
  const total=DB.pags.filter(p=>p.mes===mesStr&&p.status==='pago').reduce((s,p)=>s+p.valor,0);
  const pagos=lista.filter(x=>x.status==='pago').length;
  const pend=lista.filter(x=>x.status==='pendente').length;
  document.getElementById('pag-sub').textContent=`${MONTHS[curPagMonth.m]} ${curPagMonth.y} · ${pagos} pagos · ${pend} pendentes · ${fmtShort(total)} recebido`;
  const tbody=document.getElementById('pag-tbody');
  if (!lista.length) { tbody.innerHTML=`<tr><td colspan="6"><div class="empty-state"><i class="ti ti-receipt"></i><p>Nenhum registro</p><span>${DB.imoveis.length?'Nenhum pagamento neste período':'Cadastre imóveis para começar'}</span></div></td></tr>`; return; }
  tbody.innerHTML=lista.map(({im,pag,inq,status})=>`<tr>
    <td><strong class="link-text" onclick="goPage('detalhe','${im.id}')">${im.nome}</strong></td>
    <td>${inq?inq.nome:'—'}</td>
    <td style="font-weight:600">${pag?fmtShort(pag.valor):fmtShort(im.valor)}</td>
    <td style="font-size:12px;color:var(--text2)">${pag&&pag.data?pag.data.split('-').reverse().join('/'):'—'}</td>
    <td>${badgeHtml(status)}</td>
    <td><div class="acts">
      ${status==='pago'
        ?`<button class="btn btn-sm whats-btn" title="Confirmar via WhatsApp" onclick="whatsConfirmacaoInquilino('${im.id}','${mesStr}')"><i class="ti ti-brand-whatsapp"></i></button>
           <button class="btn btn-sm" onclick="editPag('${pag.id}')"><i class="ti ti-edit"></i></button>
           <button class="btn btn-sm btn-danger" onclick="delPag('${pag.id}')"><i class="ti ti-trash"></i></button>`
        :`<button class="btn btn-sm whats-btn" title="Cobrar via WhatsApp" onclick="whatsCobrancaInquilino('${im.id}','${mesStr}')"><i class="ti ti-brand-whatsapp"></i></button>
           <button class="btn btn-primary btn-sm" onclick="curImovelId='${im.id}';openModal('modal-pag')"><i class="ti ti-plus"></i>Registrar</button>`}
    </div></td>
  </tr>`).join('');
}

function changeMonth(dir) {
  if (!curPagMonth){const n=new Date();curPagMonth={y:n.getFullYear(),m:n.getMonth()};}
  curPagMonth.m+=dir;
  if(curPagMonth.m>11){curPagMonth.m=0;curPagMonth.y++;}
  if(curPagMonth.m<0){curPagMonth.m=11;curPagMonth.y--;}
  renderPagamentos();
}
window.changeMonth = changeMonth;

// ===== RENDER REPASSES =====
function renderRepasses() {
  const now=new Date();
  if(!curRepMonth) curRepMonth={y:now.getFullYear(),m:now.getMonth()};
  const mesStr=`${curRepMonth.y}-${String(curRepMonth.m+1).padStart(2,'0')}`;
  document.getElementById('rep-month-lbl').textContent=`${MONTHS[curRepMonth.m]} ${curRepMonth.y}`;
  document.getElementById('rep-banner-title').textContent=`Repasse de ${MONTHS[curRepMonth.m]} ${curRepMonth.y}`;
  let totalLiq=0; let repassados=0;
  const rows=DB.imoveis.map(im=>{
    const prop=DB.props.find(p=>p.id===im.propId);
    const pag=DB.pags.find(p=>p.imovelId===im.id&&p.mes===mesStr&&p.status==='pago');
    if(!pag) return null;
    const com=(im.comissao||10)/100*pag.valor;
    const liq=pag.valor-com;
    totalLiq+=liq;
    const rep=DB.repasses.find(r=>r.imovelId===im.id&&r.mes===mesStr);
    if(rep) repassados++;
    return {im,prop,pag,com,liq,rep};
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
           <button class="btn btn-sm whats-btn" style="font-size:11px" onclick="whatsRepasseProprietario('${im.id}','${mesStr}')"><i class="ti ti-brand-whatsapp"></i>Avisar proprietário</button>`
        :`${prop&&prop.pix?`<button class="btn btn-sm" style="font-size:11px" onclick="copiarPix('${prop.pix}')"><i class="ti ti-copy"></i>Copiar PIX</button>`:''}
          <button class="btn btn-sm whats-btn" style="font-size:11px" onclick="whatsAtrasoProprietario('${im.id}')"><i class="ti ti-brand-whatsapp"></i>Avisar atraso</button>
          <button class="btn btn-primary btn-sm" style="font-size:11px" onclick="openRepModal('${im.id}','${mesStr}','${prop?prop.nome:''}','${prop?prop.pix:''}','${liq}')"><i class="ti ti-check"></i>Marcar repassado</button>`}
    </div></td>
  </tr>`).join('');
}

function changeRepMonth(dir) {
  if(!curRepMonth){const n=new Date();curRepMonth={y:n.getFullYear(),m:n.getMonth()};}
  curRepMonth.m+=dir;
  if(curRepMonth.m>11){curRepMonth.m=0;curRepMonth.y++;}
  if(curRepMonth.m<0){curRepMonth.m=11;curRepMonth.y--;}
  renderRepasses();
}
window.changeRepMonth = changeRepMonth;

function openRepModal(imovelId,mes,propNome,pix,liq) {
  document.getElementById('mrep-imovel-id').value=imovelId;
  document.getElementById('mrep-mes').value=mes;
  document.getElementById('mrep-sub').textContent=propNome||'Proprietário';
  document.getElementById('mrep-valor').value=parseFloat(liq).toFixed(2);
  document.getElementById('mrep-pix-area').innerHTML=pix?`<div class="pix-box"><i class="ti ti-brand-mastercard" style="color:var(--accent-text);font-size:18px"></i><span class="pix-key">${pix}</span><button class="btn btn-sm" onclick="copiarPix('${pix}')"><i class="ti ti-copy"></i>Copiar</button></div>`:'';
  document.getElementById('modal-rep').classList.add('open');
}
window.openRepModal = openRepModal;

// ===== RENDER DETALHE =====
function renderDetalhe() {
  const im=DB.imoveis.find(x=>x.id===curImovelId);
  if(!im){goPage('imoveis');return;}
  const prop=DB.props.find(p=>p.id===im.propId);
  const inq=DB.inqs.find(i=>i.id===im.inqId);
  document.getElementById('det-nome').textContent=im.nome;
  document.getElementById('det-end').textContent=im.end||'Sem endereço';
  document.getElementById('det-edit-btn').onclick=()=>editImovel(im.id);
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
      <div style="display:flex;gap:6px;margin-top:12px">
        <button class="btn btn-sm whats-btn" style="flex:1;justify-content:center" onclick="whatsCobrancaInquilino('${im.id}',null)"><i class="ti ti-brand-whatsapp"></i>Cobrar aluguel</button>
        <button class="btn btn-sm whats-btn" style="flex:1;justify-content:center" onclick="whatsAvisoVencimento('${im.id}')"><i class="ti ti-brand-whatsapp"></i>Aviso vencimento</button>
      </div>`
    :'<p style="font-size:12px;color:var(--text2)">Nenhum inquilino vinculado.</p>';
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
    const [y,m]=p.mes.split('-');
    return `<tr><td>${MONTHS[parseInt(m)-1]} ${y}</td><td style="font-weight:600">${fmt(p.valor)}</td><td style="font-size:12px;color:var(--text2)">${p.data?p.data.split('-').reverse().join('/'):'—'}</td><td>${badgeHtml(p.status)}</td><td style="font-size:12px;color:var(--text2)">${p.obs||'—'}</td></tr>`;
  }).join('');
}

// ===== DASHBOARD =====
function renderDashboard() {
  const now=new Date();
  const mes=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const hora=now.getHours();
  const saudacao=hora<12?'Bom dia':hora<18?'Boa tarde':'Boa noite';
  document.getElementById('dash-greeting').textContent=`${saudacao}, Gerson! 👋`;
  document.getElementById('dash-sub').textContent=`${MONTHS[now.getMonth()]} ${now.getFullYear()} · ${DB.imoveis.length} imóvel(is) gerenciado(s)`;
  const pagos=DB.imoveis.filter(im=>{const p=DB.pags.find(x=>x.imovelId===im.id&&x.mes===mes);return p&&p.status==='pago';});
  const total=DB.pags.filter(p=>p.mes===mes&&p.status==='pago').reduce((s,p)=>s+p.valor,0);
  const pend=DB.imoveis.filter(im=>{const p=DB.pags.find(x=>x.imovelId===im.id&&x.mes===mes);return !p||p.status==='pendente';});
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
  const pendImoveis=DB.imoveis.filter(im=>{const p=DB.pags.find(x=>x.imovelId===im.id&&x.mes===mes);return !p||p.status!=='pago';});
  const pendList=document.getElementById('dash-pend-list');
  if(!pendImoveis.length){
    pendList.innerHTML=`<div class="empty-state" style="padding:24px"><i class="ti ti-check"></i><p>Tudo em dia! Parabéns!</p><span>Todos os imóveis estão com pagamento confirmado</span></div>`;
  } else {
    pendList.innerHTML=`<table><thead><tr><th style="width:30%">Imóvel</th><th style="width:24%">Inquilino</th><th style="width:16%">Valor</th><th style="width:14%">Status</th><th style="width:125px"></th></tr></thead><tbody>`+
    pendImoveis.map(im=>{
      const inq=DB.inqs.find(i=>i.id===im.inqId);
      const p=DB.pags.find(x=>x.imovelId===im.id&&x.mes===mes);
      return `<tr>
        <td><strong class="link-text" onclick="goPage('detalhe','${im.id}')">${im.nome}</strong></td>
        <td>${inq?inq.nome:'—'}</td>
        <td style="font-weight:600">${fmtShort(im.valor)}</td>
        <td>${badgeHtml(p?p.status:'pendente')}</td>
        <td><div class="acts">
          <button class="btn btn-sm whats-btn" onclick="whatsCobrancaInquilino('${im.id}','${mes}')"><i class="ti ti-brand-whatsapp"></i></button>
          <button class="btn btn-primary btn-sm" onclick="curImovelId='${im.id}';openModal('modal-pag')"><i class="ti ti-plus"></i>Registrar</button>
        </div></td>
      </tr>`;
    }).join('')+'</tbody></table>';
  }
  const totalLiq=pagos.reduce((s,im)=>{const p=DB.pags.find(x=>x.imovelId===im.id&&x.mes===mes);return s+(p?p.valor-(im.comissao||10)/100*p.valor:0);},0);
  const banner=document.getElementById('dash-repasse-banner');
  if(pagos.length>0){
    banner.style.display='flex';
    document.getElementById('dash-rep-title').textContent=`Repasse de ${MONTHS[now.getMonth()]} — dia 15`;
    document.getElementById('dash-rep-sub').textContent=`${pagos.length} proprietário(s) com pagamento confirmado`;
    document.getElementById('dash-rep-val').textContent=fmtShort(totalLiq);
  } else { banner.style.display='none'; }
}

function renderNavBadges() {
  document.getElementById('nb-imoveis').textContent=DB.imoveis.length;
  const now=new Date();
  const mes=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const pend=DB.imoveis.filter(im=>{const p=DB.pags.find(x=>x.imovelId===im.id&&x.mes===mes);return !p||p.status!=='pago';}).length;
  const nb=document.getElementById('nb-pag');
  if(pend>0){nb.style.display='';nb.textContent=pend;}else{nb.style.display='none';}
  document.getElementById('notif-dot').style.display=pend>0?'':'none';
}

function renderTudo() {
  renderDashboard(); renderNavBadges();
  if(curPage==='imoveis') renderImoveis();
  else if(curPage==='pagamentos') renderPagamentos();
  else if(curPage==='repasses') renderRepasses();
  else if(curPage==='proprietarios') renderProps();
  else if(curPage==='inquilinos') renderInqs();
  else if(curPage==='detalhe') renderDetalhe();
}

// ===== COPIAR PIX =====
function copiarPix(pix) {
  navigator.clipboard.writeText(pix).then(()=>showToast('✅ Chave PIX copiada!')).catch(()=>showToast('PIX: '+pix));
}
window.copiarPix = copiarPix;

// ===== WHATSAPP =====
function limparTel(tel) {
  if(!tel) return '';
  let n=tel.replace(/\D/g,'');
  if(n.startsWith('0')) n=n.slice(1);
  if(n.length===11||n.length===10) n='55'+n;
  return n;
}

function abrirWhatsApp(tel, mensagem) {
  const numero=limparTel(tel);
  if(!numero){showToast('⚠️ Número de telefone não cadastrado');return;}
  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`,'_blank');
}

function abrirModalWhats(titulo, tel, mensagem) {
  document.getElementById('mw-titulo').textContent=titulo;
  document.getElementById('mw-tel').value=tel||'';
  document.getElementById('mw-msg').value=mensagem;
  document.getElementById('mw-preview').textContent=mensagem;
  document.getElementById('mw-msg').oninput=function(){document.getElementById('mw-preview').textContent=this.value;};
  document.getElementById('modal-whats').classList.add('open');
}

function enviarWhatsApp() {
  const tel=document.getElementById('mw-tel').value.trim();
  const msg=document.getElementById('mw-msg').value.trim();
  if(!tel){showToast('⚠️ Informe o número de WhatsApp');return;}
  if(!msg){showToast('⚠️ A mensagem está vazia');return;}
  abrirWhatsApp(tel,msg);
  closeModal('modal-whats');
  showToast('📱 Abrindo WhatsApp...');
}
window.enviarWhatsApp = enviarWhatsApp;

function whatsCobrancaInquilino(imovelId, mesRef) {
  const im=DB.imoveis.find(x=>x.id===imovelId); if(!im) return;
  const inq=DB.inqs.find(i=>i.id===im.inqId); if(!inq){showToast('⚠️ Inquilino não cadastrado');return;}
  const now=new Date();
  const mes=mesRef||`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const [y,m]=mes.split('-');
  const nomeMes=MONTHS[parseInt(m)-1]+' '+y;
  const msg=`Olá, ${inq.nome}! Tudo bem?\n\nPassando para lembrar que o aluguel referente a *${nomeMes}* do imóvel *${im.nome}* está com vencimento no dia *${im.venc}*.\n\n💰 *Valor: ${fmt(im.valor)}*\n\nApós realizar o pagamento, por favor envie o comprovante para minha confirmação.\n\nQualquer dúvida estou à disposição! 😊\n\nAtenciosamente,\n*Gerson Rosa — Corretor de Imóveis*`;
  abrirModalWhats(`Cobrar inquilino — ${inq.nome}`, inq.tel, msg);
}
window.whatsCobrancaInquilino = whatsCobrancaInquilino;

function whatsConfirmacaoInquilino(imovelId, mesRef) {
  const im=DB.imoveis.find(x=>x.id===imovelId); if(!im) return;
  const inq=DB.inqs.find(i=>i.id===im.inqId); if(!inq){showToast('⚠️ Inquilino não cadastrado');return;}
  const now=new Date();
  const mes=mesRef||`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const [y,m]=mes.split('-');
  const nomeMes=MONTHS[parseInt(m)-1]+' '+y;
  const pag=DB.pags.find(p=>p.imovelId===imovelId&&p.mes===mes);
  const valor=pag?fmt(pag.valor):fmt(im.valor);
  const msg=`Olá, ${inq.nome}! Tudo bem?\n\n✅ Confirmo o recebimento do pagamento referente a *${nomeMes}* no valor de *${valor}*.\n\nObrigado pela pontualidade! 👍\n\nQualquer dúvida estou à disposição.\n\nAtenciosamente,\n*Gerson Rosa — Corretor de Imóveis*`;
  abrirModalWhats(`Confirmar recebimento — ${inq.nome}`, inq.tel, msg);
}
window.whatsConfirmacaoInquilino = whatsConfirmacaoInquilino;

function whatsAvisoVencimento(imovelId) {
  const im=DB.imoveis.find(x=>x.id===imovelId); if(!im) return;
  const inq=DB.inqs.find(i=>i.id===im.inqId); if(!inq){showToast('⚠️ Inquilino não cadastrado');return;}
  const now=new Date();
  const nomeMes=MONTHS[now.getMonth()]+' '+now.getFullYear();
  const msg=`Olá, ${inq.nome}! Tudo bem?\n\nPassando para lembrar que o vencimento do aluguel de *${nomeMes}* do imóvel *${im.nome}* será no dia *${im.venc}*.\n\n💰 *Valor: ${fmt(im.valor)}*\n\nApós o pagamento, não esqueça de me enviar o comprovante. 😊\n\nAtenciosamente,\n*Gerson Rosa — Corretor de Imóveis*`;
  abrirModalWhats(`Aviso de vencimento — ${inq.nome}`, inq.tel, msg);
}
window.whatsAvisoVencimento = whatsAvisoVencimento;

function whatsRepasseProprietario(imovelId, mesRef) {
  const im=DB.imoveis.find(x=>x.id===imovelId); if(!im) return;
  const prop=DB.props.find(p=>p.id===im.propId); if(!prop){showToast('⚠️ Proprietário não cadastrado');return;}
  const now=new Date();
  const mes=mesRef||`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const [y,m]=mes.split('-');
  const nomeMes=MONTHS[parseInt(m)-1]+' '+y;
  const pag=DB.pags.find(p=>p.imovelId===imovelId&&p.mes===mes&&p.status==='pago');
  const valorAluguel=pag?pag.valor:im.valor;
  const comissao=(im.comissao||10)/100*valorAluguel;
  const liquido=valorAluguel-comissao;
  const msg=`Olá, ${prop.nome}! Tudo bem?\n\nInformo que realizei o repasse referente ao aluguel de *${nomeMes}* do imóvel *${im.nome}*.\n\n📋 *Detalhamento:*\n• Aluguel recebido: ${fmt(valorAluguel)}\n• Comissão (${im.comissao||10}%): - ${fmt(comissao)}\n• *Valor repassado: ${fmt(liquido)}*\n\n${prop.pix?`💳 *Chave PIX:* ${prop.pix}\n\n`:''}Qualquer dúvida estou à disposição!\n\nAtenciosamente,\n*Gerson Rosa — Corretor de Imóveis*`;
  abrirModalWhats(`Aviso de repasse — ${prop.nome}`, prop.tel, msg);
}
window.whatsRepasseProprietario = whatsRepasseProprietario;

function whatsAtrasoProprietario(imovelId) {
  const im=DB.imoveis.find(x=>x.id===imovelId); if(!im) return;
  const prop=DB.props.find(p=>p.id===im.propId); if(!prop){showToast('⚠️ Proprietário não cadastrado');return;}
  const inq=DB.inqs.find(i=>i.id===im.inqId);
  const now=new Date();
  const nomeMes=MONTHS[now.getMonth()]+' '+now.getFullYear();
  const msg=`Olá, ${prop.nome}! Tudo bem?\n\nGostaria de informar que o aluguel referente a *${nomeMes}* do imóvel *${im.nome}* ainda não foi recebido${inq?` do inquilino *${inq.nome}*`:''}.\n\nJá estou realizando a cobrança e assim que receber farei o repasse imediatamente.\n\nMantenho você informado!\n\nAtenciosamente,\n*Gerson Rosa — Corretor de Imóveis*`;
  abrirModalWhats(`Informar atraso — ${prop.nome}`, prop.tel, msg);
}
window.whatsAtrasoProprietario = whatsAtrasoProprietario;

function whatsPersonalizado(nome, tel) {
  abrirModalWhats(`Mensagem para ${nome}`, tel, `Olá, ${nome}! Tudo bem?\n\n\n\nAtenciosamente,\n*Gerson Rosa — Corretor de Imóveis*`);
}
window.whatsPersonalizado = whatsPersonalizado;

// ===== AUTH STATE OBSERVER =====
onAuthStateChanged(auth, user => {
  document.getElementById('tela-loading').style.display='none';
  if (user) {
    currentUser = user;
    document.getElementById('tela-login').style.display='none';
    document.getElementById('app').style.display='grid';
    iniciarListeners();
  } else {
    currentUser = null;
    unsubListeners.forEach(u=>u());
    unsubListeners=[];
    DB={props:[],inqs:[],imoveis:[],pags:[],repasses:[]};
    document.getElementById('app').style.display='none';
    document.getElementById('tela-login').style.display='flex';
  }
});

// Expor curImovelId globalmente para os botões inline
window.curImovelId = null;
Object.defineProperty(window,'curImovelId',{get:()=>curImovelId,set:v=>{curImovelId=v;}});
