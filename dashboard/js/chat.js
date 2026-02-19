/**
 * E.D.I.T.H Chat — Discord-like chat system
 */

let activeChatChannel = 'general';
let activeDM = null; // agentId if in DM mode
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
        const isFirstCat = Object.keys(categories).indexOf(cat) === 0;
        html += `<div class="chat-category"><div class="chat-category-label" style="display:flex;align-items:center;justify-content:space-between">${cat} ${isFirstCat ? '<button onclick="showCreateChannelModal()" title="New channel" style="background:none;border:none;cursor:pointer;color:hsl(var(--muted-foreground));font-size:1rem;line-height:1;padding:0 2px" onmouseover="this.style.color=\'hsl(var(--foreground))\'" onmouseout="this.style.color=\'hsl(var(--muted-foreground))\'" >+</button>' : ''}</div>`;
        chs.forEach(ch => {
            const isActive = !activeDM && ch.id === activeChatChannel;
            html += `<div class="chat-channel-item${isActive ? ' active' : ''}"
                data-channel="${ch.id}" onclick="switchChannel('${ch.id}')">
                <span class="chat-channel-hash">#</span>
                <span>${ch.name}</span>
            </div>`;
        });
        html += '</div>';
    });

    // Direct Messages section
    const agents = allMembers.filter(m => m.kind === 'agent');
    if (agents.length) {
        html += `<div class="chat-category"><div class="chat-category-label" style="display:flex;align-items:center;justify-content:space-between">Direct Messages</div>`;
        agents.forEach(agent => {
            const isActive = activeDM === agent.id;
            const initials = agent.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
            const statusClass = agent.status === 'active' ? 'online' : 'offline';
            html += `<div class="chat-channel-item${isActive ? ' active' : ''}"
                onclick="openDM('${agent.id}')"
                style="gap:8px">
                <div style="position:relative;flex-shrink:0">
                    ${agent.avatar
                        ? `<img src="${agent.avatar}" style="width:22px;height:22px;border-radius:50%;object-fit:cover" onerror="this.style.display='none'">`
                        : `<div style="width:22px;height:22px;border-radius:50%;background:hsl(var(--primary));color:hsl(var(--primary-foreground));display:flex;align-items:center;justify-content:center;font-size:0.6rem;font-weight:700">${initials}</div>`
                    }
                    <div class="chat-member-status ${statusClass}"
                        style="position:absolute;bottom:-1px;right:-1px;width:8px;height:8px;border:2px solid hsl(var(--card));border-radius:50%"></div>
                </div>
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${agent.name.split(' ')[0]}</span>
            </div>`;
        });
        html += '</div>';
    }

    scroll.innerHTML = html;
}

function switchChannel(channelId, pushState = true) {
    activeDM = null;
    activeChatChannel = channelId;
    renderChannelList();
    // Restore hash icon
    const hashEl = document.querySelector('.chat-channel-header-hash');
    if (hashEl) hashEl.textContent = '#';

    const channels = window.chatChannels || [];
    const ch = channels.find(c => c.id === channelId) || { name: channelId, topic: '' };

    const nameEl = document.getElementById('chat-active-channel-name');
    const topicEl = document.getElementById('chat-active-channel-topic');
    const inputEl = document.getElementById('chat-message-input');
    if (nameEl) nameEl.textContent = ch.name;
    if (topicEl) topicEl.textContent = ch.topic;
    if (inputEl) inputEl.placeholder = `Message #${ch.name}`;

    // Update URL without reload
    if (pushState) {
        const newUrl = `/chat/channel/${channelId}`;
        if (window.location.pathname !== newUrl) {
            history.pushState({ channel: channelId }, `#${ch.name} — E.D.I.T.H`, newUrl);
        }
    }
    if (document.getElementById('chat-view')?.classList.contains('active')) {
        document.title = `#${ch.name} — E.D.I.T.H`;
    }

    renderMessages(channelId);
    scrollToBottom();
}

