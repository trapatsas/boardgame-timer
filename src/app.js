// Game state
let players = [];
let currentPlayerIndex = 0;
let timer = null;
let timeLeft = 0; // Default 0 minutes (unlimited time)
let turnTimeLimit = 0; // Turn time limit (0 = unlimited)
let isGameRunning = false;
let isPaused = false;
let gamesPlayed = 0;
let currentRound = 0;
let totalGameTime = 0; // Total elapsed game time in seconds
let currentTurnTime = 0; // Current turn elapsed time in seconds
let isIncrementalMode = true; // True when no turn timer is set (default to true)
// let isWakeLockEnabled = false; // User preference for wake lock

// Timestamp anchors for accurate time keeping across tab suspension
let gameStartTimestamp = null; // Epoch ms when the current game began
let turnStartTimestamp = null; // Epoch ms when the active turn began
let pausedStartTimestamp = null; // Epoch ms when a pause started (null when not paused)
let totalPausedDuration = 0; // Accumulated paused time for the whole game (ms)
let turnPausedDuration = 0; // Accumulated paused time within the current turn (ms)
let lastAutoSaveTimestamp = Date.now(); // Tracks last auto-save moment
let hasShownTimeUpNotification = false; // Track if we've shown the time-up notification for current turn

// --- Screen Wake Lock ---
// let wakeLock = null;

// async function enableWakeLock() {
//   if ('wakeLock' in navigator) {
//     try {
//       wakeLock = await navigator.wakeLock.request('screen');
//       wakeLock.addEventListener('release', () => {
//         console.log('Wake lock released');
//       });
//       console.log('Wake lock active');
//     } catch (err) {
//       console.error('Wake Lock error:', err);
//     }
//   } else {
//     enableNoSleepFallback();
//   }
// }

// async function releaseWakeLock() {
//   if (wakeLock !== null) {
//     try {
//       await wakeLock.release();
//       wakeLock = null;
//       console.log('Screen Wake Lock released programmatically.');
//     } catch (err) {
//       console.error('Could not release wake lock:', err);
//     }
//   }
// }

// Persistent interaction/event log
let eventLog = JSON.parse(localStorage.getItem('bgt:events') || '[]');

function logEvent(type, data = {}) {
  const entry = { type, timestamp: Date.now(), data };
  eventLog.push(entry);
  try {
    localStorage.setItem('bgt:events', JSON.stringify(eventLog));
  } catch (e) {
    console.warn('Failed to persist event log', e);
  }
}

// Helper utilities to derive elapsed seconds using system clock (avoids setInterval drift)
function getCurrentTurnElapsedSeconds() {
  if (!isGameRunning || turnStartTimestamp === null) return currentTurnTime;
  let now = Date.now();
  let elapsed = now - turnStartTimestamp - turnPausedDuration;
  if (isPaused && pausedStartTimestamp) {
    elapsed -= (now - pausedStartTimestamp);
  }
  return Math.floor(elapsed / 1000);
}

function getTotalGameElapsedSeconds() {
  if (!isGameRunning || gameStartTimestamp === null) return totalGameTime;
  let now = Date.now();
  let elapsed = now - gameStartTimestamp - totalPausedDuration;
  if (isPaused && pausedStartTimestamp) {
    elapsed -= (now - pausedStartTimestamp);
  }
  return Math.floor(elapsed / 1000);
}

// DOM elements
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
// const wakeLockBtn = document.getElementById('wakeLockBtn');
const nextPlayerBtn = document.getElementById('nextPlayerBtn');
const timerInput = document.getElementById('timerInput');
const setTimerBtn = document.getElementById('setTimerBtn');
const addPlayerBtn = document.getElementById('addPlayerBtn');
const shufflePlayersBtn = document.getElementById('shufflePlayersBtn');
const playersContainer = document.getElementById('playersContainer');
const currentTurnDisplay = document.getElementById('currentTurnDisplay');
const currentPlayerName = document.getElementById('currentPlayerName');
const currentMinutes = document.getElementById('currentMinutes');
const currentSeconds = document.getElementById('currentSeconds');
const gamesPlayedDisplay = document.getElementById('gamesPlayed');
const currentRoundDisplay = document.getElementById('currentRound');

