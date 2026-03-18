window.ENV = {
  API_BASE: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : '/api',
  SUPABASE_URL: 'https://qpnvkzhclaylvwbawmhq.supabase.co',
  // In production (Render single-service), /env.js is served dynamically by the backend.
  // Keep this blank to avoid hardcoding in built assets.
  SUPABASE_ANON_KEY: ''
};
