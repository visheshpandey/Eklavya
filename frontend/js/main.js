// Entry point: builds the store, services and controllers, then mounts each UI component on its element.
import { USER_ID } from './lib/config.js';
import { byId } from './lib/dom.js';
import { hydrateIcons } from './lib/icons.js';
import { SESSION_MODE } from './lib/protocol.js';
import { loadTheme } from './lib/theme.js';
import { backend } from './services/api-client.js';
import { shrinkPhoto } from './services/photo.js';
import { VoiceClient } from './services/voice-client.js';
import { createStore } from './state/store.js';
import { initialState, reducer, VIEWS } from './state/reducer.js';
import { actions } from './state/actions.js';
import { selectDashboard } from './state/selectors.js';
import { createNotifier } from './controllers/notifier.js';
import { createNotesController } from './controllers/notes-controller.js';
import { createSessionController } from './controllers/session-controller.js';
import { createHomeController } from './controllers/home-controller.js';
import { mountBanner } from './components/banner.js';
import { mountToasts } from './components/toasts.js';
import { mountAnnouncer } from './components/announcer.js';
import { mountI18n } from './components/i18n.js';
import { mountNavTabs } from './components/nav-tabs.js';
import { mountThemeToggle } from './components/theme-toggle.js';
import { mountOnboarding, onboardingDone } from './components/onboarding.js';
import { mountTodayView } from './components/today-view.js';
import { mountExamPlanner } from './components/exam-planner.js';
import { mountLibrary } from './components/library.js';
import { mountStudyHeader } from './components/study-header.js';
import { mountSessionOrb } from './components/session-orb.js';
import { mountStageTools } from './components/stage-tools.js';
import { mountCelebration } from './components/celebration.js';
import { mountStepper } from './components/stepper.js';
import { mountDebateTag } from './components/debate-tag.js';
import { mountTextInput } from './components/text-input.js';
import { mountChat } from './components/chat.js';
import { mountEmotionCard } from './components/emotion-card.js';
import { mountWhiteboard } from './components/whiteboard.js';
import { mountVivaCard } from './components/viva-card.js';
import { mountDebateScore } from './components/debate-score.js';
import { mountQuizCard } from './components/quiz-card.js';
import { mountSummaryCard } from './components/summary-card.js';
import { mountMissionCard } from './components/mission-card.js';
import { mountMasteryChart } from './components/mastery-chart.js';
import { mountConceptMap } from './components/concept-map.js';
import { mountFlashcards } from './components/flashcards.js';
import { mountResultsList } from './components/results-list.js';
import { mountStudyPack } from './components/study-pack.js';
import { mountAlertsList } from './components/alerts-list.js';
import { mountHistoryList } from './components/history-list.js';
import { mountDecisionLog } from './components/decision-log.js';
import { mountHeaderControls } from './components/header-controls.js';

hydrateIcons();

// --- state, services, controllers
const store = createStore(reducer, initialState);
store.dispatch(actions.themeChanged(loadTheme()));
const notifier = createNotifier(store);
const home = createHomeController({ store, backend, notifier, userId: USER_ID });

let session;   // the notes controller needs to end a session; the session controller needs the notes controller
const notes = createNotesController({ store, backend, notifier, userId: USER_ID, endSession: () => session.stop() });
session = createSessionController({ store, notes, notifier, userId: USER_ID, getLanguage: () => byId('lang').value,
  onProgress: home.refresh, preparePhoto: shrinkPhoto });

// --- app shell
mountBanner({ store, root: byId('banner') });
mountToasts({ store, root: byId('toasts') });
mountAnnouncer({ store, root: byId('announcer') });
mountI18n({ store });
mountNavTabs({ store, app: byId('app'), tablist: document.querySelector('#tabs [role="tablist"]'), onSelect: (view) => store.dispatch(actions.viewChanged(view)) });
mountThemeToggle({ store, button: byId('btnTheme'), onChange: (theme) => store.dispatch(actions.themeChanged(theme)) });
byId('lang').addEventListener('change', (event) => store.dispatch(actions.languageChanged(event.target.value)));

