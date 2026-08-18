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

// Manual WiFi Connect
const btnManualWifi = document.getElementById('btn-manual-wifi');
const modalSsidInputGroup = document.getElementById('modal-ssid-input-group');
const modalSsidText = document.getElementById('modal-ssid-text');
const wifiSsidInput = document.getElementById('wifi-ssid-input');
let isManualConnect = false;

// Global control state
let maxLinearSpeed = parseFloat(linearLimitSlider.value);
let maxAngularSpeed = parseFloat(angularLimitSlider.value);
let activeKeys = {};
let joystickActive = false;
let joystickVector = { x: 0, y: 0 }; // Values normalized -1 to 1
let teleopTimer = null;
let currentSelectedSsid = '';
let currentWorkflowMode = 'idle'; // 'mapping', 'navigation', or 'idle'

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
    } else if (tabId === 'map-tab') {
      // Trigger updates when opening Map tab
      socket.emit('list_maps');
      socket.emit('get_mode_status');
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

// Receive actual Odometry status (velocities and pose)
socket.on('odom_status', (data) => {
  const odomVxEl = document.getElementById('odom-vx');
  const odomWzEl = document.getElementById('odom-wz');
  const poseXEl = document.getElementById('pose-x');
  const poseYEl = document.getElementById('pose-y');
  const poseYawEl = document.getElementById('pose-yaw');

  if (odomVxEl) odomVxEl.innerText = data.vx.toFixed(2);
  if (odomWzEl) odomWzEl.innerText = data.wz.toFixed(2);
  if (poseXEl) poseXEl.innerText = `${data.x.toFixed(2)} m`;
  if (poseYEl) poseYEl.innerText = `${data.y.toFixed(2)} m`;
  if (poseYawEl) poseYawEl.innerText = `${data.yaw.toFixed(2)} rad`;
});

// Receive Pi System status updates
socket.on('system_status', (data) => {
  ipAddrEl.innerText = data.ip;
  
  // Update Header CPU & RAM status badges
  const cpuEl = document.getElementById('system-cpu-percent');
  const ramEl = document.getElementById('system-ram-percent');
  if (cpuEl) cpuEl.innerText = `${data.cpu.toFixed(0)}%`;
  if (ramEl) ramEl.innerText = `RAM: ${data.ram.toFixed(0)}%`;
  
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
      isManualConnect = false;
      modalSsidInputGroup.style.display = 'none';
      modalSsidText.style.display = 'block';
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

if (btnManualWifi) {
  btnManualWifi.addEventListener('click', () => {
    isManualConnect = true;
    modalSsidInputGroup.style.display = 'block';
    modalSsidText.style.display = 'none';
    wifiSsidInput.value = '';
    wifiPasswordInput.value = '';
    passwordModal.classList.add('active');
    wifiSsidInput.focus();
  });
}

btnConfirmConnect.addEventListener('click', () => {
  const password = wifiPasswordInput.value;
  let ssid = currentSelectedSsid;
  if (isManualConnect) {
    ssid = wifiSsidInput.value.trim();
    if (!ssid) {
      showToast("Please enter an SSID name.", "error");
      return;
    }
  }
  passwordModal.classList.remove('active');
  showToast(`Connecting to ${ssid}...`, 'info');
  socket.emit('wifi_connect', { ssid: ssid, password: password });
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
const maxRadius = 40; // Distance joystick knob can travel
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
  ctx.arc(knobX, knobY, 15, 0, Math.PI * 2);
  
  // Create gradient fill for knob
  const grad = ctx.createRadialGradient(knobX - 3, knobY - 3, 1, knobX, knobY, 15);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.2, '#00f2fe');
  grad.addColorStop(1, '#4facfe');
  
  ctx.fillStyle = grad;
  ctx.shadowColor = '#00f2fe';
  ctx.shadowBlur = joystickActive ? 10 : 4;
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
  if (isEstopActive) return; // Ignore driving when E-Stop is active
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

// ==========================================
// --- ROS 2 Websocket & Interactive Map ---
// ==========================================

// Connect to rosbridge_suite websocket server
// Map Viewport Variables
const mapCanvas = document.getElementById('map-canvas');
const mapCtx = mapCanvas.getContext('2d');

let mapMeta = null;
let mapData = null;
let laserScanData = null;
let robotPose = { x: 0.0, y: 0.0, yaw: 0.0 };
let laserPose = { x: 0.08, y: 0.0, yaw: Math.PI };
let hasTfPose = false;

// Pose estimation / nav goal states
let poseEstimateMode = false;
let goalSetMode = false;
let dragStart = null;
let dragEnd = null;
let planPoints = []; // Current global path plan overlay [{x, y}, ...] in world coords

// Receive planned path (nav2 global plan) updates
socket.on('plan_status', (message) => {
  planPoints = (message && message.points) ? message.points : [];
  drawMap();
});

// Subscribe to ROS topics via backend Socket.IO events
socket.on('map_status', (message) => {
  mapMeta = message.info;
  mapData = message.data;
  drawMap();
});

socket.on('scan_status', (message) => {
  laserScanData = message;
  drawMap();
});

// Accurate TF pose received from backend (map frame -> robot & laser)
socket.on('map_pose_status', (message) => {
  hasTfPose = true;
  robotPose.x = message.x;
  robotPose.y = message.y;
  robotPose.yaw = message.yaw;

  if (message.laser_x !== undefined) {
    laserPose.x = message.laser_x;
    laserPose.y = message.laser_y;
    laserPose.yaw = message.laser_yaw;
  } else {
    // Fallback: 0.08m forward offset + 180deg (PI) rotation for laser frame relative to robot base
    laserPose.x = message.x + 0.08 * Math.cos(message.yaw);
    laserPose.y = message.y + 0.08 * Math.sin(message.yaw);
    laserPose.yaw = message.yaw + Math.PI;
  }

  const poseXEl = document.getElementById('pose-x');
  const poseYEl = document.getElementById('pose-y');
  const poseYawEl = document.getElementById('pose-yaw');

  if (poseXEl) poseXEl.innerText = `${message.x.toFixed(2)} m`;
  if (poseYEl) poseYEl.innerText = `${message.y.toFixed(2)} m`;
  if (poseYawEl) poseYawEl.innerText = `${message.yaw.toFixed(2)} rad`;

  drawMap();
});

socket.on('amcl_pose_status', (message) => {
  if (hasTfPose) return;

  const poseXEl = document.getElementById('pose-x');
  const poseYEl = document.getElementById('pose-y');
  const poseYawEl = document.getElementById('pose-yaw');

  const x = message.x;
  const y = message.y;
  const yaw = message.yaw;

  if (currentWorkflowMode === 'navigation') {
    robotPose.x = x;
    robotPose.y = y;
    robotPose.yaw = yaw;

    laserPose.x = x + 0.08 * Math.cos(yaw);
    laserPose.y = y + 0.08 * Math.sin(yaw);
    laserPose.yaw = yaw + Math.PI;

    if (poseXEl) poseXEl.innerText = `${x.toFixed(2)} m`;
    if (poseYEl) poseYEl.innerText = `${y.toFixed(2)} m`;
    if (poseYawEl) poseYawEl.innerText = `${yaw.toFixed(2)} rad`;

    drawMap();
  }
});

// Update robot pose coordinates and trigger redraw
socket.on('odom_status', (data) => {
  // Update standard text labels in Robot Status tab
  const odomVxEl = document.getElementById('odom-vx');
  const odomWzEl = document.getElementById('odom-wz');

  if (odomVxEl) odomVxEl.innerText = data.vx.toFixed(2);
  if (odomWzEl) odomWzEl.innerText = data.wz.toFixed(2);

  // Fallback to odom pose only if TF map pose is not available yet
  if (!hasTfPose && currentWorkflowMode !== 'navigation') {
    const poseXEl = document.getElementById('pose-x');
    const poseYEl = document.getElementById('pose-y');
    const poseYawEl = document.getElementById('pose-yaw');

    robotPose.x = data.x;
    robotPose.y = data.y;
    robotPose.yaw = data.yaw;

    laserPose.x = data.x + 0.08 * Math.cos(data.yaw);
    laserPose.y = data.y + 0.08 * Math.sin(data.yaw);
    laserPose.yaw = data.yaw + Math.PI;

    if (poseXEl) poseXEl.innerText = `${data.x.toFixed(2)} m`;
    if (poseYEl) poseYEl.innerText = `${data.y.toFixed(2)} m`;
    if (poseYawEl) poseYawEl.innerText = `${data.yaw.toFixed(2)} rad`;

    drawMap();
  }
});

// Resize canvas to fit responsive map area wrapper
function resizeMapCanvas() {
  const wrapper = mapCanvas.parentElement;
  if (!wrapper) return;
  mapCanvas.width = wrapper.clientWidth;
  mapCanvas.height = wrapper.clientHeight;
  drawMap();
}

window.addEventListener('resize', resizeMapCanvas);
setTimeout(resizeMapCanvas, 300);

// Occupancy Grid Map Drawing Loop
function drawMap() {
  if (!mapMeta || !mapData) {
    // Renders placeholder background when ROS is disconnected
    mapCtx.fillStyle = '#101520';
    mapCtx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);
    mapCtx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    mapCtx.font = '14px var(--font-title)';
    mapCtx.textAlign = 'center';
    mapCtx.fillText('Waiting for occupancy grid map data (/map)...', mapCanvas.width / 2, mapCanvas.height / 2);
    return;
  }

  // Clear Canvas
  mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);

  const mapW = mapMeta.width;
  const mapH = mapMeta.height;
  
  // Fit map centering inside canvas bounding rect
  const scale = Math.min(mapCanvas.width / mapW, mapCanvas.height / mapH);
  const offsetX = (mapCanvas.width - mapW * scale) / 2;
  const offsetY = (mapCanvas.height - mapH * scale) / 2;

  // Offscreen rendering logic to draw grid cells
  const imgData = mapCtx.createImageData(mapW, mapH);
  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      // ROS maps start from bottom-left; canvas image starts top-left (invert Y)
      const rosIndex = (mapH - 1 - y) * mapW + x;
      const val = mapData[rosIndex];
      const imgIndex = (y * mapW + x) * 4;
      
      if (val === 0) {
        // Free Area (White)
        imgData.data[imgIndex] = 255;     // R
        imgData.data[imgIndex + 1] = 255; // G
        imgData.data[imgIndex + 2] = 255; // B
        imgData.data[imgIndex + 3] = 255; // A
      } else if (val === 100) {
        // Obstacle (Black)
        imgData.data[imgIndex] = 0;       // R
        imgData.data[imgIndex + 1] = 0;   // G
        imgData.data[imgIndex + 2] = 0;   // B
        imgData.data[imgIndex + 3] = 255; // A
      } else {
        // Unknown (-1) (Grey)
        imgData.data[imgIndex] = 127;     // R
        imgData.data[imgIndex + 1] = 127; // G
        imgData.data[imgIndex + 2] = 127; // B
        imgData.data[imgIndex + 3] = 255; // A
      }
    }
  }

  const offscreen = document.createElement('canvas');
  offscreen.width = mapW;
  offscreen.height = mapH;
  offscreen.getContext('2d').putImageData(imgData, 0, 0);

  mapCtx.drawImage(offscreen, offsetX, offsetY, mapW * scale, mapH * scale);

  // Conversion helper: ROS coordinates (meters) to canvas coordinates (pixels)
  function worldToPixel(wx, wy) {
    const rx = (wx - mapMeta.origin.x) / mapMeta.resolution;
    const ry = (wy - mapMeta.origin.y) / mapMeta.resolution;
    const px = offsetX + rx * scale;
    const py = offsetY + (mapH - ry) * scale;
    return { x: px, y: py };
  }

  // Draw 2D LaserScan overlay
  if (laserScanData && laserScanData.ranges) {
    mapCtx.fillStyle = '#ff007f'; // Neon pink scan points
    const angleMin = laserScanData.angle_min;
    const angleIncrement = laserScanData.angle_increment;
    
    for (let i = 0; i < laserScanData.ranges.length; i++) {
      const r = laserScanData.ranges[i];
      if (r < laserScanData.range_min || r > laserScanData.range_max || isNaN(r) || r >= 998.0) continue;
      
      const angle = laserPose.yaw + angleMin + i * angleIncrement;
      const wx = laserPose.x + r * Math.cos(angle);
      const wy = laserPose.y + r * Math.sin(angle);
      
      const pixel = worldToPixel(wx, wy);
      mapCtx.beginPath();
      mapCtx.arc(pixel.x, pixel.y, 2.5, 0, Math.PI * 2);
      mapCtx.fill();
    }
  }

  // Draw Nav2 global path plan overlay
  if (planPoints && planPoints.length > 1) {
    mapCtx.beginPath();
    planPoints.forEach((p, i) => {
      const pixel = worldToPixel(p.x, p.y);
      if (i === 0) {
        mapCtx.moveTo(pixel.x, pixel.y);
      } else {
        mapCtx.lineTo(pixel.x, pixel.y);
      }
    });
    mapCtx.strokeStyle = '#f59e0b'; // Neon orange path line
    mapCtx.lineWidth = 3;
    mapCtx.shadowColor = 'rgba(245, 158, 11, 0.6)';
    mapCtx.shadowBlur = 4;
    mapCtx.stroke();
    mapCtx.shadowBlur = 0;
  }

  // Draw Robot Icon on Map Frame
  const rPixel = worldToPixel(robotPose.x, robotPose.y);
  
  mapCtx.save();
  mapCtx.translate(rPixel.x, rPixel.y);
  mapCtx.rotate(-robotPose.yaw + Math.PI / 2); // Flip direction to align with bottom-up Y coordinate

  mapCtx.beginPath();
  mapCtx.moveTo(0, -10); // Nose tip
  mapCtx.lineTo(-7, 7);  // Left wing
  mapCtx.lineTo(0, 3);   // Back indentation
  mapCtx.lineTo(7, 7);   // Right wing
  mapCtx.closePath();

  mapCtx.fillStyle = '#00f2fe';
  mapCtx.strokeStyle = '#000000';
  mapCtx.lineWidth = 2.0;
  mapCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  mapCtx.shadowBlur = 4;
  mapCtx.fill();
  mapCtx.stroke();

  mapCtx.restore();

  // Draw dragging orientation arrow overlay (2D Pose Estimate or Nav Goal)
  if ((poseEstimateMode || goalSetMode) && dragStart && dragEnd) {
    const arrowColor = goalSetMode ? '#f59e0b' : '#39ff14'; // Orange for goal, Green for pose estimate
    mapCtx.beginPath();
    mapCtx.moveTo(dragStart.x, dragStart.y);
    mapCtx.lineTo(dragEnd.x, dragEnd.y);
    mapCtx.strokeStyle = arrowColor;
    mapCtx.lineWidth = 3;
    mapCtx.stroke();

    const angle = Math.atan2(dragEnd.y - dragStart.y, dragEnd.x - dragStart.x);
    mapCtx.beginPath();
    mapCtx.moveTo(dragEnd.x, dragEnd.y);
    mapCtx.lineTo(dragEnd.x - 12 * Math.cos(angle - Math.PI / 6), dragEnd.y - 12 * Math.sin(angle - Math.PI / 6));
    mapCtx.lineTo(dragEnd.x - 12 * Math.cos(angle + Math.PI / 6), dragEnd.y - 12 * Math.sin(angle + Math.PI / 6));
    mapCtx.closePath();
    mapCtx.fillStyle = arrowColor;
    mapCtx.fill();
  }
}

