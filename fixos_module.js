
// ==========================================================================
// MÓDULO: DESPESAS FIXAS (FIXOS TAB)
// ==========================================================================

// Despesas fixas pré-definidas importadas da planilha (base inicial)
const INITIAL_FIXOS = {
  empresa: [
    { id: 'fix_emp_001', tipo: 'empresa', descricao: 'Aluguel do escritório', valor: 1000, diaVencimento: 22, categoria: 'Custos Fixos', recorrente: true, ativo: true },
    { id: 'fix_emp_002', tipo: 'empresa', descricao: 'Estacionamento Citta', valor: 260, diaVencimento: 22, categoria: 'Custos Fixos', recorrente: true, ativo: true },
    { id: 'fix_emp_003', tipo: 'empresa', descricao: 'Google One', valor: 96.99, diaVencimento: 24, categoria: 'Custos Fixos', recorrente: true, ativo: true },
    { id: 'fix_emp_004', tipo: 'empresa', descricao: 'Adobe Creative Cloud', valor: 129, diaVencimento: 1, categoria: 'Custos Fixos', recorrente: true, ativo: true },
    { id: 'fix_emp_005', tipo: 'empresa', descricao: 'Capcut Pro', valor: 65.9, diaVencimento: 26, categoria: 'Custos Variáveis', recorrente: true, ativo: true },
    { id: 'fix_emp_006', tipo: 'empresa', descricao: 'Internet Recreio', valor: 100, diaVencimento: 25, categoria: 'Custos Fixos', recorrente: true, ativo: true },
    { id: 'fix_emp_007', tipo: 'empresa', descricao: 'Contador / Honorários', valor: 400, diaVencimento: null, categoria: 'Custos Fixos', recorrente: true, ativo: true },
    { id: 'fix_emp_008', tipo: 'empresa', descricao: 'DAS Simples Nacional', valor: 0, diaVencimento: 20, categoria: 'Impostos e Taxas', recorrente: true, ativo: true },
    { id: 'fix_emp_009', tipo: 'empresa', descricao: 'INSS Pró-labore', valor: 0, diaVencimento: 20, categoria: 'Impostos e Taxas', recorrente: true, ativo: true },
  ],
  pessoal: [
    { id: 'fix_pes_001', tipo: 'pessoal', descricao: 'Aluguel', valor: 1350, diaVencimento: 1, categoria: 'Moradia', recorrente: true, ativo: true },
    { id: 'fix_pes_002', tipo: 'pessoal', descricao: 'Condomínio', valor: 0, diaVencimento: 1, categoria: 'Moradia', recorrente: true, ativo: true },
    { id: 'fix_pes_003', tipo: 'pessoal', descricao: 'IPTU Lusitania (parcela)', valor: 290, diaVencimento: 1, categoria: 'Moradia', recorrente: true, ativo: true },
    { id: 'fix_pes_004', tipo: 'pessoal', descricao: 'Nu Seguro Celular', valor: 66.12, diaVencimento: 21, categoria: 'Serviços', recorrente: true, ativo: true },
    { id: 'fix_pes_005', tipo: 'pessoal', descricao: 'Vivo', valor: 0, diaVencimento: 1, categoria: 'Serviços', recorrente: true, ativo: true },
    { id: 'fix_pes_006', tipo: 'pessoal', descricao: 'Light', valor: 0, diaVencimento: 7, categoria: 'Moradia', recorrente: true, ativo: true },
    { id: 'fix_pes_007', tipo: 'pessoal', descricao: 'Gás', valor: 0, diaVencimento: 7, categoria: 'Moradia', recorrente: true, ativo: true },
    { id: 'fix_pes_008', tipo: 'pessoal', descricao: 'YouTube Premium', valor: 25.92, diaVencimento: 12, categoria: 'Lazer & Assinaturas', recorrente: true, ativo: true },
    { id: 'fix_pes_009', tipo: 'pessoal', descricao: 'Rosa / Maria (diarista 1)', valor: 220, diaVencimento: 15, categoria: 'Moradia', recorrente: true, ativo: true },
    { id: 'fix_pes_010', tipo: 'pessoal', descricao: 'Rosa / Maria (diarista 2)', valor: 220, diaVencimento: null, categoria: 'Moradia', recorrente: true, ativo: true },
    { id: 'fix_pes_011', tipo: 'pessoal', descricao: 'Barba', valor: 0, diaVencimento: 7, categoria: 'Saúde', recorrente: true, ativo: true },
    { id: 'fix_pes_012', tipo: 'pessoal', descricao: 'Plano de Saúde', valor: 0, diaVencimento: null, categoria: 'Saúde', recorrente: true, ativo: true },
  ]
};