// Mobile elements
const mobileStickyTurn = document.getElementById('mobileStickyTurn');
const mobileCurrentPlayerName = document.getElementById('mobileCurrentPlayerName');
const mobileCurrentMinutes = document.getElementById('mobileCurrentMinutes');
const mobileCurrentSeconds = document.getElementById('mobileCurrentSeconds');
const mobileNextPlayerBtn = document.getElementById('mobileNextPlayerBtn');

// Player class
class Player {
  constructor(name, id) {
    this.id = id;
    this.name = name;
    this.totalTime = 0; // Total time spent in seconds
    this.turns = 0; // Number of turns taken
  }

  addTurnTime(seconds) {
    this.totalTime += seconds;
    this.turns++;
  }

  getFormattedTime() {
    const minutes = Math.floor(this.totalTime / 60);
    const seconds = this.totalTime % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
}

// Check if device is mobile
function isMobileDevice() {
  return window.innerWidth <= 768;
}

// Update mobile UX based on game state
function updateMobileUX() {
  if (isMobileDevice()) {
    if (isGameRunning) {
      document.body.classList.add('mobile-game-running');
      mobileStickyTurn.style.display = 'block';
      mobileNextPlayerBtn.disabled = nextPlayerBtn.disabled;
    } else {
      document.body.classList.remove('mobile-game-running');
      mobileStickyTurn.style.display = 'none';
    }
  } else {
    document.body.classList.remove('mobile-game-running');
    mobileStickyTurn.style.display = 'none';
  }
}

// Generate and display app version
function generateAppVersion() {
  const now = new Date();

  // Format: v2025.01.15.1432 (Year.Month.Day.HourMinute)
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');

  const version = `v${year}.${month}.${day}.${hour}${minute}`;

  // Also include a short hash based on load time for uniqueness
  const loadTime = now.getTime();
  const hash = (loadTime % 10000).toString(16).toUpperCase().padStart(4, '0');

  const fullVersion = `${version}-${hash}`;

  // Update the version display
  const versionElement = document.getElementById('appVersion');
  if (versionElement) {
    versionElement.textContent = fullVersion;
    versionElement.title = `Loaded: ${now.toLocaleString()}`;
  }

  return fullVersion;
}

// Initialize the app
function init() {
  loadSessionData();
  createDefaultPlayers();
  updateDisplay();
  updateSessionDisplay();
  registerServiceWorker();
  setupEventListeners();
  updateMobileUX();
  // updateWakeLockButton(); // Set initial button state
  generateAppVersion(); // Generate and display version
}

// Create default players
function createDefaultPlayers() {
  if (players.length === 0) {
    addPlayer('Player 1');
    addPlayer('Player 2');
  }
  renderPlayers();
}

// Player management functions
function addPlayer(name = null) {
  const playerName = name || `Player ${players.length + 1}`;
  const player = new Player(playerName, Date.now());
  logEvent('addPlayer', { id: player.id, name: player.name });
  players.push(player);
  renderPlayers();
  saveSessionData();
}

function removePlayer(playerId) {
  if (players.length <= 2) {
    alert('You must have at least 2 players!');
    return;
  }

  const playerIndex = players.findIndex(p => p.id == playerId);
  if (playerIndex === -1) return;

  // Adjust current player index if necessary
  if (currentPlayerIndex >= playerIndex && currentPlayerIndex > 0) {
    currentPlayerIndex--;
  }

  const removedPlayer = players[playerIndex];
  logEvent('removePlayer', { id: removedPlayer.id });
  players.splice(playerIndex, 1);
  renderPlayers();
  saveSessionData();

  if (isGameRunning) {
    updateCurrentPlayerDisplay();
  }
}

function updatePlayerName(playerId, newName) {
  const player = players.find(p => p.id === playerId);
  if (player && newName.trim() !== '') {
    player.name = newName.trim();
    saveSessionData();
    if (isGameRunning) {
      updateCurrentPlayerDisplay();
    }
  }
}

// Fisher-Yates shuffle algorithm
function shufflePlayers() {
  if (isGameRunning) {
    if (!confirm('Shuffling will reset the current game. Continue?')) {
      return;
    }
    resetGame();
  }

  // Fisher-Yates shuffle
  for (let i = players.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [players[i], players[j]] = [players[j], players[i]];
  }

  currentPlayerIndex = 0;
  renderPlayers();
  saveSessionData();
  logEvent('shufflePlayers');
}

// Render players in the UI
function renderPlayers() {
  playersContainer.innerHTML = '';

  players.forEach((player, index) => {
    const playerCard = createPlayerCard(player, index);
    playersContainer.appendChild(playerCard);
  });

  setupDragAndDrop();
  updatePlayerManagementButtons(); // Update button states after rendering
}

// Create a player card element
function createPlayerCard(player, index) {
  const card = document.createElement('div');
  card.className = `player-card ${currentPlayerIndex === index && isGameRunning ? 'current-player' : ''}`;
  card.dataset.playerId = player.id;
  card.draggable = true;

  card.innerHTML = `
        <div class="drag-handle">⋮⋮</div>
        <div class="player-info">
            <div class="player-number">${index + 1}</div>
            <input type="text" class="player-name-input" value="${player.name}" data-player-id="${player.id}">
        </div>
        <div class="player-stats">
            <div class="player-time">${player.getFormattedTime()}</div>
            <div class="player-turns">${player.turns} turns</div>
        </div>
        <div class="player-actions">
            <button class="btn btn-danger btn-small remove-player-btn" data-player-id="${player.id}"
                    ${players.length <= 2 ? 'disabled' : ''}>Remove</button>
        </div>
    `;

  return card;
}

// Drag and drop functionality
function setupDragAndDrop() {
  const playerCards = document.querySelectorAll('.player-card');

  playerCards.forEach(card => {
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragover', handleDragOver);
    card.addEventListener('drop', handleDrop);
    card.addEventListener('dragend', handleDragEnd);
  });

  // Setup remove button event listeners
  const removeButtons = document.querySelectorAll('.remove-player-btn');
  removeButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const playerId = parseInt(button.dataset.playerId);
      removePlayer(playerId);
    });
  });

  // Setup player name input event listeners
  const nameInputs = document.querySelectorAll('.player-name-input');
  nameInputs.forEach(input => {
    input.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    input.addEventListener('change', (e) => {
      const playerId = parseInt(input.dataset.playerId);
      updatePlayerName(playerId, input.value);
    });
  });
}

