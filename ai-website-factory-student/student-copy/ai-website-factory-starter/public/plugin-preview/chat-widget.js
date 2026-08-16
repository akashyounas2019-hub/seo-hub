/* global window, document, fetch, sessionStorage */
/**
 * GYL Bookings — public chat widget.
 *
 * Vanilla JS. Renders a floating launcher + a chat panel. Speaks to the WP
 * REST endpoint POST /wp-json/gyl-bookings/v1/chat which forwards (HMAC-signed)
 * to the platform's /api/public/chat/<siteSlug> endpoint.
 *
 * Voice mode (mic + speech synthesis) is opt-in and only enabled when the
 * browser supports the Web Speech API.
 *
 * Configuration via window.GYL_CHAT_CONFIG (set by PHP enqueue):
 *   {
 *     restUrl: "/wp-json/gyl-bookings/v1/chat",
 *     siteName: "Toronto Limo Booking",
 *     accent: "#0b5fff",
 *     greeting: "Hi! Need a ride? Tell me where and when."
 *   }
 */
(function () {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__gylChatWidgetLoaded) return;
  window.__gylChatWidgetLoaded = true;

  // ---- config ----
  var cfg = Object.assign(
    {
      restUrl: "/wp-json/gyl-bookings/v1/chat",
      siteName: "our team",
      accent: "#0b5fff",
      greeting: "Hi! Need a ride? Tell me your pickup, destination, and when, and I'll quote you.",
      placeholder: "Type a message…",
    },
    window.GYL_CHAT_CONFIG || {},
  );

  // ---- per-tab identifiers (sessionStorage = survives reloads, dies on tab close) ----
  function getOrCreateVisitorId() {
    var k = "gyl_chat_visitor_id";
    var v = sessionStorage.getItem(k);
    if (!v) {
      v = "v_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      sessionStorage.setItem(k, v);
    }
    return v;
  }
  function getSessionId() {
    return sessionStorage.getItem("gyl_chat_session_id") || null;
  }
  function setSessionId(id) {
    if (id) sessionStorage.setItem("gyl_chat_session_id", id);
  }

  // ---- DOM helpers ----
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else if (k === "style") node.setAttribute("style", attrs[k]);
        else if (k.indexOf("on") === 0 && typeof attrs[k] === "function") {
          node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else if (attrs[k] != null) {
          node.setAttribute(k, attrs[k]);
        }
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      if (typeof c === "string") node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    });
    return node;
  }

  // ---- Speech APIs (graceful degradation) ----
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var supportsRecognition = !!SpeechRecognition;
  var supportsSynthesis = "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";

  var recognition = null;
  var listening = false;
  var muted = false;

  function setupRecognition(onPartial, onFinal) {
    if (!supportsRecognition) return null;
    var r = new SpeechRecognition();
    r.continuous = false;
    r.interimResults = true;
    r.lang = (document.documentElement.lang || "en-US").trim();
    r.addEventListener("result", function (ev) {
      var partial = "";
      var final = "";
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var transcript = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) final += transcript;
        else partial += transcript;
      }
      if (partial && onPartial) onPartial(partial);
      if (final && onFinal) onFinal(final.trim());
    });
    r.addEventListener("end", function () {
      listening = false;
      updateMicButton();
    });
    r.addEventListener("error", function () {
      listening = false;
      updateMicButton();
    });
    return r;
  }

  function speak(text) {
    if (!supportsSynthesis || muted || !text) return;
    try {
      window.speechSynthesis.cancel();
      var u = new window.SpeechSynthesisUtterance(text);
      u.lang = (document.documentElement.lang || "en-US").trim();
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    } catch (e) {
      /* swallow */
    }
  }

  // ---- UI elements (built lazily) ----
  var launcher, panel, transcriptEl, inputEl, sendBtn, micBtn, muteBtn, listenIndicator;
  var open = false;
  var sending = false;

  function buildLauncher() {
    launcher = el(
      "button",
      {
        class: "gyl-chat-launcher",
        "aria-label": "Open chat",
        type: "button",
        onclick: togglePanel,
      },
      [
        el("span", { class: "gyl-chat-launcher-icon", "aria-hidden": "true" }, ["💬"]),
      ],
    );
    document.body.appendChild(launcher);
  }

  function buildPanel() {
    transcriptEl = el("div", { class: "gyl-chat-transcript", role: "log", "aria-live": "polite" }, []);

    inputEl = el("textarea", {
      class: "gyl-chat-input",
      placeholder: cfg.placeholder,
      rows: "1",
      "aria-label": "Message",
    });
    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitInput();
      }
    });

    sendBtn = el(
      "button",
      {
        class: "gyl-chat-send",
        type: "button",
        "aria-label": "Send",
        onclick: submitInput,
      },
      ["Send"],
    );

    micBtn = el(
      "button",
      {
        class: "gyl-chat-mic",
        type: "button",
        "aria-label": "Speak",
        onclick: toggleMic,
      },
      ["🎤"],
    );
    if (!supportsRecognition) micBtn.style.display = "none";

    muteBtn = el(
      "button",
      {
        class: "gyl-chat-mute",
        type: "button",
        "aria-label": "Mute voice replies",
        onclick: toggleMute,
      },
      ["🔊"],
    );
    if (!supportsSynthesis) muteBtn.style.display = "none";

    listenIndicator = el("span", { class: "gyl-chat-listening", "aria-hidden": "true" }, ["● listening"]);
    listenIndicator.style.display = "none";

    var inputRow = el("div", { class: "gyl-chat-input-row" }, [
      inputEl,
      micBtn,
      sendBtn,
    ]);

    var header = el("div", { class: "gyl-chat-header" }, [
      el("span", { class: "gyl-chat-title" }, [cfg.siteName]),
      el("div", { class: "gyl-chat-header-actions" }, [
        muteBtn,
        el(
          "button",
          {
            class: "gyl-chat-close",
            type: "button",
            "aria-label": "Close chat",
            onclick: togglePanel,
          },
          ["×"],
        ),
      ]),
    ]);

    panel = el("div", { class: "gyl-chat-panel", role: "dialog", "aria-label": "Booking chat" }, [
      header,
      transcriptEl,
      el("div", { class: "gyl-chat-status-row" }, [listenIndicator]),
      inputRow,
    ]);

    document.body.appendChild(panel);

    // Apply accent color via CSS var
    if (cfg.accent) {
      panel.style.setProperty("--gyl-accent", cfg.accent);
      launcher.style.setProperty("--gyl-accent", cfg.accent);
    }

    // Initial greeting (not persisted server-side until the user replies)
    if (cfg.greeting) addMessage("assistant", cfg.greeting);
  }

  function addMessage(role, text) {
    var row = el(
      "div",
      { class: "gyl-chat-msg gyl-chat-msg-" + role },
      [el("div", { class: "gyl-chat-bubble" }, [text])],
    );
    transcriptEl.appendChild(row);
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }

  function addTyping() {
    var row = el(
      "div",
      { class: "gyl-chat-msg gyl-chat-msg-assistant gyl-chat-typing" },
      [el("div", { class: "gyl-chat-bubble" }, ["…"])],
    );
    transcriptEl.appendChild(row);
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
    return row;
  }

  function togglePanel() {
    if (!panel) buildPanel();
    open = !open;
    panel.classList.toggle("gyl-chat-open", open);
    launcher.classList.toggle("gyl-chat-launcher-active", open);
    if (open) setTimeout(function () { inputEl && inputEl.focus(); }, 50);
  }

  function toggleMic() {
    if (!supportsRecognition) return;
    if (!recognition) {
      recognition = setupRecognition(
        function (partial) {
          // Stream partials into the input so the user can see what's being heard.
          inputEl.value = partial;
        },
        function (final) {
          inputEl.value = final;
          // Auto-submit final result
          submitInput();
        },
      );
    }
    if (listening) {
      try { recognition.stop(); } catch (e) {}
      listening = false;
    } else {
      try {
        recognition.start();
        listening = true;
      } catch (e) {
        // start() throws if already started or permission denied
        listening = false;
      }
    }
    updateMicButton();
  }

  function updateMicButton() {
    if (!micBtn) return;
    micBtn.classList.toggle("gyl-chat-mic-on", listening);
    if (listenIndicator) listenIndicator.style.display = listening ? "inline-block" : "none";
  }

  function toggleMute() {
    muted = !muted;
    if (muted && supportsSynthesis) window.speechSynthesis.cancel();
    muteBtn.textContent = muted ? "🔇" : "🔊";
    muteBtn.setAttribute("aria-label", muted ? "Unmute voice replies" : "Mute voice replies");
  }

  function submitInput() {
    var text = (inputEl.value || "").trim();
    if (!text || sending) return;
    inputEl.value = "";
    addMessage("user", text);
    sendMessage(text);
  }

  function sendMessage(text) {
    sending = true;
    sendBtn.disabled = true;
    var typingNode = addTyping();

    var payload = {
      visitor_id: getOrCreateVisitorId(),
      message: text,
      page_url: window.location.href,
      channel: listening ? "voice" : "chat",
    };
    var sid = getSessionId();
    if (sid) payload.session_id = sid;

    fetch(cfg.restUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        return r.json().then(function (j) { return { ok: r.ok, status: r.status, json: j }; });
      })
      .then(function (resp) {
        if (typingNode && typingNode.parentNode) typingNode.parentNode.removeChild(typingNode);
        if (!resp.ok) {
          addMessage(
            "assistant",
            "Sorry — something went wrong on our side. Please try again, or call us directly.",
          );
          return;
        }
        var j = resp.json || {};
        if (j.session_id) setSessionId(j.session_id);
        var reply = j.reply || "(no reply)";
        addMessage("assistant", reply);
        if (j.confirmation_code) {
          addMessage("assistant", "Confirmation code: " + j.confirmation_code);
        }
        if (supportsSynthesis && !muted) speak(reply);
      })
      .catch(function () {
        if (typingNode && typingNode.parentNode) typingNode.parentNode.removeChild(typingNode);
        addMessage(
          "assistant",
          "I couldn't reach the server. Check your connection and try again.",
        );
      })
      .then(function () {
        sending = false;
        sendBtn.disabled = false;
        inputEl.focus();
      });
  }

  // ---- boot ----
  function boot() {
    buildLauncher();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