// Estado do modal
let fixoModalType = 'empresa'; // 'empresa' ou 'pessoal'

function initFixosData() {
  // Inicializa fixos se não existir no db
  if (!db.fixos) {
    db.fixos = JSON.parse(JSON.stringify(INITIAL_FIXOS));
    saveDatabase();
  } else {
    // Garante que arrays empresa e pessoal existam
    if (!db.fixos.empresa) db.fixos.empresa = JSON.parse(JSON.stringify(INITIAL_FIXOS.empresa));
    if (!db.fixos.pessoal) db.fixos.pessoal = JSON.parse(JSON.stringify(INITIAL_FIXOS.pessoal));
  }
  // Inicializa status por mês
  if (!db.fixos_status) {
    db.fixos_status = {};
    saveDatabase();
  }
}

function getFixosStatusKey() {
  return selectedMonth || 'Geral';
}

function getFixoStatus(fixoId) {
  const key = getFixosStatusKey();
  if (!db.fixos_status[key]) return 'pendente';
  return db.fixos_status[key][fixoId] || 'pendente';
}

function setFixoStatus(fixoId, status) {
  const key = getFixosStatusKey();
  if (!db.fixos_status[key]) db.fixos_status[key] = {};
  db.fixos_status[key][fixoId] = status;
  saveDatabase();
}

function toggleFixoStatus(fixoId) {
  const current = getFixoStatus(fixoId);
  const next = current === 'pago' ? 'pendente' : 'pago';
  setFixoStatus(fixoId, next);
  renderFixosView();
  const msg = next === 'pago' ? '✅ Marcado como pago!' : '↩️ Desmarcado';
  showToast(msg, next === 'pago' ? 'success' : 'info');
}

function deleteFixo(fixoId, tipo) {
  if (!confirm('Remover esta despesa fixa?')) return;
  db.fixos[tipo] = db.fixos[tipo].filter(f => f.id !== fixoId);
  saveDatabase();
  renderFixosView();
  showToast('🗑️ Despesa fixa removida', 'info');
}

function formatDueDate(dia) {
  if (!dia) return '';
  const today = new Date();
  return `Venc. dia ${dia}`;
}

function isDueOverdue(dia) {
  if (!dia) return false;
  const today = new Date();
  const currentDay = today.getDate();
  return dia < currentDay;
}

