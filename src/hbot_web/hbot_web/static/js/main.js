// Initialize Socket.io
const socket = io();

// UI Elements
const ipAddrEl = document.getElementById('ip-address');
const batteryPercentEl = document.getElementById('battery-percent');
const batteryVoltsEl = document.getElementById('battery-volts');
const batteryIconEl = document.getElementById('battery-icon');
const wifiStatusIconEl = document.getElementById('wifi-status-icon');
const wifiStatusTextEl = document.getElementById('wifi-status-text');
const wifiStatusSsidEl = document.getElementById('wifi-status-ssid');

// Limit Sliders
const linearLimitSlider = document.getElementById('linear-limit');
const angularLimitSlider = document.getElementById('angular-limit');
const linearLimitVal = document.getElementById('linear-limit-val');
const angularLimitVal = document.getElementById('angular-limit-val');

// Tabs
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Wifi Mode Toggle
const wifiModeToggle = document.getElementById('wifi-mode-toggle');
const lblSta = document.getElementById('lbl-sta');
const lblAp = document.getElementById('lbl-ap');
const wifiStaControls = document.getElementById('wifi-sta-controls');
const wifiApControls = document.getElementById('wifi-ap-controls');

// Visible WiFi List
const btnScanWifi = document.getElementById('btn-scan-wifi');
const wifiNetworksList = document.getElementById('wifi-networks-list');

// Saved WiFi List
const btnRefreshSaved = document.getElementById('btn-refresh-saved');
const wifiSavedList = document.getElementById('wifi-saved-list');

// Password Modal
const passwordModal = document.getElementById('password-modal');
const modalSsidName = document.getElementById('modal-ssid-name');
const wifiPasswordInput = document.getElementById('wifi-password-input');
const btnCancelConnect = document.getElementById('btn-cancel-connect');
const btnConfirmConnect = document.getElementById('btn-confirm-connect');
const closeModal = document.getElementById('close-modal');

// Global control state
let maxLinearSpeed = parseFloat(linearLimitSlider.value);
let maxAngularSpeed = parseFloat(angularLimitSlider.value);
let activeKeys = {};
let joystickActive = false;
let joystickVector = { x: 0, y: 0 }; // Values normalized -1 to 1
let teleopTimer = null;
let currentSelectedSsid = '';

// Update Slider values dynamically
linearLimitSlider.addEventListener('input', (e) => {
  maxLinearSpeed = parseFloat(e.target.value);
  linearLimitVal.innerText = `${maxLinearSpeed.toFixed(2)} m/s`;
});

angularLimitSlider.addEventListener('input', (e) => {
  maxAngularSpeed = parseFloat(e.target.value);
  angularLimitVal.innerText = `${maxAngularSpeed.toFixed(1)} rad/s`;
});

// --- Tab Switching ---
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    
    btn.classList.add('active');
    const tabId = btn.getAttribute('data-tab');
    document.getElementById(tabId).classList.add('active');
    
    if (tabId === 'wifi-tab') {
      // Trigger updates when opening Wifi tab
      socket.emit('wifi_saved_connections');
      triggerWifiScan();
    }
  });
});

// --- Toast Notification Helper ---
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'error') icon = 'fa-circle-xmark';
  
  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  
  // Remove toast after 4s
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// --- WebSocket Event Handlers ---

// Receive Battery status updates
socket.on('battery_status', (data) => {
  batteryPercentEl.innerText = `${data.percent.toFixed(0)}%`;
  batteryVoltsEl.innerText = `(${data.voltage.toFixed(1)} V)`;
  
  // Update battery color & icon dynamically
  batteryIconEl.className = 'fa-solid';
  
  if (data.percent > 75) {
    batteryIconEl.classList.add('fa-battery-full', 'text-green');
  } else if (data.percent > 50) {
    batteryIconEl.classList.add('fa-battery-three-quarters', 'text-green');
  } else if (data.percent > 25) {
    batteryIconEl.classList.add('fa-battery-quarter', 'text-orange');
  } else {
    batteryIconEl.classList.add('fa-battery-empty', 'text-red');
  }
});