// 2D Pose Estimator / Nav Goal click and drag listener bindings
const btnPoseEstimate = document.getElementById('btn-pose-estimate');
const btnNavGoal = document.getElementById('btn-nav-goal');

btnPoseEstimate.addEventListener('click', () => {
  poseEstimateMode = !poseEstimateMode;
  if (poseEstimateMode) {
    goalSetMode = false;
    btnNavGoal.classList.remove('tool-active');
    btnPoseEstimate.classList.add('tool-active');
    showToast("Pose Estimate mode activated. Click and drag an orientation arrow on the map.", "info");
  } else {
    btnPoseEstimate.classList.remove('tool-active');
    dragStart = null;
    dragEnd = null;
  }
});

btnNavGoal.addEventListener('click', () => {
  if (!goalSetMode && currentWorkflowMode !== 'navigation') {
    showToast("Switch to Navigation mode before setting a goal.", "error");
    return;
  }
  goalSetMode = !goalSetMode;
  if (goalSetMode) {
    poseEstimateMode = false;
    btnPoseEstimate.classList.remove('tool-active');
    btnNavGoal.classList.add('tool-active');
    showToast("Set Goal mode activated. Click and drag an orientation arrow on the map.", "info");
  } else {
    btnNavGoal.classList.remove('tool-active');
    dragStart = null;
    dragEnd = null;
  }
});

