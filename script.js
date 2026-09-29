const modalBackdrop = document.querySelector('#modal-backdrop');
const modalTitle = document.querySelector('#modal-title');
const modalCopy = document.querySelector('#modal-copy');
const modalKicker = document.querySelector('#modal-kicker');
const modalAction = document.querySelector('#modal-action');
const breathTimer = document.querySelector('#breath-timer');
const moodStatus = document.querySelector('#mood-status');
const authScreen = document.querySelector('#auth-screen');
const appShell = document.querySelector('.app-shell');
const authForm = document.querySelector('#auth-form');
const authName = document.querySelector('#auth-name');
const authTitle = document.querySelector('#auth-title');
const authSubtitle = document.querySelector('#auth-subtitle');
const authSubmit = document.querySelector('#auth-submit');
const authMessage = document.querySelector('#auth-message');
const authPassword = document.querySelector('#auth-password');
const chatContent = document.querySelector('#chat-content');
const modalStandardContent = document.querySelector('#modal-kicker').parentElement;
let selectedMood = '';
let timerRunning = false;
let authMode = 'signin';
let currentProfile = null;
let currentInsights = null;

function showAuth() {
  authScreen.hidden = false;
  appShell.hidden = true;
}

function showApp() {
  authScreen.hidden = true;
  appShell.hidden = false;
  loadInsights();
}

function applyProfile(user) {
  currentProfile = user;
  const initials = user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  document.querySelector('.profile-card strong').textContent = `Good morning, ${user.name.split(' ')[0]}`;
  document.querySelector('.profile-card .avatar').textContent = initials;
  document.querySelector('.user-chip .avatar').textContent = initials;
  document.querySelector('.user-chip > span:nth-child(2)').textContent = user.name;
  document.querySelector('#profile-name').value = user.name;
  document.querySelector('#profile-pronouns').value = user.pronouns || '';
  document.querySelector('#profile-bio').value = user.bio || '';
  document.querySelector('#profile-editor-avatar').textContent = initials;
}

const pageNames = { overview: 'Overview', 'check-in': 'Mood check-in', insights: 'My insights', library: 'Wellness library', diary: 'My diary', settings: 'Settings' };