// Receive Pi System status updates
socket.on('system_status', (data) => {
  ipAddrEl.innerText = data.ip;
  
  // Update CPU / RAM Progress Rings
  updateProgressRing('cpu-ring', 'cpu-text', data.cpu);
  updateProgressRing('ram-ring', 'ram-text', data.ram);
  
  // Update Disk Storage bar
  document.getElementById('disk-bar').style.width = `${data.disk}%`;
  document.getElementById('disk-text').innerText = `${data.disk.toFixed(0)}%`;
  
  // Update Network throughput rates
  document.getElementById('net-rx').innerText = data.rx_speed.toFixed(1);
  document.getElementById('net-tx').innerText = data.tx_speed.toFixed(1);
  
  // Update Network badges
  if (data.wifi_mode === 'ap') {
    // Mode is Access Point
    wifiStatusIconEl.className = 'fa-solid fa-tower-broadcast text-orange';
    wifiStatusTextEl.innerText = 'AP Mode';
    wifiStatusSsidEl.innerText = data.ssid;
    
    // Toggle Mode Switch visual indicator without triggering listener loop
    wifiModeToggle.checked = true;
    lblAp.classList.add('active');
    lblSta.classList.remove('active');
    
    wifiStaControls.style.display = 'none';
    wifiApControls.style.display = 'block';
    
    document.getElementById('ap-ssid-val').innerText = data.ssid;
    document.getElementById('ap-gateway-ip').innerText = data.ip;
  } else {
    // Mode is Client (STA)
    wifiStatusIconEl.className = 'fa-solid fa-wifi text-green';
    wifiStatusTextEl.innerText = 'STA Mode';
    wifiStatusSsidEl.innerText = data.ssid ? data.ssid : 'Disconnected';
    
    wifiModeToggle.checked = false;
    lblSta.classList.add('active');
    lblAp.classList.remove('active');
    
    wifiStaControls.style.display = 'block';
    wifiApControls.style.display = 'none';
  }
});

function updateProgressRing(ringId, textId, percent) {
  const circle = document.getElementById(ringId);
  const text = document.getElementById(textId);
  const radius = circle.r.baseVal.value;
  const circumference = radius * 2 * Math.PI;
  
  const offset = circumference - (percent / 100) * circumference;
  circle.style.strokeDashoffset = offset;
  text.innerText = `${percent.toFixed(0)}%`;
  
  // Color code based on levels
  if (percent > 85) {
    circle.style.stroke = 'var(--neon-red)';
  } else if (percent > 65) {
    circle.style.stroke = 'var(--neon-orange)';
  } else {
    circle.style.stroke = ringId === 'cpu-ring' ? 'var(--neon-cyan)' : 'var(--neon-blue)';
  }
}

// --- WiFi Actions & NMCLI Control ---

// Mode switcher toggle listener
wifiModeToggle.addEventListener('change', (e) => {
  const selectedMode = e.target.checked ? 'ap' : 'sta';
  showToast(`Switching to ${selectedMode.toUpperCase()} Mode...`, 'info');
  socket.emit('wifi_set_mode', { mode: selectedMode });
});

// Receive operation mode response
socket.on('wifi_mode_response', (data) => {
  if (data.success) {
    showToast(data.message, 'success');
  } else {
    showToast(data.message, 'error');
    // Revert toggle switch
    wifiModeToggle.checked = !wifiModeToggle.checked;
  }
});

// Scan wifi
function triggerWifiScan() {
  const icon = btnScanWifi.querySelector('i');
  icon.classList.add('fa-spin');
  btnScanWifi.disabled = true;
  socket.emit('wifi_scan');
}

btnScanWifi.addEventListener('click', triggerWifiScan);

