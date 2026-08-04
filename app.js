/**
 * js/app.js - Orquestrador Geral, Filtros Inteligentes e Fechamento Excel
 */
const App = {
  currentPage: 1,
  limit: 8, 
  activeTab: 'import',
  currentLoadedNote: null,
  activeViewingChave: null,

  // Armazena as tags dos Filtros Avançados (selects e faixas de data/valor)
  smartFilters: {
    uf: '', cfop: '', status: '', emitente: '', destinatario: '',
    municipio: '', natureza: '', dateFrom: '', dateTo: '', valMin: '', valMax: '', direcao: ''
  },

  init() {
    this.setupSaaSSelectors();
    this.setupTabs();
    this.setupUpload();
    this.setupSearchAndFilters();
    this.setupAdvancedFilters();
    this.setupModalClosing();
    this.setupExcelExport();
    this.setupChaveConsulta();
    this.setupCadastroModal();
    
    // Deixa disponível no escopo global para o clique dos badges inteligentes
    window.AppTriggerSmartFilter = (type, value) => this.handleSmartFilterToggle(type, value);

    // Deixa disponível no escopo global para os botões de ação das linhas de Empresas/Funcionários
    window.AppEditTenant = (id) => this.openTenantModal(id);
    window.AppDeleteTenant = (id) => this.handleDeleteTenant(id);
    window.AppEditUser = (id) => this.openUserModal(id);
    window.AppDeleteUser = (id) => this.handleDeleteUser(id);
  },

  setupSaaSSelectors() {
    const tSel = document.getElementById('saasTenantSelect');
    const uSel = document.getElementById('saasUserSelect');
    if(!tSel || !uSel) return;

    this.populateTenantSelect();
    this.populateUserSelect();

    tSel.addEventListener('change', () => {
      SAAS_CONFIG.activeTenant = tSel.value;
      this.populateUserSelect();
      this.refreshCurrentView();
    });
    uSel.addEventListener('change', () => { SAAS_CONFIG.activeUser = uSel.value; this.refreshCurrentView(); });
  },

  // Repopula o select de Empresa Ativa a partir do ApiService (usado no boot e após CRUD de cadastro)
  populateTenantSelect() {
    const tSel = document.getElementById('saasTenantSelect');
    if (!tSel) return;
    tSel.innerHTML = ApiService.getTenants().map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    tSel.value = SAAS_CONFIG.activeTenant;
  },

  // Repopula o select de Funcionário a partir da empresa selecionada (usado no boot e após CRUD de cadastro)
  populateUserSelect() {
    const uSel = document.getElementById('saasUserSelect');
    const tSel = document.getElementById('saasTenantSelect');
    if (!uSel || !tSel) return;
    const tenantId = tSel.value || SAAS_CONFIG.activeTenant;
    uSel.innerHTML = ApiService.getUsersByTenant(tenantId).map(u => `<option value="${u.id}">${u.name}</option>`).join('');
    SAAS_CONFIG.activeTenant = tenantId;
    uSel.value = SAAS_CONFIG.activeUser && ApiService.getUsersByTenant(tenantId).some(u => u.id === SAAS_CONFIG.activeUser)
      ? SAAS_CONFIG.activeUser
      : uSel.value;
    SAAS_CONFIG.activeUser = uSel.value;
  },

  // Chamado após qualquer alteração de cadastro (empresa/funcionário criado, editado ou removido)
  refreshSaaSSelectors() {
    this.populateTenantSelect();
    this.populateUserSelect();
  },

  setupTabs() {
    document.querySelectorAll('.nfe-side-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nfe-side-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        this.activeTab = btn.dataset.tab;
        document.querySelectorAll('.nfe-tab-panel').forEach(p => p.classList.remove('active'));

        if (this.activeTab === 'import') document.getElementById('tabImport').classList.add('active');
        if (this.activeTab === 'bank') {
          document.getElementById('tabBank').classList.add('active');
          this.currentPage = 1;
          this.loadBank();
        }
        if (this.activeTab === 'dashboard') {
          document.getElementById('tabDashboard').classList.add('active');
          this.refreshCurrentView();
        }
        if (this.activeTab === 'cadastro') {
          document.getElementById('tabCadastro').classList.add('active');
          this.loadCadastro();
        }
      });
    });
  },

  setupUpload() {
    const input = document.getElementById('nfeFile');
    if(!input) return;

    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if(!file) return;
      const text = await file.text();
      this.currentLoadedNote = NfeParser.parseXML(text);

      document.getElementById('nfeStatus').innerHTML = `<span class="nfe-status-dot"></span> Nota Processada com Sucesso`;
      document.getElementById('nfeDocMount').innerHTML = NfeUI.buildDocCard(this.currentLoadedNote);
      document.getElementById('nfeResult').classList.add('show');
    });

    document.getElementById('nfeSaveBtn').addEventListener('click', () => {
      if(this.currentLoadedNote) {
        const result = ApiService.saveNoteToTenant(this.currentLoadedNote);

        if (!result.success && result.reason === 'duplicate') {
          alert("Esta nota já está arquivada no banco desta empresa (mesma chave de acesso). Importação bloqueada para evitar duplicidade.");
          return;
        }

        alert("Nota arquivada com sucesso no banco de dados!");
        this.currentLoadedNote = null;
        document.getElementById('nfeResult').classList.remove('show');
      }
    });

    document.getElementById('nfeNewBtn').addEventListener('click', () => {
      this.currentLoadedNote = null;
      document.getElementById('nfeResult').classList.remove('show');
    });
  },

  // Alternador lágico dos filtros inteligentes por badge
  handleSmartFilterToggle(type, value) {
    if (this.smartFilters[type] === value) {
      this.smartFilters[type] = ''; // Desmarca se clicar de novo
    } else {
      this.smartFilters[type] = value;
    }
    this.currentPage = 1;
    this.loadBank();
  },

  // Processamento cruzado da Tabela Excel com os Filtros Avançados
  loadBank() {
    const rawNotes = ApiService.getTenantNotes();
    const search = document.getElementById('bankSearch').value.toLowerCase();

    // Popula/atualiza as opções dos selects com base no que existe no tenant ativo
    this.populateFilterOptions(rawNotes);

    const f = this.smartFilters;
    let filtered = rawNotes.filter(n => {
      const matchSearch = !search ||
                          n.numero.toLowerCase().includes(search) ||
                          n.emitente.toLowerCase().includes(search) ||
                          (n.destinatario || '').toLowerCase().includes(search) ||
                          (n.cnpjEmit || '').toLowerCase().includes(search) ||
                          (n.cnpjDest || '').toLowerCase().includes(search) ||
                          n.chave.toLowerCase().includes(search);

      // Aplicação dos Filtros Avançados (selects e faixas)
      const matchEmitente = !f.emitente || n.emitente === f.emitente;
      const matchDestinatario = !f.destinatario || n.destinatario === f.destinatario;
      const matchUf = !f.uf || n.uf === f.uf;
      const matchMunicipio = !f.municipio || n.municipio === f.municipio;
      const matchStatus = !f.status || n.status === f.status;
      const matchNatureza = !f.natureza || n.naturezaOperacao === f.natureza;
      const matchCfop = !f.cfop || n.cfop === f.cfop;
      const matchDirecao = !f.direcao || ApiService.getNoteDirection(n) === f.direcao;

      const noteDate = n.rawDate ? new Date(n.rawDate) : null;
      const matchDateFrom = !f.dateFrom || (noteDate && !isNaN(noteDate) && noteDate >= new Date(f.dateFrom + 'T00:00:00'));
      const matchDateTo = !f.dateTo || (noteDate && !isNaN(noteDate) && noteDate <= new Date(f.dateTo + 'T23:59:59'));

      const noteVal = parseFloat(n.valorTotal) || 0;
      const matchValMin = f.valMin === '' || noteVal >= parseFloat(f.valMin);
      const matchValMax = f.valMax === '' || noteVal <= parseFloat(f.valMax);

      return matchSearch && matchEmitente && matchDestinatario && matchUf && matchMunicipio &&
             matchStatus && matchNatureza && matchCfop && matchDirecao && matchDateFrom && matchDateTo &&
             matchValMin && matchValMax;
    });

    const total = filtered.length;
    const totalPages = Math.ceil(total / this.limit) || 1;
    const offset = (this.currentPage - 1) * this.limit;
    const paginated = filtered.slice(offset, offset + this.limit);

    document.getElementById('bankCount').innerText = `${total} notas fiscais processadas nesta visão`;
    
    NfeUI.renderTable(paginated, 'admin', null, (note) => this.handleRowClick(note));
    NfeUI.renderPagination(totalPages, this.currentPage, (newPage) => {
      this.currentPage = newPage;
      this.loadBank();
    });
  },

  // Preenche dinamicamente os selects de Emitente, Destinatário, UF, Município, Status, Natureza e CFOP
  populateFilterOptions(rawNotes) {
    const buildOptions = (id, values, currentValue) => {
      const el = document.getElementById(id);
      if (!el) return;
      const unique = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      const options = ['<option value="">Todos</option>'].concat(
        unique.map(v => `<option value="${v}">${v}</option>`)
      );
      el.innerHTML = options.join('');
      el.value = currentValue || '';
    };

    buildOptions('filterEmitente', rawNotes.map(n => n.emitente), this.smartFilters.emitente);
    buildOptions('filterDestinatario', rawNotes.map(n => n.destinatario), this.smartFilters.destinatario);
    buildOptions('filterUf', rawNotes.map(n => n.uf), this.smartFilters.uf);
    buildOptions('filterMunicipio', rawNotes.map(n => n.municipio), this.smartFilters.municipio);
    buildOptions('filterNatureza', rawNotes.map(n => n.naturezaOperacao), this.smartFilters.natureza);
    buildOptions('filterCfop', rawNotes.map(n => n.cfop), this.smartFilters.cfop);

    // Status usa uma lista fixa (Aprovada / Em Análise / Crítica)
    const statusEl = document.getElementById('filterStatus');
    if (statusEl && !statusEl.dataset.populated) {
      statusEl.innerHTML = `
        <option value="">Todos</option>
        <option value="Aprovada">Aprovada</option>
        <option value="Em Análise">Em Análise</option>
        <option value="Crítica">Crítica</option>
      `;
      statusEl.dataset.populated = 'true';
    }
    if (statusEl) statusEl.value = this.smartFilters.status || '';

    // Direção também usa lista fixa (Emitida / Recebida / Não identificada)
    const direcaoEl = document.getElementById('filterDirecao');
    if (direcaoEl && !direcaoEl.dataset.populated) {
      direcaoEl.innerHTML = `
        <option value="">Todas</option>
        <option value="saida">💰 Venda (Saída)</option>
        <option value="entrada">🧾 Despesa (Entrada)</option>
        <option value="indefinida">❓ Não identificada</option>
      `;
      direcaoEl.dataset.populated = 'true';
    }
    if (direcaoEl) direcaoEl.value = this.smartFilters.direcao || '';
  },

  // Conecta os selects e campos de faixa (data/valor) do painel de Filtros Avançados
  setupAdvancedFilters() {
    const selectFieldMap = {
      filterEmitente: 'emitente',
      filterDestinatario: 'destinatario',
      filterUf: 'uf',
      filterMunicipio: 'municipio',
      filterStatus: 'status',
      filterNatureza: 'natureza',
      filterCfop: 'cfop',
      filterDirecao: 'direcao'
    };

    Object.entries(selectFieldMap).forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        this.smartFilters[key] = el.value;
        this.currentPage = 1;
        this.loadBank();
      });
    });

    const rangeFieldMap = {
      filterDateFrom: 'dateFrom',
      filterDateTo: 'dateTo',
      filterValMin: 'valMin',
      filterValMax: 'valMax'
    };

    Object.entries(rangeFieldMap).forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        this.smartFilters[key] = el.value;
        this.currentPage = 1;
        this.loadBank();
      });
    });
  },

  handleRowClick(note) {
    this.activeViewingChave = note.chave;
    document.getElementById('modalStatus').innerText = "Visualização de Auditoria";
    document.getElementById('nfeModalDocMount').innerHTML = NfeUI.buildDocCard(note);
    document.getElementById('nfeModalOverlay').classList.add('show');
  },

  setupSearchAndFilters() {
    document.getElementById('bankSearch').addEventListener('input', () => {
      this.currentPage = 1;
      this.loadBank();
    });

    document.getElementById('bankClearFilters').addEventListener('click', () => {
      document.getElementById('bankSearch').value = '';
      this.smartFilters = {
        uf: '', cfop: '', status: '', emitente: '', destinatario: '',
        municipio: '', natureza: '', dateFrom: '', dateTo: '', valMin: '', valMax: '', direcao: ''
      };
      ['filterEmitente', 'filterDestinatario', 'filterUf', 'filterMunicipio', 'filterStatus', 'filterNatureza', 'filterCfop', 'filterDirecao']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      ['filterDateFrom', 'filterDateTo', 'filterValMin', 'filterValMax']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      this.currentPage = 1;
      this.loadBank();
    });
  },

  // Exportação Excel nativa via biblioteca XLSX (Manter Visão de Fechamento da Foto 3)
  setupExcelExport() {
    const btn = document.getElementById('bankExportBtn');
    if(!btn) return;

    btn.addEventListener('click', () => {
      const rawNotes = ApiService.getTenantNotes();
      if(rawNotes.length === 0) {
        alert("Não há dados cadastrados neste tenant para exportar!");
        return;
      }

      // Mapeamento estruturado das colunas organizadas para Fechamento Fiscal Contábil
      const excelRows = rawNotes.map(n => ({
        'Número': n.numero,
        'Série': n.serie,
        'Chave de Acesso': n.chave,
        'Emitente': n.emitente,
        'UF Origem': n.uf,
        'Município': n.municipio,
        'CFOP Dominante': n.cfop,
        'Forma de Pagamento': n.formaPagamento,
        'Ambiente': n.ambiente,
        'Data Emissao': n.dataEmissao,
        'Valor Total (R$)': parseFloat(n.valorTotal),
        'Valor ICMS (R$)': parseFloat(n.vICMS),
        'Status Triagem': n.status
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Fechamento Fiscal");
      
      // Realiza o download imediato da planilha estruturada
      XLSX.writeFile(workbook, `Fechamento_Fiscal_Tenant_${SAAS_CONFIG.activeTenant}.xlsx`);
    });
  },

  // [Chave de Acesso] Cola/digita os 44 dígitos, formata em blocos de 4 e localiza a nota no banco local do tenant
  setupChaveConsulta() {
    const input = document.getElementById('chaveConsultaInput');
    const btn = document.getElementById('chaveConsultaBtn');
    const msg = document.getElementById('chaveConsultaMsg');
    if (!input || !btn || !msg) return;

    const showMsg = (text, type) => {
      msg.innerText = text;
      msg.className = `nfe-chave-consulta-msg ${type || ''}`.trim();
    };

    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '').slice(0, 44);
      input.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
      showMsg('', '');
    });

    const runConsulta = () => {
      const digits = input.value.replace(/\D/g, '');

      if (digits.length !== 44) {
        showMsg(`Chave inválida: são necessários 44 dígitos (${digits.length} informados).`, 'error');
        return;
      }

      const notes = ApiService.getTenantNotes();
      const found = notes.find(n => (n.chave || '').replace(/\D/g, '') === digits);

      if (found) {
        showMsg(`Nota Nº ${found.numero} localizada no banco local. Abrindo detalhes...`, 'success');
        this.handleRowClick(found);
      } else {
        showMsg('Nota não encontrada no banco local desta empresa. Verifique a chave ou consulte diretamente na SEFAZ.', 'error');
      }
    };

    btn.addEventListener('click', runConsulta);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runConsulta();
    });
  },

  setupModalClosing() {
    const close = () => { document.getElementById('nfeModalOverlay').classList.remove('show'); };
    document.getElementById('nfeModalClose').addEventListener('click', close);
  },

  refreshCurrentView() {
    if (this.activeTab === 'bank') this.loadBank();
    if (this.activeTab === 'dashboard') this.loadDashboard();
    if (this.activeTab === 'cadastro') this.loadCadastro();
  },

  // Consolida os indicadores executivos do tenant ativo para o Dashboard estilo diretoria
  loadDashboard() {
    const notes = ApiService.getTenantNotes();
    const metrics = ApiService.getMetrics();

    // 1) Distribuição por status de triagem (aprovada / em análise / crítica)
    const statusCounts = { 'Aprovada': 0, 'Em Análise': 0, 'Crítica': 0 };
    notes.forEach(n => { if (statusCounts[n.status] !== undefined) statusCounts[n.status]++; });

    // 2) Distribuição geográfica por UF (mantido do dashboard anterior)
    const ufDist = {};
    notes.forEach(n => { if (n.uf) ufDist[n.uf] = (ufDist[n.uf] || 0) + 1; });

    // 3) Série de faturamento mensal (últimos 6 meses com movimentação)
    const monthlyMap = {};
    notes.forEach(n => {
      const d = n.rawDate ? new Date(n.rawDate) : null;
      if (!d || isNaN(d)) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyMap[key]) monthlyMap[key] = { key, label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), total: 0 };
      monthlyMap[key].total += parseFloat(n.valorTotal) || 0;
    });
    const monthlySeries = Object.values(monthlyMap).sort((a, b) => a.key.localeCompare(b.key)).slice(-6);

    // 4) Exposição a risco: % do valor total concentrado em notas "Crítica"
    const totalValor = notes.reduce((acc, n) => acc + (parseFloat(n.valorTotal) || 0), 0);
    const valorCritico = notes.filter(n => n.status === 'Crítica').reduce((acc, n) => acc + (parseFloat(n.valorTotal) || 0), 0);
    const riskPct = totalValor > 0 ? Math.round((valorCritico / totalValor) * 100) : 0;

    // 4.1) Classificação financeira pelo código oficial tpNF da NF-e: Venda (Saída) x Despesa (Entrada)
    const totalVendas = notes.filter(n => ApiService.getNoteDirection(n) === 'saida').reduce((acc, n) => acc + (parseFloat(n.valorTotal) || 0), 0);
    const totalDespesas = notes.filter(n => ApiService.getNoteDirection(n) === 'entrada').reduce((acc, n) => acc + (parseFloat(n.valorTotal) || 0), 0);
    const saldo = totalVendas - totalDespesas;
    const indefinidaCount = notes.filter(n => ApiService.getNoteDirection(n) === 'indefinida').length;

    // 5) Resumo executivo (ticket médio, maior nota, ICMS acumulado, ambiente predominante)
    const ticketMedio = notes.length ? totalValor / notes.length : 0;
    const maiorNota = notes.reduce((max, n) => Math.max(max, parseFloat(n.valorTotal) || 0), 0);
    const icmsTotal = notes.reduce((acc, n) => acc + (parseFloat(n.vICMS) || 0), 0);
    const ambienteCounts = {};
    notes.forEach(n => { ambienteCounts[n.ambiente] = (ambienteCounts[n.ambiente] || 0) + 1; });
    const ambientePredominante = Object.entries(ambienteCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

    // 6) Concentração por fornecedor (risco de dependência de poucos emitentes)
    const supplierMap = {};
    notes.forEach(n => { supplierMap[n.emitente] = (supplierMap[n.emitente] || 0) + (parseFloat(n.valorTotal) || 0); });
    const supplierEntries = Object.entries(supplierMap).sort((a, b) => b[1] - a[1]);
    const topSuppliers = supplierEntries.slice(0, 4).map(([name, value]) => ({
      name, value, pct: totalValor ? Math.round((value / totalValor) * 100) : 0
    }));
    const restTotal = supplierEntries.slice(4).reduce((acc, [, v]) => acc + v, 0);
    if (restTotal > 0) {
      topSuppliers.push({ name: 'Outros fornecedores', value: restTotal, pct: totalValor ? Math.round((restTotal / totalValor) * 100) : 0 });
    }

    NfeUI.renderDashboard({
      metrics, statusCounts, ufDist, monthlySeries, riskPct, totalValor,
      financeiro: { totalVendas, totalDespesas, saldo, indefinidaCount },
      executive: { ticketMedio, maiorNota, icmsTotal, ambientePredominante },
      supplierConcentration: topSuppliers
    });
  },

  // ============================================================
  // [REQUISITO: Cadastro de Empresas e Funcionários]
  // ============================================================

  loadCadastro() {
    const session = ApiService.getSession();
    const tenants = ApiService.getTenants();
    const users = ApiService.getUsers();
    const systemLogs = ApiService.getSystemLogs();

    NfeUI.renderCadastro({ session, tenants, users, systemLogs });
    this.setupCadastroButtons();
  },

  setupCadastroButtons() {
    const btnNewTenant = document.getElementById('btnNewTenant');
    if (btnNewTenant) btnNewTenant.addEventListener('click', () => this.openTenantModal(null));

    const btnNewUser = document.getElementById('btnNewUser');
    if (btnNewUser) btnNewUser.addEventListener('click', () => this.openUserModal(null));
  },

  setupCadastroModal() {
    const overlay = document.getElementById('cadastroModalOverlay');
    const closeBtn = document.getElementById('cadastroModalClose');
    if (!overlay || !closeBtn) return;
    closeBtn.addEventListener('click', () => overlay.classList.remove('show'));
  },

  // Abre o formulário de criação/edição de Empresa
  openTenantModal(tenantId) {
    const isEdit = !!tenantId;
    const tenant = isEdit ? ApiService.getTenants().find(t => t.id === tenantId) : null;

    document.getElementById('cadastroModalTitle').innerText = isEdit ? 'Editar Empresa' : 'Nova Empresa';
    document.getElementById('cadastroModalBody').innerHTML = `
      <div style="display:flex; flex-direction:column; gap:14px; padding: 8px 4px 4px;">
        <div class="nfe-filter-field">
          <label>Nome da Empresa</label>
          <input type="text" id="formTenantName" placeholder="Ex.: Tech Solutions Brasil Ltda" value="${tenant ? tenant.name : ''}">
        </div>
        <div class="nfe-filter-field">
          <label>CNPJ (opcional)</label>
          <input type="text" id="formTenantCnpj" placeholder="00.000.000/0000-00" value="${tenant ? (tenant.cnpj || '') : ''}">
        </div>
        <div class="nfe-error" id="formTenantError" style="margin-top:0;"></div>
        <button class="nfe-btn nfe-btn-primary" id="formTenantSubmit">${isEdit ? 'Salvar Alterações' : 'Cadastrar Empresa'}</button>
      </div>
    `;

    document.getElementById('formTenantSubmit').addEventListener('click', () => {
      const name = document.getElementById('formTenantName').value;
      const cnpj = document.getElementById('formTenantCnpj').value;
      const errorBox = document.getElementById('formTenantError');

      const result = isEdit
        ? ApiService.updateTenant(tenantId, { name, cnpj })
        : ApiService.createTenant({ name, cnpj });

      if (!result.success) {
        errorBox.classList.add('show');
        errorBox.innerText = this.mapCadastroError(result.reason);
        return;
      }

      document.getElementById('cadastroModalOverlay').classList.remove('show');
      this.refreshSaaSSelectors();
      this.loadCadastro();
    });

    document.getElementById('cadastroModalOverlay').classList.add('show');
  },

  // Abre o formulário de criação/edição de Funcionário
  openUserModal(userId) {
    const isEdit = !!userId;
    const user = isEdit ? ApiService.getUsers().find(u => u.id === userId) : null;
    const tenants = ApiService.getTenants();
    const defaultTenantId = user ? user.tenantId : SAAS_CONFIG.activeTenant;

    document.getElementById('cadastroModalTitle').innerText = isEdit ? 'Editar Funcionário' : 'Novo Funcionário';
    document.getElementById('cadastroModalBody').innerHTML = `
      <div style="display:flex; flex-direction:column; gap:14px; padding: 8px 4px 4px;">
        <div class="nfe-filter-field">
          <label>Nome do Funcionário</label>
          <input type="text" id="formUserName" placeholder="Ex.: Ana Souza" value="${user ? user.name : ''}">
        </div>
        <div class="nfe-filter-field">
          <label>Empresa</label>
          <select id="formUserTenant" ${isEdit ? 'disabled' : ''}>
            ${tenants.map(t => `<option value="${t.id}" ${defaultTenantId === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
          </select>
        </div>
        <div class="nfe-filter-field">
          <label>Papel</label>
          <select id="formUserRole">
            <option value="admin" ${user && user.role === 'admin' ? 'selected' : ''}>Administrador</option>
            <option value="operador" ${user && user.role === 'operador' ? 'selected' : ''}>Operador</option>
            <option value="leitura" ${!user || user.role === 'leitura' ? 'selected' : ''}>Leitura</option>
          </select>
        </div>
        <div class="nfe-error" id="formUserError" style="margin-top:0;"></div>
        <button class="nfe-btn nfe-btn-primary" id="formUserSubmit">${isEdit ? 'Salvar Alterações' : 'Cadastrar Funcionário'}</button>
      </div>
    `;

    document.getElementById('formUserSubmit').addEventListener('click', () => {
      const name = document.getElementById('formUserName').value;
      const role = document.getElementById('formUserRole').value;
      const tenantId = document.getElementById('formUserTenant').value;
      const errorBox = document.getElementById('formUserError');

      const result = isEdit
        ? ApiService.updateUser(userId, { name, role })
        : ApiService.createUser({ tenantId, name, role });

      if (!result.success) {
        errorBox.classList.add('show');
        errorBox.innerText = this.mapCadastroError(result.reason);
        return;
      }

      document.getElementById('cadastroModalOverlay').classList.remove('show');
      this.refreshSaaSSelectors();
      this.loadCadastro();
    });

    document.getElementById('cadastroModalOverlay').classList.add('show');
  },

  handleDeleteTenant(id) {
    const tenant = ApiService.getTenants().find(t => t.id === id);
    if (!tenant) return;
    if (!confirm(`Remover a empresa "${tenant.name}"? Isso também removerá seus funcionários cadastrados.`)) return;

    const result = ApiService.deleteTenant(id);
    if (!result.success) {
      alert(this.mapCadastroError(result.reason));
      return;
    }

    this.refreshSaaSSelectors();
    this.loadCadastro();
    this.refreshCurrentView();
  },

  handleDeleteUser(id) {
    const user = ApiService.getUsers().find(u => u.id === id);
    if (!user) return;
    if (!confirm(`Remover o funcionário "${user.name}"?`)) return;

    const result = ApiService.deleteUser(id);
    if (!result.success) {
      alert(this.mapCadastroError(result.reason));
      return;
    }

    this.refreshSaaSSelectors();
    this.loadCadastro();
  },

  // Traduz os motivos de erro retornados pelo ApiService em mensagens amigáveis
  mapCadastroError(reason) {
    const map = {
      nome_obrigatorio: 'O nome é obrigatório.',
      cnpj_duplicado: 'Já existe uma empresa cadastrada com este CNPJ.',
      empresa_invalida: 'Selecione uma empresa válida.',
      papel_invalido: 'Selecione um papel válido.',
      nao_encontrada: 'Empresa não encontrada.',
      nao_encontrado: 'Funcionário não encontrado.',
      ultima_empresa: 'Não é possível remover a última empresa cadastrada no ambiente.',
      ultimo_funcionario: 'Não é possível remover o último funcionário desta empresa.',
      possui_notas: 'Esta empresa possui notas fiscais arquivadas e não pode ser removida.'
    };
    return map[reason] || 'Não foi possível concluir a operação.';
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());