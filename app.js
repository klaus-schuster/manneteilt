// ============================================
// MANNETEILT - Core Application v6
// "Manne teilt, alle wissen Bescheid"
// ============================================

const SUPABASE_URL = 'https://gggbybpiostztrddhvgm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xGdq57oOwz1u0OvmUuhrpA_-zpgdQqN';

class ManneTeiltApp {
    constructor() {
        this.state = {
            session: null,
            participants: [],
            expenses: [],
            isConnected: false,
            supabaseClient: null,
            participantsExpanded: false,
            // NEU: Expanded Groups Tracking
            expandedGroups: new Set()  // Speichert payer IDs
        };
        this.elements = {};
        this.init();
    }

    async init() {
        this.cacheElements();
        this.bindEvents();
        await this.registerSW();
        this.initSupabase();
        await this.loadFromURL();
        this.render();
    }

    cacheElements() {
    this.elements = {
        sessionSection: document.getElementById('sessionSection'),
        sessionInfo: document.getElementById('sessionInfo'),
        sessionName: document.getElementById('sessionName'),
        sessionCodeDisplay: document.getElementById('sessionCodeDisplay'),
        syncStatus: document.getElementById('syncStatus'),
        newSessionBtn: document.getElementById('newSessionBtn'),
        shareBtn: document.getElementById('shareBtn'),
        newTripBtn: document.getElementById('newTripBtn'),  // <-- HINZUFÜGEN
        joinForm: document.getElementById('joinForm'),
        sessionCodeInput: document.getElementById('sessionCodeInput'),
        joinSection: document.getElementById('joinSection'),
        participantsSection: document.getElementById('participantsSection'),
        participantsList: document.getElementById('participantsList'),
        participantsListExpanded: document.getElementById('participantsListExpanded'),
        participantsCompact: document.getElementById('participantsCompact'),
        participantsChips: document.getElementById('participantsChips'),
        participantCount: document.getElementById('participantCount'),
        toggleParticipantsBtn: document.getElementById('toggleParticipantsBtn'),
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
        toggleAllSplit: document.getElementById('toggleAllSplit'),
        expenseNote: document.getElementById('expenseNote'),
        deleteExpenseBtn: document.getElementById('deleteExpenseBtn'),
        toast: document.getElementById('toast')
    };
}

