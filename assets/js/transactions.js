/* assets/js/transactions.js */
let allTransactions = [], editingTxnId = null;
let allAccounts = [];

function updatePageDebug(text, color) {
  const el = document.getElementById('debug-page-status');
  if (el) {
    el.textContent = 'Page: ' + text;
    if (color) el.style.color = color;
  }
}

async function loadTransactions() {
  console.log('Loading transactions...');
  updatePageDebug('Loading Transactions...', '#0C3925');
  
  try {
    UTILS.renderTableSkeleton('txn-table');
    UTILS.setSkeletonText('total-receipts', 'w-50', true);
    UTILS.setSkeletonText('total-payments', 'w-50', true);
    UTILS.setSkeletonText('net-balance', 'w-50', true);
    
    await DB.initDB();

    // High performance: fetch accounts and transactions simultaneously in a single parallel round-trip
    const [accRes, txnRes] = await Promise.all([
      window.dbClient.from('accounts').select('*').order('name'),
      window.dbClient.from('transactions').select('*').order('id', { ascending: false })
    ]);

    if (accRes.error) throw accRes.error;
    if (txnRes.error) throw txnRes.error;

    allAccounts = accRes.data || [];
    const txnData = txnRes.data || [];
    allTransactions = UTILS.sortLatestFirst(txnData, t => t.ref_no || t.id);

    // Compute account balances in memory without making redundant queries
    const accMap = new Map();
    allAccounts.forEach(a => {
      a.total_receipts = 0;
      a.total_payments = 0;
      a.net_balance = 0;
      accMap.set(String(a.id), a);
    });

    allTransactions.forEach(t => {
      const acc = accMap.get(String(t.account_id));
      t.account_name = acc ? acc.name : '';
      if (acc) {
        const amt = parseFloat(t.amount) || 0;
        if (t.type === 'Receipt') acc.total_receipts += amt;
        else if (t.type === 'Payment') acc.total_payments += amt;
        acc.net_balance = acc.total_receipts - acc.total_payments;
      }
      
      // Determine display reference number
      if (!t.ref_no) {
        if (t.notes && t.notes.startsWith('[Ref: ')) {
          const m = t.notes.match(/^\[Ref:\s*([^\]]+)\]/);
          if (m) t.ref_no = m[1];
        } else if (t.ref_id !== null && t.ref_id !== undefined) {
          t.ref_no = 'TXN-' + t.ref_id;
        } else {
          t.ref_no = 'TXN-' + t.id;
        }
      }
    });

    populateAccountDropdowns();
    applyFilters();
    
    updatePageDebug('Ready (' + allTransactions.length + ')', '#0C3925');
    console.log('Transactions: All data loaded successfully');
  } catch (err) {
    console.error('Transactions loadTransactions failed:', err);
    updatePageDebug('FAILED', '#EF4444');
    APP.showToast('Failed to load transactions: ' + err.message, 'error');
    renderTable([]);
  }
}

function populateAccountDropdowns() {
  const filterSelect = document.getElementById('account-filter');
  if (filterSelect) {
    const curVal = filterSelect.value;
    filterSelect.innerHTML = '<option value="">All Accounts</option>' + 
      allAccounts.map(a => `<option value="${a.id}" ${curVal == a.id ? 'selected' : ''}>${a.name} (₹${(a.net_balance || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})})</option>`).join('');
  }

  const formSelect = document.getElementById('txn-account-select');
  if (formSelect) {
    const curVal = formSelect.value;
    formSelect.innerHTML = '<option value="">Select Account...</option>' + 
      allAccounts.map(a => `<option value="${a.id}" ${curVal == a.id ? 'selected' : ''}>${a.name}</option>`).join('');
  }
}

function renderTable(data) {
  const tbody = document.querySelector('#txn-table tbody');
  if (!tbody) return;
  document.getElementById('total-info').textContent = `${data.length} transaction${data.length !== 1 ? 's' : ''}`;
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><span aria-hidden="true" style="font-size:28px;font-weight:800;line-height:1;color:var(--accent)">₹</span><h3>No transactions</h3><p>Record your first payment or receipt.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(t => `<tr>
    <td>${UTILS.fmtDate(t.date)}</td>
    <td><span class="badge ${t.type === 'Receipt' ? 'badge-success' : 'badge-danger'}">${t.type}</span></td>
    <td><span style="font-weight: 500; color: var(--text-primary);">${t.account_name || '—'}</span></td>
    <td class="cell-mono">${t.ref_no || '—'}</td>
    <td class="cell-bold">${t.party_name || '—'}</td>
    <td><span class="badge badge-gray">${t.mode || 'Cash'}</span></td>
    <td class="cell-amount ${t.type === 'Receipt' ? 'positive' : 'negative'}">${UTILS.fmtCurrency(t.amount)}</td>
    <td><div class="row-actions">
      <button class="action-btn edit" onclick="openEdit(${t.id})" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button class="action-btn delete" onclick="deleteTxn(${t.id})" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
    </div></td>
  </tr>`).join('');
  UTILS.applyMobileTableLabels('txn-table');
}

