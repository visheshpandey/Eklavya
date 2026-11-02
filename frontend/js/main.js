// Entry point: builds the store, services and controllers, then mounts each UI component on its element.
import { USER_ID } from './lib/config.js';
import { byId } from './lib/dom.js';
import { t } from './lib/strings.js';
import { hydrateIcons } from './lib/icons.js';
import { SESSION_MODE, VOICE_STATUS } from './lib/protocol.js';
import { loadLanguage, saveLanguage } from './lib/language.js';
import { loadTheme } from './lib/theme.js';
import { createSound, loadSound, saveSound } from './lib/sound.js';
import { initialOf } from './lib/greeting.js';
import { backend } from './services/api-client.js';
import { shrinkPhoto } from './services/photo.js';
import { VoiceClient } from './services/voice-client.js';
import { createStore } from './state/store.js';
import { initialState, reducer, VIEWS } from './state/reducer.js';
import { actions } from './state/actions.js';
import { selectDashboard, selectLanguage, selectSelectedTopicId, selectSessionMission, selectToday, selectVoiceStatus, selectView } from './state/selectors.js';
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
import { mountTodayHome } from './components/today-home.js';
import { mountExamPlanner } from './components/exam-planner.js';
import { mountLibrary } from './components/library.js';
import { mountStudyHeader } from './components/study-header.js';
import { mountStudyLaunch } from './components/study-launch.js';
import { mountSessionOrb } from './components/session-orb.js';
import { mountStageTools } from './components/stage-tools.js';
import { selectConceptMap } from './state/selectors.js';
import { canScene, mountGraph, mountHeroScene, startMotion } from './motion/index.js';
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
import { mountMasteryRows } from './components/mastery-rows.js';
import { mountConceptMap } from './components/concept-map.js';
import { mountMasteryRing } from './components/mastery-ring.js';
import { mountFlashcards } from './components/flashcards.js';
import { mountFlashcardReview } from './components/flashcard-review.js';
import { mountResultsList } from './components/results-list.js';
import { mountStudyPack } from './components/study-pack.js';
import { mountAlertsList } from './components/alerts-list.js';
import { mountHistoryList } from './components/history-list.js';
import { mountDecisionLog } from './components/decision-log.js';
import { mountHeaderControls } from './components/header-controls.js';
import { mountStatTiles } from './components/stat-tiles.js';
import { mountAuthDialog } from './components/auth-dialog.js';
import { mountAccountDialog } from './components/account-dialog.js';
import { mountLinkImport } from './components/link-import.js';
import { unsubscribeDevice } from './lib/push.js';
import { loadTutor, saveTutor } from './lib/tutor.js';
import { mountAsk } from './components/ask-view.js';
import { mountBadges } from './components/badges-view.js';
import { mountMockExam } from './components/mock-exam.js';
import { mountGroups } from './components/groups-view.js';
import { mountDemoCircle } from './components/demo-circle.js';
import { mountAvatar } from './components/avatar.js';
import { mountMentorFrame } from './avatar/system.js';
import { mountCallScreen } from './components/call-screen.js';
import { mountReconnectPrompt } from './components/reconnect-prompt.js';
import { mountChallenge } from './components/challenge-view.js';
import { mountRail } from './components/rail.js';
import { mountIntro } from './components/intro.js';
import { chooseGuest, getUser, isSignedIn, needsLogin, saveLogin, signOut } from './lib/session.js';
import { mountCommandMenu } from './components/command-menu.js';

hydrateIcons();
const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const params = new URLSearchParams(location.search);

// --- state, services, controllers
const store = createStore(reducer, initialState);
store.dispatch(actions.themeChanged(loadTheme()));
store.dispatch(actions.languageChanged(loadLanguage()));
byId('lang').value = selectLanguage(store.getState());            // the selector shows the remembered language
store.select(selectLanguage, (language) => { saveLanguage(language); byId('lang').value = language; });
const notifier = createNotifier(store);
const home = createHomeController({ store, backend, notifier, userId: USER_ID, onMastery: () => notes?.refresh() });   // a rating changes mastery: reload it everywhere

