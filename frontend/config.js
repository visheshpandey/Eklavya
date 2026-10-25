// Frontend environment config: the only place to change ports/URLs. Loaded as a plain script before the app.
//   apiBase  where the backend runs (must match backend PORT in backend/.env)
//   userId   the single demo student
// For a one-off test you can also open the page with ?api=http://localhost:5099
window.APP_CONFIG = {
  apiBase: 'http://localhost:5002',
  userId: 1,
};