function renderSummary(data) {
  const receipts = data.filter(t => t.type === 'Receipt').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const payments = data.filter(t => t.type === 'Payment').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const receiptCount = data.filter(t => t.type === 'Receipt').length;
  const paymentCount = data.filter(t => t.type === 'Payment').length;
  const net = receipts - payments;

  const rEl = document.getElementById('total-receipts');
  const pEl = document.getElementById('total-payments');
  const nEl = document.getElementById('net-balance');
  if (rEl) rEl.textContent = UTILS.fmtCurrency(receipts);
  if (pEl) pEl.textContent = UTILS.fmtCurrency(payments);
  if (nEl) {
    nEl.textContent = UTILS.fmtCurrency(net);
    nEl.style.color = net >= 0 ? 'var(--success)' : 'var(--danger)';
  }

  const receiptMetaEl = document.getElementById('receipt-meta');
  if (receiptMetaEl) receiptMetaEl.textContent = receiptCount ? `${receiptCount} receipt${receiptCount === 1 ? '' : 's'} recorded` : 'Incoming cash collected';

  const paymentMetaEl = document.getElementById('payment-meta');
  if (paymentMetaEl) paymentMetaEl.textContent = paymentCount ? `${paymentCount} payment${paymentCount === 1 ? '' : 's'} recorded` : 'Payments Made';

  const netMetaEl = document.getElementById('net-balance-meta');
  if (netMetaEl) {
    netMetaEl.textContent = net > 0
      ? 'Receipts are ahead of payments'
      : net < 0
        ? 'Payments are ahead of receipts'
        : 'Receipts and payments are even';
    netMetaEl.style.color = net > 0 ? 'var(--success)' : net < 0 ? 'var(--danger)' : 'var(--text-secondary)';
  }
}

function openAdd() {
  editingTxnId = null;
  document.getElementById('modal-title').textContent = 'Record Transaction';
  const txnForm = document.getElementById('txn-form');
  txnForm.reset();
  const accountSelect = document.getElementById('txn-account-select');
  if (accountSelect) accountSelect.value = '';
  UTILS.applyDefaultDateInputs(txnForm, { skipFieldNames: ['due_date'] });
  APP.openModal('txn-modal');
}

function openEdit(id) {
  editingTxnId = id;
  const t = allTransactions.find(x => x.id === id);
  if (!t) return;
  document.getElementById('modal-title').textContent = 'Edit Transaction';
  
  // Clean notes from [Ref: ...] header for user display if present
  let userNotes = t.notes || '';
  if (userNotes.startsWith('[Ref: ')) {
    userNotes = userNotes.replace(/^\[Ref:\s*[^\]]+\]\s*/, '');
  }
  
  const formData = {
    ...t,
    ref_no: t.ref_no || '',
    notes: userNotes
  };

  UTILS.populateForm('txn-form', formData);
  const accountSelect = document.getElementById('txn-account-select');
  if (accountSelect) accountSelect.value = t.account_id || '';
  UTILS.applyDefaultDateInputs(document.getElementById('txn-form'), { skipFieldNames: ['due_date'] });
  APP.openModal('txn-modal');
}

async function saveTxn() {
  const d = UTILS.getFormData('txn-form');
  if (!d.type || !d.amount || !d.date) { APP.showToast('Type, amount and date are required', 'error'); return; }
  
  const saveBtn = document.querySelector('#txn-modal .btn-primary');
  if (saveBtn) APP.setButtonLoading(saveBtn, true, editingTxnId ? 'Updating...' : 'Recording...');

  try {
    const rawRef = (d.ref_no || '').trim();
    let numRefId = null;
    if (rawRef && /^\d+$/.test(rawRef)) {
      numRefId = parseInt(rawRef, 10);
    }
    
    // Store reference cleanly: if alphanumeric, prepend tag in notes so it's safely persisted without breaking schema
    let combinedNotes = (d.notes || '').trim();
    if (rawRef) {
      combinedNotes = `[Ref: ${rawRef}]` + (combinedNotes ? ' ' + combinedNotes : '');
    }

    const payload = {
      type: d.type,
      party_name: d.party_name || '',
      amount: parseFloat(d.amount) || 0,
      mode: d.mode || 'Cash',
      date: d.date,
      notes: combinedNotes,
      ref_id: numRefId,
      ref_type: rawRef ? 'Manual' : null,
      account_id: d.account_id ? parseInt(d.account_id, 10) : null
    };

    if (editingTxnId) {
      const { error } = await window.dbClient
        .from('transactions')
        .update(payload)
        .eq('id', editingTxnId);
      if (error) throw error;
      APP.showToast('Transaction updated!', 'success');
    } else {
      const { error } = await window.dbClient
        .from('transactions')
        .insert([payload]);
      if (error) throw error;
      APP.showToast('Transaction recorded!', 'success');
    }

    APP.closeModal('txn-modal');
    loadTransactions();
  } catch (err) {
    console.error('saveTxn failed:', err);
    APP.showToast('Error saving transaction: ' + err.message, 'error');
  } finally {
    if (saveBtn) APP.setButtonLoading(saveBtn, false);
  }
}

