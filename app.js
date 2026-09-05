/* ==========================================================================
   ANOTA AÃ  â€” CORE APPLICATION ENGINE (JS Vanilla)
   ========================================================================== */

// --- Global App State ---
let db = {
  entradas: [],
  empresa: [],
  pessoal: [],
  fixos: null,
  fixos_status: {}
};

// Current view filters
let activeTab = 'dashboard';
let selectedMonth = ''; // Format: "Maio 2026" or "Maio"
let selectedYear = '2026';
let flowChartMode = 'flow'; // 'flow' or 'categories'

// Speech Recognition Instance
let recognition = null;
let isRecording = false;
let lastVoiceTransaction = null;

// Predefined Categories (Extracted from Excel)
const CATEGORIES = {
  entradas: ['Fotografia', 'Filmagem', 'EdiÃ§Ã£o', 'Aluguel', 'Outros'],
  empresa: ['Custos VariÃ¡veis', 'Custos Fixos', 'Impostos e Taxas', 'Carro'],
  pessoal: ['AlimentaÃ§Ã£o', 'ServiÃ§os', 'Moradia', 'Lazer & Assinaturas', 'Carro', 'SaÃºde', 'AquisiÃ§Ãµes Pessoais', 'FamÃ­lia']
};

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'MarÃ§o', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// ==========================================================================
// 1. INITIALIZATION & DATABASE
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  initDatabase();
  initNavigation();
  initDashboard();
  initTransactions();
  initVoiceEngine();
  initSettings();
  initModals();
  initFixosTab();
  
  // Register service worker for PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('Service Worker registered successfully!', reg.scope))
        .catch(err => console.error('Service Worker registration failed:', err));
    });
  }

  // Initialize Lucide icons
  lucide.createIcons();
});

// Load database from localStorage or initialData.js
function initDatabase() {
  const localData = localStorage.getItem('anota-ai-data');
  if (localData) {
    try {
      db = JSON.parse(localData);
    } catch (e) {
      console.error('Error parsing local storage, using initial spreadsheet data', e);
      resetToDefaultSpreadsheet();
    }
  } else {
    // If first load and INITIAL_DATA is available (from initialData.js)
    if (typeof INITIAL_DATA !== 'undefined') {
      db = INITIAL_DATA;
      saveDatabase();
    } else {
      // Fallback empty database
      db = { entradas: [], empresa: [], pessoal: [] };
      saveDatabase();
    }
  }

  // Ensure monthly goals dictionary is initialized
  if (!db.goals) {
    db.goals = {
      "Maio": 10000,
      "Junho": 15000
    };
    saveDatabase();
  }
  
  // Determine standard active month based on actual latest data or current system month
  // Find the latest month present in the database to showcase the dashboard populated
  const allMonths = [...db.entradas, ...db.empresa, ...db.pessoal].map(x => x.mes);
  if (allMonths.length > 0) {
    // Take the most frequent or last month in list
    selectedMonth = allMonths[allMonths.length - 1];
  } else {
    const currentMonthIndex = new Date().getMonth();
    selectedMonth = MONTHS_PT[currentMonthIndex];
  }

  // Assign unique IDs to all items if they don't have them
  assignTransactionIds();
  saveDatabase();
}

function saveDatabase() {
  localStorage.setItem('anota-ai-data', JSON.stringify(db));
}

function assignTransactionIds() {
  const assign = (list, prefix) => {
    if (!list) return;
    list.forEach((x, index) => {
      if (!x.id) {
        x.id = `${prefix}_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`;
      }
    });
  };
  assign(db.entradas, 'in');
  assign(db.empresa, 'emp');
  assign(db.pessoal, 'pes');
}

function resetToDefaultSpreadsheet() {
  if (typeof INITIAL_DATA !== 'undefined') {
    db = JSON.parse(JSON.stringify(INITIAL_DATA)); // deep copy
    db.goals = {
      "Maio": 10000,
      "Junho": 15000
    };
    saveDatabase();
    alert('Dados da planilha Controle_Financeiro_2026.xlsx restaurados com sucesso!');
    location.reload();
  } else {
    alert('Erro: Dados originais nÃ£o encontrados.');
  }
}

function resetCurrentMonth(confirmRequired = true) {
  if (confirmRequired) {
    const confirmed = confirm(`Tem certeza de que deseja zerar todos os lanÃ§amentos do mÃªs de ${selectedMonth}? Essa operaÃ§Ã£o pode ser desfeita imediatamente.`);
    if (!confirmed) return;
  }

  // Backup current state for undo capability
  lastVoiceTransaction = {
    action: 'reset_month',
    month: selectedMonth,
    backup: {
      entradas: [...db.entradas],
      empresa: [...db.empresa],
      pessoal: [...db.pessoal]
    }
  };

  // Filter out the active selected month
  db.entradas = db.entradas.filter(x => x.mes.toLowerCase() !== selectedMonth.toLowerCase());
  db.empresa = db.empresa.filter(x => x.mes.toLowerCase() !== selectedMonth.toLowerCase());
  db.pessoal = db.pessoal.filter(x => x.mes.toLowerCase() !== selectedMonth.toLowerCase());

  saveDatabase();
  
  // Show Undo Button in Voice UI
  const voiceUndoCont = document.getElementById('voice-undo-container');
  if (voiceUndoCont) {
    voiceUndoCont.classList.remove('hidden');
  }

  showToast(
    `Contas do mÃªs de ${selectedMonth} zeradas com sucesso! ðŸ§¹`,
    'info',
    {
      label: 'Desfazer â†©ï¸',
      callback: () => undoLastVoiceTransaction()
    }
  );

  populateHistoryFilters();
  renderDashboard();
  
  // If we are currently on the Settings tab, refresh to update the active month indicators
  if (activeTab === 'settings') {
    renderSettingsView();
  }
}

// ==========================================================================
// 2. NAVIGATION (TAB SYSTEM)
// ==========================================================================

function initNavigation() {
  const navItems = document.querySelectorAll('.bottom-nav .nav-item');
  const panels = document.querySelectorAll('.tab-panel');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  // Header quick mic button
  document.getElementById('btn-quick-voice').addEventListener('click', () => {
    switchTab('voice');
    startVoiceRecording();
  });
}

