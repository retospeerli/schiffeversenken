/* =========================================================
   SCHIFFE VERSENKEN 13x13
   Zeilen: N-Z
   Spalten: A-M

   Eingabe nur über:
   - Tastatur
   - NATO-Spracheingabe
   - Morse per frei definierbaren Tasten

   Kein Anklicken des Spielfelds.
========================================================= */

(() => {
  const SIZE = 13;
  const COL_LABELS = "ABCDEFGHIJKLM".split("");
  const ROW_LABELS = "NOPQRSTUVWXYZ".split("");
  const ALLOWED_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const SHIP_LENGTHS = [6, 5, 4, 4, 3, 3, 2];

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
    playerBoard: document.getElementById("playerBoard"),
    enemyBoard: document.getElementById("enemyBoard"),
    statusText: document.getElementById("statusText"),
    turnText: document.getElementById("turnText"),
    lastInputText: document.getElementById("lastInputText"),

    gameMode: document.getElementById("gameMode"),
    inputMode: document.getElementById("inputMode"),
    btnNewGame: document.getElementById("btnNewGame"),

    textInputPanel: document.getElementById("textInputPanel"),
    natoInputPanel: document.getElementById("natoInputPanel"),
    morseInputPanel: document.getElementById("morseInputPanel"),

    coordInput: document.getElementById("coordInput"),
    btnFireText: document.getElementById("btnFireText"),

    btnStartNato: document.getElementById("btnStartNato"),
    btnStopNato: document.getElementById("btnStopNato"),
    speechRaw: document.getElementById("speechRaw"),
    speechCoord: document.getElementById("speechCoord"),

    btnClearMorse: document.getElementById("btnClearMorse"),
    btnCommitMorseLetter: document.getElementById("btnCommitMorseLetter"),
    btnResetMorseLetters: document.getElementById("btnResetMorseLetters"),
    btnFireMorse: document.getElementById("btnFireMorse"),

    btnSetDotKey: document.getElementById("btnSetDotKey"),
    btnSetDashKey: document.getElementById("btnSetDashKey"),
    dotKeyDisplay: document.getElementById("dotKeyDisplay"),
    dashKeyDisplay: document.getElementById("dashKeyDisplay"),

    morseCurrent: document.getElementById("morseCurrent"),
    morseLetters: document.getElementById("morseLetters"),
    morseCoord: document.getElementById("morseCoord"),

    onlinePanel: document.getElementById("onlinePanel"),
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

  let rtc = {
    pc: null,
    dc: null,
    connected: false,
    role: null
  };

  let waitingForKeyBind = null; // "dot" | "dash" | null

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
    for (const len of SHIP_LENGTHS) {
      placeShip(board, ships, len);
    }
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

  function resetState() {
    const player = createPlacedBoard();
    const enemy = createPlacedBoard();

    state = {
      mode: dom.gameMode.value,
      inputMode: dom.inputMode.value,
      isOnline: dom.gameMode.value === "online",
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
      morseDotKey: ".",
      morseDashKey: "-",

      pcTargetStack: [],
      pcTriedShots: new Set()
    };

    waitingForKeyBind = null;
    dom.dotKeyDisplay.textContent = formatKeyLabel(state.morseDotKey);
    dom.dashKeyDisplay.textContent = formatKeyLabel(state.morseDashKey);

    updateMorseDisplay();
    updateInputPanels();
    updateStatus("Neues Spiel gestartet.");
    updateTurnInfo();
    setLastInput("-");
    renderBoards();
  }

  function updateStatus(text) {
    dom.statusText.textContent = text;
  }

  function updateTurnInfo() {
    if (state.gameOver) {
      dom.turnText.textContent = "-";
    } else {
      dom.turnText.textContent = state.myTurn ? "Du" : "Gegner";
    }
  }

  function setLastInput(text) {
    dom.lastInputText.textContent = text;
  }

  function formatKeyLabel(key) {
    if (!key) return "-";
    if (key === " ") return "Leertaste";
    if (key === "Escape") return "Esc";
    return key;
  }

  function coordToString(row, col) {
    return `${ROW_LABELS[row]}${COL_LABELS[col]}`;
  }

  function parseCoordString(input) {
    if (!input) return null;
    const cleaned = input.trim().toUpperCase().replace(/[^A-Z]/g, "");
    if (cleaned.length !== 2) return null;

    const rowChar = cleaned[0];
    const colChar = cleaned[1];

    const row = ROW_LABELS.indexOf(rowChar);
    const col = COL_LABELS.indexOf(colChar);

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
      const mapped = NATO_MAP[word];
      if (mapped) {
        letters.push(mapped);
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
    renderBoard(dom.playerBoard, state.playerBoard, true);
    renderBoard(dom.enemyBoard, state.isOnline ? state.remoteBoardShots : state.enemyBoard, false);
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
        shipLen: ship.len,
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
      renderBoards();
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
      if (!state.pcTriedShots.has(key)) {
        if (!state.pcTargetStack.some(x => x.row === item.row && x.col === item.col)) {
          state.pcTargetStack.push(item);
        }
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

  /* =========================
     ONLINE / WEBRTC
  ========================= */

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

  /* =========================
     NATO-SPRACHE
  ========================= */

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
        if (event.results[i].isFinal) {
          finalTranscript += " " + txt;
        } else {
          interim += " " + txt;
        }
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
        setLastInput(parsed.text);
        handlePlayerShot(parsed.row, parsed.col, parsed.text);
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

  /* =========================
     MORSE
  ========================= */

  function updateMorseDisplay() {
    dom.morseCurrent.textContent = state.morseCurrent || "-";
    dom.morseLetters.textContent = state.morseLetters.length ? state.morseLetters.join(" ") : "-";
    dom.morseCoord.textContent = state.morseLetters.length === 2 ? state.morseLetters.join("") : "-";
  }

  function beginKeyBinding(which) {
    waitingForKeyBind = which;
    updateStatus(which === "dot"
      ? "Drücke jetzt die gewünschte Taste für Punkt."
      : "Drücke jetzt die gewünschte Taste für Strich.");
  }

  function handleGlobalKeydown(e) {
    const key = e.key;

    if (waitingForKeyBind) {
      e.preventDefault();

      if (waitingForKeyBind === "dot") {
        state.morseDotKey = key;
        dom.dotKeyDisplay.textContent = formatKeyLabel(key);
        updateStatus(`Taste für Punkt gesetzt: ${formatKeyLabel(key)}`);
      } else if (waitingForKeyBind === "dash") {
        state.morseDashKey = key;
        dom.dashKeyDisplay.textContent = formatKeyLabel(key);
        updateStatus(`Taste für Strich gesetzt: ${formatKeyLabel(key)}`);
      }

      waitingForKeyBind = null;
      return;
    }

    if (state.inputMode !== "morse") return;
    if (state.gameOver) return;

    const activeTag = document.activeElement ? document.activeElement.tagName : "";
    const isTypingInField =
      activeTag === "INPUT" || activeTag === "TEXTAREA" || document.activeElement?.isContentEditable;

    if (isTypingInField) return;

    if (key === state.morseDotKey) {
      e.preventDefault();
      state.morseCurrent += ".";
      updateMorseDisplay();
      return;
    }

    if (key === state.morseDashKey) {
      e.preventDefault();
      state.morseCurrent += "-";
      updateMorseDisplay();
      return;
    }

    if (key === "Enter") {
      e.preventDefault();
      commitMorseLetter();
      return;
    }

    if (key === "Backspace") {
      e.preventDefault();
      clearCurrentMorse();
      return;
    }
  }

  function clearCurrentMorse() {
    state.morseCurrent = "";
    updateMorseDisplay();
  }

  function commitMorseLetter() {
    const code = state.morseCurrent;
    if (!code) {
      updateStatus("Bitte zuerst Morsezeichen eingeben.");
      return;
    }

    const letter = MORSE_TO_LETTER[code];
    if (!letter) {
      updateStatus("Dieses Morsezeichen ist ungültig.");
      return;
    }

    if (!ALLOWED_LABELS.includes(letter)) {
      updateStatus("Ungültiger Buchstabe.");
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

  /* =========================
     UI / INPUT
  ========================= */

  function updateInputPanels() {
    state.inputMode = dom.inputMode.value;

    dom.textInputPanel.classList.add("hidden");
    dom.natoInputPanel.classList.add("hidden");
    dom.morseInputPanel.classList.add("hidden");

    if (state.inputMode === "text") dom.textInputPanel.classList.remove("hidden");
    if (state.inputMode === "nato") dom.natoInputPanel.classList.remove("hidden");
    if (state.inputMode === "morse") dom.morseInputPanel.classList.remove("hidden");

    dom.onlinePanel.classList.toggle("hidden", dom.gameMode.value !== "online");
  }

  function fireByText() {
    const parsed = parseCoordString(dom.coordInput.value);
    dom.coordInput.value = "";
    tryPlayerShotFromParsed(parsed);
  }

  /* =========================
     EVENTS
  ========================= */

  dom.btnNewGame.addEventListener("click", () => {
    stopNatoRecognition();
    cleanupRTC();
    resetState();
  });

  dom.gameMode.addEventListener("change", () => {
    stopNatoRecognition();
    cleanupRTC();
    resetState();
  });

  dom.inputMode.addEventListener("change", () => {
    updateInputPanels();
  });

  dom.btnFireText.addEventListener("click", fireByText);

  dom.coordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      fireByText();
    }
  });

  dom.btnStartNato.addEventListener("click", startNatoRecognition);
  dom.btnStopNato.addEventListener("click", stopNatoRecognition);

  dom.btnSetDotKey.addEventListener("click", () => beginKeyBinding("dot"));
  dom.btnSetDashKey.addEventListener("click", () => beginKeyBinding("dash"));
  dom.btnClearMorse.addEventListener("click", clearCurrentMorse);
  dom.btnCommitMorseLetter.addEventListener("click", commitMorseLetter);
  dom.btnResetMorseLetters.addEventListener("click", resetMorseLetters);
  dom.btnFireMorse.addEventListener("click", fireByMorse);

  dom.btnCreateOffer.addEventListener("click", onCreateOffer);
  dom.btnCreateAnswer.addEventListener("click", onCreateAnswer);
  dom.btnAcceptAnswer.addEventListener("click", onAcceptAnswer);

  window.addEventListener("keydown", handleGlobalKeydown);

  initSpeechRecognition();
  resetState();
})();