let session;   // the notes controller needs to end a session; the session controller needs the notes controller
const notes = createNotesController({ store, backend, notifier, userId: USER_ID, endSession: () => session.stop() });
session = createSessionController({ store, notes, notifier, userId: USER_ID, getLanguage: () => byId('lang').value, getTutor: () => byId('tutor').value,
  onProgress: home.refresh, preparePhoto: shrinkPhoto });

// what the student last started, so finishing it can tick off a step of today's route
let launch = null;
const startSession = session.start;
session.start = (mode, topicId, options) => { launch = { mode, at: Date.now() }; return startSession(mode, topicId, options); };

// --- app shell
mountBanner({ store, root: byId('banner') });
mountToasts({ store, root: byId('toasts') });
mountAnnouncer({ store, root: byId('announcer') });
mountI18n({ store });
const onTab = (view) => store.dispatch(actions.viewChanged(view));
mountNavTabs({ store, app: byId('app'), tablist: document.querySelector('#tabs [role="tablist"]'), onSelect: onTab });
mountNavTabs({ store, app: byId('app'), tablist: document.querySelector('#mtabs [role="tablist"]'), onSelect: onTab });
mountThemeToggle({ store, button: byId('btnTheme'), onChange: (theme) => store.dispatch(actions.themeChanged(theme)) });
byId('tutor').value = loadTutor();
byId('tutor').addEventListener('change', (event) => saveTutor(event.target.value));
byId('lang').addEventListener('change', (event) => store.dispatch(actions.languageChanged(event.target.value)));   // also saved, see above
if (/Mac|iPhone|iPad/.test(navigator.platform || '')) byId('kbdHint').textContent = '⌘ K';
store.select(selectVoiceStatus, (status) => { byId('app').dataset.live = status === VOICE_STATUS.IDLE ? 'off' : 'on'; });   // a live call hides the picker above it

// phones: the settings menu opens from the "..." button, closes on Escape, on a click elsewhere and when a screen is chosen
const topMenu = byId('topMenu');
const setMenu = (open) => { topMenu.classList.toggle('open', open); byId('btnMore').setAttribute('aria-expanded', String(open)); };
byId('btnMore').addEventListener('click', (event) => { event.stopPropagation(); setMenu(!topMenu.classList.contains('open')); });
document.addEventListener('click', (event) => { if (!event.target.closest('#topMenu')) setMenu(false); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && topMenu.classList.contains('open')) { setMenu(false); byId('btnMore').focus(); } });
store.select(selectView, () => setMenu(false));
// phones: the streak chip opens the streak card as a sheet
const streakSheet = byId('streakSheet');
const setStreak = (open) => { streakSheet.hidden = !open; byId('btnStreak').setAttribute('aria-expanded', String(open)); };
byId('btnStreak').addEventListener('click', (event) => { event.stopPropagation(); setStreak(streakSheet.hidden); });
document.addEventListener('click', (event) => { if (!event.target.closest('#streakSheet')) setStreak(false); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !streakSheet.hidden) { setStreak(false); byId('btnStreak').focus(); } });
store.select(selectView, () => setStreak(false));

// sound: a soft page turn when things flip or open, and "Listen" on an answer
const sound = createSound({ on: loadSound() });
const drawSound = () => {
  const button = byId('soundBtn');
  button.setAttribute('aria-pressed', String(sound.isOn()));
  button.firstElementChild.textContent = sound.isOn() ? 'Sound on' : 'Sound off';
};
drawSound();
byId('soundBtn').addEventListener('click', () => { sound.set(!sound.isOn()); saveSound(sound.isOn()); drawSound(); if (sound.isOn()) sound.pageTurn(); });
let firstView = true;
store.select(selectView, () => { if (firstView) { firstView = false; return; } sound.pageTurn(); window.scrollTo({ top: 0 }); });

const openNotes = () => { store.dispatch(actions.viewChanged(VIEWS.LIBRARY)); byId('btnUpload').focus(); };
const showView = (view) => store.dispatch(actions.viewChanged(view));
const startMode = (mode, topicId, options) => { notes.openTopic(topicId); return session.start(mode, topicId, options); };

