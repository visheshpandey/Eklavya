// Interface text in English and Hindi. The tutor language selector decides: Hindi shows Hindi labels; English and
// Hinglish show English labels (Hinglish speakers read English UI comfortably). Pure data + one lookup function.
//
// Static labels in index.html carry data-i18n="key" (text) or data-i18n-placeholder / data-i18n-label (attributes);
// components call t(key, language, values).

const EN = {
  'tab.today': 'Today', 'tab.notes': 'Notes', 'tab.study': 'Study', 'tab.progress': 'Progress',
  'brand.tag': 'Your voice study mentor', 'cmd.trigger': 'Search or jump to', 'convo.title': 'Conversation', 'stat.mastery': 'Average mastery', 'stat.masteryNote': 'across {n} topics', 'stat.answers': 'Answers', 'stat.answersNote': 'correct', 'stat.fixed': 'Misconceptions fixed', 'stat.fixedOpen': '{n} still open', 'stat.fixedNone': 'none open', 'stat.streak': 'Study streak', 'stat.days': '{n} days', 'stat.streakNote': 'keep it going tonight',
  'notes.title': 'Your notes', 'notes.upload': 'Upload notes', 'notes.demo': 'Try the demo notes', 'notes.search': 'Search topics',
  'notes.hint': 'PDF (even scanned), text, or a photo of a page', 'notes.loading': 'Loading…',
  'lib.loading': 'Loading your notes...', 'lib.noneTitle': 'No notes yet',
  'lib.noneBody': 'Upload a PDF or text file, or try the demo notes, and your topics will appear here.',
  'lib.weakest': 'Weakest', 'lib.remove': 'Remove', 'lib.removeNamed': 'Remove {name}', 'lib.yes': 'Yes, remove', 'lib.cancel': 'Cancel',
  'lib.confirm': 'Remove "{name}" and your progress on its topics?', 'lib.topics': '{n} topics', 'lib.matches': '{n} of {total}',
  'lib.noMatch': 'No topics match "{query}".',
  'progress.title': 'Your progress', 'progress.chart': 'Mastery over time', 'progress.mistakes': 'Misconceptions',
  'progress.recent': 'Recent answers', 'progress.why': 'Why the tutor did that', 'progress.map': 'How your topics connect',
  'progress.cards': 'Flashcards', 'progress.results': 'Viva and debate results', 'progress.pack': 'Download study pack',
  'stage.idle': 'Tap to talk to Eklavya', 'stage.connecting': 'Connecting...', 'stage.listening': 'Listening. Just talk.',
  'stage.speaking': 'Eklavya is speaking. Talk to interrupt.', 'stage.hint': 'Headphones work best.',
  'stage.captions': 'Captions', 'stage.photo': 'Show a photo',
  'composer.placeholder': 'Or type a message to Eklavya', 'composer.send': 'Send',

  'today.morning': 'Good morning', 'today.afternoon': 'Good afternoon', 'today.evening': 'Good evening',
  'today.streak': '{n}-day streak', 'today.streakNone': 'Start a streak today',
  'today.exam': '{n} days to your exam', 'today.examToday': 'Your exam is today',
  'today.plan': "Today's plan", 'today.planMinutes': 'about {n} minutes', 'today.start': 'Start',
  'today.startPlan': "Start today's plan", 'today.nothing': 'Nothing due today. Pick any topic, or try a viva.',
  'today.noNotes': 'Add your notes to get a plan for today.', 'today.addNotes': 'Add notes',
  'today.due': 'Due for revision', 'today.overdue': '{n} days late', 'today.dueToday': 'due today',
  'today.last': 'Last time', 'today.turns': '{n} turns',
  'kind.revise': 'Quick revision', 'kind.learn': 'Learn', 'kind.test': 'Test',

  'planner.title': 'Exam planner', 'planner.date': 'Exam date', 'planner.minutes': 'Minutes a day',
  'planner.save': 'Make my plan', 'planner.clear': 'Remove exam date', 'planner.next': 'Next 7 days',
  'planner.all': 'Show the whole plan', 'planner.empty': 'Set your exam date and Eklavya plans every day until then.',
  'planner.rest': 'Free day',

  'onb.title': 'Welcome to Eklavya', 'onb.step': 'Step {n} of 3',
  'onb.langTitle': 'Which language should Eklavya speak?', 'onb.langBody': 'You can change this any time in the top bar.',
  'onb.notesTitle': 'Add what you are studying', 'onb.notesBody': 'Upload a PDF, a text file or a photo of your notes. Or try the demo notes about machine learning.',
  'onb.micTitle': 'Eklavya listens and talks', 'onb.micBody': 'Your browser will ask to use the microphone. Speak normally; you can interrupt Eklavya any time. Headphones help.',
  'onb.next': 'Next', 'onb.back': 'Back', 'onb.skip': 'Skip for now', 'onb.hello': 'Say hello', 'onb.later': 'Later',
  'onb.haveNotes': 'Your notes are ready.',

  'study.viva': 'Viva practice', 'study.revise': 'Quick revision', 'study.style': 'How hard Eklavya pushes',
  'study.tough': 'Tough opponent', 'study.friendly': 'Friendly sparring partner',

  'viva.title': 'Viva', 'viva.question': 'Question {n} of {total}', 'viva.timeLeft': '{s}s to answer',
  'viva.timeUp': 'Time is up. Finish your thought.', 'viva.marks': 'Marks so far', 'viva.report': 'Viva report card',
  'viva.outOf': '{marks} out of {outOf}', 'viva.good': 'What went well', 'viva.improve': 'Work on this',

  'debate.score': 'Your argument strength', 'debate.round': 'Argument {n}', 'debate.evidence': 'Evidence',
  'debate.logic': 'Logic', 'debate.rebuttal': 'Rebuttal', 'debate.average': 'Average {n} / 10',
  'debate.verdict': 'Verdict', 'debate.youWon': 'You won the debate', 'debate.eklavyaWon': 'Eklavya won this one',
  'debate.draw': 'It is a draw', 'debate.best': 'Your best moment', 'debate.next': 'Next time',
  'debate.scores': 'You {you} · Eklavya {eklavya}',

  'cards.topic': 'Topic', 'cards.make': 'Make cards from my notes', 'cards.making': 'Writing cards…',
  'cards.empty': 'No cards yet for this topic.', 'cards.flip': 'Show answer', 'cards.flipBack': 'Show question',
  'cards.prev': 'Previous card', 'cards.next': 'Next card', 'cards.count': 'Card {n} of {total}',
  'cards.mistake': 'From your mistakes', 'cards.pick': 'Pick a topic first.',

  'map.open': 'Open {topic}',
  'map.empty': 'Add notes to see how your topics connect.', 'map.links': 'Connected to {list}', 'map.alone': 'No links found in your notes',
  'map.legend': 'Darker = stronger mastery',

  'results.empty': 'Finish a viva or a debate and the result shows up here.',
  'results.viva': 'Viva on {topic}', 'results.debate': 'Debate on {topic}',

  'celebrate.mastery': '{topic} +{n}%', 'celebrate.streak': '{n}-day streak. Keep going.',
  'photo.sent': 'You shared a photo', 'photo.noCall': 'Start a conversation first, then show Eklavya a photo.',
};

