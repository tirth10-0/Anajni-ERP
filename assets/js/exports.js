/* exports.js */

function updatePageDebug(text, color) {
  const el = document.getElementById('debug-page-status');
  if (el) {
    el.textContent = 'Page: ' + text;
    if (color) el.style.color = color;
  }
}

async function loadExports() {
  updatePageDebug('Ready', '#0C3925');
}

async function fetchExportData(tableName, from, to) {
  let query = window.dbClient.from(tableName).select('*');
  
  // Date filters where supported
  if (['orders', 'daily_transactions', 'purchases', 'transactions', 'expenses'].includes(tableName)) {
    if (from) query = query.gte('date', from);
    if (to) query = query.lte('date', to);
  }
  
  const { data, error } = await query;
  if (error) {
    console.error(`Error fetching ${tableName}:`, error);
    throw error;
  }
  
  let records = data || [];
  
  // Apply numeric descending sort according to the numeric part of the record identifier
  switch(tableName) {
    case 'orders':
      records = UTILS.sortByNumericIdDesc(records, o => o.order_no || o.id);
      break;
    case 'purchases':
      records = UTILS.sortByNumericIdDesc(records, p => p.purchase_no || p.id);
      break;
    case 'daily_transactions':
      records = UTILS.sortByNumericIdDesc(records, dt => dt.txn_no || dt.id);
      break;
    case 'transactions':
      records = UTILS.sortByNumericIdDesc(records, t => {
        if (t.notes && t.notes.startsWith('[Ref: ')) {
          const m = t.notes.match(/^\[Ref:\s*([^\]]+)\]/);
          if (m) return m[1];
        }
        return t.ref_id || t.id;
      });
      break;
    case 'expenses':
      records = UTILS.sortByNumericIdDesc(records, e => e.id);
      break;
    default:
      records = UTILS.sortByNumericIdDesc(records, r => r.id);
      break;
  }
  
  return records;
}

async function exportTable(tableName, label) {
  try {
    APP.showSpinner();
    const data = await fetchExportData(tableName);
    if (!data.length) { 
      APP.showToast('No data to export', 'warning'); 
      return; 
    }
    
    // Select subset of columns to clean the export
    let cleanData = data;
    switch(tableName) {
      case 'clients':
        cleanData = data.map(c => ({ id: c.id, name: c.name, contact: c.contact, email: c.email, city: c.city, gst: c.gst, type: c.type, credit_limit: c.credit_limit, balance: c.balance, created_at: c.created_at }));
        break;
      case 'products':
        cleanData = data.map(p => ({ id: p.id, name: p.name, batch_no: p.batch_no, category: p.category, unit: p.unit, reorder_level: p.reorder_level, cost_price: p.purchase_price, sell_price: p.sell_price }));
        break;
      case 'orders':
        cleanData = data.map(o => ({ id: o.id, order_no: o.order_no, client_name: o.client_name, date: o.date, status: o.status, total_amount: o.total_amount, paid_amount: o.paid_amount, notes: o.notes }));
        break;
      case 'purchases':
        cleanData = data.map(p => ({ id: p.id, purchase_no: p.purchase_no, supplier_name: p.supplier_name, date: p.date, status: p.status, total_amount: p.total_amount, paid_amount: p.paid_amount, notes: p.notes }));
        break;
      case 'transactions':
        cleanData = data.map(t => {
          let ref = '';
          if (t.notes && t.notes.startsWith('[Ref: ')) {
            const m = t.notes.match(/^\[Ref:\s*([^\]]+)\]/);
            if (m) ref = m[1];
          } else if (t.ref_id) {
            ref = 'TXN-' + t.ref_id;
          } else {
            ref = 'TXN-' + t.id;
          }
          return { id: t.id, date: t.date, type: t.type, ref_no: ref, party_name: t.party_name, amount: t.amount, mode: t.mode, notes: t.notes };
        });
        break;
      case 'expenses':
        cleanData = data.map(e => ({ id: e.id, ref_no: 'EXP-' + String(e.id).padStart(3, '0'), date: e.date, category: e.category, description: e.notes || '', amount: e.amount, payment_mode: e.payment_mode }));
        break;
      case 'suppliers':
        cleanData = data.map(s => ({ id: s.id, name: s.name, contact: s.contact, email: s.email, city: s.city, gst: s.gst, category: s.category, payment_terms: s.payment_terms, balance: s.balance }));
        break;
      case 'daily_transactions':
        cleanData = data.map(dt => {
          let tNo = dt.txn_no;
          if (tNo) {
            const m = String(tNo).match(/^(?:DTXN|D)-?(\d+)$/i);
            if (m) {
              let n = parseInt(m[1], 10);
              if (n >= 1000) n = n - 1000;
              tNo = `D-${String(n).padStart(2, '0')}`;
            }
          } else {
            tNo = dt.id ? `D-${String(dt.id).padStart(2, '0')}` : '-';
          }
          return { id: dt.id, txn_no: tNo, client_name: dt.client_name, date: dt.date, total_amount: dt.total_amount, paid_amount: dt.paid_amount, notes: dt.notes };
        });
        break;
    }
    
    UTILS.exportToExcel(cleanData, label);
  } catch (err) {
    APP.showToast('Export failed: ' + err.message, 'error');
  } finally {
    APP.hideSpinner();
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
  }
}

