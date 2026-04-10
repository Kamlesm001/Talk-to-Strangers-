const socket = io();


// DOM Elements 
const elements = {
  localVideo: document.getElementById('localVideo'),
  remoteVideo: document.getElementById('remoteVideo'),
  chatInput: document.getElementById('chatInput'),
  messages: document.getElementById('messages'),
  sendBtn: document.getElementById('sendBtn'),
  status: document.getElementById('status'),
  nextBtn: document.getElementById('nextBtn')
};

// State
let pc = null;
let localStream = null;
let queueInterval = null;
let countdownInterval = null;
let matchCountdown = 5;

// WebRTC Config
const config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// Update status with count
function updateStatus(msg, count = null) {
  let display = msg;
  if (count !== null) display += ` | ${count} waiting`;
  elements.status.textContent = display;
}

// Countdown animation
function startMatchCountdown() {
  matchCountdown = 5;
  updateStatus('Matching in');
  countdownInterval = setInterval(() => {
    matchCountdown--;
    updateStatus(`Matching in ${matchCountdown}s`);
    if (matchCountdown <= 0) {
      clearInterval(countdownInterval);
      updateStatus('Connecting...');
    }
  }, 1000);
}

// Init camera
async function initMedia() {
  try {
    updateStatus('Camera access...');
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    elements.localVideo.srcObject = localStream;
    updateStatus('Joining queue...', 0);
    socket.emit('join-queue');
  } catch (err) {
    console.error('Media error:', err);
    elements.status.textContent = 'Camera needed - refresh & allow';
  }
}

// Next/Skip
elements.nextBtn.onclick = () => {
  clearInterval(queueInterval);
  clearInterval(countdownInterval);
  elements.messages.innerHTML = '';
  if (pc) {
    pc.close();
    pc = null;
  }
  elements.remoteVideo.srcObject = null;
  socket.emit('next');
  updateStatus('Skipping to next...');
};

// Chat
function sendMessage() {
  const text = elements.chatInput.value.trim();
  if (!text) return;
  socket.emit('chat', text);
  appendMessage('you', text);
  elements.chatInput.value = '';
}

elements.sendBtn.onclick = sendMessage;
elements.chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendMessage();
});

// Messages
function appendMessage(sender, text) {
  const div = document.createElement('div');
  div.textContent = `${sender === 'you' ? 'You' : 'Stranger'}: ${text}`;
  div.style.background = sender === 'you' ? 'rgba(255,73,160,0.2)' : 'rgba(139,92,246,0.2)';
  div.style.marginLeft = sender === 'you' ? 'auto' : '0';
  div.style.textAlign = sender === 'you' ? 'right' : 'left';
  elements.messages.appendChild(div);
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

// Socket Events - Omega enhanced
socket.on('connect', () => {
  console.log('Socket connected');
});

socket.on('queue-status', (data) => {
  updateStatus(`Queue position ${data.position}/${data.total}`, data.total);
});

socket.on('waiting-count', (count) => {
  if (count > 0) updateStatus(`Users waiting: ${count}`, count);
});

socket.on('matched', async (data) => {
  clearInterval(queueInterval);
  clearInterval(countdownInterval);
  updateStatus('🔥 Matched! Say hi');
  elements.messages.innerHTML = '';

  // WebRTC - create or answer based on offer/answer
  pc = new RTCPeerConnection(config);
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  
  pc.ontrack = e => {
    console.log('Remote stream received');
    elements.remoteVideo.srcObject = e.streams[0];
  };
  
  pc.onicecandidate = e => {
    if (e.candidate) socket.emit('signal', { candidate: e.candidate });
  };

  const offer = await pc.createOffer({ offerToReceiveAudio: 1, offerToReceiveVideo: 1 });
  await pc.setLocalDescription(offer);
  socket.emit('signal', { offer });
});


socket.on('signal', async (data) => {
  try {
    if (data.offer) {
      await pc.setRemoteDescription(data.offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', { answer });
    } else if (data.answer) {
      await pc.setRemoteDescription(data.answer);
    } else if (data.candidate) {
      await pc.addIceCandidate(data.candidate);
    }
  } catch (e) {
    console.error('Signal error:', e);
  }
});

socket.on('chat', (msg) => appendMessage('stranger', msg));

socket.on('partner-left', (reason = 'Left chat') => {
  clearInterval(countdownInterval);
  updateStatus(reason);
  elements.remoteVideo.srcObject = null;
  if (pc) pc.close();
  pc = null;
  setTimeout(() => {
    updateStatus('Joining queue...');
    socket.emit('join-queue');
  }, 2000);
});

// Auto-start
initMedia();

