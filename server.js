const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

const messageHistory = [];
const MAX_HISTORY = 100;

const clients = new Map(); // socket -> clientInfo
let serverWanIp = '17.167.4.112';

/**
 * Lọc 5 số cuối từ địa chỉ IP WAN (ví dụ: 17.167.4.112 -> 74112)
 */
function extract5DigitsFromWanIp(ip) {
  if (!ip) return '74112';
  const digits = ip.replace(/\D/g, '');
  if (digits.length >= 5) {
    return digits.slice(-5);
  }
  return digits.padStart(5, '0');
}

/**
 * Lấy IP WAN công cộng của máy chủ
 */
function fetchWanIpFromServer() {
  https.get('https://api.ipify.org?format=json', { timeout: 3500 }, (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (json.ip) {
          serverWanIp = json.ip;
        }
      } catch (e) {}
    });
  }).on('error', () => {});
}

fetchWanIpFromServer();

function getClientIp(req) {
  let ip = req.headers['cf-connecting-ip'] || 
           req.headers['x-real-ip'] || 
           req.headers['x-forwarded-for'];
  if (ip) {
    ip = ip.split(',')[0].trim();
  } else {
    ip = req.socket?.remoteAddress || req.connection?.remoteAddress || '';
  }

  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  return ip;
}

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  const clientConnectIp = getClientIp(req);

  if (req.url === '/api/my-info' && req.method === 'GET') {
    const isPublic = clientConnectIp && !clientConnectIp.startsWith('127.') && !clientConnectIp.startsWith('192.168.') && !clientConnectIp.startsWith('10.') && clientConnectIp !== '::1';
    const effectiveWan = isPublic ? clientConnectIp : serverWanIp;
    const ipCode = extract5DigitsFromWanIp(effectiveWan);

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(JSON.stringify({
      wanIp: effectiveWan,
      ipCode: ipCode
    }));
  }

  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

// ============================================================================
// WEBSOCKET RFC 6455 ENGINE
// ============================================================================

function encodeWebSocketFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const length = payload.length;
  let header;

  if (length <= 125) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = length;
  } else if (length <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  return Buffer.concat([header, payload]);
}

function sendToSocket(socket, dataObj) {
  if (socket.destroyed || !socket.writable) return;
  try {
    const raw = JSON.stringify(dataObj);
    const frame = encodeWebSocketFrame(raw);
    socket.write(frame);
  } catch (err) {}
}

function broadcast(dataObj) {
  const raw = JSON.stringify(dataObj);
  const frame = encodeWebSocketFrame(raw);
  for (const [socket] of clients) {
    if (!socket.destroyed && socket.writable) {
      try {
        socket.write(frame);
      } catch (err) {}
    }
  }
}

function broadcastOnlineCount() {
  broadcast({
    type: 'online_count',
    count: clients.size
  });
}