const openNotes = () => { store.dispatch(actions.viewChanged(VIEWS.LIBRARY)); byId('btnUpload').focus(); };
const startMode = (mode, topicId, options) => { notes.openTopic(topicId); return session.start(mode, topicId, options); };

mountOnboarding({
  store, dialog: byId('onboarding'),
  onLanguage: (language) => { byId('lang').value = language; store.dispatch(actions.languageChanged(language)); },
  onUpload: () => byId('file').click(),
  onDemo: () => notes.loadDemo(),
  onHello: () => session.start(SESSION_MODE.FREE),
  onClose: () => store.dispatch(actions.onboardingSet(false)),
});

// --- today
mountTodayView({ store, root: byId('today'), onStart: startMode, onOpenTopic: notes.openTopic, onAddNotes: openNotes });
mountExamPlanner({
  store, root: byId('planner'), onSave: home.savePlan, onClear: home.clearPlan,
  onStartItem: (item) => startMode({ learn: SESSION_MODE.LEARN, revise: SESSION_MODE.REVISE }[item.kind] ?? SESSION_MODE.TEST, item.topic_id),
});

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
  onRevise: (topicId) => session.start(SESSION_MODE.REVISE, topicId),
  onViva: (topicId) => session.start(SESSION_MODE.VIVA, topicId),
  onDebate: (topicId, options) => session.start(SESSION_MODE.DEBATE, topicId, options),
  onBrowse: () => store.dispatch(actions.viewChanged(VIEWS.LIBRARY)),
});
const orb = mountSessionOrb({ store, orb: byId('orb'), status: byId('status'), onToggle: session.toggle });
session.attach(new VoiceClient({ onEvent: session.handleEvent, onStatus: session.handleStatus, onLevel: orb.setLevel }));
mountStageTools({
  store, root: byId('stageTools'), captionRoot: byId('caption'),
  onToggleCaptions: () => store.dispatch(actions.captionsToggled()), onPhoto: session.sendPhoto,
});
mountCelebration({ store, root: byId('celebrate') });
mountStepper({ store, root: byId('stepper') });
mountDebateTag({ store, root: byId('debateTag') });
mountWhiteboard({ store, root: byId('board'), onPick: (index) => store.dispatch(actions.boardPicked(index)) });
mountVivaCard({ store, root: byId('viva') });
mountDebateScore({ store, root: byId('debateScore') });
mountQuizCard({ store, root: byId('quizcard'), onAnswer: session.sendText });
mountSummaryCard({ store, root: byId('summary') });
mountChat({ store, root: byId('chat') });
mountTextInput({ store, form: byId('textform'), input: byId('textin'), button: byId('textsend'), onSend: session.sendText });
mountEmotionCard({ store, root: byId('emotion') });

// --- progress section
mountMissionCard({ store, root: byId('mission') });
mountMasteryChart({ store, root: byId('chart') });
mountConceptMap({ store, root: byId('conceptMap'), onOpenTopic: notes.openTopic });
mountFlashcards({ store, root: byId('flashcards'), onLoad: home.loadFlashcards, onMake: home.makeFlashcards });
mountResultsList({ store, root: byId('results') });
mountStudyPack({ store, button: byId('btnPack'), packRoot: byId('printPack'), loadAllCards: async () => (await backend.flashcards(null, USER_ID)).cards });
mountAlertsList({ store, root: byId('alerts') });
mountHistoryList({ store, root: byId('history') });
mountDecisionLog({ store, root: byId('log') });

// every dashboard refresh (new notes, a graded answer) also refreshes Today, the plan, the map and results
store.select(selectDashboard, (dashboard) => { if (dashboard) home.refresh(); });

notes.refresh().then(() => { if (!onboardingDone()) store.dispatch(actions.onboardingSet(true)); });

// installable app: cache the page shell for offline start (only where service workers are allowed)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* the app works without it */ });
}