mountOnboarding({
  store, dialog: byId('onboarding'),
  onLanguage: (language) => { byId('lang').value = language; store.dispatch(actions.languageChanged(language)); },
  onUpload: () => byId('file').click(),
  onDemo: () => notes.loadDemo(),
  onHello: () => session.start(SESSION_MODE.FREE),
  onClose: () => store.dispatch(actions.onboardingSet(false)),
});

// --- practice and social: mock exam, badges, doubts, groups, challenges
const mockExam = mountMockExam({
  dialog: byId('exam'), block: byId('mock'),
  onStart: backend.startMockExam, onSubmit: backend.submitMockExam, onHistory: backend.mockExams,
  onDone: () => { notes.refresh(); home.refresh(); },   // the exam moved mastery
});
const badges = mountBadges({ root: byId('badges'), onLoad: backend.badges });
const topicsOf = () => selectDashboard(store.getState())?.mastery ?? [];
const ask = mountAsk({
  chatRoot: byId('askChat'), listRoot: byId('doubts'), sourcesRoot: byId('srcList'), recentRoot: byId('recentDoubts'), recentWrap: byId('recentWrap'),
  onAsk: (question) => backend.ask(question, byId('lang').value),
  onList: backend.doubts, onDelete: backend.deleteDoubt, onClear: backend.clearDoubts,
  topics: () => [...topicsOf()].sort((a, b) => a.mastery_score - b.mastery_score).map((topic) => topic.topic_name),
  subjects: topicsOf, sound, onListen: (text) => sound.speak(text, byId('lang').value === 'hindi' ? 'hi-IN' : 'en-IN'),
});
store.select(selectDashboard, () => ask.redrawSide());

// --- today: the guided path on top, the older plan and exam planner below
const reviewCards = () => showView(VIEWS.FLASHCARDS);
const todayHome = mountTodayHome({
  store, head: byId('todayHead'), hero: byId('todayHero'), route: byId('route'), subjects: byId('subjects'), quote: byId('quote'),
  talkButton: byId('talkIt'), mapButton: byId('seeMap'), getName: () => getUser()?.name ?? '', reduceMotion, mountScene: mountHeroScene,
  onStartSession: (mode, topicId) => startMode(mode, topicId),
  onReviewCards: reviewCards, onAddNotes: openNotes,
  onSubject: (topicId) => { showView(VIEWS.PROGRESS); conceptMap.select(topicId); },
  onTalk: () => { showView(VIEWS.STUDY); session.start(SESSION_MODE.FREE); },
  onMap: () => showView(VIEWS.PROGRESS),
});
store.select(selectVoiceStatus, (status, previous) => {   // finishing a session that lasted a few seconds ticks off its step of the route
  if (status !== VOICE_STATUS.IDLE || !launch || Date.now() - launch.at < 4000) return;
  if (launch.mode === SESSION_MODE.REVISE) todayHome.markDone('recall');
  else if ([SESSION_MODE.LEARN, SESSION_MODE.TEST, SESSION_MODE.VIVA, SESSION_MODE.DEBATE].includes(launch.mode)) todayHome.markDone('concept');
  launch = null;
});
store.select(selectToday, (today) => { if (today && (today.cards_total ?? 0) > 0 && today.cards_due === 0) todayHome.markDone('cards'); });
mountTodayView({ store, root: byId('todayMore'), onStart: startMode, onOpenTopic: notes.openTopic, onAddNotes: openNotes, onReviewCards: reviewCards });
mountExamPlanner({
  store, root: byId('planner'), onSave: home.savePlan, onClear: home.clearPlan,
  onOpenItem: (item) => notes.openTopic(item.topic_id),   // a day chip opens the topic; the Start buttons on Today's plan start a session
});
// the opening animation plays once per visit (not for a link to a specific screen, not with reduced motion)
const intro = mountIntro({
  intro: byId('intro'), frame: document.querySelector('.frame'), nav: byId('mtabs'), skip: byId('skip'),
  getDesk: () => document.getElementById('desk'), reduceMotion,
  deepLink: Boolean(params.get('view') || params.get('reset') || location.hash.slice(1)) || needsLogin(),   // not behind the login screen: it plays after signing in
});