let draggedElement = null;

function handleDragStart(e) {
  draggedElement = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.outerHTML);
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }

  this.classList.add('drag-over');
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }

  if (draggedElement !== this) {
    const draggedPlayerId = parseInt(draggedElement.dataset.playerId);
    const targetPlayerId = parseInt(this.dataset.playerId);

    reorderPlayers(draggedPlayerId, targetPlayerId);
  }

  this.classList.remove('drag-over');
  return false;
}

function handleDragEnd(e) {
  const playerCards = document.querySelectorAll('.player-card');
  playerCards.forEach(card => {
    card.classList.remove('dragging', 'drag-over');
  });
}

function reorderPlayers(draggedPlayerId, targetPlayerId) {
  const draggedIndex = players.findIndex(p => p.id === draggedPlayerId);
  const targetIndex = players.findIndex(p => p.id === targetPlayerId);

  if (draggedIndex === -1 || targetIndex === -1) return;

  // Update current player index if necessary
  if (currentPlayerIndex === draggedIndex) {
    currentPlayerIndex = targetIndex;
  } else if (currentPlayerIndex === targetIndex) {
    currentPlayerIndex = draggedIndex;
  } else if (draggedIndex < currentPlayerIndex && targetIndex >= currentPlayerIndex) {
    currentPlayerIndex--;
  } else if (draggedIndex > currentPlayerIndex && targetIndex <= currentPlayerIndex) {
    currentPlayerIndex++;
  }

  // Reorder the array
  const [draggedPlayer] = players.splice(draggedIndex, 1);
  players.splice(targetIndex, 0, draggedPlayer);

  renderPlayers();
  saveSessionData();

  if (isGameRunning) {
    updateCurrentPlayerDisplay();
  }
}