function switchTab(tabId) {
  activeTab = tabId;
  
  // Update bottom navigation styling
  const navItems = document.querySelectorAll('.bottom-nav .nav-item');
  navItems.forEach(item => {
    if (item.getAttribute('data-tab') === tabId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Switch visible panels
  const panels = document.querySelectorAll('.tab-panel');
  panels.forEach(panel => {
    if (panel.id === `tab-${tabId}`) {
      panel.classList.remove('hidden');
    } else {
      panel.classList.add('hidden');
    }
  });

  // Special visual state for central mic highlight
  const voiceNav = document.getElementById('nav-voice');
  if (tabId === 'voice') {
    voiceNav.classList.add('active');
  } else {
    voiceNav.classList.remove('active');
  }

  // Refresh tab-specific views
  if (tabId === 'dashboard') {
    renderDashboard();
  } else if (tabId === 'transactions') {
    renderTransactionsList();
  } else if (tabId === 'settings') {
    renderSettingsView();
  } else if (tabId === 'fixos') {
    renderFixosView();
  }
}

// ==========================================================================
// 3. DASHBOARD CONTROLLER & GRAPHICS
// ==========================================================================

function initDashboard() {
  // Month navigators
  document.getElementById('btn-prev-month').addEventListener('click', () => navigateMonth(-1));
  document.getElementById('btn-next-month').addEventListener('click', () => navigateMonth(1));
  
  // Toggle Chart mode
  document.getElementById('btn-toggle-flow').addEventListener('click', () => toggleChartMode('flow'));
  document.getElementById('btn-toggle-categories').addEventListener('click', () => toggleChartMode('categories'));

  // View all link
  document.getElementById('btn-view-all-transactions').addEventListener('click', () => {
    switchTab('transactions');
  });

  // Goal edit triggers
  document.getElementById('btn-edit-goal').addEventListener('click', () => toggleGoalEditMode(true));
  document.getElementById('btn-cancel-goal').addEventListener('click', () => toggleGoalEditMode(false));
  document.getElementById('btn-save-goal').addEventListener('click', saveGoalValue);

  // Priority Details Block Event Listeners
  const btnPjFixed = document.getElementById('btn-details-pj-fixed');
  if (btnPjFixed) btnPjFixed.addEventListener('click', () => openObligationDetails('empresa', 'fixed'));

  const btnPjVar = document.getElementById('btn-details-pj-variable');
  if (btnPjVar) btnPjVar.addEventListener('click', () => openObligationDetails('empresa', 'variable'));

  const btnPfFixed = document.getElementById('btn-details-pf-fixed');
  if (btnPfFixed) btnPfFixed.addEventListener('click', () => openObligationDetails('pessoal', 'fixed'));

  const btnPfVar = document.getElementById('btn-details-pf-variable');
  if (btnPfVar) btnPfVar.addEventListener('click', () => openObligationDetails('pessoal', 'variable'));

  // Modal close buttons
  const btnCloseOverlay = document.getElementById('btn-close-obligation-overlay');
  if (btnCloseOverlay) btnCloseOverlay.addEventListener('click', closeObligationDetails);

  const btnCloseTop = document.getElementById('btn-close-obligation-top');
  if (btnCloseTop) btnCloseTop.addEventListener('click', closeObligationDetails);

  const btnCloseFoot = document.getElementById('btn-close-obligation-details');
  if (btnCloseFoot) btnCloseFoot.addEventListener('click', closeObligationDetails);

  renderDashboard();
}

// --- OBLIGATION DETAILS MODAL MODULE ---
let currentDetailsType = ''; // 'empresa' or 'pessoal'
let currentDetailsSubtype = ''; // 'fixed' or 'variable'

function openObligationDetails(type, subtype) {
  currentDetailsType = type;
  currentDetailsSubtype = subtype;

  const modal = document.getElementById('modal-obligation-details');
  const titleEl = document.getElementById('lbl-obligation-modal-title');
  const totalEl = document.getElementById('lbl-modal-total');
  const paidEl = document.getElementById('lbl-modal-paid');
  const pendingEl = document.getElementById('lbl-modal-pending');
  const listEl = document.getElementById('list-obligation-transactions');

  if (!modal || !listEl) return;

  // Set modal title
  const icon = type === 'empresa' ? 'ðŸ¢' : 'ðŸ‘¤';
  const typeLabel = type === 'empresa' ? 'Empresa' : 'Pessoal';
  const subtypeLabel = subtype === 'fixed' ? 'Custos Fixos (ObrigatÃ³rios)' : 'Custos VariÃ¡veis';
  titleEl.innerHTML = `<i data-lucide="${type === 'empresa' ? 'building-2' : 'user'}" class="text-green" style="width: 18px; height: 18px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> ${typeLabel} â€” ${subtypeLabel}`;

  // Filter transactions for active month and correct category type
  const filterByMonth = (list) => list.filter(item => item.mes.toLowerCase() === selectedMonth.toLowerCase());
  const activeList = filterByMonth(db[type]);

  const isFixedCategory = (category, type) => {
    const catLower = category.toLowerCase().trim();
    if (type === 'empresa') {
      return catLower === 'custos fixos';
    } else if (type === 'pessoal') {
      return catLower === 'moradia' || catLower === 'serviÃ§os' || catLower === 'servicos' || catLower === 'famÃ­lia' || catLower === 'familia';
    }
    return false;
  };

  const filtered = activeList.filter(t => {
    const isFixed = isFixedCategory(t.categoria, type);
    return subtype === 'fixed' ? isFixed : !isFixed;
  });

  // Calculate stats
  let totalSum = 0;
  let paidSum = 0;

  const isPaidTransaction = (t) => {
    if (!t.status) return false;
    const statusLower = t.status.toLowerCase();
    return statusLower.includes('pago') || statusLower.includes('âœ…') || statusLower.includes('entregue');
  };

  filtered.forEach(t => {
    totalSum += t.valor;
    if (isPaidTransaction(t)) {
      paidSum += t.valor;
    }
  });

  const pendingSum = totalSum - paidSum;

  // Set values
  totalEl.innerText = formatCurrency(totalSum);
  paidEl.innerText = formatCurrency(paidSum);
  pendingEl.innerText = formatCurrency(pendingSum);

  // Render rows
  listEl.innerHTML = '';
  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div style="text-align: center; padding: var(--spacing-md); color: var(--text-muted); font-size: 11px; background: rgba(255, 255, 255, 0.01); border-radius: var(--radius-md); border: 1px dashed rgba(255, 255, 255, 0.05);">
        Nenhum custo registrado neste grupo para o mÃªs de ${selectedMonth}.
      </div>
    `;
  } else {
    // Sort by date (latest first)
    filtered.sort((a, b) => {
      const dateA = a.data ? new Date(a.data) : new Date(0);
      const dateB = b.data ? new Date(b.data) : new Date(0);
      return dateB - dateA;
    });

    filtered.forEach(t => {
      const row = document.createElement('div');
      row.className = 'details-transaction-row animate-fade-in';

      const isPaid = isPaidTransaction(t);
      const statusClass = isPaid ? 'badge-paid' : 'badge-pending';
      const statusLabel = isPaid ? 'âœ… Pago' : 'â³ Pendente';
      const dateLabel = t.data ? formatDate(t.data) : 'Sem data';

      row.innerHTML = `
        <div class="details-trans-info">
          <span class="details-trans-title" title="${t.descricao}">${t.descricao}</span>
          <div class="details-trans-meta">
            <span class="details-trans-category">${t.categoria}</span>
            <span>Â·</span>
            <span>${dateLabel}</span>
          </div>
        </div>
        <div class="details-trans-right">
          <span class="details-trans-value">${formatCurrency(t.valor)}</span>
        </div>
      `;

      const rightDiv = row.querySelector('.details-trans-right');
      const badge = document.createElement('button');
      badge.type = 'button';
      badge.className = `badge-status-interactive ${statusClass}`;
      badge.innerText = statusLabel;
      
      // Directly attach dynamic click listener
      badge.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleTransactionStatus(type, t.id, t.descricao, t.valor, t.categoria, badge);
      });

      rightDiv.appendChild(badge);
      listEl.appendChild(row);
    });
  }

  // Re-create icons in the modal
  lucide.createIcons({
    attrs: {
      class: 'lucide-icon'
    },
    nameAttr: 'data-lucide'
  });

  // Show modal
  modal.classList.remove('hidden');
}

function closeObligationDetails() {
  const modal = document.getElementById('modal-obligation-details');
  if (modal) modal.classList.add('hidden');
}

function toggleTransactionStatus(type, id, fallbackDesc, fallbackVal, fallbackCat, badgeElement = null) {
  // Find transaction in correct array
  const list = db[type];
  if (!list) return;

  let transaction = null;
  if (id) {
    transaction = list.find(t => t.id === id);
  }

  // Resilient fallback match if ID is missing or mismatching
  if (!transaction && fallbackDesc) {
    transaction = list.find(t => 
      t.descricao === fallbackDesc && 
      t.valor === parseFloat(fallbackVal) && 
      t.categoria === fallbackCat
    );
  }

  if (!transaction) {
    console.error('LanÃ§amento nÃ£o encontrado para alteraÃ§Ã£o de status:', type, id, fallbackDesc);
    showToast('Erro: LanÃ§amento nÃ£o encontrado!', 'error');
    return;
  }

  const isPaidTransaction = (t) => {
    if (!t.status) return false;
    const statusLower = t.status.toLowerCase();
    return statusLower.includes('pago') || statusLower.includes('âœ…') || statusLower.includes('entregue');
  };

  const wasPaid = isPaidTransaction(transaction);

  if (wasPaid) {
    transaction.status = 'Pendente';
    showToast('Status alterado para Pendente â³', 'info');
  } else {
    transaction.status = 'âœ… Pago';
    showToast('Status alterado para Pago âœ…', 'success');
  }

  // Save changes
  saveDatabase();

  // If badgeElement was provided, update it in place directly in the DOM
  if (badgeElement) {
    const isPaidNow = !wasPaid;
    badgeElement.className = `badge-status-interactive ${isPaidNow ? 'badge-paid' : 'badge-pending'}`;
    badgeElement.innerText = isPaidNow ? 'âœ… Pago' : 'â³ Pendente';
    
    // Recalculate and update the totals in the modal top bar immediately
    updateModalTotals(type, currentDetailsSubtype);
  }

  // Refresh parent dashboard values and bars
  renderDashboard();

  // If no badgeElement, do a full list rebuild fallback
  if (!badgeElement) {
    openObligationDetails(currentDetailsType, currentDetailsSubtype);
  }
}

// Dynamically updates totals in the modal header
function updateModalTotals(type, subtype) {
  const totalEl = document.getElementById('lbl-modal-total');
  const paidEl = document.getElementById('lbl-modal-paid');
  const pendingEl = document.getElementById('lbl-modal-pending');

  if (!totalEl || !paidEl || !pendingEl) return;

  const filterByMonth = (list) => list.filter(item => item.mes.toLowerCase() === selectedMonth.toLowerCase());
  const activeList = filterByMonth(db[type]);

  const isFixedCategory = (category, type) => {
    const catLower = category.toLowerCase().trim();
    if (type === 'empresa') {
      return catLower === 'custos fixos';
    } else if (type === 'pessoal') {
      return catLower === 'moradia' || catLower === 'serviÃ§os' || catLower === 'servicos' || catLower === 'famÃ­lia' || catLower === 'familia';
    }
    return false;
  };

  const filtered = activeList.filter(t => {
    const isFixed = isFixedCategory(t.categoria, type);
    return subtype === 'fixed' ? isFixed : !isFixed;
  });

  let totalSum = 0;
  let paidSum = 0;

  const isPaidTransaction = (t) => {
    if (!t.status) return false;
    const statusLower = t.status.toLowerCase();
    return statusLower.includes('pago') || statusLower.includes('âœ…') || statusLower.includes('entregue');
  };

  filtered.forEach(t => {
    totalSum += t.valor;
    if (isPaidTransaction(t)) {
      paidSum += t.valor;
    }
  });

  const pendingSum = totalSum - paidSum;

  totalEl.innerText = formatCurrency(totalSum);
  paidEl.innerText = formatCurrency(paidSum);
  pendingEl.innerText = formatCurrency(pendingSum);
}

// Bind to window scope so inline onclick works
window.toggleTransactionStatus = toggleTransactionStatus;

function toggleGoalEditMode(show = true) {
  const viewMode = document.getElementById('goal-view-mode');
  const editMode = document.getElementById('goal-edit-mode');
  const inputVal = document.getElementById('input-goal-val');
  
  if (show === true) {
    viewMode.classList.add('hidden');
    editMode.classList.remove('hidden');
    const currentGoal = db.goals[selectedMonth] !== undefined ? db.goals[selectedMonth] : 10000;
    inputVal.value = currentGoal;
    inputVal.focus();
  } else {
    viewMode.classList.remove('hidden');
    editMode.classList.add('hidden');
  }
}

function saveGoalValue() {
  const inputVal = document.getElementById('input-goal-val');
  const newGoalValue = parseFloat(inputVal.value);
  
  if (isNaN(newGoalValue) || newGoalValue < 0) {
    alert('Por favor, insira um valor vÃ¡lido maior ou igual a zero.');
    return;
  }
  
  db.goals[selectedMonth] = newGoalValue;
  saveDatabase();
  
  toggleGoalEditMode(false);
  renderDashboard();
}

function navigateMonth(direction) {
  let index = MONTHS_PT.indexOf(selectedMonth);
  if (index === -1) index = 4; // default May
  
  index += direction;
  if (index < 0) index = 11;
  if (index > 11) index = 0;
  
  selectedMonth = MONTHS_PT[index];
  renderDashboard();
  if (activeTab === 'fixos') renderFixosView();
}

function toggleChartMode(mode) {
  flowChartMode = mode;
  const flowBtn = document.getElementById('btn-toggle-flow');
  const catBtn = document.getElementById('btn-toggle-categories');
  const flowContainer = document.getElementById('chart-flow-container');
  const catContainer = document.getElementById('chart-categories-container');

  if (mode === 'flow') {
    flowBtn.classList.add('active');
    catBtn.classList.remove('active');
    flowContainer.classList.remove('hidden');
    catContainer.classList.add('hidden');
    renderFlowChart();
  } else {
    flowBtn.classList.remove('active');
    catBtn.classList.add('active');
    flowContainer.classList.add('hidden');
    catContainer.classList.remove('hidden');
    renderCategoriesChart();
  }
}

function renderDashboard() {
  document.getElementById('label-current-month').innerText = `${selectedMonth} ${selectedYear}`;
  
  // 1. Calculations for Active Month
  const filterByMonth = (list) => list.filter(item => item.mes.toLowerCase() === selectedMonth.toLowerCase());
  
  const activeEntradas = filterByMonth(db.entradas);
  const activeEmpresa = filterByMonth(db.empresa);
  const activePessoal = filterByMonth(db.pessoal);
  
  const totalEntradas = activeEntradas.reduce((acc, x) => acc + x.valor, 0);
  const totalEmpresa = activeEmpresa.reduce((acc, x) => acc + x.valor, 0);
  const totalPessoal = activePessoal.reduce((acc, x) => acc + x.valor, 0);
  
  // Rental Income (check if there is aluguel income inside entradas, or inside pessoal as income)
  // Let's calculate net business income (Entradas - Empresa expenses)
  const empresaNet = totalEntradas - totalEmpresa;
  
  // Net Balance = Entradas - Empresa - Pessoal
  const netBalance = totalEntradas - totalEmpresa - totalPessoal;

  // 2. Update Hero Cards Values
  document.getElementById('val-net-balance').innerText = formatCurrency(netBalance);
  document.getElementById('val-net-balance').className = 'card-value ' + (netBalance >= 0 ? 'text-green' : 'text-red');
  
  document.getElementById('val-empresa-in').innerText = formatCurrency(totalEntradas);
  document.getElementById('val-empresa-out').innerText = formatCurrency(totalEmpresa);
  document.getElementById('lbl-empresa-result').innerText = `Resultado: ${formatCurrency(empresaNet)}`;
  document.getElementById('lbl-empresa-result').className = 'card-subtext ' + (empresaNet >= 0 ? 'text-green' : 'text-red');

  // Empresa Progress bar (ratio of costs over income)
  let empresaRatio = 0;
  if (totalEntradas > 0) {
    empresaRatio = Math.min((totalEmpresa / totalEntradas) * 100, 100);
  } else if (totalEmpresa > 0) {
    empresaRatio = 100;
  }
  document.getElementById('bar-empresa-ratio').style.width = `${empresaRatio}%`;
  document.getElementById('bar-empresa-ratio').className = `progress-fill ${empresaRatio > 80 ? 'danger-fill' : 'green-fill'}`;

  // Pessoal Card
  document.getElementById('val-pessoal-out').innerText = formatCurrency(totalPessoal);
  
  // Trend indicator for general balance
  const balanceTrend = document.getElementById('lbl-balance-trend');
  const balanceTrendPercentage = document.getElementById('val-balance-percentage');
  
  // Heuristic balance trend based on earnings ratio
  if (totalEntradas > 0) {
    const netRatio = Math.round((netBalance / totalEntradas) * 100);
    balanceTrendPercentage.innerText = `${Math.abs(netRatio)}%`;
    if (netRatio >= 0) {
      balanceTrend.className = 'trend-badge positive';
      balanceTrend.querySelector('i, svg').setAttribute('data-lucide', 'arrow-up-right');
    } else {
      balanceTrend.className = 'trend-badge warning';
      balanceTrend.querySelector('i, svg').setAttribute('data-lucide', 'arrow-down-right');
    }
  } else {
    balanceTrendPercentage.innerText = '0%';
    balanceTrend.className = 'trend-badge warning';
  }

  // Personal Expense Limit check (Warning if personal expenses exceed 50% of work income)
  const pessoalLimit = document.getElementById('lbl-pessoal-limit');
  const pessoalLimitText = document.getElementById('lbl-pessoal-limit-txt');
  if (totalEntradas > 0 && totalPessoal > totalEntradas * 0.6) {
    pessoalLimit.className = 'trend-badge warning';
    pessoalLimitText.innerText = 'Gasto Alto (PF > 60% PJ)';
  } else {
    pessoalLimit.className = 'trend-badge positive';
    pessoalLimitText.innerText = 'Controle SaudÃ¡vel';
  }

  // --- GOAL RENDER LOGIC ---
  const activeGoal = db.goals[selectedMonth] !== undefined ? db.goals[selectedMonth] : 10000;
  document.getElementById('val-goal-revenue').innerText = formatCurrency(totalEntradas);
  document.getElementById('val-goal-target').innerText = formatCurrency(activeGoal);

  let goalPercent = 0;
  if (activeGoal > 0) {
    goalPercent = Math.round((totalEntradas / activeGoal) * 100);
  } else if (totalEntradas > 0) {
    goalPercent = 100;
  }

  const barGoal = document.getElementById('bar-goal-progress');
  barGoal.style.width = `${Math.min(goalPercent, 100)}%`;

  const lblGoalPercent = document.getElementById('val-goal-percent');
  lblGoalPercent.innerText = `${goalPercent}% atingido`;

  const lblGoalStatus = document.getElementById('lbl-goal-status');
  const lblGoalRemaining = document.getElementById('lbl-goal-remaining');

  if (goalPercent >= 100) {
    lblGoalStatus.className = 'trend-badge positive';
    lblGoalStatus.querySelector('i, svg').setAttribute('data-lucide', 'check-circle');
    lblGoalRemaining.innerText = 'ParabÃ©ns! Meta de faturamento batida! ðŸŽ‰';
    lblGoalRemaining.className = 'card-subtext text-green';
    barGoal.className = 'progress-fill green-fill';
  } else {
    lblGoalStatus.className = 'trend-badge warning';
    lblGoalStatus.querySelector('i, svg').setAttribute('data-lucide', 'alert-circle');
    const remaining = activeGoal - totalEntradas;
    lblGoalRemaining.innerText = `Restam ${formatCurrency(remaining)} para bater a meta`;
    lblGoalRemaining.className = 'card-subtext';
    barGoal.className = 'progress-fill green-fill';
  }

  // --- PRIORIDADES DE PAGAMENTO ---
  // Helpers to classify PJ and PF obligations
  const isPaidTransaction = (t) => {
    if (!t.status) return false;
    const statusLower = t.status.toLowerCase();
    return statusLower.includes('pago') || statusLower.includes('âœ…') || statusLower.includes('entregue');
  };

  const isFixedCategory = (category, type) => {
    const catLower = category.toLowerCase().trim();
    if (type === 'empresa') {
      return catLower === 'custos fixos';
    } else if (type === 'pessoal') {
      return catLower === 'moradia' || catLower === 'serviÃ§os' || catLower === 'servicos' || catLower === 'famÃ­lia' || catLower === 'familia';
    }
    return false;
  };

  // Empresa PJ costs calculations
  let pjFixedTotal = 0;
  let pjFixedPaid = 0;
  let pjVarTotal = 0;
  let pjVarPaid = 0;

  activeEmpresa.forEach(t => {
    const isFixed = isFixedCategory(t.categoria, 'empresa');
    if (isFixed) {
      pjFixedTotal += t.valor;
      if (isPaidTransaction(t)) {
        pjFixedPaid += t.valor;
      }
    } else {
      pjVarTotal += t.valor;
      if (isPaidTransaction(t)) {
        pjVarPaid += t.valor;
      }
    }
  });

  const pjFixedPending = pjFixedTotal - pjFixedPaid;
  const pjVarPending = pjVarTotal - pjVarPaid;

  // Pessoal PF costs calculations
  let pfFixedTotal = 0;
  let pfFixedPaid = 0;
  let pfVarTotal = 0;
  let pfVarPaid = 0;

  activePessoal.forEach(t => {
    const isFixed = isFixedCategory(t.categoria, 'pessoal');
    if (isFixed) {
      pfFixedTotal += t.valor;
      if (isPaidTransaction(t)) {
        pfFixedPaid += t.valor;
      }
    } else {
      pfVarTotal += t.valor;
      if (isPaidTransaction(t)) {
        pfVarPaid += t.valor;
      }
    }
  });

  const pfFixedPending = pfFixedTotal - pfFixedPaid;
  const pfVarPending = pfVarTotal - pfVarPaid;

  // PJ UI injection
  document.getElementById('val-pj-fixed-summary').innerText = `${formatCurrency(pjFixedPaid)} / ${formatCurrency(pjFixedTotal)}`;
  document.getElementById('lbl-pj-fixed-paid').innerText = `Pago: ${formatCurrency(pjFixedPaid)}`;
  document.getElementById('lbl-pj-fixed-pending').innerText = `Pendente: ${formatCurrency(pjFixedPending)}`;

  let pjFixedPercent = 0;
  if (pjFixedTotal > 0) {
    pjFixedPercent = Math.min(Math.round((pjFixedPaid / pjFixedTotal) * 100), 100);
  } else {
    pjFixedPercent = 100;
  }
  const barPjFixed = document.getElementById('bar-pj-fixed');
  barPjFixed.style.width = `${pjFixedPercent}%`;
  barPjFixed.className = `progress-fill ${pjFixedPercent === 100 ? 'green-fill' : 'orange-fill'}`;

  document.getElementById('val-pj-variable-summary').innerText = `${formatCurrency(pjVarPaid)} / ${formatCurrency(pjVarTotal)}`;
  document.getElementById('lbl-pj-variable-paid').innerText = `Pago: ${formatCurrency(pjVarPaid)}`;
  document.getElementById('lbl-pj-variable-pending').innerText = `Pendente: ${formatCurrency(pjVarPending)}`;

  let pjVarPercent = 0;
  if (pjVarTotal > 0) {
    pjVarPercent = Math.min(Math.round((pjVarPaid / pjVarTotal) * 100), 100);
  } else {
    pjVarPercent = 100;
  }
  const barPjVar = document.getElementById('bar-pj-variable');
  barPjVar.style.width = `${pjVarPercent}%`;
  barPjVar.className = `progress-fill ${pjVarPercent === 100 ? 'green-fill' : 'blue-fill'}`;

  // PF UI injection
  document.getElementById('val-pf-fixed-summary').innerText = `${formatCurrency(pfFixedPaid)} / ${formatCurrency(pfFixedTotal)}`;
  document.getElementById('lbl-pf-fixed-paid').innerText = `Pago: ${formatCurrency(pfFixedPaid)}`;
  document.getElementById('lbl-pf-fixed-pending').innerText = `Pendente: ${formatCurrency(pfFixedPending)}`;

  let pfFixedPercent = 0;
  if (pfFixedTotal > 0) {
    pfFixedPercent = Math.min(Math.round((pfFixedPaid / pfFixedTotal) * 100), 100);
  } else {
    pfFixedPercent = 100;
  }
  const barPfFixed = document.getElementById('bar-pf-fixed');
  barPfFixed.style.width = `${pfFixedPercent}%`;
  barPfFixed.className = `progress-fill ${pfFixedPercent === 100 ? 'green-fill' : 'orange-fill'}`;

  document.getElementById('val-pf-variable-summary').innerText = `${formatCurrency(pfVarPaid)} / ${formatCurrency(pfVarTotal)}`;
  document.getElementById('lbl-pf-variable-paid').innerText = `Pago: ${formatCurrency(pfVarPaid)}`;
  document.getElementById('lbl-pf-variable-pending').innerText = `Pendente: ${formatCurrency(pfVarPending)}`;

  let pfVarPercent = 0;
  if (pfVarTotal > 0) {
    pfVarPercent = Math.min(Math.round((pfVarPaid / pfVarTotal) * 100), 100);
  } else {
    pfVarPercent = 100;
  }
  const barPfVar = document.getElementById('bar-pf-variable');
  barPfVar.style.width = `${pfVarPercent}%`;
  barPfVar.className = `progress-fill ${pfVarPercent === 100 ? 'green-fill' : 'blue-fill'}`;

  // Priority notice alert banner control
  const banner = document.getElementById('banner-obligation-priority');
  const lblPriorityMsg = document.getElementById('lbl-priority-msg');

  if (pjFixedPending > 0 || pfFixedPending > 0) {
    banner.classList.remove('hidden');
    if (pjFixedPending > 0 && pfFixedPending > 0) {
      lblPriorityMsg.innerText = `AtenÃ§Ã£o: HÃ¡ custos fixos PENDENTES na Empresa e no Pessoal! Pague-os primeiro.`;
    } else if (pjFixedPending > 0) {
      lblPriorityMsg.innerText = `AtenÃ§Ã£o: HÃ¡ custos fixos PENDENTES na Empresa! Foque em quitÃ¡-los.`;
    } else {
      lblPriorityMsg.innerText = `AtenÃ§Ã£o: HÃ¡ custos fixos PENDENTES no seu Pessoal (casa/famÃ­lia)! Quite-os logo.`;
    }
  } else {
    banner.classList.add('hidden');
  }

  lucide.createIcons();

  // 3. Render Active Chart
  if (flowChartMode === 'flow') {
    renderFlowChart();
  } else {
    renderCategoriesChart();
  }

  // 4. Render Recent Transactions List (Last 5 records)
  renderRecentTransactionsList();
}

// Draw pure crisp SVG Bar Chart for monthly cashflow comparison
function renderFlowChart() {
  const svg = document.getElementById('svg-flow-chart');
  if (!svg) return;
  svg.innerHTML = ''; // clear

  // Collect data for last 5 months relative to selected one
  const selIndex = MONTHS_PT.indexOf(selectedMonth);
  const monthsToShow = [];
  for (let i = -4; i <= 0; i++) {
    let mIdx = selIndex + i;
    if (mIdx < 0) mIdx += 12;
    if (mIdx > 11) mIdx -= 12;
    monthsToShow.push(MONTHS_PT[mIdx]);
  }

  const dataset = monthsToShow.map(mName => {
    const filterM = (list) => list.filter(item => item.mes.toLowerCase() === mName.toLowerCase());
    const inVal = filterM(db.entradas).reduce((acc, x) => acc + x.valor, 0);
    const outVal = filterM(db.empresa).reduce((acc, x) => acc + x.valor, 0) + 
                   filterM(db.pessoal).reduce((acc, x) => acc + x.valor, 0);
    return {
      month: mName.substring(0, 3), // e.g. "Mai"
      in: inVal,
      out: outVal
    };
  });

  // Chart bounds & scaling
  const width = 450;
  const height = 170;
  const paddingLeft = 35;
  const paddingRight = 10;
  const paddingTop = 15;
  const paddingBottom = 20;

  const maxVal = Math.max(...dataset.map(d => Math.max(d.in, d.out, 500)));
  const scaleY = (val) => height - paddingBottom - (val / maxVal) * (height - paddingTop - paddingBottom);
  const scaleX = (idx) => paddingLeft + (idx * (width - paddingLeft - paddingRight) / dataset.length);

  // Draw grid lines
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const yVal = (maxVal / gridLines) * i;
    const yPos = scaleY(yVal);
    
    // Line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', paddingLeft);
    line.setAttribute('y1', yPos);
    line.setAttribute('x2', width);
    line.setAttribute('y2', yPos);
    line.setAttribute('stroke', 'rgba(255, 255, 255, 0.05)');
    line.setAttribute('stroke-dasharray', '3,3');
    svg.appendChild(line);

    // Label
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', paddingLeft - 5);
    text.setAttribute('y', yPos + 3);
    text.setAttribute('text-anchor', 'end');
    text.setAttribute('fill', '#9ca3af');
    text.setAttribute('font-size', '8px');
    text.textContent = Math.round(yVal / 100) * 100;
    svg.appendChild(text);
  }

  // Draw Bars
  const barWidth = 14;
  dataset.forEach((d, i) => {
    const xPos = scaleX(i) + 15;
    
    // Green Bar (Incomes)
    const inHeight = (d.in / maxVal) * (height - paddingTop - paddingBottom);
    const inBar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    inBar.setAttribute('x', xPos);
    inBar.setAttribute('y', height - paddingBottom - inHeight);
    inBar.setAttribute('width', barWidth);
    inBar.setAttribute('height', inHeight);
    inBar.setAttribute('fill', '#10b981');
    inBar.setAttribute('rx', '3');
    svg.appendChild(inBar);

    // Red Bar (Expenses)
    const outHeight = (d.out / maxVal) * (height - paddingTop - paddingBottom);
    const outBar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    outBar.setAttribute('x', xPos + barWidth + 4);
    outBar.setAttribute('y', height - paddingBottom - outHeight);
    outBar.setAttribute('width', barWidth);
    outBar.setAttribute('height', outHeight);
    outBar.setAttribute('fill', '#ef4444');
    outBar.setAttribute('rx', '3');
    svg.appendChild(outBar);

    // Month text label below
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', xPos + barWidth);
    label.setAttribute('y', height - 5);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', '#9ca3af');
    label.setAttribute('font-weight', '500');
    label.textContent = d.month;
    svg.appendChild(label);
  });
}

function renderCategoriesChart() {
  const container = document.getElementById('category-progress-list');
  if (!container) return;
  container.innerHTML = ''; // clear

  // Sum expenses by category for current active month (both Empresa and Pessoal)
  const filterM = (list) => list.filter(item => item.mes.toLowerCase() === selectedMonth.toLowerCase());
  const activeEmpresa = filterM(db.empresa);
  const activePessoal = filterM(db.pessoal);
  
  const catTotals = {};
  
  activeEmpresa.forEach(x => {
    const key = `ðŸ¢ ${x.categoria}`;
    catTotals[key] = (catTotals[key] || 0) + x.valor;
  });
  
  activePessoal.forEach(x => {
    const key = `ðŸ‘¤ ${x.categoria}`;
    catTotals[key] = (catTotals[key] || 0) + x.valor;
  });

  const sortedCats = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1]);

  if (sortedCats.length === 0) {
    container.innerHTML = `<div class="chart-fallback"><p class="card-subtext">Nenhum custo registrado em ${selectedMonth}.</p></div>`;
    return;
  }

  const maxVal = sortedCats[0][1];

  sortedCats.forEach(([catName, total]) => {
    const percentage = Math.round((total / maxVal) * 100);
    const color = catName.startsWith('ðŸ¢') ? 'var(--primary-color)' : 'var(--warning-color)';
    
    const row = document.createElement('div');
    row.className = 'cat-progress-row';
    row.innerHTML = `
      <div class="cat-progress-meta">
        <span class="cat-progress-label">${catName}</span>
        <span class="cat-progress-value">${formatCurrency(total)}</span>
      </div>
      <div class="cat-progress-bg">
        <div class="cat-progress-fill" style="width: ${percentage}%; background-color: ${color};"></div>
      </div>
    `;
    container.appendChild(row);
  });
}

function renderRecentTransactionsList() {
  const container = document.getElementById('recent-transactions-list');
  if (!container) return;
  container.innerHTML = '';

  // Get all transactions for selected month sorted by date (latest first)
  const filterM = (list) => list.filter(item => item.mes.toLowerCase() === selectedMonth.toLowerCase());
  
  const allList = [];
  filterM(db.entradas).forEach(x => allList.push({ ...x, type: 'entradas' }));
  filterM(db.empresa).forEach(x => allList.push({ ...x, type: 'empresa' }));
  filterM(db.pessoal).forEach(x => allList.push({ ...x, type: 'pessoal' }));

  // Sort by date (descending), handle empty dates
  allList.sort((a, b) => {
    const dateA = a.data ? new Date(a.data) : new Date(0);
    const dateB = b.data ? new Date(b.data) : new Date(0);
    return dateB - dateA;
  });

  const recentList = allList.slice(0, 5);

  if (recentList.length === 0) {
    container.innerHTML = `
      <div class="transaction-row glass text-center">
        <p class="card-subtext" style="width:100%;">Nenhum lanÃ§amento recente encontrado.</p>
      </div>
    `;
    return;
  }

  recentList.forEach(t => {
    const row = document.createElement('div');
    row.className = 'transaction-row';
    
    let typeIcon = 'receipt';
    let sign = '-';
    let amtClass = 'minus';
    if (t.type === 'entradas') {
      typeIcon = 'trending-up';
      sign = '+';
      amtClass = 'plus';
    } else if (t.type === 'empresa') {
      typeIcon = 'building-2';
    } else {
      typeIcon = 'user';
    }

    const typeLabel = t.type === 'entradas' ? 'Entrada' : t.type === 'empresa' ? 'Empresa' : 'Pessoal';
    const statusMarkup = t.status ? `<span class="trans-status ${t.status.includes('Atrasado') ? 'atrasado' : ''}">${t.status}</span>` : '';
    const dateLabel = t.data ? formatDate(t.data) : 'Sem data';

    row.innerHTML = `
      <div class="trans-left">
        <div class="trans-icon-wrapper ${t.type}">
          <i data-lucide="${typeIcon}"></i>
        </div>
        <div class="trans-details">
          <span class="trans-desc">${t.descricao}</span>
          <div class="trans-meta">
            <span class="trans-tag">${typeLabel}</span>
            <span class="trans-category">${t.categoria}</span>
            <span>Â·</span>
            <span>${dateLabel}</span>
          </div>
        </div>
      </div>
      <div class="trans-right">
        <span class="trans-amount ${amtClass}">${sign}${formatCurrency(t.valor)}</span>
        ${statusMarkup}
      </div>
    `;
    container.appendChild(row);
  });

  lucide.createIcons();
}

// ==========================================================================
// 4. TRANSACTIONS LIST VIEW (HISTORY TAB)
// ==========================================================================

function initTransactions() {
  // Setup filter event listeners
  document.getElementById('input-search').addEventListener('input', renderTransactionsList);
  document.getElementById('filter-type').addEventListener('change', renderTransactionsList);
  document.getElementById('filter-category').addEventListener('change', renderTransactionsList);
  document.getElementById('filter-month').addEventListener('change', renderTransactionsList);
  
  // Re-populate filters once at beginning
  populateHistoryFilters();
}

function populateHistoryFilters() {
  const typeFilter = document.getElementById('filter-type');
  const catFilter = document.getElementById('filter-category');
  const monthFilter = document.getElementById('filter-month');
  
  // 1. Populate Category Filter (All distinct categories in the DB)
  catFilter.innerHTML = '<option value="all">Todas as categorias</option>';
  const allCats = new Set([
    ...CATEGORIES.entradas,
    ...CATEGORIES.empresa,
    ...CATEGORIES.pessoal
  ]);
  allCats.forEach(cat => {
    catFilter.innerHTML += `<option value="${cat}">${cat}</option>`;
  });

  // 2. Populate Month Filter (All distinct months present in DB)
  monthFilter.innerHTML = '<option value="all">Todos os meses</option>';
  const dbMonths = new Set();
  [...db.entradas, ...db.empresa, ...db.pessoal].forEach(x => {
    if (x.mes) dbMonths.add(x.mes);
  });
  
  // Sort months standard order
  const sortedMonths = Array.from(dbMonths).sort((a, b) => {
    return MONTHS_PT.indexOf(a) - MONTHS_PT.indexOf(b);
  });

  sortedMonths.forEach(m => {
    monthFilter.innerHTML += `<option value="${m}">${m}</option>`;
  });
}

function renderTransactionsList() {
  const container = document.getElementById('full-transactions-list');
  if (!container) return;
  container.innerHTML = '';

  // Get values from filters
  const searchQuery = document.getElementById('input-search').value.toLowerCase().trim();
  const typeVal = document.getElementById('filter-type').value;
  const catVal = document.getElementById('filter-category').value;
  const monthVal = document.getElementById('filter-month').value;

  // Construct complete list of items
  let filtered = [];
  if (typeVal === 'all' || typeVal === 'entradas') {
    db.entradas.forEach(x => filtered.push({ ...x, type: 'entradas' }));
  }
  if (typeVal === 'all' || typeVal === 'empresa') {
    db.empresa.forEach(x => filtered.push({ ...x, type: 'empresa' }));
  }
  if (typeVal === 'all' || typeVal === 'pessoal') {
    db.pessoal.forEach(x => filtered.push({ ...x, type: 'pessoal' }));
  }

  // Apply filters
  if (searchQuery) {
    filtered = filtered.filter(x => 
      x.descricao.toLowerCase().includes(searchQuery) ||
      x.categoria.toLowerCase().includes(searchQuery) ||
      x.valor.toString().includes(searchQuery)
    );
  }

  if (catVal !== 'all') {
    filtered = filtered.filter(x => x.categoria.toLowerCase() === catVal.toLowerCase());
  }

  if (monthVal !== 'all') {
    filtered = filtered.filter(x => x.mes.toLowerCase() === monthVal.toLowerCase());
  }

  // Sort by date (latest first)
  filtered.sort((a, b) => {
    const dateA = a.data ? new Date(a.data) : new Date(0);
    const dateB = b.data ? new Date(b.data) : new Date(0);
    return dateB - dateA;
  });

  // Render Rows
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="transaction-row glass text-center">
        <p class="card-subtext" style="width:100%;">Nenhum lanÃ§amento corresponde aos filtros.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(t => {
    const row = document.createElement('div');
    row.className = 'transaction-row';
    
    let typeIcon = 'receipt';
    let sign = '-';
    let amtClass = 'minus';
    if (t.type === 'entradas') {
      typeIcon = 'trending-up';
      sign = '+';
      amtClass = 'plus';
    } else if (t.type === 'empresa') {
      typeIcon = 'building-2';
    } else {
      typeIcon = 'user';
    }

    const typeLabel = t.type === 'entradas' ? 'Entrada' : t.type === 'empresa' ? 'Empresa' : 'Pessoal';
    const statusMarkup = t.status ? `<span class="trans-status ${t.status.includes('Atrasado') ? 'atrasado' : ''}">${t.status}</span>` : '';
    const dateLabel = t.data ? formatDate(t.data) : 'Sem data';

    row.innerHTML = `
      <div class="trans-left">
        <div class="trans-icon-wrapper ${t.type}">
          <i data-lucide="${typeIcon}"></i>
        </div>
        <div class="trans-details">
          <span class="trans-desc">${t.descricao}</span>
          <div class="trans-meta">
            <span class="trans-tag">${typeLabel}</span>
            <span class="trans-category">${t.categoria}</span>
            <span>Â·</span>
            <span>${dateLabel}</span>
          </div>
        </div>
      </div>
      <div class="trans-right">
        <span class="trans-amount ${amtClass}">${sign}${formatCurrency(t.valor)}</span>
        ${statusMarkup}
      </div>
    `;
    container.appendChild(row);
  });

  lucide.createIcons();
}

// ==========================================================================
// 5. VOICE RECOGNITION SYSTEM & SMART PARSER
// ==========================================================================

function initVoiceEngine() {
  const recordBtn = document.getElementById('btn-voice-record');
  const undoBtn = document.getElementById('btn-voice-undo');
  if (undoBtn) {
    undoBtn.addEventListener('click', () => {
      undoLastVoiceTransaction();
    });
  }
  
  // Set up Speech Recognition (Web Speech API)
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    console.error('Speech recognition not supported in this browser.');
    document.getElementById('voice-status-text').innerText = 'Reconhecimento de voz nÃ£o suportado neste navegador.';
    recordBtn.style.opacity = '0.5';
    recordBtn.disabled = true;
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'pt-BR';
  recognition.continuous = false; // process line-by-line
  recognition.interimResults = true;

  recognition.onstart = () => {
    isRecording = true;
    recordBtn.classList.add('recording');
    document.getElementById('voice-status-text').className = 'status-active';
    document.getElementById('voice-status-text').innerText = 'Estou escutando... Fale agora!';
    
    const transBox = document.getElementById('voice-transcript');
    transBox.innerText = '';
    transBox.classList.remove('transcript-placeholder');
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    const transcript = finalTranscript || interimTranscript;
    document.getElementById('voice-transcript').innerText = transcript;
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    stopRecordingVisuals();
    document.getElementById('voice-status-text').innerText = `Erro de escuta: ${event.error}`;
  };

  recognition.onend = () => {
    if (!isRecording) return; // stopped manually
    stopRecordingVisuals();
    
    const finalPhrase = document.getElementById('voice-transcript').innerText.trim();
    if (finalPhrase) {
      processVoiceCommand(finalPhrase);
    } else {
      document.getElementById('voice-status-text').innerText = 'NÃ£o entendi. Toque para tentar novamente.';
      document.getElementById('voice-transcript').innerText = '"Anota aÃ­..."';
      document.getElementById('voice-transcript').classList.add('transcript-placeholder');
    }
  };

  recordBtn.addEventListener('click', () => {
    if (isRecording) {
      recognition.stop();
      stopRecordingVisuals();
    } else {
      startVoiceRecording();
    }
  });
}

function startVoiceRecording() {
  if (!recognition) return;
  try {
    recognition.start();
  } catch (e) {
    console.error(e);
  }
}

function stopRecordingVisuals() {
  isRecording = false;
  document.getElementById('btn-voice-record').classList.remove('recording');
  document.getElementById('voice-status-text').className = 'status-inactive';
  document.getElementById('voice-status-text').innerText = 'Processando Ã¡udio...';
}

// --- PORTUGUESE NLP VOICE PARSER ---
function processVoiceCommand(phrase) {
  phrase = phrase.toLowerCase().trim();
  console.log('Voice Command Received:', phrase);

  // --- COMMAND: RESET ACTIVE MONTH ---
  const isResetMonth = /zerar\s+(o\s+)?mÃªs|limpar\s+(o\s+)?mÃªs|reiniciar\s+(o\s+)?mÃªs/i.test(phrase);
  if (isResetMonth) {
    console.log('Reset month intent detected.');
    let targetMonth = selectedMonth;
    for (const m of MONTHS_PT) {
      if (phrase.includes(m.toLowerCase())) {
        targetMonth = m;
        break;
      }
    }
    if (targetMonth !== selectedMonth) {
      selectedMonth = targetMonth;
    }
    resetCurrentMonth(false); // Direct execution via voice (reversible via Undo)
    
    // Clean Voice Transcript UI state
    document.getElementById('voice-status-text').className = 'status-inactive';
    document.getElementById('voice-status-text').innerText = 'Toque para comeÃ§ar a falar';
    document.getElementById('voice-transcript').innerText = '"Anota aÃ­..."';
    document.getElementById('voice-transcript').classList.add('transcript-placeholder');
    return;
  }

  // 1. Gather any matched digit pattern arrays
  const regexNum = /\b\d+([.,]\d+)*\b/g;
  const matchesNum = phrase.match(regexNum);

  // 2. Convert word/digits mixture to float value
  const parsedValue = parseWordsToNumber(phrase);

  // --- FEATURE 5A: CONVERSATIONAL QUERY INTENT DETECTION ---
  const isQuery = /quanto|qual faturamento|qual foi/i.test(phrase);
  if (isQuery) {
    let targetMonth = selectedMonth;
    for (const m of MONTHS_PT) {
      if (phrase.includes(m.toLowerCase())) {
        targetMonth = m;
        break;
      }
    }

    const isGeneralIncome = /faturei|faturamento|ganhei|ganhos|receita|recebi|entradas/i.test(phrase);
    const isGeneralExpenses = /gastei|gastos|despesas|custos|saÃ­das|saidas/i.test(phrase);
    
    let targetCategory = null;
    let targetListType = null;

    if (/foto|ensaio/i.test(phrase)) {
      targetCategory = 'Fotografia';
      targetListType = 'entradas';
    } else if (/filmagem|gravaÃ§Ã£o|gravacao|video|vÃ­deo/i.test(phrase)) {
      targetCategory = 'Filmagem';
      targetListType = 'entradas';
    } else if (/ediÃ§Ã£o|edicao|editar/i.test(phrase)) {
      targetCategory = 'EdiÃ§Ã£o';
      targetListType = 'entradas';
    } else if (/aluguel/i.test(phrase)) {
      if (isGeneralExpenses) {
        targetCategory = 'Custos Fixos';
        targetListType = 'empresa';
      } else {
        targetCategory = 'Aluguel';
        targetListType = 'entradas';
      }
    } else if (/carro|combustÃ­vel|combustivel|gasolina|posto/i.test(phrase)) {
      targetCategory = 'Carro';
      targetListType = 'expenses-car';
    } else if (/alimentaÃ§Ã£o|alimentacao|mercado|comida|ifood|restaurante/i.test(phrase)) {
      targetCategory = 'AlimentaÃ§Ã£o';
      targetListType = 'pessoal';
    } else if (/serviÃ§o|servico/i.test(phrase)) {
      targetCategory = 'ServiÃ§os';
      targetListType = 'pessoal';
    } else if (/moradia|casa|condomÃ­nio|condominio/i.test(phrase)) {
      targetCategory = 'Moradia';
      targetListType = 'pessoal';
    } else if (/lazer|assinatura|netflix|spotify|cinema/i.test(phrase)) {
      targetCategory = 'Lazer & Assinaturas';
      targetListType = 'pessoal';
    } else if (/saÃºde|saude|farmÃ¡cia|farmacia|mÃ©dico|medico|remÃ©dio|remedio/i.test(phrase)) {
      targetCategory = 'SaÃºde';
      targetListType = 'pessoal';
    } else if (/famÃ­lia|familia/i.test(phrase)) {
      targetCategory = 'FamÃ­lia';
      targetListType = 'pessoal';
    } else if (/imposto|taxa|das|mei/i.test(phrase)) {
      targetCategory = 'Impostos e Taxas';
      targetListType = 'empresa';
    } else if (/custos fixos|custo fixo/i.test(phrase)) {
      targetCategory = 'Custos Fixos';
      targetListType = 'empresa';
    } else if (/custos variÃ¡veis|custos variaveis|custo variÃ¡vel|custo variavel/i.test(phrase)) {
      targetCategory = 'Custos VariÃ¡veis';
      targetListType = 'empresa';
    }

    let sum = 0;
    let responseText = '';

    if (targetCategory) {
      if (targetListType === 'expenses-car') {
        const empCar = db.empresa.filter(t => t.mes.toLowerCase() === targetMonth.toLowerCase() && t.categoria === 'Carro')
                                 .reduce((acc, t) => acc + t.valor, 0);
        const pesCar = db.pessoal.filter(t => t.mes.toLowerCase() === targetMonth.toLowerCase() && t.categoria === 'Carro')
                                 .reduce((acc, t) => acc + t.valor, 0);
        sum = empCar + pesCar;
        responseText = `VocÃª gastou ${formatCurrency(sum)} com Carro em ${targetMonth}! ðŸš—`;
      } else if (targetListType === 'entradas') {
        sum = db.entradas.filter(t => t.mes.toLowerCase() === targetMonth.toLowerCase() && t.categoria === targetCategory)
                         .reduce((acc, t) => acc + t.valor, 0);
        responseText = `VocÃª faturou ${formatCurrency(sum)} com ${targetCategory} em ${targetMonth}! ðŸ“ˆ`;
      } else {
        sum = db[targetListType].filter(t => t.mes.toLowerCase() === targetMonth.toLowerCase() && t.categoria === targetCategory)
                                .reduce((acc, t) => acc + t.valor, 0);
        if (targetListType === 'pessoal') {
          responseText = `VocÃª gastou ${formatCurrency(sum)} com ${targetCategory} (Pessoal) em ${targetMonth}! ðŸ‘¤`;
        } else if (targetListType === 'empresa') {
          responseText = `VocÃª gastou ${formatCurrency(sum)} com ${targetCategory} (Empresa) em ${targetMonth}! ðŸ¢`;
        }
      }
    } else if (isGeneralIncome) {
      sum = db.entradas.filter(t => t.mes.toLowerCase() === targetMonth.toLowerCase())
                       .reduce((acc, t) => acc + t.valor, 0);
      responseText = `VocÃª faturou ${formatCurrency(sum)} em ${targetMonth}! ðŸ“ˆ`;
    } else if (isGeneralExpenses) {
      const empSum = db.empresa.filter(t => t.mes.toLowerCase() === targetMonth.toLowerCase())
                               .reduce((acc, t) => acc + t.valor, 0);
      const pesSum = db.pessoal.filter(t => t.mes.toLowerCase() === targetMonth.toLowerCase())
                               .reduce((acc, t) => acc + t.valor, 0);
      sum = empSum + pesSum;
      responseText = `VocÃª gastou um total de ${formatCurrency(sum)} em ${targetMonth} (${formatCurrency(empSum)} PJ / ${formatCurrency(pesSum)} PF)! ðŸ’¸`;
    } else {
      const income = db.entradas.filter(t => t.mes.toLowerCase() === targetMonth.toLowerCase())
                               .reduce((acc, t) => acc + t.valor, 0);
      const empSum = db.empresa.filter(t => t.mes.toLowerCase() === targetMonth.toLowerCase())
                               .reduce((acc, t) => acc + t.valor, 0);
      const pesSum = db.pessoal.filter(t => t.mes.toLowerCase() === targetMonth.toLowerCase())
                               .reduce((acc, t) => acc + t.valor, 0);
      const balance = income - empSum - pesSum;
      responseText = `Saldo de ${targetMonth}: Faturamento ${formatCurrency(income)}, Despesas ${formatCurrency(empSum + pesSum)}. Saldo LÃ­quido: ${formatCurrency(balance)}! ðŸ’°`;
    }

    showToast(responseText, 'info');

    document.getElementById('voice-status-text').className = 'status-inactive';
    document.getElementById('voice-status-text').innerText = 'Toque para comeÃ§ar a falar';
    document.getElementById('voice-transcript').innerText = '"Anota aÃ­..."';
    document.getElementById('voice-transcript').classList.add('transcript-placeholder');
    return;
  }

  // --- FEATURE 5B: VISUAL SEARCH FILTER INTENT DETECTION ---
  const isSearch = /^(buscar|pesquisar|filtrar|mostrar)\b/i.test(phrase);
  if (isSearch) {
    let searchTerm = phrase.replace(/^(buscar|pesquisar|filtrar|mostrar)\b/i, '')
                           .replace(/\bpor\b/gi, '')
                           .replace(/\btodos\b/gi, '')
                           .replace(/\bas\b/gi, '')
                           .replace(/\bos\b/gi, '')
                           .trim();
    
    switchTab('transactions');
    const searchInput = document.getElementById('input-search');
    if (searchInput) {
      searchInput.value = searchTerm;
      document.getElementById('filter-type').value = 'all';
      document.getElementById('filter-category').value = 'all';
      document.getElementById('filter-month').value = 'all';
      renderTransactionsList();
    }
    
    showToast(`Buscando por: "${searchTerm || 'todos'}" ðŸ”`, 'info');

    document.getElementById('voice-status-text').className = 'status-inactive';
    document.getElementById('voice-status-text').innerText = 'Toque para comeÃ§ar a falar';
    document.getElementById('voice-transcript').innerText = '"Anota aÃ­..."';
    document.getElementById('voice-transcript').classList.add('transcript-placeholder');
    return;
  }

  // --- FEATURE 4: DELETION/CANCELLATION INTENT DETECTION ---
  const isCancellation = /cancelar|remover|excluir|deletar|apagar/i.test(phrase);
  if (isCancellation) {
    const searchTerm = extractCleanDescription(phrase, parsedValue, matchesNum).toLowerCase().trim();
    console.log('Cancellation intent detected. Value:', parsedValue, 'Search term:', searchTerm);

    let listsToSearch = [];
    if (/entrada|ganho|faturamento|recebi|receita/i.test(phrase)) {
      listsToSearch = ['entradas'];
    } else if (/empresa|pj|mei/i.test(phrase)) {
      listsToSearch = ['empresa'];
    } else if (/pessoal|pf/i.test(phrase)) {
      listsToSearch = ['pessoal'];
    } else {
      listsToSearch = ['entradas', 'empresa', 'pessoal'];
    }

    let foundTx = null;
    let foundListType = null;
    let foundIndex = -1;

    for (const listType of listsToSearch) {
      const list = db[listType];
      if (!list) continue;
      
      let matchedIndex = list.findIndex(t => {
        const valMatch = parsedValue > 0 ? (Math.abs(t.valor - parsedValue) < 0.01) : true;
        const descClean = t.descricao.toLowerCase();
        const descMatch = searchTerm !== 'lanÃ§amento por voz' ? (descClean.includes(searchTerm) || searchTerm.includes(descClean)) : true;
        return valMatch && descMatch;
      });

      if (matchedIndex !== -1) {
        foundTx = list[matchedIndex];
        foundListType = listType;
        foundIndex = matchedIndex;
        break;
      }
    }

    if (foundIndex === -1 && parsedValue > 0) {
      for (const listType of listsToSearch) {
        const list = db[listType];
        if (!list) continue;
        let matchedIndex = list.findIndex(t => Math.abs(t.valor - parsedValue) < 0.01);
        if (matchedIndex !== -1) {
          foundTx = list[matchedIndex];
          foundListType = listType;
          foundIndex = matchedIndex;
          break;
        }
      }
    }

    if (foundIndex !== -1 && foundTx) {
      const removed = db[foundListType].splice(foundIndex, 1)[0];
      saveDatabase();

      lastVoiceTransaction = {
        action: 'cancel',
        type: foundListType,
        transaction: removed
      };

      const voiceUndoCont = document.getElementById('voice-undo-container');
      if (voiceUndoCont) {
        voiceUndoCont.classList.remove('hidden');
      }

      showToast(
        `Cancelado: ${removed.descricao} (${formatCurrency(removed.valor)}) removido! âŒ`,
        'info',
        {
          label: 'Desfazer â†©ï¸',
          callback: () => undoLastVoiceTransaction()
        }
      );

      populateHistoryFilters();
      renderDashboard();
      switchTab('dashboard');

      document.getElementById('voice-status-text').className = 'status-inactive';
      document.getElementById('voice-status-text').innerText = 'Toque para comeÃ§ar a falar';
      document.getElementById('voice-transcript').innerText = '"Anota aÃ­..."';
      document.getElementById('voice-transcript').classList.add('transcript-placeholder');
      return;
    } else {
      showToast(`LanÃ§amento nÃ£o encontrado para cancelar! ðŸ”`, 'error');
      document.getElementById('voice-status-text').innerText = 'LanÃ§amento nÃ£o localizado para cancelamento.';
      return;
    }
  }

  // 3. Classify Entry Type with correct precedence:
  // If there are words indicating income, it must be 'entradas'
  let entryType = 'pessoal';
  const isIncome = phrase.includes('recebi') || phrase.includes('ganhei') || phrase.includes('entrada') || phrase.includes('faturei') || phrase.includes('ganho') || phrase.includes('faturamento') || phrase.includes('receita') || phrase.includes('job');
  
  if (isIncome) {
    entryType = 'entradas';
  } else if (phrase.includes('trabalho') || phrase.includes('empresa') || phrase.includes('pj') || phrase.includes('ads') || phrase.includes('mei') || phrase.includes('escritÃ³rio')) {
    entryType = 'empresa';
  }

  // 4. Category Matcher based on keywords
  let category = '';
  if (entryType === 'entradas') {
    category = 'Outros';
    if (phrase.includes('foto') || phrase.includes('fotografia') || phrase.includes('ensaio')) {
      category = 'Fotografia';
    } else if (phrase.includes('filmagem') || phrase.includes('gravacao') || phrase.includes('gravaÃ§Ã£o') || phrase.includes('video') || phrase.includes('vÃ­deo') || phrase.includes('clipe')) {
      category = 'Filmagem';
    } else if (phrase.includes('edicao') || phrase.includes('ediÃ§Ã£o') || phrase.includes('editar') || phrase.includes('cortes')) {
      category = 'EdiÃ§Ã£o';
    } else if (phrase.includes('aluguel')) {
      category = 'Aluguel';
    }
  } else if (entryType === 'empresa') {
    category = 'Custos VariÃ¡veis';
    if (phrase.includes('gasolina') || phrase.includes('combustivel') || phrase.includes('combustÃ­vel') || phrase.includes('posto') || phrase.includes('estacionamento') || phrase.includes('carro')) {
      category = 'Carro';
    } else if (phrase.includes('imposto') || phrase.includes('das') || phrase.includes('inss') || phrase.includes('taxa') || phrase.includes('honorarios') || phrase.includes('honorÃ¡rios') || phrase.includes('contador')) {
      category = 'Impostos e Taxas';
    } else if (phrase.includes('aluguel') || phrase.includes('escritorio') || phrase.includes('escritÃ³rio') || phrase.includes('internet') || phrase.includes('adobe') || phrase.includes('google') || phrase.includes('capcut')) {
      category = 'Custos Fixos';
    }
  } else {
    // Pessoal
    category = 'AquisiÃ§Ãµes Pessoais';
    if (phrase.includes('alimentacao') || phrase.includes('alimentaÃ§Ã£o') || phrase.includes('mercado') || phrase.includes('mundial') || phrase.includes('comida') || phrase.includes('ifood') || phrase.includes('restaurante') || phrase.includes('delivery') || phrase.includes('lanche')) {
      category = 'AlimentaÃ§Ã£o';
    } else if (phrase.includes('seguro') || phrase.includes('celular') || phrase.includes('assinatura') || phrase.includes('servico') || phrase.includes('serviÃ§o')) {
      category = 'ServiÃ§os';
    } else if (phrase.includes('aluguel') || phrase.includes('condominio') || phrase.includes('condomÃ­nio') || phrase.includes('iptu') || phrase.includes('agua') || phrase.includes('Ã¡gua') || phrase.includes('luz') || phrase.includes('casa') || phrase.includes('moradia')) {
      category = 'Moradia';
    } else if (phrase.includes('youtube') || phrase.includes('lazer') || phrase.includes('cinema') || phrase.includes('netflix') || phrase.includes('spotify') || phrase.includes('show') || phrase.includes('ingresso')) {
      category = 'Lazer & Assinaturas';
    } else if (phrase.includes('gasolina') || phrase.includes('combustivel') || phrase.includes('combustÃ­vel') || phrase.includes('carro') || phrase.includes('uber') || phrase.includes('posto') || phrase.includes('estacionamento')) {
      category = 'Carro';
    } else if (phrase.includes('farmacia') || phrase.includes('farmÃ¡cia') || phrase.includes('remedio') || phrase.includes('remÃ©dio') || phrase.includes('medico') || phrase.includes('mÃ©dico') || phrase.includes('exame') || phrase.includes('saude') || phrase.includes('saÃºde') || phrase.includes('dentista')) {
      category = 'SaÃºde';
    } else if (phrase.includes('familia') || phrase.includes('famÃ­lia') || phrase.includes('filho') || phrase.includes('mae') || phrase.includes('mÃ£e') || phrase.includes('pai')) {
      category = 'FamÃ­lia';
    }
  }

  // 5. Extract Description
  const description = extractCleanDescription(phrase, parsedValue, matchesNum);

  // 6. Extract Date and Month
  let targetDate = new Date();
  if (phrase.includes('ontem')) {
    targetDate.setDate(targetDate.getDate() - 1);
  }
  const dateStr = targetDate.toISOString().split('T')[0];
  const mes = MONTHS_PT[targetDate.getMonth()];

  // 7. Auto-Save Logic vs Review Modal Fallback
  if (parsedValue > 0 && description !== 'LanÃ§amento por voz') {
    // InserÃ§Ã£o direta sem confirmaÃ§Ã£o
    const newRecord = {
      id: `${entryType.substring(0, 3)}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      mes: mes,
      data: dateStr,
      descricao: description,
      categoria: category,
      valor: parsedValue,
      status: entryType === 'entradas' ? 'Entregue' : 'âœ… Pago',
      observacao: 'Inserido por voz (Auto-salvo)'
    };

    if (entryType !== 'entradas') {
      newRecord.vencimento = dateStr;
    }

    db[entryType].push(newRecord);
    saveDatabase();

    // Register Undo Pointer
    lastVoiceTransaction = {
      type: entryType,
      id: newRecord.id
    };

    // Show Undo Button in Voice UI
    const voiceUndoCont = document.getElementById('voice-undo-container');
    if (voiceUndoCont) {
      voiceUndoCont.classList.remove('hidden');
    }

    // Show premium Toast with dynamic Undo action button
    showToast(
      `Salvo por voz: ${description} (${formatCurrency(parsedValue)})! ðŸŽ™ï¸`,
      'success',
      {
        label: 'Desfazer â†©ï¸',
        callback: () => undoLastVoiceTransaction()
      }
    );

    // Dynamic month selector navigation and dashboard updates
    selectedMonth = mes;
    populateHistoryFilters();
    renderDashboard();
    switchTab('dashboard');

    // Reset voice recording field values
    document.getElementById('voice-status-text').className = 'status-inactive';
    document.getElementById('voice-status-text').innerText = 'Toque para comeÃ§ar a falar';
    document.getElementById('voice-transcript').innerText = '"Anota aÃ­..."';
    document.getElementById('voice-transcript').classList.add('transcript-placeholder');
  } else {
    // Incomplete information: Open Review Dialog Fallback
    openVoiceReviewModal({
      valor: parsedValue,
      descricao: description,
      tipo: entryType,
      categoria: category,
      data: dateStr,
      status: entryType === 'entradas' ? 'Entregue' : 'âœ… Pago',
      observacao: 'Inserido por voz'
    });
  }
}

// Cleans and parses introductory tags, dates, numbers, and prepositions from spoken command
function extractCleanDescription(phrase, parsedValue, matchesNum) {
  let clean = phrase;
  
  const prefixes = [
    // Cancellation Prefixes
    /cancelar entrada de/g,
    /cancelar despesa de/g,
    /cancelar gasto de/g,
    /cancelar custo de/g,
    /cancelar ganho de/g,
    /cancelar/g,
    /remover entrada de/g,
    /remover despesa de/g,
    /remover gasto de/g,
    /remover custo de/g,
    /remover ganho de/g,
    /remover/g,
    /excluir entrada de/g,
    /excluir despesa de/g,
    /excluir gasto de/g,
    /excluir custo de/g,
    /excluir ganho de/g,
    /excluir/g,
    /deletar entrada de/g,
    /deletar despesa de/g,
    /deletar gasto de/g,
    /deletar custo de/g,
    /deletar ganho de/g,
    /deletar/g,
    /apagar entrada de/g,
    /apagar despesa de/g,
    /apagar gasto de/g,
    /apagar custo de/g,
    /apagar ganho de/g,
    /apagar/g,
    /referente ao/g,
    /referente Ã /g,
    /referente a/g,

    // Insertion Prefixes
    /quero cadastrar um ganho de/g,
    /quero cadastrar uma despesa de/g,
    /quero cadastrar um gasto de/g,
    /quero cadastrar um custo de/g,
    /quero cadastrar/g,
    /cadastrar um ganho de/g,
    /cadastrar uma despesa de/g,
    /cadastrar um gasto de/g,
    /cadastrar um custo de/g,
    /cadastrar ganho de/g,
    /cadastrar despesa de/g,
    /cadastrar gasto de/g,
    /cadastrar custo de/g,
    /cadastrar/g,
    /anota aÃ­ um ganho de/g,
    /anota aÃ­ uma despesa de/g,
    /anota aÃ­ gasto de/g,
    /anota aÃ­/g,
    /anota ai/g,
    /gastei com/g,
    /gastei no/g,
    /gastei na/g,
    /gastei/g,
    /recebi do/g,
    /recebi da/g,
    /recebi de/g,
    /recebi/g,
    /ganhei um ganho de/g,
    /ganhei/g,
    /faturei/g
  ];
  
  prefixes.forEach(p => {
    clean = clean.replace(p, '');
  });
  
  if (matchesNum) {
    matchesNum.forEach(m => {
      clean = clean.replace(m, '');
    });
  }
  
  clean = clean.replace(/r\$/g, '')
               .replace(/\breais\b/g, '')
               .replace(/\breal\b/g, '')
               .replace(/\bcentavos\b/g, '')
               .replace(/\bmil\b/g, '');

  const dates = [
    /na data de hoje/g,
    /data de hoje/g,
    /no dia de hoje/g,
    /dia de hoje/g,
    /\bhoje\b/g,
    /na data de ontem/g,
    /data de ontem/g,
    /no dia de ontem/g,
    /dia de ontem/g,
    /\bontem\b/g
  ];
  
  dates.forEach(d => {
    clean = clean.replace(d, '');
  });

  clean = clean.replace(/\s+/g, ' ').trim();
  
  const preps = /^(no|na|de|do|da|com|para|em|um|uma|referente|referente ao|referente Ã |referente a|ao|Ã )\s+/i;
  let prevClean = '';
  while (clean !== prevClean) {
    prevClean = clean;
    clean = clean.replace(preps, '').trim();
  }

  if (!clean || clean.length < 2) {
    return 'LanÃ§amento por voz';
  }
  
  return capitalizeFirstLetter(clean);
}

// Convert Portuguese words or PT float strings into numbers
function parseWordsToNumber(phrase) {
  const parsePortugueseNumber = (str) => {
    let cleaned = str.replace(/r\$/gi, '').replace(/\s+/g, '');
    if (cleaned.includes('.') && cleaned.includes(',')) {
      if (cleaned.indexOf('.') < cleaned.indexOf(',')) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
      } else {
        cleaned = cleaned.replace(/,/g, '');
      }
    } else if (cleaned.includes(',')) {
      const parts = cleaned.split(',');
      if (parts[1] && parts[1].length === 3) {
        cleaned = cleaned.replace(/,/g, '');
      } else {
        cleaned = cleaned.replace(',', '.');
      }
    } else if (cleaned.includes('.')) {
      const parts = cleaned.split('.');
      if (parts[1] && parts[1].length === 3) {
        cleaned = cleaned.replace(/\./g, '');
      }
    }
    return parseFloat(cleaned);
  };

  const regexNum = /\b\d+([.,]\d+)*\b/g;
  let processedPhrase = phrase;
  const matches = phrase.match(regexNum);
  if (matches) {
    matches.forEach(match => {
      const val = parsePortugueseNumber(match);
      if (!isNaN(val)) {
        processedPhrase = processedPhrase.replace(match, val.toString());
      }
    });
  }

  const units = {
    'zero': 0, 'um': 1, 'uma': 1, 'dois': 2, 'duas': 2, 'trÃªs': 3, 'tres': 3, 'quatro': 4, 'cinco': 5,
    'seis': 6, 'sete': 7, 'oito': 8, 'nove': 9, 'dez': 10, 'onze': 11, 'doze': 12,
    'treze': 13, 'quatorze': 14, 'quinze': 15, 'dezesseis': 16, 'dezessete': 17,
    'dezoito': 18, 'dezenove': 19
  };

  const tens = {
    'vinte': 20, 'trinta': 30, 'quarenta': 40, 'cinquenta': 50,
    'sessenta': 60, 'setenta': 70, 'oitenta': 80, 'noventa': 90
  };

  const hundreds = {
    'cem': 100, 'cento': 100, 'duzentos': 200, 'trezentos': 300, 'quatrocentos': 400,
    'quinhentos': 500, 'seiscentos': 600, 'setecentos': 700, 'oitocentos': 800, 'novecentos': 900
  };

  const words = processedPhrase.replace(/[.,]/g, '').split(/\s+/);
  let total = 0;
  let tempVal = 0;
  let hasNumber = false;

  for (let i = 0; i < words.length; i++) {
    const word = words[i].trim();
    if (!word) continue;

    const parsedFloat = parseFloat(word);
    if (!isNaN(parsedFloat) && isFinite(word)) {
      tempVal += parsedFloat;
      hasNumber = true;
    } else if (units[word] !== undefined) {
      if (word === 'um' || word === 'uma') {
        const nextWord = words[i + 1] ? words[i + 1].trim() : '';
        const prevWord = words[i - 1] ? words[i - 1].trim() : '';
        const isNumericContext = (nextWord === 'mil' || nextWord === 'real' || nextWord === 'reais' || prevWord === 'e');
        if (isNumericContext) {
          tempVal += 1;
          hasNumber = true;
        }
      } else {
        tempVal += units[word];
        hasNumber = true;
      }
    } else if (tens[word] !== undefined) {
      tempVal += tens[word];
      hasNumber = true;
    } else if (hundreds[word] !== undefined) {
      tempVal += hundreds[word];
      hasNumber = true;
    } else if (word === 'mil') {
      if (tempVal === 0) tempVal = 1;
      total += tempVal * 1000;
      tempVal = 0;
      hasNumber = true;
    } else if (word === 'reais' || word === 'real') {
      total += tempVal;
      tempVal = 0;
    } else if (word === 'centavos') {
      total += tempVal / 100;
      tempVal = 0;
    }
  }
  
  total += tempVal;

  return hasNumber ? parseFloat(total.toFixed(2)) : 0;
}