mountRail({ store, streakDays: byId('streakDays'), streakUnit: byId('streakUnit'), streakText: byId('streakNote'), weekDots: byId('weekDots'), dueBadge: byId('dueNav'), crumb: byId('crumb') });

// --- command menu and shortcuts
const topicRows = (state) => (selectDashboard(state)?.mastery ?? []).map((topic) => ({ ...topic, open: () => { notes.openTopic(topic.topic_id); showView(VIEWS.STUDY); } }));
const withTopic = (mode) => () => { showView(VIEWS.STUDY); return session.start(mode, selectSelectedTopicId(store.getState())); };
let flashReview;   // set below; the command menu only calls it later
mountCommandMenu({
  store, dialog: byId('command'), trigger: byId('btnCommand'), topics: topicRows,
  onNoMatch: (question) => { showView(VIEWS.ASK); ask.askNow(question); },
  actions: [
    { key: 'T', label: 'Teach me this, then test me', needsTopic: true, run: withTopic(SESSION_MODE.LEARN) },
    { key: 'Q', label: 'Just test me', needsTopic: true, run: withTopic(SESSION_MODE.TEST) },
    { key: 'M', label: 'Start or stop talking', hint: 'Voice session', run: () => { showView(VIEWS.STUDY); session.toggle(); } },
    { key: 'D', label: 'Debate Eklavya on this topic', needsTopic: true, run: () => { showView(VIEWS.STUDY); document.querySelector('.study-details .debate')?.setAttribute('open', ''); byId('studyHeader').scrollIntoView(); } },
    { key: 'E', label: 'Take a mock exam', hint: 'Timed paper', run: () => { showView(VIEWS.PROGRESS); mockExam.open(); } },
    { key: 'R', label: 'Start a mock round', hint: 'All flashcards, shuffled', run: () => { showView(VIEWS.FLASHCARDS); flashReview.startMock(); } },
    { key: 'U', label: 'Upload notes', hint: 'PDF, text or a photo', run: () => { openNotes(); byId('file').click(); } },
  ],
  pages: [
    { label: 'Today', hint: 'Plan and streak', badge: '→', run: () => showView(VIEWS.TODAY) },
    { label: 'My notes', hint: 'Your library', badge: '→', run: () => showView(VIEWS.LIBRARY) },
    { label: 'Study room', hint: 'Voice study', badge: '→', run: () => showView(VIEWS.STUDY) },
    { label: 'Ask Eklavya', hint: 'Type a question, search past doubts', badge: '→', run: () => showView(VIEWS.ASK) },
    { label: 'Progress', hint: 'Mastery, mistakes, badges', badge: '→', run: () => showView(VIEWS.PROGRESS) },
    { label: 'Flashcards', hint: 'Review what is due', badge: '→', run: () => showView(VIEWS.FLASHCARDS) },
    { label: 'Study groups', hint: 'Study together, challenges', badge: '→', run: () => showView(VIEWS.GROUPS) },
  ],
});

// --- notes library
mountLibrary({
  store, root: byId('libraryList'), searchInput: byId('librarySearch'),
  onOpenTopic: notes.openTopic,
  onToggleDocument: (documentId) => store.dispatch(actions.documentToggled(documentId)),
  onSearch: (text) => store.dispatch(actions.librarySearched(text)),
  onRemoveDocument: notes.removeDocument,
});
mountLinkImport({ root: byId('linkImport'), onImport: notes.importLink });
mountHeaderControls({
  demoButton: byId('btnDemo'), uploadButton: byId('btnUpload'), fileInput: byId('file'), dropZone: byId('drop'),
  onLoadDemo: notes.loadDemo, onUpload: notes.uploadFile,
});

