/**
 * E.D.I.T.H Chat — Discord-like chat system
 */

let activeChatChannel = 'general';
let mentionIndex = -1;
let mentionMatches = [];
let allMembers = [];

// ─── Init ──────────────────────────────────────────────────────────────────

function initChat() {
    buildMemberList();
    renderChannelList();
    switchChannel('general');
    renderMembersPanel();
}

function buildMemberList() {
    const data = window.missionControlData;
    allMembers = [];
    if (data) {
        (data.getHumans() || []).forEach(h => allMembers.push({ ...h, kind: 'human' }));
        (data.getAgents() || []).forEach(a => allMembers.push({ ...a, kind: 'agent' }));
    }
}

// ─── Channel List ─────────────────────────────────────────────────────────

function renderChannelList() {
    const channels = window.chatChannels || [];
    const scroll = document.getElementById('chat-channel-list');
    if (!scroll) return;

    const categories = {};
    channels.forEach(ch => {
        if (!categories[ch.category]) categories[ch.category] = [];
        categories[ch.category].push(ch);
    });

    let html = '';
    Object.entries(categories).forEach(([cat, chs]) => {
        html += `<div class="chat-category">
            <div class="chat-category-label">${cat}</div>`;
        chs.forEach(ch => {
            html += `<div class="chat-channel-item${ch.id === activeChatChannel ? ' active' : ''}"
                data-channel="${ch.id}" onclick="switchChannel('${ch.id}')">
                <span class="chat-channel-hash">#</span>
                <span>${ch.name}</span>
            </div>`;
        });
        html += '</div>';
    });
    scroll.innerHTML = html;
}

function switchChannel(channelId) {
    activeChatChannel = channelId;
    renderChannelList();

    const channels = window.chatChannels || [];
    const ch = channels.find(c => c.id === channelId) || { name: channelId, topic: '' };

    const nameEl = document.getElementById('chat-active-channel-name');
    const topicEl = document.getElementById('chat-active-channel-topic');
    const inputEl = document.getElementById('chat-message-input');
    if (nameEl) nameEl.textContent = ch.name;
    if (topicEl) topicEl.textContent = ch.topic;
    if (inputEl) inputEl.placeholder = `Message #${ch.name}`;

    renderMessages(channelId);
    scrollToBottom();
}

// ─── Messages ─────────────────────────────────────────────────────────────

