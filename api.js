/**
 * js/api.js - Banco de Dados Local Simulado e Lógica Multi-Tenant (SaaS)
 */
const SAAS_CONFIG = {
  tenants: [
    { id: 'empresa_a', name: '🏢 Tech Solutions Brasil Ltda' },
    { id: 'empresa_b', name: '🏭 Comercial Fênix Varejista' }
  ],
  users: [
    { id: 'usr_1', tenantId: 'empresa_a', name: 'Carlos (Administrador)', role: 'admin' },
    { id: 'usr_2', tenantId: 'empresa_a', name: 'Julia (Fiscal / Operador)', role: 'operador' },
    { id: 'usr_3', tenantId: 'empresa_a', name: 'Mariana (Apenas Leitura)', role: 'leitura' },
    { id: 'usr_4', tenantId: 'empresa_b', name: 'Roberto (Administrador)', role: 'admin' }
  ],
  activeTenant: 'empresa_a',
  activeUser: 'usr_1',
  locks: {},
  auditLogs: []
};

// --- Persistência de Empresas (Tenants) e Funcionários (Users) no localStorage ---
const SAAS_TENANTS_KEY = 'saas_tenants_db';
const SAAS_USERS_KEY = 'saas_users_db';

(function loadPersistedSaaSConfig() {
  try {
    const storedTenants = JSON.parse(localStorage.getItem(SAAS_TENANTS_KEY) || 'null');
    const storedUsers = JSON.parse(localStorage.getItem(SAAS_USERS_KEY) || 'null');

    if (storedTenants && storedTenants.length) {
      SAAS_CONFIG.tenants = storedTenants;
    } else {
      localStorage.setItem(SAAS_TENANTS_KEY, JSON.stringify(SAAS_CONFIG.tenants));
    }

    if (storedUsers && storedUsers.length) {
      SAAS_CONFIG.users = storedUsers;
    } else {
      localStorage.setItem(SAAS_USERS_KEY, JSON.stringify(SAAS_CONFIG.users));
    }
  } catch (e) {
    // Mantém os valores padrão em memória caso o localStorage falhe
  }

  // Garante que o tenant/usuário ativo ainda existam (podem ter sido removidos)
  if (!SAAS_CONFIG.tenants.find(t => t.id === SAAS_CONFIG.activeTenant)) {
    SAAS_CONFIG.activeTenant = SAAS_CONFIG.tenants[0]?.id || null;
  }
  if (!SAAS_CONFIG.users.find(u => u.id === SAAS_CONFIG.activeUser && u.tenantId === SAAS_CONFIG.activeTenant)) {
    const fallbackUser = SAAS_CONFIG.users.find(u => u.tenantId === SAAS_CONFIG.activeTenant);
    SAAS_CONFIG.activeUser = fallbackUser?.id || null;
  }
})();