// Timer input validation utility
function validateTimerInput(value) {
  // Trim whitespace
  const trimmed = String(value).trim();

  // Check for empty input
  if (trimmed === '') {
    return { isValid: true, value: 0, message: 'Empty input defaults to unlimited time' };
  }

  // Check for non-numeric characters (allow only digits)
  if (!/^\d+$/.test(trimmed)) {
    return { isValid: false, value: null, message: 'Please enter only numbers (no decimals or text)' };
  }

  // Convert to number
  const numValue = parseInt(trimmed, 10);

  // Check for invalid conversion (shouldn't happen after regex check, but safety first)
  if (isNaN(numValue)) {
    return { isValid: false, value: null, message: 'Invalid number format' };
  }

  // Check for negative values
  if (numValue < 0) {
    return { isValid: false, value: null, message: 'Timer cannot be negative' };
  }

  // Check for maximum value (reasonable upper limit)
  if (numValue > 180) {
    return { isValid: false, value: null, message: 'Timer cannot exceed 180 minutes (3 hours)' };
  }

  // Valid input
  const message = numValue === 0 ? 'Unlimited time (count up mode)' : `${numValue} minute${numValue === 1 ? '' : 's'} per turn`;
  return { isValid: true, value: numValue, message };
}

// Show validation feedback to user
function showTimerValidationFeedback(validation) {
  // Remove any existing feedback
  const existingFeedback = document.getElementById('timer-validation-feedback');
  if (existingFeedback) {
    existingFeedback.remove();
  }

  // Create feedback element
  const feedback = document.createElement('div');
  feedback.id = 'timer-validation-feedback';
  feedback.className = `timer-validation ${validation.isValid ? 'valid' : 'invalid'}`;
  feedback.textContent = validation.message;

  // Insert after the timer input
  timerInput.parentNode.insertBefore(feedback, timerInput.nextSibling);

  // Update input styling
  if (validation.isValid) {
    timerInput.classList.remove('invalid');
    timerInput.classList.add('valid');
  } else {
    timerInput.classList.remove('valid');
    timerInput.classList.add('invalid');
  }

  // Auto-hide feedback after 3 seconds if valid
  if (validation.isValid) {
    setTimeout(() => {
      if (feedback && feedback.parentNode) {
        feedback.remove();
        timerInput.classList.remove('valid');
      }
    }, 3000);
  }
}

// Real-time input validation
function handleTimerInputChange() {
  const validation = validateTimerInput(timerInput.value);
  showTimerValidationFeedback(validation);

  // Enable/disable set button based on validation
  setTimerBtn.disabled = !validation.isValid;

  return validation;
}

function setTimer() {
  const validation = validateTimerInput(timerInput.value);

  // Show validation feedback
  showTimerValidationFeedback(validation);

  if (!validation.isValid) {
    // Focus back to input for correction
    timerInput.focus();
    return;
  }

  const minutes = validation.value;
  turnTimeLimit = minutes * 60;
  isIncrementalMode = turnTimeLimit === 0;

  logEvent('setTimer', { turnTimeLimit, inputValue: timerInput.value.trim() });

  if (!isGameRunning) {
    if (isIncrementalMode) {
      timeLeft = 0;
    } else {
      timeLeft = turnTimeLimit;
    }
  }

  updateDisplay();

  // Clear validation styling after successful set
  setTimeout(() => {
    timerInput.classList.remove('valid', 'invalid');
    const feedback = document.getElementById('timer-validation-feedback');
    if (feedback) feedback.remove();
  }, 2000);
}

function updateDisplay() {
  // Derive live timings from timestamps for display purposes
  const liveTotalGameTime = getTotalGameElapsedSeconds();
  const liveCurrentTurnTime = getCurrentTurnElapsedSeconds();

  let liveTimeLeft;
  if (isIncrementalMode) {
    liveTimeLeft = liveCurrentTurnTime; // counting up
  } else {
    // In countdown mode, timeLeft is the remaining time
    liveTimeLeft = turnTimeLimit - liveCurrentTurnTime;
  }

  const isOvertime = !isIncrementalMode && liveTimeLeft < 0;
  const displayTime = Math.abs(liveTimeLeft);
  const minutes = Math.floor(displayTime / 60);
  const seconds = displayTime % 60;

  // Format total game time
  const totalMinutes = Math.floor(liveTotalGameTime / 60);
  const totalSeconds = liveTotalGameTime % 60;
  const totalTimeFormatted = `${totalMinutes.toString().padStart(2, '0')}:${totalSeconds.toString().padStart(2, '0')}`;

  // Update desktop timer
  currentMinutes.textContent = (isOvertime ? '-' : '') + minutes.toString().padStart(2, '0');
  currentSeconds.textContent = seconds.toString().padStart(2, '0');

  // Update mobile timer
  mobileCurrentMinutes.textContent = (isOvertime ? '-' : '') + minutes.toString().padStart(2, '0');
  mobileCurrentSeconds.textContent = seconds.toString().padStart(2, '0');

  // Update total game time displays
  updateTotalGameTimeDisplay(totalTimeFormatted);

  // Add warning animation for low time or overtime (only in countdown mode)
  const timerDisplay = document.querySelector('.current-timer-display');
  const mobileTimerDisplay = mobileStickyTurn.querySelector('.current-timer-display');

  if (!isIncrementalMode && (liveTimeLeft <= 30 || isOvertime)) {
    timerDisplay.classList.add('warning');
    if (mobileTimerDisplay) mobileTimerDisplay.classList.add('warning');

    // Show notification when time first runs out
    if (isOvertime && !hasShownTimeUpNotification) {
      hasShownTimeUpNotification = true;
      showNotification(`${players[currentPlayerIndex].name}'s time is up! Switch to next player when ready.`);
    }
  } else {
    timerDisplay.classList.remove('warning');
    if (mobileTimerDisplay) mobileTimerDisplay.classList.remove('warning');
  }
}