function renderDiaryEntries(entries) {
  const container = document.querySelector('#diary-entries');
  document.querySelector('#entry-count').textContent = `${entries.length} saved`;
  if (!entries.length) {
    container.innerHTML = '<div class="empty-state">Your first entry can start with one honest sentence.</div>';
    return;
  }
  container.innerHTML = entries.map((entry) => `<article class="diary-entry"><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.body)}</p><small>${new Date(entry.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · ${escapeHtml(entry.mood)}</small></article>`).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

async function loadDiary() {
  const response = await fetch('/api/diary');
  if (!response.ok) return;
  const { entries } = await response.json();
  renderDiaryEntries(entries);
}

async function loadInsights() {
  const response = await fetch('/api/insights');
  if (!response.ok) return;
  const insights = await response.json();
  currentInsights = insights;
  document.querySelector('#metric-checkins').textContent = insights.checkIns;
  document.querySelector('#metric-common-mood').textContent = insights.commonMood || '—';
  document.querySelector('#metric-diary-count').textContent = insights.diaryCount;
  document.querySelector('#insight-checkins').textContent = insights.checkIns;
  document.querySelector('#insight-common-mood').textContent = insights.commonMood || '—';
  document.querySelector('#insight-latest-mood').textContent = insights.latestMood || '—';

  const score = insights.averageStress;
  document.querySelector('#stress-score').textContent = score === null ? '—' : score;
  document.querySelector('#stress-label').textContent = score === null ? 'Waiting for a check-in' : score <= 25 ? 'Lower stress estimate' : score <= 50 ? 'Moderate stress estimate' : score <= 75 ? 'High stress estimate' : 'Very high stress estimate';
  document.querySelector('#stress-copy').textContent = score === null ? 'Your weekly estimate uses your daily mood averages.' : `Weekly average across ${insights.daysWithCheckIns} day${insights.daysWithCheckIns === 1 ? '' : 's'} with check-ins.`;
  document.querySelector('#stress-status').lastChild.textContent = score === null ? ' No check-ins' : score <= 25 ? ' Lower estimate' : score <= 50 ? ' Moderate estimate' : ' Higher estimate';
  document.querySelector('.signal-bar span').style.width = score === null ? '0%' : `${score}%`;
  const stressGuidance = insights.stressGuidance;
  const dashboardGuidance = document.querySelector('#stress-guidance');
  dashboardGuidance.hidden = !stressGuidance;
  if (stressGuidance) {
    document.querySelector('#stress-guidance-title').textContent = stressGuidance.title;
    document.querySelector('#stress-guidance-copy').textContent = stressGuidance.copy;
  }
  const weeklyGuidance = document.querySelector('#weekly-guidance');
  weeklyGuidance.hidden = !stressGuidance;
  if (stressGuidance) {
    document.querySelector('#weekly-guidance-title').textContent = stressGuidance.title;
    document.querySelector('#weekly-guidance-copy').textContent = stressGuidance.copy;
  }

  const chart = document.querySelector('#mood-chart');
  chart.replaceChildren(...insights.stressByDay.map((point) => {
    const bar = document.createElement('i');
    const day = new Date(`${point.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
    bar.classList.toggle('empty', point.stress === null);
    bar.classList.toggle('today', point.date === new Date().toISOString().slice(0, 10));
    bar.style.height = `${Math.max(point.stress || 0, 4)}%`;
    bar.title = point.stress === null ? `${day}: no check-in` : `${day}: ${point.stress}% stress estimate, ${point.count} check-in${point.count === 1 ? '' : 's'}`;
    const label = document.createElement('span');
    label.textContent = day;
    bar.append(label);
    return bar;
  }));

  document.querySelector('#pattern-copy').textContent = insights.checkIns
    ? `Your stress estimate is ${score}%, based on daily averages across ${insights.daysWithCheckIns} day${insights.daysWithCheckIns === 1 ? '' : 's'} with check-ins. You checked in ${insights.checkIns} time${insights.checkIns === 1 ? '' : 's'}; ${insights.commonMood} was your most common mood.`
    : 'Save a mood check-in to begin building your personal weekly view.';
}

function showPage(page) {
  const nextPage = pageNames[page] ? page : 'overview';
  const main = document.querySelector('.main-content');
  main.dataset.page = nextPage;
  document.querySelector('#page-title').textContent = pageNames[nextPage];
  document.querySelectorAll('.nav-links a').forEach((link) => link.classList.toggle('active', link.dataset.page === nextPage));
  if (nextPage === 'diary') loadDiary();
  if (nextPage === 'insights') loadInsights();
  if (nextPage === 'check-in') document.querySelector('#large-mood-grid button.selected')?.focus();
}

function updateAuthMode(mode) {
  authMode = mode;
  const signup = mode === 'signup';
  document.querySelector('#signin-tab').classList.toggle('active', !signup);
  document.querySelector('#signup-tab').classList.toggle('active', signup);
  authTitle.textContent = signup ? 'Make space for yourself.' : 'Welcome back.';
  authSubtitle.textContent = signup ? 'Create your private space for daily stress check-ins.' : 'Sign in to continue your stress check-ins.';
  authSubmit.innerHTML = `${signup ? 'Create my space' : 'Sign in'} <span>→</span>`;
  authPassword.autocomplete = signup ? 'new-password' : 'current-password';
  authForm.classList.toggle('signup-mode', signup);
  authName.required = signup;
  authMessage.textContent = '';
}

fetch('/api/me').then(async (response) => {
  if (!response.ok) throw new Error('No active session');
  const { user } = await response.json();
  applyProfile(user);
  showApp();
  showPage(location.hash.slice(1) || 'overview');
}).catch(() => showAuth());

document.querySelectorAll('[data-page]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const page = link.dataset.page;
    if (!pageNames[page]) return;
    event.preventDefault();
    history.replaceState(null, '', `#${page}`);
    showPage(page);
  });
});

document.querySelector('#signin-tab').addEventListener('click', () => updateAuthMode('signin'));
document.querySelector('#signup-tab').addEventListener('click', () => updateAuthMode('signup'));
document.querySelector('#toggle-password').addEventListener('click', (event) => {
  const visible = authPassword.type === 'text';
  authPassword.type = visible ? 'password' : 'text';
  event.currentTarget.textContent = visible ? 'Show' : 'Hide';
});

document.querySelector('#profile-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = document.querySelector('#profile-message');
  const response = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: document.querySelector('#profile-name').value, pronouns: document.querySelector('#profile-pronouns').value, bio: document.querySelector('#profile-bio').value }) });
  const result = await response.json();
  if (!response.ok) {
    message.textContent = result.error || 'Could not update your profile.';
    return;
  }
  applyProfile(result.user);
  message.textContent = 'Your profile is updated.';
});

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!authForm.reportValidity()) return;
  authSubmit.disabled = true;
  authMessage.textContent = 'Creating your private space...';
  try {
    const response = await fetch(`/api/${authMode === 'signup' ? 'signup' : 'signin'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: authName.value, email: document.querySelector('#auth-email').value, password: authPassword.value }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Something went wrong.');
    applyProfile(result.user);
    authMessage.textContent = authMode === 'signup' ? 'Your private space is ready. Welcome in.' : 'Welcome back.';
    window.setTimeout(showApp, 350);
  } catch (error) {
    authMessage.textContent = error.message;
  } finally {
    authSubmit.disabled = false;
  }
});

document.querySelector('.sign-out').addEventListener('click', async () => {
  await fetch('/api/signout', { method: 'POST' });
  authForm.reset();
  selectedMood = '';
  currentInsights = null;
  document.querySelectorAll('[data-mood], [data-support-mood]').forEach((button) => button.classList.remove('selected'));
  moodStatus.textContent = 'Your check-in is private to you.';
  document.querySelector('#page-mood-status').textContent = 'Choose a feeling to check in.';
  updateAuthMode('signin');
  showAuth();
});

function openModal({ kicker, title, copy, action = 'Begin' }) {
  chatContent.hidden = true;
  document.querySelector('#modal-kicker').hidden = false;
  document.querySelector('#modal-title').hidden = false;
  document.querySelector('#modal-copy').hidden = false;
  breathTimer.hidden = false;
  modalAction.hidden = false;
  modalKicker.textContent = kicker;
  modalTitle.textContent = title;
  modalCopy.textContent = copy;
  modalAction.innerHTML = `${action} <span>→</span>`;
  breathTimer.classList.remove('active');
  breathTimer.firstElementChild.textContent = 'Ready';
  modalBackdrop.hidden = false;
}

function openChat() {
  document.querySelector('#modal-kicker').hidden = true;
  document.querySelector('#modal-title').hidden = true;
  document.querySelector('#modal-copy').hidden = true;
  breathTimer.hidden = true;
  modalAction.hidden = true;
  chatContent.hidden = false;
  document.querySelector('#chat-messages').innerHTML = '<div class="chat-row assistant-row"><div class="chat-mini-avatar">✦</div><div class="chat-bubble assistant">Hi, I’m here with you. What are the main tasks on your plate today?</div></div>';
  chatHistory = [];
  modalBackdrop.hidden = false;
  window.setTimeout(() => document.querySelector('#chat-input').focus(), 50);
}

function closeModal() {
  modalBackdrop.hidden = true;
  timerRunning = false;
  breathTimer.classList.remove('active');
  chatContent.hidden = true;
  document.querySelector('#modal-kicker').hidden = false;
  document.querySelector('#modal-title').hidden = false;
  document.querySelector('#modal-copy').hidden = false;
  breathTimer.hidden = false;
  modalAction.hidden = false;
}

function selectMood(mood) {
  selectedMood = mood;
  document.querySelectorAll('[data-mood], [data-support-mood]').forEach((button) => {
    button.classList.toggle('selected', (button.dataset.mood || button.dataset.supportMood) === mood);
  });
  moodStatus.textContent = `${mood} is a valid place to be.`;
  document.querySelector('#page-mood-status').textContent = `${mood} selected. Save to add it to your history.`;
  showMoodTip(mood);
}

document.querySelectorAll('.mood-options button').forEach((button) => button.addEventListener('click', () => selectMood(button.dataset.mood)));

async function saveMood() {
  if (!selectedMood) {
    moodStatus.textContent = 'Choose the feeling that is closest right now.';
    document.querySelector('#page-mood-status').textContent = 'Choose a feeling before saving.';
    return;
  }
  try {
    const response = await fetch('/api/moods', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mood: selectedMood }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save your check-in.');
    moodStatus.textContent = `Saved. Thank you for checking in as ${selectedMood.toLowerCase()}.`;
    document.querySelector('#page-mood-status').textContent = `Saved privately as ${selectedMood}.`;
    await loadInsights();
  } catch (error) {
    moodStatus.textContent = error.message;
    document.querySelector('#page-mood-status').textContent = error.message;
  }
}

document.querySelector('#save-mood').addEventListener('click', saveMood);
document.querySelector('#save-page-mood').addEventListener('click', saveMood);

document.querySelector('#diary-date').textContent = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
document.querySelector('#today-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
document.querySelector('#diary-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = document.querySelector('#diary-message');
  const body = document.querySelector('#diary-body').value.trim();
  if (!body) {
    message.textContent = 'Write a few words before saving your diary entry.';
    return;
  }
  const response = await fetch('/api/diary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: document.querySelector('#diary-title-input').value, body, mood: document.querySelector('#diary-mood').value }) });
  const result = await response.json();
  if (!response.ok) {
    message.textContent = result.error || 'Could not save your entry.';
    return;
  }
  document.querySelector('#diary-form').reset();
  message.textContent = 'Saved privately to your diary.';
  loadDiary();
});

const supportTips = {
  Heavy: ['You do not have to carry the whole day at once.', 'Put both feet on the floor, unclench your jaw, and choose one tiny task that can wait for your attention.'],
  Uneasy: ['Let’s make the unknown a little smaller.', 'Name three things you can see and write down the one part of the situation you can influence today.'],
  Okay: ['Okay is enough for today.', 'Protect the steadiness you have with water, a little movement, and one screen-free pause.'],
  Bright: ['There is some light here. Let it count.', 'Notice what helped you feel this way and make a small note in your diary so future-you can find it again.'],
  Hopeful: ['Hope does not need to be loud to be real.', 'Choose one gentle next step and make it small enough that you can begin before you feel completely ready.']
};

function showMoodTip(mood) {
  const [title, copy] = supportTips[mood];
  const dashboardTip = document.querySelector('#mood-tip');
  dashboardTip.textContent = `${title} ${copy}`;
  dashboardTip.hidden = false;
  document.querySelector('#support-tip h2').textContent = title;
  document.querySelector('#support-tip p').textContent = copy;
}

document.querySelectorAll('[data-support-mood]').forEach((button) => button.addEventListener('click', () => {
  selectMood(button.dataset.supportMood);
}));

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'journal') {
      showPage('diary');
      history.replaceState(null, '', '#diary');
      return;
    }
    if (action === 'breathing') openModal({ kicker: 'A small reset', title: 'Let’s slow things down.', copy: 'Breathe in for four counts. Hold for four. Exhale for six. Repeat as many times as feels good.' });
    if (action === 'journal') openModal({ kicker: 'A gentle prompt', title: 'What is asking for your attention?', copy: 'You can write one honest sentence. It does not need to be polished, useful, or for anyone else.', action: 'Open journal' });
    if (action === 'grounding') openModal({ kicker: 'Come back to now', title: 'Find five things you can see.', copy: 'Then notice four things you can feel, three you can hear, two you can smell, and one you can taste.', action: 'Start grounding' });
    if (action === 'kindness') openModal({ kicker: 'A kinder moment', title: 'You deserve gentleness too.', copy: 'Place a hand over your heart and say: I am allowed to be learning. I am allowed to need care. I can take this one moment at a time.', action: 'I’ll remember' });
  });
});

document.querySelector('#open-chat').addEventListener('click', openChat);

let chatHistory = [];
const replyVariants = {
  tasks: [
    'Let’s turn that into a lighter plan: choose the most important task, work on it for 20 minutes, then take a five-minute reset. Which task would feel best to finish first?',
    'You do not need to hold the whole list in your head. Pick one must-do, one nice-to-do, and one thing you can postpone. What feels like the true must-do?',
    'A calm day can still be productive. Start with the smallest visible action, silence one distraction, and give yourself a clear stopping point. What is the first action you could take?'
  ],
  low: [
    'I’m sorry this moment feels so heavy. For the next ten minutes, lower the bar: drink some water, put both feet on the floor, and choose one tiny task. You do not have to feel perfect to keep going. What would make this moment 1% easier?',
    'Thank you for saying that out loud. Feeling low does not mean you are failing. Try stepping near a window, taking three slow breaths, and messaging someone you trust. Would you like to talk about what brought the feeling on?',
    'You are allowed to move slowly today. Let’s care for your body first with water, a small nourishing bite, and a little rest. One difficult day is not the whole story of your life.'
  ],
  health: [
    'Your body deserves care, not criticism. Try water, a nourishing snack, a little daylight, and a short stretch. Which of those feels most doable right now?',
    'Let’s choose one kind habit instead of trying to fix everything: a glass of water, a regular meal, or an earlier wind-down tonight. Small healthy choices still count.',
    'Energy can return in small steps. If you can, take a two-minute walk or stretch your shoulders, then give yourself permission to rest without guilt.'
  ],
  greeting: [
    'I’m glad you’re here. What is taking up the most space in your mind today?',
    'Hi. We can keep this simple. Do you want help planning your tasks, calming your thoughts, or just a place to talk?',
    'Hello, I’m listening. How is your energy today, and what would feel supportive from me?'
  ],
  thanks: [
    'You’re welcome. Be gentle with yourself as you move through the next part of the day.',
    'I’m glad that helped, even a little. What is one small thing you want to do next?',
    'Anytime. You are doing something worthwhile by paying attention to how you feel.'
  ],
  general: [
    'I hear you. We can take this one piece at a time. Is this more about your tasks, your energy, or something you are feeling emotionally?',
    'That makes sense. You do not need to solve your whole life in one conversation. What part feels hardest right now?',
    'Thank you for sharing that with me. Let’s find the next gentle step together. What would a little relief look like today?'
  ]
};

function pickReply(type) {
  const options = replyVariants[type];
  const used = chatHistory.filter((item) => item.type === type).map((item) => item.reply);
  const available = options.filter((reply) => !used.includes(reply));
  const reply = (available.length ? available : options)[Math.floor(Math.random() * (available.length ? available.length : options.length))];
  chatHistory.push({ type, reply });
  return reply;
}

function companionReply(message) {
  const lower = message.toLowerCase().trim();
  if (/^(hi|hello|hey|good morning|good evening)\b/.test(lower)) return pickReply('greeting');
  if (/\b(thank you|thanks|that helps|appreciate)\b/.test(lower)) return pickReply('thanks');
  if (/\b(sad|low|weak|overwhelm|anxious|alone|cry|bad day|hopeless)\b/.test(lower)) return pickReply('low');
  if (/\b(sleep|tired|health|healthy|eat|food|water|exercise|body|headache)\b/.test(lower)) return pickReply('health');
  if (/\b(task|tasks|work|study|homework|meeting|deadline|todo|to-do|plan|busy)\b/.test(lower)) return pickReply('tasks');
  return pickReply('general');
}

document.querySelector('#chat-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = document.querySelector('#chat-input');
  const message = input.value.trim();
  if (!message) return;
  const messages = document.querySelector('#chat-messages');
  messages.insertAdjacentHTML('beforeend', `<div class="chat-row user-row"><div class="chat-mini-avatar">${escapeHtml((currentProfile?.name || 'You').slice(0, 1).toUpperCase())}</div><div class="chat-bubble user">${escapeHtml(message)}</div></div><div class="chat-row assistant-row"><div class="chat-mini-avatar">✦</div><div class="chat-bubble assistant typing">Thinking gently...</div></div>`);
  input.value = '';
  messages.scrollTop = messages.scrollHeight;
  window.setTimeout(() => {
    const typingBubble = messages.querySelector('.typing');
    if (typingBubble) {
      typingBubble.classList.remove('typing');
      typingBubble.textContent = companionReply(message);
    }
    messages.scrollTop = messages.scrollHeight;
  }, 350);
});

document.querySelectorAll('#chat-suggestions button').forEach((button) => button.addEventListener('click', () => {
  const input = document.querySelector('#chat-input');
  input.value = button.textContent;
  document.querySelector('#chat-form').requestSubmit();
}));

document.querySelector('#chat-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    document.querySelector('#chat-form').requestSubmit();
  }
});

document.querySelector('#view-insight').addEventListener('click', () => {
  const copy = currentInsights?.checkIns
    ? `You saved ${currentInsights.checkIns} mood check-in${currentInsights.checkIns === 1 ? '' : 's'} in the last seven days. Your most common mood was ${currentInsights.commonMood}. These are simple reflections, not a clinical assessment.`
    : 'Save a mood check-in to begin seeing your personal patterns here. Your information stays private to your account.';
  openModal({ kicker: 'Your patterns', title: 'Your week, at a glance.', copy, action: 'Got it' });
});

document.querySelector('#daily-plan').addEventListener('click', () => {
  openModal({ kicker: 'Today’s gentle plan', title: 'Three small moments.', copy: 'Check in with yourself, take two minutes to breathe, and close the day with one honest sentence in your journal.', action: 'View plan' });
});

document.querySelector('#all-exercises').addEventListener('click', () => {
  openModal({ kicker: 'Wellness library', title: 'Find what fits today.', copy: 'Explore breathing exercises, grounding practices, reflection prompts, and short audio resets made for real life.', action: 'Explore' });
});

document.querySelector('#close-modal').addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (event) => { if (event.target === modalBackdrop) closeModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modalBackdrop.hidden) closeModal(); });

modalAction.addEventListener('click', () => {
  if (modalTitle.textContent === 'Let’s slow things down.' && !timerRunning) {
    timerRunning = true;
    breathTimer.classList.add('active');
    breathTimer.firstElementChild.textContent = 'Breathe';
    modalAction.innerHTML = 'I feel calmer <span>✓</span>';
    return;
  }
  closeModal();
});