mapCanvas.addEventListener('mousedown', (e) => {
  if (!poseEstimateMode && !goalSetMode) return;
  const rect = mapCanvas.getBoundingClientRect();
  dragStart = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
});

mapCanvas.addEventListener('mousemove', (e) => {
  if ((!poseEstimateMode && !goalSetMode) || !dragStart) return;
  const rect = mapCanvas.getBoundingClientRect();
  dragEnd = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
  drawMap();
});

mapCanvas.addEventListener('mouseup', () => {
  if ((!poseEstimateMode && !goalSetMode) || !dragStart || !dragEnd) return;

  const dx = dragEnd.x - dragStart.x;
  const dy = dragEnd.y - dragStart.y;
  
  // Handle simple click orientations (yaw = 0)
  if (Math.sqrt(dx * dx + dy * dy) < 5) {
    dragEnd.x = dragStart.x + 10;
    dragEnd.y = dragStart.y;
  }

  // Translate canvas pixel to image pixels
  const mapW = mapMeta.width;
  const mapH = mapMeta.height;
  const scale = Math.min(mapCanvas.width / mapW, mapCanvas.height / mapH);
  const offsetX = (mapCanvas.width - mapW * scale) / 2;
  const offsetY = (mapCanvas.height - mapH * scale) / 2;

  const imgX = (dragStart.x - offsetX) / scale;
  const imgY = mapH - (dragStart.y - offsetY) / scale; // Invert Canvas Y coordinates

  // Convert image pixel to world coordinates
  const worldX = mapMeta.origin.x + imgX * mapMeta.resolution;
  const worldY = mapMeta.origin.y + imgY * mapMeta.resolution;

  // Heading calculation
  const rosDx = dragEnd.x - dragStart.x;
  const rosDy = -(dragEnd.y - dragStart.y);
  const yaw = Math.atan2(rosDy, rosDx);

  // Publish to /initialpose or /goal_pose depending on active tool
  if (goalSetMode) {
    publishGoalPose(worldX, worldY, yaw);
  } else {
    publishInitialPose(worldX, worldY, yaw);
  }

  // Reset
  poseEstimateMode = false;
  goalSetMode = false;
  btnPoseEstimate.classList.remove('tool-active');
  btnNavGoal.classList.remove('tool-active');
  dragStart = null;
  dragEnd = null;
  drawMap();
});

