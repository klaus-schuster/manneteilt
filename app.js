// ============================================
// MANNETEILT - Core Application
// "Manne teilt, alle wissen Bescheid"
// ============================================

class ManneTeiltApp {
    constructor() {
        // State
        this.state = {
            session: null,
            participants: [],
            expenses: [],
            settings: {
                supabaseUrl: '',
                supabaseKey: '',
                sessionId: ''
            },
            isConnected: false,
            supabaseClient: null
        };

        // DOM Elements
        this.elements = {};

        // Initialize
        this.init();
    }

    async init() {
        this.cacheElements();
        this.loadSettings();
        this.bindEvents();
        await this.registerSW();
        this.render();
    }

    cacheElements() {
        this.elements = {
            sessionSection: document.getElementById('sessionSection'),
            sessionInfo: document.getElementById('sessionInfo'),
            sessionName: document.getElementById('sessionName'),
            syncStatus: document.getElementById('syncStatus'),
            newSessionBtn: document.getElementById('newSessionBtn'),
            participantsSection: document.getElementById('participantsSection'),
            participantsList: document.getElementById('participantsList'),
            addParticipantForm: document.getElementById('addParticipantForm'),
            participantName: document.getElementById('participantName'),
            expensesSection: document.getElementById('expensesSection'),
            expensesList: document.getElementById('expensesList'),
            addExpenseBtn: document.getElementById('addExpenseBtn'),
            balanceSection: document.getElementById('balanceSection'),
            balanceList: document.getElementById('balanceList'),
            expenseModal: document.getElementById('expenseModal'),
            expenseForm: document.getElementById('expenseForm'),
            expenseId: document.getElementById('expenseId'),
            payerSelect: document.getElementById('payerSelect'),
            expenseAmount: document.getElementById('expenseAmount'),
            splitParticipants: document.getElementById('splitParticipants'),
            expenseNote: document.getElementById('expenseNote'),
            deleteExpenseBtn: document.getElementById('deleteExpenseBtn'),
            settingsModal: document.getElementById('settingsModal'),
            settingsForm: document.getElementById('settingsForm'),
            supabaseUrl: document.getElementById('supabaseUrl'),
            supabaseKey: document.getElementById('supabaseKey'),
            sessionIdInput: document.getElementById('sessionIdInput'),
            testConnectionBtn: document.getElementById('testConnectionBtn'),
            settingsBtn: document.getElementById('settingsBtn'),
            toast: document.getElementById('toast')
        };
    }