const HI = {
  'tab.today': 'आज', 'tab.notes': 'नोट्स', 'tab.study': 'पढ़ाई', 'tab.progress': 'प्रगति',
  'brand.tag': 'आपका आवाज़ वाला स्टडी मेंटर', 'cmd.trigger': 'खोजें या सीधे जाएँ', 'convo.title': 'बातचीत', 'stat.mastery': 'औसत महारत', 'stat.masteryNote': '{n} विषयों में', 'stat.answers': 'जवाब', 'stat.answersNote': 'सही', 'stat.fixed': 'सुधरी गलतफ़हमियाँ', 'stat.fixedOpen': '{n} अभी बाकी', 'stat.fixedNone': 'कोई बाकी नहीं', 'stat.streak': 'लगातार पढ़ाई', 'stat.days': '{n} दिन', 'stat.streakNote': 'आज रात भी जारी रखें',
  'notes.title': 'आपके नोट्स', 'notes.upload': 'नोट्स अपलोड करें', 'notes.demo': 'डेमो नोट्स आज़माएँ', 'notes.search': 'टॉपिक खोजें',
  'notes.hint': 'PDF, टेक्स्ट, या पेज की फ़ोटो', 'notes.loading': 'लोड हो रहा है…',
  'lib.loading': 'आपके नोट्स लोड हो रहे हैं...', 'lib.noneTitle': 'अभी कोई नोट्स नहीं',
  'lib.noneBody': 'PDF या टेक्स्ट फ़ाइल अपलोड करें, या डेमो नोट्स आज़माएँ; आपके टॉपिक यहाँ दिखेंगे।',
  'lib.weakest': 'सबसे कमज़ोर', 'lib.remove': 'हटाएँ', 'lib.removeNamed': '{name} हटाएँ', 'lib.yes': 'हाँ, हटाएँ', 'lib.cancel': 'रद्द करें',
  'lib.confirm': '"{name}" और उसके टॉपिक की आपकी प्रगति हटानी है?', 'lib.topics': '{n} टॉपिक', 'lib.matches': '{total} में से {n}',
  'lib.noMatch': '"{query}" से कोई टॉपिक नहीं मिला।',
  'progress.title': 'आपकी प्रगति', 'progress.chart': 'समय के साथ महारत', 'progress.mistakes': 'गलतफ़हमियाँ',
  'progress.recent': 'हाल के जवाब', 'progress.why': 'ट्यूटर ने ऐसा क्यों किया', 'progress.map': 'आपके टॉपिक कैसे जुड़े हैं',
  'progress.cards': 'फ़्लैशकार्ड', 'progress.results': 'वाइवा और बहस के नतीजे', 'progress.pack': 'स्टडी पैक डाउनलोड करें',
  'stage.idle': 'एकलव्य से बात करने के लिए टैप करें', 'stage.connecting': 'जुड़ रहा है...', 'stage.listening': 'सुन रहा हूँ। बस बोलिए।',
  'stage.speaking': 'एकलव्य बोल रहा है। बीच में बोल सकते हैं।', 'stage.hint': 'हेडफ़ोन से सबसे अच्छा काम करता है।',
  'stage.captions': 'कैप्शन', 'stage.photo': 'फ़ोटो दिखाएँ',
  'composer.placeholder': 'या एकलव्य को संदेश लिखें', 'composer.send': 'भेजें',

  'today.morning': 'सुप्रभात', 'today.afternoon': 'नमस्ते', 'today.evening': 'शुभ संध्या',
  'today.streak': 'लगातार {n} दिन', 'today.streakNone': 'आज से सिलसिला शुरू करें',
  'today.exam': 'परीक्षा में {n} दिन बाकी', 'today.examToday': 'आज आपकी परीक्षा है',
  'today.plan': 'आज की योजना', 'today.planMinutes': 'लगभग {n} मिनट', 'today.start': 'शुरू करें',
  'today.startPlan': 'आज की योजना शुरू करें', 'today.nothing': 'आज कुछ बाकी नहीं। कोई भी टॉपिक चुनें, या वाइवा आज़माएँ।',
  'today.noNotes': 'आज की योजना के लिए अपने नोट्स जोड़ें।', 'today.addNotes': 'नोट्स जोड़ें',
  'today.due': 'दोहराने का समय', 'today.overdue': '{n} दिन देर', 'today.dueToday': 'आज',
  'today.last': 'पिछली बार', 'today.turns': '{n} बार बात',
  'kind.revise': 'जल्दी दोहराएँ', 'kind.learn': 'सीखें', 'kind.test': 'टेस्ट',

  'planner.title': 'परीक्षा योजना', 'planner.date': 'परीक्षा की तारीख', 'planner.minutes': 'रोज़ के मिनट',
  'planner.save': 'मेरी योजना बनाएँ', 'planner.clear': 'तारीख हटाएँ', 'planner.next': 'अगले 7 दिन',
  'planner.all': 'पूरी योजना देखें', 'planner.empty': 'परीक्षा की तारीख चुनें, एकलव्य तब तक हर दिन की योजना बनाएगा।',
  'planner.rest': 'खाली दिन',

  'onb.title': 'एकलव्य में आपका स्वागत है', 'onb.step': 'चरण {n} / 3',
  'onb.langTitle': 'एकलव्य किस भाषा में बोले?', 'onb.langBody': 'इसे ऊपर कभी भी बदल सकते हैं।',
  'onb.notesTitle': 'जो पढ़ रहे हैं, वह जोड़ें', 'onb.notesBody': 'PDF, टेक्स्ट फ़ाइल या नोट्स की फ़ोटो अपलोड करें। या मशीन लर्निंग के डेमो नोट्स आज़माएँ।',
  'onb.micTitle': 'एकलव्य सुनता और बोलता है', 'onb.micBody': 'ब्राउज़र माइक्रोफ़ोन की अनुमति माँगेगा। आराम से बोलिए; आप एकलव्य को कभी भी बीच में रोक सकते हैं। हेडफ़ोन मदद करते हैं।',
  'onb.next': 'आगे', 'onb.back': 'पीछे', 'onb.skip': 'अभी छोड़ें', 'onb.hello': 'नमस्ते बोलें', 'onb.later': 'बाद में',
  'onb.haveNotes': 'आपके नोट्स तैयार हैं।',

  'study.viva': 'वाइवा अभ्यास', 'study.revise': 'जल्दी दोहराएँ', 'study.style': 'एकलव्य कितना ज़ोर लगाए',
  'study.tough': 'कड़ा प्रतिद्वंद्वी', 'study.friendly': 'दोस्ताना साथी',

  'viva.title': 'वाइवा', 'viva.question': 'प्रश्न {n} / {total}', 'viva.timeLeft': 'जवाब के लिए {s} सेकंड',
  'viva.timeUp': 'समय पूरा। अपनी बात पूरी करें।', 'viva.marks': 'अब तक के अंक', 'viva.report': 'वाइवा रिपोर्ट कार्ड',
  'viva.outOf': '{outOf} में से {marks}', 'viva.good': 'क्या अच्छा रहा', 'viva.improve': 'इस पर काम करें',

  'debate.score': 'आपके तर्क की ताकत', 'debate.round': 'तर्क {n}', 'debate.evidence': 'सबूत',
  'debate.logic': 'तर्क', 'debate.rebuttal': 'जवाबी तर्क', 'debate.average': 'औसत {n} / 10',
  'debate.verdict': 'फ़ैसला', 'debate.youWon': 'आप बहस जीत गए', 'debate.eklavyaWon': 'इस बार एकलव्य जीता',
  'debate.draw': 'बराबरी रही', 'debate.best': 'आपका सबसे अच्छा पल', 'debate.next': 'अगली बार',
  'debate.scores': 'आप {you} · एकलव्य {eklavya}',

  'cards.topic': 'टॉपिक', 'cards.make': 'मेरे नोट्स से कार्ड बनाएँ', 'cards.making': 'कार्ड बन रहे हैं…',
  'cards.empty': 'इस टॉपिक के अभी कोई कार्ड नहीं।', 'cards.flip': 'जवाब देखें', 'cards.flipBack': 'सवाल देखें',
  'cards.prev': 'पिछला कार्ड', 'cards.next': 'अगला कार्ड', 'cards.count': 'कार्ड {n} / {total}',
  'cards.mistake': 'आपकी गलतियों से', 'cards.pick': 'पहले टॉपिक चुनें।',

  'map.open': '{topic} खोलें',
  'map.empty': 'टॉपिक कैसे जुड़े हैं, देखने के लिए नोट्स जोड़ें।', 'map.links': 'जुड़ा है: {list}', 'map.alone': 'नोट्स में कोई जुड़ाव नहीं मिला',
  'map.legend': 'गहरा रंग = ज़्यादा महारत',

  'results.empty': 'वाइवा या बहस पूरी करें, नतीजा यहाँ दिखेगा।',
  'results.viva': '{topic} पर वाइवा', 'results.debate': '{topic} पर बहस',

  'celebrate.mastery': '{topic} +{n}%', 'celebrate.streak': 'लगातार {n} दिन। ऐसे ही चलते रहें।',
  'photo.sent': 'आपने एक फ़ोटो भेजी', 'photo.noCall': 'पहले बातचीत शुरू करें, फिर एकलव्य को फ़ोटो दिखाएँ।',
};

const TABLES = { english: EN, hinglish: EN, hindi: HI };

/** The label for `key` in the interface language for `language`, with {name} placeholders filled from `values`. */
export function t(key, language = 'hinglish', values = {}) {
  const text = (TABLES[language] ?? EN)[key] ?? EN[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match));
}

/** The `lang` attribute for the interface language. */
export const uiLang = (language) => (language === 'hindi' ? 'hi' : 'en');

/** Every key that has an English label (for tests: each must also have a Hindi one). */
export const KEYS = Object.freeze(Object.keys(EN));
export const HINDI_KEYS = Object.freeze(Object.keys(HI));