function publishInitialPose(x, y, yaw) {
  socket.emit('initialpose_cmd', { x: x, y: y, yaw: yaw });
  showToast(`Published Initial Pose: x=${x.toFixed(2)}, y=${y.toFixed(2)}, yaw=${yaw.toFixed(2)}`, "success");
}

function publishGoalPose(x, y, yaw) {
  socket.emit('goal_pose_cmd', { x: x, y: y, yaw: yaw });
  showToast(`Published Nav Goal: x=${x.toFixed(2)}, y=${y.toFixed(2)}, yaw=${yaw.toFixed(2)}`, "success");
}

// ==========================================
// --- Safety E-Stop & Map Tab Handlers ---
// ==========================================

let isEstopActive = false;
const btnEstop = document.getElementById('btn-estop');

btnEstop.addEventListener('click', () => {
  isEstopActive = !isEstopActive;
  socket.emit('estop_toggle', { active: isEstopActive });
  
  if (isEstopActive) {
    btnEstop.classList.add('estop-active');
    btnEstop.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> STOPPED';
    document.getElementById('map-workspace').classList.add('estop-frame-active');
    showToast("EMERGENCY STOP ENGAGED! Motors locked.", "error");
    
    // Snaps joystick knob back to center to lock input visually
    knobX = centerX;
    knobY = centerY;
    drawJoystick();
  } else {
    btnEstop.classList.remove('estop-active');
    btnEstop.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> E-STOP';
    document.getElementById('map-workspace').classList.remove('estop-frame-active');
    showToast("Emergency Stop released.", "success");
  }
});

