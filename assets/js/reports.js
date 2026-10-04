/* assets/js/reports.js */
let salesChart = null, expChart = null;
let currentReportData = null;

function updatePageDebug(text, color) {
  const el = document.getElementById('debug-page-status');
  if (el) {
    el.textContent = 'Page: ' + text;
    if (color) el.style.color = color;
  }
}

async function loadReports() {
  console.log('Loading reports...');
  updatePageDebug('Loading Reports...', '#0C3925');
  
  try {
    UTILS.setSkeletonText('rpt-revenue', 'w-50', true);
    UTILS.setSkeletonText('rpt-expenses', 'w-50', true);
    UTILS.setSkeletonText('rpt-purchases', 'w-50', true);
    UTILS.setSkeletonText('rpt-profit', 'w-50', true);
    UTILS.renderTableSkeleton('top-products-table', 5);
    UTILS.renderTableSkeleton('top-clients-table', 5);
    
    await DB.initDB();
    
    // Initialize date inputs to current financial year start (Jan 1) and today if empty
    const fromInput = document.getElementById('date-from');
    const toInput = document.getElementById('date-to');
    if (fromInput && toInput && !fromInput.value && !toInput.value) {
      const now = new Date();
      const year = now.getFullYear();
      fromInput.value = `${year}-01-01`;
      
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      toInput.value = `${year}-${month}-${day}`;
    }
    
    const from = fromInput ? fromInput.value : '';
    const to = toInput ? toInput.value : '';
    
    console.log(`Reports: Loading KPIs for range ${from} to ${to}...`);
    
    // Fetch data directly from Supabase
    let ordersQuery = window.dbClient.from('orders').select('*');
    let expensesQuery = window.dbClient.from('expenses').select('*');
    let purchasesQuery = window.dbClient.from('purchases').select('*');
    let clientsQuery = window.dbClient.from('clients').select('id, name');
    let orderItemsQuery = window.dbClient.from('order_items').select('*');

    if (from) {
      ordersQuery = ordersQuery.gte('date', from);
      expensesQuery = expensesQuery.gte('date', from);
      purchasesQuery = purchasesQuery.gte('date', from);
    }
    if (to) {
      ordersQuery = ordersQuery.lte('date', to);
      expensesQuery = expensesQuery.lte('date', to);
      purchasesQuery = purchasesQuery.lte('date', to);
    }

    const [
      { data: ordersData, error: oErr },
      { data: expensesData, error: eErr },
      { data: purchasesData, error: pErr },
      { data: clientsData, error: cErr },
      { data: orderItemsData, error: oiErr }
    ] = await Promise.all([
      ordersQuery,
      expensesQuery,
      purchasesQuery,
      clientsQuery,
      orderItemsQuery
    ]);

    if (oErr) throw oErr;
    if (eErr) throw eErr;
    if (pErr) throw pErr;

    const orders = ordersData || [];
    const expenses = expensesData || [];
    const purchases = purchasesData || [];
    const clients = clientsData || [];
    const orderItems = orderItemsData || [];

    // Filter delivered/completed orders for recognized revenue
    const deliveredOrders = orders.filter(o => {
      const st = String(o.status || '').toLowerCase();
      return st === 'delivered' || st === 'completed';
    });

    // 1. Summary KPIs
    const revenue = deliveredOrders.reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);
    const totalExpenses = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    const totalPurchases = purchases.reduce((s, p) => s + (parseFloat(p.total_amount) || 0), 0);
    const profit = revenue - totalExpenses - totalPurchases;

    // 2. Sales Trend (Monthly)
    const trendMap = {};
    deliveredOrders.forEach(o => {
      if (o.date) {
        const mo = String(o.date).substring(0, 7); // YYYY-MM
        trendMap[mo] = (trendMap[mo] || 0) + (parseFloat(o.total_amount) || 0);
      }
    });
    const sortedMonths = Object.keys(trendMap).sort();
    const salesTrend = sortedMonths.map(mo => ({ mo, total: trendMap[mo] }));

    // 3. Expenses by Category
    const expCatMap = {};
    expenses.forEach(e => {
      const cat = e.category || 'Other';
      expCatMap[cat] = (expCatMap[cat] || 0) + (parseFloat(e.amount) || 0);
    });
    const expensesByCategory = Object.entries(expCatMap)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);

    // 4. Top Products by Revenue
    const deliveredOrderIds = new Set(deliveredOrders.map(o => o.id));
    const prodMap = {};
    orderItems.forEach(it => {
      if (deliveredOrderIds.has(it.order_id)) {
        const pName = it.product_name || 'Item';
        if (!prodMap[pName]) prodMap[pName] = { product_name: pName, total_qty: 0, total_rev: 0 };
        prodMap[pName].total_qty += (parseFloat(it.quantity) || 0);
        prodMap[pName].total_rev += (parseFloat(it.total) || 0);
      }
    });
    const topProducts = Object.values(prodMap)
      .sort((a, b) => b.total_rev - a.total_rev)
      .slice(0, 8);

    // 5. Top Clients by Revenue
    const clientMap = {};
    deliveredOrders.forEach(o => {
      const cMatch = clients.find(c => String(c.id) === String(o.client_id));
      const cName = cMatch ? cMatch.name : (o.client_name || 'Guest Client');
      clientMap[cName] = (clientMap[cName] || 0) + (parseFloat(o.total_amount) || 0);
    });
    const topClients = Object.entries(clientMap)
      .map(([name, total_rev]) => ({ name, total_rev }))
      .sort((a, b) => b.total_rev - a.total_rev)
      .slice(0, 8);

    currentReportData = {
      summary: { revenue, expenses: totalExpenses, purchases: totalPurchases, profit },
      salesTrend,
      expensesByCategory,
      topProducts,
      topClients,
      raw: { orders, expenses, purchases }
    };
    
    renderSummaryKPIs(currentReportData.summary);
    renderSalesChart(currentReportData.salesTrend);
    renderExpenseChart(currentReportData.expensesByCategory);
    renderTopProducts(currentReportData.topProducts);
    renderTopClients(currentReportData.topClients);
    
    updatePageDebug('Ready', '#0C3925');
    console.log('Reports: All data loaded successfully');
  } catch (err) {
    console.error('Reports loadReports failed:', err);
    updatePageDebug('FAILED', '#EF4444');
    APP.showToast('Failed to load reports: ' + err.message, 'error');
  }
}

