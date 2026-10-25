// Entry point: builds the store, services and controllers, then mounts each UI component on its element.
import { USER_ID } from './lib/config.js';
import { byId } from './lib/dom.js';
import { hydrateIcons } from './lib/icons.js';
import { SESSION_MODE } from './lib/protocol.js';
import { loadTheme } from './lib/theme.js';
import { backend } from './services/api-client.js';
import { VoiceClient } from './services/voice-client.js';
import { createStore } from './state/store.js';
import { initialState, reducer, VIEWS } from './state/reducer.js';
import { actions } from './state/actions.js';
import { createNotifier } from './controllers/notifier.js';
import { createNotesController } from './controllers/notes-controller.js';
import { createSessionController } from './controllers/session-controller.js';
import { mountBanner } from './components/banner.js';
import { mountToasts } from './components/toasts.js';
import { mountAnnouncer } from './components/announcer.js';
import { mountNavTabs } from './components/nav-tabs.js';
import { mountThemeToggle } from './components/theme-toggle.js';
import { mountLibrary } from './components/library.js';
import { mountStudyHeader } from './components/study-header.js';
import { mountSessionOrb } from './components/session-orb.js';
import { mountStepper } from './components/stepper.js';
import { mountTextInput } from './components/text-input.js';
import { mountChat } from './components/chat.js';
import { mountEmotionCard } from './components/emotion-card.js';
import { mountQuizCard } from './components/quiz-card.js';
import { mountSummaryCard } from './components/summary-card.js';
import { mountMissionCard } from './components/mission-card.js';
import { mountMasteryChart } from './components/mastery-chart.js';
import { mountAlertsList } from './components/alerts-list.js';
import { mountHistoryList } from './components/history-list.js';
import { mountDecisionLog } from './components/decision-log.js';
import { mountHeaderControls } from './components/header-controls.js';

hydrateIcons();

// --- state, services, controllers
const store = createStore(reducer, initialState);
store.dispatch(actions.themeChanged(loadTheme()));
const notifier = createNotifier(store);

let session;   // the notes controller needs to end a session; the session controller needs the notes controller
const notes = createNotesController({ store, backend, notifier, userId: USER_ID, endSession: () => session.stop() });
session = createSessionController({ store, notes, notifier, userId: USER_ID, getLanguage: () => byId('lang').value });
session.attach(new VoiceClient({ onEvent: session.handleEvent, onStatus: session.handleStatus }));

// --- app shell
mountBanner({ store, root: byId('banner') });
mountToasts({ store, root: byId('toasts') });
mountAnnouncer({ store, root: byId('announcer') });
mountNavTabs({ store, app: byId('app'), tablist: document.querySelector('#tabs [role="tablist"]'), onSelect: (view) => store.dispatch(actions.viewChanged(view)) });
mountThemeToggle({ store, button: byId('btnTheme'), onChange: (theme) => store.dispatch(actions.themeChanged(theme)) });

// --- notes library
mountLibrary({
  store, root: byId('library'), searchInput: byId('librarySearch'),
  onOpenTopic: notes.openTopic,
  onToggleDocument: (documentId) => store.dispatch(actions.documentToggled(documentId)),
  onSearch: (text) => store.dispatch(actions.librarySearched(text)),
  onRemoveDocument: notes.removeDocument,
});
mountHeaderControls({
  demoButton: byId('btnDemo'), uploadButton: byId('btnUpload'), fileInput: byId('file'),
  onLoadDemo: notes.loadDemo, onUpload: notes.uploadFile,
});

// --- study section
mountStudyHeader({
  store, root: byId('studyHeader'),
  onLearn: (topicId) => session.start(SESSION_MODE.LEARN, topicId),
  onTest: (topicId) => session.start(SESSION_MODE.TEST, topicId),
  onBrowse: () => store.dispatch(actions.viewChanged(VIEWS.LIBRARY)),
});
mountSessionOrb({ store, orb: byId('orb'), status: byId('status'), onToggle: session.toggle });
mountStepper({ store, root: byId('stepper') });
mountQuizCard({ store, root: byId('quizcard'), onAnswer: session.sendText });
mountSummaryCard({ store, root: byId('summary') });
mountChat({ store, root: byId('chat') });
mountTextInput({ store, form: byId('textform'), input: byId('textin'), button: byId('textsend'), onSend: session.sendText });
mountEmotionCard({ store, root: byId('emotion') });

// --- progress section
mountMissionCard({ store, root: byId('mission') });
mountMasteryChart({ store, root: byId('chart') });
mountAlertsList({ store, root: byId('alerts') });
mountHistoryList({ store, root: byId('history') });
mountDecisionLog({ store, root: byId('log') });

notes.refresh();