function updateTotalGameTimeDisplay(totalTimeFormatted) {
  // Update or create total game time elements
  let totalGameTimeElement = document.getElementById('totalGameTime');
  let mobileTotalGameTimeElement = document.getElementById('mobileTotalGameTime');

  if (isGameRunning) {
    if (!totalGameTimeElement) {
      totalGameTimeElement = document.createElement('div');
      totalGameTimeElement.id = 'totalGameTime';
      totalGameTimeElement.className = 'total-game-time';
      totalGameTimeElement.innerHTML = `Game Time: <span class="time-value">${totalTimeFormatted}</span>`;
      currentTurnDisplay.appendChild(totalGameTimeElement);
    } else {
      totalGameTimeElement.querySelector('.time-value').textContent = totalTimeFormatted;
    }

    if (!mobileTotalGameTimeElement) {
      mobileTotalGameTimeElement = document.createElement('div');
      mobileTotalGameTimeElement.id = 'mobileTotalGameTime';
      mobileTotalGameTimeElement.className = 'total-game-time mobile-total-time';
      mobileTotalGameTimeElement.innerHTML = `Game: <span class="time-value">${totalTimeFormatted}</span>`;
      mobileStickyTurn.appendChild(mobileTotalGameTimeElement);
    } else {
      mobileTotalGameTimeElement.querySelector('.time-value').textContent = totalTimeFormatted;
    }
  }
}

function updateCurrentPlayerDisplay() {
  if (isGameRunning && players[currentPlayerIndex]) {
    currentPlayerName.textContent = players[currentPlayerIndex].name;
    mobileCurrentPlayerName.textContent = players[currentPlayerIndex].name;
  }
}

function updateSessionDisplay() {
  gamesPlayedDisplay.textContent = gamesPlayed;
  currentRoundDisplay.textContent = currentRound;
}

// Local storage functions
function saveSessionData() {
  // Ensure derived values are up-to-date before persisting
  totalGameTime = getTotalGameElapsedSeconds();
  currentTurnTime = getCurrentTurnElapsedSeconds();

  const sessionData = {
    players: players.map(p => ({
      id: p.id,
      name: p.name,
      totalTime: p.totalTime,
      turns: p.turns
    })),
    gamesPlayed,
    currentRound: currentRound,
    turnTimeLimit,
    // Game state
    isGameRunning,
    isPaused,
    currentPlayerIndex,
    timeLeft,
    totalGameTime,
    currentTurnTime,
    isIncrementalMode,
    hasShownTimeUpNotification,
    // Timestamp for calculating elapsed time during page refresh
    lastSaveTime: Date.now(),
    gameStartTimestamp,
    turnStartTimestamp,
    pausedStartTimestamp,
    totalPausedDuration,
    turnPausedDuration
  };

  localStorage.setItem('bgt:session', JSON.stringify(sessionData));
  lastAutoSaveTimestamp = Date.now();
}