function renderSummaryKPIs(summary) {
  const revenue = parseFloat(summary.revenue || 0);
  const totalExp = parseFloat(summary.expenses || 0);
  const totalPurch = parseFloat(summary.purchases || 0);
  const profit = parseFloat(summary.profit || 0);

  const rEl = document.getElementById('rpt-revenue');
  const eEl = document.getElementById('rpt-expenses');
  const pEl = document.getElementById('rpt-purchases');
  const prEl = document.getElementById('rpt-profit');

  if (rEl) rEl.textContent = UTILS.fmtCurrency(revenue);
  if (eEl) eEl.textContent = UTILS.fmtCurrency(totalExp);
  if (pEl) pEl.textContent = UTILS.fmtCurrency(totalPurch);
  if (prEl) {
    prEl.textContent = UTILS.fmtCurrency(profit);
    prEl.style.color = profit >= 0 ? 'var(--success)' : 'var(--danger)';
  }
}

function renderSalesChart(trend) {
  const ctx = document.getElementById('sales-trend-chart');
  if (!ctx) return;
  UTILS.destroyChart(salesChart);
  
  if (trend.length === 0) {
    salesChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['No Data'],
        datasets: [{ label: 'Revenue (₹)', data: [0], borderColor: '#0C3925', backgroundColor: 'rgba(12, 57, 37,0.05)', fill: true }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
    return;
  }
  
  const labels = trend.map(x => x.mo);
  const totals = trend.map(x => parseFloat(x.total || 0));

  salesChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Revenue (₹)',
        data: totals,
        borderColor: '#0C3925',
        backgroundColor: 'rgba(12, 57, 37,0.12)',
        borderWidth: 2.5,
        fill: true,
        tension: 0.35,
        pointBackgroundColor: '#0C3925',
        pointRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ' ' + UTILS.fmtCurrency(ctx.parsed.y) } }
      },
      scales: {
        y: { ticks: { callback: v => '₹' + (v >= 1000 ? (v/1000).toFixed(0) + 'K' : v) }, grid: { color: 'rgba(255,255,255,0.05)' } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderExpenseChart(cats) {
  const ctx = document.getElementById('expense-trend-chart');
  if (!ctx) return;
  UTILS.destroyChart(expChart);
  
  const colors = ['#EF4444','#0C3925','#3B82F6','#F59E0B','#8B5CF6','#EC4899'];
  
  if (cats.length === 0) {
    expChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['No Data'],
        datasets: [{ label: 'Amount', data: [0], backgroundColor: '#E5E7EB', borderRadius: 6 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });
    return;
  }

  expChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: cats.map(c => c.category || 'Other'),
      datasets: [{
        label: 'Amount (₹)',
        data: cats.map(c => parseFloat(c.total) || 0),
        backgroundColor: colors.slice(0, cats.length),
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ' ' + UTILS.fmtCurrency(ctx.parsed.y) } }
      },
      scales: {
        y: { ticks: { callback: v => '₹' + (v >= 1000 ? (v/1000).toFixed(0) + 'K' : v) }, grid: { color: 'rgba(255,255,255,0.05)' } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderTopProducts(data) {
  const tbody = document.querySelector('#top-products-table tbody');
  if (!tbody) return;
  if (!data || !data.length) { 
    tbody.innerHTML = '<tr><td colspan="3" class="text-muted text-sm" style="padding:16px;text-align:center">No data in this period.</td></tr>'; 
    return; 
  }
  tbody.innerHTML = data.map((r, i) => `<tr>
    <td class="col-rank">#${i+1}</td>
    <td class="col-name">${r.product_name || '—'}</td>
    <td class="col-rev">${UTILS.fmtCurrency(r.total_rev)}</td>
  </tr>`).join('');
}

function renderTopClients(data) {
  const tbody = document.querySelector('#top-clients-table tbody');
  if (!tbody) return;
  if (!data || !data.length) { 
    tbody.innerHTML = '<tr><td colspan="3" class="text-muted text-sm" style="padding:16px;text-align:center">No data in this period.</td></tr>'; 
    return; 
  }
  tbody.innerHTML = data.map((r, i) => `<tr>
    <td class="col-rank">#${i+1}</td>
    <td class="col-name">${r.name || '—'}</td>
    <td class="col-rev">${UTILS.fmtCurrency(r.total_rev)}</td>
  </tr>`).join('');
}

function applyDateFilter() {
  const from = document.getElementById('date-from').value;
  const to = document.getElementById('date-to').value;
  if (!from || !to) { 
    APP.showToast('Select both from and to dates', 'warning'); 
    return; 
  }
  
  if (new Date(from) > new Date(to)) {
    APP.showToast('From date cannot be after To date', 'warning');
    return;
  }
  
  loadReports();
  APP.showToast('Report updated for selected date range', 'success');
}

function resetDateFilter() {
  const fromInput = document.getElementById('date-from');
  const toInput = document.getElementById('date-to');
  if (fromInput && toInput) {
    const now = new Date();
    const year = now.getFullYear();
    fromInput.value = `${year}-01-01`;
    
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    toInput.value = `${year}-${month}-${day}`;
    
    applyDateFilter();
  }
}

function exportReportToCSV() {
  if (!currentReportData) {
    APP.showToast('Report data not loaded yet', 'warning');
    return;
  }

  try {
    const from = document.getElementById('date-from').value;
    const to = document.getElementById('date-to').value;
    
    const summary = currentReportData.summary || {};
    const topProducts = currentReportData.topProducts || [];
    const topClients = currentReportData.topClients || [];
    
    const totalRevenue = parseFloat(summary.revenue || 0);
    const totalExpenses = parseFloat(summary.expenses || 0);
    const totalPurchases = parseFloat(summary.purchases || 0);
    const netProfit = parseFloat(summary.profit || 0);
    
    let csvContent = "\ufeff"; // BOM for Excel UTF-8
    csvContent += "Anjani Crop Care ERP Consolidated Business Analytics Report\r\n";
    csvContent += `Period: ${from || 'All Time'} to ${to || 'All Time'}\r\n\r\n`;
    
    csvContent += "FINANCIAL SUMMARY\r\n";
    csvContent += "Metric,Value (INR)\r\n";
    csvContent += `Total Revenue,${totalRevenue.toFixed(2)}\r\n`;
    csvContent += `Total Expenses,${totalExpenses.toFixed(2)}\r\n`;
    csvContent += `Total Purchases,${totalPurchases.toFixed(2)}\r\n`;
    csvContent += `Net Profit,${netProfit.toFixed(2)}\r\n\r\n`;
    
    csvContent += "TOP PRODUCTS BY REVENUE\r\n";
    csvContent += "Product,Quantity Sold,Revenue (INR)\r\n";
    topProducts.forEach(p => {
      csvContent += `"${p.product_name}",${parseFloat(p.total_qty || 0).toFixed(2)},${parseFloat(p.total_rev || 0).toFixed(2)}\r\n`;
    });
    csvContent += "\r\n";
    
    csvContent += "TOP CLIENTS BY REVENUE\r\n";
    csvContent += "Client,Revenue (INR)\r\n";
    topClients.forEach(c => {
      csvContent += `"${c.name}",${parseFloat(c.total_rev || 0).toFixed(2)}\r\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Anjani_ERP_Business_Report_${from}_to_${to}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    APP.showToast('CSV report exported successfully!', 'success');
  } catch (err) {
    console.error('Failed to export CSV:', err);
    APP.showToast('Export failed: ' + err.message, 'error');
  }
}

// Expose globals for inline HTML
window.applyDateFilter = applyDateFilter;
window.resetDateFilter = resetDateFilter;
window.exportReportToCSV = exportReportToCSV;

loadReports();