function buildFixoItemHTML(fixo) {
  const status = getFixoStatus(fixo.id);
  const isPaid = status === 'pago';
  const dueText = fixo.diaVencimento ? formatDueDate(fixo.diaVencimento) : '';
  const overdue = !isPaid && fixo.diaVencimento ? isDueOverdue(fixo.diaVencimento) : false;
  
  const statusIcon = isPaid ? '✓' : (overdue ? '!' : '');
  const statusClass = isPaid ? 'status-paid' : (overdue ? 'status-late' : '');
  const itemClass = isPaid ? 'fixo-item is-paid' : 'fixo-item';
  const valorStr = fixo.valor > 0 ? formatCurrency(fixo.valor) : 'A definir';
  const valorClass = fixo.valor <= 0 ? 'fixo-item-value zero' : 'fixo-item-value';

  return `
    <div class="${itemClass}" data-fixo-id="${fixo.id}" data-fixo-tipo="${fixo.tipo}">
      <button class="fixo-status-btn ${statusClass}" onclick="toggleFixoStatus('${fixo.id}')" title="${isPaid ? 'Clique para desmarcar' : 'Clique para marcar como pago'}">
        ${statusIcon}
      </button>
      <div class="fixo-item-body">
        <div class="fixo-item-name">${fixo.descricao}</div>
        <div class="fixo-item-meta">
          <span class="fixo-item-cat">${fixo.categoria}</span>
          ${dueText ? `<span class="fixo-item-due ${overdue && !isPaid ? 'overdue' : ''}">${dueText}${overdue && !isPaid ? ' ⚠️' : ''}</span>` : ''}
          ${fixo.recorrente ? '<span class="fixo-recorrente-badge">🔁 Fixo</span>' : ''}
        </div>
      </div>
      <div class="fixo-item-right">
        <span class="${valorClass}">${valorStr}</span>
        <div class="fixo-item-actions">
          <button class="fixo-action-btn" onclick="editFixo('${fixo.id}', '${fixo.tipo}')" title="Editar">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="fixo-action-btn" onclick="deleteFixo('${fixo.id}', '${fixo.tipo}')" title="Remover" style="color: var(--danger-color)">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderFixosView() {
  initFixosData();

  // Update month label
  const monthLabel = document.getElementById('fixos-month-label');
  if (monthLabel) monthLabel.textContent = selectedMonth || 'Mês atual';

  // Render Empresa section
  const listaEmpresa = document.getElementById('fixos-list-empresa');
  const fixosEmpresa = db.fixos.empresa || [];
  
  let empPago = 0, empTotal = 0;
  const empHTML = fixosEmpresa.map(f => {
    empTotal += f.valor;
    if (getFixoStatus(f.id) === 'pago') empPago += f.valor;
    return buildFixoItemHTML(f);
  }).join('');
  
  if (listaEmpresa) {
    listaEmpresa.innerHTML = empHTML || '<div class="fixos-empty">Nenhuma despesa fixa da empresa. Clique em "+ Adicionar" para começar.</div>';
  }

  // Render Pessoal section
  const listaPessoal = document.getElementById('fixos-list-pessoal');
  const fixosPessoal = db.fixos.pessoal || [];

  let pesPago = 0, pesTotal = 0;
  const pesHTML = fixosPessoal.map(f => {
    pesTotal += f.valor;
    if (getFixoStatus(f.id) === 'pago') pesPago += f.valor;
    return buildFixoItemHTML(f);
  }).join('');

  if (listaPessoal) {
    listaPessoal.innerHTML = pesHTML || '<div class="fixos-empty">Nenhuma despesa fixa pessoal. Clique em "+ Adicionar" para começar.</div>';
  }

  // Update section summaries
  const empSummary = document.getElementById('fixos-empresa-summary');
  if (empSummary) empSummary.textContent = `${formatCurrency(empPago)} / ${formatCurrency(empTotal)}`;

  const pesSummary = document.getElementById('fixos-pessoal-summary');
  if (pesSummary) pesSummary.textContent = `${formatCurrency(pesPago)} / ${formatCurrency(pesTotal)}`;

  // Progress bars
  const empBar = document.getElementById('fixos-empresa-bar');
  if (empBar) empBar.style.width = empTotal > 0 ? `${Math.min(100, (empPago / empTotal) * 100)}%` : '0%';

  const pesBar = document.getElementById('fixos-pessoal-bar');
  if (pesBar) pesBar.style.width = pesTotal > 0 ? `${Math.min(100, (pesPago / pesTotal) * 100)}%` : '0%';

  // Summary cards
  const totalPrevisto = empTotal + pesTotal;
  const totalPago = empPago + pesPago;
  const totalPendente = totalPrevisto - totalPago;

  const elPrevisto = document.getElementById('fixos-total-previsto');
  const elPago = document.getElementById('fixos-total-pago');
  const elPendente = document.getElementById('fixos-total-pendente');

  if (elPrevisto) elPrevisto.textContent = formatCurrency(totalPrevisto);
  if (elPago) elPago.textContent = formatCurrency(totalPago);
  if (elPendente) elPendente.textContent = formatCurrency(totalPendente);

  // Progress badge
  const badge = document.getElementById('fixos-progress-badge');
  const pct = totalPrevisto > 0 ? Math.round((totalPago / totalPrevisto) * 100) : 0;
  if (badge) badge.textContent = `${pct}% pago`;

  // Re-init lucide icons for dynamically created elements
  lucide.createIcons();
}

function initFixosTab() {
  initFixosData();

  // Collapsible section headers
  ['empresa', 'pessoal'].forEach(tipo => {
    const toggle = document.getElementById(`fixos-section-${tipo}-toggle`);
    const section = document.getElementById(`fixos-section-${tipo}`);
    if (toggle && section) {
      toggle.addEventListener('click', () => {
        section.classList.toggle('collapsed');
      });
    }
  });

  // Add button (global)
  const btnAdd = document.getElementById('btn-add-fixo');
  if (btnAdd) {
    btnAdd.addEventListener('click', () => openAddFixoModal('empresa'));
  }

  // Add inline buttons
  const btnAddEmpresa = document.getElementById('btn-add-fixo-empresa');
  if (btnAddEmpresa) {
    btnAddEmpresa.addEventListener('click', () => openAddFixoModal('empresa'));
  }

  const btnAddPessoal = document.getElementById('btn-add-fixo-pessoal');
  if (btnAddPessoal) {
    btnAddPessoal.addEventListener('click', () => openAddFixoModal('pessoal'));
  }

  // Link to full transactions history
  const btnViewAll = document.getElementById('btn-view-all-from-fixos');
  if (btnViewAll) {
    btnViewAll.addEventListener('click', () => switchTab('transactions'));
  }

  // Modal controls
  const btnClose = document.getElementById('btn-close-add-fixo');
  if (btnClose) btnClose.addEventListener('click', closeAddFixoModal);

  const btnCancel = document.getElementById('btn-cancel-add-fixo');
  if (btnCancel) btnCancel.addEventListener('click', closeAddFixoModal);

  const overlay = document.getElementById('modal-add-fixo-overlay');
  if (overlay) overlay.addEventListener('click', closeAddFixoModal);

  const btnSave = document.getElementById('btn-save-add-fixo');
  if (btnSave) btnSave.addEventListener('click', saveNewFixo);

  // Type toggle buttons in modal
  document.querySelectorAll('.btn-type-select').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-type-select').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      fixoModalType = btn.dataset.fixoType;
    });
  });

  renderFixosView();
}

function openAddFixoModal(tipo) {
  fixoModalType = tipo || 'empresa';
  
  // Reset form
  const form = document.getElementById('form-add-fixo');
  if (form) form.reset();

  // Set active type button
  document.querySelectorAll('.btn-type-select').forEach(b => {
    b.classList.toggle('active', b.dataset.fixoType === fixoModalType);
  });

  document.getElementById('modal-add-fixo').classList.remove('hidden');
  const inp = document.getElementById('fixo-descricao');
  if (inp) setTimeout(() => inp.focus(), 100);
  lucide.createIcons();
}

function closeAddFixoModal() {
  document.getElementById('modal-add-fixo').classList.add('hidden');
}

function saveNewFixo() {
  const descricao = document.getElementById('fixo-descricao')?.value?.trim();
  const valorRaw = document.getElementById('fixo-valor')?.value;
  const dia = parseInt(document.getElementById('fixo-dia')?.value) || null;
  const categoria = document.getElementById('fixo-categoria')?.value || 'Custos Fixos';
  const obs = document.getElementById('fixo-obs')?.value?.trim() || '';

  if (!descricao) {
    showToast('Informe a descrição da despesa', 'error');
    return;
  }

  const valor = parseFloat(valorRaw) || 0;

  const novo = {
    id: `fix_${fixoModalType.substring(0,3)}_${Date.now()}_${Math.random().toString(36).substr(2,4)}`,
    tipo: fixoModalType,
    descricao,
    valor,
    diaVencimento: dia,
    categoria,
    observacao: obs,
    recorrente: true,
    ativo: true
  };

  if (!db.fixos[fixoModalType]) db.fixos[fixoModalType] = [];
  db.fixos[fixoModalType].push(novo);
  saveDatabase();
  closeAddFixoModal();
  renderFixosView();
  showToast(`✅ "${descricao}" adicionada às despesas fixas!`, 'success');
}

function editFixo(fixoId, tipo) {
  const fixo = (db.fixos[tipo] || []).find(f => f.id === fixoId);
  if (!fixo) return;

  fixoModalType = tipo;
  
  // Pre-fill form
  document.getElementById('fixo-descricao').value = fixo.descricao || '';
  document.getElementById('fixo-valor').value = fixo.valor || '';
  document.getElementById('fixo-dia').value = fixo.diaVencimento || '';
  document.getElementById('fixo-categoria').value = fixo.categoria || 'Custos Fixos';
  document.getElementById('fixo-obs').value = fixo.observacao || '';

  // Set active type button
  document.querySelectorAll('.btn-type-select').forEach(b => {
    b.classList.toggle('active', b.dataset.fixoType === tipo);
  });

  // Change save button to update
  const btnSave = document.getElementById('btn-save-add-fixo');
  if (btnSave) {
    btnSave.textContent = 'Atualizar';
    btnSave.onclick = () => updateFixo(fixoId, tipo);
  }

  document.getElementById('modal-add-fixo').classList.remove('hidden');
  lucide.createIcons();
}

function updateFixo(fixoId, tipo) {
  const idx = (db.fixos[tipo] || []).findIndex(f => f.id === fixoId);
  if (idx === -1) return;

  db.fixos[tipo][idx] = {
    ...db.fixos[tipo][idx],
    descricao: document.getElementById('fixo-descricao')?.value?.trim(),
    valor: parseFloat(document.getElementById('fixo-valor')?.value) || 0,
    diaVencimento: parseInt(document.getElementById('fixo-dia')?.value) || null,
    categoria: document.getElementById('fixo-categoria')?.value || 'Custos Fixos',
    observacao: document.getElementById('fixo-obs')?.value?.trim() || ''
  };

  saveDatabase();
  closeAddFixoModal();
  
  // Restore save button
  const btnSave = document.getElementById('btn-save-add-fixo');
  if (btnSave) {
    btnSave.textContent = 'Salvar';
    btnSave.onclick = saveNewFixo;
  }

  renderFixosView();
  showToast('✅ Despesa fixa atualizada!', 'success');
}
