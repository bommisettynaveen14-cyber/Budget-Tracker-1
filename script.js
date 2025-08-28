// script.js

// --- FIREBASE MODULES ---
// Import Firebase services using ES Modules from the CDN.
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase, ref, set, get } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";


// --- FIREBASE CONFIGURATION ---
// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDIhrAdtYup6zkHOTrg9EPAB7u6dxWc-tE",
    authDomain: "budget-tracker-bd709.firebaseapp.com",
    databaseURL: "https://budget-tracker-bd709-default-rtdb.firebaseio.com",
    projectId: "budget-tracker-bd709",
    storageBucket: "budget-tracker-bd709.appspot.com",
    messagingSenderId: "174541515601",
    appId: "1:174541515601:web:aad353a17c29db7619c170",
    measurementId: "G-KB5XQQHJLZ"
};


// --- DATA STORAGE ABSTRACTION ---
// This section provides a unified way to interact with data,
// automatically choosing IndexedDB if available, or falling back to localStorage.

/**
 * Manages all data persistence using IndexedDB.
 * This class handles database creation, schema upgrades, and all CRUD operations.
 */
class IndexedDBManager {
    constructor(dbName, version) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
    }

    /**
     * Opens and initializes the IndexedDB database.
     * Creates object stores and indexes if they don't exist.
     * @returns {Promise<void>} A promise that resolves when the database is ready.
     */
    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onupgradeneeded = (event) => {
                this.db = event.target.result;
                // Create object store for transactions with indexes
                if (!this.db.objectStoreNames.contains('transactions')) {
                    const txStore = this.db.createObjectStore('transactions', { keyPath: 'id' });
                    txStore.createIndex('date', 'date', { unique: false });
                    txStore.createIndex('category', 'category', { unique: false });
                    txStore.createIndex('type', 'type', { unique: false });
                }
                // Create other object stores
                if (!this.db.objectStoreNames.contains('categories')) {
                    this.db.createObjectStore('categories', { keyPath: 'id' });
                }
                if (!this.db.objectStoreNames.contains('budgets')) {
                    this.db.createObjectStore('budgets', { keyPath: 'id' });
                }
                if (!this.db.objectStoreNames.contains('settings')) {
                    this.db.createObjectStore('settings', { keyPath: 'key' });
                }
                if (!this.db.objectStoreNames.contains('receipts')) {
                    this.db.createObjectStore('receipts', { keyPath: 'id' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };

            request.onerror = (event) => {
                console.error('IndexedDB error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * Generic method to perform a database operation.
     * @param {string} storeName - The name of the object store.
     * @param {IDBTransactionMode} mode - The transaction mode ('readonly' or 'readwrite').
     * @param {(store: IDBObjectStore) => IDBRequest} operation - A function that takes the store and performs an operation.
     * @returns {Promise<any>} A promise that resolves with the result of the operation.
     */
    _performOperation(storeName, mode, operation) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject('DB not initialized');
            try {
                const transaction = this.db.transaction(storeName, mode);
                const store = transaction.objectStore(storeName);
                const request = operation(store);
                
                request.onsuccess = () => resolve(request.result);
                request.onerror = (event) => reject(event.target.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    get(storeName, key) {
        return this._performOperation(storeName, 'readonly', store => store.get(key));
    }

    getAll(storeName) {
        return this._performOperation(storeName, 'readonly', store => store.getAll());
    }

    add(storeName, value) {
        return this._performOperation(storeName, 'readwrite', store => store.add(value));
    }

    put(storeName, value) {
        return this._performOperation(storeName, 'readwrite', store => store.put(value));
    }

    delete(storeName, key) {
        return this._performOperation(storeName, 'readwrite', store => store.delete(key));
    }

    clear(storeName) {
        return this._performOperation(storeName, 'readwrite', store => store.clear());
    }
}


/**
 * A fallback storage manager that mimics the IndexedDBManager API but uses localStorage.
 * This ensures the app functions even if IndexedDB is not supported.
 */
class LocalStorageManager {
    constructor() {
        console.warn("IndexedDB not supported, falling back to localStorage. Performance may be degraded.");
    }

    init() { return Promise.resolve(); }

    _getData() {
        try {
            return JSON.parse(localStorage.getItem('budgetTrackerData_fallback')) || {};
        } catch {
            return {};
        }
    }
    
    _saveData(data) {
        localStorage.setItem('budgetTrackerData_fallback', JSON.stringify(data));
    }

    get(storeName, key) {
        const data = this._getData();
        const store = data[storeName] || [];
        const item = store.find(item => item.id === key || item.key === key);
        return Promise.resolve(item);
    }

    getAll(storeName) {
        const data = this._getData();
        return Promise.resolve(data[storeName] || []);
    }

    add(storeName, value) {
        const data = this._getData();
        if (!data[storeName]) data[storeName] = [];
        data[storeName].push(value);
        this._saveData(data);
        return Promise.resolve();
    }

    put(storeName, value) {
        const data = this._getData();
        if (!data[storeName]) data[storeName] = [];
        const keyProp = value.id ? 'id' : 'key';
        const index = data[storeName].findIndex(item => item[keyProp] === value[keyProp]);
        if (index > -1) {
            data[storeName][index] = value;
        } else {
            data[storeName].push(value);
        }
        this._saveData(data);
        return Promise.resolve();
    }

    delete(storeName, key) {
        const data = this._getData();
        if (data[storeName]) {
            const keyProp = data[storeName].length > 0 && data[storeName][0].id ? 'id' : 'key';
            data[storeName] = data[storeName].filter(item => item[keyProp] !== key);
            this._saveData(data);
        }
        return Promise.resolve();
    }
    
    clear(storeName) {
        const data = this._getData();
        data[storeName] = [];
        this._saveData(data);
        return Promise.resolve();
    }
}


// --- Budget Tracker PWA - Main JavaScript File ---
class BudgetTracker {
    constructor() {
        // Firebase properties
        this.firebaseApp = null;
        this.auth = null;
        this.database = null;
        this.user = null;
        this.appInitialized = false; // Flag to check if the main app has been initialized

        // Determine which data store to use
        this.isIndexedDBSupported = 'indexedDB' in window;
        this.dataStore = this.isIndexedDBSupported 
            ? new IndexedDBManager('BudgetTrackerDB', 2) // DB version 2 for new schema
            : new LocalStorageManager();

        this.data = {
            transactions: [],
            categories: [],
            budgets: [],
            settings: {
                theme: 'auto',
                language: 'en',
                dailyReminder: true,
                locationTracking: false,
                autoCategorize: true,
                installationDate: new Date().toISOString(),
                budgetAlertThreshold: 80
            }
        };
        
        this.charts = {};
        this.charts.futureExpenseAnalysis = null;
        this.selectedTimeRange = 30;
        this.selectedMonth = 'all';
        this.filterMode = 'monthly';
        this.customDateRange = { from: null, to: null };
        this.alertedBudgets = new Set();
        this.recognition = null;
        this.isListening = false;
        this.compressedReceiptBlob = null;
        
        // Start the authentication flow
        this.initAuth();
    }

    /**
     * Initializes Firebase and sets up the login page event listeners.
     */
    initAuth() {
        // Initialize Firebase
        this.firebaseApp = initializeApp(firebaseConfig);
        this.auth = getAuth(this.firebaseApp);
        this.database = getDatabase(this.firebaseApp);

        // Get login page elements
        const signInBtn = document.getElementById('signInBtn');
        const signUpBtn = document.getElementById('signUpBtn');
        const guestBtn = document.getElementById('guestBtn');

        // Event listeners for login buttons
        signInBtn.addEventListener('click', () => this.signInWithGoogle());
        signUpBtn.addEventListener('click', () => this.signInWithGoogle());
        guestBtn.addEventListener('click', async () => {
            this.user = null; // Explicitly set user to null for guest mode
            this.updateProfileUI(null);
            
            document.getElementById('loginPage').style.display = 'none';
            document.getElementById('authLoadingScreen').style.display = 'flex';
            if (!this.appInitialized) {
                await this.initializeApp();
                this.appInitialized = true;
            }
            document.getElementById('appContainer').style.display = 'block';
            document.getElementById('authLoadingScreen').style.display = 'none';
        });

        onAuthStateChanged(this.auth, async (user) => {
            const authLoadingScreen = document.getElementById('authLoadingScreen');
            const loginPage = document.getElementById('loginPage');
            const appContainer = document.getElementById('appContainer');

            if (user) {
                // User is signed in.
                this.user = user;
                
                // Show loading screen while the app prepares.
                loginPage.style.display = 'none';
                appContainer.style.display = 'none';
                authLoadingScreen.style.display = 'flex';
                
                // Save profile and update the UI right away.
                await this.saveUserProfile(user);
                this.updateProfileUI(user);

                // Initialize the main app logic only once per session.
                if (!this.appInitialized) {
                    await this.initializeApp();
                    this.appInitialized = true;
                }
                
                // Show the app.
                appContainer.style.display = 'block';
                authLoadingScreen.style.display = 'none';

            } else {
                // No user is signed in.
                this.user = null;
                this.updateProfileUI(null);
                this.appInitialized = false; // Reset for next login.

                // Show the login page.
                authLoadingScreen.style.display = 'none';
                appContainer.style.display = 'none';
                loginPage.style.display = 'flex';
            }
        });

        // Listen for online/offline status changes to trigger sync
        window.addEventListener('online', () => this.syncOfflineTransactions());
    }

    /**
     * Saves or updates the user's profile in the Realtime Database.
     * @param {object} user - The Firebase user object.
     */
    async saveUserProfile(user) {
        const userProfile = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            lastLogin: new Date().toISOString()
        };

        try {
            // Set the data at the specified path in the database
            await set(ref(this.database, 'users/' + user.uid + '/profile'), userProfile);
        } catch (error) {
            console.error("Error saving user profile to RTDB:", error);
            this.showToast("Could not save your profile.", "error");
        }
    }
    
    /**
     * Handles the Google Sign-In process using a popup.
     */
    async signInWithGoogle() {
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(this.auth, provider);
            // The onAuthStateChanged listener will handle the rest of the app flow.
            this.showToast(`Welcome, ${result.user.displayName}!`, 'success');
        } catch (error)
        {
            console.error("Google Sign-In Error:", error);
            this.showToast(`Sign-in failed: ${error.message}`, 'error');
        }
    }
    
    /**
     * Initializes the entire application after authentication.
     */
    async initializeApp() {
        try {
            const loadingMessage = document.getElementById('loadingMessage');

            // 1. Initialize the data store (IndexedDB or localStorage)
            loadingMessage.textContent = 'Initializing storage...';
            await this.dataStore.init();

            // 2. Run migration from old localStorage if necessary
            loadingMessage.textContent = 'Checking for old data...';
            await this.runMigration();

            // Restore data from Firebase AFTER DB init and BEFORE loading to memory
            if (this.user) {
                await this.restoreTransactionsFromFirebase();
            }

            // 3. Load all data from the local store into memory
            loadingMessage.textContent = 'Loading your data...';
            await this.loadData();
            
            // 4. Sync any offline data if logged in
            await this.syncOfflineTransactions();

            // 5. Process recurring transactions
            const addedRecurringCount = this.processRecurringTransactions();
            if (addedRecurringCount > 0) {
                await this.showToast(`${addedRecurringCount} recurring transaction(s) were added.`, 'success');
            }

            // 6. Setup UI and event listeners
            loadingMessage.textContent = 'Setting up the app...';
            this.setupEventListeners();
            this.setupVoiceRecognition();
            await this.initializeDefaultCategories();
            this.applyTheme();
            this.updateLanguage();
            this.updateDashboard();
            this.renderTransactions();
            this.renderCategories();
            this.renderCharts();
            this.showDailyReminder();
            this.setupKeyboardShortcuts();
            this.updateAppInfo();
            this.initializeMonthFilters();
            this.updateProfileUI(this.user); // Ensure profile is up-to-date

            // Hide loading overlay within the main app container
            document.getElementById('loadingOverlay').style.opacity = '0';
            setTimeout(() => {
                document.getElementById('loadingOverlay').style.display = 'none';
            }, 300);

        } catch (error) {
            console.error("Failed to initialize application:", error);
            document.getElementById('loadingMessage').textContent = 'Error loading app. Please refresh.';
            this.showToast("Could not initialize the application.", "error");
        }
    }

    /**
     * Checks for data in the old localStorage format and migrates it to IndexedDB.
     * This runs only once.
     */
    async runMigration() {
        // Only run migration if using IndexedDB and old data exists
        if (!this.isIndexedDBSupported) return;

        const oldDataRaw = localStorage.getItem('budgetTrackerData');
        if (!oldDataRaw) return; // No old data to migrate

        this.showToast('Migrating your old data to the new format...', 'info');

        try {
            const oldData = JSON.parse(oldDataRaw);
            
            // Use Promise.all to perform migrations in parallel
            await Promise.all([
                ...oldData.transactions.map(item => this.dataStore.add('transactions', item)),
                ...oldData.categories.map(item => this.dataStore.add('categories', item)),
                ...oldData.budgets.map(item => this.dataStore.add('budgets', item)),
                this.dataStore.put('settings', { key: 'main', ...oldData.settings })
            ]);

            // Clean up old localStorage data after successful migration
            localStorage.removeItem('budgetTrackerData');
            this.showToast('Data migration successful!', 'success');
        } catch (error) {
            console.error('Migration failed:', error);
            this.showToast('Could not migrate old data. Please export it and import it manually.', 'error');
        }
    }
    
    /**
     * Loads all data from the chosen data store into the application's state.
     */
    async loadData() {
        try {
            const [transactions, categories, budgets, settings] = await Promise.all([
                this.dataStore.getAll('transactions'),
                this.dataStore.getAll('categories'),
                this.dataStore.getAll('budgets'),
                this.dataStore.get('settings', 'main')
            ]);
            
            this.data.transactions = transactions || [];
            this.data.categories = categories || [];
            this.data.budgets = budgets || [];

            if (settings) {
                this.data.settings = { ...this.data.settings, ...settings };
            } else {
                // If no settings exist, save the default ones
                await this.dataStore.put('settings', { key: 'main', ...this.data.settings });
            }

        } catch (error) {
            console.error('Error loading data:', error);
            this.showToast('Error loading saved data', 'error');
        }
    }

    /**
     * Fetches transactions from Firebase and populates IndexedDB.
     * This is the primary data source for logged-in users.
     */
    async restoreTransactionsFromFirebase() {
        if (!this.user || !navigator.onLine) {
            if (this.user) this.showToast("Offline mode: Using local data.", "info");
            return;
        }

        try {
            const snapshot = await get(ref(this.database, `users/${this.user.uid}/transactions`));
            if (snapshot.exists()) {
                const cloudData = snapshot.val();
                const transactions = Object.values(cloudData);

                // Clear local store and replace with cloud data
                await this.dataStore.clear('transactions');
                await Promise.all(transactions.map(tx => this.dataStore.put('transactions', tx)));
                
                return "Data Restored Successfully";
            } else {
                // No data in the cloud, clear local data to ensure a fresh start
                await this.dataStore.clear('transactions');
                return "No cloud data found. Local data cleared.";
            }
        } catch (error) {
            console.error("Error restoring data from Firebase:", error);
            this.showToast("Could not restore data from the cloud. Using local data.", "error");
            throw error; // re-throw to be caught by caller
        }
    }
    
    /**
     * Initializes default categories if none exist.
     */
    async initializeDefaultCategories() {
        if (this.data.categories.length === 0) {
            const defaultCategories = [
                { id: 'food', name: 'Food', icon: '🍕', color: '#FF6B6B', type: 'expense' },
                { id: 'transport', name: 'Transport', icon: '🚗', color: '#4ECDC4', type: 'expense' },
                { id: 'shopping', name: 'Shopping', icon: '🛒', color: '#45B7D1', type: 'expense' },
                { id: 'entertainment', name: 'Entertainment', icon: '🎬', color: '#96CEB4', type: 'expense' },
                { id: 'bills', name: 'Bills', icon: '📄', color: '#FFEAA7', type: 'expense' },
                { id: 'salary', name: 'Salary', icon: '💰', color: '#6C5CE7', type: 'income' },
                { id: 'freelance', name: 'Freelance', icon: '💼', color: '#A29BFE', type: 'income' }
            ];
            
            // Add default categories to the data store
            await Promise.all(defaultCategories.map(cat => this.dataStore.add('categories', cat)));
            
            // Update the in-memory state
            this.data.categories = defaultCategories;
        }
    }
    
    // Initialize month filters for new features
    initializeMonthFilters() {
        this.populateMonthFilter();
        this.setupMonthFilterEvents();
    }
    
    // Populate month filter dropdown with available months from transactions
    populateMonthFilter() {
        const monthFilter = document.getElementById('monthFilter');
        const chartMonthFilter = document.getElementById('chartMonthFilter');
        
        if (!monthFilter) return;
        
        monthFilter.innerHTML = '<option value="all">All Time</option>';
        if (chartMonthFilter) chartMonthFilter.innerHTML = '<option value="all">All Time</option>';
        
        const months = new Set();
        this.data.transactions.forEach(t => {
            const d = new Date(t.date);
            months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        });
        
        const currentDate = new Date();
        for (let i = 0; i < 12; i++) {
            const d = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
            months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
        for (let i = 1; i <= 12; i++) {
            const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
            months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
        
        const sortedMonths = Array.from(months).sort().reverse();
        
        sortedMonths.forEach(monthKey => {
            const [year, month] = monthKey.split('-');
            const monthName = new Date(year, month - 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
            
            const option = document.createElement('option');
            option.value = monthKey;
            option.textContent = monthName;
            
            const currentMonthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
            if (monthKey === currentMonthKey) {
                option.selected = true;
                this.selectedMonth = monthKey;
            }
            
            monthFilter.appendChild(option.cloneNode(true));
            if (chartMonthFilter) chartMonthFilter.appendChild(option.cloneNode(true));
        });
        
        if (this.selectedMonth !== 'all') this.updateFilterView();
    }
    
    // Setup month filter event listeners
    setupMonthFilterEvents() {
        document.getElementById('monthFilter')?.addEventListener('change', (e) => {
            this.selectedMonth = e.target.value;
            this.filterMode = 'monthly';
            this.updateFilterView();
            this.alertedBudgets.clear();
        });
        document.getElementById('chartMonthFilter')?.addEventListener('change', () => this.renderCharts());
        document.getElementById('monthModeBtn')?.addEventListener('click', () => this.switchFilterMode('monthly'));
        document.getElementById('customRangeBtn')?.addEventListener('click', () => this.switchFilterMode('custom'));
        document.getElementById('applyCustomRange')?.addEventListener('click', () => this.applyCustomDateRange());
        document.getElementById('clearCustomRange')?.addEventListener('click', () => this.clearCustomDateRange());
    }
    
    // Switch between filter modes
    switchFilterMode(mode) {
        this.filterMode = mode;
        const monthModeBtn = document.getElementById('monthModeBtn');
        const customRangeBtn = document.getElementById('customRangeBtn');
        const monthSection = document.getElementById('monthFilterSection');
        const customSection = document.getElementById('customRangeSection');
        
        if (monthModeBtn && customRangeBtn && monthSection && customSection) {
            monthModeBtn.classList.toggle('active', mode === 'monthly');
            customRangeBtn.classList.toggle('active', mode === 'custom');
            monthSection.style.display = mode === 'monthly' ? 'block' : 'none';
            customSection.style.display = mode === 'custom' ? 'block' : 'none';
        }
        this.updateFilterView();
    }
    
    // Apply custom date range filter
    applyCustomDateRange() {
        const from = document.getElementById('customFromDate').value;
        const to = document.getElementById('customToDate').value;
        if (!from || !to) return this.showToast('Please select both From and To dates', 'error');
        if (new Date(from) > new Date(to)) return this.showToast('From date cannot be later than To date', 'error');
        
        this.customDateRange = { from, to };
        this.filterMode = 'custom';
        this.updateFilterView();
        
        const summary = document.getElementById('customRangeSummary');
        if (summary) {
            const fromFmt = new Date(from + 'T00:00:00').toLocaleDateString();
            const toFmt = new Date(to + 'T00:00:00').toLocaleDateString();
            summary.textContent = `Showing transactions from ${fromFmt} to ${toFmt}`;
        }
    }
    
    // Clear custom date range filter
    clearCustomDateRange() {
        document.getElementById('customFromDate').value = '';
        document.getElementById('customToDate').value = '';
        this.customDateRange = { from: null, to: null };
        const summary = document.getElementById('customRangeSummary');
        if (summary) summary.textContent = '';
        this.updateFilterView();
    }
    
    // Update filter view based on current mode
    updateFilterView() {
        let transactions;
        if (this.filterMode === 'monthly') {
            transactions = this.getTransactionsForMonth(this.selectedMonth);
            this.updateMonthlyView(transactions);
        } else if (this.filterMode === 'custom') {
            transactions = this.getTransactionsForCustomRange();
            this.updateCustomRangeView(transactions);
        } else {
            transactions = this.data.transactions;
            this.updateMonthlyView(transactions);
        }
    }
    
    // Update monthly view based on selected month
    updateMonthlyView(transactions = null) {
        const filtered = transactions || this.getTransactionsForMonth(this.selectedMonth);
        const isAllTime = this.selectedMonth === 'all';
        
        document.getElementById('monthlySummary').style.display = isAllTime ? 'none' : 'grid';
        document.getElementById('categorySummarySection').style.display = isAllTime ? 'none' : 'block';
        document.getElementById('categoryTotalsSection').style.display = 'none';
        document.getElementById('dailyTotalsSection').style.display = isAllTime ? 'none' : 'block';
        
        if (!isAllTime) {
            this.updateMonthlySummaryCards(filtered);
            this.updateCategorySummary(filtered);
            this.updateDailyTotals(filtered);
        }
        this.renderTransactions(filtered);
        this.renderRecurringTransactions();
    }
    
    // Update custom range view
    updateCustomRangeView(transactions) {
        if (!this.customDateRange.from || !this.customDateRange.to) {
            document.getElementById('monthlySummary').style.display = 'none';
            document.getElementById('categorySummarySection').style.display = 'none';
            document.getElementById('categoryTotalsSection').style.display = 'none';
            document.getElementById('dailyTotalsSection').style.display = 'none';
            this.renderTransactions(this.data.transactions);
            return;
        }
        
        document.getElementById('monthlySummary').style.display = 'grid';
        document.getElementById('categorySummarySection').style.display = 'none';
        document.getElementById('categoryTotalsSection').style.display = 'block';
        document.getElementById('dailyTotalsSection').style.display = 'block';
        
        this.updateCustomRangeSummaryCards(transactions);
        this.updateCategoryTotals(transactions);
        this.updateDailyTotals(transactions);
        this.renderTransactions(transactions);
    }
    
    // Update summary cards for custom date range
    updateCustomRangeSummaryCards(transactions) {
        const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0);
        const expenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);
        const net = income - expenses;
        
        document.getElementById('monthlyIncome').textContent = this.formatCurrency(income);
        document.getElementById('monthlyExpenses').textContent = this.formatCurrency(expenses);
        const balanceEl = document.getElementById('monthlyBalance');
        if (balanceEl) {
            balanceEl.textContent = this.formatCurrency(net);
            const card = balanceEl.closest('.balance-card');
            if (card) card.className = 'balance-card balance ' + (net >= 0 ? 'income' : 'expense');
        }
        
        document.querySelector('[data-i18n="monthly_income"]').textContent = 'Period Income';
        document.querySelector('[data-i18n="monthly_expenses"]').textContent = 'Period Expenses';
        document.querySelector('[data-i18n="monthly_balance"]').textContent = 'Period Balance';
    }
    
    // Update category totals for filtered transactions
    updateCategoryTotals(transactions) {
        const section = document.getElementById('categoryTotalsSection');
        const grid = document.getElementById('categoryTotalsGrid');
        if (!section || !grid) return;
        
        const totals = {};
        transactions.forEach(t => {
            const cat = this.data.categories.find(c => c.id === t.category);
            if (!cat) return;
            if (!totals[t.category]) totals[t.category] = { category: cat, total: 0, count: 0 };
            totals[t.category].total += parseFloat(t.amount);
            totals[t.category].count++;
        });
        
        if (Object.keys(totals).length === 0) return section.style.display = 'none';
        
        section.style.display = 'block';
        grid.innerHTML = '';
        
        Object.values(totals).sort((a, b) => b.total - a.total).forEach(data => {
            const card = document.createElement('div');
            card.className = 'stat-card';
            const iconHtml = this.getCategoryIconHtml(data.category);
            card.innerHTML = `
                <div class="stat-icon" style="background-color: ${data.category.color}20; color: ${data.category.color};">${iconHtml}</div>
                <div class="stat-info">
                    <h4>${data.category.name}</h4>
                    <p class="stat-count">${data.count} transactions</p>
                    <p class="stat-value ${data.category.type}" style="font-weight: 600; color: ${data.category.type === 'expense' ? 'var(--danger-color)' : 'var(--success-color)'};">
                        ${data.category.type === 'expense' ? '-' : '+'}${this.formatCurrency(data.total)}
                    </p>
                </div>`;
            grid.appendChild(card);
        });
    }
    
    // Get transactions for custom date range
    getTransactionsForCustomRange() {
        if (!this.customDateRange.from || !this.customDateRange.to) return this.data.transactions;
        const from = new Date(this.customDateRange.from + 'T00:00:00');
        const to = new Date(this.customDateRange.to + 'T23:59:59');
        return this.data.transactions.filter(t => {
            const tDate = new Date(t.date + 'T00:00:00');
            return tDate >= from && tDate <= to;
        });
    }
    
    // Get transactions for a specific month
    getTransactionsForMonth(monthKey) {
        if (monthKey === 'all') return this.data.transactions;
        const [year, month] = monthKey.split('-');
        return this.data.transactions.filter(t => {
            const tDate = new Date(t.date);
            return tDate.getFullYear() === parseInt(year) && tDate.getMonth() === parseInt(month) - 1;
        });
    }
    
    // Update monthly summary cards
    updateMonthlySummaryCards(transactions) {
        const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0);
        const expenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);
        const net = income - expenses;
        
        document.getElementById('monthlyIncome').textContent = this.formatCurrency(income);
        document.getElementById('monthlyExpenses').textContent = this.formatCurrency(expenses);
        document.getElementById('monthlyBalance').textContent = this.formatCurrency(net);
        const card = document.getElementById('monthlyBalance').closest('.balance-card');
        card.className = 'balance-card balance ' + (net >= 0 ? 'income' : 'expense');
    }
    
    // Update category-wise summary
    updateCategorySummary(transactions) {
        const summary = {};
        transactions.forEach(t => {
            const cat = this.data.categories.find(c => c.id === t.category) || { name: 'Unknown', icon: '❓', color: '#999' };
            if (!summary[t.category]) summary[t.category] = { category: cat, count: 0, total: 0, type: t.type };
            summary[t.category].count++;
            summary[t.category].total += parseFloat(t.amount);
        });
        
        const grid = document.getElementById('categorySummaryGrid');
        grid.innerHTML = '';
        if (Object.keys(summary).length === 0) {
            grid.innerHTML = '<div class="empty-state"><p>No transactions for selected period</p></div>';
            return;
        }
        
        Object.values(summary).sort((a, b) => b.total - a.total).forEach(data => {
            const card = document.createElement('div');
            card.className = 'stat-card';
            const iconHtml = this.getCategoryIconHtml(data.category);
            card.innerHTML = `
                <div class="stat-icon" style="background-color: ${data.category.color}20; color: ${data.category.color};">${iconHtml}</div>
                <div class="stat-info">
                    <h4>${data.category.name}</h4>
                    <p class="stat-value">${data.count} transactions</p>
                    <p class="stat-value ${data.type}">${this.formatCurrency(data.total)}</p>
                </div>`;
            grid.appendChild(card);
        });
    }
    
    // Update daily totals
    updateDailyTotals(transactions) {
        const daily = {};
        transactions.forEach(t => {
            const date = new Date(t.date + 'T00:00:00').toLocaleDateString();
            if (!daily[date]) daily[date] = { income: 0, expense: 0, incomeCats: {}, expenseCats: {} };
            const amount = parseFloat(t.amount);
            const catName = this.getCategoryName(t.category);
            
            if (t.type === 'income') {
                daily[date].income += amount;
                daily[date].incomeCats[catName] = (daily[date].incomeCats[catName] || 0) + amount;
            } else {
                daily[date].expense += amount;
                daily[date].expenseCats[catName] = (daily[date].expenseCats[catName] || 0) + amount;
            }
        });
        
        const list = document.getElementById('dailyTotalsList');
        list.innerHTML = '';
        if (Object.keys(daily).length === 0) {
            list.innerHTML = '<div class="empty-state"><p>No transactions for selected period</p></div>';
            return;
        }
        
        Object.keys(daily).sort((a, b) => new Date(b) - new Date(a)).forEach(date => {
            const data = daily[date];
            const net = data.income - data.expense;
            const container = document.createElement('div');
            container.className = 'daily-date-container';
            container.style.marginBottom = '1rem';
            
            container.innerHTML = `<div class="daily-date-header" style="font-weight: 700; font-size: 1.1rem; color: var(--text-primary); margin-bottom: 0.75rem; padding: 0.5rem; background-color: var(--bg-tertiary); border-radius: var(--border-radius); text-align: center;">📅 ${date}</div>`;
            
            if (data.income > 0) {
                const card = document.createElement('div');
                card.className = 'daily-income-card';
                card.style.cssText = 'background-color: var(--bg-secondary); border: 2px solid var(--success-color); border-radius: var(--border-radius); padding: 1rem; margin-bottom: 0.75rem;';
                card.innerHTML = `
                    <div style="display: flex; align-items: center; margin-bottom: 0.5rem;">
                        <div style="background-color: var(--success-color)20; color: var(--success-color); padding: 0.5rem; border-radius: 50%; margin-right: 0.75rem; font-size: 1.2rem;">💰</div>
                        <div>
                            <div style="font-weight: 600; color: var(--success-color); font-size: 1rem;">Daily Income</div>
                            <div style="font-size: 1.2rem; font-weight: 700; color: var(--success-color);">+${this.formatCurrency(data.income)}</div>
                        </div>
                    </div>
                    <div style="font-size: 0.9rem; color: var(--text-secondary);">
                        ${Object.entries(data.incomeCats).map(([cat, amt]) => `<div style="margin: 0.25rem 0; padding: 0.25rem; background-color: var(--success-color)10; border-radius: 4px;">${cat}: <span style="font-weight: 600; color: var(--success-color);">+${this.formatCurrency(amt)}</span></div>`).join('')}
                    </div>`;
                container.appendChild(card);
            }
            if (data.expense > 0) {
                const card = document.createElement('div');
                card.className = 'daily-expense-card';
                card.style.cssText = 'background-color: var(--bg-secondary); border: 2px solid var(--danger-color); border-radius: var(--border-radius); padding: 1rem; margin-bottom: 0.75rem;';
                card.innerHTML = `
                    <div style="display: flex; align-items: center; margin-bottom: 0.5rem;">
                        <div style="background-color: var(--danger-color)20; color: var(--danger-color); padding: 0.5rem; border-radius: 50%; margin-right: 0.75rem; font-size: 1.2rem;">💸</div>
                        <div>
                            <div style="font-weight: 600; color: var(--danger-color); font-size: 1rem;">Daily Expenses</div>
                            <div style="font-size: 1.2rem; font-weight: 700; color: var(--danger-color);">-${this.formatCurrency(data.expense)}</div>
                        </div>
                    </div>
                    <div style="font-size: 0.9rem; color: var(--text-secondary);">
                        ${Object.entries(data.expenseCats).map(([cat, amt]) => `<div style="margin: 0.25rem 0; padding: 0.25rem; background-color: var(--danger-color)10; border-radius: 4px;">${cat}: <span style="font-weight: 600; color: var(--danger-color);">-${this.formatCurrency(amt)}</span></div>`).join('')}
                    </div>`;
                container.appendChild(card);
            }
            if (data.income > 0 && data.expense > 0) {
                const netCard = document.createElement('div');
                netCard.className = 'daily-net-card';
                netCard.style.cssText = `background-color: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--border-radius); padding: 0.75rem; text-align: center; font-weight: 600; color: ${net >= 0 ? 'var(--success-color)' : 'var(--danger-color)'};`;
                netCard.innerHTML = `<div style="font-size: 0.9rem; opacity: 0.8; margin-bottom: 0.25rem;">Net Balance for ${date}</div><div style="font-size: 1.1rem; font-weight: 700;">${net >= 0 ? '+' : ''}${this.formatCurrency(net)}</div>`;
                container.appendChild(netCard);
            }
            list.appendChild(container);
        });
    }
    
    // Get category name by ID
    getCategoryName(categoryId) {
        return this.data.categories.find(c => c.id === categoryId)?.name || 'Unknown';
    }
    
    // Event Listeners Setup
    setupEventListeners() {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', (e) => this.switchTab(e.currentTarget.dataset.tab)));
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('langToggle').addEventListener('click', () => this.toggleLanguage());
        document.getElementById('addTransactionFab').addEventListener('click', () => this.openTransactionModal());
        document.getElementById('closeTransactionModal').addEventListener('click', () => this.closeTransactionModal());
        document.getElementById('cancelTransaction').addEventListener('click', () => this.closeTransactionModal());
        document.getElementById('transactionForm').addEventListener('submit', (e) => { e.preventDefault(); this.saveTransaction(); });
        document.getElementById('addCategoryBtn').addEventListener('click', () => this.openCategoryModal());
        document.getElementById('closeCategoryModal').addEventListener('click', () => this.closeCategoryModal());
        document.getElementById('cancelCategory').addEventListener('click', () => this.closeCategoryModal());
        document.getElementById('showLastSixMonthsBtn').addEventListener('click', () => this.toggleMonthlySpendingView('lastSix'));
        document.getElementById('showAllMonthsBtn').addEventListener('click', () => this.toggleMonthlySpendingView('all'));
        document.getElementById('categoryForm').addEventListener('submit', (e) => { e.preventDefault(); this.saveCategory(); });
        document.getElementById('setBudgetBtn').addEventListener('click', () => this.openBudgetModal());
        document.getElementById('closeBudgetModal').addEventListener('click', () => this.closeBudgetModal());
        document.getElementById('cancelBudget').addEventListener('click', () => this.closeBudgetModal());
        document.getElementById('budgetForm').addEventListener('submit', (e) => { e.preventDefault(); this.saveBudget(); });
        document.getElementById('searchTransactions').addEventListener('input', () => this.filterTransactions());
        document.getElementById('filterBtn').addEventListener('click', () => this.toggleFilterPanel());
        document.getElementById('applyFilters').addEventListener('click', () => this.applyFilters());
        document.getElementById('clearFilters').addEventListener('click', () => this.clearFilters());
        document.getElementById('themeSelect').addEventListener('change', (e) => this.updateSetting('theme', e.target.value).then(() => this.applyTheme()));
        document.getElementById('languageSelect').addEventListener('change', (e) => this.updateSetting('language', e.target.value).then(() => this.updateLanguage()));
        document.getElementById('dailyReminder').addEventListener('change', (e) => this.updateSetting('dailyReminder', e.target.checked));
        document.getElementById('exportCsvBtn').addEventListener('click', () => this.exportCSV());
        document.getElementById('exportJsonBtn').addEventListener('click', () => this.exportJSON());
        document.getElementById('importJsonBtn').addEventListener('click', () => document.getElementById('importFileInput').click());
        document.getElementById('importFileInput').addEventListener('change', (e) => this.importJSON(e.target.files[0]));
        document.getElementById('clearDataBtn').addEventListener('click', () => this.clearAllData());
        document.getElementById('exportPdfBtn').addEventListener('click', () => this.openPdfExportModal());
        document.getElementById('closePdfExportModal').addEventListener('click', () => this.closePdfExportModal());
        document.getElementById('cancelPdfExport').addEventListener('click', () => this.closePdfExportModal());
        document.getElementById('pdfExportForm').addEventListener('submit', (e) => { e.preventDefault(); this.generatePDFReport(); });
        document.getElementById('getCurrentLocation').addEventListener('click', () => this.getCurrentLocation());
        document.getElementById('locationTracking').addEventListener('change', (e) => this.updateSetting('locationTracking', e.target.checked));
        document.getElementById('autoCategorize').addEventListener('change', (e) => this.updateSetting('autoCategorize', e.target.checked));
        document.getElementById('chartTimeRange').addEventListener('change', (e) => { this.selectedTimeRange = parseInt(e.target.value); this.renderCharts(); });
        document.getElementById('viewAllTransactions').addEventListener('click', () => this.switchTab('transactions'));
        document.addEventListener('click', (e) => { if (e.target.classList.contains('modal')) this.closeAllModals(); });
        document.getElementById('getAISuggestionsBtn').addEventListener('click', () => this.openAISuggestionsModal());
        document.getElementById('closeAiSuggestionsModal').addEventListener('click', () => this.closeAISuggestionsModal());
        document.getElementById('closeAiSuggestionsModalBtn').addEventListener('click', () => this.closeAISuggestionsModal());
        document.getElementById('recalculateAiSuggestions').addEventListener('click', () => this.runAISuggestions());
        document.getElementById('copyAiSuggestions').addEventListener('click', () => this.copyAISuggestions());
        document.querySelectorAll('.period-chip').forEach(c => c.addEventListener('click', (e) => {
            document.querySelectorAll('.period-chip').forEach(i => i.classList.remove('active'));
            e.target.classList.add('active');
            this.runAISuggestions();
        }));
        document.getElementById('budgetAlertThreshold').addEventListener('change', (e) => {
            this.updateSetting('budgetAlertThreshold', parseInt(e.target.value));
            this.showToast('Budget alert threshold updated!', 'success');
        });
        document.getElementById('budgetAlertOK').addEventListener('click', () => this.closeBudgetAlertModal());
        document.getElementById('voiceInputBtn').addEventListener('click', () => this.startVoiceRecognition());
        document.getElementById('removeReceiptBtn').addEventListener('click', () => this.removeReceiptPreview());
        document.getElementById('transactionReceipt').addEventListener('change', (e) => this.handleReceiptUpload(e.target.files[0]));
        
        // NEW LISTENERS
        document.querySelectorAll('.bottom-nav-btn').forEach(btn => btn.addEventListener('click', (e) => this.switchTab(e.currentTarget.dataset.tab)));
        document.getElementById('logoutBtn')?.addEventListener('click', () => this.logoutUser());
        document.getElementById('restoreDataBtn')?.addEventListener('click', () => this.handleRestoreData());

        // Category icon picker listeners
        document.querySelector('.default-icons').addEventListener('click', (e) => {
            if (e.target.classList.contains('icon-option')) {
                this.selectDefaultIcon(e.target.dataset.icon);
                document.querySelectorAll('.icon-option').forEach(el => el.classList.remove('active'));
                e.target.classList.add('active');
            }
        });
        document.getElementById('categoryIconUpload').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.handleCustomIconUpload(file);
            }
        });

        // Image Modal Listeners
        document.getElementById('closeImageModal').addEventListener('click', () => this.closeImageModal());
        document.getElementById('imageModal').addEventListener('click', (e) => {
            if (e.target.id === 'imageModal') { // Only close if background is clicked
                this.closeImageModal();
            }
        });
    }
    
    // Keyboard Shortcuts
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 'n': e.preventDefault(); this.openTransactionModal(); break;
                    case 'e': e.preventDefault(); this.exportCSV(); break;
                    case 'i': e.preventDefault(); document.getElementById('importFileInput').click(); break;
                }
            } else if (e.key === 'Escape') this.closeAllModals();
        });
    }
    
    // Tab Management
    switchTab(tabName) {
        // Update both top and bottom nav buttons
        document.querySelectorAll('.nav-btn, .bottom-nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        
        document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === tabName));
        
        if (tabName === 'charts') this.renderCharts();
        if (tabName === 'transactions') {
            this.populateMonthFilter();
            this.updateFilterView();
            this.renderRecurringTransactions();
        }
    }
    
    // Theme Management
    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        this.setTheme(current === 'dark' ? 'light' : 'dark');
    }
    
    async setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        await this.updateSetting('theme', theme);
    }
    
    applyTheme() {
        const theme = this.data.settings.theme;
        if (theme === 'auto') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
        document.getElementById('themeSelect').value = theme;
    }
    
    // Language Management
    async toggleLanguage() {
        const newLang = this.data.settings.language === 'en' ? 'te' : 'en';
        await this.updateSetting('language', newLang);
        this.updateLanguage();
    }
    
    updateLanguage() {
        const lang = this.data.settings.language;
        document.getElementById('languageSelect').value = lang;
        const dict = this.translations[lang] || this.translations['en'];
        
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dict[key]) el.textContent = dict[key];
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (dict[key]) el.placeholder = dict[key];
        });
    }
    
    // Translation Dictionary
    translations = {
        en: { app_title: 'Budget Tracker', nav_dashboard: 'Dashboard', nav_transactions: 'Transactions', nav_categories: 'Categories', nav_charts: 'Charts', nav_settings: 'Settings', total_income: 'Total Income', total_expenses: 'Total Expenses', current_balance: 'Current Balance', budget_limits: 'Budget Limits', set_budget: 'Set Budget', no_budget_set: 'No budget limits set', quick_stats: 'Quick Stats', this_month: 'This Month', avg_daily: 'Daily Average', top_category: 'Top Category', recent_transactions: 'Recent Transactions', view_all: 'View All', no_transactions: 'No transactions yet. Add your first transaction!', monthly_view: 'Monthly View', monthly_income: 'Monthly Income', monthly_expenses: 'Monthly Expenses', monthly_balance: 'Net Balance', category_summary: 'Category Summary', daily_totals: 'Daily Totals', search_placeholder: 'Search transactions...', filter_category: 'Category:', all_categories: 'All Categories', filter_date_from: 'From:', filter_date_to: 'To:', clear_filters: 'Clear', apply_filters: 'Apply', manage_categories: 'Manage Categories', add_category: 'Add Category', no_categories: 'No categories yet. Create your first category!', time_range: 'Time Range:', last_7_days: 'Last 7 Days', last_30_days: 'Last 30 Days', last_3_months: 'Last 3 Months', last_year: 'Last Year', chart_month_filter: 'Month:', expense_distribution: 'Expense Distribution', category_spending: 'Category Spending', monthly_summary: 'Monthly Summary', spending_trends: 'Spending Trends', daily_expenses: 'Daily Expenses', appearance: 'Appearance', theme: 'Theme:', theme_auto: 'Auto', theme_light: 'Light', theme_dark: 'Dark', language: 'Language:', preferences: 'Preferences', daily_reminder: 'Daily Reminder:', location_tracking: 'Location Tracking:', auto_categorize: 'Auto Categorize:', data_management: 'Data Management', export_csv: 'Export CSV', export_json: 'Export JSON', export_pdf: 'Export PDF', import_json: 'Import JSON', clear_data: 'Clear All Data', about: 'About', version: 'Version:', install_date: 'Install Date:', total_transactions: 'Total Transactions:', add_transaction: 'Add Transaction', description: 'Description:', amount: 'Amount:', type: 'Type:', expense: 'Expense', income: 'Income', category: 'Category:', date: 'Date:', notes: 'Notes:', receipt: 'Receipt:', location: 'Location:', get_location: 'Get Current Location', cancel: 'Cancel', save: 'Save', name: 'Name:', icon: 'Icon:', color: 'Color:', budget_amount: 'Budget Amount:', period: 'Period:', monthly: 'Monthly', weekly: 'Weekly', yearly: 'Yearly', ai_suggestions_btn: 'AI Suggestions', ai_suggestions_title: 'AI Suggestions', this_month_chip: 'This Month', last_month_chip: 'Last Month', last_3_months_chip: 'Last 3 Months', recalculate: 'Recalculate', copy_tips: 'Copy Tips', close: 'Close'},
        te: { app_title: 'బడ్జెట్ ట్రాకర్', nav_dashboard: 'డాష్‌బోర్డ్', nav_transactions: 'లావాదేవీలు', nav_categories: 'వర్గాలు', nav_charts: 'చార్టులు', nav_settings: 'సెట్టింగులు', total_income: 'మొత్తం ఆదాయం', total_expenses: 'మొత్తం ఖర్చులు', current_balance: 'ప్రస్తుత బ్యాలెన్స్', budget_limits: 'బడ్జెట్ పరిమితులు', set_budget: 'బడ్జెట్ సెట్ చేయండి', no_budget_set: 'బడ్జెట్ పరిమితులు సెట్ చేయలేదు', quick_stats: 'త్వరిత గణాంకాలు', this_month: 'ఈ నెల', avg_daily: 'రోజువారీ సగటు', top_category: 'టాప్ కేటగరీ', recent_transactions: 'ఇటీవలి లావాదేవీలు', view_all: 'అన్నీ చూడండి', no_transactions: 'ఇంకా లావాదేవీలు లేవు. మీ మొదటి లావాదేవీని జోడించండి!', search_placeholder: 'లావాదేవీలను వెతకండి...', filter_category: 'వర్గం:', all_categories: 'అన్ని వర్గాలు', filter_date_from: 'నుంచి:', filter_date_to: 'వరకు:', clear_filters: 'క్లియర్', apply_filters: 'వర్తింపజేయండి', manage_categories: 'వర్గాలను నిర్వహించండి', add_category: 'వర్గం జోడించండి', no_categories: 'ఇంకా వర్గాలు లేవు. మీ మొదటి వర్గాన్ని సృష్టించండి!', appearance: 'రూపం', theme: 'థీమ్:', theme_auto: 'ఆటో', theme_light: 'లైట్', theme_dark: 'డార్క్', language: 'భాష:', add_transaction: 'లావాదేవీ జోడించండి', description: 'వివరణ:', amount: 'మొత్తం:', type: 'రకం:', expense: 'ఖర్చు', income: 'ఆదాయం', category: 'వర్గం:', date: 'తేదీ:', notes: 'గమనికలు:', cancel: 'రద్దు', save: 'సేవ్', ai_suggestions_btn: 'AI సూచనలు', ai_suggestions_title: 'AI సూచనలు', this_month_chip: 'ఈ నెల', last_month_chip: 'గత నెల', last_3_months_chip: 'గత 3 నెలలు', recalculate: 'మళ్లీ లెక్కించు', copy_tips: 'చిట్కాలను కాపీ చేయండి', close: 'మూసివేయండి' }
    };
    
    // Transaction Management
    openTransactionModal(transaction = null) {
        this.compressedReceiptBlob = null; // Reset any staged receipt
        document.getElementById('transactionForm').reset();
        document.getElementById('transactionModal').classList.add('active');
        this.populateTransactionCategories();
        
        if (transaction) {
            // Editing existing transaction
            document.getElementById('transactionId').value = transaction.id;
            document.getElementById('transactionDescription').value = transaction.description;
            document.getElementById('transactionAmount').value = transaction.amount;
            document.getElementById('transactionType').value = transaction.type;
            document.getElementById('transactionDate').value = transaction.date;
            document.getElementById('transactionNotes').value = transaction.notes || '';
            document.getElementById('transactionLocation').value = transaction.location || '';
            document.getElementById('transactionFrequency').value = transaction.frequency || 'none';
            
            this.populateTransactionCategories();
            document.getElementById('transactionCategory').value = transaction.category;
            
            // Handle receipt display
            this.displayReceiptPreview(transaction.receiptId);
        } else {
            // Adding new transaction
            document.getElementById('transactionDate').value = new Date().toISOString().split('T')[0];
            document.getElementById('transactionFrequency').value = 'none';
            this.displayReceiptPreview(null);
        }
    }
    
    closeTransactionModal() {
        this.compressedReceiptBlob = null; // Reset any staged receipt
        const previewImage = document.getElementById('receiptPreviewImage');
        if (previewImage.src) URL.revokeObjectURL(previewImage.src);
        document.getElementById('transactionModal').classList.remove('active');
        document.getElementById('transactionForm').reset();
    }
    
    populateTransactionCategories() {
        const select = document.getElementById('transactionCategory');
        const type = document.getElementById('transactionType').value;
        select.innerHTML = '';
        
        this.data.categories.filter(c => c.type === type).forEach(c => {
            const option = document.createElement('option');
            option.value = c.id;
            const isCustomIcon = c.icon && c.icon.startsWith('data:image');
            const iconDisplay = !isCustomIcon && c.icon ? `${c.icon} ` : '';
            option.textContent = `${iconDisplay}${c.name}`;
            select.appendChild(option);
        });
        
        document.getElementById('transactionType').removeEventListener('change', this.populateTransactionCategories.bind(this));
        document.getElementById('transactionType').addEventListener('change', this.populateTransactionCategories.bind(this));
    }
    
    async saveTransaction() {
        const id = document.getElementById('transactionId').value;
    
        let transactionData = {
            id: id || this.generateId(),
            description: document.getElementById('transactionDescription').value,
            amount: parseFloat(document.getElementById('transactionAmount').value),
            type: document.getElementById('transactionType').value,
            category: document.getElementById('transactionCategory').value,
            date: document.getElementById('transactionDate').value,
            notes: document.getElementById('transactionNotes').value || '',
            location: document.getElementById('transactionLocation').value || '',
            frequency: document.getElementById('transactionFrequency').value,
            receiptId: document.getElementById('transactionReceiptId').value || null,
            timestamp: new Date().toISOString()
        };
    
        const isReceiptRemoved = document.getElementById('isReceiptRemoved').value === '1';
        const oldReceiptId = id ? (this.data.transactions.find(t => t.id === id)?.receiptId) : null;
    
        // Handle receipt removal
        if (isReceiptRemoved && oldReceiptId) {
            await this.dataStore.delete('receipts', oldReceiptId);
            transactionData.receiptId = null;
        }
    
        // Handle new/updated receipt from the compressed blob
        if (this.compressedReceiptBlob) {
            if (oldReceiptId) { // If editing and replacing an old receipt
                await this.dataStore.delete('receipts', oldReceiptId);
            }
            const newReceiptId = this.generateId();
            // Save the compressed blob from the staging property
            await this.dataStore.put('receipts', { id: newReceiptId, image: this.compressedReceiptBlob });
            transactionData.receiptId = newReceiptId;
        }
        
        // Handle recurring logic
        if (transactionData.frequency !== 'none') {
            transactionData.isRecurring = true;
            const originalDate = id ? (this.data.transactions.find(t => t.id === id)?.originalDate) : transactionData.date;
            transactionData.originalDate = originalDate;
            transactionData.nextDueDate = this.calculateNextDueDate(transactionData.date, transactionData.frequency, originalDate);
            transactionData.recurringStatus = transactionData.recurringStatus || 'active';
        } else {
            delete transactionData.isRecurring;
            delete transactionData.originalDate;
            delete transactionData.nextDueDate;
            delete transactionData.recurringStatus;
        }
        
        // --- MODIFIED SAVING LOGIC ---
        if (this.user) { // User is logged in
            if (navigator.onLine) {
                // Online: Save to Firebase RTDB
                try {
                    await set(ref(this.database, `users/${this.user.uid}/transactions/${transactionData.id}`), transactionData);
                    this.showToast('Transaction saved and synced!', 'success');
                } catch (error) {
                    console.error("Firebase save error:", error);
                    this.showToast("Couldn't sync to cloud, saved locally.", "warning");
                    transactionData.needsSync = true; // Mark for sync if Firebase fails
                }
            } else {
                // Offline: Mark for later sync
                transactionData.needsSync = true;
                this.showToast("You're offline. Transaction saved locally.", "info");
            }
        }
        // Guest users or logged-in users (online/offline) will always save to IndexedDB
        await this.dataStore.put('transactions', transactionData);
        // --- END MODIFIED LOGIC ---

        // Update in-memory state
        const index = this.data.transactions.findIndex(t => t.id === transactionData.id);
        if (index > -1) {
            this.data.transactions[index] = transactionData;
        } else {
            this.data.transactions.push(transactionData);
        }
        
        this.checkBudgetAlerts();
        this.updateDashboard();
        this.updateFilterView();
        this.renderCharts();
        this.closeTransactionModal();
        this.populateMonthFilter();
    }

    /**
     * Finds transactions in IndexedDB that need syncing and uploads them to Firebase.
     */
    async syncOfflineTransactions() {
        if (!this.user || !navigator.onLine) {
            return; // Only sync if logged in and online
        }
    
        const allTransactions = await this.dataStore.getAll('transactions');
        const transactionsToSync = allTransactions.filter(t => t.needsSync);
    
        if (transactionsToSync.length === 0) {
            return; // Nothing to sync
        }
    
        this.showToast(`Syncing ${transactionsToSync.length} offline transaction(s)...`, 'info');
    
        let successCount = 0;
        for (const tx of transactionsToSync) {
            try {
                const txDataToSync = { ...tx };
                delete txDataToSync.needsSync; // Don't save the sync flag to Firebase
    
                await set(ref(this.database, `users/${this.user.uid}/transactions/${tx.id}`), txDataToSync);
    
                // If successful, update the local record in IndexedDB to remove the flag
                delete tx.needsSync;
                await this.dataStore.put('transactions', tx);
                successCount++;
            } catch (error) {
                console.error(`Failed to sync transaction ${tx.id}:`, error);
            }
        }
    
        if (successCount > 0) {
            this.showToast(`Successfully synced ${successCount} transaction(s).`, 'success');
            // Reload local data to reflect synced state
            await this.loadData();
            this.updateDashboard();
            this.renderTransactions();
        }
    }
    
    deleteTransaction(transactionId) {
        const transaction = this.data.transactions.find(t => t.id === transactionId);
        if (!transaction) return;

        if (transaction.isRecurring) {
            this.showDeleteConfirmModal(
                'This is a recurring transaction template. Deleting it will stop all future automatic transactions. Past entries will not be affected. Continue?',
                () => this.stopRecurring(transactionId), null, 'Stop Recurring Transaction'
            );
        } else {
            this.showDeleteConfirmModal('Are you sure you want to delete this transaction?', async () => {
                if (transaction.receiptId) {
                    await this.dataStore.delete('receipts', transaction.receiptId);
                }
                await this.dataStore.delete('transactions', transactionId);
                this.data.transactions = this.data.transactions.filter(t => t.id !== transactionId);
                
                this.updateDashboard();
                this.updateFilterView();
                this.renderCharts();
                this.populateMonthFilter();
                this.showToast('Transaction deleted successfully!', 'success');
            });
        }
    }
    
    editTransaction(transactionId) {
        const transaction = this.data.transactions.find(t => t.id === transactionId);
        if (transaction) {
            this.openTransactionModal(transaction);
        }
    }
    
    // Category Management
    openCategoryModal(category = null) {
        document.getElementById('categoryForm').reset();
        document.getElementById('categoryModal').classList.add('active');
        
        // Reset the icon picker to its default state
        const defaultIcon = '🍕';
        this.selectDefaultIcon(defaultIcon);
        document.querySelectorAll('.icon-option').forEach(el => el.classList.remove('active'));
        const defaultIconEl = document.querySelector(`.icon-option[data-icon="${defaultIcon}"]`);
        if(defaultIconEl) defaultIconEl.classList.add('active');
    
        if (category) {
            document.getElementById('categoryId').value = category.id;
            document.getElementById('categoryName').value = category.name;
            document.getElementById('categoryColor').value = category.color;
            document.getElementById('categoryType').value = category.type;
    
            // Set the icon picker's state based on the saved category icon
            if (category.icon && category.icon.startsWith('data:image')) {
                // It's a custom uploaded icon
                document.getElementById('iconPreviewImg').src = category.icon;
                document.getElementById('iconPreviewImg').style.display = 'inline-block';
                document.getElementById('iconPreviewEmoji').style.display = 'none';
                document.getElementById('categoryIcon').value = category.icon;
                document.querySelectorAll('.icon-option').forEach(el => el.classList.remove('active'));
            } else {
                // It's an emoji
                const icon = category.icon || defaultIcon; // Fallback to a default emoji
                this.selectDefaultIcon(icon);
                document.querySelectorAll('.icon-option').forEach(el => el.classList.remove('active'));
                const currentIconEl = document.querySelector(`.icon-option[data-icon="${icon}"]`);
                if (currentIconEl) {
                    currentIconEl.classList.add('active');
                }
            }
        } else {
            // Default settings for a new category
            document.getElementById('categoryColor').value = '#2196F3';
        }
    }
    
    closeCategoryModal() {
        document.getElementById('categoryModal').classList.remove('active');
        document.getElementById('categoryForm').reset();
    }
    
    async saveCategory() {
        const id = document.getElementById('categoryId').value;
        const category = {
            id: id || this.generateId(),
            name: document.getElementById('categoryName').value,
            icon: document.getElementById('categoryIcon').value || '📝',
            color: document.getElementById('categoryColor').value,
            type: document.getElementById('categoryType').value
        };
        
        await this.dataStore.put('categories', category);
        const index = this.data.categories.findIndex(c => c.id === category.id);
        if (index > -1) {
            this.data.categories[index] = category;
        } else {
            this.data.categories.push(category);
        }
        
        this.renderCategories();
        this.closeCategoryModal();
        this.showToast('Category saved successfully!', 'success');
    }
    
    deleteCategory(categoryId) {
        if (this.data.transactions.some(t => t.category === categoryId)) {
            return this.showToast('Cannot delete category with transactions.', 'error');
        }
        
        this.showDeleteConfirmModal('Are you sure you want to delete this category?', async () => {
            await this.dataStore.delete('categories', categoryId);
            this.data.categories = this.data.categories.filter(c => c.id !== categoryId);
            
            // Also delete associated budgets
            const budgetsToDelete = this.data.budgets.filter(b => b.categoryId === categoryId);
            await Promise.all(budgetsToDelete.map(b => this.dataStore.delete('budgets', b.id)));
            this.data.budgets = this.data.budgets.filter(b => b.categoryId !== categoryId);

            this.renderCategories();
            this.updateDashboard();
            this.showToast('Category deleted successfully!', 'success');
        });
    }
    
    editCategory(categoryId) {
        const category = this.data.categories.find(c => c.id === categoryId);
        if (category) {
            this.openCategoryModal(category);
        }
    }
    
    // Budget Management
    openBudgetModal(budget = null) {
        document.getElementById('budgetForm').reset();
        document.getElementById('budgetModal').classList.add('active');
        this.populateBudgetCategories();
        
        if (budget) {
            document.getElementById('budgetId').value = budget.id;
            document.getElementById('budgetCategory').value = budget.categoryId;
            document.getElementById('budgetAmount').value = budget.amount;
            document.getElementById('budgetPeriod').value = budget.period;
            document.getElementById('budgetModal').querySelector('.modal-title').textContent = 'Edit Budget';
        } else {
            document.getElementById('budgetModal').querySelector('.modal-title').textContent = 'Set Budget';
        }
    }
    
    closeBudgetModal() {
        document.getElementById('budgetModal').classList.remove('active');
        document.getElementById('budgetForm').reset();
    }
    
    populateBudgetCategories() {
        const select = document.getElementById('budgetCategory');
        select.innerHTML = '';
        this.data.categories.filter(c => c.type === 'expense').forEach(c => {
            const option = document.createElement('option');
            option.value = c.id;
            const isCustomIcon = c.icon && c.icon.startsWith('data:image');
            const iconDisplay = !isCustomIcon && c.icon ? `${c.icon} ` : '';
            option.textContent = `${iconDisplay}${c.name}`;
            select.appendChild(option);
        });
    }
    
    async saveBudget() {
        const id = document.getElementById('budgetId').value;
        const budget = {
            id: id || this.generateId(),
            categoryId: document.getElementById('budgetCategory').value,
            amount: parseFloat(document.getElementById('budgetAmount').value),
            period: document.getElementById('budgetPeriod').value,
            createdAt: new Date().toISOString()
        };

        await this.dataStore.put('budgets', budget);
        const index = this.data.budgets.findIndex(b => b.id === budget.id);
        if (index > -1) {
            this.data.budgets[index] = budget;
        } else {
            this.data.budgets.push(budget);
        }

        this.updateDashboard();
        this.closeBudgetModal();
        this.showToast('Budget saved successfully!', 'success');
    }
    
    editBudget(budgetId) {
        const budget = this.data.budgets.find(b => b.id === budgetId);
        if (budget) {
            this.openBudgetModal(budget);
        }
    }

    deleteBudget(budgetId) {
        this.showDeleteConfirmModal('Are you sure you want to delete this budget?', async () => {
            await this.dataStore.delete('budgets', budgetId);
            this.data.budgets = this.data.budgets.filter(b => b.id !== budgetId);
            this.updateDashboard();
            this.showToast('Budget deleted successfully!', 'success');
        });
    }
    
    // Dashboard Updates
    updateDashboard() {
        this.updateBalanceCards();
        this.updateFutureExpenseAnalysis();
        this.updateBudgetProgress();
        this.updateQuickStats();
        this.updateRecentTransactions();
    }
    
    updateBalanceCards() {
        const income = this.data.transactions.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0);
        const expenses = this.data.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);
        document.getElementById('totalIncome').textContent = this.formatCurrency(income);
        document.getElementById('totalExpenses').textContent = this.formatCurrency(expenses);
        document.getElementById('currentBalance').textContent = this.formatCurrency(income - expenses);
    }

    updateFutureExpenseAnalysis() {
        const today = new Date();
        const year = today.getFullYear(), month = today.getMonth(), day = today.getDate();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const expenses = this.data.transactions.filter(t => {
            const d = new Date(t.date);
            return t.type === 'expense' && d.getFullYear() === year && d.getMonth() === month;
        });

        const spent = expenses.reduce((s, t) => s + parseFloat(t.amount), 0);
        const avgDaily = day > 0 ? spent / day : 0;
        const projected = spent + (avgDaily * (daysInMonth - day));
        const budget = this.data.budgets.filter(b => b.period === 'monthly').reduce((s, b) => s + parseFloat(b.amount), 0);
            
        document.getElementById('analysisBudget').textContent = this.formatCurrency(budget);
        document.getElementById('analysisSpent').textContent = this.formatCurrency(spent);
        const projectedEl = document.getElementById('analysisProjected');
        projectedEl.textContent = this.formatCurrency(projected);
        projectedEl.className = (budget > 0 && projected > budget) ? 'projected-exceeded' : 'projected-safe';

        this.renderFutureExpenseChart(spent, projected, budget);
    }

    renderFutureExpenseChart(spent, projected, budget) {
        const ctx = document.getElementById('futureExpenseChart');
        if (!ctx) return;
        if (this.charts.futureExpenseAnalysis) this.charts.futureExpenseAnalysis.destroy();

        const isExceeded = budget > 0 && projected > budget;
        this.charts.futureExpenseAnalysis = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Spent', 'Projected Total', 'Budget'],
                datasets: [{
                    label: 'Amount',
                    data: [spent, projected, budget],
                    backgroundColor: ['rgba(54, 162, 235, 0.6)', isExceeded ? 'rgba(255, 99, 132, 0.6)' : 'rgba(75, 192, 192, 0.6)', 'rgba(201, 203, 207, 0.6)'],
                    borderColor: ['rgb(54, 162, 235)', isExceeded ? 'rgb(255, 99, 132)' : 'rgb(75, 192, 192)', 'rgb(201, 203, 207)'],
                    borderWidth: 1
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => this.formatCurrency(v).replace(/[^0-9.-]+/g, "") } } } }
        });
    }
    
    updateBudgetProgress() {
        const container = document.getElementById('budgetProgress');
        if (!this.data.budgets || this.data.budgets.length === 0) {
            container.innerHTML = `<p data-i18n="no_budget_set">${this.translations[this.data.settings.language].no_budget_set || 'No budget limits set'}</p>`;
            return;
        }
        
        container.innerHTML = '';
        this.data.budgets.forEach(b => {
            const category = this.data.categories.find(c => c.id === b.categoryId);
            if (!category) return;
            
            const { start, end } = this.getPeriodDates(b.period);
            const spent = this.data.transactions
                .filter(t => t.category === b.categoryId && t.type === 'expense' && new Date(t.date) >= start && new Date(t.date) < end)
                .reduce((s, t) => s + parseFloat(t.amount), 0);
            
            const perc = b.amount > 0 ? (spent / b.amount) * 100 : 0;
            let pClass = 'budget-progress-fill';
            if (perc >= 100) pClass += ' danger'; else if (perc > 75) pClass += ' warning';
            
            const item = document.createElement('div');
            item.className = 'budget-item';
            const iconHtml = this.getCategoryIconHtml(category);
            item.innerHTML = `
                <div class="budget-info">
                    <div class="budget-item-header">
                        <span>${iconHtml} ${category.name}</span>
                        <span class="budget-period-tag ${b.period}">${b.period}</span>
                    </div>
                    <div class="budget-bar"><div class="${pClass}" style="width: ${Math.min(perc, 100)}%"></div></div>
                    <div class="budget-amount-details"><span>${this.formatCurrency(spent)} / ${this.formatCurrency(b.amount)}</span></div>
                </div>
                <div class="budget-actions">
                    <button class="icon-btn" onclick="app.editBudget('${b.id}')" title="Edit">✏️</button>
                    <button class="icon-btn" onclick="app.deleteBudget('${b.id}')" title="Delete">🗑️</button>
                </div>`;
            container.appendChild(item);
        });
    }

    getPeriodDates(period) {
        const today = new Date();
        let start, end;
        today.setHours(0, 0, 0, 0);

        switch (period) {
            case 'weekly':
                start = new Date(today);
                start.setDate(today.getDate() - today.getDay());
                end = new Date(start);
                end.setDate(start.getDate() + 7);
                break;
            case 'yearly':
                start = new Date(today.getFullYear(), 0, 1);
                end = new Date(today.getFullYear() + 1, 0, 1);
                break;
            default: // monthly
                start = new Date(today.getFullYear(), today.getMonth(), 1);
                end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
                break;
        }
        return { start, end };
    }
    
    updateQuickStats() {
        const now = new Date();
        const monthly = this.data.transactions.filter(t => {
            const d = new Date(t.date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
        
        const expenses = monthly.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);
        const dailyAvg = monthly.length > 0 ? expenses / now.getDate() : 0;
        
        const catTotals = monthly.filter(t => t.type === 'expense').reduce((totals, t) => {
            totals[t.category] = (totals[t.category] || 0) + parseFloat(t.amount);
            return totals;
        }, {});
        
        const topCatId = Object.keys(catTotals).reduce((a, b) => catTotals[a] > catTotals[b] ? a : b, '');
        
        document.getElementById('thisMonthExpenses').textContent = this.formatCurrency(expenses);
        document.getElementById('dailyAverage').textContent = this.formatCurrency(dailyAvg);
        document.getElementById('topCategory').textContent = topCatId ? this.getCategoryName(topCatId) : 'None';
    }
    
    updateRecentTransactions() {
        const container = document.getElementById('recentTransactionsList');
        const recent = [...this.data.transactions]
            .filter(t => !t.isRecurring)
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 5);
            
        if (recent.length === 0) {
            container.innerHTML = `<div class="empty-state"><p data-i18n="no_transactions">${this.translations[this.data.settings.language].no_transactions || 'No transactions yet.'}</p></div>`;
            return;
        }
        
        container.innerHTML = recent.map(t => {
            const category = this.data.categories.find(c => c.id === t.category);
            const iconHtml = this.getCategoryIconHtml(category);
            return `
                <div class="transaction-item">
                    <div class="transaction-icon" style="background-color: ${category?.color}20; color: ${category?.color};">${iconHtml}</div>
                    <div class="transaction-info">
                        <div class="transaction-title">${t.description}</div>
                        <div class="transaction-details">${new Date(t.date + 'T00:00:00').toLocaleDateString()} • ${category?.name || 'Unknown'}</div>
                        ${t.receiptId ? `<img class="transaction-receipt-thumbnail" data-receipt-id="${t.receiptId}" alt="Receipt">` : ''}
                    </div>
                    <div class="transaction-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${this.formatCurrency(t.amount)}</div>
                    <div class="transaction-actions">
                        <button class="icon-btn" onclick="app.editTransaction('${t.id}')" title="Edit">✏️</button>
                        <button class="icon-btn" onclick="app.deleteTransaction('${t.id}')" title="Delete">🗑️</button>
                    </div>
                </div>`;
        }).join('');
        this.populateReceiptImages(container);
    }
    
    // Render Functions
    renderTransactions(transactionsToRender = null) {
        const container = document.getElementById('transactionsList');
        const allNonRecurring = this.data.transactions.filter(t => !t.isRecurring);
        const transactions = (transactionsToRender ? transactionsToRender.filter(t => !t.isRecurring) : allNonRecurring)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        
        if (transactions.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No transactions found for this period</p></div>';
            return;
        }
        
        container.innerHTML = transactions.map(t => {
            const category = this.data.categories.find(c => c.id === t.category);
            const iconHtml = this.getCategoryIconHtml(category);
            return `
                <div class="transaction-item">
                    <div class="transaction-icon" style="background-color: ${category?.color}20; color: ${category?.color};">${iconHtml}</div>
                    <div class="transaction-info">
                        <div class="transaction-title">${t.description}</div>
                        <div class="transaction-details">${new Date(t.date + 'T00:00:00').toLocaleDateString()} • ${category?.name || 'Unknown'}</div>
                        ${t.receiptId ? `<img class="transaction-receipt-thumbnail" data-receipt-id="${t.receiptId}" alt="Receipt">` : ''}
                    </div>
                    <div class="transaction-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${this.formatCurrency(t.amount)}</div>
                    <div class="transaction-actions">
                        <button class="icon-btn" onclick="app.editTransaction('${t.id}')" title="Edit">✏️</button>
                        <button class="icon-btn" onclick="app.deleteTransaction('${t.id}')" title="Delete">🗑️</button>
                    </div>
                </div>`;
        }).join('');
        this.populateReceiptImages(container);
    }

    async populateReceiptImages(container) {
        const images = container.querySelectorAll('img[data-receipt-id]');
        for (const img of images) {
            const id = img.dataset.receiptId;
            if (id) {
                try {
                    const record = await this.dataStore.get('receipts', id);
                    if (record && record.image) {
                        img.src = URL.createObjectURL(record.image);
                        img.onclick = () => this.openImageModal(img.src);
                    }
                } catch (error) {
                    console.error("Could not load receipt image:", error);
                }
            }
        }
    }
    
    renderCategories() {
        const container = document.getElementById('categoriesGrid');
        
        if (this.data.categories.length === 0) {
            container.innerHTML = `<div class="empty-state"><p data-i18n="no_categories">${this.translations[this.data.settings.language].no_categories || 'No categories yet.'}</p></div>`;
            return;
        }
        
        this.renderMonthlySpendingOverview('lastSix');
        container.innerHTML = this.data.categories.map(c => {
            const tx = this.data.transactions.filter(t => t.category === c.id);
            const total = tx.reduce((s, t) => s + parseFloat(t.amount), 0);
            const iconHtml = this.getCategoryIconHtml(c);

            return `
                <div class="category-card">
                    <div class="category-icon" style="background-color: ${c.color}20; color: ${c.color};">${iconHtml}</div>
                    <div class="category-info">
                        <h3>${c.name}</h3>
                        <div class="category-details">${c.type} • ${tx.length} transactions</div>
                        <div class="category-total" style="font-weight: 600; color: ${c.type === 'expense' ? 'var(--danger-color)' : 'var(--success-color)'}; margin-top: 0.25rem;">
                            Total: ${c.type === 'expense' ? '-' : '+'}${this.formatCurrency(total)}
                        </div>
                    </div>
                    <div class="category-actions">
                        <button class="icon-btn" onclick="app.editCategory('${c.id}')" title="Edit">✏️</button>
                        <button class="icon-btn" onclick="app.deleteCategory('${c.id}')" title="Delete">🗑️</button>
                    </div>
                </div>`;
        }).join('');
    }
    
    toggleMonthlySpendingView(viewType) {
        document.getElementById('showLastSixMonthsBtn').classList.toggle('active', viewType === 'lastSix');
        document.getElementById('showAllMonthsBtn').classList.toggle('active', viewType !== 'lastSix');
        this.renderMonthlySpendingOverview(viewType);
    }
    
    renderMonthlySpendingOverview(viewType = 'lastSix') {
        const container = document.getElementById('monthlySpendingGrid');
        if (!container) return;
        
        const totals = this.data.transactions.reduce((acc, t) => {
            const d = new Date(t.date);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!acc[key]) acc[key] = { income: 0, expense: 0 };
            acc[key][t.type] += parseFloat(t.amount);
            return acc;
        }, {});
        
        let sorted = Object.keys(totals).sort().reverse();
        if (viewType === 'lastSix') sorted = sorted.slice(0, 6);
        if (sorted.length === 0) return container.innerHTML = '<div class="empty-state"><p>No transactions found</p></div>';
        
        container.innerHTML = sorted.map(key => {
            const data = totals[key];
            const [year, month] = key.split('-');
            const name = new Date(year, month - 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
            const net = data.income - data.expense;
            return `
                <div class="stat-card monthly-spending-card">
                    <div class="stat-icon" style="background-color: var(--primary-color)20; color: var(--primary-color);">📅</div>
                    <div class="stat-info">
                        <h4>${name}</h4>
                        <div class="monthly-breakdown" style="margin-top: 0.5rem;">
                            <div style="color: var(--success-color); font-size: 0.9rem;">Income: +${this.formatCurrency(data.income)}</div>
                            <div style="color: var(--danger-color); font-size: 0.9rem;">Expenses: -${this.formatCurrency(data.expense)}</div>
                            <div style="font-weight: 600; margin-top: 0.25rem; color: ${net >= 0 ? 'var(--success-color)' : 'var(--danger-color)'};">Net: ${net >= 0 ? '+' : ''}${this.formatCurrency(net)}</div>
                        </div>
                    </div>
                </div>`;
        }).join('');
    }
    
    // Charts
    renderCharts() {
        if (typeof Chart === 'undefined') return;
        this.renderPieChart(); this.renderCategoryBarChart(); this.renderBarChart();
        this.renderLineChart(); this.renderDailyExpensesChart();
    }
    
    renderPieChart() {
        const ctx = document.getElementById('pieChart');
        if (!ctx) return;
        if (this.charts.pie) this.charts.pie.destroy();
        
        const tx = this.getTransactionsForMonth(document.getElementById('chartMonthFilter')?.value || 'all').filter(t => t.type === 'expense');
        if (tx.length === 0) return ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
        
        const totals = tx.reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + parseFloat(t.amount); return acc; }, {});
        const labels = [], data = [], colors = [];
        Object.entries(totals).forEach(([id, total]) => {
            const cat = this.data.categories.find(c => c.id === id);
            if (cat) { labels.push(cat.name); data.push(total); colors.push(cat.color); }
        });
        
        this.charts.pie = new Chart(ctx, {
            type: 'pie', data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: colors.map(c => c + '80'), borderWidth: 2 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    }
    
    renderCategoryBarChart() {
        const ctx = document.getElementById('categoryBarChart');
        if (!ctx) return;
        if (this.charts.categoryBar) this.charts.categoryBar.destroy();
        
        const tx = this.getTransactionsForMonth(document.getElementById('chartMonthFilter')?.value || 'all');
        const totals = tx.reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + parseFloat(t.amount); return acc; }, {});
        const labels = [], data = [], colors = [];
        Object.entries(totals).forEach(([id, total]) => {
            const cat = this.data.categories.find(c => c.id === id);
            if (cat) { labels.push(cat.name); data.push(total); colors.push(cat.color); }
        });
        
        this.charts.categoryBar = new Chart(ctx, {
            type: 'bar', data: { labels, datasets: [{ label: 'Amount', data, backgroundColor: colors, borderColor: colors, borderWidth: 1 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });
    }
    
    renderBarChart() {
        const ctx = document.getElementById('barChart');
        if (!ctx) return;
        if (this.charts.bar) this.charts.bar.destroy();
        
        const labels = [], income = [], expenses = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(); d.setMonth(d.getMonth() - i);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const tx = this.getTransactionsForMonth(key);
            labels.push(d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
            income.push(tx.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0));
            expenses.push(tx.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0));
        }
        
        this.charts.bar = new Chart(ctx, {
            type: 'bar', data: { labels, datasets: [
                { label: 'Income', data: income, backgroundColor: '#4CAF50' },
                { label: 'Expenses', data: expenses, backgroundColor: '#F44336' }
            ]}, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    }
    
    renderLineChart() {
        const ctx = document.getElementById('lineChart');
        if (!ctx) return;
        if (this.charts.line) this.charts.line.destroy();
        
        const tx = this.getTransactionsForMonth(document.getElementById('chartMonthFilter')?.value || 'all');
        const totals = tx.filter(t => t.type === 'expense').reduce((acc, t) => { acc[t.date] = (acc[t.date] || 0) + parseFloat(t.amount); return acc; }, {});
        const sorted = Object.keys(totals).sort();
        const labels = [], data = []; let cum = 0;
        sorted.forEach(d => { cum += totals[d]; labels.push(new Date(d + 'T00:00:00').toLocaleDateString()); data.push(cum); });
        
        this.charts.line = new Chart(ctx, {
            type: 'line', data: { labels, datasets: [{ label: 'Cumulative Expenses', data, borderColor: '#2196F3', tension: 0.4, fill: false }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    }
    
    renderDailyExpensesChart() {
        const ctx = document.getElementById('dailyExpensesChart');
        if (!ctx) return;
        if (this.charts.dailyExpenses) this.charts.dailyExpenses.destroy();
        
        const tx = this.getTransactionsForMonth(document.getElementById('chartMonthFilter')?.value || 'all');
        const totals = tx.filter(t => t.type === 'expense').reduce((acc, t) => { acc[t.date] = (acc[t.date] || 0) + parseFloat(t.amount); return acc; }, {});
        const sorted = Object.keys(totals).sort();
        
        this.charts.dailyExpenses = new Chart(ctx, {
            type: 'line', data: { labels: sorted.map(d => new Date(d + 'T00:00:00').toLocaleDateString()), datasets: [{ label: 'Daily Expenses', data: sorted.map(d => totals[d]), borderColor: '#FF9800', tension: 0.4, fill: false }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    }
    
    // Filter and Search
    toggleFilterPanel() {
        const panel = document.getElementById('filterPanel');
        panel.classList.toggle('active');
        document.getElementById('filterBtn').classList.toggle('active');
        if (panel.classList.contains('active')) this.populateFilterCategories();
    }
    
    populateFilterCategories() {
        const select = document.getElementById('filterCategory');
        select.innerHTML = `<option value="">${this.translations[this.data.settings.language].all_categories || 'All Categories'}</option>`;
        this.data.categories.forEach(c => {
            const option = document.createElement('option');
            option.value = c.id;
            const isCustomIcon = c.icon && c.icon.startsWith('data:image');
            const iconDisplay = !isCustomIcon && c.icon ? `${c.icon} ` : '';
            option.textContent = `${iconDisplay}${c.name}`;
            select.appendChild(option);
        });
    }
    
    applyFilters() {
        const cat = document.getElementById('filterCategory').value;
        const from = document.getElementById('filterDateFrom').value;
        const to = document.getElementById('filterDateTo').value;
        let filtered = [...this.data.transactions];
        if (cat) filtered = filtered.filter(t => t.category === cat);
        if (from) filtered = filtered.filter(t => new Date(t.date) >= new Date(from));
        if (to) filtered = filtered.filter(t => new Date(t.date) <= new Date(to));
        this.renderTransactions(filtered);
        this.toggleFilterPanel();
    }
    
    clearFilters() {
        document.getElementById('filterCategory').value = '';
        document.getElementById('filterDateFrom').value = '';
        document.getElementById('filterDateTo').value = '';
        this.updateFilterView();
        this.toggleFilterPanel();
    }
    
    filterTransactions() {
        const query = document.getElementById('searchTransactions').value.toLowerCase();
        let base = (this.filterMode === 'monthly') ? this.getTransactionsForMonth(this.selectedMonth)
            : (this.filterMode === 'custom') ? this.getTransactionsForCustomRange()
            : this.data.transactions;
        
        if (!query) return this.renderTransactions(base);
        
        const filtered = base.filter(t => {
            const cat = this.data.categories.find(c => c.id === t.category);
            return t.description.toLowerCase().includes(query) ||
                   (cat && cat.name.toLowerCase().includes(query)) ||
                   (t.notes && t.notes.toLowerCase().includes(query));
        });
        this.renderTransactions(filtered);
    }
    
    // Export/Import Functions
    exportCSV() {
        if (this.data.transactions.length === 0) return this.showToast('No transactions to export.', 'info');
        
        const sorted = [...this.data.transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
        const headers = ['Date', 'Description', 'Category', 'Income', 'Expense'];
        const rows = [headers];
        let totalIncome = 0, totalExpenses = 0;

        sorted.forEach(t => {
            const cat = this.getCategoryName(t.category);
            const amt = parseFloat(t.amount);
            const row = [t.date, t.description, cat];
            if (t.type === 'income') {
                row.push(amt.toFixed(2), ''); totalIncome += amt;
            } else {
                row.push('', amt.toFixed(2)); totalExpenses += amt;
            }
            rows.push(row);
        });

        rows.push([], ['---','---','---','---','---'], ['Summary','','','Amount'], ['Total Income','','',totalIncome.toFixed(2)], ['Total Expenses','','','',totalExpenses.toFixed(2)], ['Net Balance','','',(totalIncome-totalExpenses).toFixed(2)]);
        const csv = rows.map(r => r.map(f => `"${String(f||'').replace(/"/g,'""')}"`).join(',')).join('\n');
        this.downloadFile(csv, 'budget-export.csv', 'text/csv');
        this.showToast('Data exported to CSV!', 'success');
    }
    
    exportJSON() {
        const dataToExport = {
            transactions: this.data.transactions,
            categories: this.data.categories,
            budgets: this.data.budgets,
            settings: this.data.settings
        };
        const data = { exportDate: new Date().toISOString(), version: '1.5.0', data: dataToExport };
        this.downloadFile(JSON.stringify(data, null, 2), 'budget-export.json', 'application/json');
        this.showToast('Data exported to JSON!', 'success');
    }
    
    importJSON(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (imported.data && imported.data.transactions && imported.data.categories) {
                    this.showDeleteConfirmModal('This will replace all current data. Continue?', async () => {
                        // Clear existing data
                        await Promise.all([
                            this.dataStore.clear('transactions'),
                            this.dataStore.clear('categories'),
                            this.dataStore.clear('budgets')
                        ]);

                        // Import new data
                        await Promise.all([
                            ...imported.data.transactions.map(item => this.dataStore.add('transactions', item)),
                            ...imported.data.categories.map(item => this.dataStore.add('categories', item)),
                            ...imported.data.budgets.map(item => this.dataStore.add('budgets', item)),
                            this.dataStore.put('settings', { key: 'main', ...imported.data.settings })
                        ]);
                        
                        this.showToast('Import successful! Reloading...', 'success');
                        setTimeout(() => location.reload(), 1500);
                    });
                } else this.showToast('Invalid file format!', 'error');
            } catch (error) { this.showToast('Error importing file!', 'error'); }
        };
        reader.readAsText(file);
    }
    
    openPdfExportModal() {
        document.getElementById('pdfExportModal').classList.add('active');
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        document.getElementById('pdfToDate').value = today.toISOString().split('T')[0];
        document.getElementById('pdfFromDate').value = firstDay.toISOString().split('T')[0];
    }

    closePdfExportModal() {
        document.getElementById('pdfExportModal').classList.remove('active');
        document.getElementById('pdfExportForm').reset();
    }
    
    async generatePDFReport() {
        const fromStr = document.getElementById('pdfFromDate').value;
        const toStr = document.getElementById('pdfToDate').value;
        if (!fromStr || !toStr) return this.showToast('Please select both dates', 'error');
        
        const from = new Date(fromStr), to = new Date(toStr); to.setHours(23,59,59,999);
        const tx = this.data.transactions.filter(t => {
            const d = new Date(t.date); return d >= from && d <= to;
        }).sort((a,b) => new Date(a.date) - new Date(b.date));
        if (tx.length === 0) return this.showToast('No transactions for period.', 'info');
        
        this.showToast('Generating PDF...', 'info'); this.closePdfExportModal();
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const income = tx.filter(t => t.type === 'income'), expenses = tx.filter(t => t.type === 'expense');
        const totalIncome = income.reduce((s,t) => s+parseFloat(t.amount),0), totalExpenses = expenses.reduce((s,t) => s+parseFloat(t.amount),0);

        doc.setFontSize(20).text('Budget Report', 105, 20, { align: 'center' });
        doc.setFontSize(12).text(`Period: ${from.toLocaleDateString()} to ${to.toLocaleDateString()}`, 105, 28, { align: 'center' });
        doc.line(20, 32, 190, 32); let y = 40;

        if(income.length > 0) {
            doc.setFontSize(16).setFont(undefined,'bold').text('Income',20,y);
            doc.autoTable({ startY: y+8, head: [['Date','Description','Category','Amount']], body: income.map(t => [new Date(t.date+'T00:00:00').toLocaleDateString(), t.description, this.getCategoryName(t.category), this.formatCurrency(t.amount)]), theme: 'striped', headStyles: {fillColor:[76,175,80]} });
            y = doc.autoTable.previous.finalY + 10;
            doc.setFontSize(12).setFont(undefined,'bold').text('Total Income:',150,y,{align:'right'}).setFont(undefined,'normal').text(this.formatCurrency(totalIncome),190,y,{align:'right'});
            y += 15;
        }
        if(expenses.length > 0) {
            doc.setFontSize(16).setFont(undefined,'bold').text('Expenses',20,y);
            doc.autoTable({ startY: y+8, head: [['Date','Description','Category','Amount']], body: expenses.map(t => [new Date(t.date+'T00:00:00').toLocaleDateString(), t.description, this.getCategoryName(t.category), this.formatCurrency(t.amount)]), theme: 'striped', headStyles: {fillColor:[244,67,54]} });
            y = doc.autoTable.previous.finalY + 10;
            doc.setFontSize(12).setFont(undefined,'bold').text('Total Expenses:',150,y,{align:'right'}).setFont(undefined,'normal').text(this.formatCurrency(totalExpenses),190,y,{align:'right'});
            y += 15;
        }
        
        doc.line(20, y, 190, y); y += 10;
        doc.setFontSize(14).setFont(undefined, 'bold').text('Net Balance:', 150, y, { align: 'right' });
        const net = totalIncome-totalExpenses;
        doc.setTextColor(...(net>=0 ? [76,175,80]:[244,67,54])).text(this.formatCurrency(net),190,y,{align:'right'});
        doc.save(`Budget_Report_${fromStr}_to_${toStr}.pdf`);
    }

    async clearAllData() {
        this.showDeleteConfirmModal('This will permanently delete all data. This cannot be undone.', () => {
            this.showDeleteConfirmModal('Are you absolutely sure?', async () => {
                await Promise.all([
                    this.dataStore.clear('transactions'),
                    this.dataStore.clear('categories'),
                    this.dataStore.clear('budgets'),
                    this.dataStore.clear('settings'),
                    this.dataStore.clear('receipts'),
                ]);
                localStorage.removeItem('budgetTrackerData_fallback'); // Also clear fallback
                location.reload();
            });
        });
    }
    
    // Helper Functions
    downloadFile(c, f, m) { const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([c],{type:m})); a.download=f; a.click(); a.remove(); }
    
    formatCurrency(a) {
        return new Intl.NumberFormat(undefined, {
            style: 'decimal',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(a);
    }

    generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }
    showToast(m, t='info') { const e=document.createElement('div'); e.className=`toast ${t}`; e.textContent=m; document.body.appendChild(e); setTimeout(()=>e.remove(),3000); }
    closeAllModals() { 
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); 
    }
    
    async displayReceiptPreview(receiptId) {
        const previewContainer = document.getElementById('receiptPreviewContainer');
        const previewImage = document.getElementById('receiptPreviewImage');
        document.getElementById('transactionReceiptId').value = receiptId || '';
        document.getElementById('isReceiptRemoved').value = '0';

        if (previewImage.src) URL.revokeObjectURL(previewImage.src);

        if (receiptId) {
            try {
                const receipt = await this.dataStore.get('receipts', receiptId);
                if (receipt && receipt.image) {
                    previewImage.src = URL.createObjectURL(receipt.image);
                    previewContainer.style.display = 'flex';
                } else {
                    previewContainer.style.display = 'none';
                }
            } catch (error) {
                console.error("Could not load receipt for editing:", error);
                previewContainer.style.display = 'none';
            }
        } else {
            previewContainer.style.display = 'none';
        }
    }
    
    async handleReceiptUpload(file) {
        if (!file) return;
        this.compressedReceiptBlob = null; // Reset previous blob
    
        try {
            this.showToast('Compressing receipt...', 'info');
            const compressedBlob = await this.compressReceiptImage(file);
            this.compressedReceiptBlob = compressedBlob;
    
            const previewContainer = document.getElementById('receiptPreviewContainer');
            const previewImage = document.getElementById('receiptPreviewImage');
            
            if (previewImage.src) URL.revokeObjectURL(previewImage.src);
            
            previewImage.src = URL.createObjectURL(compressedBlob);
            previewContainer.style.display = 'flex';
            document.getElementById('isReceiptRemoved').value = '0';
            
            // Clear the file input so saveTransaction doesn't re-read the original file
            document.getElementById('transactionReceipt').value = '';
        } catch (error) {
            this.showToast('Could not process receipt image.', 'error');
            console.error(error);
        }
    }

    removeReceiptPreview() {
        this.compressedReceiptBlob = null; // Clear the staged blob
        const previewContainer = document.getElementById('receiptPreviewContainer');
        const previewImage = document.getElementById('receiptPreviewImage');
        const fileInput = document.getElementById('transactionReceipt');
        if (previewImage.src) URL.revokeObjectURL(previewImage.src);
        previewImage.src = '';
        fileInput.value = ''; // Clear the file input
        previewContainer.style.display = 'none';
        document.getElementById('isReceiptRemoved').value = '1';
    }
    
    getCurrentLocation() {
        if (!navigator.geolocation) return this.showToast('Geolocation not supported.', 'error');
        navigator.geolocation.getCurrentPosition(
            (p) => { document.getElementById('transactionLocation').value = `${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`; this.showToast('Location retrieved!', 'success'); },
            () => this.showToast('Unable to retrieve location.', 'error')
        );
    }
    
    showDailyReminder() {
        if (!this.data.settings.dailyReminder) return;
        const last = localStorage.getItem('lastDailyReminder');
        const today = new Date().toDateString();
        if (last !== today) {
            setTimeout(() => { this.showCustomReminderModal(() => this.openTransactionModal()); localStorage.setItem('lastDailyReminder', today); }, 5000);
        }
    }
    
    showCustomReminderModal(onOk) {
        const m = document.getElementById('dailyReminderModal');
        m.style.display = 'flex'; m.classList.add('active');
        const close = () => { m.classList.remove('active'); setTimeout(() => m.style.display = 'none', 300); };
        const ok = () => { close(); if (onOk) onOk(); };
        document.getElementById('reminderOK').onclick = ok;
        document.getElementById('reminderCancel').onclick = close;
    }
    
    showDeleteConfirmModal(msg, onConfirm, onCancel, title = 'Confirm Action') {
        const m = document.getElementById('deleteConfirmModal');
        m.querySelector('.modal-title').textContent = title;
        document.getElementById('deleteConfirmMessage').textContent = msg;
        m.style.display = 'flex'; m.classList.add('active');
        const close = () => { m.classList.remove('active'); setTimeout(() => m.style.display = 'none', 300); };
        const confirm = () => { close(); if (onConfirm) onConfirm(); };
        const cancel = () => { close(); if (onCancel) onCancel(); };
        document.getElementById('deleteConfirm').onclick = confirm;
        document.getElementById('deleteCancel').onclick = cancel;
    }

    showCurrencyChangeConfirmModal(onConfirm, onCancel) {
        const m = document.getElementById('currencyChangeConfirmModal');
        m.style.display = 'flex'; m.classList.add('active');
        const close = () => { m.classList.remove('active'); setTimeout(() => m.style.display = 'none', 300); };
        const confirm = () => { close(); if (onConfirm) onConfirm(); };
        const cancel = () => { close(); if (onCancel) onCancel(); };
        document.getElementById('currencyChangeConfirm').onclick = confirm;
        document.getElementById('currencyChangeCancel').onclick = cancel;
    }
    
    updateAppInfo() {
        document.getElementById('appVersion').textContent = '1.5.0 (IndexedDB)';
        document.getElementById('installDate').textContent = new Date(this.data.settings.installationDate).toLocaleDateString();
        document.getElementById('totalTransactions').textContent = this.data.transactions.length;
        document.getElementById('budgetAlertThreshold').value = this.data.settings.budgetAlertThreshold;
    }

    async updateSetting(key, value) {
        this.data.settings[key] = value;
        await this.dataStore.put('settings', { key: 'main', ...this.data.settings });
    }

    // --- RECURRING TRANSACTIONS LOGIC ---
    calculateNextDueDate(last, freq, orig) {
        if (!last || freq === 'none' || !orig) return null;
        const lastD = new Date(last+'T00:00:00'), origD = new Date(orig+'T00:00:00');
        let nextD = new Date(lastD);
        switch (freq) {
            case 'daily': nextD.setDate(lastD.getDate()+1); break;
            case 'weekly': nextD.setDate(lastD.getDate()+7); break;
            case 'monthly':
                const origDay = origD.getDate();
                nextD.setMonth(lastD.getMonth()+1);
                const daysInNext = new Date(nextD.getFullYear(), nextD.getMonth()+1, 0).getDate();
                nextD.setDate(Math.min(origDay, daysInNext));
                break;
            case 'yearly': nextD.setFullYear(lastD.getFullYear()+1); break;
            default: return null;
        }
        return nextD.toISOString().split('T')[0];
    }

    async processRecurringTransactions() {
        const today = new Date().toISOString().split('T')[0];
        const newTx = [];
        const templatesToUpdate = [];

        this.data.transactions.filter(t => t.isRecurring && t.recurringStatus === 'active').forEach(t => {
            let next = t.nextDueDate;
            while(next && next <= today) {
                const newT = { ...t, id: this.generateId(), date: next, timestamp: new Date().toISOString(), isRecurring: false, frequency: 'none' };
                delete newT.recurringStatus; delete newT.nextDueDate; delete newT.originalDate;
                newTx.push(newT);
                next = this.calculateNextDueDate(next, t.frequency, t.originalDate);
                t.nextDueDate = next;
                templatesToUpdate.push(t);
            }
        });

        if(newTx.length > 0) {
            await Promise.all(newTx.map(t => this.dataStore.add('transactions', t)));
            this.data.transactions.push(...newTx);
        }
        if(templatesToUpdate.length > 0) {
            await Promise.all(templatesToUpdate.map(t => this.dataStore.put('transactions', t)));
        }
        return newTx.length;
    }

    renderRecurringTransactions() {
        const container = document.getElementById('recurringTransactionsList');
        const templates = this.data.transactions.filter(t => t.isRecurring);
        if (templates.length === 0) return container.innerHTML = '<div class="empty-state"><p>No recurring transactions set up yet.</p></div>';

        container.innerHTML = templates.map(t => {
            const cat = this.data.categories.find(c => c.id === t.category);
            const paused = t.recurringStatus === 'paused';
            return `
            <div class="transaction-item">
                <div class="transaction-icon" style="background-color: ${cat?.color}20; color: ${cat?.color};">🔄</div>
                <div class="transaction-info">
                    <div class="transaction-title">${t.description}<span class="status-badge ${t.recurringStatus}">${t.recurringStatus}</span></div>
                    <div class="recurring-item-details">
                        <span>Next Due: ${t.nextDueDate ? new Date(t.nextDueDate+'T00:00:00').toLocaleDateString() : 'N/A'}</span>
                        <span>Frequency: ${t.frequency}</span>
                    </div>
                </div>
                <div class="transaction-amount ${t.type}">${t.type==='income'?'+':'-'}${this.formatCurrency(t.amount)}</div>
                <div class="transaction-actions">
                    <button class="icon-btn" onclick="app.editTransaction('${t.id}')" title="Edit Template">✏️</button>
                    <button class="icon-btn" onclick="app.${paused?'resume':'pause'}Recurring('${t.id}')" title="${paused?'Resume':'Pause'}">${paused?'▶️':'⏸️'}</button>
                    <button class="icon-btn" onclick="app.stopRecurring('${t.id}')" title="Stop Recurring">⏹️</button>
                </div>
            </div>`;
        }).join('');
    }

    pauseRecurring(id) { this.toggleRecurringStatus(id, 'paused', 'paused'); }
    resumeRecurring(id) { this.toggleRecurringStatus(id, 'active', 'resumed'); }
    async toggleRecurringStatus(id, status, verb) {
        const idx = this.data.transactions.findIndex(t => t.id === id);
        if (idx!==-1) { 
            this.data.transactions[idx].recurringStatus = status; 
            await this.dataStore.put('transactions', this.data.transactions[idx]);
            this.renderRecurringTransactions(); 
            this.showToast(`Recurring transaction ${verb}.`, 'info'); 
        }
    }
    stopRecurring(id) {
        this.showDeleteConfirmModal('Are you sure you want to permanently stop this recurring transaction?', async () => {
            const idx = this.data.transactions.findIndex(t => t.id === id);
            if (idx!==-1) {
                const tx = this.data.transactions[idx];
                delete tx.isRecurring;
                delete tx.recurringStatus;
                delete tx.nextDueDate;
                delete tx.originalDate;
                await this.dataStore.put('transactions', tx);
                this.renderRecurringTransactions(); 
                this.showToast('Recurring transaction stopped.', 'success');
            }
        }, null, 'Stop Recurring');
    }
    
    // --- AI Suggestions ---
    openAISuggestionsModal() { document.getElementById('aiSuggestionsModal').classList.add('active'); document.querySelector('.period-chip[data-period="this-month"]').click(); }
    closeAISuggestionsModal() { document.getElementById('aiSuggestionsModal').classList.remove('active'); }
    runAISuggestions() {
        const period = document.querySelector('.period-chip.active')?.dataset.period;
        if (!period) return;
        const { start, end } = this.getAIPeriodRange(period);
        this.renderAISuggestions(this.analyzeSpending(start, end, period));
    }
    renderAISuggestions(suggestions) {
        const c = document.getElementById('aiSuggestionsList');
        if (suggestions.length === 0) { c.innerHTML = `<div class="empty-state"><p>Not enough data for trends yet.</p></div>`; return; }
        c.innerHTML = suggestions.map(s => `
            <div class="suggestion-item severity-${s.severity}">
                <div class="suggestion-icon">${s.icon}</div>
                <div class="suggestion-content">
                    <div class="title">${s.title}</div><div class="tip">${s.tip}</div>
                </div>
            </div>`).join('');
    }
    copyAISuggestions() {
        const c = document.getElementById('aiSuggestionsList');
        if (!c.children.length || c.querySelector('.empty-state')) return this.showToast('No suggestions to copy.', 'info');
        let text = "AI Suggestions:\n\n";
        c.querySelectorAll('.suggestion-item').forEach(i => {
            text += `- ${i.querySelector('.title').textContent.trim()}\n  Tip: ${i.querySelector('.tip').textContent.trim()}\n\n`;
        });
        navigator.clipboard.writeText(text.trim()).then(() => this.showToast('Suggestions copied!', 'success'), () => this.showToast('Failed to copy.', 'error'));
    }
    getAIPeriodRange(key) {
        const now = new Date(), start = new Date(now), end = new Date(now);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);
        switch(key) {
            case 'this-month': start.setDate(1); break;
            case 'last-month': start.setMonth(now.getMonth()-1, 1); end.setDate(0); break;
            case 'last-3-months': start.setMonth(now.getMonth()-2, 1); break;
        }
        return { start, end };
    }
    analyzeSpending(start, end, periodKey) {
        const suggestions = []; const cats = this.data.categories.reduce((m,c)=>{m[c.id]=c; return m;}, {});
        const tx = this.data.transactions.filter(t => {const d=new Date(t.date); return d>=start&&d<=end; });
        const ex = tx.filter(t=>t.type==='expense'), inc = tx.filter(t=>t.type==='income');
        const totalEx = ex.reduce((s,t)=>s+(t.amount||0),0), totalInc = inc.reduce((s,t)=>s+(t.amount||0),0);
        this.data.budgets.forEach(b => {
            if (b.period!=='monthly') return;
            const cat = cats[b.categoryId]; if (!cat) return;
            const catEx = ex.filter(t => t.category === b.categoryId).reduce((s, t) => s + (t.amount || 0), 0);
            const util = b.amount > 0 ? (catEx / b.amount)*100 : 0;
            if (util>=100) suggestions.push({ severity:'alert',icon:'🚨',title:`${cat.name} spending over budget by ${this.formatCurrency(catEx - b.amount)}.`,tip:`You've exceeded your ${cat.name} budget. Defer non-essential buys.`});
            else if (util>=80) suggestions.push({ severity:'warning',icon:'⚠️',title:`You've used ${util.toFixed(0)}% of your ${cat.name} budget.`,tip:`Be mindful of remaining ${this.formatCurrency(b.amount - catEx)}.`});
        });
        return suggestions;
    }

    // --- NEW: BUDGET ALERT FEATURE ---
    checkBudgetAlerts() {
        const threshold = this.data.settings.budgetAlertThreshold;
        this.data.budgets.forEach(b => {
            const cat = this.data.categories.find(c => c.id === b.categoryId);
            if (!cat) return;
            const { start } = this.getPeriodDates(b.period);
            const spent = this.data.transactions
                .filter(t => t.category === b.categoryId && t.type === 'expense' && new Date(t.date) >= start)
                .reduce((s,t) => s + parseFloat(t.amount), 0);
            const perc = b.amount > 0 ? (spent / b.amount) * 100 : 0;
            const key = `${b.id}-${start.toISOString().split('T')[0]}`;
            if (perc >= threshold && !this.alertedBudgets.has(key)) {
                this.showBudgetAlert(cat.name, perc, b.amount, spent);
                this.alertedBudgets.add(key);
            }
        });
    }
    showBudgetAlert(cat, perc, budget, spent) {
        const m = document.getElementById('budgetAlertModal');
        document.getElementById('budgetAlertMessage').innerHTML = `You've spent <strong>${this.formatCurrency(spent)}</strong> (${perc.toFixed(0)}%) of your <strong>${this.formatCurrency(budget)}</strong> budget for <strong>${cat}</strong>.`;
        m.style.display = 'flex'; m.classList.add('active');
    }
    closeBudgetAlertModal() {
        const m = document.getElementById('budgetAlertModal');
        m.classList.remove('active'); setTimeout(() => m.style.display = 'none', 300);
    }

    // --- NEW/MODIFIED: VOICE INPUT FEATURE ---
    setupVoiceRecognition() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { document.getElementById('voiceInputBtn').style.display = 'none'; return; }
        this.recognition = new SR(); this.recognition.lang = 'en-US';
        const vStatus = document.getElementById('voiceStatus'), vBtn = document.getElementById('voiceInputBtn');
        this.recognition.onstart = () => { this.isListening = true; vStatus.textContent = 'Listening...'; vBtn.classList.add('listening'); };
        this.recognition.onresult = (e) => { const t = e.results[0][0].transcript; vStatus.textContent = `Processing: "${t}"`; this.parseVoiceInput(t); };
        this.recognition.onerror = (e) => { vStatus.textContent = `Error: ${e.error}.`; this.isListening=false; vBtn.classList.remove('listening'); };
        this.recognition.onend = () => { this.isListening=false; setTimeout(()=>vStatus.textContent='',2500); vBtn.classList.remove('listening'); };
    }
    startVoiceRecognition() {
        if (this.isListening || !this.recognition) return;
        try { this.recognition.start(); }
        catch (e) { document.getElementById('voiceStatus').textContent = 'Could not start listening.'; this.isListening=false; }
    }
    parseVoiceInput(t) {
        t = t.toLowerCase();
        const amtMatch = t.match(/(\d+(\.\d+)?)/);
        if (amtMatch) { document.getElementById('transactionAmount').value = parseFloat(amtMatch[1]); t = t.replace(amtMatch[0], ''); }
        for (const cat of this.data.categories.filter(c => c.type === 'expense')) {
            if (t.includes(cat.name.toLowerCase())) { document.getElementById('transactionCategory').value = cat.id; t=t.replace(cat.name.toLowerCase(),''); break; }
        }
        let desc = t.replace(/for|on|at|expense|of/g, '').trim();
        if(desc) document.getElementById('transactionDescription').value = desc.charAt(0).toUpperCase() + desc.slice(1);
        if(amtMatch || desc) this.showToast('Fields populated from voice!', 'success');
        else this.showToast('Could not understand.', 'error');
    }

    /**
     * Updates the profile section with user information.
     * @param {object|null} user - The Firebase user object or null for guests.
     */
    updateProfileUI(user) {
        const userProfileView = document.getElementById('userProfileView');
        const guestProfileView = document.getElementById('guestProfileView');

        if (user) {
            // Show user profile and hide guest view
            guestProfileView.style.display = 'none';
            userProfileView.style.display = 'block';

            // Populate user data
            document.getElementById('userProfilePhoto').src = user.photoURL || 'https://placehold.co/100x100/e9ecef/6c757d?text=User';
            document.getElementById('userDisplayName').textContent = user.displayName || 'No Name';
            document.getElementById('userEmail').textContent = user.email;
        } else {
            // Show guest view and hide user profile
            userProfileView.style.display = 'none';
            guestProfileView.style.display = 'block';
        }
    }


    /**
     * Signs the user out of Firebase and lets the auth listener handle the UI change.
     */
    async logoutUser() {
        try {
            await signOut(this.auth);
            // The onAuthStateChanged listener will automatically handle hiding the app
            // and showing the login page.
            this.showToast('You have been signed out.', 'success');
        } catch (error) {
            console.error('Logout Error:', error);
            this.showToast('Error signing out.', 'error');
        }
    }

    /**
     * Handles the "Restore Data" button click.
     */
    handleRestoreData() {
        this.showDeleteConfirmModal(
            'This will overwrite all local data with the data from the cloud. Are you sure you want to continue?',
            async () => {
                try {
                    const message = await this.restoreTransactionsFromFirebase();
                    await this.loadData(); // Reload data into the app state from IndexedDB
                    this.updateDashboard(); // Refresh all UI components
                    this.renderTransactions();
                    this.showToast(message, 'success');
                } catch (error) {
                    // Error toast is already shown in the restore function
                }
            },
            null,
            'Confirm Data Restore'
        );
    }

    /**
     * Generates the correct HTML for a category icon (emoji or image).
     * @param {object} category The category object.
     * @returns {string} The HTML string for the icon.
     */
    getCategoryIconHtml(category) {
        if (!category || !category.icon) {
            return '📝'; // Default fallback emoji
        }
        if (category.icon.startsWith('data:image')) {
            return `<img src="${category.icon}" alt="${category.name}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        }
        return category.icon; // It's an emoji
    }

    // --- NEW: CATEGORY ICON METHODS ---

    /**
     * Compresses an image file to be used as a category icon.
     * @param {File} file The image file to compress.
     * @returns {Promise<string>} A promise that resolves with the compressed image as a base64 data URL.
     */
    compressImage(file) {
        return new Promise((resolve, reject) => {
            const MAX_WIDTH = 128;
            const MAX_HEIGHT = 128;
            const TARGET_SIZE_KB = 50;
            const reader = new FileReader();

            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height = Math.round((height * MAX_WIDTH) / width);
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width = Math.round((width * MAX_HEIGHT) / height);
                            height = MAX_HEIGHT;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    let quality = 0.9;
                    let dataUrl = canvas.toDataURL('image/jpeg', quality);

                    while (dataUrl.length * 0.75 > TARGET_SIZE_KB * 1024 && quality > 0.1) {
                        quality -= 0.1;
                        dataUrl = canvas.toDataURL('image/jpeg', quality);
                    }

                    if (dataUrl.length * 0.75 > TARGET_SIZE_KB * 1024) {
                        return reject(new Error('Image is too large, even after compression.'));
                    }
                    resolve(dataUrl);
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Compresses an image file to be used as a transaction receipt.
     * @param {File} file The image file to compress.
     * @returns {Promise<Blob>} A promise that resolves with the compressed image as a Blob.
     */
    compressReceiptImage(file) {
        return new Promise((resolve, reject) => {
            const MAX_WIDTH = 400;
            const MAX_HEIGHT = 400;
            const TARGET_SIZE_KB = 200;
            const reader = new FileReader();
    
            reader.onload = e => {
                const img = new Image();
                img.onload = () => {
                    let width = img.width;
                    let height = img.height;
    
                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }
    
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
    
                    canvas.toBlob(
                        (blob) => {
                            if (blob.size / 1024 > TARGET_SIZE_KB) {
                                this.showToast(`Receipt compressed to ${(blob.size / 1024).toFixed(0)}KB.`, 'info');
                            }
                            resolve(blob);
                        },
                        'image/jpeg',
                        0.85 // Use a reasonable quality, can be adjusted
                    );
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Sets the selected category icon to a default emoji.
     * @param {string} icon The emoji character.
     */
    selectDefaultIcon(icon) {
        document.getElementById('iconPreviewEmoji').textContent = icon;
        document.getElementById('iconPreviewEmoji').style.display = 'inline';
        document.getElementById('iconPreviewImg').style.display = 'none';
        document.getElementById('categoryIcon').value = icon;
    }

    /**
     * Handles the processing of a custom uploaded icon.
     * @param {File} file The uploaded file.
     */
    async handleCustomIconUpload(file) {
        try {
            const compressedDataUrl = await this.compressImage(file);
            document.getElementById('iconPreviewImg').src = compressedDataUrl;
            document.getElementById('iconPreviewImg').style.display = 'inline-block';
            document.getElementById('iconPreviewEmoji').style.display = 'none';
            document.getElementById('categoryIcon').value = compressedDataUrl;
            document.querySelectorAll('.icon-option').forEach(el => el.classList.remove('active'));
        } catch (error) {
            this.showToast(error.message || 'Failed to process image.', 'error');
            document.getElementById('categoryIconUpload').value = '';
        }
    }

    // --- NEW: Image Modal Functions ---
    openImageModal(src) {
        const modal = document.getElementById('imageModal');
        const modalImg = document.getElementById('fullImage');
        modalImg.src = src;
        modal.classList.add('active');
    }

    closeImageModal() {
        const modal = document.getElementById('imageModal');
        modal.classList.remove('active');
    }
}

// Initialize the app when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new BudgetTracker();
});