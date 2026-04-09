(() => {
  const SIZE = 13;
  const COL_LABELS = "ABCDEFGHIJKLM".split("");
  const ROW_LABELS = "NOPQRSTUVWXYZ".split("");
  const SHIP_LENGTHS = [6, 5, 4, 4, 3, 3, 2];
  const MORSE_LONG_PRESS_MS = 260;

  const NATO_MAP = {
    alfa: "A", alpha: "A",
    bravo: "B",
    charlie: "C",
    delta: "D",
    echo: "E",
    foxtrot: "F",
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
    whiskey: "W", whisky: "W",
    xray: "X", "x-ray": "X",
    yankee: "Y",
    zulu: "Z"
  };

  const MORSE_TO_LETTER = {
    ".-": "A",
    "-...": "B",
    "-.-.": "C",
    "-..": "D",
    ".": "E",
    "..-.": "F",
    "--.": "G",
    "....": "H",
    "..": "I",
    ".---": "J",
    "-.-": "K",
    ".-..": "L",
    "--": "M",
    "-.": "N",
    "---": "O",
    ".--.": "P",
    "--.-": "Q",
    ".-.": "R",
    "...": "S",
    "-": "T",
    "..-": "U",
    "...-": "V",
    ".--": "W",
    "-..-": "X",
    "-.--": "Y",
    "--..": "Z"
  };

  const dom = {
    startOverlay: document.getElementById("startOverlay"),
    startGameMode: document.getElementById("startGameMode"),
    startInputMode: document.getElementById("startInputMode"),
    startOnlinePanel: document.getElementById("startOnlinePanel"),
    btnStartGame: document.getElementById("btnStartGame"),

    btnNewGame: document.getElementById("btnNewGame"),

    statusText: document.getElementById("statusText"),
    turnText: document.getElementById("turnText"),
    lastInputText: document.getElementById("lastInputText"),

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

    btnChooseMorseKey: document.getElementById("btnChooseMorseKey"),
    morseKeyDisplay: document.getElementById("morseKeyDisplay"),
    btnCommitMorseLetter: document.getElementById("btnCommitMorseLetter"),
    btnClearMorse: document.getElementById("btnClearMorse"),
    btnResetMorseLetters: document.getElementById("btnResetMorseLetters"),
    btnFireMorse: document.getElementById("btnFireMorse"),
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

  let state = null;
  let speechRecognition = null;
  let speechActive = false;
  let waitingForMorseKey = false;
  let morsePointerDownTime = null;
  let morseListeningPointerId = null;
  let morseRightMouseDown = false;

  let rtc = {
    pc: null,
    dc: null,
    connected: false,
    role: null
  };

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

  function createPlacedBoard() {
    const board = createEmptyBoard();
    const ships = [];
    for (const len of SHIP_LENGTHS) placeShip(board, ships, len);
    return { board, ships };
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

      ships.push({
        id: shipId,
        len,
        cells,
        hits: 0,
        sunk: false
      });

      placed = true;
    }
  }

  function resetState(mode = "pc", inputMode = "text") {
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

      playerBoard: player.board,
      playerShips: player.ships,

      enemyBoard: enemy.board,
      enemyShips: enemy.ships,

      remoteBoardShots: createEmptyBoard(),

      morseCurrent: "",
      morseLetters: [],
      morseTrigger: { type: "keyboard", key: " " },

      pcTargetStack: [],
      pcTriedShots: new Set()
    };

    waitingForMorseKey = false;
    morsePointerDownTime = null;
    morseListeningPointerId = null;
    morseRightMouseDown = false;

    updateMorseDisplay();
    updateMorseKeyDisplay();
    updateInputPanels();
    updateStatus("Neues Spiel gestartet.");
    updateTurnInfo();
    setLastInput("-");
    renderBoards();
  }

  function updateStatus(text) {
    dom.statusText.textContent = text;
  }

  function setLastInput(text) {
    dom.lastInputText.textContent = text;
  }

  function updateTurnInfo() {
    dom.turnText.textContent = state.gameOver ? "-" : (state.myTurn ? "Du" : "Gegner");
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
    dom.morseKeyDisplay.textContent = formatTrigger(state?.morseTrigger);
  }

  function coordToString(row, col) {
    return `${ROW_LABELS[row]}${COL_LABELS[col]}`;
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
      if (NATO_MAP[word]) letters.push(NATO_MAP[word]);
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
    renderBoard(dom.playerBoardGrid, state.playerBoard, true);
    renderBoard(dom.enemyBoardGrid, state.isOnline ? state.remoteBoardShots : state.enemyBoard, false);
  }

  function renderBoard(target, board, revealShips) {
    target.innerHTML = "";
    target.appendChild(makeHead(""));
    for (let c = 0; c < SIZE; c++) target.appendChild(makeHead(COL_LABELS[c]));

    for (let r = 0; r < SIZE; r++) {
      target.appendChild(makeHead(ROW_LABELS[r]));
      for (let c = 0; c < SIZE; c++) {
        const cell = board[r][c];
        const el = document.createElement("div");
        el.className = "cell";

        if (revealShips && cell.ship) el.classList.add("ship");
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

  function canPlayerShootAt(r, c) {
    if (!state || state.gameOver || !state.myTurn) return false;

    if (state.isOnline) {
      const cell = state.remoteBoardShots[r][c];
      return !cell.hit && !cell.miss && state.onlineConnected;
    }

    const cell = state.enemyBoard[r][c];
    return !cell.hit && !cell.miss;
  }

  function fireAtBoard(board, ships, row, col) {
    const cell = board[row][col];

    if (cell.hit || cell.miss) {
      return { valid: false, message: "Auf dieses Feld wurde bereits geschossen." };
    }

    if (cell.ship) {
      cell.hit = true;
      const ship = ships[cell.shipId];
      ship.hits += 1;
      if (ship.hits >= ship.len) ship.sunk = true;

      return {
        valid: true,
        hit: true,
        sunk: ship.sunk,
        allSunk: ships.every(s => s.sunk)
      };
    }

    cell.miss = true;
    return {
      valid: true,
      hit: false,
      sunk: false,
      allSunk: false
    };
  }

  function tryPlayerShotFromParsed(parsed) {
    if (!parsed) {
      updateStatus("Ungültige Koordinate. Erst Zeile N–Z, dann Spalte A–M.");
      return;
    }

    const { row, col, text } = parsed;
    setLastInput(text);

    if (!canPlayerShootAt(row, col)) {
      updateStatus(state.myTurn ? "Ungültiger Schuss oder Feld schon benutzt." : "Du bist nicht am Zug.");
      return;
    }

    handlePlayerShot(row, col, text);
  }

  function handlePlayerShot(row, col, coordText) {
    if (state.gameOver) return;

    if (state.isOnline) {
      sendOnlineShot(row, col, coordText);
      return;
    }

    const result = fireAtBoard(state.enemyBoard, state.enemyShips, row, col);

    if (!result.valid) {
      updateStatus(result.message);
      renderBoards();
      return;
    }

    if (result.hit) {
      updateStatus(result.sunk
        ? `Treffer! Schiff versenkt auf ${coordText}. Du darfst nochmals schiessen.`
        : `Treffer auf ${coordText}. Du darfst nochmals schiessen.`);
    } else {
      updateStatus(`Wasser auf ${coordText}. Jetzt ist der PC am Zug.`);
      state.myTurn = false;
    }

    renderBoards();

    if (result.allSunk) {
      state.gameOver = true;
      updateStatus("Du hast gewonnen!");
      updateTurnInfo();
      return;
    }

    updateTurnInfo();

    if (!state.myTurn && !state.gameOver) {
      window.setTimeout(pcTurn, 800);
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

  function pcTurn() {
    if (state.gameOver) return;

    const shot = choosePcShot();
    const { row, col } = shot;
    const coordText = coordToString(row, col);

    state.pcTriedShots.add(`${row},${col}`);
    const result = fireAtBoard(state.playerBoard, state.playerShips, row, col);

    if (!result.valid) {
      window.setTimeout(pcTurn, 200);
      return;
    }

    if (result.hit) {
      addPcTargets(row, col);
      if (result.sunk) {
        state.pcTargetStack = [];
        updateStatus(`PC trifft ${coordText} und versenkt ein Schiff. PC ist nochmals am Zug.`);
      } else {
        updateStatus(`PC trifft ${coordText}. PC ist nochmals am Zug.`);
      }
    } else {
      updateStatus(`PC schiesst auf ${coordText}: Wasser. Du bist am Zug.`);
      state.myTurn = true;
    }

    renderBoards();

    if (result.allSunk) {
      state.gameOver = true;
      updateStatus("Der PC hat gewonnen.");
      updateTurnInfo();
      return;
    }

    updateTurnInfo();

    if (!state.myTurn && !state.gameOver) {
      window.setTimeout(pcTurn, 900);
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

  function fireByText() {
    const parsed = parseCoordString(dom.coordInput.value);
    dom.coordInput.value = "";
    tryPlayerShotFromParsed(parsed);
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

    let finalTranscript = "";

    speechRecognition.onstart = () => {
      speechActive = true;
      finalTranscript = "";
      dom.speechRaw.textContent = "Aufnahme läuft …";
      dom.speechCoord.textContent = "-";
      updateStatus("NATO-Aufnahme läuft.");
    };

    speechRecognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const txt = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += " " + txt;
        else interim += " " + txt;
      }

      const full = (finalTranscript + " " + interim).trim();
      dom.speechRaw.textContent = full || "-";

      const parsed = parseNatoText(full);
      dom.speechCoord.textContent = parsed ? parsed.text : "-";
    };

    speechRecognition.onerror = (event) => {
      updateStatus(`Spracherkennung-Fehler: ${event.error}`);
    };

    speechRecognition.onend = () => {
      speechActive = false;
      const raw = dom.speechRaw.textContent;
      const parsed = parseNatoText(raw);

      if (parsed && state.myTurn && !state.gameOver) {
        handlePlayerShot(parsed.row, parsed.col, parsed.text);
        setLastInput(parsed.text);
      } else if (raw && raw !== "-" && !parsed) {
        updateStatus("Keine gültige NATO-Koordinate erkannt.");
      }
    };
  }

  function startNatoRecognition() {
    if (!speechRecognition || speechActive) return;
    try {
      dom.speechRaw.textContent = "-";
      dom.speechCoord.textContent = "-";
      speechRecognition.start();
    } catch (err) {
      console.error(err);
    }
  }

  function stopNatoRecognition() {
    if (!speechRecognition || !speechActive) return;
    speechRecognition.stop();
  }

  function updateMorseDisplay() {
    dom.morseCurrent.textContent = state?.morseCurrent || "-";
    dom.morseLetters.textContent = state?.morseLetters?.length ? state.morseLetters.join(" ") : "-";
    dom.morseCoord.textContent = state?.morseLetters?.length === 2 ? state.morseLetters.join("") : "-";
  }

  function beginChooseMorseKey() {
    waitingForMorseKey = true;
    updateStatus("Taste wählen: Drücke jetzt die gewünschte Taste oder Maus links / rechts.");
  }

  function registerMorseSymbolFromDuration(durationMs) {
    if (state.inputMode !== "morse" || state.gameOver) return;
    const symbol = durationMs >= MORSE_LONG_PRESS_MS ? "-" : ".";
    state.morseCurrent += symbol;
    updateMorseDisplay();
    updateStatus(symbol === "." ? "Punkt erkannt." : "Strich erkannt.");
  }

  function clearCurrentMorse() {
    state.morseCurrent = "";
    updateMorseDisplay();
  }

  function commitMorseLetter() {
    const code = state.morseCurrent;
    if (!code) {
      updateStatus("Bitte zuerst morsen.");
      return;
    }

    const letter = MORSE_TO_LETTER[code];
    if (!letter) {
      updateStatus("Dieses Morsezeichen ist ungültig.");
      return;
    }

    if (state.morseLetters.length >= 2) {
      updateStatus("Es sind bereits zwei Buchstaben gespeichert.");
      return;
    }

    const pos = state.morseLetters.length;

    if (pos === 0 && !ROW_LABELS.includes(letter)) {
      updateStatus("Der erste Buchstabe muss eine Zeile von N bis Z sein.");
      return;
    }

    if (pos === 1 && !COL_LABELS.includes(letter)) {
      updateStatus("Der zweite Buchstabe muss eine Spalte von A bis M sein.");
      return;
    }

    state.morseLetters.push(letter);
    state.morseCurrent = "";
    updateMorseDisplay();
    updateStatus(`Morse-Buchstabe erkannt: ${letter}`);
  }

  function resetMorseLetters() {
    state.morseCurrent = "";
    state.morseLetters = [];
    updateMorseDisplay();
  }

  function fireByMorse() {
    if (state.morseLetters.length !== 2) {
      updateStatus("Bitte genau zwei Morse-Buchstaben eingeben.");
      return;
    }

    const parsed = parseCoordString(state.morseLetters.join(""));
    if (!parsed) {
      updateStatus("Ungültige Morse-Koordinate.");
      return;
    }

    setLastInput(parsed.text);
    tryPlayerShotFromParsed(parsed);
    resetMorseLetters();
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
    if (waitingForMorseKey) {
      e.preventDefault();
      state.morseTrigger = { type: "keyboard", key: e.key };
      waitingForMorseKey = false;
      updateMorseKeyDisplay();
      updateStatus(`Morse-Taste gesetzt: ${formatTrigger(state.morseTrigger)}`);
      return;
    }

    if (!state || state.inputMode !== "morse" || state.gameOver) return;
    if (activeElementIsTypingField()) return;

    if (triggerMatchesKeyboardEvent(state.morseTrigger, e) && morsePointerDownTime === null) {
      e.preventDefault();
      morsePointerDownTime = performance.now();
      return;
    }

    if (e.key === "Enter" && state.morseTrigger?.type !== "keyboard") {
      // normale Zusatzfunktion nur wenn Enter nicht als Morse-Taste benutzt wird
    }

    if (e.key === "Backspace") {
      e.preventDefault();
      clearCurrentMorse();
    }
  }

  function onGlobalKeyUp(e) {
    if (!state || state.inputMode !== "morse" || state.gameOver) return;

    if (triggerMatchesKeyboardEvent(state.morseTrigger, e) && morsePointerDownTime !== null) {
      e.preventDefault();
      const duration = performance.now() - morsePointerDownTime;
      morsePointerDownTime = null;
      registerMorseSymbolFromDuration(duration);
    }
  }

  function onGlobalPointerDown(e) {
    if (!state) return;

    if (waitingForMorseKey) {
      if (e.button === 0) {
        state.morseTrigger = { type: "mouse-left" };
        waitingForMorseKey = false;
        updateMorseKeyDisplay();
        updateStatus("Morse-Taste gesetzt: Maus links");
        return;
      }
      if (e.button === 2) {
        state.morseTrigger = { type: "mouse-right" };
        waitingForMorseKey = false;
        updateMorseKeyDisplay();
        updateStatus("Morse-Taste gesetzt: Maus rechts");
        return;
      }
    }

    if (state.inputMode !== "morse" || state.gameOver) return;

    if (state.morseTrigger?.type === "mouse-left" && e.button === 0 && morsePointerDownTime === null) {
      morseListeningPointerId = e.pointerId;
      morsePointerDownTime = performance.now();
    }

    if (state.morseTrigger?.type === "mouse-right" && e.button === 2 && !morseRightMouseDown) {
      morseRightMouseDown = true;
      morsePointerDownTime = performance.now();
    }
  }

  function onGlobalPointerUp(e) {
    if (!state || state.inputMode !== "morse" || state.gameOver) return;

    if (state.morseTrigger?.type === "mouse-left" && e.button === 0 && morsePointerDownTime !== null) {
      if (morseListeningPointerId === e.pointerId) {
        const duration = performance.now() - morsePointerDownTime;
        morsePointerDownTime = null;
        morseListeningPointerId = null;
        registerMorseSymbolFromDuration(duration);
      }
    }

    if (state.morseTrigger?.type === "mouse-right" && e.button === 2 && morsePointerDownTime !== null && morseRightMouseDown) {
      const duration = performance.now() - morsePointerDownTime;
      morsePointerDownTime = null;
      morseRightMouseDown = false;
      registerMorseSymbolFromDuration(duration);
    }
  }

  function onContextMenu(e) {
    if (waitingForMorseKey || state?.morseTrigger?.type === "mouse-right") {
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
        updateStatus("Online-Verbindung hergestellt.");
        renderBoards();
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
      updateStatus("Online-Verbindung offen. Spiel kann beginnen.");
      renderBoards();
      updateTurnInfo();
      sendOnlineMessage({ type: "hello", payload: { info: "ready" } });
    };

    rtc.dc.onclose = () => {
      rtc.connected = false;
      state.onlineConnected = false;
      updateStatus("Online-Verbindung geschlossen.");
      renderBoards();
    };

    rtc.dc.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleOnlineMessage(msg);
      } catch (err) {
        console.error(err);
      }
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
      updateStatus("Angebot erstellt. Sende es an den Mitspieler.");
      updateTurnInfo();
    } catch (err) {
      console.error(err);
      updateStatus("Fehler beim Erstellen des Angebots.");
    }
  }

  async function onCreateAnswer() {
    try {
      const raw = dom.offerInput.value.trim();
      if (!raw) {
        updateStatus("Bitte zuerst ein Angebot einfügen.");
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
      updateStatus("Antwort erstellt. Sende sie an den Host.");
      updateTurnInfo();
    } catch (err) {
      console.error(err);
      updateStatus("Fehler beim Erstellen der Antwort.");
    }
  }

  async function onAcceptAnswer() {
    try {
      const raw = dom.answerInput.value.trim();
      if (!raw) {
        updateStatus("Bitte zuerst eine Antwort einfügen.");
        return;
      }

      const answer = JSON.parse(raw);
      await rtc.pc.setRemoteDescription(answer);
      updateStatus("Antwort übernommen. Warte auf Verbindung.");
    } catch (err) {
      console.error(err);
      updateStatus("Fehler beim Übernehmen der Antwort.");
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

  function sendOnlineShot(row, col, coordText) {
    if (!state.onlineConnected || !rtc.dc || rtc.dc.readyState !== "open") {
      updateStatus("Online-Verbindung fehlt.");
      return;
    }

    const cell = state.remoteBoardShots[row][col];
    if (cell.hit || cell.miss) {
      updateStatus("Auf dieses Feld wurde bereits geschossen.");
      return;
    }

    sendOnlineMessage({
      type: "shot",
      payload: { row, col, coordText }
    });

    updateStatus(`Schuss gesendet: ${coordText}. Warte auf Antwort.`);
  }

  function handleOnlineMessage(msg) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "hello":
        updateStatus("Mitspieler ist verbunden.");
        break;
      case "shot":
        receiveIncomingShot(msg.payload);
        break;
      case "shotResult":
        applyRemoteShotResult(msg.payload);
        break;
      case "gameOver":
        state.gameOver = true;
        updateStatus(msg.payload?.message || "Spiel beendet.");
        updateTurnInfo();
        renderBoards();
        break;
    }
  }

  function receiveIncomingShot(payload) {
    if (state.gameOver) return;

    const { row, col, coordText } = payload;
    const result = fireAtBoard(state.playerBoard, state.playerShips, row, col);

    renderBoards();

    if (!result.valid) {
      sendOnlineMessage({
        type: "shotResult",
        payload: {
          row, col, coordText,
          valid: false,
          message: "Ungültiger Schuss."
        }
      });
      return;
    }

    if (result.hit) {
      updateStatus(`Gegner trifft ${coordText}. Gegner darf nochmals schiessen.`);
    } else {
      updateStatus(`Gegner schiesst ${coordText}: Wasser. Du bist am Zug.`);
      state.myTurn = true;
    }

    updateTurnInfo();

    sendOnlineMessage({
      type: "shotResult",
      payload: {
        row, col, coordText,
        valid: true,
        hit: result.hit,
        sunk: result.sunk,
        allSunk: result.allSunk
      }
    });

    if (result.allSunk) {
      state.gameOver = true;
      updateStatus("Du hast verloren.");
      updateTurnInfo();
      sendOnlineMessage({
        type: "gameOver",
        payload: { message: "Du hast gewonnen." }
      });
    }
  }

  function applyRemoteShotResult(payload) {
    const { row, col, coordText, valid, hit, sunk, allSunk, message } = payload;

    if (!valid) {
      updateStatus(message || "Ungültiger Schuss.");
      return;
    }

    if (hit) {
      state.remoteBoardShots[row][col].hit = true;
      updateStatus(sunk
        ? `Treffer! Schiff versenkt auf ${coordText}. Du darfst nochmals schiessen.`
        : `Treffer auf ${coordText}. Du darfst nochmals schiessen.`);
      state.myTurn = true;
    } else {
      state.remoteBoardShots[row][col].miss = true;
      updateStatus(`Wasser auf ${coordText}. Jetzt ist der Gegner am Zug.`);
      state.myTurn = false;
    }

    if (allSunk) {
      state.gameOver = true;
      updateStatus("Du hast gewonnen!");
    }

    renderBoards();
    updateTurnInfo();
  }

  function showStartOnlinePanel() {
    dom.startOnlinePanel.classList.toggle("hidden", dom.startGameMode.value !== "online");
  }

  function startGameFromOverlay() {
    const mode = dom.startGameMode.value;
    const inputMode = dom.startInputMode.value;
    resetState(mode, inputMode);
    dom.startOverlay.classList.add("hidden");

    if (inputMode === "text") {
      setTimeout(() => dom.coordInput.focus(), 50);
    }
  }

  function reopenStartOverlay() {
    stopNatoRecognition();
    cleanupRTC();
    dom.startOverlay.classList.remove("hidden");
    showStartOnlinePanel();
  }

  dom.startGameMode.addEventListener("change", showStartOnlinePanel);
  dom.btnStartGame.addEventListener("click", startGameFromOverlay);
  dom.btnNewGame.addEventListener("click", reopenStartOverlay);

  dom.btnFireText.addEventListener("click", fireByText);
  dom.coordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") fireByText();
  });

  dom.btnStartNato.addEventListener("click", startNatoRecognition);
  dom.btnStopNato.addEventListener("click", stopNatoRecognition);

  dom.btnChooseMorseKey.addEventListener("click", beginChooseMorseKey);
  dom.btnCommitMorseLetter.addEventListener("click", commitMorseLetter);
  dom.btnClearMorse.addEventListener("click", clearCurrentMorse);
  dom.btnResetMorseLetters.addEventListener("click", resetMorseLetters);
  dom.btnFireMorse.addEventListener("click", fireByMorse);

  dom.btnCreateOffer.addEventListener("click", onCreateOffer);
  dom.btnCreateAnswer.addEventListener("click", onCreateAnswer);
  dom.btnAcceptAnswer.addEventListener("click", onAcceptAnswer);

  window.addEventListener("keydown", onGlobalKeyDown);
  window.addEventListener("keyup", onGlobalKeyUp);
  window.addEventListener("pointerdown", onGlobalPointerDown);
  window.addEventListener("pointerup", onGlobalPointerUp);
  window.addEventListener("contextmenu", onContextMenu);

  initSpeechRecognition();
  resetState("pc", "text");
  showStartOnlinePanel();
})();
