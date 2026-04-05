// Runtime frontend config fallback.
// In production, backend /env.js route should override this file.
(function setAnimyxEnv() {
  const host = String(window.location.hostname || '').toLowerCase();
  const isLocal = host === 'localhost' || host === '127.0.0.1';

  // Local fallback keeps auth/sync features working in standalone frontend runs.
  // Use your own Supabase project's public anon key here.
  const localSupabaseUrl = 'https://euyjhepcpsockgsvtdhh.supabase.co';
  const localSupabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1eWpoZXBjcHNvY2tnc3Z0ZGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NDQwMDMsImV4cCI6MjA4OTQyMDAwM30.SbBN8CChFHyubAr2bopGG4Jbb6rdzzwB1AjFEhMCLGM';

  window.ENV = {
    API_BASE: isLocal ? 'http://localhost:5000/api' : '/api',
    SUPABASE_URL: isLocal ? localSupabaseUrl : '',
    SUPABASE_ANON_KEY: isLocal ? localSupabaseAnonKey : ''
  };
})();
