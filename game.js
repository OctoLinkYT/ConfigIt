/* ConfigIt game logic: random elements, health, timer, options, table state. */
(function () {
  "use strict";

  var MAX_HEALTH = 5;
  var STEP_MS = 10000;
  var TOTAL = ELEMENTS.length;

  function $(id) {
    return document.getElementById(id);
  }

  var dom = {
    ptable: $("ptable"),
    strip: $("configStrip"),
    modeTag: $("modeTag"),
    timerFill: $("timerFill"),
    timerNum: $("timerNum"),
    hearts: $("hearts"),
    progress: $("progress"),
    prompt: $("prompt"),
    options: $("options"),
    portrait: $("portrait"),
    pNum: $("pNum"),
    pSym: $("pSym"),
    pName: $("pName"),
    live: $("live"),
    overlay: $("overlay"),
    overlayTitle: $("overlayTitle"),
    overlayText: $("overlayText"),
    overlayBtn: $("overlayBtn"),
    openPdf: $("openPdf"),
    pdfOverlay: $("pdfOverlay"),
    pdfFrame: $("pdfFrame"),
    pdfClose: $("pdfClose"),
  };

  var cellsByZ = new Map();
  var byZ = {};
  ELEMENTS.forEach(function (el) {
    byZ[el.z] = el;
  });

  var state = {
    active: false,
    health: MAX_HEALTH,
    solved: 0,
    perfect: 0,
    current: null,
    steps: [],
    index: 0,
    shown: [],
    limit: 9000,
    locked: true,
    ending: false,
  };

  var queue = [];
  var timer = { raf: 0, endAt: 0, remaining: 0, running: false };

  /* ---------------- table ---------------- */

  function rowFor(el) {
    if (el.block === "f") return el.period === 6 ? 9 : 10;
    return el.period;
  }

  function colFor(el) {
    if (el.block === "f") return 3 + (el.z - (el.period === 6 ? 57 : 89));
    return el.group;
  }

  function seriesTag(label, period) {
    var li = document.createElement("li");
    li.className = "cell series";
    li.style.gridRow = String(period);
    li.style.gridColumn = "3";
    li.textContent = label;
    li.setAttribute("aria-hidden", "true");
    return li;
  }

  function buildTable() {
    dom.ptable.innerHTML = "";
    var frag = document.createDocumentFragment();

    var spacer = document.createElement("li");
    spacer.className = "spacer";
    spacer.setAttribute("aria-hidden", "true");
    spacer.style.gridRow = "8";
    spacer.style.gridColumn = "1 / -1";
    frag.appendChild(spacer);
    frag.appendChild(seriesTag("57\u201371", 6));
    frag.appendChild(seriesTag("89\u2013103", 7));

    ELEMENTS.forEach(function (el) {
      var li = document.createElement("li");
      li.className = "cell";
      li.dataset.block = el.block;
      li.dataset.label = el.name + ", " + el.sym + ", atomic number " + el.z;
      li.style.gridRow = String(rowFor(el));
      li.style.gridColumn = String(colFor(el));
      li.setAttribute("aria-label", li.dataset.label);

      var num = document.createElement("span");
      num.className = "num";
      num.textContent = el.z;
      var sym = document.createElement("span");
      sym.className = "sym";
      sym.textContent = el.sym;

      li.appendChild(num);
      li.appendChild(sym);
      cellsByZ.set(el.z, li);
      frag.appendChild(li);
    });

    dom.ptable.appendChild(frag);
  }

  function highlightCurrent(el) {
    cellsByZ.forEach(function (cell) {
      cell.classList.remove("is-current");
    });
    var cell = cellsByZ.get(el.z);
    if (cell) cell.classList.add("is-current");
  }

  /* ---------------- hearts / progress ---------------- */

  function renderHearts() {
    dom.hearts.innerHTML = "";
    for (var i = 0; i < MAX_HEALTH; i++) {
      var span = document.createElement("span");
      span.className = "heart" + (i < state.health ? "" : " is-empty");
      span.textContent = "\u2665";
      span.setAttribute("aria-hidden", "true");
      dom.hearts.appendChild(span);
    }
    dom.hearts.setAttribute(
      "aria-label",
      "Health: " + Math.max(0, state.health) + " of " + MAX_HEALTH + " hearts",
    );
  }

  function setAnger(value) {
    var v = Math.max(0, Math.min(1, value));
    dom.portrait.style.setProperty("--anger", v.toFixed(3));
    dom.portrait.classList.toggle("is-angry", v > 0.45);
  }

  function loseHeart() {
    state.health -= 1;
    renderHearts();
    dom.portrait.classList.remove("is-happy");
    dom.portrait.classList.add("is-hurt");
    setTimeout(function () {
      dom.portrait.classList.remove("is-hurt");
    }, 460);
  }

  /* ---------------- element portrait ---------------- */

  function updatePortrait(el) {
    dom.portrait.dataset.block = el.block;
    dom.pNum.textContent = el.z;
    dom.pSym.textContent = el.sym;
    dom.pName.textContent = el.name;
  }

  /* ---------------- timer ---------------- */

  function stopTimer() {
    timer.running = false;
    if (timer.raf) cancelAnimationFrame(timer.raf);
    timer.raf = 0;
    timer.remaining = 0;
  }

  function pauseTimer() {
    if (!timer.running) return;
    timer.remaining = Math.max(0, timer.endAt - performance.now());
    timer.running = false;
    if (timer.raf) cancelAnimationFrame(timer.raf);
    timer.raf = 0;
  }

  function resumeTimer() {
    if (!state.active || state.locked || state.ending) return;
    if (!dom.pdfOverlay.hidden) return;
    if (timer.remaining <= 0) return;
    timer.endAt = performance.now() + timer.remaining;
    timer.remaining = 0;
    timer.running = true;
    tickTimer();
  }

  function startTimer(ms) {
    stopTimer();
    setAnger(0);
    state.limit = ms;
    timer.remaining = ms;
    timer.endAt = performance.now() + ms;
    timer.running = !document.hidden && dom.pdfOverlay.hidden;
    dom.timerFill.style.transform = "scaleX(1)";
    dom.timerFill.classList.remove("is-low");
    dom.timerNum.style.color = "";
    dom.timerNum.textContent = (ms / 1000).toFixed(1) + "s";
    if (timer.running) tickTimer();
  }

  function tickTimer() {
    timer.raf = 0;
    if (!timer.running) return;
    var left = timer.endAt - performance.now();
    if (left < 0) left = 0;
    var frac = left / state.limit;
    dom.timerFill.style.transform = "scaleX(" + frac.toFixed(4) + ")";
    dom.timerNum.textContent = (left / 1000).toFixed(1) + "s";
    dom.timerFill.classList.toggle("is-low", frac < 0.3);
    dom.timerNum.style.color = frac < 0.3 ? "#fda4af" : "";
    setAnger((0.55 - frac) / 0.55);
    if (left <= 0) {
      timer.running = false;
      onTimeout();
      return;
    }
    timer.raf = requestAnimationFrame(tickTimer);
  }

  document.addEventListener("visibilitychange", function () {
    if (!state.active || state.ending) return;
    if (document.hidden) pauseTimer();
    else resumeTimer();
  });

  /* ---------------- configuration strip ---------------- */

  function makeChip(entry) {
    var chip = document.createElement("span");
    chip.className =
      "chip" +
      (entry.answer.type === "noble" ? " is-noble" : "") +
      (entry.revealed ? " is-revealed" : "");
    chip.innerHTML = answerHtml(entry.answer);
    return chip;
  }

  function renderStrip() {
    dom.strip.innerHTML = "";
    state.shown.forEach(function (entry) {
      dom.strip.appendChild(makeChip(entry));
    });
    if (state.index < state.steps.length && !state.ending) {
      var caret = document.createElement("span");
      caret.className = "caret";
      caret.setAttribute("aria-hidden", "true");
      dom.strip.appendChild(caret);
    }
  }

  /* ---------------- questions ---------------- */

  function renderOptions() {
    dom.options.innerHTML = "";
    if (!state.steps.length) return;
    var step = state.steps[state.index];
    if (!step) return;
    step.options.forEach(function (opt, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option";
      btn.innerHTML =
        '<span class="opt-key" aria-hidden="true">' +
        (i + 1) +
        "</span>" +
        opt.html;
      btn.setAttribute("aria-label", "Option " + (i + 1) + ": " + opt.aria);
      btn.addEventListener("click", function () {
        choose(i);
      });
      dom.options.appendChild(btn);
    });
  }

  function announce(text) {
    dom.live.textContent = "";
    setTimeout(function () {
      dom.live.textContent = text;
    }, 30);
  }

  function choose(index) {
    if (!state.active || state.locked) return;
    var step = state.steps[state.index];
    if (!step) return;
    var opt = step.options[index];
    if (!opt) return;

    var buttons = Array.prototype.slice.call(dom.options.children);

    if (opt.correct) {
      state.locked = true;
      stopTimer();
      buttons[index].classList.add("is-correct");
      state.shown.push({ answer: step.answer, revealed: false });
      state.index += 1;
      renderStrip();
      announce(answerText(step.answer) + ". Correct.");

      if (state.index >= state.steps.length) {
        dom.prompt.textContent = "Complete.";
        endElement(true);
      } else {
        dom.prompt.textContent = "What comes next?";
        setTimeout(function () {
          if (!state.active) return;
          state.locked = false;
          renderStrip();
          renderOptions();
          startTimer(STEP_MS);
        }, 170);
      }
      return;
    }

    state.locked = true;
    stopTimer();
    buttons[index].classList.add("is-wrong");
    buttons.forEach(function (btn, i) {
      if (step.options[i].correct) btn.classList.add("is-correct");
    });
    dom.prompt.textContent = "It was " + answerText(step.answer) + ".";
    announce("Incorrect. The answer was " + answerAria(step.answer) + ".");
    loseHeart();
    endElement(false);
  }

  function revealRest() {
    for (var i = state.index; i < state.steps.length; i++) {
      state.shown.push({ answer: state.steps[i].answer, revealed: true });
    }
    state.index = state.steps.length;
    renderStrip();
  }

  function onTimeout() {
    if (!state.active || state.locked) return;
    state.locked = true;
    setAnger(1);
    dom.timerFill.classList.add("is-low");
    dom.prompt.textContent = "Time's up.";
    announce("Time is up.");
    loseHeart();
    endElement(false);
  }

  /* ---------------- round flow ---------------- */

  function loadElement(el) {
    state.current = el;
    var built = buildSteps(el);
    state.steps = built.steps;
    state.index = 0;
    state.shown = [];
    state.ending = false;
    state.locked = !state.active;

    dom.modeTag.textContent = built.mode === "noble" ? "Noble gas" : "Standard";
    dom.modeTag.dataset.mode = built.mode;

    updatePortrait(el);
    highlightCurrent(el);
    renderStrip();
    renderOptions();

    if (!state.active) {
      dom.prompt.textContent = "Press Start.";
      dom.timerNum.textContent = "--";
      return;
    }

    dom.prompt.textContent =
      built.mode === "noble" ? "Which noble gas?" : "First subshell?";
    state.limit = STEP_MS;
    startTimer(STEP_MS);
  }

  function endElement(perfect) {
    if (state.ending) return;
    state.ending = true;
    state.locked = true;
    stopTimer();

    var el = state.current;
    state.solved += 1;
    if (perfect) state.perfect += 1;

    var cell = cellsByZ.get(el.z);
    if (cell) {
      cell.classList.remove("is-current");
      cell.classList.add(perfect ? "is-perfect" : "is-tried");
      cell.setAttribute(
        "aria-label",
        cell.dataset.label + ", " + (perfect ? "solved" : "studied"),
      );
    }
    dom.progress.textContent = state.solved + " / " + TOTAL;

    if (!perfect) revealRest();

    if (state.health <= 0) {
      setTimeout(gameOver, 1150);
      return;
    }

    setTimeout(
      function () {
        if (!state.active) return;
        state.ending = false;
        nextElement();
      },
      perfect ? 620 : 1650,
    );
  }

  function nextElement() {
    if (!queue.length) {
      win();
      return;
    }
    loadElement(byZ[queue.pop()]);
  }

  /* ---------------- overlays ---------------- */

  function showOverlay(title, text, buttonLabel, action) {
    dom.overlayTitle.textContent = title;
    dom.overlayText.textContent = text;
    dom.overlayBtn.textContent = buttonLabel;
    dom.overlayBtn.onclick = action;
    dom.overlay.hidden = false;
    dom.overlayBtn.focus();
  }

  function shuffledZ() {
    var list = ELEMENTS.map(function (el) {
      return el.z;
    });
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function startRun() {
    state.active = true;
    state.health = MAX_HEALTH;
    state.solved = 0;
    state.perfect = 0;
    state.ending = false;
    state.locked = false;
    queue = shuffledZ();

    cellsByZ.forEach(function (cell) {
      cell.classList.remove("is-perfect", "is-tried", "is-current");
      cell.setAttribute("aria-label", cell.dataset.label);
    });

    renderHearts();
    dom.progress.textContent = "0 / " + TOTAL;
    dom.overlay.hidden = true;
    stopTimer();
    nextElement();
  }

  function gameOver() {
    stopTimer();
    state.active = false;
    state.locked = true;
    showOverlay(
      "Out of hearts",
      "Collected " +
        state.solved +
        " of " +
        TOTAL +
        ", " +
        state.perfect +
        " flawless.",
      "Again",
      startRun,
    );
  }

  function win() {
    stopTimer();
    state.active = false;
    state.locked = true;
    showOverlay(
      "All 118",
      state.perfect + " flawless, " + state.health + " hearts left.",
      "Again",
      startRun,
    );
  }

  /* ---------------- input ---------------- */

  /* ---------------- configurations pdf ---------------- */

  var PDF_SRC = "ElectronConfigProj..pdf";

  function openPdf() {
    dom.pdfOverlay.hidden = false;
    dom.pdfFrame.src = PDF_SRC;
    pauseTimer();
    dom.pdfClose.focus();
  }

  function closePdf() {
    dom.pdfOverlay.hidden = true;
    dom.pdfFrame.src = "about:blank";
    resumeTimer();
    dom.openPdf.focus();
  }

  dom.openPdf.addEventListener("click", openPdf);
  dom.pdfClose.addEventListener("click", closePdf);
  dom.pdfOverlay.addEventListener("click", function (event) {
    if (event.target === dom.pdfOverlay) closePdf();
  });

  var tracking = false;

  function trackPointer(event) {
    var rect = dom.portrait.getBoundingClientRect();
    if (!rect.width) return;
    var nx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    var ny = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    nx = Math.max(-1, Math.min(1, nx));
    ny = Math.max(-1, Math.min(1, ny));
    /* offsets scale with the card so pupils never leave the eye on small cards */
    dom.portrait.style.setProperty(
      "--look-x",
      (nx * rect.width * 0.024).toFixed(1) + "px",
    );
    dom.portrait.style.setProperty(
      "--look-y",
      (ny * rect.height * 0.017).toFixed(1) + "px",
    );
    if (!tracking) {
      tracking = true;
      dom.portrait.classList.add("is-tracking");
    }
  }

  function stopTracking() {
    tracking = false;
    dom.portrait.classList.remove("is-tracking");
  }

  /* pupils only chase the pointer while it is over the element card */
  dom.portrait.addEventListener("pointermove", trackPointer, { passive: true });
  dom.portrait.addEventListener("pointerleave", stopTracking);
  dom.portrait.addEventListener("pointercancel", stopTracking);
  window.addEventListener("blur", stopTracking);

  var happyTimer = 0;

  /* easter egg: poke the element and it beams at you */
  dom.portrait.addEventListener("click", function () {
    dom.portrait.classList.remove("is-happy");
    void dom.portrait.offsetWidth;
    dom.portrait.classList.add("is-happy");
    clearTimeout(happyTimer);
    happyTimer = setTimeout(function () {
      dom.portrait.classList.remove("is-happy");
    }, 700);
  });

  document.addEventListener("keydown", function (event) {
    if (!dom.pdfOverlay.hidden) {
      if (event.key === "Escape") closePdf();
      return;
    }
    if (!state.active || state.locked) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    var n = parseInt(event.key, 10);
    if (!n || n < 1 || n > 4) return;
    var btn = dom.options.children[n - 1];
    if (btn) {
      event.preventDefault();
      btn.click();
    }
  });

  /* ---------------- boot ---------------- */

  buildTable();
  renderHearts();
  dom.progress.textContent = "0 / " + TOTAL;
  loadElement(ELEMENTS[Math.floor(Math.random() * TOTAL)]);
  showOverlay(
    "ConfigIt!",
    'Select from the four choices to configure each element! Be careful - if you mess up, you\'ll lose lives! (Click "Open Configurations" in the top-right to see my work for the project). To make this, I had to program a system that can automatically determine what the correct configuration for each element is! Furthermore, I had to spend like an hour adding cute googly eyes to elements that follow your mouse and get mad when you take too long to configure electrons! Lol.',
    "Start",
    startRun,
  );
})();