function loadSessionData() {
  const saved = localStorage.getItem('bgt:session');
  if (saved) {
    try {
      const data = JSON.parse(saved);

      if (data.players && data.players.length >= 2) {
        players = data.players.map(p => {
          const player = new Player(p.name, p.id);
          player.totalTime = p.totalTime || 0;
          player.turns = p.turns || 0;
          return player;
        });
      }

      gamesPlayed = data.gamesPlayed || 0;
      currentRound = data.currentRound || 0;
      turnTimeLimit = data.turnTimeLimit !== undefined ? data.turnTimeLimit : 0;

      // Restore game state
      isGameRunning = data.isGameRunning || false;
      isPaused = data.isPaused || false;
      currentPlayerIndex = data.currentPlayerIndex || 0;
      timeLeft = data.timeLeft !== undefined ? data.timeLeft : 0;
      totalGameTime = data.totalGameTime || 0;
      currentTurnTime = data.currentTurnTime || 0;
      isIncrementalMode = data.isIncrementalMode !== undefined ? data.isIncrementalMode : true;
      hasShownTimeUpNotification = data.hasShownTimeUpNotification || false;
      // isWakeLockEnabled = data.isWakeLockEnabled || false;

      // Restore anchor timestamps (newer format)
      gameStartTimestamp = data.gameStartTimestamp || null;
      turnStartTimestamp = data.turnStartTimestamp || null;
      pausedStartTimestamp = data.pausedStartTimestamp || null;
      totalPausedDuration = data.totalPausedDuration || 0;
      turnPausedDuration = data.turnPausedDuration || 0;

      // Calculate elapsed time since last save if game was running
      if (isGameRunning && !isPaused && data.lastSaveTime) {
        const elapsedSeconds = Math.floor((Date.now() - data.lastSaveTime) / 1000);
        totalGameTime += elapsedSeconds;
        currentTurnTime += elapsedSeconds;

        if (isIncrementalMode) {
          timeLeft += elapsedSeconds;
        } else {
          timeLeft = Math.max(0, timeLeft - elapsedSeconds);
        }
      }

      // Set incremental mode if not already set
      if (isIncrementalMode === undefined) {
        isIncrementalMode = turnTimeLimit === 0;
      }

      // Update timer input
      timerInput.value = Math.floor(turnTimeLimit / 60);

      // Restore UI state if game was running
      if (isGameRunning) {
        restoreGameUI();
      }

    } catch (e) {
      console.error('Failed to load session data:', e);
    }
  }
}

function restoreGameUI() {
  // Restore button states
  startBtn.disabled = true;
  pauseBtn.disabled = false;
  nextPlayerBtn.disabled = false;

  // Update pause button text if paused
  if (isPaused) {
    pauseBtn.textContent = 'Resume';
  } else {
    pauseBtn.textContent = 'Pause';
  }

  // Show current turn display
  currentTurnDisplay.style.display = 'block';

  // Update displays
  updateCurrentPlayerDisplay();
  updateMobileUX();
  updatePlayerManagementButtons();

  // Resume timer if not paused
  if (!isPaused) {
    resumeGameTimer();
  }
}

function resumeGameTimer() {
  // Clear any existing timer
  if (timer) {
    clearInterval(timer);
  }

  timer = setInterval(() => {
    updateDisplay();

    // Auto-save every 5 seconds of real time
    if (Date.now() - lastAutoSaveTimestamp >= 5000) {
      saveSessionData();
    }
  }, 1000);
}

// Notification function
function showNotification(message) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Board Game Timer', {
      body: message,
      icon: '/icons/icon-192.png'
    });
  }
  // Note: Permission should only be requested on user interaction (in startGame)
}

// Service Worker registration
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered:', registration);
    } catch (error) {
      console.log('Service Worker registration failed:', error);
    }
  }
}