socket.on('wifi_scan_results', (networks) => {
  const icon = btnScanWifi.querySelector('i');
  icon.classList.remove('fa-spin');
  btnScanWifi.disabled = false;
  
  wifiNetworksList.innerHTML = '';
  if (networks.length === 0) {
    wifiNetworksList.innerHTML = '<div class="list-placeholder">No WiFi networks found.</div>';
    return;
  }
  
  networks.forEach(net => {
    const isSecured = net.security && !net.security.includes('Open');
    const wifiItem = document.createElement('div');
    wifiItem.className = 'wifi-item';
    // Round signal to index 1-4
    const signalIndex = Math.min(4, Math.max(1, Math.ceil(net.signal / 25)));
    wifiItem.setAttribute('data-signal', signalIndex);
    
    wifiItem.innerHTML = `
      <div class="wifi-info">
        <i class="fa-solid ${isSecured ? 'fa-lock' : 'fa-unlock-keyhole'}"></i>
        <span class="wifi-ssid">${net.ssid}</span>
      </div>
      <div class="wifi-meta">
        <span style="font-size: 0.8rem; color: var(--text-secondary);">${net.signal}%</span>
        <div class="wifi-signal">
          <div class="signal-bar"></div>
          <div class="signal-bar"></div>
          <div class="signal-bar"></div>
          <div class="signal-bar"></div>
        </div>
      </div>
    `;
    
    wifiItem.addEventListener('click', () => {
      currentSelectedSsid = net.ssid;
      if (isSecured) {
        modalSsidName.innerText = net.ssid;
        wifiPasswordInput.value = '';
        passwordModal.classList.add('active');
        wifiPasswordInput.focus();
      } else {
        // Direct connect for open networks
        showToast(`Connecting to ${net.ssid}...`, 'info');
        socket.emit('wifi_connect', { ssid: net.ssid });
      }
    });
    
    wifiNetworksList.appendChild(wifiItem);
  });
});

// Modal Actions
closeModal.addEventListener('click', () => passwordModal.classList.remove('active'));
btnCancelConnect.addEventListener('click', () => passwordModal.classList.remove('active'));

btnConfirmConnect.addEventListener('click', () => {
  const password = wifiPasswordInput.value;
  passwordModal.classList.remove('active');
  showToast(`Connecting to ${currentSelectedSsid}...`, 'info');
  socket.emit('wifi_connect', { ssid: currentSelectedSsid, password: password });
});

// Allow Enter key in modal password input
wifiPasswordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    btnConfirmConnect.click();
  }
});

// WiFi connection feedback
socket.on('wifi_connect_response', (data) => {
  if (data.success) {
    showToast(data.message, 'success');
  } else {
    showToast(`Failed to connect: ${data.message}`, 'error');
  }
});

// Saved Connections refreshing
btnRefreshSaved.addEventListener('click', () => {
  socket.emit('wifi_saved_connections');
});

socket.on('wifi_saved_connections_list', (saved) => {
  wifiSavedList.innerHTML = '';
  if (saved.length === 0) {
    wifiSavedList.innerHTML = '<div class="list-placeholder">No saved connections.</div>';
    return;
  }
  
  saved.forEach(net => {
    const item = document.createElement('div');
    item.className = 'saved-network-item glass-inset';
    item.innerHTML = `
      <span class="saved-network-name">${net.name}</span>
      <div class="saved-actions">
        <button class="btn-connect-saved" data-uuid="${net.uuid}" data-name="${net.name}">Connect</button>
        <button class="btn-delete-saved" data-uuid="${net.uuid}" data-name="${net.name}"><i class="fa-solid fa-trash-can"></i></button>
      </div>
    `;
    
    // Connect Saved
    item.querySelector('.btn-connect-saved').addEventListener('click', () => {
      showToast(`Connecting to saved network: ${net.name}...`, 'info');
      socket.emit('wifi_connect_saved', { uuid: net.uuid, name: net.name });
    });
    
    // Delete Saved
    item.querySelector('.btn-delete-saved').addEventListener('click', () => {
      if (confirm(`Forget network connection "${net.name}"?`)) {
        showToast(`Deleting network: ${net.name}...`, 'info');
        socket.emit('wifi_delete_saved', { uuid: net.uuid, name: net.name });
      }
    });
    
    wifiSavedList.appendChild(item);
  });
});

socket.on('wifi_delete_response', (data) => {
  if (data.success) {
    showToast(data.message, 'success');
  } else {
    showToast(data.message, 'error');
  }
});

// --- Teleoperation Joystick Controller ---
const canvas = document.getElementById('joystick-canvas');
const ctx = canvas.getContext('2d');
const zone = document.getElementById('joystick-zone');

let width = zone.clientWidth;
let height = zone.clientHeight;
let centerX = width / 2;
let centerY = height / 2;
const maxRadius = 80; // Distance joystick knob can travel
let knobX = centerX;
let knobY = centerY;