// --- study room
mountStudyLaunch({
  store, orbit: byId('orbit'), ring: byId('ring'), modes: byId('modes'), startTalk: byId('startTalk'), studyFor: byId('studyFor'), reduceMotion,
  onPick: (topicId) => notes.openTopic(topicId),
  onStart: (mode, topicId, options) => (mode === 'free' ? session.start(SESSION_MODE.FREE) : startMode(mode, topicId, options)),
  onAddNotes: openNotes,
});
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
const getTutor = () => byId('tutor').value;
const avatar = mountAvatar({ store, root: byId('avatar'), getTutor });
// the conversation is exactly as tall as the mentor frame beside it
const studyGrid = document.querySelector('.study-grid');
if (studyGrid && globalThis.ResizeObserver) new ResizeObserver(() => { const frame = byId('mentorFrame'); if (frame.clientHeight) studyGrid.style.setProperty('--frame-h', `${frame.clientHeight}px`); }).observe(byId('mentorFrame'));
let voiceClient = null;
const mentor = mountMentorFrame({ store, frame: byId('mentorFrame'), base: avatar, config: globalThis.APP_CONFIG ?? {}, reduceMotion, hasWebGL: canScene(),
  setPlaybackMuted: (muted) => voiceClient?.setPlaybackMuted(muted) });   // the frame: the best avatar that is available, with fallbacks
const callScreen = mountCallScreen({ store, root: byId('call'), frame: byId('mentorFrame'), openButton: byId('btnCallScreen'), onEnd: () => session.stop(), onPhoto: (file) => session.sendPhoto(file) });
byId('tutor').addEventListener('change', (event) => mentor.setTutor(event.target.value));
mentor.setTutor(getTutor());
voiceClient = new VoiceClient({
  onEvent: session.handleEvent, onStatus: session.handleStatus,
  onLevel: (level, bands) => { globalThis.eklavyaLevel = level; orb.setLevel(level); mentor.setLevel(level, bands); },   // one voice level moves the orb and the mentor
  onAudio: (chunk) => mentor.feedAudio(chunk),
  onInterrupt: () => mentor.interrupt(),
});
session.attach(voiceClient);
mountStageTools({
  store, root: byId('stageTools'), captionRoot: byId('caption'),
  onToggleCaptions: () => store.dispatch(actions.captionsToggled()), onPhoto: session.sendPhoto,
});
mountCelebration({ store, root: byId('celebrate') });
mountReconnectPrompt({ store, root: byId('reconnect'), onReconnect: () => session.reconnect() });
mountStepper({ store, root: byId('stepper') });
mountDebateTag({ store, root: byId('debateTag') });
mountWhiteboard({ store, root: byId('board'), onPick: (index) => store.dispatch(actions.boardPicked(index)) });
mountVivaCard({ store, root: byId('viva') });
mountDebateScore({ store, root: byId('debateScore') });
mountQuizCard({ store, root: byId('quizcard'), onAnswer: session.sendText });
mountSummaryCard({ store, root: byId('summary') });
mountMissionCard({ store, root: byId('studyMission'), select: selectSessionMission, heading: 'Your next mission' });
mountChat({ store, root: byId('chat') });
mountTextInput({ store, form: byId('textform'), input: byId('textin'), button: byId('textsend'), onSend: session.sendText });
mountEmotionCard({ store, root: byId('emotion') });

// --- progress
mountStatTiles({ store, root: byId('statTiles') });
mountMissionCard({ store, root: byId('mission') });
mountMasteryChart({ store, root: byId('chart') });
mountMasteryRows({ store, root: byId('masteryRows') });
mountMasteryRing({ store, root: byId('masteryRing') });
const graph3d = mountGraph(byId('graph3d'), (id) => conceptMap.select(id));   // the 3D version of the map; the page's own cards and list stay
const conceptMap = mountConceptMap({
  store, root: byId('conceptMap'), onSelected: (id) => graph3d.focus(id), onAddNotes: openNotes,
  onTest: (topicId) => { showView(VIEWS.STUDY); startMode(SESSION_MODE.TEST, topicId); },
  onStudy: (topicId) => { showView(VIEWS.STUDY); startMode(SESSION_MODE.LEARN, topicId); },
  onAsk: (topicName) => { showView(VIEWS.ASK); ask.askNow(`Explain ${topicName} in simple words.`); },
});
store.select(selectConceptMap, (map) => graph3d.update(map));
mountResultsList({ store, root: byId('results') });
mountStudyPack({
  store, button: byId('btnPack'), packRoot: byId('printPack'),
  loadPackData: async () => {
    const [cards, boards] = await Promise.allSettled([backend.flashcards(null, USER_ID), backend.boardsToday(USER_ID)]);
    return { cards: cards.value?.cards ?? [], boards: boards.value?.boards ?? null };
  },
});
mountAlertsList({ store, root: byId('alerts') });
mountHistoryList({ store, root: byId('history') });
mountDecisionLog({ store, root: byId('log') });

