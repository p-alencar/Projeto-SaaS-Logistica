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
    this.setupAuthScreen();

    if (!ApiService.isAuthenticated()) {
      this.showAuthScreen();
      return;
    }
    this.boot();
  },

  // Inicializa a aplicação principal (chamado após login/registro bem-sucedido ou se já havia sessão salva)
  boot() {
    this.showApp();
    this.setupTopbarUser();
    this.setupTabs();
    this.setupUpload();
    this.setupSearchAndFilters();
    this.setupAdvancedFilters();
    this.setupModalClosing();
    this.setupExcelExport();
    this.setupChaveConsulta();
    this.setupCadastroModal();
    this.setupClearDataButton();

    // Deixa disponível no escopo global para o clique dos badges inteligentes
    window.AppTriggerSmartFilter = (type, value) => this.handleSmartFilterToggle(type, value);
  },

  showAuthScreen() {
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('nfeAppRoot').style.display = 'none';
  },

  showApp() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('nfeAppRoot').style.display = 'flex';
  },

  // Preenche o nome do usuário logado na topbar e liga o botão de logout / minha conta
  setupTopbarUser() {
    const user = ApiService.getCurrentUser();
    const nameEl = document.getElementById('topbarUserName');
    if (nameEl && user) nameEl.innerText = user.name;

    const logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        ApiService.logout();
        location.reload();
      });
    }

    const accountBtn = document.getElementById('btnMyAccount');
    if (accountBtn) accountBtn.addEventListener('click', () => this.openAccountModal());
  },

  // ============================================================
  // Tela de Login / Registro
  // ============================================================
  setupAuthScreen() {
    const loginPanel = document.getElementById('authLoginPanel');
    const registerPanel = document.getElementById('authRegisterPanel');

    document.getElementById('goToRegister').addEventListener('click', (e) => {
      e.preventDefault();
      loginPanel.style.display = 'none';
      registerPanel.style.display = 'block';
    });
    document.getElementById('goToLogin').addEventListener('click', (e) => {
      e.preventDefault();
      registerPanel.style.display = 'none';
      loginPanel.style.display = 'block';
    });

    document.getElementById('loginSubmit').addEventListener('click', () => {
      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPassword').value;
      const errorBox = document.getElementById('loginError');

      const result = ApiService.login({ email, password });
      if (!result.success) {
        errorBox.classList.add('show');
        errorBox.innerText = this.mapAuthError(result.reason);
        return;
      }
      errorBox.classList.remove('show');
      this.boot();
    });

    document.getElementById('registerSubmit').addEventListener('click', () => {
      const name = document.getElementById('regName').value;
      const email = document.getElementById('regEmail').value;
      const password = document.getElementById('regPassword').value;
      const razaoSocial = document.getElementById('regRazaoSocial').value;
      const cnpj = document.getElementById('regCnpj').value;
      const errorBox = document.getElementById('registerError');

      const result = ApiService.register({ name, email, password, razaoSocial, cnpj });
      if (!result.success) {
        errorBox.classList.add('show');
        errorBox.innerText = this.mapAuthError(result.reason);
        return;
      }
      errorBox.classList.remove('show');
      this.boot();
    });

    // Enter também envia os formulários
    ['loginEmail', 'loginPassword'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('loginSubmit').click();
      });
    });
    ['regName', 'regEmail', 'regPassword', 'regRazaoSocial', 'regCnpj'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('registerSubmit').click();
      });
    });
  },

  mapAuthError(reason) {
    const map = {
      nome_obrigatorio: 'O nome é obrigatório.',
      email_invalido: 'Informe um e-mail válido.',
      senha_curta: 'A senha deve ter ao menos 4 caracteres.',
      email_duplicado: 'Já existe uma conta com este e-mail.',
      credenciais_invalidas: 'E-mail ou senha incorretos.',
      senha_atual_incorreta: 'A senha atual informada está incorreta.',
      sem_sessao: 'Sua sessão expirou. Faça login novamente.'
    };
    return map[reason] || 'Não foi possível concluir a operação.';
  },

  // Modal "Minha Conta" — editar nome/razão social/CNPJ e trocar senha
  openAccountModal() {
    const user = ApiService.getCurrentUser();
    if (!user) return;

    document.getElementById('cadastroModalTitle').innerText = 'Minha Conta';
    document.getElementById('cadastroModalBody').innerHTML = `
      <div style="display:flex; flex-direction:column; gap:14px; padding: 8px 4px 4px;">
        <div class="nfe-filter-field">
          <label>Nome</label>
          <input type="text" id="accName" value="${user.name}">
        </div>
        <div class="nfe-filter-field">
          <label>E-mail</label>
          <input type="text" value="${user.email}" disabled>
        </div>
        <div class="nfe-filter-field">
          <label>Razão Social</label>
          <input type="text" id="accRazaoSocial" value="${user.razaoSocial || ''}" placeholder="Nome da sua empresa">
        </div>
        <div class="nfe-filter-field">
          <label>CNPJ</label>
          <input type="text" id="accCnpj" value="${user.cnpj || ''}" placeholder="00.000.000/0000-00">
        </div>
        <div class="nfe-error" id="accError" style="margin-top:0;"></div>
        <button class="nfe-btn nfe-btn-primary" id="accSubmit">Salvar Alterações</button>

        <hr style="border:none; border-top:1px solid var(--line); margin:6px 0;">

        <p style="font-size:13px; font-weight:600; color:var(--ink); margin:0;">Alterar senha</p>
        <div class="nfe-filter-field">
          <label>Senha atual</label>
          <input type="password" id="accCurrentPassword">
        </div>
        <div class="nfe-filter-field">
          <label>Nova senha</label>
          <input type="password" id="accNewPassword" placeholder="Mínimo 4 caracteres">
        </div>
        <div class="nfe-error" id="accPasswordError" style="margin-top:0;"></div>
        <button class="nfe-btn" id="accPasswordSubmit">Alterar Senha</button>
      </div>
    `;

    document.getElementById('accSubmit').addEventListener('click', () => {
      const name = document.getElementById('accName').value;
      const razaoSocial = document.getElementById('accRazaoSocial').value;
      const cnpj = document.getElementById('accCnpj').value;
      const errorBox = document.getElementById('accError');

      const result = ApiService.updateProfile({ name, razaoSocial, cnpj });
      if (!result.success) {
        errorBox.classList.add('show');
        errorBox.innerText = this.mapAuthError(result.reason);
        return;
      }
      document.getElementById('topbarUserName').innerText = result.user.name;
      document.getElementById('cadastroModalOverlay').classList.remove('show');
      this.refreshCurrentView();
    });

    document.getElementById('accPasswordSubmit').addEventListener('click', () => {
      const currentPassword = document.getElementById('accCurrentPassword').value;
      const newPassword = document.getElementById('accNewPassword').value;
      const errorBox = document.getElementById('accPasswordError');

      const result = ApiService.changePassword({ currentPassword, newPassword });
      if (!result.success) {
        errorBox.classList.add('show');
        errorBox.innerText = this.mapAuthError(result.reason);
        return;
      }
      errorBox.classList.remove('show');
      alert('Senha alterada com sucesso.');
      document.getElementById('accCurrentPassword').value = '';
      document.getElementById('accNewPassword').value = '';
    });

    document.getElementById('cadastroModalOverlay').classList.add('show');
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
        const result = ApiService.saveNote(this.currentLoadedNote);

        if (!result.success && result.reason === 'duplicate') {
          alert("Esta nota já está arquivada no seu banco de notas (mesma chave de acesso). Importação bloqueada para evitar duplicidade.");
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
    const rawNotes = ApiService.getUserNotes();
    const search = document.getElementById('bankSearch').value.toLowerCase();

    // Popula/atualiza as opções dos selects com base no que existe na conta ativa
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
      const rawNotes = ApiService.getUserNotes();
      if(rawNotes.length === 0) {
        alert("Não há notas cadastradas na sua conta para exportar!");
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
      const user = ApiService.getCurrentUser();
      XLSX.writeFile(workbook, `Fechamento_Fiscal_${(user && user.name || 'conta').replace(/\s+/g, '_')}.xlsx`);
    });
  },

  // [Chave de Acesso] Cola/digita os 44 dígitos, formata em blocos de 4 e localiza a nota no banco local da conta
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

      const notes = ApiService.getUserNotes();
      const found = notes.find(n => (n.chave || '').replace(/\D/g, '') === digits);

      if (found) {
        showMsg(`Nota Nº ${found.numero} localizada no banco local. Abrindo detalhes...`, 'success');
        this.handleRowClick(found);
      } else {
        showMsg('Nota não encontrada no seu banco local. Verifique a chave ou consulte diretamente na SEFAZ.', 'error');
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
  },

  // Consolida os indicadores executivos da conta ativa para o Dashboard estilo diretoria
  loadDashboard() {
    const notes = ApiService.getUserNotes();
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

  setupCadastroModal() {
    const overlay = document.getElementById('cadastroModalOverlay');
    const closeBtn = document.getElementById('cadastroModalClose');
    if (!overlay || !closeBtn) return;
    closeBtn.addEventListener('click', () => overlay.classList.remove('show'));
  },

  // Engrenagem no topo: abre a zona de risco para limpar as bases locais (localStorage)
  setupClearDataButton() {
    const btn = document.getElementById('btnClearData');
    if (btn) btn.addEventListener('click', () => this.openClearDataModal());
  },

  openClearDataModal() {
    document.getElementById('cadastroModalTitle').innerText = '⚠️ Limpar Base de Dados';
    document.getElementById('cadastroModalBody').innerHTML = `
      <div style="display:flex; flex-direction:column; gap:14px; padding: 8px 4px 4px;">
        <p style="font-size:13px; color:var(--ink-soft); line-height:1.5; margin:0;">
          Esta ação apaga permanentemente os dados selecionados no armazenamento local do navegador. Não é possível desfazer.
        </p>

        <label style="display:flex; gap:8px; align-items:flex-start; font-size:13px; cursor:pointer;">
          <input type="checkbox" id="clearNotes" checked style="margin-top:3px;">
          <span><b>Notas fiscais</b> — todo o seu banco de notas importadas</span>
        </label>
        <label style="display:flex; gap:8px; align-items:flex-start; font-size:13px; cursor:pointer;">
          <input type="checkbox" id="clearLogs" checked style="margin-top:3px;">
          <span><b>Logs de auditoria</b> — histórico geral de ações do sistema</span>
        </label>
        <label style="display:flex; gap:8px; align-items:flex-start; font-size:13px; cursor:pointer;">
          <input type="checkbox" id="clearAllAccounts" style="margin-top:3px;">
          <span><b>Todas as contas cadastradas</b> — apaga também os logins de todos os usuários e encerra sua sessão</span>
        </label>

        <div class="nfe-filter-field">
          <label>Para confirmar, digite <b>LIMPAR</b> abaixo</label>
          <input type="text" id="clearConfirmInput" placeholder="LIMPAR" autocomplete="off">
        </div>

        <div class="nfe-error" id="clearDataError"></div>

        <button class="nfe-btn" id="clearDataSubmit" style="background:var(--danger); color:white; border-color:var(--danger); opacity:0.5; pointer-events:none; transition:opacity 0.15s;">
          Apagar dados selecionados
        </button>
      </div>
    `;

    const submitBtn = document.getElementById('clearDataSubmit');
    const confirmInput = document.getElementById('clearConfirmInput');

    confirmInput.addEventListener('input', () => {
      const active = confirmInput.value.trim().toUpperCase() === 'LIMPAR';
      submitBtn.style.opacity = active ? '1' : '0.5';
      submitBtn.style.pointerEvents = active ? 'auto' : 'none';
    });

    submitBtn.addEventListener('click', () => {
      const notes = document.getElementById('clearNotes').checked;
      const logs = document.getElementById('clearLogs').checked;
      const allAccounts = document.getElementById('clearAllAccounts').checked;
      const errorBox = document.getElementById('clearDataError');

      if (!notes && !logs && !allAccounts) {
        errorBox.classList.add('show');
        errorBox.innerText = 'Selecione ao menos um tipo de dado para limpar.';
        return;
      }

      ApiService.clearAllData({ notes, logs, allAccounts });
      document.getElementById('cadastroModalOverlay').classList.remove('show');
      // Recarrega para reinicializar o app (volta para a tela de login se as contas foram apagadas)
      location.reload();
    });

    document.getElementById('cadastroModalOverlay').classList.add('show');
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());