// Initialize / Resize Canvas
function resizeCanvas() {
  width = zone.clientWidth;
  height = zone.clientHeight;
  canvas.width = width;
  canvas.height = height;
  centerX = width / 2;
  centerY = height / 2;
  if (!joystickActive) {
    knobX = centerX;
    knobY = centerY;
  }
  drawJoystick();
}

window.addEventListener('resize', resizeCanvas);
// Run initially once styles are loaded
setTimeout(resizeCanvas, 200);

// Draw Joystick Canvas helper
function drawJoystick() {
  ctx.clearRect(0, 0, width, height);
  
  // 1. Draw outer bounds guide
  ctx.beginPath();
  ctx.arc(centerX, centerY, maxRadius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0, 242, 254, 0.1)';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(centerX, centerY, maxRadius - 10, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0, 242, 254, 0.03)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 2. Draw cross hairs
  ctx.beginPath();
  ctx.moveTo(centerX - maxRadius, centerY);
  ctx.lineTo(centerX + maxRadius, centerY);
  ctx.moveTo(centerX, centerY - maxRadius);
  ctx.lineTo(centerX, centerY + maxRadius);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 3. Draw active connector line
  if (joystickActive) {
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(knobX, knobY);
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // 4. Draw joystick knob
  ctx.beginPath();
  ctx.arc(knobX, knobY, 30, 0, Math.PI * 2);
  
  // Create gradient fill for knob
  const grad = ctx.createRadialGradient(knobX - 5, knobY - 5, 2, knobX, knobY, 30);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.2, '#00f2fe');
  grad.addColorStop(1, '#4facfe');
  
  ctx.fillStyle = grad;
  ctx.shadowColor = '#00f2fe';
  ctx.shadowBlur = joystickActive ? 15 : 5;
  ctx.fill();
  
  // Reset shadow for subsequent drawings
  ctx.shadowBlur = 0;
}


// Mouse / Touch Handlers
function handleStart(e) {
  joystickActive = true;
  const joystickInstructions = zone.querySelector('.joystick-instructions');
  if (joystickInstructions) joystickInstructions.style.opacity = '0';
  
  handleMove(e);
}

function handleMove(e) {
  if (!joystickActive) return;
  
  let clientX, clientY;
  if (e.touches) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }
  
  const rect = canvas.getBoundingClientRect();
  const rawX = clientX - rect.left;
  const rawY = clientY - rect.top;
  
  // Vector from center
  const dx = rawX - centerX;
  const dy = rawY - centerY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance <= maxRadius) {
    knobX = rawX;
    knobY = rawY;
  } else {
    // Clamp to max radius bounds
    const angle = Math.atan2(dy, dx);
    knobX = centerX + Math.cos(angle) * maxRadius;
    knobY = centerY + Math.sin(angle) * maxRadius;
  }
  
  // Calculate normalized values (-1.0 to 1.0)
  joystickVector.x = (knobX - centerX) / maxRadius;
  joystickVector.y = (knobY - centerY) / maxRadius;
  
  drawJoystick();

  // Calculate physical velocities directly
  const linear = -joystickVector.y * maxLinearSpeed;
  const angular = -joystickVector.x * maxAngularSpeed;

  // Update UI values overlay text
  const joyInstruction = document.getElementById('joy-instruction');
  const joyValues = document.getElementById('joy-values');
  if (joyInstruction) joyInstruction.style.display = 'none';
  if (joyValues) {
    joyValues.style.display = 'block';
    joyValues.innerText = `Linear: ${linear.toFixed(2)} m/s | Angular: ${angular.toFixed(2)} rad/s`;
  }

  // Publish velocity command directly on move (throttled)
  sendTeleopCommandThrottled(linear, angular);
}


function handleEnd() {
  if (!joystickActive) return;
  joystickActive = false;
  
  // Stop command loop, clear throttle timer, and send zero velocity immediately
  stopTeleopLoop();
  lastSentTime = 0; // Reset throttle timer
  sendTeleopCommand(0, 0);
  
  // Restore instructions display overlay
  const joyInstruction = document.getElementById('joy-instruction');
  const joyValues = document.getElementById('joy-values');
  if (joyInstruction) joyInstruction.style.display = 'block';
  if (joyValues) joyValues.style.display = 'none';

  const joystickInstructions = zone.querySelector('.joystick-instructions');
  if (joystickInstructions) joystickInstructions.style.opacity = '0.7';

  // Animate knob snap back to center (only for visual effect)
  const snapBack = () => {
    if (joystickActive) return; // Interrupted by new click
    
    const dx = knobX - centerX;
    const dy = knobY - centerY;
    
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
      knobX = centerX;
      knobY = centerY;
      joystickVector = { x: 0, y: 0 };
      drawJoystick();
    } else {
      knobX -= dx * 0.25;
      knobY -= dy * 0.25;
      drawJoystick();
      requestAnimationFrame(snapBack);
    }
  };
  
  snapBack();
}


