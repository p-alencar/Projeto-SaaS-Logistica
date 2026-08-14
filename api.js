/**
 * js/api.js - Autenticação Local (Login / Registro) e Banco de Dados por Conta
 */
import { supabase } from './src/lib/supabase.js'

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

  // Synchroniza o usuário ativo a partir de um objeto Supabase `user`
  setActiveUserFromSupabase(user) {
    if (!user) return null;
    const id = user.id;
    const meta = user.user_metadata || {};
    const local = {
      id,
      name: meta.nome || meta.name || (user.email || '').split('@')[0],
      email: user.email,
      razaoSocial: meta.razao_social || '',
      cnpj: meta.cnpj || '',
      createdAt: new Date().toLocaleString('pt-BR')
    };

    const idx = AUTH_CONFIG.users.findIndex(u => u.id === id);
    if (idx >= 0) AUTH_CONFIG.users[idx] = local; else AUTH_CONFIG.users.push(local);
    AUTH_CONFIG.activeUserId = id;
    this.persistUsers();
    this.persistSession();
    this.addSystemLog('Login Supabase', `${local.name} (${local.email})`);
    return local;
  },

  async initSessionFromSupabase() {
    try {
      const { data } = await supabase.auth.getSession();
      const user = data?.session?.user || null;
      if (user) {
        return this.setActiveUserFromSupabase(user);
      }
      return null;
    } catch (e) {
      console.warn('Erro inicializando sessão do Supabase', e);
      return null;
    }
  },

  async logout() {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Erro ao deslogar do Supabase', e);
    }
    const user = this.getCurrentUser();
    if (user) this.addSystemLog('Logout', `${user.name} (${user.email})`);
    AUTH_CONFIG.activeUserId = null;
    this.persistSession();
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

  // Nota: o registro agora é feito via Supabase diretamente do `app.js`.
  // Mantemos esta função para compatibilidade, mas recomenda-se usar o fluxo do Supabase.
  async register({ name, email, password, razaoSocial, cnpj }) {
    if (!name) return { success: false, reason: 'nome_obrigatorio' };
    if (!email || !email.includes('@')) return { success: false, reason: 'email_invalido' };
    if (!password || password.length < 4) return { success: false, reason: 'senha_curta' };

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nome: name, razao_social: razaoSocial, cnpj } }
    });
    if (error) return { success: false, reason: error.message };
    const local = this.setActiveUserFromSupabase(data.user);
    return { success: true, user: local };
  },

  async login({ email, password }) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { success: false, reason: 'credenciais_invalidas' };
      const local = this.setActiveUserFromSupabase(data.user);
      return { success: true, user: local };
    } catch (e) {
      return { success: false, reason: 'credenciais_invalidas' };
    }
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
    // Tenta atualizar metadados no Supabase sem bloquear o fluxo local
    try {
      supabase.auth.updateUser({ data: { nome: user.name, razao_social: user.razaoSocial, cnpj: user.cnpj } })
        .then(({ error }) => { if (error) console.warn('Falha ao atualizar perfil no Supabase', error); })
    } catch (e) {
      console.warn('Erro ao sincronizar perfil com Supabase', e);
    }
    return { success: true, user };
  },
  async changePassword({ currentPassword, newPassword }) {
    const user = this.getCurrentUser();
    if (!user) return { success: false, reason: 'sem_sessao' };
    if (!newPassword || newPassword.length < 4) return { success: false, reason: 'senha_curta' };

    // Se o usuário possuir senha local, valida localmente
    if (user.passwordHash && user.passwordHash === simpleHash(currentPassword || '')) {
      user.passwordHash = simpleHash(newPassword);
      this.persistUsers();
      this.addSystemLog('Senha alterada', `${user.name}`);
      // tenta também atualizar no Supabase (se aplicável)
      try { supabase.auth.updateUser({ password: newPassword }).catch(() => {}); } catch (e) {}
      return { success: true };
    }

    // Caso contrário, tenta reautenticar via Supabase e atualizar a senha remotamente
    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
      if (signInError) return { success: false, reason: 'senha_atual_incorreta' };
      const { data, error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) return { success: false, reason: error.message };
      this.addSystemLog('Senha alterada (Supabase)', `${user.name}`);
      return { success: true };
    } catch (e) {
      console.error('Erro ao alterar senha via Supabase', e);
      return { success: false, reason: 'erro' };
    }
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

export default ApiService;
window.ApiService = ApiService;
