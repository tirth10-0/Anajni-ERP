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