// Mouse events
canvas.addEventListener('mousedown', handleStart);
window.addEventListener('mousemove', handleMove);
window.addEventListener('mouseup', handleEnd);

// Touch events
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  handleStart(e);
});
window.addEventListener('touchmove', handleMove, { passive: false });
window.addEventListener('touchend', handleEnd);

// --- Keyboard teleop handlers ---
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', ' '].includes(key)) {
    // Space or any WASD keys
    if (key === ' ') {
      e.preventDefault();
      activeKeys = {}; // Clear keys
      sendTeleopCommand(0, 0);
      showKeyPress(' ');
    } else {
      activeKeys[key] = true;
      showKeyPress(key);
      startTeleopLoop();
    }
  }
});

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (['w', 'a', 's', 'd'].includes(key)) {
    delete activeKeys[key];
    hideKeyPress(key);
    
    if (Object.keys(activeKeys).length === 0 && !joystickActive) {
      stopTeleopLoop();
      sendTeleopCommand(0, 0);
      
      const joyInstruction = document.getElementById('joy-instruction');
      const joyValues = document.getElementById('joy-values');
      if (joyInstruction) joyInstruction.style.display = 'block';
      if (joyValues) joyValues.style.display = 'none';
    }
  }
});

function showKeyPress(key) {
  if (key === ' ') {
    // Pulse all keys
    document.querySelectorAll('.key').forEach(el => {
      el.classList.add('active');
      setTimeout(() => el.classList.remove('active'), 150);
    });
  } else {
    const el = document.getElementById(`key-${key}`);
    if (el) el.classList.add('active');
  }
}

function hideKeyPress(key) {
  const el = document.getElementById(`key-${key}`);
  if (el) el.classList.remove('active');
}

// --- Teleoperation Loop & Command Dispatch ---
let lastSentTime = 0;

function sendTeleopCommandThrottled(linear, angular) {
  const now = Date.now();
  if (now - lastSentTime >= 70) { // Limit publishing to max 14Hz (every 70ms)
    sendTeleopCommand(linear, angular);
    lastSentTime = now;
  }
}

function sendTeleopCommand(linear, angular) {
  socket.emit('teleop_cmd', {
    x: parseFloat(linear.toFixed(3)),
    z: parseFloat(angular.toFixed(3))
  });
}

function teleopTick() {
  let linear = 0;
  let angular = 0;
  
  // Keyboard inputs
  if (activeKeys['w']) linear += maxLinearSpeed;
  if (activeKeys['s']) linear -= maxLinearSpeed;
  if (activeKeys['a']) angular += maxAngularSpeed; // Turn Left (positive Z)
  if (activeKeys['d']) angular -= maxAngularSpeed; // Turn Right (negative Z)
  
  // Update UI values overlay for keyboard driving
  const joyInstruction = document.getElementById('joy-instruction');
  const joyValues = document.getElementById('joy-values');
  
  if (Object.keys(activeKeys).length > 0) {
    if (joyInstruction) joyInstruction.style.display = 'none';
    if (joyValues) {
      joyValues.style.display = 'block';
      joyValues.innerText = `Linear: ${linear.toFixed(2)} m/s | Angular: ${angular.toFixed(2)} rad/s`;
    }
  } else {
    if (joyInstruction) joyInstruction.style.display = 'block';
    if (joyValues) joyValues.style.display = 'none';
  }
  
  sendTeleopCommand(linear, angular);
}



function startTeleopLoop() {
  if (teleopTimer === null) {
    teleopTimer = setInterval(teleopTick, 100); // Send command every 100ms
  }
}

function stopTeleopLoop() {
  if (teleopTimer !== null) {
    clearInterval(teleopTimer);
    teleopTimer = null;
  }
}
