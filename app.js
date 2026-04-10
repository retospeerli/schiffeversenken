(() => {
  const SIZE = 13;
  const COL_LABELS = "ABCDEFGHIJKLM".split("");
  const ROW_LABELS = "NOPQRSTUVWXYZ".split("");
  const SHIP_LENGTHS = [6, 5, 4, 4, 3, 3, 2];

  const MORSE_LONG_PRESS_MS = 260;
  const MORSE_LETTER_GAP_MS = 700;
  const END_OVERLAY_DELAY_MS = 700;
  const MORSE_BEEP_FREQ = 650;

  const NATO_MAP = {
    alfa: "A", alpha: "A",
    bravo: "B",
    charlie: "C",
    delta: "D",
    echo: "E",
    foxtrot: "F", foxtrott: "F",
    golf: "G",
    hotel: "H",
    india: "I",
    juliett: "J", juliet: "J",
    kilo: "K",
    lima: "L",
    mike: "M",
    november: "N",
    oscar: "O",
    papa: "P",
    quebec: "Q",
    romeo: "R",
    sierra: "S",
    tango: "T",
    uniform: "U",
    victor: "V",
    whiskey: "W",
    whisky: "W",
    xray: "X",
    "x-ray": "X",
    yankee: "Y",
    zulu: "Z"
  };

  const MORSE_TO_LETTER = {
    ".-": "A", "-...": "B", "-.-.": "C", "-..": "D", ".": "E", "..-.": "F",
    "--.": "G", "....": "H", "..": "I", ".---": "J", "-.-": "K", ".-..": "L",
    "--": "M", "-.": "N", "---": "O", ".--.": "P", "--.-": "Q", ".-.": "R",
    "...": "S", "-": "T", "..-": "U", "...-": "V", ".--": "W", "-..-": "X",
    "-.--": "Y", "--..": "Z"
  };

  const dom = {
    startOverlay: document.getElementById("startOverlay"),
    startGameMode: document.getElementById("startGameMode"),
    startInputMode: document.getElementById("startInputMode"),
    startOnlinePanel: document.getElementById("startOnlinePanel"),
    startMorsePanel: document.getElementById("startMorsePanel"),
    btnChooseStartMorseKey: document.getElementById("btnChooseStartMorseKey"),
    startMorseKeyDisplay: document.getElementById("startMorseKeyDisplay"),
    btnStartGame: document.getElementById("btnStartGame"),

    endOverlay: document.getElementById("endOverlay"),
    endTitle: document.getElementById("endTitle"),
    endText: document.getElementById("endText"),
    victoryAnim: document.getElementById("victoryAnim"),
    defeatAnim: document.getElementById("defeatAnim"),
    btnPlayAgain: document.getElementById("btnPlayAgain"),
    btnBackToMenu: document.getElementById("btnBackToMenu"),

    btnNewGame: document.getElementById("btnNewGame"),

    playerBoardStage: document.getElementById("playerBoardStage"),
    enemyBoardStage: document.getElementById("enemyBoardStage"),
    playerBoardGrid: document.getElementById("playerBoardGrid"),
    enemyBoardGrid: document.getElementById("enemyBoardGrid"),

    textInputPanel: document.getElementById("textInputPanel"),
    natoInputPanel: document.getElementById("natoInputPanel"),
    morseInputPanel: document.getElementById("morseInputPanel"),

    coordInput: document.getElementById("coordInput"),
    btnFireText: document.getElementById("btnFireText"),

    btnStartNato: document.getElementById("btnStartNato"),
    btnStopNato: document.getElementById("btnStopNato"),
    speechRaw: document.getElementById("speechRaw"),
    speechCoord: document.getElementById("speechCoord"),

    morseKeyDisplay: document.getElementById("morseKeyDisplay"),
    btnClearMorse: document.getElementById("btnClearMorse"),
    morseCurrent: document.getElementById("morseCurrent"),
    morseLetters: document.getElementById("morseLetters"),
    morseCoord: document.getElementById("morseCoord"),

    btnCreateOffer: document.getElementById("btnCreateOffer"),
    offerBox: document.getElementById("offerBox"),
    answerInput: document.getElementById("answerInput"),
    btnAcceptAnswer: document.getElementById("btnAcceptAnswer"),
    offerInput: document.getElementById("offerInput"),
    btnCreateAnswer: document.getElementById("btnCreateAnswer"),
    answerBox: document.getElementById("answerBox")
  };

  const sounds = {
    ready: new Audio("audio/ready.wav"),
    copy: new Audio("audio/copy.wav"),
    fire: new Audio("audio/fire.wav"),
    hit: new Audio("audio/hit.mp3"),
    miss: new Audio("audio/miss.wav"),
    destroyed: new Audio("audio/destroyed.wav"),
    error: new Audio("audio/error.wav"),
    enemyradio: new Audio("audio/enemyradio.wav"),
    enemyfire: new Audio("audio/enemyfire.wav"),
    mayday: new Audio("audio/mayday.wav"),
    victory: new Audio("audio/victory.mp3"),
    defeat: new Audio("audio/defeat.mp3")
  };

  for (const audio of Object.values(sounds)) {
    audio.preload = "auto";
  }

  let state = null;
  let speechRecognition = null;
  let speechActive = false;

  let waitingForStartMorseKey = false;
  let morsePressStart = null;
  let morsePointerId = null;
  let morseRightMouseDown = false;
  let morseLetterTimer = null;

  let audioCtx = null;
  let morseOscillator = null;
  let morseGain = null;
  let audioQueue = Promise.resolve();

  let rtc = {
    pc: null,
    dc: null,
    connected: false,
    role: null
  };

  let pendingStartMorseTrigger = { type: "keyboard", key: " " };

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function ensureAudioContext() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  }

  function startMorseTone() {
    ensureAudioContext();
    if (!audioCtx || morseOscillator) return;

    morseOscillator = audioCtx.createOscillator();
    morseGain = audioCtx.createGain();
    morseOscillator.type = "sine";
    morseOscillator.frequency.value = MORSE_BEEP_FREQ;
    morseGain.gain.value = 0.04;
    morseOscillator.connect(morseGain);
    morseGain.connect(audioCtx.destination);
    morseOscillator.start();
  }

  function stopMorseTone() {
    if (morseOscillator) {
      try { morseOscillator.stop(); } catch (_) {}
      try { morseOscillator.disconnect(); } catch (_) {}
    }
    if (morseGain) {
      try { morseGain.disconnect(); } catch (_) {}
    }
    morseOscillator = null;
    morseGain = null;
  }

  function stopAllManagedSounds() {
    for (const snd of Object.values(sounds)) {
      try {
        snd.pause();
        snd.currentTime = 0;
      } catch (_) {}
    }
  }

  function waitForAudioEnd(audio) {
    return new Promise(resolve => {
      let done = false;

      function finish() {
        if (done) return;
        done = true;
        audio.removeEventListener("ended", finish);
        audio.removeEventListener("error", finish);
        resolve();
      }

      audio.addEventListener("ended", finish, { once: true });
      audio.addEventListener("error", finish, { once: true });

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise.catch(() => finish());
      }

      if (audio.duration === 0 && audio.readyState < 2) {
        setTimeout(finish, 1500);
      }
    });
  }

  function enqueueSound(name, volume = 1) {
    audioQueue = audioQueue.then(async () => {
      const snd = sounds[name];
      if (!snd) return;

      stopMorseTone();

      try {
        snd.pause();
        snd.currentTime = 0;
        snd.volume = volume;
      } catch (_) {}

      await waitForAudioEnd(snd);
    });

    return audioQueue;
  }

  async function playReadySound() {
    await enqueueSound("ready", 1);
  }

  async function playVictorySound() {
    await enqueueSound("victory", 1);
  }

  async function playDefeatSound() {
    await enqueueSound("defeat", 1);
  }

  async function playPlayerTurnSequence(result) {
    if (!result.valid) {
      await enqueueSound("error", 1);
      return;
    }

    await enqueueSound("copy", 1);
    await enqueueSound("fire", 1);

    if (result.hit) {
      await enqueueSound("hit", 0.45);
      if (result.sunk) {
        await enqueueSound("destroyed", 1);
      }
    } else {
      await enqueueSound("miss", 0.45);
    }
  }

  async function playEnemyTurnSequence(result) {
    await enqueueSound("enemyradio", 1);
    await enqueueSound("enemyfire", 1);

    if (result.hit) {
      await enqueueSound("hit", 1);
      if (result.sunk) {
        await enqueueSound("mayday", 1);
      }
    } else {
      await enqueueSound("miss", 1);
    }
  }

  function createEmptyBoard() {
    return Array.from({ length: SIZE }, () =>
      Array.from({ length: SIZE }, () => ({
        ship: false,
        hit: false,
        miss: false,
        shipId: null
      }))
    );
  }

  function randomInt(max) {
    return Math.floor(Math.random() * max);
  }

  function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  function canPlaceShip(board, row, col, len, horizontal) {
    for (let i = 0; i < len; i++) {
      const r = horizontal ? row : row + i;
      const c = horizontal ? col + i : col;
      if (!inBounds(r, c)) return false;
      if (board[r][c].ship) return false;
    }
    return true;
  }

  function placeShip(board, ships, len) {
    let placed = false;
    while (!placed) {
      const horizontal = Math.random() < 0.5;
      const row = randomInt(SIZE);
      const col = randomInt(SIZE);

      if (!canPlaceShip(board, row, col, len, horizontal)) continue;

      const shipId = ships.length;
      const cells = [];

      for (let i = 0; i < len; i++) {
        const r = horizontal ? row : row + i;
        const c = horizontal ? col + i : col;
        board[r][c].ship = true;
        board[r][c].shipId = shipId;
        cells.push([r, c]);
      }

      ships.push({ id: shipId, len, cells, hits: 0, sunk: false });
      placed = true;
    }
  }

  function createPlacedBoard() {
    const board = createEmptyBoard();
    const ships = [];
    for (const len of SHIP_LENGTHS) {
      placeShip(board, ships, len);
    }
    return { board, ships };
  }

  function updateBoardSize() {
    const playerStage = dom.playerBoardStage;
    const enemyStage = dom.enemyBoardStage;
    if (!playerStage || !enemyStage) return;

    const playerRect = playerStage.getBoundingClientRect();
    const enemyRect = enemyStage.getBoundingClientRect();

    const availableWidth = Math.min(playerRect.width, enemyRect.width);
    const availableHeight = Math.min(playerRect.height, enemyRect.height);

    const gapCompensation = 26;
    const usableWidth = Math.max(100, availableWidth - gapCompensation);
    const usableHeight = Math.max(100, availableHeight - gapCompensation);

    const sizeByWidth = Math.floor(usableWidth / 14);
    const sizeByHeight = Math.floor(usableHeight / 14);
    const cellSize = Math.max(14, Math.min(sizeByWidth, sizeByHeight));

    document.documentElement.style.setProperty("--cell-size", `${cellSize}px`);
  }

  function resetState(mode = "pc", inputMode = "text", morseTrigger = { type: "keyboard", key: " " }) {
    const player = createPlacedBoard();
    const enemy = createPlacedBoard();

    state = {
      mode,
      inputMode,
      isOnline: mode === "online",
      isHost: false,
      onlineConnected: false,
      myTurn: true,
      gameOver: false,
      isBusy: false,

      playerBoard: player.board,
      playerShips: player.ships,

      enemyBoard: enemy.board,
      enemyShips: enemy.ships,

      remoteBoardShots: createEmptyBoard(),

      morseTrigger,
      morseCurrent: "",
      morseLetters: [],

      pcTargetStack: [],
      pcTriedShots: new Set()
    };

    clearMorseTimers();
    morsePressStart = null;
    morsePointerId = null;
    morseRightMouseDown = false;
    stopMorseTone();

    updateMorseDisplay();
    updateMorseKeyDisplay();
    updateInputPanels();
    renderBoards();
  }

  function formatTrigger(trigger) {
    if (!trigger) return "-";
    if (trigger.type === "keyboard") {
      if (trigger.key === " ") return "Leertaste";
      if (trigger.key === "Enter") return "Enter";
      if (trigger.key === "Escape") return "Esc";
      return `Taste: ${trigger.key}`;
    }
    if (trigger.type === "mouse-left") return "Maus links";
    if (trigger.type === "mouse-right") return "Maus rechts";
    return "-";
  }

  function updateMorseKeyDisplay() {
    const label = formatTrigger(state ? state.morseTrigger : pendingStartMorseTrigger);
    dom.morseKeyDisplay.textContent = label;
  }

  function updateStartMorseKeyDisplay() {
    dom.startMorseKeyDisplay.textContent = formatTrigger(pendingStartMorseTrigger);
  }

  function parseCoordString(input) {
    if (!input) return null;
    const cleaned = input.trim().toUpperCase().replace(/[^A-Z]/g, "");
    if (cleaned.length !== 2) return null;

    const row = ROW_LABELS.indexOf(cleaned[0]);
    const col = COL_LABELS.indexOf(cleaned[1]);

    if (row === -1 || col === -1) return null;
    return { row, col, text: cleaned };
  }

  function isValidRowLetter(letter) {
    return ROW_LABELS.includes(letter);
  }

  function isValidColLetter(letter) {
    return COL_LABELS.includes(letter);
  }

  function parseNatoText(raw) {
    if (!raw) return null;

    const normalized = raw
      .toLowerCase()
      .replace(/[.,;:!?/\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const words = normalized.split(" ").filter(Boolean);
    const letters = [];

    for (const word of words) {
      const mapped = NATO_MAP[word];
      if (!mapped) continue;

      if (letters.length === 0) {
        if (isValidRowLetter(mapped)) letters.push(mapped);
      } else if (letters.length === 1) {
        if (isValidColLetter(mapped)) letters.push(mapped);
      }

      if (letters.length === 2) break;
    }

    if (letters.length !== 2) return null;
    return parseCoordString(letters.join(""));
  }

  function makeHead(text) {
    const el = document.createElement("div");
    el.className = "head";
    el.textContent = text;
    return el;
  }

  function renderBoards() {
    updateBoardSize();
    renderBoard(dom.playerBoardGrid, state.playerBoard, true);
    renderBoard(dom.enemyBoardGrid, state.isOnline ? state.remoteBoardShots : state.enemyBoard, false);
  }

  function renderBoard(target, board, revealShips) {
    target.innerHTML = "";
    target.appendChild(makeHead(""));

    for (let c = 0; c < SIZE; c++) {
      target.appendChild(makeHead(COL_LABELS[c]));
    }

    for (let r = 0; r < SIZE; r++) {
      target.appendChild(makeHead(ROW_LABELS[r]));
      for (let c = 0; c < SIZE; c++) {
        const cell = board[r][c];
        const el = document.createElement("div");
        el.className = "cell";

        if (revealShips && cell.ship) {
          el.classList.add("ship");
        }
        if (cell.hit) {
          el.classList.add("hit");
          el.textContent = "X";
        } else if (cell.miss) {
          el.classList.add("miss");
          el.textContent = "•";
        }

        target.appendChild(el);
      }
    }
  }

  function canPlayerShootNow() {
    return state && !state.gameOver && !state.isBusy && state.myTurn;
  }

  function applyNewShot(board, ships, row, col) {
    const cell = board[row][col];

    if (cell.ship) {
      cell.hit = true;
      const ship = ships[cell.shipId];
      ship.hits += 1;
      if (ship.hits >= ship.len) ship.sunk = true;

      return {
        valid: true,
        repeated: false,
        hit: true,
        sunk: ship.sunk,
        allSunk: ships.every(s => s.sunk)
      };
    }

    cell.miss = true;
    return {
      valid: true,
      repeated: false,
      hit: false,
      sunk: false,
      allSunk: false
    };
  }

  function applyRepeatShot(board, row, col) {
    const cell = board[row][col];
    return {
      valid: true,
      repeated: true,
      hit: !!cell.hit,
      sunk: false,
      allSunk: false
    };
  }

  async function showEndOverlay(victory) {
    state.isBusy = true;
    await wait(END_OVERLAY_DELAY_MS);

    dom.endTitle.textContent = victory ? "Sieg!" : "Niederlage";
    dom.endText.textContent = victory
      ? "Du hast alle gegnerischen Schiffe versenkt."
      : "Deine Flotte wurde zerstört.";

    dom.victoryAnim.classList.toggle("hidden", !victory);
    dom.defeatAnim.classList.toggle("hidden", victory);

    if (victory) {
      await playVictorySound();
    } else {
      await playDefeatSound();
    }

    dom.endOverlay.classList.remove("hidden");
  }

  async function finishGame(victory) {
    state.gameOver = true;
    await showEndOverlay(victory);
  }

  async function resolvePlayerShotLocal(row, col) {
    const cell = state.enemyBoard[row][col];
    let result;

    if (cell.hit || cell.miss) {
      result = applyRepeatShot(state.enemyBoard, row, col);
    } else {
      result = applyNewShot(state.enemyBoard, state.enemyShips, row, col);
    }

    await playPlayerTurnSequence({
      valid: true,
      hit: result.hit,
      sunk: result.sunk
    });

    renderBoards();

    if (result.hit) {
      if (result.allSunk) {
        await finishGame(true);
        return;
      }

      state.myTurn = true;
      state.isBusy = false;
      await playReadySound();
    } else {
      state.myTurn = false;
      state.isBusy = false;
      window.setTimeout(pcTurn, 0);
    }
  }

  function choosePcShot() {
    while (state.pcTargetStack.length > 0) {
      const next = state.pcTargetStack.shift();
      const key = `${next.row},${next.col}`;
      if (!state.pcTriedShots.has(key)) return next;
    }

    let row, col, key;
    do {
      row = randomInt(SIZE);
      col = randomInt(SIZE);
      key = `${row},${col}`;
    } while (state.pcTriedShots.has(key));

    return { row, col };
  }

  function addPcTargets(row, col) {
    const candidates = [
      { row: row - 1, col },
      { row: row + 1, col },
      { row, col: col - 1 },
      { row, col: col + 1 }
    ];

    for (const item of candidates) {
      if (!inBounds(item.row, item.col)) continue;
      const key = `${item.row},${item.col}`;
      if (!state.pcTriedShots.has(key) && !state.pcTargetStack.some(x => x.row === item.row && x.col === item.col)) {
        state.pcTargetStack.push(item);
      }
    }
  }

  async function pcTurn() {
    if (state.gameOver || state.isBusy) return;

    state.isBusy = true;

    const shot = choosePcShot();
    const { row, col } = shot;
    state.pcTriedShots.add(`${row},${col}`);

    const result = applyNewShot(state.playerBoard, state.playerShips, row, col);

    await playEnemyTurnSequence({
      hit: result.hit,
      sunk: result.sunk
    });

    renderBoards();

    if (result.hit) {
      addPcTargets(row, col);
      if (result.sunk) {
        state.pcTargetStack = [];
      }

      if (result.allSunk) {
        await finishGame(false);
        return;
      }

      state.myTurn = false;
      state.isBusy = false;
      window.setTimeout(pcTurn, 0);
    } else {
      state.myTurn = true;
      state.isBusy = false;
      await playReadySound();
    }
  }

  function updateInputPanels() {
    dom.textInputPanel.classList.add("hidden");
    dom.natoInputPanel.classList.add("hidden");
    dom.morseInputPanel.classList.add("hidden");

    if (state.inputMode === "text") dom.textInputPanel.classList.remove("hidden");
    if (state.inputMode === "nato") dom.natoInputPanel.classList.remove("hidden");
    if (state.inputMode === "morse") dom.morseInputPanel.classList.remove("hidden");
  }

  async function fireByText() {
    const raw = dom.coordInput.value;
    dom.coordInput.value = "";
    await tryAutoFireFromString(raw);
  }

  function initSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      dom.speechRaw.textContent = "Spracherkennung wird in diesem Browser nicht unterstützt.";
      dom.btnStartNato.disabled = true;
      dom.btnStopNato.disabled = true;
      return;
    }

    speechRecognition = new SR();
    speechRecognition.lang = "de-CH";
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.maxAlternatives = 1;

    speechRecognition.onstart = () => {
      speechActive = true;
      dom.speechRaw.textContent = "Aufnahme läuft …";
      dom.speechCoord.textContent = "-";
    };

    speechRecognition.onresult = (event) => {
      let finalTranscript = "";
      let interim = "";

      for (let i = 0; i < event.results.length; i++) {
        const txt = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += " " + txt;
        else interim += " " + txt;
      }

      const full = (finalTranscript + " " + interim).trim();
      dom.speechRaw.textContent = full || "-";

      const parsed = parseNatoText(full);
      if (parsed) {
        dom.speechCoord.textContent = parsed.text;
        try {
          speechRecognition.stop();
        } catch (_) {}
      } else {
        dom.speechCoord.textContent = "-";
      }
    };

    speechRecognition.onerror = () => {};

    speechRecognition.onend = async () => {
      speechActive = false;
      const coord = dom.speechCoord.textContent;
      if (coord && coord !== "-") {
        await tryAutoFireFromString(coord);
      } else if (dom.speechRaw.textContent && dom.speechRaw.textContent !== "-") {
        state.isBusy = true;
        await playPlayerTurnSequence({ valid: false });
        state.isBusy = false;
      }
    };
  }

  function startNatoRecognition() {
    if (!speechRecognition || speechActive || state.isBusy) return;
    ensureAudioContext();
    try {
      dom.speechRaw.textContent = "-";
      dom.speechCoord.textContent = "-";
      speechRecognition.start();
    } catch (_) {}
  }

  function stopNatoRecognition() {
    if (!speechRecognition || !speechActive) return;
    speechRecognition.stop();
  }

  function clearMorseTimers() {
    if (morseLetterTimer) {
      clearTimeout(morseLetterTimer);
      morseLetterTimer = null;
    }
  }

  function updateMorseDisplay() {
    dom.morseCurrent.textContent = state?.morseCurrent || "-";
    dom.morseLetters.textContent = state?.morseLetters?.length ? state.morseLetters.join(" ") : "-";
    dom.morseCoord.textContent = state?.morseLetters?.length ? state.morseLetters.join("") : "-";
  }

  function resetMorseInput() {
    if (!state) return;
    clearMorseTimers();
    state.morseCurrent = "";
    state.morseLetters = [];
    updateMorseDisplay();
    stopMorseTone();
  }

  function scheduleMorseLetterCommit() {
    clearMorseTimers();
    morseLetterTimer = window.setTimeout(() => {
      commitCurrentMorseLetterFromPause();
    }, MORSE_LETTER_GAP_MS);
  }

  function registerMorseSymbol(durationMs) {
    if (!state || state.inputMode !== "morse" || state.gameOver || state.isBusy) return;
    const symbol = durationMs >= MORSE_LONG_PRESS_MS ? "-" : ".";
    state.morseCurrent += symbol;
    updateMorseDisplay();
    scheduleMorseLetterCommit();
  }

  async function commitCurrentMorseLetterFromPause() {
    if (!state.morseCurrent) return;

    const letter = MORSE_TO_LETTER[state.morseCurrent];
    state.morseCurrent = "";

    if (!letter) {
      updateMorseDisplay();
      state.isBusy = true;
      await playPlayerTurnSequence({ valid: false });
      state.isBusy = false;
      resetMorseInput();
      return;
    }

    const pos = state.morseLetters.length;

    if (pos === 0 && !isValidRowLetter(letter)) {
      updateMorseDisplay();
      state.isBusy = true;
      await playPlayerTurnSequence({ valid: false });
      state.isBusy = false;
      resetMorseInput();
      return;
    }

    if (pos === 1 && !isValidColLetter(letter)) {
      updateMorseDisplay();
      state.isBusy = true;
      await playPlayerTurnSequence({ valid: false });
      state.isBusy = false;
      resetMorseInput();
      return;
    }

    state.morseLetters.push(letter);
    updateMorseDisplay();

    if (state.morseLetters.length === 2) {
      const coord = state.morseLetters.join("");
      setTimeout(async () => {
        await tryAutoFireFromString(coord);
        resetMorseInput();
      }, 50);
    }
  }

  function activeElementIsTypingField() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
  }

  function triggerMatchesKeyboardEvent(trigger, e) {
    return trigger && trigger.type === "keyboard" && e.key === trigger.key;
  }

  function onGlobalKeyDown(e) {
    if (waitingForStartMorseKey) {
      e.preventDefault();
      pendingStartMorseTrigger = { type: "keyboard", key: e.key };
      waitingForStartMorseKey = false;
      updateStartMorseKeyDisplay();
      return;
    }

    if (!state || state.inputMode !== "morse" || state.gameOver || state.isBusy) return;
    if (activeElementIsTypingField()) return;

    if (triggerMatchesKeyboardEvent(state.morseTrigger, e) && morsePressStart === null) {
      e.preventDefault();
      clearMorseTimers();
      morsePressStart = performance.now();
      startMorseTone();
    }
  }

  function onGlobalKeyUp(e) {
    if (!state || state.inputMode !== "morse" || state.gameOver || state.isBusy) return;

    if (triggerMatchesKeyboardEvent(state.morseTrigger, e) && morsePressStart !== null) {
      e.preventDefault();
      const duration = performance.now() - morsePressStart;
      morsePressStart = null;
      stopMorseTone();
      registerMorseSymbol(duration);
    }
  }

  function onGlobalPointerDown(e) {
    if (waitingForStartMorseKey) {
      if (e.button === 0) {
        pendingStartMorseTrigger = { type: "mouse-left" };
        waitingForStartMorseKey = false;
        updateStartMorseKeyDisplay();
        return;
      }
      if (e.button === 2) {
        pendingStartMorseTrigger = { type: "mouse-right" };
        waitingForStartMorseKey = false;
        updateStartMorseKeyDisplay();
        return;
      }
    }

    if (!state || state.inputMode !== "morse" || state.gameOver || state.isBusy) return;

    if (state.morseTrigger.type === "mouse-left" && e.button === 0 && morsePressStart === null) {
      clearMorseTimers();
      morsePointerId = e.pointerId;
      morsePressStart = performance.now();
      startMorseTone();
    }

    if (state.morseTrigger.type === "mouse-right" && e.button === 2 && !morseRightMouseDown) {
      clearMorseTimers();
      morseRightMouseDown = true;
      morsePressStart = performance.now();
      startMorseTone();
    }
  }

  function onGlobalPointerUp(e) {
    if (!state || state.inputMode !== "morse" || state.gameOver || state.isBusy) return;

    if (state.morseTrigger.type === "mouse-left" && e.button === 0 && morsePressStart !== null && morsePointerId === e.pointerId) {
      const duration = performance.now() - morsePressStart;
      morsePressStart = null;
      morsePointerId = null;
      stopMorseTone();
      registerMorseSymbol(duration);
    }

    if (state.morseTrigger.type === "mouse-right" && e.button === 2 && morsePressStart !== null && morseRightMouseDown) {
      const duration = performance.now() - morsePressStart;
      morsePressStart = null;
      morseRightMouseDown = false;
      stopMorseTone();
      registerMorseSymbol(duration);
    }
  }

  function onContextMenu(e) {
    if (waitingForStartMorseKey || (state && state.inputMode === "morse" && state.morseTrigger.type === "mouse-right")) {
      e.preventDefault();
    }
  }

  async function createPeerConnection() {
    cleanupRTC();

    rtc.pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    rtc.pc.oniceconnectionstatechange = () => {
      if (!rtc.pc) return;
      if (rtc.pc.iceConnectionState === "connected" || rtc.pc.iceConnectionState === "completed") {
        rtc.connected = true;
        state.onlineConnected = true;
      }
    };

    rtc.pc.ondatachannel = (event) => {
      rtc.dc = event.channel;
      setupDataChannel();
    };
  }

  function setupDataChannel() {
    if (!rtc.dc) return;

    rtc.dc.onopen = () => {
      rtc.connected = true;
      state.onlineConnected = true;
    };

    rtc.dc.onclose = () => {
      rtc.connected = false;
      state.onlineConnected = false;
    };

    rtc.dc.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleOnlineMessage(msg);
      } catch (_) {}
    };
  }

  function sendOnlineMessage(msg) {
    if (!rtc.dc || rtc.dc.readyState !== "open") return;
    rtc.dc.send(JSON.stringify(msg));
  }

  async function onCreateOffer() {
    try {
      await createPeerConnection();
      rtc.role = "host";
      state.isHost = true;
      state.myTurn = true;

      rtc.dc = rtc.pc.createDataChannel("battleship");
      setupDataChannel();

      const offer = await rtc.pc.createOffer();
      await rtc.pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(rtc.pc);

      dom.offerBox.value = JSON.stringify(rtc.pc.localDescription);
    } catch (_) {
      state.isBusy = true;
      await playPlayerTurnSequence({ valid: false });
      state.isBusy = false;
    }
  }

  async function onCreateAnswer() {
    try {
      const raw = dom.offerInput.value.trim();
      if (!raw) {
        state.isBusy = true;
        await playPlayerTurnSequence({ valid: false });
        state.isBusy = false;
        return;
      }

      await createPeerConnection();
      rtc.role = "guest";
      state.isHost = false;
      state.myTurn = false;

      const offer = JSON.parse(raw);
      await rtc.pc.setRemoteDescription(offer);

      const answer = await rtc.pc.createAnswer();
      await rtc.pc.setLocalDescription(answer);
      await waitForIceGatheringComplete(rtc.pc);

      dom.answerBox.value = JSON.stringify(rtc.pc.localDescription);
    } catch (_) {
      state.isBusy = true;
      await playPlayerTurnSequence({ valid: false });
      state.isBusy = false;
    }
  }

  async function onAcceptAnswer() {
    try {
      const raw = dom.answerInput.value.trim();
      if (!raw) {
        state.isBusy = true;
        await playPlayerTurnSequence({ valid: false });
        state.isBusy = false;
        return;
      }

      const answer = JSON.parse(raw);
      await rtc.pc.setRemoteDescription(answer);
    } catch (_) {
      state.isBusy = true;
      await playPlayerTurnSequence({ valid: false });
      state.isBusy = false;
    }
  }

  function waitForIceGatheringComplete(pc) {
    return new Promise(resolve => {
      if (pc.iceGatheringState === "complete") {
        resolve();
        return;
      }
      function checkState() {
        if (pc.iceGatheringState === "complete") {
          pc.removeEventListener("icegatheringstatechange", checkState);
          resolve();
        }
      }
      pc.addEventListener("icegatheringstatechange", checkState);
    });
  }

  function cleanupRTC() {
    if (rtc.dc) {
      try { rtc.dc.close(); } catch (_) {}
    }
    if (rtc.pc) {
      try { rtc.pc.close(); } catch (_) {}
    }
    rtc.pc = null;
    rtc.dc = null;
    rtc.connected = false;
    rtc.role = null;
  }

  function handleOnlineMessage(msg) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "shot":
        receiveIncomingShot(msg.payload);
        break;
      case "shotResult":
        applyRemoteShotResult(msg.payload);
        break;
      case "gameOver":
        state.gameOver = true;
        break;
    }
  }

  async function receiveIncomingShot(payload) {
    if (state.gameOver || state.isBusy) return;

    state.isBusy = true;

    const { row, col } = payload;
    const cell = state.playerBoard[row][col];

    let result;
    if (cell.hit || cell.miss) {
      result = {
        valid: true,
        repeated: true,
        hit: !!cell.hit,
        sunk: false,
        allSunk: false
      };
    } else {
      result = applyNewShot(state.playerBoard, state.playerShips, row, col);
    }

    await playEnemyTurnSequence({
      hit: result.hit,
      sunk: result.sunk
    });

    renderBoards();

    sendOnlineMessage({
      type: "shotResult",
      payload: {
        row,
        col,
        valid: true,
        hit: result.hit,
        sunk: result.sunk,
        allSunk: result.allSunk
      }
    });

    if (result.allSunk) {
      await finishGame(false);
      return;
    }

    if (!result.hit) {
      state.myTurn = true;
      state.isBusy = false;
      await playReadySound();
    } else {
      state.myTurn = false;
      state.isBusy = false;
    }
  }

  async function applyRemoteShotResult(payload) {
    const { row, col, valid, hit, sunk, allSunk } = payload;

    if (!valid) {
      state.isBusy = true;
      await playPlayerTurnSequence({ valid: false });
      state.isBusy = false;
      return;
    }

    state.isBusy = true;

    const remoteCell = state.remoteBoardShots[row][col];
    if (hit) {
      remoteCell.hit = true;
    } else {
      remoteCell.miss = true;
    }

    await playPlayerTurnSequence({
      valid: true,
      hit,
      sunk
    });

    renderBoards();

    if (allSunk) {
      await finishGame(true);
      return;
    }

    if (hit) {
      state.myTurn = true;
      state.isBusy = false;
      await playReadySound();
    } else {
      state.myTurn = false;
      state.isBusy = false;
    }
  }

  function showStartPanels() {
    dom.startOnlinePanel.classList.toggle("hidden", dom.startGameMode.value !== "online");
    dom.startMorsePanel.classList.toggle("hidden", dom.startInputMode.value !== "morse");
  }

  function beginChooseStartMorseKey() {
    waitingForStartMorseKey = true;
  }

  function startGameFromOverlay() {
    const mode = dom.startGameMode.value;
    const inputMode = dom.startInputMode.value;

    if (inputMode === "morse" && !pendingStartMorseTrigger) return;

    ensureAudioContext();
    stopAllManagedSounds();
    audioQueue = Promise.resolve();

    resetState(mode, inputMode, pendingStartMorseTrigger);

    dom.startOverlay.classList.add("hidden");
    dom.endOverlay.classList.add("hidden");

    if (mode === "pc") {
      playReadySound();
    }

    if (inputMode === "text") {
      setTimeout(() => dom.coordInput.focus(), 60);
    }
  }

  function reopenStartOverlay() {
    stopNatoRecognition();
    cleanupRTC();
    resetMorseInput();
    stopAllManagedSounds();
    audioQueue = Promise.resolve();
    dom.endOverlay.classList.add("hidden");
    dom.startOverlay.classList.remove("hidden");
    showStartPanels();
  }

  async function tryAutoFireFromString(coordString) {
    const parsed = parseCoordString(coordString);

    if (!parsed) {
      state.isBusy = true;
      await playPlayerTurnSequence({ valid: false });
      state.isBusy = false;
      return;
    }

    if (!canPlayerShootNow()) {
      state.isBusy = true;
      await playPlayerTurnSequence({ valid: false });
      state.isBusy = false;
      return;
    }

    state.isBusy = true;

    if (state.isOnline) {
      if (!state.onlineConnected || !rtc.dc || rtc.dc.readyState !== "open") {
        await playPlayerTurnSequence({ valid: false });
        state.isBusy = false;
        return;
      }

      sendOnlineMessage({
        type: "shot",
        payload: { row: parsed.row, col: parsed.col, coordText: parsed.text }
      });

      state.isBusy = false;
      return;
    }

    await resolvePlayerShotLocal(parsed.row, parsed.col);
  }

  dom.startGameMode.addEventListener("change", showStartPanels);
  dom.startInputMode.addEventListener("change", showStartPanels);
  dom.btnChooseStartMorseKey.addEventListener("click", beginChooseStartMorseKey);
  dom.btnStartGame.addEventListener("click", startGameFromOverlay);
  dom.btnNewGame.addEventListener("click", reopenStartOverlay);

  dom.btnPlayAgain.addEventListener("click", () => {
    dom.endOverlay.classList.add("hidden");
    dom.startOverlay.classList.remove("hidden");
    showStartPanels();
  });

  dom.btnBackToMenu.addEventListener("click", () => {
    dom.endOverlay.classList.add("hidden");
    dom.startOverlay.classList.remove("hidden");
    showStartPanels();
  });

  dom.btnFireText.addEventListener("click", fireByText);
  dom.coordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") fireByText();
  });

  dom.btnStartNato.addEventListener("click", startNatoRecognition);
  dom.btnStopNato.addEventListener("click", stopNatoRecognition);

  dom.btnClearMorse.addEventListener("click", () => {
    resetMorseInput();
  });

  dom.btnCreateOffer.addEventListener("click", onCreateOffer);
  dom.btnCreateAnswer.addEventListener("click", onCreateAnswer);
  dom.btnAcceptAnswer.addEventListener("click", onAcceptAnswer);

  window.addEventListener("keydown", onGlobalKeyDown);
  window.addEventListener("keyup", onGlobalKeyUp);
  window.addEventListener("pointerdown", onGlobalPointerDown);
  window.addEventListener("pointerup", onGlobalPointerUp);
  window.addEventListener("contextmenu", onContextMenu);

  window.addEventListener("resize", () => {
    updateBoardSize();
    renderBoards();
  });

  window.addEventListener("load", () => {
    updateBoardSize();
    renderBoards();
  });

  initSpeechRecognition();
  updateStartMorseKeyDisplay();
  resetState("pc", "text", pendingStartMorseTrigger);
  showStartPanels();
})();
