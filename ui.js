/**
 * js/ui.js - Renderização Avançada, Filtros Inteligentes e Copiar Chave/Adicionais
 */
const NfeUI = {
  // Constrói o visual interno completo com botões funcionais de cópia
  buildDocCard(note) {
    let itemsRows = '';
    note.itensList.forEach(item => {
      itemsRows += `
        <tr>
          <td>${item.nItem}</td>
          <td><b>${item.cProd}</b> - ${item.xProd}</td>
          <td>${item.NCM}</td>
          <td>${item.CFOP}</td>
          <td>${item.uCom}</td>
          <td class="num">${parseFloat(item.qCom).toLocaleString('pt-BR')}</td>
          <td class="num">R$ ${parseFloat(item.vUnCom).toLocaleString('pt-BR', {minimumFractionDigits:4})}</td>
          <td class="num">R$ ${parseFloat(item.vProd).toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
        </tr>
      `;
    });

    return `
      <div class="nfe-doc">
        <div class="nfe-doc-head">
          <div style="margin-bottom:16px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            ${this.buildDirectionBadge(note)}
            <span style="font-size:12px; color:var(--ink-soft);">${this.buildDirectionExplanation(note)}</span>
          </div>
          <div class="nfe-doc-toprow">
            <div>
              <h3 class="nfe-nat">${note.naturezaOperacao}</h3>
              <div class="nfe-meta">Emissão: <b>${note.dataEmissao}</b> | Ambiente: <span style="font-weight:700; color:var(--steel);">${note.ambiente}</span></div>
            </div>
            <div class="nfe-numserie">
              <span class="n">Nº ${note.numero}</span><br>
              <span class="s">SÉRIE ${note.serie}</span>
            </div>
          </div>
          <div class="nfe-chave-wrap">
            <div style="flex:1;">
              <div class="nfe-chave-label">CHAVE DE ACESSO DO DOCUMENTO</div>
              <div class="nfe-chave" id="txtChaveDoc">${note.chave}</div>
            </div>
            <button class="nfe-btn" style="padding:6px 12px; font-size:12px;" onclick="navigator.clipboard.writeText('${note.chave}'); alert('Chave copiada para a área de transferência!');">Copiar Chave</button>
          </div>
        </div>

        <div class="nfe-section">
          <div class="nfe-parties">
            <div>
              <div class="nfe-party-role">Emitente</div>
              <div class="nfe-party-name">${note.emitente}</div>
              <div class="nfe-party-doc">${note.cnpjEmit}</div>
              <div class="nfe-party-doc">${note.municipio} - ${note.uf}</div>
            </div>
            <div>
              <div class="nfe-party-role">Destinatário</div>
              <div class="nfe-party-name">${note.destinatario}</div>
              <div class="nfe-party-doc">${note.cnpjDest}</div>
              <div class="nfe-party-doc">${note.municipioDest} - ${note.ufDest}</div>
            </div>
          </div>
        </div>

        <div class="nfe-section">
          <p class="nfe-section-label">Totais Gerais</p>
          <div class="nfe-tax-grid" style="grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 12px;">
            <div class="nfe-tax-cell"><div class="l">Base de Cálculo ICMS</div><div class="v">R$ ${parseFloat(note.vBC).toLocaleString('pt-BR', {minimumFractionDigits:2})}</div></div>
            <div class="nfe-tax-cell"><div class="l">Valor do ICMS</div><div class="v">R$ ${parseFloat(note.vICMS).toLocaleString('pt-BR', {minimumFractionDigits:2})}</div></div>
            <div class="nfe-tax-cell"><div class="l">Valor dos Produtos</div><div class="v">R$ ${parseFloat(note.vProd).toLocaleString('pt-BR', {minimumFractionDigits:2})}</div></div>
            <div class="nfe-tax-cell"><div class="l">Forma de Pagamento</div><div class="v" style="font-size:15px; color:var(--steel);">${note.formaPagamento}</div></div>
          </div>
        </div>

        <div class="nfe-section">
          <p class="nfe-section-label">Impostos e Descontos</p>
          ${NfeUI.buildTaxSummaryGrid(note)}
        </div>

        <div class="nfe-section">
          <p class="nfe-section-label">Itens da Nota</p>
          <div class="nfe-table-scroll">
            <table class="nfe-items" style="font-size:12px;">
              <thead>
                <tr><th>#</th><th>Descrição</th><th>NCM</th><th>CFOP</th><th>UND</th><th class="num">Qtd</th><th class="num">V.Unit</th><th class="num">V.Total</th></tr>
              </thead>
              <tbody>${itemsRows}</tbody>
            </table>
          </div>
        </div>

        <div class="nfe-section" style="background:var(--line-soft);">
          <div style="display:flex; justify-content:between; align-items:center; margin-bottom:8px;">
            <p class="nfe-section-label" style="margin:0;">Informações Complementares e Adicionais</p>
            <button class="nfe-btn" style="padding:4px 8px; font-size:11px; margin-left:auto;" onclick="navigator.clipboard.writeText(document.getElementById('txtInfoCpl').innerText); alert('Informações complementares copiadas!');">Copiar Informações</button>
          </div>
          <div id="txtInfoCpl" style="font-size:13px; color:var(--ink-soft); line-height:1.4; background:var(--paper); padding:12px; border-radius:8px; border:1px solid var(--line); white-space:pre-wrap;">${note.infoComplementares}</div>
        </div>

        <div class="nfe-section">
          <div class="nfe-total-hero">
            <span class="nfe-total-hero-label">VALOR TOTAL DA NOTA</span>
            <span class="nfe-total-hero-value">R$ ${parseFloat(note.valorTotal).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
          </div>
        </div>
      </div>
    `;
  },

  // Constrói o grid compacto de Impostos e Descontos (Produtos, Desconto, Frete, ICMS, IPI, PIS, COFINS, Outras Desp.)
  buildTaxSummaryGrid(note) {
    const fmt = (val) => parseFloat(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

    const fields = [
      { label: 'Produtos', value: note.vProd, color: 'var(--ink)' },
      { label: 'Desconto', value: note.vDesc, color: 'var(--danger)' },
      { label: 'Frete', value: note.vFrete, color: 'var(--steel)' },
      { label: 'ICMS', value: note.vICMS, color: 'var(--steel)' },
      { label: 'IPI', value: note.vIPI, color: 'var(--brand-dark)' },
      { label: 'PIS', value: note.vPIS, color: 'var(--brand-dark)' },
      { label: 'COFINS', value: note.vCOFINS, color: 'var(--brand-dark)' },
      { label: 'Outras Desp.', value: note.vOutro, color: 'var(--brand-dark)' }
    ];

    let cells = fields.map(f => `
      <div class="nfe-summary-cell">
        <div class="nfe-summary-label">${f.label}</div>
        <div class="nfe-summary-value" style="color:${f.color};">R$ ${fmt(f.value)}</div>
      </div>
    `).join('');

    return `<div class="nfe-summary-grid">${cells}</div>`;
  },

  // Monta os Filtros Inteligentes Clássicos (Resumos Clicáveis de UF, CFOP e Status)
  renderSmartFilters(notes, activeFilters, onFilterSelectCallback) {
    const smartWrap = document.getElementById('smartFiltersWrap');
    if (!smartWrap) return;

    // Contabiliza distribuição dos dados carregados no ecossistema
    const ufs = {}, cfops = {}, status = { 'Aprovada': 0, 'Em Análise': 0, 'Crítica': 0 };
    notes.forEach(n => {
      if(n.uf) ufs[n.uf] = (ufs[n.uf] || 0) + 1;
      if(n.cfop) cfops[n.cfop] = (cfops[n.cfop] || 0) + 1;
      if(n.status) status[n.status] = (status[n.status] || 0) + 1;
    });

    let html = `<div style="display:flex; flex-direction:column; gap:16px;">`;

    // Bloco UF
    html += `<div><small style="font-weight:700; color:var(--ink-soft); display:block; margin-bottom:6px; font-size:11px; text-transform:uppercase;">Filtragem Rápida por Estado (UF)</small><div style="display:flex; flex-wrap:wrap; gap:6px;">`;
    Object.entries(ufs).forEach(([uf, qty]) => {
      const active = activeFilters.uf === uf ? 'background:var(--brand); color:#FFF;' : 'background:var(--paper);';
      html += `<button class="nfe-btn" style="padding:6px 12px; font-size:12px; ${active}" onclick="window.AppTriggerSmartFilter('uf', '${uf}')">${uf} (${qty})</button>`;
    });
    html += `</div></div>`;

    // Bloco CFOP
    html += `<div><small style="font-weight:700; color:var(--ink-soft); display:block; margin-bottom:6px; font-size:11px; text-transform:uppercase;">Filtragem Rápida por CFOP</small><div style="display:flex; flex-wrap:wrap; gap:6px;">`;
    Object.entries(cfops).forEach(([cfop, qty]) => {
      const active = activeFilters.cfop === cfop ? 'background:var(--steel); color:#FFF;' : 'background:var(--paper);';
      html += `<button class="nfe-btn" style="padding:6px 12px; font-size:12px; ${active}" onclick="window.AppTriggerSmartFilter('cfop', '${cfop}')">CFOP ${cfop} (${qty})</button>`;
    });
    html += `</div></div>`;

    // Bloco Status
    html += `<div><small style="font-weight:700; color:var(--ink-soft); display:block; margin-bottom:6px; font-size:11px; text-transform:uppercase;">Situação Fiscal</small><div style="display:flex; flex-wrap:wrap; gap:6px;">`;
    Object.entries(status).forEach(([st, qty]) => {
      const active = activeFilters.status === st ? 'box-shadow: 0 0 0 2px var(--ink); font-weight:700;' : '';
      let badgeStyle = 'background:#EAF6EF; color:var(--brand-dark);';
      if(st === 'Crítica') badgeStyle = 'background:#FBEEEA; color:var(--danger);';
      if(st === 'Em Análise') badgeStyle = 'background:#FCF4E7; color:#8F6B1B;';
      
      html += `<button class="nfe-btn" style="padding:6px 12px; font-size:12px; ${badgeStyle} ${active}" onclick="window.AppTriggerSmartFilter('status', '${st}')">${st} (${qty})</button>`;
    });
    html += `</div></div></div>`;

    smartWrap.innerHTML = html;
  },

  // Badge de Direção da nota: Venda (Saída) x Despesa (Entrada) x Não identificada
  buildDirectionBadge(note) {
    const direction = ApiService.getNoteDirection(note);
    const map = {
      saida: { label: 'Venda (Saída)', style: 'background:#EAF6EF; color:var(--brand-dark);', icon: '💰' },
      entrada: { label: 'Despesa (Entrada)', style: 'background:#FBEEEA; color:var(--danger);', icon: '🧾' },
      indefinida: { label: 'Não identificada', style: 'background:var(--line-soft); color:var(--ink-soft);', icon: '❓' }
    };
    const info = map[direction] || map.indefinida;
    return `<span class="nfe-status" style="${info.style}">${info.icon} ${info.label}</span>`;
  },

  // Texto explicativo mostrado no card detalhado da nota
  buildDirectionExplanation(note) {
    const direction = ApiService.getNoteDirection(note);
    const map = {
      saida: 'Nota classificada como <b>Venda</b> (Saída, tpNF=1) — será somada como receita no Dashboard.',
      entrada: 'Nota classificada como <b>Despesa</b> (Entrada, tpNF=0) — será somada como custo no Dashboard.',
      indefinida: 'Não foi possível identificar a direção desta nota pelo código tpNF nem pelo CNPJ. Cadastre o <b>CNPJ da empresa</b> em Cadastro → Editar Empresa para habilitar a identificação por CNPJ como reserva.'
    };
    return map[direction] || map.indefinida;
  },

  renderTable(notes, userRole, onDeleteCallback, onRowClickCallback) {
    const tbody = document.getElementById('bankTableBody');
    tbody.innerHTML = '';

    notes.forEach(note => {
      const tr = document.createElement('tr');
      tr.className = 'nfe-bank-row';

      let badgeClass = 'nfe-status';
      if (note.status === 'Crítica') badgeClass += ' nfe-status-warn';

      tr.innerHTML = `
        <td><b>${note.numero}</b> <span style="font-size:10px; color:var(--ink-soft)">S-${note.serie}</span></td>
        <td><div style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${note.emitente}</div></td>
        <td><div style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${note.destinatario || '—'}</div></td>
        <td>${note.dataEmissao}</td>
        <td>${this.buildDirectionBadge(note)}</td>
        <td class="num" style="font-family:monospace; font-weight:700;">R$ ${parseFloat(note.valorTotal).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
        <td><span class="${badgeClass}"><span class="nfe-status-dot"></span>${note.status}</span></td>
      `;

      tr.addEventListener('click', () => onRowClickCallback(note));
      tbody.appendChild(tr);
    });
  },

  renderPagination(totalPages, currentPage, onPageChange) {
    const wrap = document.getElementById('paginationWrap');
    wrap.innerHTML = '';
    if(totalPages <= 1) return;

    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement('button');
      btn.className = `nfe-btn ${i === currentPage ? 'nfe-btn-primary' : ''}`;
      btn.style.padding = "4px 10px";
      btn.style.fontSize = "12px";
      btn.innerText = i;
      btn.addEventListener('click', () => onPageChange(i));
      wrap.appendChild(btn);
    }
  },

  renderDashboard(data) {
    const { metrics, statusCounts, ufDist, monthlySeries, riskPct, executive, supplierConcentration, financeiro } = data;
    const dashMount = document.getElementById('dashboardMount');
    const fmt = (v) => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

    // --- Card: Vendas x Despesas (classificação pelo código oficial tpNF da NF-e) ---
    const saldoColor = financeiro.saldo >= 0 ? 'var(--brand-dark)' : 'var(--danger)';
    const vendasCardHtml = `
      <div class="nfe-dash-stat-row" style="gap:20px;">
        <div class="nfe-dash-stat">
          <div class="nfe-dash-stat-num" style="color:var(--brand-dark); font-size:22px;">R$ ${fmt(financeiro.totalVendas)}</div>
          <span class="nfe-dash-pill" style="background:#EAF6EF; color:var(--brand-dark);">💰 VENDAS (SAÍDA)</span>
        </div>
        <div class="nfe-dash-stat">
          <div class="nfe-dash-stat-num" style="color:var(--danger); font-size:22px;">R$ ${fmt(financeiro.totalDespesas)}</div>
          <span class="nfe-dash-pill" style="background:#FBEEEA; color:var(--danger);">🧾 DESPESAS (ENTRADA)</span>
        </div>
        <div class="nfe-dash-stat">
          <div class="nfe-dash-stat-num" style="color:${saldoColor}; font-size:22px;">R$ ${fmt(financeiro.saldo)}</div>
          <span class="nfe-dash-pill" style="background:var(--line-soft); color:var(--ink);">⚖️ SALDO</span>
        </div>
      </div>
      <div class="nfe-dash-footnote">Classificação pelo código oficial da NF-e (tpNF: 0 = Entrada/Despesa, 1 = Saída/Venda)${financeiro.indefinidaCount > 0 ? ` · ${financeiro.indefinidaCount} nota(s) sem classificação identificada` : ''}</div>
    `;

    // --- Card: Visão Geral por Status ---
    const statusCardHtml = `
      <div class="nfe-dash-total-label">Valor Total Movimentado</div>
      <div class="nfe-dash-total-value">R$ ${metrics.totalVal}</div>
      <div class="nfe-dash-stat-row">
        <div class="nfe-dash-stat">
          <div class="nfe-dash-stat-num" style="color:var(--brand-dark)">${statusCounts['Aprovada'] || 0}</div>
          <span class="nfe-dash-pill" style="background:#EAF6EF; color:var(--brand-dark);">APROVADA</span>
        </div>
        <div class="nfe-dash-stat">
          <div class="nfe-dash-stat-num" style="color:#8F6B1B">${statusCounts['Em Análise'] || 0}</div>
          <span class="nfe-dash-pill" style="background:#FCF4E7; color:#8F6B1B;">EM ANÁLISE</span>
        </div>
        <div class="nfe-dash-stat">
          <div class="nfe-dash-stat-num" style="color:var(--danger)">${statusCounts['Crítica'] || 0}</div>
          <span class="nfe-dash-pill" style="background:#FBEEEA; color:var(--danger);">CRÍTICA</span>
        </div>
      </div>
      <div class="nfe-dash-footnote">${metrics.count} notas fiscais no total desta empresa</div>
    `;

    // --- Card: Faturamento Mensal (gráfico de barras) ---
    const chartCardHtml = this.buildMonthlyBarChart(monthlySeries);

    // --- Card: Resumo Executivo ---
    const summaryCardHtml = `
      <div class="nfe-dash-kv"><span>Ticket médio por nota</span><b>R$ ${fmt(executive.ticketMedio)}</b></div>
      <div class="nfe-dash-kv"><span>Maior nota emitida</span><b>R$ ${fmt(executive.maiorNota)}</b></div>
      <div class="nfe-dash-kv"><span>ICMS acumulado</span><b>R$ ${fmt(executive.icmsTotal)}</b></div>
      <div class="nfe-dash-kv" style="border-bottom:none;"><span>Ambiente predominante</span><b>${executive.ambientePredominante}</b></div>
    `;

    // --- Card: Notas em Risco (gauge) ---
    const riskCardHtml = `
      <div class="nfe-gauge-outer" style="background: conic-gradient(var(--danger) 0% ${riskPct}%, var(--line-soft) ${riskPct}% 100%);">
        <div class="nfe-gauge-inner">
          <div class="nfe-gauge-value">${riskPct}%</div>
          <div class="nfe-gauge-sub">do valor</div>
        </div>
      </div>
      <div class="nfe-dash-footnote" style="text-align:center;">Percentual do faturamento concentrado em notas classificadas como <b>Crítica</b></div>
    `;

    // --- Card: Concentração por Fornecedor (donut) ---
    const supplierCardHtml = this.buildSupplierDonut(supplierConcentration);

    // --- Card: Distribuição Geográfica (UF) ---
    let ufHtml = '';
    Object.entries(ufDist).sort((a, b) => b[1] - a[1]).forEach(([uf, count]) => {
      const pct = metrics.count ? Math.min(100, Math.round((count / metrics.count) * 100)) : 0;
      ufHtml += `
        <div class="nfe-progress-item">
          <div class="nfe-progress-label"><span>Estado: <b>${uf}</b></span> <span>${count} Notas (${pct}%)</span></div>
          <div class="nfe-progress-bar-bg"><div class="nfe-progress-bar-fill steel" style="width: ${pct}%"></div></div>
        </div>
      `;
    });

    dashMount.innerHTML = `
      <div class="nfe-bank-header">
        <h2 class="nfe-title">Dashboard Executivo</h2>
        <p class="nfe-sub">Indicadores consolidados para apoiar a tomada de decisão da diretoria — dados do tenant ativo.</p>
      </div>

      <div class="nfe-dash-grid">
        <div class="nfe-dash-card nfe-dash-area-vendas">
          <div class="nfe-dash-card-head">💰 Vendas x Despesas (classificação automática pela NF-e)</div>
          <div class="nfe-dash-card-body">${vendasCardHtml}</div>
        </div>

        <div class="nfe-dash-card nfe-dash-area-status">
          <div class="nfe-dash-card-head">Visão Geral · Status das Notas</div>
          <div class="nfe-dash-card-body">${statusCardHtml}</div>
        </div>

        <div class="nfe-dash-card nfe-dash-area-chart">
          <div class="nfe-dash-card-head">Faturamento Mensal</div>
          <div class="nfe-dash-card-body">${chartCardHtml}</div>
        </div>

        <div class="nfe-dash-card nfe-dash-area-summary">
          <div class="nfe-dash-card-head">Resumo Executivo</div>
          <div class="nfe-dash-card-body">${summaryCardHtml}</div>
        </div>

        <div class="nfe-dash-card nfe-dash-area-risk">
          <div class="nfe-dash-card-head">Notas em Risco</div>
          <div class="nfe-dash-card-body nfe-dash-gauge-body">${riskCardHtml}</div>
        </div>

        <div class="nfe-dash-card nfe-dash-area-supplier">
          <div class="nfe-dash-card-head">Concentração por Fornecedor</div>
          <div class="nfe-dash-card-body">${supplierCardHtml}</div>
        </div>

        <div class="nfe-dash-card nfe-dash-area-geo">
          <div class="nfe-dash-card-head">🌐 Distribuição Geográfica por Estado (UF)</div>
          <div class="nfe-dash-card-body">
            <div class="nfe-progress-group">${ufHtml || '<span class="nfe-dash-footnote">Sem dados cadastrados.</span>'}</div>
          </div>
        </div>
      </div>
    `;
  },

  // Gráfico de barras verticais simples (sem dependências) para faturamento mensal
  buildMonthlyBarChart(series) {
    if (!series || series.length === 0) {
      return `<div class="nfe-dash-footnote">Sem notas suficientes para montar a série mensal.</div>`;
    }
    const max = Math.max(...series.map(s => s.total), 1);
    const cols = series.map(s => `
      <div class="nfe-bar-col">
        <div class="nfe-bar-value">R$ ${s.total.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</div>
        <div class="nfe-bar-track"><div class="nfe-bar-fill" style="height:${Math.max(4, Math.round((s.total / max) * 100))}%"></div></div>
        <div class="nfe-bar-label">${s.label}</div>
      </div>
    `).join('');
    return `<div class="nfe-bar-chart">${cols}</div>`;
  },

  // Donut de concentração de faturamento por fornecedor (risco de dependência)
  buildSupplierDonut(items) {
    if (!items || items.length === 0) {
      return `<div class="nfe-dash-footnote">Sem dados suficientes para calcular a concentração por fornecedor.</div>`;
    }
    const colors = ['var(--danger)', 'var(--steel)', 'var(--accent)', 'var(--brand)', '#8F6B1B'];
    let cumulative = 0;
    const stops = items.map((it, idx) => {
      const start = cumulative;
      cumulative += it.pct;
      return `${colors[idx % colors.length]} ${start}% ${cumulative}%`;
    });
    if (cumulative < 100) stops.push(`var(--line-soft) ${cumulative}% 100%`);

    const legend = items.map((it, idx) => `
      <div class="nfe-dash-legend-item">
        <span class="nfe-dash-legend-dot" style="background:${colors[idx % colors.length]}"></span>
        <span class="nfe-dash-legend-label" title="${it.name}">${it.name}</span>
        <span class="nfe-dash-legend-pct">${it.pct}%</span>
      </div>
    `).join('');

    return `
      <div class="nfe-dash-donut-wrap">
        <div class="nfe-gauge-outer" style="background: conic-gradient(${stops.join(', ')});">
          <div class="nfe-gauge-inner">
            <div class="nfe-gauge-value" style="font-size:20px;">${items[0].pct}%</div>
            <div class="nfe-gauge-sub">maior fornecedor</div>
          </div>
        </div>
        <div class="nfe-dash-legend">${legend}</div>
      </div>
    `;
  },

  // Renderiza a tela de Cadastro de Empresas e Funcionários (restrita a Administradores)
  renderCadastro(data) {
    const { session, tenants, users, systemLogs } = data;
    const mount = document.getElementById('cadastroMount');
    const isAdmin = session.user && session.user.role === 'admin';

    if (!isAdmin) {
      mount.innerHTML = `
        <div class="nfe-bank-header">
          <h2 class="nfe-title">Cadastro de Empresas e Funcionários</h2>
          <p class="nfe-sub">Gerencie as empresas (tenants) e os funcionários com acesso a este ambiente SaaS simulado.</p>
        </div>
        <div class="nfe-error show">🔒 Acesso restrito: apenas usuários com papel <b>Administrador</b> podem gerenciar empresas e funcionários. Troque para um usuário administrador no seletor no topo da página.</div>
      `;
      return;
    }

    const formatCnpj = (raw) => {
      const clean = (raw || '').replace(/\D/g, '');
      if (clean.length !== 14) return raw ? raw : '—';
      return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    };

    const roleBadge = (role) => {
      const styleMap = {
        admin: 'background:#EAF6EF; color:var(--brand-dark);',
        operador: 'background:#FCF4E7; color:#8F6B1B;',
        leitura: 'background:var(--line-soft); color:var(--ink-soft);'
      };
      const labelMap = { admin: 'Administrador', operador: 'Operador', leitura: 'Leitura' };
      return `<span class="nfe-status" style="${styleMap[role] || ''}"><span class="nfe-status-dot"></span>${labelMap[role] || role}</span>`;
    };

    const tenantRows = tenants.map(t => {
      const qty = users.filter(u => u.tenantId === t.id).length;
      return `
        <tr>
          <td><b>${t.name}</b></td>
          <td style="font-family:'JetBrains Mono', monospace; font-size:12px;">${formatCnpj(t.cnpj)}</td>
          <td>${qty} funcionário${qty === 1 ? '' : 's'}</td>
          <td>
            <div style="display:flex; gap:8px;">
              <button class="nfe-btn" style="padding:6px 12px; font-size:12px;" onclick="window.AppEditTenant('${t.id}')">Editar</button>
              <button class="nfe-btn" style="padding:6px 12px; font-size:12px; color:var(--danger); border-color:var(--danger);" onclick="window.AppDeleteTenant('${t.id}')">Remover</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    const userRows = users.map(u => {
      const tenant = tenants.find(t => t.id === u.tenantId);
      return `
        <tr>
          <td><b>${u.name}</b></td>
          <td>${tenant ? tenant.name : '—'}</td>
          <td>${roleBadge(u.role)}</td>
          <td>
            <div style="display:flex; gap:8px;">
              <button class="nfe-btn" style="padding:6px 12px; font-size:12px;" onclick="window.AppEditUser('${u.id}')">Editar</button>
              <button class="nfe-btn" style="padding:6px 12px; font-size:12px; color:var(--danger); border-color:var(--danger);" onclick="window.AppDeleteUser('${u.id}')">Remover</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    const logsHtml = systemLogs.length ? systemLogs.map(l => `
      <div>
        <span style="color:var(--ink-soft);">[${l.time}]</span> <b>${l.user}</b> — ${l.action}: ${l.details}
      </div>
    `).join('') : '<div style="color:var(--ink-soft);">Nenhuma alteração registrada ainda.</div>';

    mount.innerHTML = `
      <div class="nfe-bank-header">
        <h2 class="nfe-title">Cadastro de Empresas e Funcionários</h2>
        <p class="nfe-sub">Gerencie as empresas (tenants) e os funcionários com acesso a este ambiente SaaS simulado.</p>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin: 8px 0 16px;">
        <h3 style="margin:0; font-family:'Space Grotesk', sans-serif; font-size:17px; color:var(--ink);">🏢 Empresas cadastradas</h3>
        <button class="nfe-btn nfe-btn-primary" id="btnNewTenant">+ Nova empresa</button>
      </div>
      <div class="nfe-table-scroll">
        <table class="nfe-items">
          <thead><tr><th>Empresa</th><th>CNPJ</th><th>Funcionários</th><th>Ações</th></tr></thead>
          <tbody>${tenantRows}</tbody>
        </table>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin: 32px 0 16px;">
        <h3 style="margin:0; font-family:'Space Grotesk', sans-serif; font-size:17px; color:var(--ink);">👤 Funcionários cadastrados</h3>
        <button class="nfe-btn nfe-btn-primary" id="btnNewUser">+ Novo funcionário</button>
      </div>
      <div class="nfe-table-scroll">
        <table class="nfe-items">
          <thead><tr><th>Funcionário</th><th>Empresa</th><th>Papel</th><th>Ações</th></tr></thead>
          <tbody>${userRows}</tbody>
        </table>
      </div>

      <div style="margin-top:32px;">
        <p class="nfe-section-label">📜 Log de Auditoria do Cadastro</p>
        <div style="max-height:220px; overflow-y:auto; font-family:'JetBrains Mono', monospace; font-size:12px; display:flex; flex-direction:column; gap:8px; background:var(--line-soft); padding:16px; border-radius:10px;">
          ${logsHtml}
        </div>
      </div>
    `;
  }
};