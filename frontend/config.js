// Frontend environment config: the only place to change ports/URLs. Loaded as a plain script before the app.
//   apiBase  where the backend runs. Locally it must match backend PORT in backend/.env; deployed, it is the Render service URL.
//   userId   the demo student (used by the "Try the demo" guest mode)
// For a one-off test you can also open the page with ?api=http://localhost:5099
const local = ['localhost', '127.0.0.1', ''].includes(location.hostname);
window.APP_CONFIG = {
  apiBase: local ? 'http://localhost:5002' : 'https://eklavya-api-1bhf.onrender.com',
  userId: 1,
};