// Sync E-Stop broadcasts from server
socket.on('estop_status', (data) => {
  isEstopActive = data.active;
  if (isEstopActive) {
    btnEstop.classList.add('estop-active');
    btnEstop.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> STOPPED';
    document.getElementById('map-workspace').classList.add('estop-frame-active');
  } else {
    btnEstop.classList.remove('estop-active');
    btnEstop.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> E-STOP';
    document.getElementById('map-workspace').classList.remove('estop-frame-active');
  }
});

// Map Workflow switching triggers
document.getElementById('btn-mode-mapping').addEventListener('click', () => {
  socket.emit('switch_mode', { mode: 'mapping' });
});

document.getElementById('btn-mode-nav').addEventListener('click', () => {
  const mapId = getActiveSelectedMapId();
  if (!mapId) {
    showToast("Please select a map from the list catalog first.", "error");
    return;
  }
  socket.emit('switch_mode', { mode: 'navigation', map_id: mapId });
});

document.getElementById('btn-mode-idle').addEventListener('click', () => {
  socket.emit('switch_mode', { mode: 'idle' });
});

// Active workflow mode changes broadcasted from server
socket.on('mode_status', (data) => {
  currentWorkflowMode = data.mode || 'idle';
  const modeBadge = document.getElementById('current-workflow-mode');
  const activeMapLabel = document.getElementById('current-active-map');
  const saveMapSection = document.getElementById('save-map-section');

  // Path plan overlay only makes sense while navigating
  if (currentWorkflowMode !== 'navigation') {
    planPoints = [];
    if (goalSetMode) {
      goalSetMode = false;
      btnNavGoal.classList.remove('tool-active');
      dragStart = null;
      dragEnd = null;
    }
  }

  if (modeBadge) {
    modeBadge.className = 'status-badge';
    if (data.mode === 'mapping') {
      modeBadge.innerText = 'MAPPING';
      modeBadge.classList.add('mapping');
      if (saveMapSection) saveMapSection.style.display = 'block';
    } else if (data.mode === 'navigation') {
      modeBadge.innerText = 'NAVIGATION';
      modeBadge.classList.add('navigation');
      if (saveMapSection) saveMapSection.style.display = 'none';
    } else {
      modeBadge.innerText = 'IDLE';
      if (saveMapSection) saveMapSection.style.display = 'none';
    }
  }

  if (activeMapLabel) {
    activeMapLabel.innerText = data.active_map ? `Map: ${data.active_map}` : 'No Map Loaded';
  }

  if (data.message) {
    showToast(data.message, 'info');
  }
});

