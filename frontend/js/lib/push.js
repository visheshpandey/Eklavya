// Web push for the daily reminder: ask permission, subscribe this device, or drop the subscription.
// Works in Chrome/Edge/Firefox and in the installed (Play Store) app; on iPhone only once the app is on the home screen.

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in globalThis && 'Notification' in globalThis;

function keyBytes(base64url) {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** Returns the subscription to send to the server. Throws an Error with a readable message when it cannot. */
export async function subscribeDevice(publicKey) {
  if (!pushSupported()) throw new Error('This browser cannot show notifications. Try Chrome, or install the app.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them for this site in your browser settings, then try again.');
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  return subscription.toJSON();
}

/** Stops notifications on this device. Returns the old subscription (the server forgets it too), or null. */
export async function unsubscribeDevice() {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return null;
  const json = subscription.toJSON();
  await subscription.unsubscribe();
  return json;
}

export async function deviceSubscribed() {
  if (!pushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  return Boolean(await registration?.pushManager.getSubscription());
}
