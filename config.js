/* ConfigIt: painfully reverse-engineered how to auto configure elements via code. Used some other code, that's why that "aufbau" thing is there But I do it the way the notes do it, don't worry! */
"use strict";

var CAPACITY = { s: 2, p: 6, d: 10, f: 14 };

/* Filling order: 1s 2s 2p 3s 3p 4s 3d 4p 5s 4d 5p 6s 4f 5d 6p 7s 5f 6d 7p */
var AUFBAU = [
  ["1s", 2],
  ["2s", 2],
  ["2p", 6],
  ["3s", 2],
  ["3p", 6],
  ["4s", 2],
  ["3d", 10],
  ["4p", 6],
  ["5s", 2],
  ["4d", 10],
  ["5p", 6],
  ["6s", 2],
  ["4f", 14],
  ["5d", 10],
  ["6p", 6],
  ["7s", 2],
  ["5f", 14],
  ["6d", 10],
  ["7p", 6],
];

var NOBLE_GASES = [
  { z: 2, sym: "He" },
  { z: 10, sym: "Ne" },
  { z: 18, sym: "Ar" },
  { z: 36, sym: "Kr" },
  { z: 54, sym: "Xe" },
  { z: 86, sym: "Rn" },
];

/* Every subshell of an element, in filling order. */
function configuredSubshells(z) {
  var left = z;
  var out = [];
  for (var i = 0; i < AUFBAU.length && left > 0; i++) {
    var sub = AUFBAU[i][0];
    var count = Math.min(AUFBAU[i][1], left);
    out.push({ sub: sub, count: count });
    left -= count;
  }
  return out;
}

/* The noble gas that comes BEFORE the element. */
function nobleGasBefore(z) {
  var found = null;
  for (var i = 0; i < NOBLE_GASES.length; i++) {
    if (NOBLE_GASES[i].z < z) found = NOBLE_GASES[i];
  }
  return found;
}

function shuffleInPlace(list) {
  for (var i = list.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

function answerHtml(answer) {
  if (answer.type === "noble") {
    return (
      '<span class="bracket">[</span>' +
      answer.sym +
      '<span class="bracket">]</span>'
    );
  }
  return answer.sub + "<sup>" + answer.count + "</sup>";
}

function answerText(answer) {
  if (answer.type === "noble") return "[" + answer.sym + "]";
  return answer.sub + answer.count;
}

function answerAria(answer) {
  if (answer.type === "noble") return "bracket " + answer.sym;
  return answer.sub.charAt(0) + " " + answer.sub.charAt(1) + " " + answer.count;
}

function decorate(option) {
  option.html = answerHtml(option.answer);
  option.text = answerText(option.answer);
  option.aria = answerAria(option.answer);
  return option;
}

/* Three believable wrong atoms for the next chunk. */
function subshellOptions(chunk) {
  var letter = chunk.sub.slice(-1);
  var n = Number(chunk.sub.slice(0, -1));
  var cap = CAPACITY[letter];
  var pool = [];

  /* same subshell, wrong electron count */
  for (var c = 1; c <= cap; c++) {
    if (c !== chunk.count) pool.push({ sub: chunk.sub, count: c });
  }
  /* same shell, wrong subshell at full capacity */
  var letters = ["s", "p", "d", "f"];
  for (var i = 0; i < letters.length; i++) {
    var l = letters[i];
    if (l === letter) continue;
    var key = n + l;
    var exists = false;
    for (var k = 0; k < AUFBAU.length; k++)
      if (AUFBAU[k][0] === key) exists = true;
    if (exists) pool.push({ sub: key, count: CAPACITY[l] });
  }

  /* nearby subshells, so short atoms still fill four buttons */
  var here = -1;
  for (var h = 0; h < AUFBAU.length; h++)
    if (AUFBAU[h][0] === chunk.sub) here = h;
  var nearby = AUFBAU.map(function (entry, index) {
    return { sub: entry[0], index: index };
  })
    .filter(function (entry) {
      return entry.sub !== chunk.sub;
    })
    .sort(function (a, b) {
      return Math.abs(a.index - here) - Math.abs(b.index - here);
    });
  for (var q = 0; q < nearby.length; q++) {
    var extra = nearby[q].sub;
    var seen = false;
    for (var s = 0; s < pool.length; s++)
      if (pool[s].sub === extra) seen = true;
    if (!seen) pool.push({ sub: extra, count: CAPACITY[extra.slice(-1)] });
  }

  shuffleInPlace(pool);
  var picks = [];
  var sameSub = 0;
  for (var p = 0; p < pool.length && picks.length < 3; p++) {
    var cand = pool[p];
    if (cand.sub === chunk.sub) {
      if (sameSub >= 2) continue;
      sameSub++;
    }
    picks.push(cand);
  }

  var options = picks.map(function (pick) {
    return decorate({
      answer: { type: "sub", sub: pick.sub, count: pick.count },
      correct: false,
    });
  });
  options.push(
    decorate({
      answer: { type: "sub", sub: chunk.sub, count: chunk.count },
      correct: true,
    }),
  );
  return shuffleInPlace(options);
}

/* Four noble gases: the right one plus the three nearest in size. */
function nobleOptions(element, correctSym) {
  var others = NOBLE_GASES.filter(function (g) {
    return g.sym !== correctSym;
  });
  others.sort(function (a, b) {
    return Math.abs(a.z - element.z) - Math.abs(b.z - element.z);
  });
  var options = [
    decorate({
      answer: { type: "noble", sym: correctSym },
      correct: true,
    }),
  ];
  for (var i = 0; i < 3 && i < others.length; i++) {
    options.push(
      decorate({
        answer: { type: "noble", sym: others[i].sym },
        correct: false,
      }),
    );
  }
  return shuffleInPlace(options);
}

/* Build the question list for one element.
   mode is 'noble', 'standard' or undefined (random). */
function buildSteps(element, mode) {
  var full = configuredSubshells(element.z);
  var noble = nobleGasBefore(element.z);
  var useNoble =
    mode === "noble"
      ? !!noble
      : mode === "standard"
        ? false
        : !!noble && Math.random() < 0.55;

  var body = full;
  var steps = [];

  if (useNoble) {
    var baseLength = configuredSubshells(noble.z).length;
    body = full.slice(baseLength);
    steps.push({
      answer: { type: "noble", sym: noble.sym },
      options: nobleOptions(element, noble.sym),
    });
  }

  for (var i = 0; i < body.length; i++) {
    steps.push({
      answer: { type: "sub", sub: body[i].sub, count: body[i].count },
      options: subshellOptions(body[i]),
    });
  }

  return { mode: useNoble ? "noble" : "standard", steps: steps };
}
