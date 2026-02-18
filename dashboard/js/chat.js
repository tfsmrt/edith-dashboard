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
    // Mentions: @agent-tony → styled span
    text = text.replace(/@([\w-]+)/g, (match, id) => {
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
    document.getElementById('kanban-board-wrapper').style.display = '';
    document.getElementById('chat-view').classList.remove('active');
    document.getElementById('left-sidebar').style.display = '';
    document.getElementById('right-sidebar').style.display = '';
    document.getElementById('view-btn-board').classList.add('active');
    document.getElementById('view-btn-chat').classList.remove('active');
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