// Reverts the last voice-based auto-saved transaction
function undoLastVoiceTransaction() {
  if (!lastVoiceTransaction) {
    showToast('Nenhuma operaÃ§Ã£o para desfazer!', 'error');
    return;
  }

  // Symmetric Undo for Reset Month
  if (lastVoiceTransaction.action === 'reset_month' || lastVoiceTransaction.action === 'reset_month_granular') {
    const { month, backup } = lastVoiceTransaction;
    if (backup) {
      db.entradas = backup.entradas;
      db.empresa = backup.empresa;
      db.pessoal = backup.pessoal;
      if (backup.fixos_status) {
        db.fixos_status = backup.fixos_status;
      }
      saveDatabase();
      showToast(`↩️ Desfeito: Dados de ${month} restaurados!`, 'success');
      
      populateHistoryFilters();
      renderDashboard();
      if (activeTab === 'fixos') renderFixosView();
      
      lastVoiceTransaction = null;

      // Hide Undo Button in Voice UI
      const voiceUndoCont = document.getElementById('voice-undo-container');
      if (voiceUndoCont) {
        voiceUndoCont.classList.add('hidden');
      }
      
      if (activeTab === 'settings') {
        renderSettingsView();
      }
      return;
    }
  }

  // Symmetric Undo for Deletion (Cancel)
  if (lastVoiceTransaction.action === 'cancel') {
    const { type, transaction } = lastVoiceTransaction;
    if (transaction) {
      db[type].push(transaction);
      saveDatabase();
      showToast(`Desfeito: "${transaction.descricao}" restaurado! â†©ï¸`, 'success');
      
      populateHistoryFilters();
      renderDashboard();
      
      lastVoiceTransaction = null;

      // Hide Undo Button in Voice UI
      const voiceUndoCont = document.getElementById('voice-undo-container');
      if (voiceUndoCont) {
        voiceUndoCont.classList.add('hidden');
      }
      return;
    }
  }

  // Normal Undo for Addition
  const { type, id } = lastVoiceTransaction;
  const list = db[type];
  if (!list) return;

  const index = list.findIndex(t => t.id === id);
  if (index !== -1) {
    const removed = list.splice(index, 1)[0];
    saveDatabase();
    
    showToast(`Desfeito: "${removed.descricao}" removido! â†©ï¸`, 'info');
    
    populateHistoryFilters();
    renderDashboard();
    
    lastVoiceTransaction = null;

    // Hide Undo Button in Voice UI
    const voiceUndoCont = document.getElementById('voice-undo-container');
    if (voiceUndoCont) {
      voiceUndoCont.classList.add('hidden');
    }
  } else {
    showToast('LanÃ§amento jÃ¡ foi removido ou nÃ£o foi encontrado!', 'error');
  }
}

