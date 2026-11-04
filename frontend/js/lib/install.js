// "Install Eklavya": the browser offers to put the app on the home screen (beforeinstallprompt, Chrome and Edge on Android and desktop).
// Where that is not offered (iPhone Safari, Firefox, or already installed) the button simply stays hidden.

/**
 * @param {object} deps
 * @param {(available: boolean) => void} deps.onAvailable show or hide the install button
 * @param {EventTarget} [deps.host] where the browser fires its events (the window)
 */
export function createInstaller({ onAvailable, host = globalThis }) {
  let saved = null;

  host.addEventListener?.('beforeinstallprompt', (event) => {
    event.preventDefault();   // keep the offer for our own button instead of the browser's mini bar
    saved = event;
    onAvailable(true);
  });
  host.addEventListener?.('appinstalled', () => { saved = null; onAvailable(false); });

  return {
    available: () => Boolean(saved),
    /** Show the browser's install dialog. Returns 'accepted', 'dismissed' or 'unavailable'. */
    async install() {
      if (!saved) return 'unavailable';
      const offer = saved;
      saved = null;           // a saved offer can be used once
      onAvailable(false);
      try {
        await offer.prompt();
        const choice = await offer.userChoice;
        return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
      } catch { return 'dismissed'; }
    },
  };
}
