/**
 * js/api.js - Autenticação Local (Login / Registro) e Banco de Dados por Conta
 */
const AUTH_CONFIG = {
  users: [],
  activeUserId: null,
  locks: {},
  auditLogs: []
};

const USERS_KEY = 'nfe_users_db';
const SESSION_KEY = 'nfe_session';
const NOTES_KEY = 'nfe_notes_db';
const LOGS_KEY = 'nfe_system_logs';

(function loadPersistedAuth() {
  try {
    const storedUsers = JSON.parse(localStorage.getItem(USERS_KEY) || 'null');
    if (storedUsers && storedUsers.length) AUTH_CONFIG.users = storedUsers;

    const storedSession = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (storedSession && storedSession.userId && AUTH_CONFIG.users.find(u => u.id === storedSession.userId)) {
      AUTH_CONFIG.activeUserId = storedSession.userId;
    }
  } catch (e) {
    // Mantém os valores padrão em memória caso o localStorage falhe
  }
})();

// Hash simples (NÃO criptográfico) apenas para não guardar a senha em texto puro neste ambiente local de demonstração
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return 'h' + Math.abs(hash).toString(36);
}

const ApiService = {
  // ============================================================
  // Autenticação (Login / Registro / Sessão)
  // ============================================================

  persistUsers() {
    localStorage.setItem(USERS_KEY, JSON.stringify(AUTH_CONFIG.users));
  },

  persistSession() {
    if (AUTH_CONFIG.activeUserId) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: AUTH_CONFIG.activeUserId }));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  },

  isAuthenticated() {
    return !!AUTH_CONFIG.activeUserId;
  },

  getCurrentUser() {
    return AUTH_CONFIG.users.find(u => u.id === AUTH_CONFIG.activeUserId) || null;
  },

  getSession() {
    return { user: this.getCurrentUser() };
  },

  register({ name, email, password, razaoSocial, cnpj }) {
    const trimmedName = (name || '').trim();
    const trimmedEmail = (email || '').trim().toLowerCase();

    if (!trimmedName) return { success: false, reason: 'nome_obrigatorio' };
    if (!trimmedEmail || !trimmedEmail.includes('@') || !trimmedEmail.includes('.')) return { success: false, reason: 'email_invalido' };
    if (!password || password.length < 4) return { success: false, reason: 'senha_curta' };
    if (AUTH_CONFIG.users.some(u => u.email === trimmedEmail)) return { success: false, reason: 'email_duplicado' };

    const newUser = {
      id: 'user_' + Math.random().toString(36).substr(2, 9),
      name: trimmedName,
      email: trimmedEmail,
      passwordHash: simpleHash(password),
      razaoSocial: (razaoSocial || '').trim(),
      cnpj: (cnpj || '').replace(/\D/g, ''),
      createdAt: new Date().toLocaleString('pt-BR')
    };

    AUTH_CONFIG.users.push(newUser);
    this.persistUsers();

    AUTH_CONFIG.activeUserId = newUser.id;
    this.persistSession();
    this.addSystemLog('Conta criada', `${newUser.name} (${newUser.email})`);
    return { success: true, user: newUser };
  },

  login({ email, password }) {
    const trimmedEmail = (email || '').trim().toLowerCase();
    const user = AUTH_CONFIG.users.find(u => u.email === trimmedEmail);

    if (!user || user.passwordHash !== simpleHash(password || '')) {
      return { success: false, reason: 'credenciais_invalidas' };
    }

    AUTH_CONFIG.activeUserId = user.id;
    this.persistSession();
    this.addSystemLog('Login realizado', `${user.name} (${user.email})`);
    return { success: true, user };
  },

  logout() {
    const user = this.getCurrentUser();
    if (user) this.addSystemLog('Logout', `${user.name} (${user.email})`);
    AUTH_CONFIG.activeUserId = null;
    this.persistSession();
  },

  updateProfile({ name, razaoSocial, cnpj }) {
    const user = this.getCurrentUser();
    if (!user) return { success: false, reason: 'sem_sessao' };

    const trimmedName = (name || '').trim();
    if (!trimmedName) return { success: false, reason: 'nome_obrigatorio' };

    user.name = trimmedName;
    user.razaoSocial = (razaoSocial || '').trim();
    user.cnpj = (cnpj || '').replace(/\D/g, '');
    this.persistUsers();
    this.addSystemLog('Perfil atualizado', `${user.name}`);
    return { success: true, user };
  },

  changePassword({ currentPassword, newPassword }) {
    const user = this.getCurrentUser();
    if (!user) return { success: false, reason: 'sem_sessao' };
    if (user.passwordHash !== simpleHash(currentPassword || '')) return { success: false, reason: 'senha_atual_incorreta' };
    if (!newPassword || newPassword.length < 4) return { success: false, reason: 'senha_curta' };

    user.passwordHash = simpleHash(newPassword);
    this.persistUsers();
    this.addSystemLog('Senha alterada', `${user.name}`);
    return { success: true };
  },

  // ============================================================
  // Notas fiscais — sempre isoladas pela conta logada (ownerId)
  // ============================================================

  getUserNotes() {
    if (!AUTH_CONFIG.activeUserId) return [];
    const allNotes = JSON.parse(localStorage.getItem(NOTES_KEY) || '[]');
    return allNotes.filter(n => n.ownerId === AUTH_CONFIG.activeUserId);
  },

  saveNote(noteData) {
    const user = this.getCurrentUser();
    if (!user) return { success: false, reason: 'sem_sessao' };

    const allNotes = JSON.parse(localStorage.getItem(NOTES_KEY) || '[]');

    // [REQUISITO: Prevenção de Duplicidade] Bloqueia notas com a mesma chave de acesso já arquivadas nesta conta
    const alreadyExists = allNotes.some(n => n.ownerId === user.id && n.chave === noteData.chave);
    if (alreadyExists) {
      return { success: false, reason: 'duplicate' };
    }

    const richNote = {
      ...noteData,
      id: 'id_' + Math.random().toString(36).substr(2, 9),
      ownerId: user.id,
      importedBy: user.name,
      createdAt: new Date().toLocaleString('pt-BR')
    };

    allNotes.push(richNote);
    localStorage.setItem(NOTES_KEY, JSON.stringify(allNotes));
    this.addAuditLog(richNote.chave, `Nota Fiscal importada e processada localmente.`);
    return { success: true, note: richNote };
  },

  deleteNote(noteId, chave) {
    let allNotes = JSON.parse(localStorage.getItem(NOTES_KEY) || '[]');
    allNotes = allNotes.filter(n => !(n.id === noteId && n.ownerId === AUTH_CONFIG.activeUserId));
    localStorage.setItem(NOTES_KEY, JSON.stringify(allNotes));
    this.addAuditLog(chave, `Documento fiscal removido permanentemente do acervo digital.`);
  },

  // [REQUISITO: Controle de Concorrência]
  tryLockNote(chave) {
    const user = this.getCurrentUser();
    if (!user) return { success: false };
    if (AUTH_CONFIG.locks[chave] && AUTH_CONFIG.locks[chave].userId !== user.id) {
      return { success: false, lockedBy: AUTH_CONFIG.locks[chave].userName };
    }
    AUTH_CONFIG.locks[chave] = { userId: user.id, userName: user.name };
    this.addAuditLog(chave, `Abriu a visualização detalhada do documento fiscal.`);
    return { success: true };
  },

  unlockNote(chave) {
    if (AUTH_CONFIG.locks[chave]) {
      delete AUTH_CONFIG.locks[chave];
      this.addAuditLog(chave, `Fechou o documento.`);
    }
  },

  // [REQUISITO: Trilha de Auditoria]
  addAuditLog(chave, mensagem) {
    const user = this.getCurrentUser();
    AUTH_CONFIG.auditLogs.push({
      chave,
      time: new Date().toLocaleTimeString('pt-BR'),
      user: user ? user.name : 'Sistema',
      msg: mensagem
    });
  },

  getLogs(chave) {
    return AUTH_CONFIG.auditLogs.filter(l => l.chave === chave);
  },

  // [REQUISITO: Dashboard]
  getMetrics() {
    const notes = this.getUserNotes();
    const total = notes.reduce((acc, curr) => acc + (parseFloat(curr.valorTotal) || 0), 0);
    const icms = notes.reduce((acc, curr) => acc + (parseFloat(curr.icms) || 0), 0);

    return {
      count: notes.length,
      totalVal: total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      totalIcms: icms.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    };
  },

  // Log de sistema (separado do log por nota fiscal), persistido no localStorage
  addSystemLog(action, details) {
    const user = this.getCurrentUser();
    const allLogs = JSON.parse(localStorage.getItem(LOGS_KEY) || '[]');
    allLogs.push({
      time: new Date().toLocaleString('pt-BR'),
      user: user ? user.name : 'Sistema',
      action,
      details
    });
    localStorage.setItem(LOGS_KEY, JSON.stringify(allLogs));
  },

  getSystemLogs() {
    return JSON.parse(localStorage.getItem(LOGS_KEY) || '[]').slice().reverse();
  },

  // [REQUISITO: Identificação de Direção] Venda (Saída) x Despesa (Entrada) x Não identificada
  // Fonte principal: código oficial tpNF da NF-e (0=Entrada, 1=Saída). Reserva: compara CNPJ da conta com emitente/destinatário.
  getNoteDirection(note) {
    if (note.tpNF === '0') return 'entrada';
    if (note.tpNF === '1') return 'saida';

    const user = this.getCurrentUser();
    const myCnpj = ((user && user.cnpj) || '').replace(/\D/g, '');
    if (myCnpj) {
      const cnpjEmit = (note.cnpjEmit || '').replace(/\D/g, '');
      const cnpjDest = (note.cnpjDest || '').replace(/\D/g, '');
      if (cnpjEmit && cnpjEmit === myCnpj) return 'saida';
      if (cnpjDest && cnpjDest === myCnpj) return 'entrada';
    }

    return 'indefinida';
  },

  // ============================================================
  // [REQUISITO: Engrenagem "Limpar Bases"]
  // ============================================================
  clearAllData({ notes = true, logs = true, allAccounts = false } = {}) {
    if (allAccounts) {
      localStorage.removeItem(USERS_KEY);
      localStorage.removeItem(NOTES_KEY);
      localStorage.removeItem(LOGS_KEY);
      localStorage.removeItem(SESSION_KEY);
      AUTH_CONFIG.users = [];
      AUTH_CONFIG.activeUserId = null;
    } else {
      const user = this.getCurrentUser();
      if (notes && user) {
        const remaining = JSON.parse(localStorage.getItem(NOTES_KEY) || '[]').filter(n => n.ownerId !== user.id);
        localStorage.setItem(NOTES_KEY, JSON.stringify(remaining));
      }
      if (logs) {
        localStorage.removeItem(LOGS_KEY);
      }
    }
    AUTH_CONFIG.locks = {};
    AUTH_CONFIG.auditLogs = [];
    return { success: true };
  }
};