const ApiService = {
  getSession() {
    return {
      tenant: SAAS_CONFIG.tenants.find(t => t.id === SAAS_CONFIG.activeTenant),
      user: SAAS_CONFIG.users.find(u => u.id === SAAS_CONFIG.activeUser)
    };
  },

  getTenantNotes() {
    // Isolamento de dados multi-tenant: Filtra apenas as notas pertencentes ao tenant logado
    const allNotes = JSON.parse(localStorage.getItem('saas_local_db') || '[]');
    return allNotes.filter(n => n.tenantId === SAAS_CONFIG.activeTenant);
  },

  saveNoteToTenant(noteData) {
    const allNotes = JSON.parse(localStorage.getItem('saas_local_db') || '[]');
    const session = this.getSession();

    // [REQUISITO: Prevenção de Duplicidade] Bloqueia notas com a mesma chave de acesso já arquivadas neste tenant
    const alreadyExists = allNotes.some(n => n.tenantId === session.tenant.id && n.chave === noteData.chave);
    if (alreadyExists) {
      return { success: false, reason: 'duplicate' };
    }

    // Vincula metadados de controle corporativo
    const richNote = {
      ...noteData,
      id: 'id_' + Math.random().toString(36).substr(2, 9),
      tenantId: session.tenant.id,
      importedBy: session.user.name,
      createdAt: new Date().toLocaleString('pt-BR')
    };

    allNotes.push(richNote);
    localStorage.setItem('saas_local_db', JSON.stringify(allNotes));
    this.addAuditLog(richNote.chave, `Nota Fiscal importada e processada localmente na conta da organização.`);
    return { success: true, note: richNote };
  },

  deleteNoteFromTenant(noteId, chave) {
    let allNotes = JSON.parse(localStorage.getItem('saas_local_db') || '[]');
    allNotes = allNotes.filter(n => !(n.id === noteId && n.tenantId === SAAS_CONFIG.activeTenant));
    localStorage.setItem('saas_local_db', JSON.stringify(allNotes));
    this.addAuditLog(chave, `Documento fiscal removido permanentemente do acervo digital.`);
  },

  // [REQUISITO: Controle de Concorrência]
  tryLockNote(chave) {
    const session = this.getSession();
    if (SAAS_CONFIG.locks[chave] && SAAS_CONFIG.locks[chave].userId !== session.user.id) {
      return { success: false, lockedBy: SAAS_CONFIG.locks[chave].userName };
    }
    SAAS_CONFIG.locks[chave] = { userId: session.user.id, userName: session.user.name };
    this.addAuditLog(chave, `Abriu a visualização detalhada do documento fiscal.`);
    return { success: true };
  },

  unlockNote(chave) {
    if (SAAS_CONFIG.locks[chave]) {
      delete SAAS_CONFIG.locks[chave];
      this.addAuditLog(chave, `Fechou o documento. Nota liberada para a fila de auditoria.`);
    }
  },

  // [REQUISITO: Trilha de Auditoria]
  addAuditLog(chave, mensagem) {
    const session = this.getSession();
    SAAS_CONFIG.auditLogs.push({
      chave,
      time: new Date().toLocaleTimeString('pt-BR'),
      user: session.user.name,
      msg: mensagem
    });
  },

  getLogs(chave) {
    return SAAS_CONFIG.auditLogs.filter(l => l.chave === chave);
  },

  // [REQUISITO: Dashboard]
  getMetrics() {
    const notes = this.getTenantNotes();
    const total = notes.reduce((acc, curr) => acc + (parseFloat(curr.valorTotal) || 0), 0);
    const icms = notes.reduce((acc, curr) => acc + (parseFloat(curr.icms) || 0), 0);
    
    return {
      count: notes.length,
      totalVal: total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      totalIcms: icms.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    };
  },

  // ============================================================
  // [REQUISITO: Cadastro de Empresas e Funcionários] CRUD + Persistência
  // ============================================================

  persistTenants() {
    localStorage.setItem(SAAS_TENANTS_KEY, JSON.stringify(SAAS_CONFIG.tenants));
  },

  persistUsers() {
    localStorage.setItem(SAAS_USERS_KEY, JSON.stringify(SAAS_CONFIG.users));
  },

  getTenants() {
    return SAAS_CONFIG.tenants;
  },

  getUsers() {
    return SAAS_CONFIG.users;
  },

  getUsersByTenant(tenantId) {
    return SAAS_CONFIG.users.filter(u => u.tenantId === tenantId);
  },

  hasNotesForTenant(tenantId) {
    const allNotes = JSON.parse(localStorage.getItem('saas_local_db') || '[]');
    return allNotes.some(n => n.tenantId === tenantId);
  },

  createTenant({ name, cnpj }) {
    const trimmedName = (name || '').trim();
    if (!trimmedName) return { success: false, reason: 'nome_obrigatorio' };

    const cleanCnpj = (cnpj || '').replace(/\D/g, '');
    if (cleanCnpj && SAAS_CONFIG.tenants.some(t => (t.cnpj || '').replace(/\D/g, '') === cleanCnpj)) {
      return { success: false, reason: 'cnpj_duplicado' };
    }

    const newTenant = { id: 'tenant_' + Math.random().toString(36).substr(2, 9), name: trimmedName, cnpj: cleanCnpj };
    SAAS_CONFIG.tenants.push(newTenant);
    this.persistTenants();
    this.addSystemLog('Empresa cadastrada', `${newTenant.name}${cleanCnpj ? ' (CNPJ ' + cleanCnpj + ')' : ''}`);
    return { success: true, tenant: newTenant };
  },

  updateTenant(id, { name, cnpj }) {
    const tenant = SAAS_CONFIG.tenants.find(t => t.id === id);
    if (!tenant) return { success: false, reason: 'nao_encontrada' };

    const trimmedName = (name || '').trim();
    if (!trimmedName) return { success: false, reason: 'nome_obrigatorio' };

    const cleanCnpj = (cnpj || '').replace(/\D/g, '');
    if (cleanCnpj && SAAS_CONFIG.tenants.some(t => t.id !== id && (t.cnpj || '').replace(/\D/g, '') === cleanCnpj)) {
      return { success: false, reason: 'cnpj_duplicado' };
    }

    tenant.name = trimmedName;
    tenant.cnpj = cleanCnpj;
    this.persistTenants();
    this.addSystemLog('Empresa editada', `${tenant.name}`);
    return { success: true, tenant };
  },

  deleteTenant(id) {
    const tenant = SAAS_CONFIG.tenants.find(t => t.id === id);
    if (!tenant) return { success: false, reason: 'nao_encontrada' };
    if (SAAS_CONFIG.tenants.length <= 1) return { success: false, reason: 'ultima_empresa' };
    if (this.hasNotesForTenant(id)) return { success: false, reason: 'possui_notas' };

    SAAS_CONFIG.tenants = SAAS_CONFIG.tenants.filter(t => t.id !== id);
    SAAS_CONFIG.users = SAAS_CONFIG.users.filter(u => u.tenantId !== id);
    this.persistTenants();
    this.persistUsers();
    this.addSystemLog('Empresa removida', `${tenant.name}`);

    if (SAAS_CONFIG.activeTenant === id) {
      SAAS_CONFIG.activeTenant = SAAS_CONFIG.tenants[0]?.id || null;
      const fallbackUser = SAAS_CONFIG.users.find(u => u.tenantId === SAAS_CONFIG.activeTenant);
      SAAS_CONFIG.activeUser = fallbackUser?.id || null;
    }
    return { success: true };
  },

  createUser({ tenantId, name, role }) {
    const trimmedName = (name || '').trim();
    if (!trimmedName) return { success: false, reason: 'nome_obrigatorio' };
    if (!tenantId || !SAAS_CONFIG.tenants.find(t => t.id === tenantId)) return { success: false, reason: 'empresa_invalida' };
    if (!['admin', 'operador', 'leitura'].includes(role)) return { success: false, reason: 'papel_invalido' };

    const newUser = { id: 'usr_' + Math.random().toString(36).substr(2, 9), tenantId, name: trimmedName, role };
    SAAS_CONFIG.users.push(newUser);
    this.persistUsers();
    this.addSystemLog('Funcionário cadastrado', `${newUser.name} (${role})`);
    return { success: true, user: newUser };
  },

  updateUser(id, { name, role }) {
    const user = SAAS_CONFIG.users.find(u => u.id === id);
    if (!user) return { success: false, reason: 'nao_encontrado' };

    const trimmedName = (name || '').trim();
    if (!trimmedName) return { success: false, reason: 'nome_obrigatorio' };
    if (!['admin', 'operador', 'leitura'].includes(role)) return { success: false, reason: 'papel_invalido' };

    user.name = trimmedName;
    user.role = role;
    this.persistUsers();
    this.addSystemLog('Funcionário editado', `${user.name} (${role})`);
    return { success: true, user };
  },

  deleteUser(id) {
    const user = SAAS_CONFIG.users.find(u => u.id === id);
    if (!user) return { success: false, reason: 'nao_encontrado' };

    const tenantUserCount = SAAS_CONFIG.users.filter(u => u.tenantId === user.tenantId).length;
    if (tenantUserCount <= 1) return { success: false, reason: 'ultimo_funcionario' };

    SAAS_CONFIG.users = SAAS_CONFIG.users.filter(u => u.id !== id);
    this.persistUsers();
    this.addSystemLog('Funcionário removido', `${user.name}`);

    if (SAAS_CONFIG.activeUser === id) {
      const fallbackUser = SAAS_CONFIG.users.find(u => u.tenantId === user.tenantId);
      SAAS_CONFIG.activeUser = fallbackUser?.id || null;
    }
    return { success: true };
  },

  // Log de auditoria dedicado ao cadastro (separado do log por nota fiscal), persistido no localStorage
  addSystemLog(action, details) {
    const session = this.getSession();
    const allLogs = JSON.parse(localStorage.getItem('saas_system_logs') || '[]');
    allLogs.push({
      time: new Date().toLocaleString('pt-BR'),
      user: session.user ? session.user.name : 'Sistema',
      action,
      details
    });
    localStorage.setItem('saas_system_logs', JSON.stringify(allLogs));
  },

  getSystemLogs() {
    return JSON.parse(localStorage.getItem('saas_system_logs') || '[]').slice().reverse();
  },

  // [REQUISITO: Identificação de Direção] Venda (Saída) x Despesa (Entrada) x Não identificada
  // Fonte principal: código oficial tpNF da NF-e (0=Entrada, 1=Saída). Reserva: compara CNPJ da empresa com emitente/destinatário.
  getNoteDirection(note) {
    // 1) Fonte primária: código oficial tpNF do XML da NF-e
    if (note.tpNF === '0') return 'entrada';
    if (note.tpNF === '1') return 'saida';

    // 2) Reserva: compara o CNPJ cadastrado da empresa ativa com o emitente/destinatário da nota
    const session = this.getSession();
    const tenantCnpj = ((session.tenant && session.tenant.cnpj) || '').replace(/\D/g, '');
    if (tenantCnpj) {
      const cnpjEmit = (note.cnpjEmit || '').replace(/\D/g, '');
      const cnpjDest = (note.cnpjDest || '').replace(/\D/g, '');
      if (cnpjEmit && cnpjEmit === tenantCnpj) return 'saida';
      if (cnpjDest && cnpjDest === tenantCnpj) return 'entrada';
    }

    return 'indefinida';
  }
};