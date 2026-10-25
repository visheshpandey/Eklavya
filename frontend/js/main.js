// Entry point: builds the store, services and controllers, then mounts each UI component on its element.
import { USER_ID } from './lib/config.js';
import { byId } from './lib/dom.js';
import { SESSION_MODE } from './lib/protocol.js';
import { backend } from './services/api-client.js';
import { VoiceClient } from './services/voice-client.js';
import { createStore } from './state/store.js';
import { initialState, reducer } from './state/reducer.js';
import { createNotifier } from './controllers/notifier.js';
import { createNotesController } from './controllers/notes-controller.js';
import { createSessionController } from './controllers/session-controller.js';
import { mountBanner } from './components/banner.js';
import { mountToasts } from './components/toasts.js';
import { mountSessionOrb } from './components/session-orb.js';
import { mountTextInput } from './components/text-input.js';
import { mountChat } from './components/chat.js';
import { mountPhaseBar } from './components/phase-bar.js';
import { mountEmotionCard } from './components/emotion-card.js';
import { mountQuizCard } from './components/quiz-card.js';
import { mountSummaryCard } from './components/summary-card.js';
import { mountTopicCard } from './components/topic-card.js';
import { mountMasteryList } from './components/mastery-list.js';
import { mountAlertsList } from './components/alerts-list.js';
import { mountMissionCard } from './components/mission-card.js';
import { mountHistoryList } from './components/history-list.js';
import { mountDecisionLog } from './components/decision-log.js';
import { mountHeaderControls } from './components/header-controls.js';

// --- state, services, controllers
const store = createStore(reducer, initialState);
const notifier = createNotifier(store);

let session;   // the notes controller needs to end a session; the session controller needs the notes controller
const notes = createNotesController({ store, backend, notifier, userId: USER_ID, endSession: () => session.stop() });
session = createSessionController({ store, notes, notifier, userId: USER_ID, getLanguage: () => byId('lang').value });
session.attach(new VoiceClient({ onEvent: session.handleEvent, onStatus: session.handleStatus }));

// --- components
mountBanner({ store, root: byId('banner') });
mountToasts({ store, root: byId('toasts') });
mountSessionOrb({ store, orb: byId('orb'), status: byId('status'), onToggle: session.toggle });
mountTextInput({ store, form: byId('textform'), input: byId('textin'), button: byId('textsend'), onSend: session.sendText });
mountChat({ store, root: byId('chat') });
mountPhaseBar({ store, root: byId('phase') });
mountEmotionCard({ store, root: byId('emotion') });
mountQuizCard({ store, root: byId('quizcard'), onAnswer: session.sendText });
mountSummaryCard({ store, root: byId('summary') });
mountTopicCard({
  store, root: byId('topic'),
  onLearn: (topicId) => session.start(SESSION_MODE.LEARN, topicId),
  onTest: (topicId) => session.start(SESSION_MODE.TEST, topicId),
});
mountMasteryList({ store, root: byId('mastery'), onOpenTopic: notes.openTopic });
mountAlertsList({ store, root: byId('alerts') });
mountMissionCard({ store, root: byId('mission') });
mountHistoryList({ store, root: byId('history') });
mountDecisionLog({ store, root: byId('log') });
mountHeaderControls({
  demoButton: byId('btnDemo'), uploadButton: byId('btnUpload'), fileInput: byId('file'),
  onLoadDemo: notes.loadDemo, onUpload: notes.uploadFile,
});

notes.refresh();