// ==========================================================================
// 6. MODAL & REVIEW DIALOG CONTROLLER
// ==========================================================================

function initModals() {
  // Voice Review Modal hooks
  document.getElementById('btn-close-review').addEventListener('click', closeVoiceReviewModal);
  document.getElementById('btn-cancel-entry').addEventListener('click', closeVoiceReviewModal);
  document.getElementById('btn-save-entry').addEventListener('click', saveVoiceReviewForm);
  
  // Setup type buttons in Review Modal
  const typeButtons = document.querySelectorAll('.type-button-group .btn-type-select');
  typeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      typeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const selectedType = btn.getAttribute('data-type');
      
      // Update Category Dropdown options based on type
      populateCategoryDropdown('review-category', selectedType);
    });
  });

  // Settings Batch Import hooks
  document.getElementById('btn-open-import').addEventListener('click', () => {
    document.getElementById('modal-batch-import').classList.remove('hidden');
  });
  document.getElementById('btn-close-import').addEventListener('click', closeBatchImportModal);
  document.getElementById('btn-cancel-import').addEventListener('click', closeBatchImportModal);
  document.getElementById('btn-process-import').addEventListener('click', processBatchImport);

  // File Upload Drag & Drop bindings
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-import-input');

  if (dropZone && fileInput) {
    dropZone.addEventListener('click', (e) => {
      // Avoid triggering click twice if clicked on label/browse-link
      if (e.target !== fileInput) {
        fileInput.click();
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleImportedFile(e.target.files[0]);
      }
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'dragend'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dragover');
      }, false);
    });

    dropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        handleImportedFile(files[0]);
      }
    }, false);
  }
}