server.on('upgrade', (req, socket, head) => {
  if (req.headers['upgrade']?.toLowerCase() !== 'websocket') {
    socket.destroy();
    return;
  }

  const clientConnectIp = getClientIp(req);
  const isPublic = clientConnectIp && !clientConnectIp.startsWith('127.') && !clientConnectIp.startsWith('192.168.') && !clientConnectIp.startsWith('10.') && clientConnectIp !== '::1';
  const initialWan = isPublic ? clientConnectIp : serverWanIp;
  const initialCode = extract5DigitsFromWanIp(initialWan);

  const clientKey = req.headers['sec-websocket-key'];
  if (!clientKey) {
    socket.destroy();
    return;
  }

  const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
  const acceptKey = crypto
    .createHash('sha1')
    .update(clientKey + GUID)
    .digest('base64');

  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
    '\r\n'
  ].join('\r\n');

  socket.write(responseHeaders);

  const clientInfo = {
    id: crypto.randomUUID(),
    wanIp: initialWan,
    ipCode: initialCode,
    username: '',
    fullDisplayName: '',
    joined: false
  };

  clients.set(socket, clientInfo);

  // Thông báo console máy chủ: Kết nối mới & số lượng truy cập
  console.log(`[+] Kết nối mới | IP WAN: ${clientInfo.wanIp} | Đang online: ${clients.size}`);

  sendToSocket(socket, {
    type: 'init',
    clientId: clientInfo.id,
    wanIp: initialWan,
    ipCode: initialCode,
    onlineCount: clients.size,
    history: messageHistory
  });

  broadcastOnlineCount();

  let buffer = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 2) {
      const firstByte = buffer[0];
      const secondByte = buffer[1];

      const opcode = firstByte & 0x0f;
      const masked = (secondByte & 0x80) !== 0;
      let payloadLength = secondByte & 0x7f;

      let currentOffset = 2;

      if (payloadLength === 126) {
        if (buffer.length < currentOffset + 2) break;
        payloadLength = buffer.readUInt16BE(currentOffset);
        currentOffset += 2;
      } else if (payloadLength === 127) {
        if (buffer.length < currentOffset + 8) break;
        payloadLength = Number(buffer.readBigUInt64BE(currentOffset));
        currentOffset += 8;
      }

      let maskingKey = null;
      if (masked) {
        if (buffer.length < currentOffset + 4) break;
        maskingKey = buffer.subarray(currentOffset, currentOffset + 4);
        currentOffset += 4;
      }

      if (buffer.length < currentOffset + payloadLength) {
        break;
      }

      const rawPayload = buffer.subarray(currentOffset, currentOffset + payloadLength);
      buffer = buffer.subarray(currentOffset + payloadLength);

      let payload = Buffer.from(rawPayload);
      if (masked && maskingKey) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskingKey[i % 4];
        }
      }

      if (opcode === 0x8) {
        socket.end();
        return;
      } else if (opcode === 0x9) {
        const pong = Buffer.alloc(2);
        pong[0] = 0x8a;
        pong[1] = 0;
        socket.write(pong);
      } else if (opcode === 0x1) {
        const textMessage = payload.toString('utf8');
        try {
          const parsed = JSON.parse(textMessage);
          handleClientMessage(socket, clientInfo, parsed);
        } catch (e) {}
      }
    }
  });

  const handleDisconnect = () => {
    if (clients.has(socket)) {
      const info = clients.get(socket);
      clients.delete(socket);

      // Thông báo console máy chủ khi ngắt kết nối
      const displayName = info.fullDisplayName || info.wanIp || 'Khách';
      console.log(`[-] Ngắt kết nối: ${displayName} | Đang online: ${clients.size}`);

      if (info && info.joined) {
        const leaveMsg = {
          type: 'system',
          id: crypto.randomUUID(),
          text: `[${info.fullDisplayName}] đã rời phòng chat.`,
          time: new Date().toLocaleTimeString('vi-VN', { hour12: false })
        };
        messageHistory.push(leaveMsg);
        if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
        broadcast(leaveMsg);
      }

      broadcastOnlineCount();
    }
  };

  socket.on('close', handleDisconnect);
  socket.on('end', handleDisconnect);
  socket.on('error', () => {
    handleDisconnect();
  });
});

function handleClientMessage(socket, clientInfo, msg) {
  if (msg.type === 'join') {
    const rawName = (msg.username || 'Anonymous').trim().slice(0, 25);
    const cleanedName = rawName || 'User';

    const oldWanIp = clientInfo.wanIp;
    if (msg.wanIp && typeof msg.wanIp === 'string') {
      clientInfo.wanIp = msg.wanIp.trim();
      clientInfo.ipCode = extract5DigitsFromWanIp(clientInfo.wanIp);
      
      // Nếu IP WAN cập nhật khác ban đầu, ghi nhận nhẹ
      if (oldWanIp !== clientInfo.wanIp) {
        console.log(`[*] Cập nhật IP WAN: ${clientInfo.wanIp} (${cleanedName}${clientInfo.ipCode})`);
      }
    }

    clientInfo.username = cleanedName;
    clientInfo.fullDisplayName = `${cleanedName}${clientInfo.ipCode}`;
    clientInfo.joined = true;

    sendToSocket(socket, {
      type: 'join_success',
      fullDisplayName: clientInfo.fullDisplayName,
      wanIp: clientInfo.wanIp,
      ipCode: clientInfo.ipCode
    });

    const joinMsg = {
      type: 'system',
      id: crypto.randomUUID(),
      text: `[${clientInfo.fullDisplayName}] đã tham gia phòng chat.`,
      time: new Date().toLocaleTimeString('vi-VN', { hour12: false })
    };

    messageHistory.push(joinMsg);
    if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
    broadcast(joinMsg);
    broadcastOnlineCount();
  } else if (msg.type === 'chat') {
    if (!clientInfo.joined) return;

    const rawContent = (msg.content || '').trim();
    if (!rawContent) return;

    const content = rawContent.slice(0, 1000);
    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN', { hour12: false });

    const chatMsg = {
      type: 'chat',
      id: crypto.randomUUID(),
      senderId: clientInfo.id,
      senderName: clientInfo.fullDisplayName,
      ipCode: clientInfo.ipCode,
      content: content,
      time: timeStr
    };

    messageHistory.push(chatMsg);
    if (messageHistory.length > MAX_HISTORY) messageHistory.shift();

    broadcast(chatMsg);
  }
}

// ============================================================================
// KHỞI ĐỘNG SERVER (HIỂN THỊ ĐƠN GIẢN)
// ============================================================================
server.listen(PORT, '0.0.0.0', () => {
  const localIps = getLocalIpAddresses();
  console.log(`Server: http://localhost:${PORT}`);
  if (localIps.length > 0) {
    console.log(`Mạng LAN: http://${localIps[0]}:${PORT}`);
  }
  console.log('--- Đang chờ kết nối ---');
});