// Event listeners setup
function setupEventListeners() {
  startBtn.addEventListener('click', startGame);
  pauseBtn.addEventListener('click', pauseGame);
  resetBtn.addEventListener('click', resetGame);
  nextPlayerBtn.addEventListener('click', nextPlayer);
  setTimerBtn.addEventListener('click', setTimer);
  addPlayerBtn.addEventListener('click', () => addPlayer());
  shufflePlayersBtn.addEventListener('click', shufflePlayers);
  // wakeLockBtn.addEventListener('click', toggleWakeLock);

  // Timer input validation
  timerInput.addEventListener('input', handleTimerInputChange);
  timerInput.addEventListener('blur', handleTimerInputChange);

  // Allow Enter key to set timer if valid
  timerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!setTimerBtn.disabled) {
        setTimer();
      }
    }
  });

  // Global keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Only handle shortcuts when not typing in input fields
    const activeElement = document.activeElement;
    const isTyping = activeElement && (
      activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.contentEditable === 'true'
    );

    // Space bar: Next Player (only during active game)
    if (e.code === 'Space' && !isTyping) {
      if (isGameRunning && !isPaused && !nextPlayerBtn.disabled) {
        e.preventDefault(); // Prevent page scroll
        nextPlayer();

        // Visual feedback - briefly highlight the next player button
        nextPlayerBtn.classList.add('keyboard-activated');
        setTimeout(() => {
          nextPlayerBtn.classList.remove('keyboard-activated');
        }, 200);

        // Also highlight mobile button if visible
        if (mobileNextPlayerBtn.style.display !== 'none') {
          mobileNextPlayerBtn.classList.add('keyboard-activated');
          setTimeout(() => {
            mobileNextPlayerBtn.classList.remove('keyboard-activated');
          }, 200);
        }

        logEvent('nextPlayer_keyboard', { key: 'Space' });
      }
    }

    // Escape: Pause/Resume game (bonus shortcut)
    if (e.code === 'Escape' && !isTyping) {
      if (isGameRunning && !pauseBtn.disabled) {
        e.preventDefault();
        pauseGame();

        // Visual feedback
        pauseBtn.classList.add('keyboard-activated');
        setTimeout(() => {
          pauseBtn.classList.remove('keyboard-activated');
        }, 200);

        logEvent('pauseGame_keyboard', { key: 'Escape' });
      }
    }
  });

  // Mobile next player button
  mobileNextPlayerBtn.addEventListener('click', nextPlayer);

  // Update mobile UX on window resize
  window.addEventListener('resize', updateMobileUX);
}

// Request notification permission when starting a game
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// Update player management buttons based on game state
function updatePlayerManagementButtons() {
  addPlayerBtn.disabled = isGameRunning;
  shufflePlayersBtn.disabled = isGameRunning;

  // Update remove buttons on all player cards
  const removeButtons = document.querySelectorAll('.player-actions .btn-danger');
  removeButtons.forEach(button => {
    if (isGameRunning) {
      button.disabled = true;
    } else {
      // Only enable if there are more than 2 players
      button.disabled = players.length <= 2;
    }
  });
}

// Save state when page is about to unload
window.addEventListener('beforeunload', () => {
  if (isGameRunning) {
    saveSessionData();
  }
});

// Save state when page becomes hidden (device lock, app switch)
// and re-acquire wake lock when it becomes visible.
document.addEventListener('visibilitychange', async () => {
  // if (wakeLock !== null && document.visibilityState === 'visible') {
  //   await enableWakeLock();
  // }
  if (document.hidden) {
    if (isGameRunning) {
      saveSessionData();
    }
  } else {
    // Page is visible
    // if (isGameRunning && !isPaused && isWakeLockEnabled) {
    //   await enableWakeLock();
    // }
  }
});

// Timer functions
async function startGame() {
  if (!isGameRunning) {
    isGameRunning = true;
    isPaused = false;

    // Initialise anchor timestamps
    gameStartTimestamp = Date.now();
    turnStartTimestamp = gameStartTimestamp;
    pausedStartTimestamp = null;
    totalPausedDuration = 0;
    turnPausedDuration = 0;

    logEvent('startGame');

    currentRound++;
    totalGameTime = 0;
    currentTurnTime = 0;

    // Check if we're in incremental mode (no turn timer)
    isIncrementalMode = turnTimeLimit === 0;

    if (isIncrementalMode) {
      timeLeft = 0; // Start from 0 and count up
    } else {
      timeLeft = turnTimeLimit; // Count down from limit
    }

    startBtn.disabled = true;
    pauseBtn.disabled = false;
    nextPlayerBtn.disabled = false;

    currentTurnDisplay.style.display = 'block';
    updateCurrentPlayerDisplay();
    updateMobileUX();
    updatePlayerManagementButtons(); // Disable player management

    resumeGameTimer(); // Use the new resume function
    saveSessionData(); // Save immediately when starting

    requestNotificationPermission();
    // if (isWakeLockEnabled) {
    //   await enableWakeLock();
    // }
  }
}