function openVoiceReviewModal(data) {
  document.getElementById('review-val').value = data.valor || '';
  document.getElementById('review-desc').value = data.descricao || '';
  document.getElementById('review-date').value = data.data || '';
  document.getElementById('review-status').value = data.status || '';
  document.getElementById('review-obs').value = data.observacao || '';

  // Select correct type button
  const typeButtons = document.querySelectorAll('.type-button-group .btn-type-select');
  typeButtons.forEach(btn => {
    if (btn.getAttribute('data-type') === data.tipo) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Populate Categories and select correct one
  populateCategoryDropdown('review-category', data.tipo, data.categoria);

  // Show Modal
  document.getElementById('modal-voice-review').classList.remove('hidden');
}

function closeVoiceReviewModal() {
  document.getElementById('modal-voice-review').classList.add('hidden');
  document.getElementById('voice-status-text').innerText = 'Toque para comeÃ§ar a falar';
}

function populateCategoryDropdown(elementId, type, selectValue = null) {
  const dropdown = document.getElementById(elementId);
  if (!dropdown) return;
  dropdown.innerHTML = '';

  const cats = CATEGORIES[type] || [];
  cats.forEach(c => {
    const option = document.createElement('option');
    option.value = c;
    option.innerText = c;
    if (selectValue && c.toLowerCase() === selectValue.toLowerCase()) {
      option.selected = true;
    }
    dropdown.appendChild(option);
  });
}

function saveVoiceReviewForm() {
  const valor = parseFloat(document.getElementById('review-val').value);
  const descricao = document.getElementById('review-desc').value.trim();
  const dateStr = document.getElementById('review-date').value;
  const status = document.getElementById('review-status').value;
  const observacao = document.getElementById('review-obs').value.trim();
  
  // Find active type
  const activeTypeBtn = document.querySelector('.type-button-group .btn-type-select.active');
  const type = activeTypeBtn ? activeTypeBtn.getAttribute('data-type') : 'pessoal';
  const categoria = document.getElementById('review-category').value;

  if (isNaN(valor) || valor <= 0) {
    alert('Por favor, digite um valor maior que zero.');
    return;
  }

  if (!descricao) {
    alert('Por favor, preencha a descriÃ§Ã£o.');
    return;
  }

  // Determine Month based on dateStr
  let mes = selectedMonth; // fallback
  if (dateStr) {
    const parts = dateStr.split('-');
    const mIdx = parseInt(parts[1]) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      mes = MONTHS_PT[mIdx];
    }
  }

  // Insert record
  const newRecord = {
    id: `${type.substring(0, 3)}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    mes: mes,
    data: dateStr,
    descricao: descricao,
    categoria: categoria,
    valor: valor,
    status: status,
    observacao: observacao
  };

  // Add vencimento if not income
  if (type !== 'entradas') {
    newRecord.vencimento = dateStr;
  }

  // Add to correct sheet
  db[type].push(newRecord);
  saveDatabase();

  // Success feedback
  alert('LanÃ§amento salvo com sucesso!');
  closeVoiceReviewModal();
  
  // Refresh and switch to Dashboard
  populateHistoryFilters();
  switchTab('dashboard');
}

// --- BATCH IMPORT MODULE ---
function closeBatchImportModal() {
  document.getElementById('modal-batch-import').classList.add('hidden');
}

// ============================================================
// PARSER UNIVERSAL DE CSV BANCÁRIO BRASILEIRO
// Suporta: Nubank Crédito, Nubank Conta, Itaú, Bradesco,
//          Santander, Inter, Sicoob, BTG, C6, Mercado Pago
// ============================================================

/**
 * Remove BOM e normaliza fins de linha
 */
function cleanRawCSV(raw) {
  let text = raw.replace(/^\uFEFF/, '');
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return text;
}

/**
 * Parser inteligente de linha CSV com suporte a campos entre aspas
 */
function parseCSVLine(line, sep) {
  if (sep === '\t') return line.split('\t').map(c => c.replace(/"/g, '').trim());
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === sep && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Detecta separador a partir da linha de cabeçalho
 */
function detectSeparator(line) {
  const semicolonCount = (line.match(/;/g) || []).length;
  const commaCount = (line.match(/,/g) || []).length;
  const tabCount = (line.match(/\t/g) || []).length;
  if (tabCount > 0) return '\t';
  if (semicolonCount >= commaCount) return ';';
  return ',';
}

/**
 * Converte valor BRL ou internacional para float
 * Suporta: "1.234,56" → 1234.56, "-40.35" → -40.35, "1,234.56" → 1234.56
 */
function parseBRLValue(str) {
  if (!str) return NaN;
  let s = str.replace(/"/g, '').replace(/R\$\s?/g, '').trim();
  if (!s) return NaN;
  // Detecta formato BRL: ponto como milhar, vírgula como decimal
  const hasBRLformat = /\d+\.\d{3},\d{1,2}$/.test(s) || /^-?\d+,\d{2}$/.test(s) || /^-?\d{1,3}(\.\d{3})+,\d{2}$/.test(s);
  if (hasBRLformat) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // Internacional ou misto (40.35 ou 1,234.56)
    s = s.replace(/,/g, '');
  }
  return parseFloat(s);
}

/**
 * Normaliza qualquer formato de data para YYYY-MM-DD
 * Suporta: DD/MM/YYYY, DD/MM/YY, YYYY-MM-DD, DD-MM-YYYY
 */
function normalizeDate(raw) {
  if (!raw) return '';
  const s = raw.replace(/"/g, '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slashMatch) {
    let [, d, m, y] = slashMatch;
    if (y.length === 2) y = '20' + y;
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  const dashMatch = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dashMatch) {
    const [, d, m, y] = dashMatch;
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  return s;
}

/**
 * Detecta o banco pelo conteúdo do cabeçalho e primeiras linhas
 */
function detectBank(headerLine, allText) {
  const h = headerLine.toLowerCase();
  const full = allText.toLowerCase().substring(0, 500);
  if (full.includes('nubank') || h.includes('identificador')) return 'nubank';
  // Nubank Cartão: headers em inglês (date,category,title,amount)
  if (h.includes('date') && h.includes('title') && h.includes('amount')) return 'nubank_cartao';
  if (h.includes('lançamento') && h.includes('débito') && h.includes('crédito')) return 'itau';
  if (h.includes('lancamento') && h.includes('debito') && h.includes('credito')) return 'itau';
  if (h.includes('historico') && h.includes('data') && h.includes('valor')) return 'bradesco';
  if (h.includes('histrico') && h.includes('data') && h.includes('valor')) return 'bradesco';
  if (h.includes('data lan') && (h.includes('histrico') || h.includes('histórico'))) return 'santander';
  if (h.includes('data movimentao') || (h.includes('descricao') && h.includes('tipo'))) return 'inter';
  if (h.includes('data movimentação') || (h.includes('descrição') && h.includes('tipo'))) return 'inter';
  if (h.includes('sicoob') || full.includes('sicoob')) return 'sicoob';
  if (h.includes('ag ') && h.includes('cc ')) return 'caixa';
  return 'generic';
}

/**
 * Inferência automática de categoria a partir da descrição
 */
function guessCategory(desc, type) {
  const d = (desc || '').toLowerCase();
  if (type === 'entradas') {
    if (d.includes('foto') || d.includes('ensaio')) return 'Fotografia';
    if (d.includes('filmagem') || d.includes('video') || d.includes('gravacao') || d.includes('gravação')) return 'Filmagem';
    if (d.includes('edicao') || d.includes('edição') || d.includes('editar') || d.includes('cortes')) return 'Edição';
    if (d.includes('aluguel') || d.includes('locacao') || d.includes('locação')) return 'Aluguel';
    return 'Outros';
  }
  if (type === 'empresa') {
    if (d.includes('gasolina') || d.includes('combustivel') || d.includes('posto') || d.includes('estacionamento')) return 'Carro';
    if (d.includes('imposto') || d.includes('das ') || d.includes('inss') || d.includes('taxa') || d.includes('honorarios') || d.includes('contador')) return 'Impostos e Taxas';
    if (d.includes('internet') || d.includes('adobe') || d.includes('google') || d.includes('capcut') || d.includes('aluguel') || d.includes('coworking')) return 'Custos Fixos';
    return 'Custos Variáveis';
  }
  // Pessoal
  if (d.includes('mercado') || d.includes('supermercado') || d.includes('ifood') || d.includes('restaurante') || d.includes('lanche') || d.includes('padaria') || d.includes('feira')) return 'Alimentação';
  if (d.includes('uber') || d.includes('gasolina') || d.includes('posto') || d.includes('combustivel') || d.includes('estacionamento') || d.includes('rodizio')) return 'Carro';
  if (d.includes('aluguel') || d.includes('condominio') || d.includes('iptu') || d.includes('agua') || d.includes('luz') || d.includes('energia') || d.includes('moradia')) return 'Moradia';
  if (d.includes('netflix') || d.includes('spotify') || d.includes('youtube') || d.includes('amazon') || d.includes('disney') || d.includes('globo') || d.includes('cinema') || d.includes('lazer') || d.includes('show') || d.includes('ingresso') || d.includes('apple')) return 'Lazer & Assinaturas';
  if (d.includes('farmacia') || d.includes('remedio') || d.includes('medico') || d.includes('dentista') || d.includes('exame') || d.includes('saude') || d.includes('hospital') || d.includes('plano de saude')) return 'Saúde';
  if (d.includes('familia') || d.includes('filho') || d.includes('mae') || d.includes('pai')) return 'Família';
  if (d.includes('assinatura') || d.includes('seguro') || d.includes('servico') || d.includes('celular') || d.includes('internet') || d.includes('telefone')) return 'Serviços';
  return 'Aquisições Pessoais';
}

/**
 * Parser universal de CSV bancário - suporta qualquer banco brasileiro
 */
function parseUniversalBankCSV(text, importType) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return { records: [], bankName: 'generic', errors: 0 };

  // Localiza a linha de cabeçalho (pula metadados no topo)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const l = lines[i].toLowerCase();
    if (
      (l.includes('data') && (l.includes('valor') || l.includes('lancamento') || l.includes('lançamento') || l.includes('descri') || l.includes('histor'))) ||
      l.includes('identificador') ||
      (l.includes('date') && l.includes('amount')) ||
      (l.includes('data') && l.includes('tipo'))
    ) {
      headerIdx = i;
      break;
    }
  }

  const sep = detectSeparator(lines[headerIdx]);
  const headers = parseCSVLine(lines[headerIdx], sep).map(h => h.toLowerCase().replace(/["']/g, '').trim());
  const bankName = detectBank(lines[headerIdx], text);

  const records = [];
  let errors = 0;

  // Mapeamento de colunas por nome
  const findCol = (...candidates) => {
    for (const c of candidates) {
      const idx = headers.findIndex(h => h.includes(c));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  // Suporte ao Nubank Cartão (inglês: date,category,title,amount)
  const isNubankCartao = bankName === 'nubank_cartao';

  let dateIdx = isNubankCartao 
    ? findCol('date')
    : findCol('data moviment', 'data lançam', 'data lan', 'data', 'dt.', 'date');
  let descIdx = isNubankCartao 
    ? findCol('title')
    : findCol('descri', 'histori', 'lancamento', 'lançamento', 'nome estabe', 'origem', 'memo', 'detalhe');
  let valIdx = isNubankCartao 
    ? findCol('amount')
    : findCol('valor (r', 'valor', 'amount', 'montante', 'quantia');
  let debitIdx = isNubankCartao ? -1 : findCol('valor do d', 'débito', 'debito', 'saída', 'saida');
  let creditIdx = isNubankCartao ? -1 : findCol('valor do c', 'crédito', 'credito', 'entrada', 'recebido');
  let typeIdx = findCol('tipo lanç', 'tipo', 'natureza');

  const hasHeaders = dateIdx !== -1 || descIdx !== -1 || valIdx !== -1;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;

    // Para em linhas de rodapé/resumo
    const ll = line.toLowerCase();
    if (ll.includes('saldo final') || ll.includes('total:') || ll.includes('saldo:') ||
        ll.startsWith('extrato') || ll.startsWith('agncia') || ll.startsWith('agência') ||
        ll.startsWith('conta:') || ll.startsWith('perodo') || ll.startsWith('período') ||
        ll.includes('saldo anterior')) continue;

    const cols = hasHeaders ? parseCSVLine(line, sep) : line.split(sep).map(c => c.trim());
    if (cols.length < 2) { errors++; continue; }

    // Data
    let rawDate = dateIdx !== -1 ? cols[dateIdx] : cols[0];
    const dateStr = normalizeDate(rawDate);
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) { errors++; continue; }

    // Descrição
    let desc = descIdx !== -1 ? (cols[descIdx] || '') : cols[1] || '';
    desc = desc.replace(/"/g, '').trim();
    if (!desc) { errors++; continue; }

    // Valor
    let valorOriginal = NaN;
    let isExpense = null;

    if (valIdx !== -1 && cols[valIdx] !== undefined && cols[valIdx].trim()) {
      valorOriginal = parseBRLValue(cols[valIdx]);
      if (!isNaN(valorOriginal)) {
        isExpense = valorOriginal < 0;
        valorOriginal = Math.abs(valorOriginal);
      }
    }

    if (isNaN(valorOriginal) && debitIdx !== -1 && cols[debitIdx] && cols[debitIdx].trim()) {
      const v = parseBRLValue(cols[debitIdx]);
      if (!isNaN(v) && v > 0) { valorOriginal = v; isExpense = true; }
    }

    if (isNaN(valorOriginal) && creditIdx !== -1 && cols[creditIdx] && cols[creditIdx].trim()) {
      const v = parseBRLValue(cols[creditIdx]);
      if (!isNaN(v) && v > 0) { valorOriginal = v; isExpense = false; }
    }

    if (isNaN(valorOriginal) || valorOriginal === 0) { errors++; continue; }

    // Determina tipo (despesa/receita) com base no sinal e na seleção do usuário
    let type;
    if (isExpense === null) {
      type = importType;
    } else if (isExpense) {
      type = importType === 'entradas' ? 'pessoal' : importType;
    } else {
      type = 'entradas';
    }

    // Verifica coluna de tipo (Débito/Crédito)
    if (typeIdx !== -1 && cols[typeIdx]) {
      const t = cols[typeIdx].toLowerCase().trim();
      if (t.includes('debt') || t.includes('dbit') || t.includes('dbito') || t.includes('saida') || t.includes('sada')) {
        type = importType === 'entradas' ? 'pessoal' : importType;
      } else if (t.includes('crdit') || t.includes('crdito') || t.includes('entrada') || t.includes('recebido')) {
        type = 'entradas';
      }
    }

    // Mês a partir da data
    let mes = selectedMonth;
    const dp = dateStr.split('-');
    if (dp.length === 3) {
      const mIdx = parseInt(dp[1]) - 1;
      if (mIdx >= 0 && mIdx < 12) mes = MONTHS_PT[mIdx];
    }

    const categoria = guessCategory(desc, type);
    const bankLabel = bankName !== 'generic' ? bankName.charAt(0).toUpperCase() + bankName.slice(1) : 'Banco';

    const record = {
      id: `${type.substring(0,3)}_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
      mes,
      data: dateStr,
      vencimento: dateStr,
      descricao: capitalizeFirstLetter(desc),
      categoria,
      valor: valorOriginal,
      status: type === 'entradas' ? 'Entregue' : '✅ Pago',
      observacao: `Importado ${bankLabel}`
    };

    if (type === 'entradas') delete record.vencimento;
    records.push({ record, type });
  }

  return { records, bankName, errors };
}