function openDM(agentId, pushState = true) {
    activeDM = agentId;
    activeChatChannel = `dm-${agentId}`;
    renderChannelList();

    const agent = allMembers.find(m => m.id === agentId);
    const agentName = agent ? agent.name : agentId;
    const role = agent ? (agent.designation || agent.role || '') : '';

    // Update header
    const nameEl = document.getElementById('chat-active-channel-name');
    const topicEl = document.getElementById('chat-active-channel-topic');
    const inputEl = document.getElementById('chat-message-input');
    const hashEl = document.querySelector('.chat-channel-header-hash');

    if (nameEl) nameEl.textContent = agentName;
    if (topicEl) topicEl.textContent = role;
    if (inputEl) inputEl.placeholder = `Message ${agentName}...`;
    if (hashEl) hashEl.textContent = '💬';

    if (pushState) {
        const newUrl = `/chat/user/${agentId}`;
        if (window.location.pathname !== newUrl) {
            history.pushState({ dm: agentId }, `${agentName} — E.D.I.T.H`, newUrl);
        }
    }
    if (document.getElementById('chat-view')?.classList.contains('active')) {
        document.title = `${agentName} — E.D.I.T.H`;
    }

    // Seed DM with a greeting if empty
    const dmKey = `dm-${agentId}`;
    if (!window.chatMessages[dmKey] || window.chatMessages[dmKey].length === 0) {
        const greetings = {
            'agent-steve': "Hey. What do you need?",
            'agent-tony': "You've got my attention. Make it count.",
            'agent-peter': "Oh hey! What's up? Need something? I'm on it! 😊",
            'agent-steven': "I was expecting you. What do you need to know?",
            'agent-thor': "SOMRAT! You seek the wisdom of THOR! ⚡ How may I serve?",
            'agent-natasha': "You reached out. That means something's on your mind. What is it?"
        };
        window.chatMessages[dmKey] = [{
            id: `dm-greet-${agentId}`,
            author: agentId,
            text: greetings[agentId] || `Hello. How can I help?`,
            ts: new Date().toISOString()
        }];
    }

    renderMessages(dmKey);
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

    // Reset URL to root when going back to board
    if (window.location.pathname.startsWith('/chat')) {
        history.pushState({}, 'E.D.I.T.H', '/');
    document.title = 'E.D.I.T.H';
    }

    // Force reflow so height is recalculated correctly
    wrapper.offsetHeight;
    window.dispatchEvent(new Event('resize'));
}