async function deleteTxn(id) {
  APP.showConfirm('Delete this transaction?', async () => {
    try {
      const { error } = await window.dbClient
        .from('transactions')
        .delete()
        .eq('id', id);
      if (error) throw error;
      
      APP.showToast('Transaction deleted.', 'success');
      setTimeout(() => loadTransactions(), 100);
    } catch (err) {
      console.error(err);
      APP.showToast('Failed to delete transaction: ' + err.message, 'error');
    }
  });
}

function applyFilters() {
  const q = document.getElementById('search-input')?.value.toLowerCase() || '';
  const type = document.getElementById('type-filter')?.value || '';
  const account = document.getElementById('account-filter')?.value || '';

  let filtered = allTransactions;

  if (type) {
    filtered = filtered.filter(x => x.type === type);
  }
  if (account) {
    filtered = filtered.filter(x => String(x.account_id) === String(account));
  }
  if (q) {
    filtered = filtered.filter(t => 
      `${t.type} ${t.ref_no || ''} ${t.party_name || ''} ${t.mode || ''} ${t.account_name || ''} ${t.notes || ''}`
        .toLowerCase()
        .includes(q)
    );
  }

  // Sort descending by numeric ID / reference
  filtered = UTILS.sortLatestFirst(filtered, t => t.ref_no || t.id);

  renderTable(filtered);
  renderSummary(filtered);
}

// --- ACCOUNTS MANAGEMENT ---
async function loadAccounts() {
  try {
    const { data: accData, error: accErr } = await window.dbClient
      .from('accounts')
      .select('*')
      .order('name');
    if (accErr) throw accErr;
    allAccounts = accData || [];

    // Also fetch transactions to calculate per-account balances
    const { data: txns } = await window.dbClient.from('transactions').select('account_id, type, amount');
    const txnList = txns || [];

    allAccounts.forEach(a => {
      const aTxns = txnList.filter(t => String(t.account_id) === String(a.id));
      const rcpt = aTxns.filter(t => t.type === 'Receipt').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
      const pymt = aTxns.filter(t => t.type === 'Payment').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
      a.total_receipts = rcpt;
      a.total_payments = pymt;
      a.net_balance = rcpt - pymt;
    });

    // Populate filters and dropdowns
    const filterSelect = document.getElementById('account-filter');
    if (filterSelect) {
      const currentVal = filterSelect.value;
      filterSelect.innerHTML = '<option value="">All Accounts</option>' + 
        allAccounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
      filterSelect.value = currentVal;
    }

    const formSelect = document.getElementById('txn-account-select');
    if (formSelect) {
      const currentVal = formSelect.value;
      formSelect.innerHTML = '<option value="">Select Account...</option>' + 
        allAccounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
      formSelect.value = currentVal;
    }

    setTimeout(() => UTILS.initAllAutocompleteSelects(), 50);
    renderAccountsTable();
  } catch (err) {
    console.error('loadAccounts failed:', err);
  }
}

function renderAccountsTable() {
  const tbody = document.querySelector('#accounts-table tbody');
  if (!tbody) return;

  if (allAccounts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state">No accounts found. Add your first account.</div></td></tr>';
    return;
  }

  tbody.innerHTML = allAccounts.map(a => `
    <tr>
      <td class="cell-bold"><span class="account-name-val">${a.name}</span></td>
      <td>${a.account_number || a.details || '—'}</td>
      <td class="cell-amount text-success">${UTILS.fmtCurrency(a.total_receipts || 0)}</td>
      <td class="cell-amount text-danger">${UTILS.fmtCurrency(a.total_payments || 0)}</td>
      <td class="cell-amount" style="font-weight:700; color: ${(a.net_balance || 0) >= 0 ? 'var(--success)' : 'var(--danger)'}">
        ${UTILS.fmtCurrency(a.net_balance || 0)}
      </td>
      <td>
        <div class="row-actions accounts-actions">
          <button class="ledger-btn" onclick="filterByAccount(${a.id})" title="View Ledger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> <span>Ledger</span>
          </button>
          <button class="action-btn edit" onclick="editAccount(${a.id})" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="action-btn delete" onclick="deleteAccount(${a.id})" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
        </div>
      </td>
    </tr>
  `).join('');

  UTILS.applyMobileTableLabels('accounts-table');
}