function processBatchImport() {
  const importType = document.getElementById('import-type').value;
  const text = document.getElementById('textarea-import-data').value.trim();

  if (!text) {
    showToast('Nenhum dado para importar. Carregue um arquivo ou cole os dados.', 'error');
    return;
  }

  // Tenta o parser universal primeiro
  const { records, bankName, errors } = parseUniversalBankCSV(text, importType);
  let successCount = 0;

  if (records.length > 0) {
    records.forEach(({ record, type }) => {
      db[type].push(record);
      successCount++;
    });
  } else {
    // Fallback: formato legado da planilha Excel (colunas por posição)
    const lines = text.split('\n');
    const sep = detectSeparator(lines[0] || '');
    lines.forEach(line => {
      const cols = parseCSVLine(line, sep);
      if (cols.length < 4) return;
      const mes = cols[0].trim();
      if (!mes || mes.toLowerCase() === 'mês' || mes.toLowerCase() === 'ms' || mes.includes('Registre')) return;
      let datePg = '', venc = '', desc = '', cat = '', valStr = '', status = '', obs = '';
      if (importType === 'entradas') {
        datePg = normalizeDate(cols[1]); desc = cols[2] ? cols[2].trim() : ''; valStr = cols[3] || '';
        cat = cols[4] ? cols[4].trim() : 'Outros'; status = cols[5] ? cols[5].trim() : ''; obs = cols[6] ? cols[6].trim() : '';
      } else {
        venc = normalizeDate(cols[1]); datePg = normalizeDate(cols[2]) || venc; desc = cols[3] ? cols[3].trim() : '';
        cat = cols[4] ? cols[4].trim() : 'Outros'; valStr = cols[5] || ''; status = cols[6] ? cols[6].trim() : ''; obs = cols[7] ? cols[7].trim() : '';
      }
      const valor = parseBRLValue(valStr);
      if (isNaN(valor) || valor <= 0 || !desc) return;
      const record = {
        id: `${importType.substring(0,3)}_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
        mes, data: datePg, descricao: desc,
        categoria: cat || guessCategory(desc, importType),
        valor, status, observacao: obs
      };
      if (importType !== 'entradas') record.vencimento = venc;
      db[importType].push(record);
      successCount++;
    });
  }

  if (successCount > 0) {
    saveDatabase();
    const bankLabel = bankName && bankName !== 'generic' ? ` do ${bankName.charAt(0).toUpperCase() + bankName.slice(1).replace('_cartao',' Cartão')}` : '';
    const errMsg = errors > 0 ? ` (${errors} linhas ignoradas)` : '';
    showToast(`✅ ${successCount} lançamentos${bankLabel} importados!${errMsg}`, 'success', null);
    closeBatchImportModal();
    populateHistoryFilters();
    renderDashboard();
    setTimeout(() => switchTab('dashboard'), 400);
  } else {
    showToast('❌ Nenhuma linha reconhecida. Verifique se o arquivo está correto.', 'error');
  }
}

function handleImportedFile(file) {
  if (!file) return;
  const fileName = file.name;
  const fileExt = (fileName.split('.').pop() || '').toLowerCase();
  const blocked = ['exe', 'bat', 'sh', 'js', 'php', 'py'];
  if (blocked.includes(fileExt)) {
    showToast('Tipo de arquivo não suportado por segurança.', 'error');
    return;
  }

  const readFileAs = (enc) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject();
    reader.readAsText(file, enc);
  });

  // Tenta UTF-8; se tiver muitos caracteres de substituição, tenta ISO-8859-1 (Windows-1252)
  readFileAs('UTF-8').then(content => {
    const replacementCount = (content.match(/\uFFFD/g) || []).length;
    if (replacementCount > 5) return readFileAs('ISO-8859-1');
    return content;
  }).then(content => {
    const cleaned = cleanRawCSV(content);
    document.getElementById('textarea-import-data').value = cleaned;

    // Detecta banco automaticamente
    const firstLines = cleaned.split('\n').slice(0, 5).join('\n').toLowerCase();
    let detectedBank = '';
    if (firstLines.includes('nubank') || firstLines.includes('identificador')) detectedBank = 'Nubank Conta';
    else if (firstLines.includes('date') && firstLines.includes('title') && firstLines.includes('amount')) detectedBank = 'Nubank Cartão';
    else if (firstLines.includes('itaú') || firstLines.includes('itau')) detectedBank = 'Itaú';
    else if (firstLines.includes('bradesco')) detectedBank = 'Bradesco';
    else if (firstLines.includes('santander')) detectedBank = 'Santander';
    else if (firstLines.includes('inter')) detectedBank = 'Banco Inter';
    else if (firstLines.includes('caixa')) detectedBank = 'Caixa';
    else if (firstLines.includes('sicoob')) detectedBank = 'Sicoob';
    else if (firstLines.includes('mercado pago')) detectedBank = 'Mercado Pago';

    const linesCount = cleaned.split('\n').filter(l => l.trim()).length;
    const bankMsg = detectedBank ? `[${detectedBank}] ` : '';
    showToast(`📂 ${bankMsg}${fileName} — ${linesCount - 1} transações carregadas. Clique em "Processar".`, 'success');
  }).catch(() => {
    showToast('❌ Erro ao ler o arquivo. Tente salvar como UTF-8 ou CSV separado por vírgulas.', 'error');
  });
}

function formatImportDate(val) {
  return normalizeDate(val);
}

// ==========================================================================
// 7. SETTINGS PAGE CONTROLLER (BACKUPS, RESETS & LISTS)
// ==========================================================================

function initSettings() {
  document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
  document.getElementById('btn-export-json').addEventListener('click', exportJSON);
  
  const btnResetCurrentMonth = document.getElementById('btn-reset-current-month');
  if (btnResetCurrentMonth) {
    btnResetCurrentMonth.addEventListener('click', () => {
      resetCurrentMonth(true);
    });
  }

  document.getElementById('btn-reset-data').addEventListener('click', () => {
    if (confirm('Tem certeza de que deseja apagar os lanÃ§amentos locais e restaurar a planilha original do Excel?')) {
      resetToDefaultSpreadsheet();
    }
  });
  document.getElementById('btn-clear-data').addEventListener('click', () => {
    if (confirm('ATENÃ‡ÃƒO: Isso apagarÃ¡ permanentemente TODO o histÃ³rico de lanÃ§amentos. Deseja prosseguir?')) {
      db = { entradas: [], empresa: [], pessoal: [] };
      saveDatabase();
      alert('Todos os dados foram apagados.');
      location.reload();
    }
  });
}

function renderSettingsView() {
  const lblActiveMonth = document.getElementById('lbl-active-month-reset');
  if (lblActiveMonth) {
    lblActiveMonth.innerText = selectedMonth;
  }

  // Populate category list pills in settings view
  const renderCatsPills = (containerId, catList) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    catList.forEach(c => {
      const li = document.createElement('li');
      li.innerText = c;
      container.appendChild(li);
    });
  };

  renderCatsPills('settings-empresa-cats', CATEGORIES.empresa);
  renderCatsPills('settings-pessoal-cats', CATEGORIES.pessoal);
  renderCatsPills('settings-entradas-cats', CATEGORIES.entradas);
}

// Backup as CSV
function exportCSV() {
  let csv = '\uFEFF'; // BOM for UTF-8 Excel compatibility
  
  // 1. Export Entradas
  csv += '--- ENTRADAS ---\nMÃªs,Data Pagamento,DescriÃ§Ã£o,Valor (R$),Categoria,Status,ObservaÃ§Ã£o\n';
  db.entradas.forEach(x => {
    csv += `"${x.mes}","${x.data}","${x.descricao}",${x.valor},"${x.categoria}","${x.status}","${x.observacao}"\n`;
  });

  // 2. Export Empresa Expenses
  csv += '\n--- DESPESAS EMPRESA ---\nMÃªs,Vencimento,Data Pagamento,DescriÃ§Ã£o,Categoria,Valor (R$),Status,ObservaÃ§Ã£o\n';
  db.empresa.forEach(x => {
    csv += `"${x.mes}","${x.vencimento}","${x.data}","${x.descricao}","${x.categoria}",${x.valor},"${x.status}","${x.observacao}"\n`;
  });

  // 3. Export Pessoal Expenses
  csv += '\n--- DESPESAS PESSOAIS ---\nMÃªs,Vencimento,Data Pagamento,DescriÃ§Ã£o,Categoria,Valor (R$),Status,ObservaÃ§Ã£o\n';
  db.pessoal.forEach(x => {
    csv += `"${x.mes}","${x.vencimento}","${x.data}","${x.descricao}","${x.categoria}",${x.valor},"${x.status}","${x.observacao}"\n`;
  });

  downloadFile(csv, 'text/csv;charset=utf-8;', 'backup_anota_ai.csv');
}

// Backup as JSON
function exportJSON() {
  const jsonStr = JSON.stringify(db, null, 2);
  downloadFile(jsonStr, 'application/json;charset=utf-8;', 'backup_anota_ai.json');
}

function downloadFile(content, mimeType, filename) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==========================================================================
// 8. HELPERS & FORMATTING
// ==========================================================================

function formatCurrency(val) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(val || 0);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0].substring(2)}`; // DD/MM/YY
  }
  return dateStr;
}

function capitalizeFirstLetter(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Premium Glassmorphic Toast Notifications
function showToast(message, type = 'success', action = null) {
  // Remove existing toasts first
  const existingToasts = document.querySelectorAll('.toast-alert');
  existingToasts.forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = `toast-alert glass animate-scale-up ${type}`;
  
  let iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-triangle';
  else if (type === 'info') iconName = 'info';

  toast.innerHTML = `
    <i data-lucide="${iconName}"></i>
    <span>${message}</span>
  `;

  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-toast-action';
    btn.innerText = action.label;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      action.callback();
      toast.remove();
    });
    toast.appendChild(btn);
  }

  document.body.appendChild(toast);
  
  // Initialize lucide icons for toast
  lucide.createIcons();
  
  // Auto remove (stay longer if there is an undo action)
  const duration = action ? 6000 : 2500;
  
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = '0';
      toast.style.transform = 'translate(-50%, 20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => {
        if (toast.parentNode) toast.remove();
      }, 300);
    }
  }, duration);
}


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