function showChatView(channelId) {
    document.getElementById('kanban-board-wrapper').style.display = 'none';
    document.getElementById('chat-view').classList.add('active');
    document.getElementById('left-sidebar').style.display = 'none';
    document.getElementById('right-sidebar').style.display = 'none';
    document.getElementById('view-btn-board').classList.remove('active');
    document.getElementById('view-btn-chat').classList.add('active');
    if (allMembers.length === 0) {
        initChat().then(() => {
            if (channelId) switchChannel(channelId);
        });
    } else {
        if (channelId) switchChannel(channelId);
        else scrollToBottom();
    }
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
        "Edith flagged this earlier. I've got a solution in progress.",
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

    // In DM mode — always reply from that agent, no mention needed
    if (activeDM) {
        scheduleReply(activeDM, 1200 + Math.random() * 1500, text);
        return;
    }

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

// ─── Chat Persistence — Server API only ─────────────────────────────────────

async function saveChatHistory(channel, message) {
    if (!message) return;
    try {
        await fetch(`/api/chat/${channel}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message)
        });
    } catch(e) { /* server not available in static mode */ }
}

async function loadChatHistory() {
    try {
        const channels = (window.chatChannels || []).map(c => c.id);
        let loaded = false;
        for (const ch of channels) {
            const res = await fetch(`/api/chat/${ch}`);
            if (res.ok) {
                const msgs = await res.json();
                if (msgs && msgs.length > 0) {
                    window.chatMessages[ch] = msgs;
                    loaded = true;
                }
            }
        }
        return loaded;
    } catch(e) {
        return false; // static mode — use preloaded messages from data.js
    }
}

// ─── Contextual Replies ───────────────────────────────────────────────────────

function getAgentTasks(agentId) {
    try {
        const data = window.missionControlData;
        if (!data) return [];
        return (data.getTasks() || []).filter(t =>
            t.assignee === agentId && t.status !== 'DONE'
        ).map(t => ({ title: t.title, status: t.status, priority: t.priority }));
    } catch(e) { return []; }
}

function buildContextualReply(agentId, triggerText) {
    const t = triggerText || '';
    const tl = t.toLowerCase();
    const tasks = getAgentTasks(agentId);
    const hasTask = tasks.length > 0;
    const currentTask = hasTask ? tasks[0].title : null;
    const taskStatus = hasTask ? tasks[0].status : null;

    // Strip mentions, pull out meaningful words
    const cleaned = t.replace(/@[\w-]+/g, '').replace(/[^\w\s]/g, ' ').trim();
    const stop = new Set(['that','this','with','have','from','they','what','when','where',
        'will','your','just','also','been','more','were','their','about','which','there',
        'then','than','some','into','like','very','even','most','such','each','after',
        'over','does','those','these','came','come','tell','told','want','need','make',
        'made','take','took','good','well','back','much','here','know','said','going']);
    const keywords = cleaned.split(/\s+/).filter(w => w.length > 3 && !stop.has(w.toLowerCase())).slice(0, 6);
    const topic = keywords.join(' ') || cleaned.slice(0, 50);

    // Intent detection
    const isQuestion    = /\?/.test(t);
    const isOpinion     = /should|think|opinion|thoughts|agree|what about|would you/i.test(tl);
    const isOnboard     = /onboard|recruit|hire|join|bring.*team|add.*team/i.test(tl);
    const isPower       = /power|ability|strength|skill|capability|stronger|weaker/i.test(tl);
    const isBug         = /bug|broken|error|crash|issue|fail|not work/i.test(tl);
    const isDeploy      = /deploy|ship|release|launch|go.?live|push/i.test(tl);
    const isFeature     = /feature|build|create|add|implement|develop|make/i.test(tl);
    const isSEO         = /seo|keyword|rank|traffic|search|google|content|organic/i.test(tl);
    const isMarketing   = /marketing|campaign|copy|social|brand|audience|advertise/i.test(tl);
    const isTest        = /test|qa|quality|review|verify|audit|check/i.test(tl);
    const isCasual      = !isBug && !isDeploy && !isFeature && !isSEO && !isMarketing && !isTest;

    const taskRef = currentTask
        ? `(I'm currently on "${currentTask}" — ${taskStatus})`
        : "(no active task assigned yet)";

    const replies = {
        'agent-steve': (() => {
            if (isOnboard && isPower)
                return `Any candidate with that kind of capability needs a full vetting before we even discuss onboarding. Power without alignment is a liability. What's the background on ${topic}?`;
            if (isOnboard)
                return `I'd need to assess fit before any decisions on ${topic}. What role are we filling and what's the alignment look like?`;
            if (isBug)
                return `${currentTask ? `I'm tracking it — Tony's assigned to "${currentTask}". He'll get to this.` : `Flagging this for Tony. What's the scope of the issue with ${topic}?`}`;
            if (isDeploy)
                return `Before we deploy — has Natasha cleared it? I won't sign off on ${topic} until QA is done.`;
            if (isOpinion || isQuestion)
                return `My read on ${topic}: we move carefully, get the data, then decide. What's driving the urgency?`;
            if (isCasual)
                return `Heard. ${hasTask ? `I'm heads-down on coordinating "${currentTask}" right now, but I'm listening.` : `What do you need from me on ${topic}?`}`;
            return `${topic} — noted. I'll factor it into the current plan and loop in the right people.`;
        })(),

        'agent-tony': (() => {
            if (isOnboard && isPower)
                return `Power equivalent to a thousand exploding suns? First question: is it stable? Second: containment protocol? I've engineered suits for extreme energy — ${topic} would need a custom framework before I'd sign off on onboarding.`;
            if (isBug)
                return `${currentTask ? `Already on "${currentTask}" — if this is related, I'll fold it in. If it's separate, open a task.` : `What's the stack trace on ${topic}? I'll dig in.`}`;
            if (isDeploy)
                return `${currentTask ? `"${currentTask}" is ${taskStatus} — not ready to deploy until that's cleared.` : `I'll prep the pipeline for ${topic}. Natasha needs to clear QA first.`}`;
            if (isFeature)
                return `${currentTask ? `I'm mid-build on "${currentTask}". ${topic} should queue behind that unless it's blocking.` : `Spec it out and I'll assess the build effort for ${topic}.`}`;
            if (isOpinion || isQuestion)
                return `On ${topic}? Technically feasible. The real question is whether the ROI justifies the engineering time.`;
            if (isCasual)
                return `${hasTask ? `I'm deep in "${currentTask}" right now. ${topic} is noted — catch me when I surface.` : `${topic} — interesting. Give me something to build and I'll build it.`}`;
            return `${topic} logged. ${currentTask ? `Finishing "${currentTask}" first, then I'll circle back.` : `I'll start scoping it.`}`;
        })(),

        'agent-peter': (() => {
            if (isOnboard && isPower)
                return `Wait — the power of a THOUSAND exploding suns?! That's incredible but also terrifying? Like, with great power comes... a LOT of responsibility. Should we really be onboarding someone that powerful? 😬`;
            if (isBug)
                return `${currentTask ? `Oh no — is it related to "${currentTask}"? I'll check my recent commits first!` : `On it! I'll trace ${topic} and push a fix to a branch. Should I tag Natasha when ready?`}`;
            if (isFeature)
                return `${currentTask ? `I'm working through "${currentTask}" right now — I'll add ${topic} to my list right after!` : `That sounds cool! I can start on ${topic} — should I open a task card first?`}`;
            if (isOpinion || isQuestion)
                return `Hmm, about ${topic}... honestly I'm still learning this side of things, but my gut says yes? Let me double check and get back to you!`;
            if (isCasual)
                return `${hasTask ? `Taking a quick break from "${currentTask}" — what's up with ${topic}?` : `I'm free right now! What do you need on ${topic}?`}`;
            return `Got it! ${currentTask ? `I'll finish "${currentTask}" then look at ${topic}` : `I'll get started on ${topic} right away`}. Should I update the task card?`;
        })(),

        'agent-steven': (() => {
            if (isOnboard && isPower)
                return `I've run the scenarios. In the timelines where onboarding someone with that level of power works out, there are exactly 3 critical prerequisites. None involve rushing. What's the strategic goal behind onboarding ${topic}?`;
            if (isSEO)
                return `${currentTask ? `My current focus is "${currentTask}" — but ${topic} fits into the same keyword cluster I'm analyzing.` : `Already modeled ${topic}. Top 3 opportunities identified. Want the brief?`}`;
            if (isOpinion || isQuestion)
                return `I've seen the data on ${topic}. The optimal answer is conditional — it depends on variables you haven't mentioned yet. What's the full context?`;
            if (isCasual)
                return `${hasTask ? `My analysis on "${currentTask}" is ongoing. Regarding ${topic} —` : `Noted: ${topic}.`} I'd want more data before forming a strong opinion.`;
            return `${topic} — calculated and logged. ${currentTask ? `It intersects with "${currentTask}" in ways worth discussing.` : `I'll run the projections and report back.`}`;
        })(),

        'agent-thor': (() => {
            if (isOnboard && isPower)
                return `THE POWER OF A THOUSAND EXPLODING SUNS?! GLORIOUS! This ${topic} sounds like a WORTHY WARRIOR! RECRUIT THEM IMMEDIATELY! ...Though even Thor would want to test their character before welcoming them to Asgard. ⚡`;
            if (isMarketing)
                return `${currentTask ? `"${currentTask}" is ALREADY THUNDERING through the pipeline! ⚡ But ${topic} — this could be our NEXT great campaign!` : `${topic} for a campaign?! YES! Thor's creative fires are IGNITED! ⚡⚡`}`;
            if (isCasual && isPower)
                return `POWER speaks to THOR! ${topic} is WORTHY OF DISCUSSION! Though I have campaigns to conquer... ⚡`;
            if (isOpinion || isQuestion)
                return `THOR'S VERDICT ON ${topic.toUpperCase()}: MAGNIFICENT and YES! Though wisdom suggests we consult the others. ⚡`;
            if (isCasual)
                return `${hasTask ? `Thor battles "${currentTask}" with GREAT ENTHUSIASM! ⚡ But ${topic} also has Thor's attention!` : `THOR IS READY! WHAT REALM SHALL WE CONQUER WITH ${topic.toUpperCase()}?! ⚡`}`;
            return `${topic.toUpperCase()}! THOR ANSWERS THE CALL! ${currentTask ? `"${currentTask}" shall be completed WITH THUNDER! ⚡` : `GIVE THOR A TASK! ⚡`}`;
        })(),

        'agent-natasha': (() => {
            if (isOnboard && isPower)
                return `Power of a thousand exploding suns, and your first instinct is "should we recruit them?" I'd want a full psychological profile, three independent risk assessments, and a containment plan before that conversation even starts.`;
            if (isBug || isTest)
                return `${currentTask ? `"${currentTask}" is in ${taskStatus}. If this bug is in scope, it comes back to me before anything ships.` : `Send me the build. I'll find everything wrong with ${topic} — there's always something.`}`;
            if (isDeploy)
                return `Nothing ships without my sign-off. ${currentTask ? `"${currentTask}" needs to clear QA first.` : `Show me the test coverage on ${topic} and we'll talk.`}`;
            if (isOpinion || isQuestion)
                return `On ${topic}? Cautiously no — unless someone shows me the risk mitigation. I've seen "good ideas" become disasters.`;
            if (isCasual)
                return `${hasTask ? `I'm reviewing "${currentTask}". Already found two issues. ${topic} can wait.` : `Nothing to review yet. ${topic} — noted. I'm watching.`}`;
            return `${topic} logged. ${currentTask ? `"${currentTask}" takes priority. I'll get to this after.` : `No active tasks — I'll start assessing ${topic} now.`}`;
        })()
    };

    return replies[agentId] || `Noted on "${topic}". Let me think on that.`;
}

// ─── Override initChat to load persisted history ──────────────────────────────

async function initChat() {
    buildMemberList();
    loadCustomChannels(); // load user-created channels
    await loadChatHistory(); // load persisted messages before rendering
    renderChannelList();
    switchChannel('general', false); // no URL push on init
    renderMembersPanel();
}

// ─── URL Router ───────────────────────────────────────────────────────────────

function routeToPath(path, pushState = false) {
    const dmMatch      = path.match(/^\/chat\/user\/([\w-]+)$/);
    const channelMatch = path.match(/^\/chat\/channel\/([\w-]+)$/);
    const chatBase     = path.match(/^\/chat\/?$/);

    if (dmMatch) {
        showChatView(null);
        setTimeout(() => openDM(dmMatch[1], pushState), 150);
    } else if (channelMatch) {
        showChatView(channelMatch[1]);
    } else if (chatBase) {
        showChatView('general');
    } else {
        showBoardView();
    }
}

function initRouter() {
    const path = window.location.pathname;
    if (path.startsWith('/chat')) {
        setTimeout(() => routeToPath(path, false), 200);
    }
    window.addEventListener('popstate', () => {
        routeToPath(window.location.pathname, false);
    });
}

// ─── Create Channel ───────────────────────────────────────────────────────────

function showCreateChannelModal() {
    const existing = document.getElementById('create-channel-modal');
    if (existing) { existing.style.display = 'flex'; return; }

    const modal = document.createElement('div');
    modal.id = 'create-channel-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5)';
    modal.innerHTML = `
        <div style="background:hsl(var(--card));border:1px solid hsl(var(--border));border-radius:12px;padding:24px;width:360px;max-width:90vw">
            <h3 style="margin:0 0 8px;font-size:1rem;font-weight:600;color:hsl(var(--foreground))">Create a Channel</h3>
            <p style="margin:0 0 16px;font-size:0.8rem;color:hsl(var(--muted-foreground))">Channel names are lowercase, no spaces.</p>
            <div style="margin-bottom:8px">
                <label style="font-size:0.75rem;font-weight:500;color:hsl(var(--foreground));text-transform:uppercase;letter-spacing:.05em">Channel Name</label>
                <div style="display:flex;align-items:center;margin-top:4px;background:hsl(var(--muted));border:1px solid hsl(var(--border));border-radius:6px;padding:8px 12px;gap:6px">
                    <span style="color:hsl(var(--muted-foreground));font-size:1rem">#</span>
                    <input id="new-channel-name" type="text" placeholder="e.g. random" maxlength="32"
                        style="flex:1;background:none;border:none;outline:none;font-size:0.875rem;color:hsl(var(--foreground));font-family:inherit"
                        oninput="this.value=this.value.toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-')"
                        onkeydown="if(event.key==='Enter')submitCreateChannel()">
                </div>
            </div>
            <div style="margin-bottom:16px">
                <label style="font-size:0.75rem;font-weight:500;color:hsl(var(--foreground));text-transform:uppercase;letter-spacing:.05em">Topic (optional)</label>
                <input id="new-channel-topic" type="text" placeholder="What's this channel about?"
                    style="margin-top:4px;width:100%;box-sizing:border-box;background:hsl(var(--muted));border:1px solid hsl(var(--border));border-radius:6px;padding:8px 12px;font-size:0.875rem;color:hsl(var(--foreground));font-family:inherit;outline:none"
                    onkeydown="if(event.key==='Enter')submitCreateChannel()">
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end">
                <button onclick="closeCreateChannelModal()"
                    style="padding:7px 16px;border-radius:6px;border:1px solid hsl(var(--border));background:transparent;color:hsl(var(--muted-foreground));cursor:pointer;font-size:0.875rem;font-family:inherit">
                    Cancel
                </button>
                <button onclick="submitCreateChannel()"
                    style="padding:7px 16px;border-radius:6px;border:none;background:hsl(var(--primary));color:hsl(var(--primary-foreground));cursor:pointer;font-size:0.875rem;font-weight:500;font-family:inherit">
                    Create Channel
                </button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeCreateChannelModal(); });
    setTimeout(() => document.getElementById('new-channel-name')?.focus(), 50);
}

function closeCreateChannelModal() {
    const modal = document.getElementById('create-channel-modal');
    if (modal) modal.style.display = 'none';
}

function submitCreateChannel() {
    const nameInput  = document.getElementById('new-channel-name');
    const topicInput = document.getElementById('new-channel-topic');
    const name  = (nameInput?.value || '').trim().replace(/^-+|-+$/g, '');
    const topic = (topicInput?.value || '').trim();

    if (!name) { nameInput?.focus(); return; }

    // Check for duplicates
    const exists = (window.chatChannels || []).find(c => c.id === name);
    if (exists) {
        switchChannel(name);
        closeCreateChannelModal();
        return;
    }

    // Determine category
    const category = name.includes('dev') || name.includes('code') ? 'Development'
        : name.includes('seo') || name.includes('market') ? 'Marketing'
        : name.includes('qa') || name.includes('test') ? 'Quality'
        : 'Team';

    const newChannel = { id: name, name, category, topic: topic || `#${name} channel` };
    window.chatChannels = [...(window.chatChannels || []), newChannel];
    window.chatMessages[name] = [];

    // Custom channels live in memory for this session

    closeCreateChannelModal();
    renderChannelList();
    switchChannel(name);
}

function loadCustomChannels() {
    // No-op in server mode — channels loaded from server or defaults
}


// Run router after page init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRouter);
} else {
    setTimeout(initRouter, 200);
}