// Maps catalog management rendering
const savedMapsList = document.getElementById('saved-maps-list');
const btnRefreshMaps = document.getElementById('btn-refresh-maps');
let selectedMapId = null;

function getActiveSelectedMapId() {
  return selectedMapId;
}

btnRefreshMaps.addEventListener('click', () => {
  socket.emit('list_maps');
});

socket.on('maps_list', (maps) => {
  savedMapsList.innerHTML = '';
  if (maps.length === 0) {
    savedMapsList.innerHTML = '<div class="list-placeholder">No saved maps found. Go map!</div>';
    return;
  }
  
  maps.forEach(m => {
    const item = document.createElement('div');
    item.className = 'saved-network-item glass-inset';
    if (m.is_active) {
      selectedMapId = m.id;
    }
    
    // Style highlighting active selected map
    item.style.padding = '8px 10px';
    item.style.marginBottom = '6px';
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';
    item.style.cursor = 'pointer';
    if (selectedMapId === m.id) {
      item.style.borderColor = 'var(--neon-cyan)';
    }

    item.innerHTML = `
      <div class="map-item-info" style="display: flex; align-items: center; gap: 8px;">
        <i class="fa-solid fa-map" style="color: ${selectedMapId === m.id ? 'var(--neon-cyan)' : 'var(--text-secondary)'};"></i>
        <span class="map-item-name" style="font-weight: 500; font-size: 0.9rem;">${m.name}</span>
      </div>
      <div class="map-item-actions" style="display: flex; gap: 4px;">
        <button class="action-btn btn-delete-map" data-id="${m.id}" style="padding: 4px 8px; background: rgba(255,0,85,0.1); border-color: rgba(255,0,85,0.2);"><i class="fa-solid fa-trash"></i></button>
      </div>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete-map')) return;
      selectedMapId = m.id;
      // Re-render highlights
      document.querySelectorAll('#saved-maps-list .saved-network-item').forEach(el => {
        el.style.borderColor = 'rgba(255, 255, 255, 0.03)';
        el.querySelector('i').style.color = 'var(--text-secondary)';
      });
      item.style.borderColor = 'var(--neon-cyan)';
      item.querySelector('i').style.color = 'var(--neon-cyan)';
      showToast(`Selected map: ${m.name}`, "info");
    });

    item.querySelector('.btn-delete-map').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Delete map file and catalog entry for "${m.name}"?`)) {
        socket.emit('delete_map', { id: m.id });
        showToast(`Deleting map: ${m.name}...`, "info");
      }
    });

    savedMapsList.appendChild(item);
  });
});

// Save map triggers
const btnSaveMapExecute = document.getElementById('btn-save-map-execute');
const mapSaveNameInput = document.getElementById('map-save-name-input');

btnSaveMapExecute.addEventListener('click', () => {
  const mapName = mapSaveNameInput.value.trim();
  if (!mapName) {
    showToast("Please enter a valid map name", "error");
    return;
  }
  socket.emit('save_map', { name: mapName });
  showToast(`Saving map as: ${mapName}...`, "info");
  mapSaveNameInput.value = '';
});

socket.on('save_map_response', (data) => {
  if (data.success) {
    showToast(data.message, "success");
  } else {
    showToast(data.message, "error");
  }
});

// Initial load triggers
socket.emit('list_maps');
socket.emit('get_mode_status');