function filterByAccount(accountId) {
  const filterSelect = document.getElementById('account-filter');
  if (filterSelect) {
    filterSelect.value = accountId;
  }
  switchTab('ledger');
}

function switchTab(tab) {
  const tabLedger = document.getElementById('tab-ledger');
  const tabAccounts = document.getElementById('tab-accounts');
  const secLedger = document.getElementById('section-ledger');
  const secAccounts = document.getElementById('section-accounts');

  if (tab === 'ledger') {
    tabLedger?.classList.add('active');
    tabAccounts?.classList.remove('active');
    if (secLedger) secLedger.style.display = 'block';
    if (secAccounts) secAccounts.style.display = 'none';
    loadTransactions();
  } else if (tab === 'accounts') {
    tabLedger?.classList.remove('active');
    tabAccounts?.classList.add('active');
    if (secLedger) secLedger.style.display = 'none';
    if (secAccounts) secAccounts.style.display = 'block';
    loadAccounts();
  }
}

function openAddAccount() {
  document.getElementById('account-form-container').style.display = 'block';
  document.getElementById('account-form-title').textContent = 'Add New Account';
  document.getElementById('account-edit-id').value = '';
  document.getElementById('account-name-input').value = '';
  document.getElementById('account-details-input').value = '';
}

function closeAccountForm() {
  document.getElementById('account-form-container').style.display = 'none';
}

function editAccount(id) {
  const a = allAccounts.find(x => x.id === id);
  if (!a) return;
  document.getElementById('account-form-container').style.display = 'block';
  document.getElementById('account-form-title').textContent = 'Edit Account';
  document.getElementById('account-edit-id').value = a.id;
  document.getElementById('account-name-input').value = a.name;
  document.getElementById('account-details-input').value = a.account_number || a.details || '';
}

async function saveAccount() {
  const name = document.getElementById('account-name-input').value.trim();
  const details = document.getElementById('account-details-input').value.trim();
  const editId = document.getElementById('account-edit-id').value;

  if (!name) {
    APP.showToast('Account name is required', 'error');
    return;
  }

  try {
    const payload = { 
      name, 
      account_number: details || null 
    };

    if (editId) {
      const { error } = await window.dbClient
        .from('accounts')
        .update(payload)
        .eq('id', editId);
      if (error) throw error;
      APP.showToast('Account updated!', 'success');
    } else {
      const { error } = await window.dbClient
        .from('accounts')
        .insert([payload]);
      if (error) throw error;
      APP.showToast('Account created!', 'success');
    }

    closeAccountForm();
    await loadAccounts();
    setTimeout(() => loadTransactions(), 100);
  } catch (err) {
    console.error(err);
    APP.showToast('Error saving account: ' + err.message, 'error');
  }
}

async function deleteAccount(id) {
  APP.showConfirm('Are you sure you want to delete this account? Transactions associated with it will remain.', async () => {
    try {
      const { error } = await window.dbClient
        .from('accounts')
        .delete()
        .eq('id', id);
      if (error) throw error;

      APP.showToast('Account deleted', 'success');
      closeAccountForm();
      await loadAccounts();
      setTimeout(() => loadTransactions(), 100);
    } catch (err) {
      console.error(err);
      APP.showToast('Failed to delete account: ' + err.message, 'error');
    }
  });
}

// Event Listeners
document.getElementById('search-input')?.addEventListener('input', applyFilters);
document.getElementById('type-filter')?.addEventListener('change', applyFilters);
document.getElementById('account-filter')?.addEventListener('change', applyFilters);

// Expose globals for inline html handlers
window.switchTab = switchTab;
window.openAdd = openAdd;
window.openEdit = openEdit;
window.saveTxn = saveTxn;
window.deleteTxn = deleteTxn;
window.openAddAccount = openAddAccount;
window.closeAccountForm = closeAccountForm;
window.editAccount = editAccount;
window.saveAccount = saveAccount;
window.deleteAccount = deleteAccount;
window.filterByAccount = filterByAccount;

loadTransactions();