// --- flashcards: today's cards on a flip card, plus the decks (make cards, browse, mistakes)
flashReview = mountFlashcardReview({
  store, root: byId('fcReview'), sound, onNeedNotes: openNotes,
  onLoadDue: home.dueCards, onLoadAll: home.allCards,
  onRate: (card, value) => home.rateCard(card.id, value === 'known', value === 'hard'),
  today: () => selectToday(store.getState())?.date ?? new Date().toISOString().slice(0, 10),
  onSpeak: (text) => sound.speak(text, byId('lang').value === 'hindi' ? 'hi-IN' : 'en-IN'),
});
// the ⋯ menu on Flashcards: reset today's deck, mock round
const fcMenu = byId('fcMenu');
const setFcMenu = (open) => { fcMenu.hidden = !open; byId('fcMore').setAttribute('aria-expanded', String(open)); };
byId('fcMore').addEventListener('click', (event) => { event.stopPropagation(); setFcMenu(fcMenu.hidden); });
document.addEventListener('click', (event) => { if (!event.target.closest('.fc-menu')) setFcMenu(false); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !fcMenu.hidden) { setFcMenu(false); byId('fcMore').focus(); } });
fcMenu.addEventListener('click', () => setFcMenu(false));
mountFlashcards({ store, root: byId('fcDecks'), onLoad: home.loadFlashcards, onMake: home.makeFlashcards });
const mockRound = () => { showView(VIEWS.FLASHCARDS); flashReview.startMock(); };
byId('mockRoundBtn').addEventListener('click', mockRound);
byId('mockRoundBtn2').addEventListener('click', mockRound);
byId('resetDeck').addEventListener('click', async () => { if (await home.resetDeck()) { await flashReview.refresh(); notifier.success('Today\'s deck is reset: every card is due again.'); } });

// every dashboard refresh (new notes, a graded answer) also refreshes Today, the plan, the map and results
store.select(selectDashboard, (dashboard) => { if (dashboard) home.refresh(); });

// --- accounts: the login screen shows until the visitor signs in or picks the demo
const signedIn = isSignedIn();
let serverFeatures = null;   // what the server has switched on (Google, email); the login screen adapts
const cleanAddress = () => {   // reload without one-time parameters (a used reset link, a notification's view); keep the rest
  const url = new URL(location.href);
  ['reset', 'view'].forEach((key) => url.searchParams.delete(key));
  url.hash = '';   // signing in or out starts again from Today, and the opening animation can play
  return url.href;
};
const finishLogin = (result) => { saveLogin(result); location.replace(cleanAddress()); };
const leave = async () => {   // sign out: this device stops getting the old account's reminders
  try { const old = await unsubscribeDevice(); if (old) await backend.pushUnsubscribe(old); } catch { /* signing out still works */ }
  signOut();
  location.replace(cleanAddress());
};
const authDialog = mountAuthDialog({
  dialog: byId('auth'), mustChoose: needsLogin, features: () => serverFeatures,
  onSignIn: async (credentials) => finishLogin(await backend.login(credentials)),
  onSignUp: async (details) => finishLogin(await backend.signup(details)),
  onGoogle: async (credential) => finishLogin(await backend.google(credential)),
  onForgot: (email) => backend.forgotPassword(email),
  onReset: async (token, password) => finishLogin(await backend.resetPassword(token, password)),
  onGuest: () => { if (signedIn || needsLogin()) { chooseGuest(); location.replace(cleanAddress()); } else authDialog.close(); },
});
backend.authConfig().then((features) => { serverFeatures = features; authDialog.refresh(); }).catch(() => { /* no extras: email and password still work */ });
const accountDialog = mountAccountDialog({
  dialog: byId('account'), backend, onSignOut: leave,
  onDeleted: () => { signOut(); location.replace(cleanAddress()); },
});
const me = getUser();
byId('accountText').textContent = signedIn ? (me?.name || 'Account') : 'Sign in';
byId('meAvatar').textContent = initialOf(signedIn ? me?.name : '');
byId('meSub').textContent = signedIn ? (me?.email ?? 'Signed in') : 'Demo learner';
byId('btnSignIn').hidden = signedIn;                       // a guest always sees a clear way to sign in or create an account
byId('btnSignIn').addEventListener('click', () => authDialog.open());
byId('btnAccountTop').hidden = !signedIn;
for (const button of [byId('btnAccount'), byId('btnAccountTop')]) {
  button.setAttribute('aria-label', signedIn ? `Your account (${me?.email ?? 'signed in'})` : 'Sign in or create an account');
  button.title = signedIn ? 'Account, reminders, sign out' : 'Sign in';
  button.addEventListener('click', () => { if (signedIn) accountDialog.open(); else authDialog.open(); });
}

