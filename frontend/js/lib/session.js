// Who is using the app: a login token from the backend, or "guest" (a private guest for this browser). Kept in this browser only.
// Every read and write is guarded: storage can be blocked (private windows), and the app must still start as a guest.
const TOKEN_KEY = 'eklavya.token';
const USER_KEY = 'eklavya.user';
const GUEST_KEY = 'eklavya.guest';
const GUEST_TOKEN_KEY = 'eklavya.guestToken';

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key, value) {
  try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* keep going without it */ }
}

export const getToken = () => read(TOKEN_KEY);
/** A guest's private id on the server (one per browser). It is not a login: isSignedIn stays false. */
export const getGuestToken = () => read(GUEST_TOKEN_KEY);
export const saveGuestToken = (token) => write(GUEST_TOKEN_KEY, token);
/** What identifies this browser to the server: the login, else the private guest. */
export const authToken = () => getToken() ?? getGuestToken();

export function getUser() {
  try { return JSON.parse(read(USER_KEY) ?? 'null'); } catch { return null; }
}

/** Signed in: keep the token and who it belongs to. */
export function saveLogin({ token, user }) {
  write(TOKEN_KEY, token);
  write(USER_KEY, JSON.stringify(user));
  write(GUEST_KEY, null);
}

export function chooseGuest() {
  write(TOKEN_KEY, null);
  write(USER_KEY, null);
  write(GUEST_KEY, '1');
}

export function signOut() {
  write(TOKEN_KEY, null);
  write(USER_KEY, null);
  write(GUEST_KEY, null);
}

export const isSignedIn = () => Boolean(getToken());
/** The login screen shows until the visitor signs in or picks the demo. */
export const needsLogin = () => !getToken() && read(GUEST_KEY) !== '1';