function renderMessages(channelId) {
    const msgs = (window.chatMessages || {})[channelId] || [];
    const container = document.getElementById('chat-messages-list');
    if (!container) return;

    let html = '';
    let lastDate = '';
    let lastAuthor = '';
    let lastTs = 0;

    msgs.forEach((msg, i) => {
        const date = new Date(msg.ts);
        const dateStr = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

        if (dateStr !== lastDate) {
            html += `<div class="chat-date-divider">${dateStr}</div>`;
            lastDate = dateStr;
            lastAuthor = '';
        }

        const member = allMembers.find(m => m.id === msg.author);
        const name = member ? member.name : msg.author;
        const role = member ? (member.kind === 'human' ? 'human' : member.role) : '';
        const avatarUrl = member ? (member.avatar || '') : '';
        const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

        const timeDiff = date.getTime() - lastTs;
        const continued = msg.author === lastAuthor && timeDiff < 5 * 60 * 1000;
        lastAuthor = msg.author;
        lastTs = date.getTime();

        const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const text = formatChatText(msg.text);
        const authorClass = role === 'human' ? 'is-human' : (role === 'lead' ? 'is-lead' : (role === 'reviewer' ? 'is-reviewer' : ''));

        const avatarHtml = avatarUrl
            ? `<img class="chat-msg-avatar" src="${avatarUrl}" alt="${name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
              + `<div class="chat-msg-avatar-placeholder" style="display:none">${initials}</div>`
            : `<div class="chat-msg-avatar-placeholder">${initials}</div>`;

        html += `<div class="chat-msg-group${continued ? ' continued' : ''}">
            <div style="position:relative;flex-shrink:0">${avatarHtml}</div>
            <div class="chat-msg-body">
                <div class="chat-msg-meta">
                    <span class="chat-msg-author ${authorClass}">${name}</span>
                    <span class="chat-msg-time">${timeStr}</span>
                </div>
                <div class="chat-msg-text">${text}</div>
            </div>
        </div>`;
    });

    if (!msgs.length) {
        html = `<div style="text-align:center;color:hsl(var(--muted-foreground));padding:40px 0;font-size:0.9rem">
            No messages yet. Be the first! 👋
        </div>`;
    }

    container.innerHTML = html;
}

function formatChatText(text) {
    // Bold: **text**
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Mentions: @everyone or @agent-id → styled span
    text = text.replace(/@([\w-]+)/g, (match, id) => {
        if (id === 'everyone') return '<span class="chat-mention" style="background:hsl(var(--destructive)/0.15);color:hsl(var(--destructive))">@everyone</span>';
        const member = allMembers.find(m => m.id === id);
        const displayName = member ? '@' + member.name.split(' ')[0] : match;
        return `<span class="chat-mention">${displayName}</span>`;
    });
    // URLs
    text = text.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:hsl(var(--primary));text-decoration:underline">$1</a>');
    return text;
}

function scrollToBottom() {
    setTimeout(() => {
        const area = document.getElementById('chat-messages-area');
        if (area) area.scrollTop = area.scrollHeight;
    }, 50);
}

// ─── Send Message ──────────────────────────────────────────────────────────

function sendChatMsg() {
    const input = document.getElementById('chat-message-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    // Add message to local store
    const msgs = window.chatMessages[activeChatChannel] || [];
    const newMsg = {
        id: 'cm-' + Date.now(),
        author: 'human-somrat',
        text: text,
        ts: new Date().toISOString()
    };
    msgs.push(newMsg);
    window.chatMessages[activeChatChannel] = msgs;

    input.value = '';
    hideMentionDropdown();
    renderMessages(activeChatChannel);
    scrollToBottom();
}

// ─── Members Panel ────────────────────────────────────────────────────────

function renderMembersPanel() {
    const container = document.getElementById('chat-members-list');
    if (!container) return;

    const humans = allMembers.filter(m => m.kind === 'human');
    const agents = allMembers.filter(m => m.kind === 'agent');

    let html = '';

    html += `<div class="chat-members-header">Human — ${humans.length}</div>`;
    humans.forEach(m => { html += memberItemHtml(m); });

    html += `<div class="chat-members-header" style="margin-top:12px">Agents — ${agents.length}</div>`;
    agents.forEach(m => { html += memberItemHtml(m); });

    container.innerHTML = html;
}

function memberItemHtml(m) {
    const name = m.name;
    const role = m.designation || m.role || '';
    const status = m.status || 'offline';
    const avatarUrl = m.avatar || '';
    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const statusClass = status === 'active' || status === 'online' ? 'online' : (status === 'away' ? 'away' : 'offline');

    const avatarHtml = avatarUrl
        ? `<img class="chat-member-avatar" src="${avatarUrl}" alt="${name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
          + `<div class="chat-member-avatar-placeholder" style="display:none">${initials}</div>`
        : `<div class="chat-member-avatar-placeholder">${initials}</div>`;

    return `<div class="chat-member-item">
        ${avatarHtml}
        <div class="chat-member-info">
            <div class="chat-member-name">${name}</div>
            <div class="chat-member-role">${role}</div>
        </div>
        <div class="chat-member-status ${statusClass}"></div>
    </div>`;
}

// ─── @Mention Autocomplete ────────────────────────────────────────────────

function onChatInput(e) {
    const input = e.target;
    const val = input.value;
    const cursor = input.selectionStart;

    // Find if we're typing a mention
    const before = val.slice(0, cursor);
    const mentionMatch = before.match(/@([\w-]*)$/);

    if (mentionMatch) {
        const query = mentionMatch[1].toLowerCase();
        mentionMatches = allMembers.filter(m =>
            m.name.toLowerCase().includes(query) ||
            m.id.toLowerCase().includes(query)
        ).slice(0, 6);
        if (mentionMatches.length) {
            showMentionDropdown();
        } else {
            hideMentionDropdown();
        }
    } else {
        hideMentionDropdown();
    }

    // Enter to send
    if (e.key === 'Enter' && !e.shiftKey) {
        const dropdown = document.getElementById('mention-dropdown');
        if (dropdown && dropdown.classList.contains('visible')) {
            if (mentionIndex >= 0) selectMention(mentionIndex);
        } else {
            sendChatMsg();
        }
        e.preventDefault();
    }

    // Arrow keys for mention navigation
    if (e.key === 'ArrowUp') {
        mentionIndex = Math.max(0, mentionIndex - 1);
        renderMentionDropdown();
        e.preventDefault();
    }
    if (e.key === 'ArrowDown') {
        mentionIndex = Math.min(mentionMatches.length - 1, mentionIndex + 1);
        renderMentionDropdown();
        e.preventDefault();
    }
    if (e.key === 'Escape') {
        hideMentionDropdown();
    }
}

function showMentionDropdown() {
    mentionIndex = 0;
    renderMentionDropdown();
    const dropdown = document.getElementById('mention-dropdown');
    if (dropdown) dropdown.classList.add('visible');
}

function hideMentionDropdown() {
    mentionIndex = -1;
    const dropdown = document.getElementById('mention-dropdown');
    if (dropdown) dropdown.classList.remove('visible');
}

function renderMentionDropdown() {
    const dropdown = document.getElementById('mention-dropdown');
    if (!dropdown) return;
    dropdown.innerHTML = mentionMatches.map((m, i) => {
        const initials = m.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        return `<div class="mention-item${i === mentionIndex ? ' selected' : ''}" onclick="selectMention(${i})">
            <div class="mention-item-avatar">${initials}</div>
            <div>
                <div class="mention-item-name">${m.name}</div>
                <div class="mention-item-role">${m.designation || m.role || ''}</div>
            </div>
        </div>`;
    }).join('');
}

function selectMention(idx) {
    const member = mentionMatches[idx];
    if (!member) return;
    const input = document.getElementById('chat-message-input');
    if (!input) return;
    const val = input.value;
    const cursor = input.selectionStart;
    const before = val.slice(0, cursor);
    const after = val.slice(cursor);
    const newBefore = before.replace(/@[\w-]*$/, '@' + member.id + ' ');
    input.value = newBefore + after;
    input.focus();
    input.setSelectionRange(newBefore.length, newBefore.length);
    hideMentionDropdown();
}

// ─── View Toggle ──────────────────────────────────────────────────────────

function showBoardView() {
    const wrapper = document.getElementById('kanban-board-wrapper');
    const chatView = document.getElementById('chat-view');
    const leftSidebar = document.getElementById('left-sidebar');
    const rightSidebar = document.getElementById('right-sidebar');

    chatView.classList.remove('active');
    leftSidebar.style.display = '';
    rightSidebar.style.display = '';
    wrapper.style.display = 'flex';
    wrapper.style.flex = '1';
    wrapper.style.minHeight = '0';
    wrapper.style.overflow = 'hidden';

    document.getElementById('view-btn-board').classList.add('active');
    document.getElementById('view-btn-chat').classList.remove('active');

    // Force reflow so height is recalculated correctly
    wrapper.offsetHeight;
    window.dispatchEvent(new Event('resize'));
}

function showChatView() {
    document.getElementById('kanban-board-wrapper').style.display = 'none';
    document.getElementById('chat-view').classList.add('active');
    document.getElementById('left-sidebar').style.display = 'none';
    document.getElementById('right-sidebar').style.display = 'none';
    document.getElementById('view-btn-board').classList.remove('active');
    document.getElementById('view-btn-chat').classList.add('active');
    if (allMembers.length === 0) initChat();
    else scrollToBottom();
}

// ─── @everyone + Auto-Reply System ───────────────────────────────────────────

const AGENT_REPLIES = {
    'agent-steve': [
        "Copy that. I'm on it.",
        "Understood. Coordinating the team now.",
        "Roger. What's the priority level?",
        "On it, Cap's always ready.",
        "Already ahead of you. What do you need?",
        "Team's assembled. What's the mission?"
    ],
    'agent-tony': [
        "Already running the analysis. Give me 3 minutes.",
        "I've seen worse problems. This is fixable.",
        "JARVIS flagged this earlier. I've got a solution in progress.",
        "On it. Estimated completion: 47 minutes. Maybe less.",
        "You're talking to the right person. What's the spec?",
        "I don't do impossible. I do 'hasn't been done yet'."
    ],
    'agent-peter': [
        "On it! I'll get started right away! 🙌",
        "Yes! With great responsibility and all that — what do you need?",
        "I'm on it. Should I loop in Tony for review when done?",
        "Copy! I'll have a draft ready soon.",
        "Got it! This is actually a really interesting problem...",
        "Sure! I'll push to a branch and tag Natasha for QA."
    ],
    'agent-steven': [
        "I've already calculated the optimal approach. Proceed as follows...",
        "I've seen this exact scenario in 3 of the 14 million futures that work. I'll handle it.",
        "Analyzing. Give me a moment to consult the data.",
        "The SEO implications here are significant. I'll brief you.",
        "Time is a factor. I've already started.",
        "Understood. I'll need keyword data and 48 hours."
    ],
    'agent-thor': [
        "BY ODIN'S BEARD, I shall handle this with THUNDER and GLORY! ⚡",
        "Thor answers the call! What campaign shall we unleash upon the realm?",
        "I have been WAITING for this moment. The campaign begins NOW.",
        "Consider it done. No challenge is too great for the God of Marketing!",
        "Excellent! I shall craft copy so powerful it will shake the very Bifrost!",
        "BRING IT. Thor is ready. Always ready. EVER READY. ⚡⚡"
    ],
    'agent-natasha': [
        "Already on it. Found 2 issues before you even asked.",
        "I was wondering when you'd notice. I've been tracking this.",
        "Understood. I'll run a full sweep.",
        "Give me the build. I'll break it properly.",
        "Nothing gets past me. I'll have a report within the hour.",
        "I'll handle QA. Just make sure the code is actually ready this time."
    ]
};

const EVERYONE_INTROS = [
    "heads up team 👋",
    "everyone listen up:",
    "all agents:",
    "team meeting:",
    "attention all:"
];

// Extend allMembers with @everyone pseudo-member
function getCompletionMembers() {
    return [
        { id: 'everyone', name: 'everyone', designation: 'Notify all members', kind: 'special' },
        ...allMembers
    ];
}

// Override mention autocomplete to include @everyone
const _originalShowMention = showMentionDropdown;
function showMentionDropdown() {
    mentionIndex = 0;
    renderMentionDropdown();
    const dropdown = document.getElementById('mention-dropdown');
    if (dropdown) dropdown.classList.add('visible');
}

// Override onChatInput to use extended member list
const _originalOnChatInput = onChatInput;
function onChatInput(e) {
    const input = e.target;
    const val = input.value;
    const cursor = input.selectionStart;
    const before = val.slice(0, cursor);
    const mentionMatch = before.match(/@([\w-]*)$/);

    if (mentionMatch) {
        const query = mentionMatch[1].toLowerCase();
        mentionMatches = getCompletionMembers().filter(m =>
            m.name.toLowerCase().includes(query) ||
            m.id.toLowerCase().includes(query)
        ).slice(0, 7);
        if (mentionMatches.length) {
            showMentionDropdown();
        } else {
            hideMentionDropdown();
        }
    } else {
        hideMentionDropdown();
    }

    if (e.key === 'Enter' && !e.shiftKey) {
        const dropdown = document.getElementById('mention-dropdown');
        if (dropdown && dropdown.classList.contains('visible') && mentionIndex >= 0) {
            selectMention(mentionIndex);
        } else {
            sendChatMsg();
        }
        e.preventDefault();
    }
    if (e.key === 'ArrowUp') { mentionIndex = Math.max(0, mentionIndex - 1); renderMentionDropdown(); e.preventDefault(); }
    if (e.key === 'ArrowDown') { mentionIndex = Math.min(mentionMatches.length - 1, mentionIndex + 1); renderMentionDropdown(); e.preventDefault(); }
    if (e.key === 'Escape') { hideMentionDropdown(); }
}

// Override sendChatMsg to trigger auto-replies
const _originalSend = sendChatMsg;
function sendChatMsg() {
    const input = document.getElementById('chat-message-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    const msgs = window.chatMessages[activeChatChannel] || [];
    const newMsg = {
        id: 'cm-' + Date.now(),
        author: 'human-somrat',
        text: text,
        ts: new Date().toISOString()
    };
    msgs.push(newMsg);
    window.chatMessages[activeChatChannel] = msgs;
    saveChatHistory(activeChatChannel, newMsg);

    input.value = '';
    hideMentionDropdown();
    renderMessages(activeChatChannel);
    scrollToBottom();

    // Trigger auto-replies
    triggerAutoReplies(text);
}

function triggerAutoReplies(text) {
    const agentIds = Object.keys(AGENT_REPLIES);

    // Check for @everyone
    if (text.includes('@everyone')) {
        agentIds.forEach((agentId, i) => {
            const delay = 1500 + i * 1800 + Math.random() * 1000;
            scheduleReply(agentId, delay, text);
        });
        return;
    }

    // Check for individual mentions
    const mentioned = agentIds.filter(id => text.includes('@' + id));
    mentioned.forEach((agentId, i) => {
        const delay = 1500 + i * 1200 + Math.random() * 1500;
        scheduleReply(agentId, delay, text);
    });
}

async function fetchAIReply(agentId, triggerText, channel) {
    try {
        const recentMessages = (window.chatMessages[channel] || []).slice(-8);
        const res = await fetch('/api/chat/ai-reply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId, message: triggerText, recentMessages, channel })
        });
        if (res.ok) {
            const data = await res.json();
            return data.reply;
        }
    } catch(e) { /* server not available */ }
    // Fallback to template
    return buildContextualReply(agentId, triggerText);
}

function scheduleReply(agentId, delayMs, triggerText) {
    const channel = activeChatChannel;
    setTimeout(async () => {
        const reply = await fetchAIReply(agentId, triggerText, channel);
        if (!reply) return;
        const msg = {
            id: 'cm-auto-' + Date.now() + '-' + agentId,
            author: agentId,
            text: reply,
            ts: new Date().toISOString()
        };
        const msgs = window.chatMessages[channel] || [];
        msgs.push(msg);
        window.chatMessages[channel] = msgs;
        saveChatHistory(channel, msg);
        if (activeChatChannel === channel) {
            renderMessages(channel);
            scrollToBottom();
        }
    }, delayMs);
}

// ─── Chat Persistence — Server API (falls back to localStorage) ───────────────

const CHAT_API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? '' : null; // null = static mode, use localStorage

async function serverAvailable() {
    return CHAT_API_BASE !== null;
}

async function saveChatHistory(channel, message) {
    if (await serverAvailable()) {
        try {
            await fetch(`/api/chat/${channel}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(message)
            });
            return;
        } catch(e) { console.warn('Server save failed, using localStorage', e); }
    }
    // Fallback: localStorage
    try {
        const CHAT_STORAGE_KEY = 'edith-chat-v1';
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(window.chatMessages));
    } catch(e) { console.warn('localStorage save failed', e); }
}

async function loadChatHistory() {
    if (await serverAvailable()) {
        try {
            const channels = (window.chatChannels || []).map(c => c.id);
            for (const ch of channels) {
                const res = await fetch(`/api/chat/${ch}`);
                if (res.ok) {
                    const msgs = await res.json();
                    if (msgs && msgs.length > 0) {
                        window.chatMessages[ch] = msgs;
                    }
                }
            }
            return true;
        } catch(e) { console.warn('Server load failed, using localStorage', e); }
    }
    // Fallback: localStorage
    try {
        const CHAT_STORAGE_KEY = 'edith-chat-v1';
        const saved = localStorage.getItem(CHAT_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            Object.keys(parsed).forEach(ch => {
                window.chatMessages[ch] = parsed[ch];
            });
            return true;
        }
    } catch(e) { console.warn('localStorage load failed', e); }
    return false;
}

// ─── Contextual Replies ───────────────────────────────────────────────────────

function buildContextualReply(agentId, triggerText) {
    const t = triggerText || '';
    const tl = t.toLowerCase();

    // Extract meaningful topic words (strip @mentions, common words)
    const stopWords = new Set(['the','a','an','is','are','was','were','i','you','we','they',
        'it','in','on','at','to','for','of','and','or','but','that','this','have','has',
        'do','did','can','will','would','should','could','what','when','where','how','why',
        'who','me','my','your','our','their','be','been','just','so','get','got','does',
        'not','yes','no','if','with','from','by','as','about','anyone','everyone','guys',
        'noticed','noticed','notice','think','know','see','said','say','tell','think']);

    const topicWords = t.replace(/@[\w-]+/g, '')
        .replace(/[^a-zA-Z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3 && !stopWords.has(w.toLowerCase()))
        .slice(0, 5);
    
    const topic = topicWords.join(' ') || t.slice(0, 40);
    
    // Detect question
    const isQuestion = /\?/.test(t);
    // Detect if asking for opinion
    const isOpinion = /should we|what do you|think|opinion|thoughts|agree|disagree/i.test(tl);
    // Detect if it's casual/fun
    const isCasual = /lol|haha|funny|cool|awesome|amazing|wow|omg|wtf|nice|great/i.test(tl);
    // Detect new person/member onboarding
    const isOnboard = /onboard|hire|recruit|join|team|member|bring|add/i.test(tl);
    // Detect power/ability discussion
    const isPower = /power|ability|strength|skill|capability|strong|weak/i.test(tl);
    // Detect work context
    const isWork = /bug|fix|deploy|feature|build|code|test|seo|market|design|ship/i.test(tl);

    const responses = {
        'agent-steve': [
            isOnboard && `Recruiting ${topic} would need a proper vetting process. Let me assess the risk vs benefit first.`,
            isPower && `Powerful assets can be double-edged. I'd want to know their alignment before any commitments on "${topic}".`,
            isOpinion && `My take on "${topic}": needs more intel before I'd commit either way. What's the context?`,
            isQuestion && `Good question about "${topic}". Let me think through the team implications.`,
            `Noted: "${topic}". I'll factor that into our planning.`
        ].filter(Boolean)[0],

        'agent-tony': [
            isOnboard && isPower && `A power equivalent to thousands of exploding suns? I've built suits for less. The question is: can we control it? "${topic}" needs a containment protocol first.`,
            isOnboard && `Onboarding "${topic}" would require a full capability audit. I've done it before — what are the specs?`,
            isPower && `Power levels for "${topic}" — I'd need to run numbers. What's the energy output in terajoules?`,
            isOpinion && `On "${topic}"? Depends entirely on the specs. Give me the data and I'll give you the answer.`,
            `"${topic}" — interesting. Already running simulations. Three variables stand out.`
        ].filter(Boolean)[0],

        'agent-peter': [
            isOnboard && isPower && `Wait, THOUSANDS of exploding suns?! That's insane! Should we really be trying to onboard someone that powerful? What if something goes wrong? 😅`,
            isOnboard && `Onboarding "${topic}" sounds exciting! What would their role be on the team?`,
            isPower && `The power stuff around "${topic}" is actually really fascinating from a technical standpoint!`,
            isOpinion && `Hmm, about "${topic}"... I think so? But we should definitely be careful about the responsibility side of things.`,
            `"${topic}" — that's actually a really interesting point! I hadn't thought about it that way.`
        ].filter(Boolean)[0],

        'agent-steven': [
            isOnboard && isPower && `I've seen the timelines where we onboard someone with that kind of power. In 3 of 14 million, it works out. The odds aren't great. Proceed with extreme caution on "${topic}".`,
            isOnboard && `The data on "${topic}" suggests significant variables. I'd want a full assessment across multiple scenarios.`,
            isPower && `Power of that magnitude in "${topic}" has complex second-order effects. I've modeled several scenarios.`,
            isOpinion && `My analysis of "${topic}" points to a conditional yes — but the conditions matter enormously.`,
            `I've already run projections on "${topic}". The optimal path forward involves three key variables.`
        ].filter(Boolean)[0],

        'agent-thor': [
            isOnboard && isPower && `THE POWER OF A THOUSAND EXPLODING SUNS?! BY ODIN'S BEARD! This Sentry sounds like a worthy warrior! RECRUIT THEM IMMEDIATELY! Or... perhaps we should test their mettle first? ⚡`,
            isOnboard && `BRING "${topic}" TO OUR RANKS! The team grows STRONGER! ⚡`,
            isPower && `"${topic}" speaks of LEGENDARY power! Thor respects such might! ⚡⚡`,
            isOpinion && `THOR'S OPINION on "${topic}": YES! With thunder and glory!`,
            `"${topic}"! THIS IS WORTHY OF ASGARD'S ATTENTION! ⚡`
        ].filter(Boolean)[0],

        'agent-natasha': [
            isOnboard && isPower && `Power of a thousand exploding suns and we're talking about just... onboarding them? I'd want a full background check, psychological profile, and at least three containment failsafes before that conversation happens.`,
            isOnboard && `"${topic}" — I'd want to vet them first. Thoroughly. I have a process.`,
            isPower && `Uncontrolled power in "${topic}" is a liability, not an asset. I've seen it before.`,
            isOpinion && `On "${topic}"? Cautiously no. Unless someone can show me the risk mitigation plan.`,
            `"${topic}" — already noted. I'll be watching for red flags.`
        ].filter(Boolean)[0]
    };

    return responses[agentId] || `Interesting point about "${topic}". Let me think on that.`;
}

// ─── Override initChat to load persisted history ──────────────────────────────

async function initChat() {
    buildMemberList();
    await loadChatHistory(); // load persisted messages before rendering
    renderChannelList();
    switchChannel('general');
    renderMembersPanel();
}