const opened = params.get('view');   // a reminder notification opens ?view=today
if (Object.values(VIEWS).includes(opened)) store.dispatch(actions.viewChanged(opened));
// the address follows the screen (#progress, #flashcards...), so a link or a reload lands in the same place
const validView = (name) => Object.values(VIEWS).includes(name);
if (!opened && validView(location.hash.slice(1))) store.dispatch(actions.viewChanged(location.hash.slice(1)));
store.select(selectView, (view) => { if (location.hash.slice(1) !== view) history.replaceState(null, '', `#${view}`); });
globalThis.addEventListener('hashchange', () => { if (validView(location.hash.slice(1))) store.dispatch(actions.viewChanged(location.hash.slice(1))); });
if (params.get('reset')) authDialog.open('reset', params.get('reset'));
else if (needsLogin()) authDialog.open();
else notes.refresh().then(() => intro.whenDone(() => { if (!onboardingDone()) store.dispatch(actions.onboardingSet(true)); }));   // the guide waits for the intro

const documentsOf = () => {
  const seen = new Map();
  for (const topic of selectDashboard(store.getState())?.mastery ?? []) seen.set(topic.document_id, topic.document);
  return [...seen].map(([id, name]) => ({ id, name }));
};
const openSignIn = () => authDialog.open();
const guestCircleRoot = document.createElement('div');
guestCircleRoot.className = 'guest-circle';
mountDemoCircle({ store, root: guestCircleRoot, api: backend, onSignIn: openSignIn, onNotes: () => showView(VIEWS.LIBRARY) });
const groupsView = mountGroups({
  root: byId('groupsRoot'), api: backend, signedIn: () => signedIn, onSignIn: openSignIn, myDocuments: documentsOf, guestRoot: guestCircleRoot,
  onNotesAdded: () => notes.refresh(), notify: notifier.success,
});
byId('challenge').closest('section').hidden = !signedIn;   // guests see the study-circle card above instead of a second sign-in prompt
const challengeView = mountChallenge({
  root: byId('challenge'), api: backend, signedIn: () => signedIn, topics: topicsOf, onSignIn: openSignIn,
  notify: notifier.success, onPlayed: () => badges.refresh(),
});

// each tab loads fresh data when it is opened
store.select(selectView, (view) => {
  if (view === VIEWS.ASK) ask.refresh();
  else if (view === VIEWS.GROUPS) { groupsView.refresh(); challengeView.refresh(); }
  else if (view === VIEWS.PROGRESS) { badges.refresh(); mockExam.refresh(); }
});

// installable app: cache the page shell for offline start (only where service workers are allowed)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* the app works without it */ });
}

// motion layer (smooth scroll, reveals, count-ups, tilt, flame, confetti): added once the page is up, skipped for "reduce motion"
startMotion({ store });
