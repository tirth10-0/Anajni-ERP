/* assets/js/database.js - Supabase Bridge Config */

const supabaseUrl = 'https://jtbettizhwwqmuyofapm.supabase.co';
const supabaseKey = 'sb_publishable_kSf8e6RD96lT40di2YqxxQ_gJ3WS6ve';

// Supabase CDN is loaded synchronously before this script
if (window.supabase) {
  const url = (typeof import_meta !== 'undefined' && import_meta.env) ? import_meta.env.VITE_SUPABASE_URL : supabaseUrl;
  const key = (typeof import_meta !== 'undefined' && import_meta.env) ? import_meta.env.VITE_SUPABASE_PUBLISHABLE_KEY : supabaseKey;
  window.dbClient = window.supabase.createClient(url, key, {
    auth: {
      storage: window.localStorage
    }
  });
} else {
  console.error("Supabase CDN script not loaded!");
}

window.DB = {
  initDB: async () => {
    console.log('AgroChem ERP Database Bridge Initialized (Connected to Supabase)');
    return true;
  }
};

window.INVENTORY_SERVICE = {
  async getItemStock(itemId) {
    if (!itemId) return 0;
    try {
      const { data: batches, error } = await window.dbClient
        .from('stock_batches')
        .select('current_qty')
        .eq('item_id', itemId)
        .eq('item_type', 'Inventory')
        .gt('current_qty', 0);
      if (error) throw error;
      if (!batches || batches.length === 0) {
        const { data: it } = await window.dbClient.from('inventory_items').select('stock').eq('id', itemId).single();
        return it ? Math.max(0, parseFloat(it.stock) || 0) : 0;
      }
      return batches.reduce((sum, b) => sum + (parseFloat(b.current_qty) || 0), 0);
    } catch (e) {
      console.warn('INVENTORY_SERVICE.getItemStock error:', e);
      return 0;
    }
  },

  async syncItemStock(itemId) {
    if (!itemId) return 0;
    try {
      // Clamp any negative batches to 0
      const { data: negBatches } = await window.dbClient
        .from('stock_batches')
        .select('id, current_qty')
        .eq('item_id', itemId)
        .eq('item_type', 'Inventory')
        .lt('current_qty', 0);
      if (negBatches && negBatches.length > 0) {
        for (const nb of negBatches) {
          await window.dbClient.from('stock_batches').update({ current_qty: 0 }).eq('id', nb.id);
        }
      }

      // Fetch all positive batches
      const { data: batches } = await window.dbClient
        .from('stock_batches')
        .select('current_qty')
        .eq('item_id', itemId)
        .eq('item_type', 'Inventory')
        .gt('current_qty', 0);

      const totalStock = (batches || []).reduce((sum, b) => sum + (parseFloat(b.current_qty) || 0), 0);
      await window.dbClient.from('inventory_items').update({ stock: totalStock }).eq('id', itemId);
      return totalStock;
    } catch (e) {
      console.warn('INVENTORY_SERVICE.syncItemStock error:', e);
      return 0;
    }
  },

  async deductStock(itemId, qtyToDeduct) {
    if (!itemId || !qtyToDeduct || qtyToDeduct <= 0) return 0;
    try {
      let remaining = parseFloat(qtyToDeduct) || 0;
      const { data: batches } = await window.dbClient
        .from('stock_batches')
        .select('id, current_qty')
        .eq('item_id', itemId)
        .eq('item_type', 'Inventory')
        .gt('current_qty', 0)
        .order('id', { ascending: true }); // FIFO: oldest batch first

      if (batches && batches.length > 0) {
        for (const b of batches) {
          if (remaining <= 0) break;
          const cur = parseFloat(b.current_qty) || 0;
          const deduct = Math.min(cur, remaining);
          const newQty = Math.max(0, cur - deduct);
          await window.dbClient.from('stock_batches').update({ current_qty: newQty }).eq('id', b.id);
          remaining -= deduct;
        }
      }
      return await this.syncItemStock(itemId);
    } catch (e) {
      console.warn('INVENTORY_SERVICE.deductStock error:', e);
      return 0;
    }
  },

  async restoreStock(itemId, qtyToRestore) {
    if (!itemId || !qtyToRestore || qtyToRestore <= 0) return 0;
    try {
      const restoreQty = parseFloat(qtyToRestore) || 0;
      const { data: batches } = await window.dbClient
        .from('stock_batches')
        .select('id, current_qty')
        .eq('item_id', itemId)
        .eq('item_type', 'Inventory')
        .order('id', { ascending: false }) // add back to latest batch
        .limit(1);

      if (batches && batches.length > 0) {
        const cur = Math.max(0, parseFloat(batches[0].current_qty) || 0);
        await window.dbClient.from('stock_batches').update({ current_qty: cur + restoreQty }).eq('id', batches[0].id);
      } else {
        const { data: it } = await window.dbClient.from('inventory_items').select('*').eq('id', itemId).single();
        if (it) {
          await window.dbClient.from('stock_batches').insert([{
            item_id: itemId,
            item_name: it.name,
            item_type: 'Inventory',
            batch_no: 'RESTORE-01',
            initial_qty: restoreQty,
            current_qty: restoreQty,
            unit: it.unit || 'Nos',
            purchase_price: 0
          }]);
        }
      }
      return await this.syncItemStock(itemId);
    } catch (e) {
      console.warn('INVENTORY_SERVICE.restoreStock error:', e);
      return 0;
    }
  },

  async reconcileAllStock() {
    try {
      const { data: items } = await window.dbClient.from('inventory_items').select('id');
      if (items && items.length > 0) {
        for (const it of items) {
          await this.syncItemStock(it.id);
        }
      }
      return true;
    } catch (e) {
      console.warn('INVENTORY_SERVICE.reconcileAllStock error:', e);
      return false;
    }
  }
};