async function exportCSV(tableName, label, evt) {
  const triggerBtn = (evt && (evt.currentTarget || evt.target)) || (window.event && (window.event.currentTarget || window.event.target)) || document.activeElement;
  try {
    APP.showSpinner();
    const data = await fetchExportData(tableName);
    if (!data.length) { 
      APP.showToast('No data to export', 'warning'); 
      return; 
    }
    UTILS.exportToCSV(data, label);
  } catch (err) {
    APP.showToast('Export failed: ' + err.message, 'error');
  } finally {
    APP.hideSpinner();
    if (triggerBtn && typeof triggerBtn.blur === 'function') {
      triggerBtn.blur();
    }
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
  }
}

async function exportAllToExcel() {
  if (!window.XLSX) { APP.showToast('SheetJS not loaded', 'error'); return; }
  APP.showSpinner();
  try {
    const wb = XLSX.utils.book_new();
    const tables = ['clients', 'products', 'orders', 'purchases', 'transactions', 'expenses', 'suppliers', 'daily_transactions'];
    const names = ['Clients', 'Products', 'Orders', 'Purchases', 'Transactions', 'Expenses', 'Suppliers', 'Daily Transactions'];
    
    for (let i = 0; i < tables.length; i++) {
      const data = await fetchExportData(tables[i]);
      if (data.length) {
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, names[i]);
      }
    }
    
    XLSX.writeFile(wb, `AgroChem_ERP_Full_Export_${UTILS.todayStr()}.xlsx`);
    APP.showToast('Full database exported to Excel!', 'success');
  } catch(e) {
    APP.showToast('Export failed: ' + e.message, 'error');
  } finally {
    APP.hideSpinner();
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
  }
}

function importDatabase() {
  APP.showToast('Direct SQL database file import is disabled in MySQL server mode.', 'info');
}

function exportDatabase() {
  APP.showToast('Direct SQL database file export is disabled. Use Excel full export instead.', 'info');
}

function eraseAllData() {
  APP.showConfirm('⚠️ This will PERMANENTLY DELETE ALL DATA. You will be left with an empty database. Continue?', async () => {
    APP.showSpinner();
    try {
      const res = await fetch('/api/database/reset', { method: 'POST' });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || 'Failed to erase data');
      
      APP.showToast('Database cleared. Reloading...', 'warning');
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1000);
    } catch (err) {
      APP.showToast('Failed to reset database: ' + err.message, 'error');
    } finally {
      APP.hideSpinner();
    }
  });
}

function setExportPreset(type) {
  const fromEl = document.getElementById('export-date-from');
  const toEl = document.getElementById('export-date-to');
  if (!fromEl || !toEl) return;
  
  const today = new Date();
  const todayStr = UTILS.todayStr(); // YYYY-MM-DD
  
  switch(type) {
    case 'today':
      fromEl.value = todayStr;
      toEl.value = todayStr;
      break;
    case 'month':
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      fromEl.value = firstDay.toISOString().split('T')[0];
      toEl.value = todayStr;
      break;
    case 'year':
      fromEl.value = today.getFullYear() + '-01-01';
      toEl.value = todayStr;
      break;
    case 'all':
      fromEl.value = '';
      toEl.value = '';
      break;
  }
}

