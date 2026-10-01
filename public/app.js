/**
 * GLOBAL CHAT - CLIENT LOGIC
 * Font: Courier New | Mobile-First Optimized
 */

(function () {
  'use strict';

  // State
  let myWanIp = '17.167.4.112';
  let myIpCode = '74112';
  let myClientId = null;
  let myFullDisplayName = '';
  let ws = null;
  let reconnectTimer = null;
  let isJoined = false;

  // DOM Elements
  const screenLogin = document.getElementById('screen-login');
  const screenChat = document.getElementById('screen-chat');

  const inputUsername = document.getElementById('input-username');
  const formLogin = document.getElementById('form-login');

  const currentUserNameEl = document.getElementById('current-user-name');
  const onlineCountEl = document.getElementById('online-count');
  const btnLeave = document.getElementById('btn-leave');

  const chatMessagesArea = document.getElementById('chat-messages-container');
  const chatMessagesList = document.getElementById('chat-messages');
  const btnScrollBottom = document.getElementById('btn-scroll-bottom');

  const formChat = document.getElementById('form-chat');
  const inputChatMessage = document.getElementById('input-chat-message');

  // ============================================================================
  // TỐI ƯU VIEWPORT CHIỀU CAO CHO ĐIỆN THOẠI (BÀN PHÍM ẢO)
  // ============================================================================

  function updateViewportHeight() {
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${vh}px`);
    if (isJoined) {
      setTimeout(() => scrollToBottom(true), 50);
    }
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateViewportHeight);
    window.visualViewport.addEventListener('scroll', updateViewportHeight);
  } else {
    window.addEventListener('resize', updateViewportHeight);
  }
  updateViewportHeight();

  // ============================================================================
  // THUẬT TOÁN LỌC 5 SỐ CUỐI CỦA IP WAN
  // ============================================================================

  function extract5DigitsFromWanIp(ip) {
    if (!ip) return '74112';
    const digits = ip.replace(/\D/g, '');
    if (digits.length >= 5) {
      return digits.slice(-5);
    }
    return digits.padStart(5, '0');
  }

  function setWanIpAndCode(ip) {
    if (!ip) return;
    myWanIp = ip.trim();
    myIpCode = extract5DigitsFromWanIp(myWanIp);
  }

  // ============================================================================
  // LẤY IP WAN TỪ CLIENT VÀ SERVER (CHẠY NGẦM)
  // ============================================================================

  async function fetchWanIp() {
    const wanServices = [
      'https://api.ipify.org?format=json',
      'https://api64.ipify.org?format=json',
      'https://icanhazip.com'
    ];

    for (const service of wanServices) {
      try {
        const response = await fetch(service, {
          signal: AbortSignal.timeout(3000)
        });
        if (response.ok) {
          const text = await response.text();
          let ip = '';
          try {
            const data = JSON.parse(text);
            ip = data.ip;
          } catch (e) {
            ip = text.trim();
          }

          if (ip && /^[\d\.:a-fA-F]+$/.test(ip)) {
            setWanIpAndCode(ip);
            return;
          }
        }
      } catch (err) {}
    }

    try {
      const res = await fetch('/api/my-info');
      if (res.ok) {
        const data = await res.json();
        if (data.wanIp) {
          setWanIpAndCode(data.wanIp);
        }
      }
    } catch (e) {}
  }

  const savedName = localStorage.getItem('globalchat_username');
  if (savedName) {
    inputUsername.value = savedName;
  }

  // ============================================================================
  // WEBSOCKET KẾT NỐI & TỰ ĐỘNG RECONNECT
  // ============================================================================

  function getWsUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }

  function initWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      ws = new WebSocket(getWsUrl());

      ws.onopen = () => {
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }

        if (isJoined && myFullDisplayName) {
          const rawName = inputUsername.value.trim() || 'User';
          ws.send(JSON.stringify({ 
            type: 'join', 
            username: rawName,
            wanIp: myWanIp
          }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleServerMessage(data);
        } catch (e) {}
      };

      ws.onclose = () => {
        scheduleReconnect();
      };

      ws.onerror = () => {
        scheduleReconnect();
      };
    } catch (err) {
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        initWebSocket();
      }, 2000);
    }
  }

  // ============================================================================
  // XỬ LÝ SỰ KIỆN TỪ SERVER
  // ============================================================================

  function handleServerMessage(data) {
    switch (data.type) {
      case 'init':
        myClientId = data.clientId;
        if (data.wanIp && myWanIp === '17.167.4.112' && data.wanIp !== '17.167.4.112') {
          setWanIpAndCode(data.wanIp);
        }

        if (data.onlineCount !== undefined) {
          onlineCountEl.textContent = data.count || data.onlineCount || 1;
        }

        if (Array.isArray(data.history) && data.history.length > 0) {
          chatMessagesList.innerHTML = '';
          data.history.forEach((msg) => renderMessage(msg, false));
          scrollToBottom(true);
        }
        break;

      case 'join_success':
        myFullDisplayName = data.fullDisplayName;
        if (data.ipCode) myIpCode = data.ipCode;
        currentUserNameEl.textContent = myFullDisplayName;
        break;

      case 'online_count':
        onlineCountEl.textContent = data.count || 1;
        break;

      case 'chat':
        renderMessage(data, true);
        break;

      case 'system':
        renderSystemMessage(data);
        break;
    }
  }

  // ============================================================================
  // RENDER GIAO DIỆN
  // ============================================================================

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Định dạng thời gian gọn gàng: hh:mm
  function formatShortTime(timeStr) {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}`;
    }
    return timeStr;
  }

  function renderMessage(msg, shouldAutoScroll) {
    const isMine = msg.senderId === myClientId || (myFullDisplayName && msg.senderName === myFullDisplayName);
    const row = document.createElement('div');
    row.className = `message-row ${isMine ? 'mine' : 'other'}`;

    const safeContent = escapeHtml(msg.content);
    const safeSender = escapeHtml(msg.senderName);
    const timeDisplay = formatShortTime(msg.time);

    row.innerHTML = `
      <div class="message-meta">
        ${isMine ? '<span class="meta-tag-you">BẠN</span>' : ''}
        <span class="meta-sender">${safeSender}</span>
        <span class="meta-time">${timeDisplay}</span>
      </div>
      <div class="bubble">
        <div class="bubble-content">${safeContent}</div>
      </div>
    `;

    chatMessagesList.appendChild(row);

    if (shouldAutoScroll) {
      checkScrollAndStickBottom();
    }
  }

  function renderSystemMessage(msg) {
    const row = document.createElement('div');
    row.className = 'message-row system';
    const safeText = escapeHtml(msg.text);
    const timeDisplay = formatShortTime(msg.time);

    row.innerHTML = `
      <div class="system-badge">
        *** ${timeDisplay ? '[' + timeDisplay + '] ' : ''}${safeText} ***
      </div>
    `;

    chatMessagesList.appendChild(row);
    checkScrollAndStickBottom();
  }

  function scrollToBottom(force = false) {
    if (force) {
      chatMessagesList.scrollTop = chatMessagesList.scrollHeight;
      btnScrollBottom.classList.add('hidden');
    } else {
      chatMessagesList.scrollTo({
        top: chatMessagesList.scrollHeight,
        behavior: 'smooth'
      });
      btnScrollBottom.classList.add('hidden');
    }
  }

  function checkScrollAndStickBottom() {
    const threshold = 100;
    const isNearBottom =
      chatMessagesList.scrollHeight - chatMessagesList.scrollTop - chatMessagesList.clientHeight <= threshold;

    if (isNearBottom) {
      scrollToBottom(true);
    } else {
      btnScrollBottom.classList.remove('hidden');
    }
  }

  chatMessagesList.addEventListener('scroll', () => {
    const threshold = 100;
    const isNearBottom =
      chatMessagesList.scrollHeight - chatMessagesList.scrollTop - chatMessagesList.clientHeight <= threshold;
    if (isNearBottom) {
      btnScrollBottom.classList.add('hidden');
    }
  });

  btnScrollBottom.addEventListener('click', () => {
    scrollToBottom(true);
  });

  // Tự cuộn khi bấm vào ô nhập tin nhắn trên điện thoại
  inputChatMessage.addEventListener('focus', () => {
    setTimeout(() => scrollToBottom(true), 250);
  });

  // ============================================================================
  // SỰ KIỆN START CHAT & GỬI TIN NHẮN
  // ============================================================================

  function startChat() {
    const rawName = inputUsername.value.trim();
    if (!rawName) {
      inputUsername.focus();
      return;
    }

    localStorage.setItem('globalchat_username', rawName);

    screenLogin.classList.remove('active');
    screenChat.classList.add('active');
    isJoined = true;
    updateViewportHeight();

    const sendJoin = () => {
      ws.send(JSON.stringify({ 
        type: 'join', 
        username: rawName,
        wanIp: myWanIp
      }));
    };

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      initWebSocket();
      const checkReady = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          clearInterval(checkReady);
          sendJoin();
        }
      }, 100);
    } else {
      sendJoin();
    }

    setTimeout(() => {
      scrollToBottom(true);
      // Trên desktop tự focus, trên mobile tránh tự bật bàn phím đột ngột
      if (window.innerWidth > 640) {
        inputChatMessage.focus();
      }
    }, 150);
  }

  formLogin.addEventListener('submit', (e) => {
    e.preventDefault();
    startChat();
  });

  btnLeave.addEventListener('click', () => {
    isJoined = false;
    screenChat.classList.remove('active');
    screenLogin.classList.add('active');
    updateViewportHeight();
    setTimeout(() => {
      inputUsername.focus();
      inputUsername.select();
    }, 100);
  });

  function sendMessage() {
    const text = inputChatMessage.value.trim();
    if (!text) return;

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      alert('Đang kết nối lại máy chủ... Vui lòng thử lại sau giây lát.');
      return;
    }

    ws.send(
      JSON.stringify({
        type: 'chat',
        content: text
      })
    );

    inputChatMessage.value = '';
    // Giữ focus nhẹ nhàng
    inputChatMessage.focus();
    scrollToBottom(true);
  }

  formChat.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage();
  });

  inputChatMessage.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // ============================================================================
  // KHỞI CHẠY
  // ============================================================================
  fetchWanIp();
  initWebSocket();
})();
