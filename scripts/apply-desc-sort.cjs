const fs = require('fs');
const path = require('path');

function updateFile(relPath, fn) {
  const fullPath = path.join(__dirname, '..', relPath);
  let content = fs.readFileSync(fullPath, 'utf8');
  const updated = fn(content);
  if (content !== updated) {
    fs.writeFileSync(fullPath, updated, 'utf8');
    console.log(`Updated ${relPath}`);
  } else {
    console.log(`No changes needed for ${relPath}`);
  }
}

// 1. purchases.js
updateFile('assets/js/purchases.js', (c) => {
  // Replace order('date', { ascending: false }) with order('id', { ascending: false })
  c = c.replace(
    /window\.dbClient\.from\('purchases'\)\.select\('\*'\)\.order\('date',\s*\{\s*ascending:\s*false\s*\}\)/,
    "window.dbClient.from('purchases').select('*').order('id', { ascending: false })"
  );
  // Sort allPurchases before renderTable
  c = c.replace(
    /allPurchases\.forEach\(p => \{[\s\S]*?\}\);\s*renderTable\(allPurchases\);/,
    (match) => {
      return match.replace(
        'renderTable(allPurchases);',
        'allPurchases = UTILS.sortByNumericIdDesc(allPurchases, p => p.purchase_no || p.id);\n    renderTable(allPurchases);'
      );
    }
  );
  // Ensure filterAndRender uses sortByNumericIdDesc
  c = c.replace(
    /filtered\s*=\s*UTILS\.sortByNumericIdDesc\(filtered,\s*p\s*=>\s*p\.purchase_no\);/,
    'filtered = UTILS.sortByNumericIdDesc(filtered, p => p.purchase_no || p.id);'
  );
  return c;
});

// 2. orders.js
updateFile('assets/js/orders.js', (c) => {
  c = c.replace(
    /window\.dbClient\.from\('orders'\)\.select\('\*'\)\.order\('created_at',\s*\{\s*ascending:\s*false\s*\}\)/,
    "window.dbClient.from('orders').select('*').order('id', { ascending: false })"
  );
  c = c.replace(
    /allOrders\s*=\s*ordersData\s*\|\|\s*\[\];/,
    'allOrders = UTILS.sortByNumericIdDesc(ordersData || [], o => o.order_no || o.id);'
  );
  return c;
});

// 3. daily-transactions.js
updateFile('assets/js/daily-transactions.js', (c) => {
  c = c.replace(
    /window\.dbClient\.from\('daily_transactions'\)\.select\('\*'\)\.order\('date',\s*\{ascending:\s*false\}\)/,
    "window.dbClient.from('daily_transactions').select('*').order('id', { ascending: false })"
  );
  c = c.replace(
    /allDailyTransactions\s*=\s*txnData\s*\|\|\s*\[\];/,
    'allDailyTransactions = UTILS.sortByNumericIdDesc(txnData || [], t => t.txn_no || t.id);'
  );
  c = c.replace(
    /return UTILS\.sortByNumericIdDesc\(list,\s*t\s*=>\s*t\.txn_no\);/,
    'return UTILS.sortByNumericIdDesc(list, t => t.txn_no || t.id);'
  );
  return c;
});

// 4. clients.js
updateFile('assets/js/clients.js', (c) => {
  c = c.replace(
    /window\.dbClient\.from\('clients'\)\.select\('\*'\);/,
    "window.dbClient.from('clients').select('*').order('id', { ascending: false });"
  );
  c = c.replace(
    /allClients\s*=\s*\(clientsData\s*\|\|\s*\[\]\)\.sort\(\(a,\s*b\)\s*=>\s*\(a\.name\s*\|\|\s*''\)\.localeCompare\(b\.name\s*\|\|\s*''\)\);/,
    'allClients = (clientsData || []).sort((a, b) => (b.id || 0) - (a.id || 0));'
  );
  c = c.replace(
    /filtered\s*=\s*\[\.\.\.filtered\]\.sort\(\(a,\s*b\)\s*=>\s*\(a\.name\s*\|\|\s*''\)\.localeCompare\(b\.name\s*\|\|\s*'',\s*undefined,\s*\{\s*sensitivity:\s*'base'\s*\}\)\);/,
    'filtered = [...filtered].sort((a, b) => (b.id || 0) - (a.id || 0));'
  );
  return c;
});

// 5. suppliers.js
updateFile('assets/js/suppliers.js', (c) => {
  c = c.replace(
    /window\.dbClient\.from\('suppliers'\)\.select\('\*'\);/,
    "window.dbClient.from('suppliers').select('*').order('id', { ascending: false });"
  );
  c = c.replace(
    /allSuppliers\s*=\s*\(suppliersData\s*\|\|\s*\[\]\)\.sort\(\(a,\s*b\)\s*=>\s*\(a\.name\s*\|\|\s*''\)\.localeCompare\(b\.name\s*\|\|\s*''\)\);/,
    'allSuppliers = (suppliersData || []).sort((a, b) => (b.id || 0) - (a.id || 0));'
  );
  c = c.replace(
    /filtered\s*=\s*\[\.\.\.filtered\]\.sort\(\(a,\s*b\)\s*=>\s*\(a\.name\s*\|\|\s*''\)\.localeCompare\(b\.name\s*\|\|\s*'',\s*undefined,\s*\{\s*sensitivity:\s*'base'\s*\}\)\);/,
    'filtered = [...filtered].sort((a, b) => (b.id || 0) - (a.id || 0));'
  );
  return c;
});

// 6. products.js
updateFile('assets/js/products.js', (c) => {
  c = c.replace(
    /window\.dbClient\.from\('products'\)\.select\('\*'\),/,
    "window.dbClient.from('products').select('*').order('id', { ascending: false }),"
  );
  c = c.replace(
    /allProducts\s*=\s*\(prodRes\.data\s*\|\|\s*\[\]\)\.sort\(\(a,\s*b\)\s*=>\s*\(a\.name\s*\|\|\s*''\)\.localeCompare\(b\.name\s*\|\|\s*'',\s*undefined,\s*\{\s*sensitivity:\s*'base'\s*\}\)\);/,
    'allProducts = (prodRes.data || []).sort((a, b) => (b.id || 0) - (a.id || 0));'
  );
  c = c.replace(
    /return list\.sort\(\(a,\s*b\)\s*=>\s*\(a\.name\s*\|\|\s*''\)\.localeCompare\(b\.name\s*\|\|\s*'',\s*undefined,\s*\{\s*sensitivity:\s*'base'\s*\}\)\);/,
    'return list.sort((a, b) => (b.id || 0) - (a.id || 0));'
  );
  return c;
});

// 7. inventory.js
updateFile('assets/js/inventory.js', (c) => {
  c = c.replace(
    /allInventory\.sort\(\(a,\s*b\)\s*=>\s*\(a\.name\s*\|\|\s*''\)\.localeCompare\(b\.name\s*\|\|\s*''\)\);/,
    'allInventory.sort((a, b) => (b.id || 0) - (a.id || 0));'
  );
  c = c.replace(
    /filtered\.sort\(\(a,\s*b\)\s*=>\s*\(a\.name\s*\|\|\s*''\)\.localeCompare\(b\.name\s*\|\|\s*''\)\);/,
    'filtered.sort((a, b) => (b.id || 0) - (a.id || 0));'
  );
  return c;
});

console.log('Finished applying last-added-first sorting.');