// ==========================================================================
// MÓDULO: REINICIAR MÊS (RESET MONTH MODAL)
// ==========================================================================

function openResetMonthModal() {
  // Update displayed month name in modal
  const nameEl = document.getElementById('reset-month-name');
  if (nameEl) nameEl.textContent = `${selectedMonth} ${selectedYear}`;

  // Reset checkboxes to default state (all checked except fixos status)
  const optEntradas = document.getElementById('reset-opt-entradas');
  const optEmpresa  = document.getElementById('reset-opt-empresa');
  const optPessoal  = document.getElementById('reset-opt-pessoal');
  const optFixos    = document.getElementById('reset-opt-fixos-status');
  if (optEntradas) optEntradas.checked = true;
  if (optEmpresa)  optEmpresa.checked  = true;
  if (optPessoal)  optPessoal.checked  = true;
  if (optFixos)    optFixos.checked    = false;

  // Show modal
  document.getElementById('modal-reset-month').classList.remove('hidden');
  lucide.createIcons();
}

function closeResetMonthModal() {
  document.getElementById('modal-reset-month').classList.add('hidden');
}

function executeResetMonth() {
  const resetEntradas = document.getElementById('reset-opt-entradas')?.checked;
  const resetEmpresa  = document.getElementById('reset-opt-empresa')?.checked;
  const resetPessoal  = document.getElementById('reset-opt-pessoal')?.checked;
  const resetFixos    = document.getElementById('reset-opt-fixos-status')?.checked;

  // Require at least one option
  if (!resetEntradas && !resetEmpresa && !resetPessoal && !resetFixos) {
    showToast('Selecione ao menos uma opção para reiniciar.', 'error');
    return;
  }

  const mes = selectedMonth.toLowerCase();

  // Backup for undo
  lastVoiceTransaction = {
    action: 'reset_month_granular',
    month: selectedMonth,
    backup: {
      entradas:     [...db.entradas],
      empresa:      [...db.empresa],
      pessoal:      [...db.pessoal],
      fixos_status: JSON.parse(JSON.stringify(db.fixos_status || {}))
    }
  };

  const parts = [];

  if (resetEntradas) {
    db.entradas = db.entradas.filter(x => x.mes.toLowerCase() !== mes);
    parts.push('Entradas');
  }
  if (resetEmpresa) {
    db.empresa = db.empresa.filter(x => x.mes.toLowerCase() !== mes);
    parts.push('Empresa');
  }
  if (resetPessoal) {
    db.pessoal = db.pessoal.filter(x => x.mes.toLowerCase() !== mes);
    parts.push('Pessoal');
  }
  if (resetFixos) {
    const key = selectedMonth;
    if (db.fixos_status && db.fixos_status[key]) {
      delete db.fixos_status[key];
    }
    parts.push('Status Fixas');
  }

  saveDatabase();
  closeResetMonthModal();
  populateHistoryFilters();
  renderDashboard();
  if (activeTab === 'fixos') renderFixosView();
  if (activeTab === 'settings') renderSettingsView();

  // Show undo button in voice UI
  const voiceUndoCont = document.getElementById('voice-undo-container');
  if (voiceUndoCont) voiceUndoCont.classList.remove('hidden');

  showToast(
    `🧹 ${selectedMonth} reiniciado! (${parts.join(', ')})`,
    'info',
    { label: 'Desfazer ↩️', callback: () => undoLastVoiceTransaction() }
  );
}

// Hook modal buttons on page load (called after DOM ready)
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('modal-reset-overlay');
  if (overlay) overlay.addEventListener('click', closeResetMonthModal);

  const btnClose = document.getElementById('btn-close-reset-modal');
  if (btnClose) btnClose.addEventListener('click', closeResetMonthModal);

  const btnCancel = document.getElementById('btn-cancel-reset');
  if (btnCancel) btnCancel.addEventListener('click', closeResetMonthModal);

  const btnConfirm = document.getElementById('btn-confirm-reset');
  if (btnConfirm) btnConfirm.addEventListener('click', executeResetMonth);
});