    bindEvents() {
        // Session
        this.elements.newSessionBtn.addEventListener('click', () => this.createSession());
        
        // Participants
        this.elements.addParticipantForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addParticipant(this.elements.participantName.value.trim());
        });

        // Expenses
        this.elements.addExpenseBtn.addEventListener('click', () => this.openExpenseModal());
        this.elements.expenseForm.addEventListener('submit', (e) => this.saveExpense(e));
        this.elements.deleteExpenseBtn.addEventListener('click', () => this.deleteExpense());

        // Settings
        this.elements.settingsBtn.addEventListener('click', () => this.openSettings());
        this.elements.settingsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSettings();
        });
        this.elements.testConnectionBtn.addEventListener('click', () => this.testConnection());

        // Online/Offline
        window.addEventListener('online', () => this.updateConnection(true));
        window.addEventListener('offline', () => this.updateConnection(false));
    }

    async registerSW() {
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('/sw.js');
                console.log('✅ ManneTeilt Service Worker registriert');
            } catch (err) {
                console.error('❌ SW Registration failed:', err);
            }
        }
    }

    // ============================================
    // SETTINGS PERSISTENCE (LocalStorage)
    // ============================================
    
    loadSettings() {
        const saved = localStorage.getItem('manneteilt_settings');
        if (saved) {
            this.state.settings = JSON.parse(saved);
            this.elements.supabaseUrl.value = this.state.settings.supabaseUrl;
            this.elements.supabaseKey.value = this.state.settings.supabaseKey;
            this.elements.sessionIdInput.value = this.state.settings.sessionId;
            
            if (this.state.settings.supabaseUrl && this.state.settings.supabaseKey) {
                this.initSupabase();
            }
        }
    }

    saveSettings() {
        this.state.settings = {
            supabaseUrl: this.elements.supabaseUrl.value.trim(),
            supabaseKey: this.elements.supabaseKey.value.trim(),
            sessionId: this.elements.sessionIdInput.value.trim()
        };
        localStorage.setItem('manneteilt_settings', JSON.stringify(this.state.settings));
        this.showToast('⚙️ Einstellungen gespeichert');
        this.elements.settingsModal.close();
        
        if (this.state.settings.supabaseUrl && this.state.settings.supabaseKey) {
            this.initSupabase();
        }
    }

    // ============================================
    // SUPABASE INTEGRATION
    // ============================================

    initSupabase() {
        const { createClient } = supabase;
        this.state.supabaseClient = createClient(
            this.state.settings.supabaseUrl,
            this.state.settings.supabaseKey
        );
        
        this.showToast('🔌 Supabase verbunden!');
        this.updateConnection(true);
        
        // Auto-load session if ID exists
        if (this.state.settings.sessionId) {
            this.loadSession(this.state.settings.sessionId);
        }
    }

    async testConnection() {
        try {
            const { data, error } = await this.state.supabaseClient
                .from('sessions')
                .select('id')
                .limit(1);
            
            if (error) throw error;
            
            this.showToast('✅ Verbindung erfolgreich!');
        } catch (err) {
            this.showToast(`❌ Fehler: ${err.message}`, 'error');
        }
    }

    updateConnection(connected) {
        this.state.isConnected = connected;
        if (this.elements.syncStatus) {
            this.elements.syncStatus.textContent = connected ? 'online' : 'offline';
            this.elements.syncStatus.className = connected ? 'status-badge online' : 'status-badge offline';
        }
    }

    // ============================================
    // SESSION MANAGEMENT
    // ============================================

    async createSession() {
        const name = prompt('Reisename (z.B. "Spanien Urlaub 2026"):');
        if (!name) return;

        const session = {
            id: crypto.randomUUID(),
            name: name,
            createdAt: new Date().toISOString()
        };

        // Local storage first (immer verfügbar)
        localStorage.setItem('manneteilt_session', JSON.stringify(session));
        this.state.session = session;
        
        // Push to Supabase if connected
        if (this.state.supabaseClient) {
            try {
                await this.state.supabaseClient
                    .from('sessions')
                    .insert([session]);
            } catch (err) {
                console.error('Session sync failed:', err);
            }
        }

        this.showToast(`🎉 Reise "${name}" gestartet — Manne teilt!`);
        this.updateUIState('active');
        this.render();
        this.exportShareLink(session.id);
    }

    async loadSession(sessionId) {
        // Try Supabase first
        if (this.state.supabaseClient) {
            try {
                const { data, error } = await this.state.supabaseClient
                    .from('sessions')
                    .select('*')
                    .eq('id', sessionId)
                    .single();

                if (!error && data) {
                    this.state.session = data;
                    localStorage.setItem('manneteilt_session', JSON.stringify(data));
                    
                    // Load participants & expenses
                    await this.loadData();
                    this.showToast('📥 Daten geladen — ManneTeilt');
                    return;
                }
            } catch (err) {
                console.error('Load from Supabase failed:', err);
            }
        }

        // Fallback to localStorage
        const saved = localStorage.getItem('manneteilt_session');
        if (saved) {
            this.state.session = JSON.parse(saved);
            this.state.participants = JSON.parse(localStorage.getItem('manneteilt_participants') || '[]');
            this.state.expenses = JSON.parse(localStorage.getItem('manneteilt_expenses') || '[]');
        }

        this.updateUIState('active');
        this.render();
    }

    async loadData() {
        if (!this.state.session) return;

        if (this.state.supabaseClient) {
            const [participantsRes, expensesRes] = await Promise.all([
                this.state.supabaseClient
                    .from('participants')
                    .select('*')
                    .eq('session_id', this.state.session.id)
                    .order('created_at'),
                this.state.supabaseClient
                    .from('expenses')
                    .select('*')
                    .eq('session_id', this.state.session.id)
                    .order('created_at')
            ]);

            if (!participantsRes.error) {
                this.state.participants = participantsRes.data;
            }
            if (!expensesRes.error) {
                this.state.expenses = expensesRes.data;
            }
        } else {
            // Local fallback
            this.state.participants = JSON.parse(localStorage.getItem('manneteilt_participants') || '[]');
            this.state.expenses = JSON.parse(localStorage.getItem('manneteilt_expenses') || '[]');
        }

        this.render();
    }

    // ============================================
    // PARTICIPANT MANAGEMENT
    // ============================================

    async addParticipant(name) {
        if (!name) return;

        const participant = {
            id: crypto.randomUUID(),
            session_id: this.state.session.id,
            name: name,
            created_at: new Date().toISOString()
        };

        this.state.participants.push(participant);
        this.persistData('participants');
        this.render();
        
        // Sync to Supabase
        if (this.state.supabaseClient) {
            try {
                await this.state.supabaseClient
                    .from('participants')
                    .insert([participant]);
            } catch (err) {
                console.error('Participant sync failed:', err);
            }
        }

        this.elements.participantName.value = '';
        this.showToast(`✅ ${name} hinzugefügt`);
    }

    async deleteParticipant(id) {
        if (!confirm('Teilnehmer löschen?')) return;
        
        this.state.participants = this.state.participants.filter(p => p.id !== id);
        this.state.expenses = this.state.expenses.filter(e => !e.split_among_ids?.includes(id));
        this.persistData('participants');
        this.persistData('expenses');
        this.render();

        if (this.state.supabaseClient) {
            await Promise.all([
                this.state.supabaseClient.from('participants').delete().eq('id', id),
                this.state.supabaseClient.from('expenses').delete().in('split_among_ids', [id])
            ]);
        }

        this.showToast('🗑️ Teilnehmer entfernt');
    }

    // ============================================
    // EXPENSE MANAGEMENT
    // ============================================

    openExpenseModal(expenseId = null) {
        if (expenseId) {
            const expense = this.state.expenses.find(e => e.id === expenseId);
            this.elements.expenseId.value = expense.id;
            this.elements.payerSelect.value = expense.payer_id;
            this.elements.expenseAmount.value = expense.amount;
            this.elements.expenseNote.value = expense.note || '';
            this.elements.deleteExpenseBtn.style.display = 'block';

            // Pre-check split participants
            this.renderSplitCheckboxes(expense.split_among_ids);
        } else {
            this.elements.expenseForm.reset();
            this.elements.expenseId.value = '';
            this.elements.deleteExpenseBtn.style.display = 'none';
            this.renderSplitCheckboxes(null);
        }

        // Populate payer dropdown
        this.elements.payerSelect.innerHTML = this.state.participants
            .map(p => `<option value="${p.id}">${p.name}</option>`).join('');

        this.elements.expenseModal.show();
    }

    renderSplitCheckboxes(selectedIds) {
        this.elements.splitParticipants.innerHTML = this.state.participants
            .map(p => {
                const checked = !selectedIds || selectedIds.includes(p.id) ? 'checked' : '';
                return `
                    <label class="checkbox-item">
                        <input type="checkbox" name="split_${p.id}" value="${p.id}" ${checked}>
                        ${p.name}
                    </label>
                `;
            }).join('');
    }

    async saveExpense(e) {
        e.preventDefault();

        const splitIds = Array.from(this.elements.splitParticipants.querySelectorAll('input:checked'))
            .map(cb => cb.value);

        const expenseData = {
            id: this.elements.expenseId.value || crypto.randomUUID(),
            session_id: this.state.session.id,
            payer_id: this.elements.payerSelect.value,
            amount: parseFloat(this.elements.expenseAmount.value),
            split_among_ids: splitIds,
            note: this.elements.expenseNote.value,
            created_at: new Date().toISOString()
        };

        // Remove old if edit
        if (this.elements.expenseId.value) {
            this.state.expenses = this.state.expenses.filter(e => e.id !== this.elements.expenseId.value);
        }

        this.state.expenses.push(expenseData);
        this.persistData('expenses');
        this.render();

        // Sync to Supabase
        if (this.state.supabaseClient) {
            const table = this.state.supabaseClient.from('expenses');
            await (this.elements.expenseId.value 
                ? table.upsert(expenseData) 
                : table.insert([expenseData])
            );
        }

        this.elements.expenseModal.close();
        this.showToast('💰 Ausgabe gespeichert — Manne teilt!');
    }

    async deleteExpense() {
        const id = this.elements.expenseId.value;
        if (!id || !confirm('Ausgabe löschen?')) return;

        this.state.expenses = this.state.expenses.filter(e => e.id !== id);
        this.persistData('expenses');
        this.render();

        if (this.state.supabaseClient) {
            await this.state.supabaseClient.from('expenses').delete().eq('id', id);
        }

        this.elements.expenseModal.close();
        this.showToast('🗑️ Ausgabe gelöscht');
    }

    // ============================================
    // BALANCE CALCULATION ALGORITHM
    // ============================================

    calculateBalances() {
        const balances = {};
        
        // Initialize all participants with 0
        this.state.participants.forEach(p => {
            balances[p.id] = { ...p, net: 0 };
        });

        // Calculate net balance per person
        this.state.expenses.forEach(expense => {
            const shareCount = expense.split_among_ids.length;
            if (shareCount === 0) return;
            
            const share = expense.amount / shareCount;
            
            // Payer gets positive credit
            if (balances[expense.payer_id]) {
                balances[expense.payer_id].net += expense.amount;
            }
            
            // Split participants pay their share
            expense.split_among_ids.forEach(splitId => {
                if (balances[splitId]) {
                    balances[splitId].net -= share;
                }
            });
        });

        // Convert to array and round
        const balanceArray = Object.values(balances).map(b => ({
            ...b,
            net: Math.round(b.net * 100) / 100
        }));

        return balanceArray;
    }

    simplifyDebts(balances) {
        // Separation in debtors (negative) and creditors (positive)
        const debtors = balances.filter(b => b.net < -0.01).sort((a, b) => a.net - b.net);
        const creditors = balances.filter(b => b.net > 0.01).sort((a, b) => b.net - a.net);

        const settlements = [];

        // Greedy algorithm: match biggest debtor with biggest creditor
        let i = 0, j = 0;
        while (i < debtors.length && j < creditors.length) {
            const debtor = debtors[i];
            const creditor = creditors[j];
            
            const amount = Math.min(Math.abs(debtor.net), creditor.net);
            
            if (amount > 0.01) {
                settlements.push({
                    from: debtor.name,
                    to: creditor.name,
                    amount: Math.round(amount * 100) / 100
                });
            }

            // Update remaining balances
            debtor.net += amount;
            creditor.net -= amount;

            // Move pointers
            if (Math.abs(debtor.net) < 0.01) i++;
            if (creditor.net < 0.01) j++;
        }

        return settlements;
    }

    // ============================================
    // LOCAL STORAGE PERSISTENCE
    // ============================================

    persistData(type) {
        if (type === 'participants') {
            localStorage.setItem('manneteilt_participants', JSON.stringify(this.state.participants));
        } else if (type === 'expenses') {
            localStorage.setItem('manneteilt_expenses', JSON.stringify(this.state.expenses));
        }
    }

    // ============================================
    // SHARE FUNCTIONALITY
    // ============================================

    exportShareLink(sessionId) {
        const url = `${window.location.origin}?session=${sessionId}`;
        navigator.clipboard.writeText(url);
        this.showToast('🔗 Link kopiert! Teile ihn mit deiner Gruppe — ManneTeilt');
    }

    async loadFromURL() {
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get('session');
        
        if (sessionId) {
            await this.loadSession(sessionId);
            window.history.replaceState({}, '', window.location.pathname);
        }
    }

    // ============================================
    // RENDERING
    // ============================================

    render() {
        // Session Info
        if (this.state.session) {
            if (this.elements.sessionName) {
                this.elements.sessionName.textContent = this.state.session.name;
            }
        }

        // Participants List
        if (this.elements.participantsList) {
            this.elements.participantsList.innerHTML = this.state.participants.length
                ? this.state.participants.map(p => `
                    <div class="list-item">
                        <span>${p.name}</span>
                        <button class="icon-btn danger" onclick="app.deleteParticipant('${p.id}')">✕</button>
                    </div>
                `).join('')
                : '<p class="empty">Noch keine Teilnehmer</p>';
        }

        // Expenses List
        if (this.elements.expensesList) {
            this.elements.expensesList.innerHTML = this.state.expenses.length
                ? this.state.expenses.map(e => {
                    const payer = this.state.participants.find(p => p.id === e.payer_id);
                    return `
                        <div class="list-item" onclick="app.openExpenseModal('${e.id}')">
                            <div>
                                <strong>${e.amount.toFixed(2)} €</strong>
                                <small>von ${payer?.name || '?'}</small>
                                ${e.note ? `<br><span class="note">${e.note}</span>` : ''}
                            </div>
                        </div>
                    `;
                }).join('')
                : '<p class="empty">Noch keine Ausgaben</p>';
        }

        // Balance Section
        if (this.elements.balanceList) {
            const balances = this.calculateBalances();
            const settlements = this.simplifyDebts(balances);
            
            if (settlements.length === 0) {
                this.elements.balanceList.innerHTML = '<div class="card"><p>🎉 Alles ausgeglichen — Manne ist zufrieden!</p></div>';
            } else {
                this.elements.balanceList.innerHTML = settlements.map(s => `
                    <div class="card settlement-card">
                        <div class="settlement-arrow">${s.from} ➝ ${s.to}</div>
                        <div class="settlement-amount">${s.amount.toFixed(2)} €</div>
                    </div>
                `).join('');
            }
        }

        // Show/hide sections based on state
        this.updateUIState(this.state.session ? 'active' : 'idle');
    }

    updateUIState(state) {
        // sessionSection IMMER sichtbar — da ist der "Neue Reise" Button
        this.elements.sessionSection.classList.remove('hidden');
    
        // Andere Sections nur bei aktiver Session zeigen
        const sections = ['participantsSection', 'expensesSection', 'balanceSection'];
        sections.forEach(sec => {
            const el = this.elements[sec];
            if (el) {
                el.classList.toggle('hidden', state !== 'active');
            }
        });
    }

    // ============================================
    // MODALS & TOAST
    // ============================================

    openSettings() {
        this.elements.settingsModal.show();
    }

    showToast(message, type = 'success') {
        const toast = this.elements.toast;
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.remove('hidden');
        
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }
}

// ============================================
// MANNETEILT APP INIT
// ============================================

let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new ManneTeiltApp();
    
    // Check for URL session param
    app.loadFromURL().then(() => {
        if (!app.state.session) {
            app.showToast('💡 Tippe "Neue Reise starten" um anzufangen — ManneTeilt');
        }
    });
});

// Global helper for inline onclick handlers
window.app = null;
setTimeout(() => { window.app = app; }, 100);
