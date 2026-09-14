

(() => {
  "use strict";

  /* ----------------------------- 1. State ----------------------------- */

  const state = {
    expression: "",       // raw text the user has typed / built
    cursor: 0,             // caret position within expression
    result: "0",           // last evaluated / live-preview result
    hasError: false,
    angleMode: "DEG",       // "DEG" | "RAD"
    memory: 0,
    memoryActive: false,
    ans: 0,
    history: [],            // {expr, result, time}
    theme: "dark",
    justEvaluated: false,   // true right after "=" so next digit starts fresh
  };

  const MAX_HISTORY = 100;

  /* ------------------------- 2. DOM references ------------------------- */

  const el = {
    calc: document.getElementById("calc"),
    expressionDisplay: document.getElementById("expressionDisplay"),
    expressionWrap: document.getElementById("expressionWrap"),
    resultDisplay: document.getElementById("resultDisplay"),
    memIndicator: document.getElementById("memIndicator"),
    angleIndicator: document.getElementById("angleIndicator"),
    errorIndicator: document.getElementById("errorIndicator"),
    angleModeBtn: document.getElementById("angleModeBtn"),
    themeToggleBtn: document.getElementById("themeToggleBtn"),
    historyToggleBtn: document.getElementById("historyToggleBtn"),
    historyPanel: document.getElementById("historyPanel"),
    historyList: document.getElementById("historyList"),
    historyEmpty: document.getElementById("historyEmpty"),
    clearHistoryBtn: document.getElementById("clearHistoryBtn"),
    liveRegion: document.getElementById("liveRegion"),
  };

  /* ==================================================================
     3. MATH ENGINE
     Recursive-descent-free approach: tokenize -> shunting-yard (postfix)
     -> evaluate postfix. Supports implicit multiplication, unary +/-,
     postfix factorial, functions, constants, nested parentheses.
     ================================================================== */

  const FUNCTIONS = new Set([
    "sin", "cos", "tan", "asin", "acos", "atan",
    "sinh", "cosh", "tanh",
    "ln", "log", "log2", "exp",
    "sqrt", "cbrt", "abs", "floor", "ceil", "round", "trunc",
    "root", // root(x, n) -> nth root, inserted by nth-root button
  ]);

  const CONSTANTS = {
    pi: Math.PI,
    e: Math.E,
    Infinity: Infinity,
  };

  class CalcError extends Error {}

  function tokenize(src) {
    const tokens = [];
    let i = 0;
    const n = src.length;

    while (i < n) {
      const c = src[i];

      if (/\s/.test(c)) { i++; continue; }

      // numbers (incl. decimals and scientific notation like 1.2e-3)
      if (/[0-9.]/.test(c)) {
        let j = i;
        let sawDot = false;
        let sawExp = false;
        while (j < n) {
          const cj = src[j];
          if (/[0-9]/.test(cj)) { j++; continue; }
          if (cj === "." && !sawDot) { sawDot = true; j++; continue; }
          if ((cj === "e" || cj === "E") && !sawExp && j > i) {
            // must be followed by digit or sign+digit to count as exponent
            const next = src[j + 1];
            if (/[0-9]/.test(next) || ((next === "+" || next === "-") && /[0-9]/.test(src[j + 2]))) {
              sawExp = true; j += (next === "+" || next === "-") ? 3 : 2; continue;
            }
          }
          break;
        }
        const numStr = src.slice(i, j);
        if (numStr === "." || numStr === "") throw new CalcError("Invalid number");
        tokens.push({ type: "num", value: parseFloat(numStr) });
        i = j;
        continue;
      }

      // identifiers: function names or constants
      if (/[a-zA-Z_]/.test(c)) {
        let j = i;
        while (j < n && /[a-zA-Z0-9_]/.test(src[j])) j++;
        const word = src.slice(i, j);
        if (word === "Ans") {
          tokens.push({ type: "num", value: state.ans });
        } else if (word === "mod") {
          tokens.push({ type: "op", value: "mod" });
        } else if (Object.prototype.hasOwnProperty.call(CONSTANTS, word)) {
          tokens.push({ type: "num", value: CONSTANTS[word] });
        } else if (FUNCTIONS.has(word)) {
          tokens.push({ type: "func", value: word });
        } else {
          throw new CalcError(`Unknown symbol "${word}"`);
        }
        i = j;
        continue;
      }

      if (c === "(") { tokens.push({ type: "lparen" }); i++; continue; }
      if (c === ")") { tokens.push({ type: "rparen" }); i++; continue; }
      if (c === ",") { tokens.push({ type: "comma" }); i++; continue; }
      if (c === "!") { tokens.push({ type: "postfix", value: "!" }); i++; continue; }
      if (c === "%") { tokens.push({ type: "postfix", value: "%" }); i++; continue; }

      if ("+-*/^".includes(c)) {
        tokens.push({ type: "op", value: c });
        i++;
        continue;
      }

      throw new CalcError(`Unexpected character "${c}"`);
    }

    return tokens;
  }

  // Insert implicit multiplication tokens and resolve unary +/- into distinct ops.
  function normalize(tokens) {
    const out = [];
    const isValueEnd = (t) => t && (t.type === "num" || t.type === "rparen" || t.type === "postfix");
    const isValueStart = (t) => t && (t.type === "num" || t.type === "lparen" || t.type === "func");

    for (let idx = 0; idx < tokens.length; idx++) {
      const t = tokens[idx];
      const prev = out[out.length - 1];

      if (t.type === "op" && (t.value === "+" || t.value === "-")) {
        const prevIsValue = isValueEnd(prev);
        if (!prevIsValue) {
          out.push({ type: "unary", value: t.value === "-" ? "u-" : "u+" });
          continue;
        }
      }

      // implicit multiplication: value-end followed by value-start
      if (isValueEnd(prev) && isValueStart(t)) {
        out.push({ type: "op", value: "*" });
      }

      out.push(t);
    }
    return out;
  }

  const PRECEDENCE = { "+": 1, "-": 1, "*": 2, "/": 2, "mod": 2, "u+": 3, "u-": 3, "^": 4 };
  const RIGHT_ASSOC = new Set(["^", "u+", "u-"]);

  function toRPN(tokens) {
    const output = [];
    const opStack = [];

    const popWhile = (cond) => {
      while (opStack.length && cond(opStack[opStack.length - 1])) {
        output.push(opStack.pop());
      }
    };

    for (const t of tokens) {
      if (t.type === "num") {
        output.push(t);
      } else if (t.type === "func") {
        opStack.push(t);
      } else if (t.type === "postfix") {
        output.push(t); // factorial applies immediately, precedence handled structurally
      } else if (t.type === "unary") {
        // Prefix operator: it has no left operand to compete for, so it never
        // triggers pops on push. It will be popped later by the operator (or
        // end-of-expression) that follows its single operand.
        opStack.push(t);
      } else if (t.type === "op") {
        const p1 = PRECEDENCE[t.value];
        popWhile((top) => {
          if (top.type !== "op" && top.type !== "unary") return false;
          const p2 = PRECEDENCE[top.value];
          return (RIGHT_ASSOC.has(t.value) ? p2 > p1 : p2 >= p1);
        });
        opStack.push(t);
      } else if (t.type === "comma") {
        popWhile((top) => top.type !== "lparen");
        if (!opStack.length) throw new CalcError("Misplaced comma");
      } else if (t.type === "lparen") {
        opStack.push(t);
      } else if (t.type === "rparen") {
        popWhile((top) => top.type !== "lparen");
        if (!opStack.length) throw new CalcError("Unmatched parenthesis");
        opStack.pop(); // discard lparen
        if (opStack.length && opStack[opStack.length - 1].type === "func") {
          output.push(opStack.pop());
        }
      }
    }

    popWhile(() => true);
    // if a lparen/rparen leaked into opStack it means mismatch
    if (output.some((t) => t.type === "lparen" || t.type === "rparen")) {
      throw new CalcError("Unmatched parenthesis");
    }
    return output;
  }

  function factorial(x) {
    if (x < 0 || !Number.isFinite(x)) throw new CalcError("Invalid factorial");
    if (Math.abs(x - Math.round(x)) > 1e-9) throw new CalcError("Factorial needs an integer");
    const r = Math.round(x);
    if (r > 170) return Infinity;
    let result = 1;
    for (let k = 2; k <= r; k++) result *= k;
    return result;
  }

  function toRadians(x) { return state.angleMode === "DEG" ? (x * Math.PI) / 180 : x; }
  function fromRadians(x) { return state.angleMode === "DEG" ? (x * 180) / Math.PI : x; }

  const UNARY_FN = {
    "u-": (a) => -a,
    "u+": (a) => a,
  };

  const BINARY_FN = {
    "+": (a, b) => a + b,
    "-": (a, b) => a - b,
    "*": (a, b) => a * b,
    "/": (a, b) => { if (b === 0) throw new CalcError("Division by zero"); return a / b; },
    "mod": (a, b) => { if (b === 0) throw new CalcError("Division by zero"); return a % b; },
    "^": (a, b) => Math.pow(a, b),
  };

  const FUNC_IMPL = {
    sin: (a) => Math.sin(toRadians(a)),
    cos: (a) => Math.cos(toRadians(a)),
    tan: (a) => {
      const r = toRadians(a);
      const c = Math.cos(r);
      if (Math.abs(c) < 1e-12) throw new CalcError("tan undefined here");
      return Math.tan(r);
    },
    asin: (a) => { if (a < -1 || a > 1) throw new CalcError("asin domain: [-1,1]"); return fromRadians(Math.asin(a)); },
    acos: (a) => { if (a < -1 || a > 1) throw new CalcError("acos domain: [-1,1]"); return fromRadians(Math.acos(a)); },
    atan: (a) => fromRadians(Math.atan(a)),
    sinh: Math.sinh,
    cosh: Math.cosh,
    tanh: Math.tanh,
    ln: (a) => { if (a <= 0) throw new CalcError("ln domain: x>0"); return Math.log(a); },
    log: (a) => { if (a <= 0) throw new CalcError("log domain: x>0"); return Math.log10(a); },
    log2: (a) => { if (a <= 0) throw new CalcError("log2 domain: x>0"); return Math.log2(a); },
    exp: Math.exp,
    sqrt: (a) => { if (a < 0) throw new CalcError("sqrt domain: x≥0"); return Math.sqrt(a); },
    cbrt: Math.cbrt,
    abs: Math.abs,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    trunc: Math.trunc,
    root: (a, b) => {
      if (b === 0) throw new CalcError("Root degree cannot be 0");
      if (a < 0 && b % 2 === 0) throw new CalcError("Even root of negative number");
      const sign = a < 0 ? -1 : 1;
      return sign * Math.pow(Math.abs(a), 1 / b);
    },
  };

  function evalRPN(rpn) {
    const stack = [];
    for (const t of rpn) {
      if (t.type === "num") {
        stack.push(t.value);
      } else if (t.type === "unary") {
        if (!stack.length) throw new CalcError("Invalid expression");
        stack.push(UNARY_FN[t.value](stack.pop()));
      } else if (t.type === "postfix") {
        if (!stack.length) throw new CalcError("Invalid expression");
        const v = stack.pop();
        stack.push(t.value === "!" ? factorial(v) : v / 100);
      } else if (t.type === "op") {
        if (stack.length < 2) throw new CalcError("Invalid expression");
        const b = stack.pop();
        const a = stack.pop();
        stack.push(BINARY_FN[t.value](a, b));
      } else if (t.type === "func") {
        const fn = FUNC_IMPL[t.value];
        if (t.value === "root") {
          if (stack.length < 2) throw new CalcError("root(x, n) needs two arguments");
          const b = stack.pop();
          const a = stack.pop();
          stack.push(fn(a, b));
        } else {
          if (!stack.length) throw new CalcError("Invalid expression");
          stack.push(fn(stack.pop()));
        }
      }
    }
    if (stack.length !== 1) throw new CalcError("Invalid expression");
    const result = stack[0];
    if (Number.isNaN(result)) throw new CalcError("Result is not a number");
    if (!Number.isFinite(result) && result !== Infinity && result !== -Infinity) {
      throw new CalcError("Overflow");
    }
    return result;
  }

  function evaluateExpression(raw) {
    const src = raw.trim();
    if (!src) throw new CalcError("Empty expression");
    // balance check for friendlier error before deep parse
    let depth = 0;
    for (const ch of src) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (depth < 0) throw new CalcError("Unmatched parenthesis");
    }
    if (depth !== 0) throw new CalcError("Unmatched parenthesis");

    const tokens = normalize(tokenize(src));
    const rpn = toRPN(tokens);
    return evalRPN(rpn);
  }

  /* ------------------------ 4. Display rendering ------------------------ */

  function formatNumber(x) {
    if (x === Infinity) return "Infinity";
    if (x === -Infinity) return "-Infinity";
    if (Number.isNaN(x)) return "Error";
    if (Object.is(x, -0)) x = 0;

    const abs = Math.abs(x);
    if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) {
      return x.toExponential(6).replace(/\.?0+e/, "e");
    }
    // trim floating point noise, keep up to 10 significant decimal places
    let s = x.toFixed(10);
    s = s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
    return s;
  }

  function render() {
    el.expressionDisplay.textContent = state.expression || "\u00A0";
    el.resultDisplay.textContent = state.hasError ? "Error" : state.result;
    el.resultDisplay.dataset.error = state.hasError ? "true" : "false";
    el.errorIndicator.dataset.active = state.hasError ? "true" : "false";
    el.errorIndicator.textContent = state.hasError ? "ERR" : "";
    el.memIndicator.dataset.active = state.memoryActive ? "true" : "false";
    el.angleIndicator.textContent = state.angleMode;
    el.angleModeBtn.textContent = state.angleMode;
    // auto-scroll expression to caret end
    el.expressionWrap.scrollLeft = el.expressionWrap.scrollWidth;
  }

  function livePreview() {
    if (!state.expression.trim()) {
      state.result = "0";
      state.hasError = false;
      render();
      return;
    }
    try {
      const val = evaluateExpression(state.expression);
      state.result = formatNumber(val);
      state.hasError = false;
    } catch (e) {
      // don't show an error while the user is mid-typing; keep last good result
      state.hasError = false;
    }
    render();
  }

  /* ------------------------- 5. Input handling ------------------------- */

  function insertText(text) {
    if (state.justEvaluated && /^[0-9.]$/.test(text)) {
      state.expression = "";
    }
    state.justEvaluated = false;
    state.expression += text;
    state.hasError = false;
    livePreview();
  }

  function insertFunction(name) {
    if (state.justEvaluated) { state.expression = ""; state.justEvaluated = false; }
    state.expression += `${name}(`;
    livePreview();
  }

  function wrapSelection(before, after) {
    if (state.justEvaluated) { state.expression = ""; state.justEvaluated = false; }
    state.expression = `${before}${state.expression}${after}`;
    livePreview();
  }

  function backspace() {
    state.justEvaluated = false;
    state.expression = state.expression.slice(0, -1);
    state.hasError = false;
    livePreview();
  }

  function clearEntry() {
    state.expression = "";
    state.hasError = false;
    livePreview();
  }

  function allClear() {
    state.expression = "";
    state.result = "0";
    state.hasError = false;
    state.justEvaluated = false;
    render();
  }

  function doEvaluate() {
    if (!state.expression.trim()) return;
    try {
      const val = evaluateExpression(state.expression);
      const formatted = formatNumber(val);
      addHistoryEntry(state.expression, formatted);
      state.ans = val;
      state.result = formatted;
      state.expression = formatted;
      state.hasError = false;
      state.justEvaluated = true;
    } catch (e) {
      state.hasError = true;
      state.result = e instanceof CalcError ? e.message : "Error";
      state.justEvaluated = false;
      announce(state.result);
    }
    render();
  }

  function applyUnaryAction(action) {
    // Wraps current expression (or result if just evaluated) in a function/operator
    const target = state.expression.trim() ? state.expression : state.result;
    switch (action) {
      case "square": wrapSelection("(", ")^2"); break;
      case "cube": wrapSelection("(", ")^3"); break;
      case "reciprocal": wrapSelection("1/(", ")"); break;
      case "abs": wrapSelection("abs(", ")"); break;
      case "factorial": wrapSelection("", "!"); break;
      case "pow10": wrapSelection("10^(", ")"); break;
      case "negate": wrapSelection("-(", ")"); break;
      case "floor": wrapSelection("floor(", ")"); break;
      case "ceil": wrapSelection("ceil(", ")"); break;
      case "nthroot": wrapSelection("root(", ",2)"); break;
      default: break;
    }
  }

  function handleAction(action) {
    switch (action) {
      case "all-clear": allClear(); break;
      case "clear-entry": clearEntry(); break;
      case "backspace": backspace(); break;
      case "evaluate": doEvaluate(); break;
      case "ans": insertText("Ans"); break;
      case "rand": insertText(formatNumber(Math.random())); break;
      case "memory-clear": state.memory = 0; state.memoryActive = false; render(); break;
      case "memory-recall": insertText(formatNumber(state.memory)); break;
      case "memory-store": {
        const v = safeCurrentValue();
        if (v !== null) { state.memory = v; state.memoryActive = true; }
        render();
        break;
      }
      case "memory-add": {
        const v = safeCurrentValue();
        if (v !== null) { state.memory += v; state.memoryActive = true; }
        render();
        break;
      }
      case "memory-subtract": {
        const v = safeCurrentValue();
        if (v !== null) { state.memory -= v; state.memoryActive = true; }
        render();
        break;
      }
      case "square": case "cube": case "reciprocal": case "abs":
      case "factorial": case "pow10": case "negate": case "floor":
      case "ceil": case "nthroot":
        applyUnaryAction(action);
        break;
      case "round-group": wrapSelection("round(", ")"); break;
      default: break;
    }
  }

  function safeCurrentValue() {
    try {
      const src = state.expression.trim() || state.result;
      return evaluateExpression(src);
    } catch {
      return null;
    }
  }

  function bindButtons() {
    document.querySelectorAll(".btn").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        spawnRipple(btn, ev);
        if (btn.dataset.num !== undefined) insertText(btn.dataset.num);
        else if (btn.dataset.insert !== undefined) insertText(btn.dataset.insert);
        else if (btn.dataset.op !== undefined) insertText(btn.dataset.op);
        else if (btn.dataset.insertFn !== undefined) insertFunction(btn.dataset.insertFn);
        else if (btn.dataset.const !== undefined) insertText(btn.dataset.const);
        else if (btn.dataset.action !== undefined) handleAction(btn.dataset.action);
      });
    });
  }

  function spawnRipple(btn, ev) {
    const circle = document.createElement("span");
    circle.className = "ripple";
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    circle.style.width = circle.style.height = `${size}px`;
    const x = (ev.clientX ?? rect.left + rect.width / 2) - rect.left - size / 2;
    const y = (ev.clientY ?? rect.top + rect.height / 2) - rect.top - size / 2;
    circle.style.left = `${x}px`;
    circle.style.top = `${y}px`;
    btn.appendChild(circle);
    circle.addEventListener("animationend", () => circle.remove());
  }

  /* ------------------------- Keyboard support ------------------------- */

  function handleKeydown(ev) {
    const { key, ctrlKey, metaKey } = ev;
    const mod = ctrlKey || metaKey;

    if (mod && key.toLowerCase() === "c") { copyResult(); return; }
    if (mod && key.toLowerCase() === "v") { return; } // allow native paste into expression via paste event
    if (mod && key.toLowerCase() === "x") { cutExpression(); ev.preventDefault(); return; }
    if (mod && key === "Backspace") { clearEntry(); ev.preventDefault(); return; }

    if (/^[0-9]$/.test(key)) { insertText(key); return; }
    if (key === ".") { insertText("."); return; }
    if ("+-*/%^()".includes(key)) { insertText(key); return; }
    if (key === "!") { insertText("!"); return; }

    switch (key) {
      case "Enter": case "=": ev.preventDefault(); doEvaluate(); break;
      case "Backspace": backspace(); break;
      case "Delete": clearEntry(); break;
      case "Escape": allClear(); break;
      default: break;
    }
  }

  function copyResult() {
    const text = state.hasError ? state.result : (state.result ?? "0");
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
    announce("Copied " + text);
  }

  function cutExpression() {
    if (navigator.clipboard) navigator.clipboard.writeText(state.expression).catch(() => {});
    state.expression = "";
    livePreview();
  }

  document.addEventListener("paste", (ev) => {
    const active = document.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
    const text = (ev.clipboardData || window.clipboardData).getData("text");
    if (!text) return;
    ev.preventDefault();
    insertText(text.replace(/[^0-9+\-*/^%().!a-zA-Z,]/g, ""));
  });

  function announce(msg) {
    el.liveRegion.textContent = msg;
  }

  /* ----------------------------- 6. Memory ----------------------------- */
  // (logic lives inside handleAction above; render() reflects memoryActive)

  /* ----------------------------- 7. History ----------------------------- */

  function loadHistory() {
    try {
      const raw = localStorage.getItem("praxis-history");
      state.history = raw ? JSON.parse(raw) : [];
    } catch {
      state.history = [];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem("praxis-history", JSON.stringify(state.history));
    } catch {
      /* storage unavailable — fail silently */
    }
  }

  function addHistoryEntry(expr, result) {
    state.history.unshift({ expr, result, time: Date.now() });
    if (state.history.length > MAX_HISTORY) state.history.length = MAX_HISTORY;
    saveHistory();
    renderHistory();
  }

  function renderHistory() {
    el.historyList.innerHTML = "";
    el.historyEmpty.dataset.hidden = state.history.length ? "true" : "false";

    state.history.forEach((entry, idx) => {
      const li = document.createElement("li");
      li.className = "history-item";
      li.tabIndex = 0;

      const row = document.createElement("div");
      row.className = "h-row";

      const time = document.createElement("span");
      time.className = "h-time";
      time.textContent = new Date(entry.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      const del = document.createElement("button");
      del.className = "h-delete";
      del.type = "button";
      del.setAttribute("aria-label", "Delete this history item");
      del.textContent = "✕";
      del.addEventListener("click", (ev) => {
        ev.stopPropagation();
        state.history.splice(idx, 1);
        saveHistory();
        renderHistory();
      });

      row.appendChild(time);
      row.appendChild(del);

      const exprEl = document.createElement("div");
      exprEl.className = "h-expr";
      exprEl.textContent = entry.expr;

      const resultEl = document.createElement("div");
      resultEl.className = "h-result";
      resultEl.textContent = "= " + entry.result;

      li.appendChild(row);
      li.appendChild(exprEl);
      li.appendChild(resultEl);

      li.addEventListener("click", () => {
        state.expression = entry.result;
        state.justEvaluated = true;
        livePreview();
      });

      el.historyList.appendChild(li);
    });
  }

  function clearHistory() {
    state.history = [];
    saveHistory();
    renderHistory();
  }

  function toggleHistoryPanel() {
    const open = el.historyPanel.dataset.open === "true";
    el.historyPanel.dataset.open = (!open).toString();
    el.historyPanel.setAttribute("aria-hidden", open.toString());
    el.historyToggleBtn.setAttribute("aria-expanded", (!open).toString());
  }

  /* ------------------------ 8. Theme / angle mode ------------------------ */

  function loadPrefs() {
    const theme = localStorage.getItem("praxis-theme") || "dark";
    setTheme(theme);
    const angle = localStorage.getItem("praxis-angle") || "DEG";
    state.angleMode = angle;
  }

  function setTheme(theme) {
    state.theme = theme;
    document.documentElement.dataset.theme = theme;
    el.themeToggleBtn.setAttribute("aria-checked", theme === "dark" ? "true" : "false");
    localStorage.setItem("praxis-theme", theme);
  }

  function toggleTheme() {
    setTheme(state.theme === "dark" ? "light" : "dark");
  }

  function toggleAngleMode() {
    state.angleMode = state.angleMode === "DEG" ? "RAD" : "DEG";
    localStorage.setItem("praxis-angle", state.angleMode);
    livePreview();
  }

  /* ------------------------------- 9. Init ------------------------------- */

  function init() {
    loadPrefs();
    loadHistory();
    renderHistory();
    bindButtons();
    render();

    document.addEventListener("keydown", handleKeydown);
    el.angleModeBtn.addEventListener("click", toggleAngleMode);
    el.themeToggleBtn.addEventListener("click", toggleTheme);
    el.historyToggleBtn.addEventListener("click", toggleHistoryPanel);
    el.clearHistoryBtn.addEventListener("click", clearHistory);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