    bindEvents() {
        this.elements.newSessionBtn.addEventListener('click', () => this.createSession());
        this.elements.shareBtn.addEventListener('click', () => this.copyShareLink());

        if (this.elements.newTripBtn) {
            this.elements.newTripBtn.addEventListener('click', () => this.createNewSession());
        }

        this.elements.joinForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.joinByCode(this.elements.sessionCodeInput.value);
        });

        this.elements.addParticipantForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addParticipant(this.elements.participantName.value.trim());
        });

        this.elements.toggleParticipantsBtn.addEventListener('click', () => this.toggleParticipantsExpand());
        this.elements.addExpenseBtn.addEventListener('click', () => this.openExpenseModal());
        this.elements.expenseForm.addEventListener('submit', (e) => this.saveExpense(e));
        this.elements.deleteExpenseBtn.addEventListener('click', () => this.deleteExpense());
        this.elements.toggleAllSplit.addEventListener('click', () => this.toggleAllSplitCheckboxes());

        window.addEventListener('online', () => this.updateConnection(true));
        window.addEventListener('offline', () => this.updateConnection(false));

        const amountInput = this.elements.expenseAmount;

        amountInput.addEventListener('keydown', (e) => {
            if (!/^[0-9]$/.test(e.key) && !['Backspace', 'Tab', 'Escape', 'Enter'].includes(e.key)) {
                e.preventDefault();
            }
        });

        amountInput.addEventListener('input', (e) => {
            let raw = e.target.value.replace(/\D/g, '');
            if (raw.length === 0) {
                e.target.value = '';
                return;
            }
            if (raw.length <= 2) {
                e.target.value = '0.' + raw.padStart(2, '0');
            } else {
                e.target.value = raw.slice(0, -2) + '.' + raw.slice(-2);
            }
        });
}

    // NEUE METHODE: createNewSession
    async createNewSession() {
        if (!confirm('Aktuelle Reise beenden und neue starten?\nBestehende Daten gehen verloren.')) return;

        // Clear current session
        this.state.session = null;
        this.state.participants = [];
        this.state.expenses = [];
        
        // Clear localStorage
        localStorage.removeItem('manneteil_session');
        localStorage.removeItem('manneteil_participants');
        localStorage.removeItem('manneteil_expenses');

        // Render reset
        this.elements.sessionCodeDisplay.classList.add('hidden');
        this.elements.shareBtn.classList.remove('hidden');
        this.elements.newSessionBtn.classList.remove('hidden');
        this.elements.newTripBtn.classList.add('hidden');
        this.elements.joinSection.classList.remove('hidden');

        this.render();
        this.showToast('🗑️ Reise beendet. Neue starten!');
    }

    async registerSW() {
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('./sw.js');
                console.log('✅ ManneTeilt Service Worker registriert');
            } catch (err) {
                console.error('❌ SW Registration failed:', err);
            }
        }
    }

    // ============================================
    // SUPABASE
    // ============================================

    initSupabase() {
        const { createClient } = supabase;
        this.state.supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
        this.updateConnection(true);
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

    generateSessionCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
        return code;
    }

    async createSession() {
        const name = prompt('Reisename (z.B. "Spanien Urlaub 2026"):');
        if (!name) return;

        const code = this.generateSessionCode();
        const session = {
            id: crypto.randomUUID(),
            name: name,
            code: code,
            createdAt: new Date().toISOString()
        };

        localStorage.setItem('manneteilt_session', JSON.stringify(session));
        this.state.session = session;

        try {
            await this.state.supabaseClient.from('sessions').insert([{
                id: session.id,
                name: session.name,
                code: session.code,
                created_at: session.createdAt
            }]);
        } catch (err) {
            console.error('Session sync failed:', err);
        }

        this.showToast(`🎉 Reise "${name}" gestartet! Code: ${code}`);
        this.render();
        this.copyShareLink();
    }

    async joinByCode(code) {
        code = code.toUpperCase().trim();
        if (code.length !== 6) {
            this.showToast('⚠️ Code muss 6 Zeichen lang sein', 'error');
            return;
        }

        try {
            const { data, error } = await this.state.supabaseClient
                .from('sessions')
                .select('*')
                .eq('code', code)
                .single();

            if (error || !data) {
                this.showToast('❌ Keine Reise mit diesem Code gefunden', 'error');
                return;
            }

            this.state.session = {
                id: data.id,
                name: data.name,
                code: data.code,
                createdAt: data.created_at
            };
            localStorage.setItem('manneteilt_session', JSON.stringify(this.state.session));
            await this.loadData();

            this.showToast(`📥 Reise "${data.name}" beigetreten!`);
            this.render();
        } catch (err) {
            console.error('Join failed:', err);
            this.showToast('❌ Fehler beim Beitreten', 'error');
        }
    }

    async loadSession(sessionId) {
        try {
            const { data, error } = await this.state.supabaseClient
                .from('sessions')
                .select('*')
                .eq('id', sessionId)
                .single();

            if (!error && data) {
                this.state.session = {
                    id: data.id,
                    name: data.name,
                    code: data.code,
                    createdAt: data.created_at
                };
                localStorage.setItem('manneteilt_session', JSON.stringify(this.state.session));
                await this.loadData();
                this.showToast('📥 Daten geladen — ManneTeilt');
                return true;
            }
        } catch (err) {
            console.error('Load from Supabase failed:', err);
        }

        const saved = localStorage.getItem('manneteilt_session');
        if (saved) {
            const localSession = JSON.parse(saved);
            if (localSession.id === sessionId) {
                this.state.session = localSession;
                this.state.participants = JSON.parse(localStorage.getItem('manneteilt_participants') || '[]');
                this.state.expenses = JSON.parse(localStorage.getItem('manneteilt_expenses') || '[]');
                return true;
            }
        }
        return false;
    }

    async loadData() {
        if (!this.state.session) return;

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
            this.state.participants = participantsRes.data.map(p => ({
                id: p.id,
                session_id: p.session_id,
                name: p.name,
                created_at: p.created_at
            }));
        }
        if (!expensesRes.error) {
            this.state.expenses = expensesRes.data.map(e => ({
                id: e.id,
                session_id: e.session_id,
                payer_id: e.payer_id,
                amount: parseFloat(e.amount),
                split_among_ids: e.split_among_ids || [],
                note: e.note,
                created_at: e.created_at
            }));
        }
        this.render();
    }

    // ============================================
    // PARTICIPANTS
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

        try {
            await this.state.supabaseClient.from('participants').insert([{
                id: participant.id,
                session_id: participant.session_id,
                name: participant.name,
                created_at: participant.created_at
            }]);
        } catch (err) {
            console.error('Participant sync failed:', err);
        }

        this.elements.participantName.value = '';
        this.showToast(`✅ ${name} hinzugefügt`);
    }

    async deleteParticipant(id) {
        const hasExpenses = this.state.expenses.some(e =>
            e.payer_id === id || (e.split_among_ids && e.split_among_ids.includes(id))
        );

        if (hasExpenses) {
            this.showToast('🚫 Teilnehmer kann nicht gelöscht werden — es gibt bereits Ausgaben mit ihm.', 'error');
            return;
        }

        if (!confirm('Teilnehmer löschen?')) return;

        this.state.participants = this.state.participants.filter(p => p.id !== id);
        this.persistData('participants');
        this.render();

        try {
            await this.state.supabaseClient.from('participants').delete().eq('id', id);
        } catch (err) {
            console.error('Delete participant failed:', err);
        }

        this.showToast('🗑️ Teilnehmer entfernt');
    }

    toggleParticipantsExpand() {
        this.state.participantsExpanded = !this.state.participantsExpanded;
        this.renderParticipants();
    }

    // ============================================
    // EXPENSES
    // ============================================

    openExpenseModal(expenseId = null) {
        if (this.state.participants.length === 0) {
            this.showToast('⚠️ Erst Teilnehmer hinzufügen!', 'error');
            return;
        }

        // Bug 11 Fix: Populate dropdown FIRST, then set value
        this.elements.payerSelect.innerHTML = this.state.participants
            .map(p => `<option value="${p.id}">${p.name}</option>`).join('');

        if (expenseId) {
            // Edit mode
            const expense = this.state.expenses.find(e => e.id === expenseId);
            this.elements.expenseId.value = expense.id;
            this.elements.payerSelect.value = expense.payer_id;
            
            // Euro → Cent → Formatieren
            const cents = Math.round(expense.amount * 100).toString();
            if (cents.length <= 2) {
                this.elements.expenseAmount.value = '0.' + cents.padStart(2, '0');
            } else {
                this.elements.expenseAmount.value = cents.slice(0, -2) + '.' + cents.slice(-2);
            }
            
            this.elements.expenseNote.value = expense.note || '';
            this.elements.deleteExpenseBtn.style.display = 'block';
            this.renderSplitCheckboxes(expense.split_among_ids);
            } else {
            // New expense
            this.elements.expenseForm.reset();
            this.elements.expenseId.value = '';
            this.elements.deleteExpenseBtn.style.display = 'none';

            // Feature 7: Remember last payer
            const lastPayerId = localStorage.getItem('manneteilt_lastPayer');
            if (lastPayerId) {
                const exists = this.state.participants.find(p => p.id === lastPayerId);
                if (exists) {
                    this.elements.payerSelect.value = lastPayerId;
                }
            }

            this.renderSplitCheckboxes(null);
        }

        this.elements.expenseModal.showModal();

        // Feature 6: Auto-focus on amount
        setTimeout(() => {
            this.elements.expenseAmount.focus();
        }, 50);
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

        this.updateToggleAllSplitText();
    }

    toggleAllSplitCheckboxes() {
        const checkboxes = this.elements.splitParticipants.querySelectorAll('input[type="checkbox"]');
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        checkboxes.forEach(cb => cb.checked = !allChecked);
        this.updateToggleAllSplitText();
    }

    updateToggleAllSplitText() {
        const checkboxes = this.elements.splitParticipants.querySelectorAll('input[type="checkbox"]');
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        this.elements.toggleAllSplit.textContent = allChecked ? 'Alle abwählen' : 'Alle auswählen';
    }

    async saveExpense(e) {
        e.preventDefault();

        const splitIds = Array.from(this.elements.splitParticipants.querySelectorAll('input:checked'))
            .map(cb => cb.value);

        if (splitIds.length === 0) {
            this.showToast('⚠️ Mindestens eine Person auswählen!', 'error');
            return;
        }

        const expenseData = {
            id: this.elements.expenseId.value || crypto.randomUUID(),
            session_id: this.state.session.id,
            payer_id: this.elements.payerSelect.value,
            amount: parseFloat(this.elements.expenseAmount.value),  // <- BEREITS IN EURO
            split_among_ids: splitIds,
            note: this.elements.expenseNote.value,
            created_at: this.elements.expenseId.value 
                ? this.state.expenses.find(ex => ex.id === this.elements.expenseId.value)?.created_at 
                : new Date().toISOString()
        };

        if (this.elements.expenseId.value) {
            this.state.expenses = this.state.expenses.filter(ex => ex.id !== this.elements.expenseId.value);
        }

        this.state.expenses.push(expenseData);
        this.persistData('expenses');

        // COLLAPSIBLE LOGIC: Nur diese Gruppe expandieren
        this.expandOnlyThisGroup(this.elements.payerSelect.value);

        // Participants collapsen
        this.state.participantsExpanded = false;
        this.renderParticipants();

        // Save last payer
        localStorage.setItem('manneteil_lastPayer', this.elements.payerSelect.value);

        try {
            const table = this.state.supabaseClient.from('expenses');
            await (this.elements.expenseId.value
                ? table.upsert([expenseData])
                : table.insert([expenseData])
            );
        } catch (err) {
            console.error('Save expense failed:', err);
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

        try {
            await this.state.supabaseClient.from('expenses').delete().eq('id', id);
        } catch (err) {
            console.error('Delete expense failed:', err);
        }

        this.elements.expenseModal.close();
        this.showToast('🗑️ Ausgabe gelöscht');
    }

    // ============================================
    // BALANCE CALCULATION
    // ============================================

    calculateBalances() {
        const balances = {};
        this.state.participants.forEach(p => {
            balances[p.id] = { ...p, net: 0 };
        });

        this.state.expenses.forEach(expense => {
            const shareCount = expense.split_among_ids.length;
            if (shareCount === 0) return;
            const share = expense.amount / shareCount;

            if (balances[expense.payer_id]) {
                balances[expense.payer_id].net += expense.amount;
            }

            expense.split_among_ids.forEach(splitId => {
                if (balances[splitId]) {
                    balances[splitId].net -= share;
                }
            });
        });

        return Object.values(balances).map(b => ({
            ...b,
            net: Math.round(b.net * 100) / 100
        }));
    }

    simplifyDebts(balances) {
        const debtors = balances.filter(b => b.net < -0.01).sort((a, b) => a.net - b.net);
        const creditors = balances.filter(b => b.net > 0.01).sort((a, b) => b.net - a.net);
        const settlements = [];

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

            debtor.net += amount;
            creditor.net -= amount;

            if (Math.abs(debtor.net) < 0.01) i++;
            if (creditor.net < 0.01) j++;
        }
        return settlements;
    }

    // ============================================
    // PERSISTENCE
    // ============================================

    persistData(type) {
        if (type === 'participants') {
            localStorage.setItem('manneteilt_participants', JSON.stringify(this.state.participants));
        } else if (type === 'expenses') {
            localStorage.setItem('manneteilt_expenses', JSON.stringify(this.state.expenses));
        }
    }

    // ============================================
    // SHARE
    // ============================================

    getShareLink() {
        if (!this.state.session) return '';
        const basePath = window.location.href.split('?')[0].split('#')[0];
        return `${basePath}?session=${this.state.session.id}`;
    }

    copyShareLink() {
        const link = this.getShareLink();
        const code = this.state.session ? this.state.session.code : '';
        const shareText = code
            ? `ManneTeilt — Reise "${this.state.session.name}"\nCode: ${code}\nOder Link: ${link}`
            : link;

        navigator.clipboard.writeText(shareText).then(() => {
            this.showToast('🔗 Link + Code kopiert!');
        }).catch(() => {
            this.showToast('📋 ' + shareText);
        });
    }

    async loadFromURL() {
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get('session');

        if (sessionId) {
            const success = await this.loadSession(sessionId);
            if (success) {
                window.history.replaceState({}, '', window.location.pathname);
            }
        } else {
            const saved = localStorage.getItem('manneteilt_session');
            if (saved) {
                this.state.session = JSON.parse(saved);
                this.state.participants = JSON.parse(localStorage.getItem('manneteilt_participants') || '[]');
                this.state.expenses = JSON.parse(localStorage.getItem('manneteilt_expenses') || '[]');

                if (this.state.supabaseClient && this.state.session) {
                    await this.loadData();
                }
            }
        }
    }

    // ============================================
    // RENDERING
    // ============================================

    render() {
        if (this.state.session) {
            this.elements.sessionName.textContent = this.state.session.name;
            this.elements.sessionInfo.classList.remove('hidden');
            this.elements.shareBtn.classList.remove('hidden');
            this.elements.newSessionBtn.classList.add('hidden');
            this.elements.newTripBtn.classList.remove('hidden');
            this.elements.joinSection.classList.add('hidden');

            if (this.state.session.code) {
                this.elements.sessionCodeDisplay.textContent = `CODE: ${this.state.session.code}`;
                this.elements.sessionCodeDisplay.classList.remove('hidden');
            }
        } else {
            this.elements.sessionInfo.classList.add('hidden');
            this.elements.shareBtn.classList.add('hidden');
            this.elements.newSessionBtn.classList.remove('hidden');
            this.elements.newTripBtn.classList.add('hidden');
            this.elements.joinSection.classList.remove('hidden');
            this.elements.sessionCodeDisplay.classList.add('hidden');
        }

        this.renderParticipants();
        this.renderExpenses();
        this.renderBalance();
        this.updateUIState(this.state.session ? 'active' : 'idle');
    }

    renderParticipants() {
        const hasExpenses = this.state.expenses.length > 0;

        if (this.state.participants.length > 0) {
            this.elements.participantCount.textContent = `${this.state.participants.length}`;
            this.elements.participantCount.classList.remove('hidden');
        } else {
            this.elements.participantCount.classList.add('hidden');
        }

        if (hasExpenses && !this.state.participantsExpanded) {
            this.elements.participantsListExpanded.classList.add('hidden');
            this.elements.participantsCompact.classList.remove('hidden');
            this.elements.participantsChips.innerHTML = this.state.participants
                .map(p => `<span class="chip">${p.name}</span>`).join('');
            this.elements.toggleParticipantsBtn.textContent = 'Teilnehmer verwalten ▾';
        } else if (hasExpenses && this.state.participantsExpanded) {
            this.elements.participantsListExpanded.classList.remove('hidden');
            this.elements.participantsCompact.classList.add('hidden');
            this.elements.participantsList.innerHTML = this.state.participants.length
                ? this.state.participants.map(p => `
                    <div class="list-item">
                        <span>${p.name}</span>
                        <span class="lock-icon">🔒</span>
                    </div>
                `).join('')
                : '<p class="empty">Noch keine Teilnehmer</p>';
            this.elements.toggleParticipantsBtn.textContent = 'Einklappen ▴';
        } else {
            this.elements.participantsListExpanded.classList.remove('hidden');
            this.elements.participantsCompact.classList.add('hidden');
            this.elements.participantsList.innerHTML = this.state.participants.length
                ? this.state.participants.map(p => `
                    <div class="list-item">
                        <span>${p.name}</span>
                        <button class="icon-btn danger" onclick="app.deleteParticipant('${p.id}')">✕</button>
                    </div>
                `).join('')
                : '<p class="empty">Noch keine Teilnehmer</p>';
        }
    }

    renderExpenses() {
        if (!this.elements.expensesList) return;

        if (this.state.expenses.length === 0) {
            this.elements.expensesList.innerHTML = '<p class="empty">Noch keine Ausgaben</p>';
            return;
        }

        // Sort by created_at (chronologisch)
        const sorted = [...this.state.expenses].sort((a, b) =>
            new Date(a.created_at) - new Date(b.created_at)
        );

        // Gruppieren nach payer
        const groups = {};
        sorted.forEach(e => {
            if (!groups[e.payer_id]) {
                groups[e.payer_id] = [];
            }
            groups[e.payer_id].push(e);
        });

        // HTML rendern mit Collapsible Logic
        let html = '';
        Object.entries(groups).forEach(([payerId, expenses]) => {
            const payer = this.state.participants.find(p => p.id === payerId);
            const total = expenses.reduce((sum, e) => sum + e.amount, 0);
            const isExpanded = this.state.expandedGroups.has(payerId);

            html += `
                <div class="expense-group" data-payer-id="${payerId}">
                    <div class="expense-group-header" onclick="app.toggleGroup('${payerId}')">
                        <span class="expense-group-name">${payer ? payer.name : '?'}</span>
                        <span class="expense-group-total">${total.toFixed(2)} €</span>
                        <span class="expand-icon">${isExpanded ? '▴' : '▾'}</span>
                    </div>
                    <div class="expense-group-items ${isExpanded ? '' : 'collapsed'}">
            `;

            expenses.forEach(e => {
                const isForAll = e.split_among_ids.length === this.state.participants.length;
                const splitNames = e.split_among_ids.map(id =>
                    this.state.participants.find(p => p.id === id)
                ).filter(p => p).map(p => p.name).join(', ');

                const splitBadge = isForAll
                    ? '<span class="split-all">👥 alle</span>'
                    : `<span class="split-subset">für ${splitNames}</span>`;

                html += `
                    <div class="list-item" onclick="app.openExpenseModal('${e.id}')">
                        <div>
                            <strong>${e.amount.toFixed(2)} €</strong>
                            ${splitBadge}
                            ${e.note ? `<br><span class="note">${e.note}</span>` : ''}
                        </div>
                    </div>
                `;
            });

            html += '</div></div>';
        });

        this.elements.expensesList.innerHTML = html;
    }

    toggleGroup(payerId) {
        if (this.state.expandedGroups.has(payerId)) {
            this.state.expandedGroups.delete(payerId);
        } else {
            this.state.expandedGroups.add(payerId);
        }
        this.renderExpenses();
    }

    // Nach saveExpense: Nur diese Gruppe expandiert lassen
    expandOnlyThisGroup(payerId) {
        this.state.expandedGroups.clear();
        this.state.expandedGroups.add(payerId);
        this.renderExpenses();
        setTimeout(() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 300);
    }

    renderBalance() {
        if (!this.elements.balanceList) return;

        const balances = this.calculateBalances();
        const settlements = this.simplifyDebts(balances);

        if (settlements.length === 0) {
            this.elements.balanceList.innerHTML = '<div class="card"><p>🎉 Alles ausgeglichen — Manne ist zufrieden!</p></div>';
        } else {
            this.elements.balanceList.innerHTML = settlements.map(s => `
                <div class="card settlement-card">
                    <div class="settlement-arrow">${s.from} → ${s.to}</div>
                    <div class="settlement-amount">${s.amount.toFixed(2)} €</div>
                </div>
            `).join('');
        }
    }

    updateUIState(state) {
        this.elements.sessionSection.classList.remove('hidden');
        const sections = ['participantsSection', 'expensesSection', 'balanceSection'];
        sections.forEach(sec => {
            const el = this.elements[sec];
            if (el) {
                el.classList.toggle('hidden', state !== 'active');
            }
        });
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
// INIT
// ============================================

let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new ManneTeiltApp();
    window.app = app;
    setTimeout(() => {
        if (!app.state.session) {
            app.showToast('💡 Tippe "Neue Reise starten" um anzufangen — ManneTeilt');
        }
    }, 1500);
});