async function pauseGame() {
  if (isGameRunning && !isPaused) {
    isPaused = true;
    pausedStartTimestamp = Date.now();
    logEvent('pauseGame');
    clearInterval(timer);
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    pauseBtn.textContent = 'Resume';
    saveSessionData(); // Save when pausing
    // Only release lock if it was enabled
    // if (isWakeLockEnabled) {
    //   await releaseWakeLock();
    // }
  } else if (isGameRunning && isPaused) {
    isPaused = false;

    if (pausedStartTimestamp) {
      const pauseDuration = Date.now() - pausedStartTimestamp;
      totalPausedDuration += pauseDuration;
      turnPausedDuration += pauseDuration;
      pausedStartTimestamp = null;
    }

    logEvent('resumeGame');
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    pauseBtn.textContent = 'Pause';

    resumeGameTimer(); // Use the new resume function
    saveSessionData(); // Save when resuming
    // Only re-acquire lock if it's enabled by user
    // if (isWakeLockEnabled) {
    //   await enableWakeLock();
    // }
  }
}

async function resetGame() {
  logEvent('resetGame');
  // Always release the lock on reset, regardless of preference
  // await releaseWakeLock();

  // Prune event log after logging the reset event
  eventLog = [];
  try {
    localStorage.removeItem('bgt:events');
  } catch (e) {
    console.warn('Failed to clear event log', e);
  }

  isGameRunning = false;
  isPaused = false;
  clearInterval(timer);

  gameStartTimestamp = null;
  turnStartTimestamp = null;
  pausedStartTimestamp = null;
  totalPausedDuration = 0;
  turnPausedDuration = 0;

  currentPlayerIndex = 0;
  totalGameTime = 0;
  currentTurnTime = 0;

  if (isIncrementalMode) {
    timeLeft = 0;
  } else {
    timeLeft = turnTimeLimit;
  }

  // Reset all player stats
  players.forEach(player => {
    player.totalTime = 0;
    player.turns = 0;
  });

  startBtn.disabled = false;
  pauseBtn.disabled = true;
  pauseBtn.textContent = 'Pause'; // Reset button text
  nextPlayerBtn.disabled = true;

  currentTurnDisplay.style.display = 'none';
  updateMobileUX();
  updatePlayerManagementButtons(); // Re-enable player management

  renderPlayers();
  updateDisplay();

  if (currentRound > 0) {
    gamesPlayed++;
    updateSessionDisplay();
    saveSessionData();
  }
}

function nextPlayer() {
  if (!isGameRunning) return;

  const timeSpent = getCurrentTurnElapsedSeconds();
  players[currentPlayerIndex].addTurnTime(timeSpent);

  logEvent('nextPlayer', { from: players[currentPlayerIndex].id, duration: timeSpent });

  // Move to next player
  currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
  currentTurnTime = 0;

  turnStartTimestamp = Date.now();
  turnPausedDuration = 0;
  hasShownTimeUpNotification = false; // Reset notification flag for new turn

  if (isIncrementalMode) {
    timeLeft = 0; // Reset to 0 for next player in incremental mode
  } else {
    timeLeft = turnTimeLimit; // Reset to time limit for countdown mode
  }

  updateCurrentPlayerDisplay();
  renderPlayers();

  saveSessionData(); // Save after each player change
}

// Function to update the wake lock button's appearance
function updateWakeLockButton() {
  const icon = wakeLockBtn.querySelector('.icon');
  if (isWakeLockEnabled) {
    icon.textContent = '👁️'; // Open eye icon
    wakeLockBtn.textContent = ' Screen On';
    wakeLockBtn.prepend(icon);
    wakeLockBtn.classList.add('active');
  } else {
    icon.textContent = '😴'; // Sleep icon
    wakeLockBtn.textContent = ' Screen Off';
    wakeLockBtn.prepend(icon);
    wakeLockBtn.classList.remove('active');
  }
}

async function toggleWakeLock() {
  isWakeLockEnabled = !isWakeLockEnabled;
  logEvent('toggleWakeLock', { enabled: isWakeLockEnabled });
  updateWakeLockButton();

  // If game is running and not paused, apply the new setting immediately
  if (isGameRunning && !isPaused) {
    if (isWakeLockEnabled) {
      // await enableWakeLock();
    } else {
      // await releaseWakeLock();
    }
  }

  saveSessionData(); // Persist the new preference
}

// Initialize the app
init();