function selectAllExportModules(status) {
  const ids = ['orders', 'daily_transactions', 'purchases', 'transactions', 'expenses', 'products', 'clients', 'suppliers'];
  ids.forEach(id => {
    const el = document.getElementById('chk-' + id);
    if (el) el.checked = status;
  });
}

async function bulkExportCSV() {
  const fromEl = document.getElementById('export-date-from');
  const toEl = document.getElementById('export-date-to');
  const from = fromEl ? fromEl.value : '';
  const to = toEl ? toEl.value : '';
  
  const tables = [
    { id: 'orders', label: 'Sales_Orders' },
    { id: 'daily_transactions', label: 'Daily_Transactions' },
    { id: 'purchases', label: 'Purchase_Orders' },
    { id: 'transactions', label: 'Ledger_Transactions' },
    { id: 'expenses', label: 'Operational_Expenses' },
    { id: 'products', label: 'Products_Stock_Master' },
    { id: 'clients', label: 'Client_Registry_Master' },
    { id: 'suppliers', label: 'Supplier_Directory_Master' }
  ];
  
  const selectedTables = tables.filter(t => {
    const chk = document.getElementById('chk-' + t.id);
    return chk && chk.checked;
  });
  
  if (selectedTables.length === 0) {
    APP.showToast('Please select at least one module to export', 'warning');
    return;
  }
  
  APP.showSpinner();
  
  let exportCount = 0;
  
  for (let i = 0; i < selectedTables.length; i++) {
    const table = selectedTables[i];
    try {
      const data = await fetchExportData(table.id, from, to);
      
      if (data.length === 0) {
        APP.showToast(`No data found in ${table.label} for the selected dates`, 'warning');
        continue;
      }
      
      let rangeTag = 'All_Time';
      if (from && to) {
        rangeTag = `${from}_to_${to}`;
      } else if (from) {
        rangeTag = `from_${from}`;
      } else if (to) {
        rangeTag = `to_${to}`;
      }
      
      const fileName = `${table.label}_${rangeTag}`;
      UTILS.exportToCSV(data, fileName);
      exportCount++;
      
      await new Promise(resolve => setTimeout(resolve, 150));
    } catch (err) {
      console.error(`Failed to export ${table.label}:`, err);
      APP.showToast(`Failed to export ${table.label}`, 'error');
    }
  }
  
  APP.hideSpinner();
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }
  if (exportCount > 0) {
    APP.showToast(`Successfully exported ${exportCount} modules to CSV!`, 'success');
  }
}

async function downloadBackup() {
  try {
    APP.showSpinner();
    const tables = ['clients', 'suppliers', 'products', 'inventory_items', 'orders', 'order_items', 'purchases', 'purchase_items', 'transactions', 'accounts', 'expenses', 'daily_transactions', 'daily_transaction_items', 'formulations', 'formulation_ingredients'];
    
    const backupData = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      tables: {}
    };

    for (const t of tables) {
      try {
        const { data } = await window.dbClient.from(t).select('*');
        backupData.tables[t] = data || [];
      } catch (e) {
        console.warn('Backup skip table', t, e);
      }
    }

    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Anjani_ERP_Backup_${UTILS.todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    APP.showToast('Database backup downloaded successfully!', 'success');
  } catch (err) {
    console.error('Backup download error:', err);
    APP.showToast('Failed to download backup: ' + err.message, 'error');
  } finally {
    APP.hideSpinner();
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
  }
}

// Bind to window for inline HTML access
window.setExportPreset = setExportPreset;
window.selectAllExportModules = selectAllExportModules;
window.bulkExportCSV = bulkExportCSV;
window.exportTable = exportTable;
window.exportCSV = exportCSV;
window.exportAllToExcel = exportAllToExcel;
window.importDatabase = importDatabase;
window.exportDatabase = exportDatabase;
window.downloadBackup = downloadBackup;
window.eraseAllData = eraseAllData;

loadExports();
