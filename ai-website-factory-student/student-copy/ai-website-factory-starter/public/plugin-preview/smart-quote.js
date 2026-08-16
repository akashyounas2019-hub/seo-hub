/* gyl-bookings: smart-quote bar (v2 — single-screen flow)
 *
 * Goal: customer completes a quote in under 30 seconds.
 *
 * Flow:
 *   1. INITIAL — only the natural-language input is visible.
 *   2. PARSED  — AI fills what it can. We show a chip-row of what we got +
 *                ONLY the still-missing required fields (never the whole form).
 *   3. READY   — required fields all satisfied → big "Get my quote" button.
 *   4. EDIT    — power users can expand to the full form via "Edit all details".
 *
 * Mic input via Web Speech API (Chromium/Safari/Edge). Falls back to typing.
 *
 * No build step. Vanilla ES5 fetch + then-chain (no async/await for
 * compatibility with older WP themes that ship Babel transforms).
 */
(function () {
  "use strict";

  var REQUIRED_QUOTE = ["pickup_location", "dropoff_location", "pickup_at"];
  // Phone is needed for the platform to reach the customer about pricing —
  // we always ask for it, but it's nice-to-have for a quote (vs hard-required
  // for a reservation).
  var ALWAYS_ASK = ["customer_phone"];

  function init() {
    var form = document.getElementById("gyl-smart-quote-form");
    if (!form) return;

    var smartInput = form.querySelector("#gyl-smart-text");
    var parseBtn = form.querySelector("[data-gyl-parse]");
    var micBtn = form.querySelector("[data-gyl-mic]");
    var statusEl = form.querySelector("[data-gyl-smart-status]");

    var summaryCard = form.querySelector("[data-gyl-summary-card]");
    var summaryChips = form.querySelector("[data-gyl-summary-chips]");
    var summaryHeadline = form.querySelector("[data-gyl-summary-headline]");

    var missingCard = form.querySelector("[data-gyl-missing-card]");
    var missingGrid = form.querySelector("[data-gyl-missing-grid]");
    var missingTitle = form.querySelector("[data-gyl-missing-title]");

    var finalRow = form.querySelector("[data-gyl-final-row]");
    var ctaLabel = form.querySelector("[data-gyl-final-cta-label]");
    var fullForm = form.querySelector("[data-gyl-full-form]");
    var editAllBtn = form.querySelector("[data-gyl-edit-all]");
    var collapseBtn = form.querySelector("[data-gyl-collapse]");
    var submitBtn = form.querySelector("[data-gyl-submit]");
    var tilesEl = form.querySelector("[data-gyl-tiles]");

    if (!smartInput || !parseBtn) return;

    // ========= Helpers =========
    function resolveParseUrl() {
      return window.GYL_PARSE_URL || "/wp-json/gyl-bookings/v1/parse-quote";
    }
    function resolveEstimateUrl() {
      return window.GYL_ESTIMATE_URL || "/wp-json/gyl-bookings/v1/estimate";
    }

    function show(message, kind) {
      statusEl.hidden = false;
      statusEl.textContent = message;
      statusEl.className = "gyl-smart-status" + (kind ? " is-" + kind : "");
    }
    function clearStatus() { statusEl.hidden = true; statusEl.textContent = ""; }

    function getVal(name) {
      var el = form.querySelector('[name="' + name + '"]');
      if (!el) return "";
      if (el.type === "radio") {
        var r = form.querySelector('input[name="' + name + '"]:checked');
        return r ? r.value : "";
      }
      return el.value || "";
    }
    function setVal(name, value) {
      var el = form.querySelector('[name="' + name + '"]');
      if (!el || value == null || value === "") return false;
      el.value = String(value);
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    function setRadio(name, value) {
      var radios = form.querySelectorAll('input[type="radio"][name="' + name + '"]');
      var found = false;
      radios.forEach(function (r) {
        if (r.value === value) {
          r.checked = true;
          found = true;
          r.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
      return found;
    }

    // ISO → datetime-local
    function isoToLocalInput(iso) {
      if (!iso) return "";
      var d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      function pad(n) { return n < 10 ? "0" + n : String(n); }
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
           + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
    }

    // ========= Chip layer =========
    // Friendly display names for each parsed field
    var FIELD_LABEL = {
      trip_type: "Trip type",
      pickup_location: "Pickup",
      dropoff_location: "Drop-off",
      pickup_at: "When",
      return_at: "Return",
      hours: "Hours",
      passengers: "Passengers",
      luggage: "Luggage",
      vehicle_type: "Vehicle",
      flight_number: "Flight",
      customer_name: "Name",
      customer_email: "Email",
      customer_phone: "Phone",
      message: "Notes",
    };

    // Pretty-format a field value for the chip
    function formatChipValue(name, raw) {
      if (raw == null || raw === "") return "";
      if (name === "trip_type") {
        if (raw === "one_way") return "One way";
        if (raw === "two_way") return "Round trip";
        if (raw === "hourly") return "Hourly";
        return raw;
      }
      if (name === "pickup_at" || name === "return_at") {
        var d = new Date(raw);
        if (!isNaN(d.getTime())) {
          return d.toLocaleString(undefined, {
            weekday: "short", month: "short", day: "numeric",
            hour: "numeric", minute: "2-digit",
          });
        }
      }
      if (name === "vehicle_type") {
        return raw.replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      }
      if (name === "passengers") return raw + " pax";
      if (name === "luggage") return raw + " bag" + (Number(raw) === 1 ? "" : "s");
      if (name === "hours") return raw + " hr";
      return String(raw);
    }

    // Render the chips in summary order, skipping defaults/empty
    function renderChips() {
      var order = [
        "trip_type", "pickup_location", "dropoff_location",
        "pickup_at", "return_at", "hours",
        "passengers", "luggage", "vehicle_type",
        "flight_number", "customer_name", "customer_email", "customer_phone",
      ];
      summaryChips.innerHTML = "";
      var anyShown = false;
      order.forEach(function (name) {
        var v = getVal(name);
        // Skip default-only chips that the user hasn't customized
        if (!v) return;
        if (name === "passengers" && v === "1") return;
        if (name === "luggage" && (v === "0" || v === "")) return;
        if (name === "hours" && v === "3" && getVal("trip_type") !== "hourly") return;
        if (name === "trip_type" && v === "one_way") {
          // skip default one_way to keep chips compact
          return;
        }
        anyShown = true;
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "gyl-chip";
        chip.setAttribute("data-gyl-chip", name);
        chip.innerHTML =
          '<span class="gyl-chip-label">' + FIELD_LABEL[name] + ':</span> ' +
          '<span class="gyl-chip-value">' + escapeHtml(formatChipValue(name, v)) + '</span> ' +
          '<span class="gyl-chip-edit" aria-hidden="true">✎</span>';
        chip.addEventListener("click", function () { editChipInline(chip, name); });
        summaryChips.appendChild(chip);
      });
      summaryCard.hidden = !anyShown;
    }

    // Click a chip → swap it with an inline editor → save on Enter / blur
    function editChipInline(chipEl, name) {
      var currentVal = getVal(name);
      var input;
      if (name === "trip_type") {
        input = document.createElement("select");
        ["one_way", "two_way", "hourly"].forEach(function (val) {
          var o = document.createElement("option");
          o.value = val;
          o.textContent = formatChipValue("trip_type", val);
          if (val === currentVal) o.selected = true;
          input.appendChild(o);
        });
      } else if (name === "vehicle_type") {
        input = document.createElement("select");
        [["", "Any"], ["sedan", "Sedan"], ["suv", "SUV"], ["stretch", "Stretch"], ["sprinter", "Sprinter"], ["limo_bus", "Limo Bus"]].forEach(function (pair) {
          var o = document.createElement("option");
          o.value = pair[0]; o.textContent = pair[1];
          if (pair[0] === currentVal) o.selected = true;
          input.appendChild(o);
        });
      } else if (name === "pickup_at" || name === "return_at") {
        input = document.createElement("input");
        input.type = "datetime-local";
        input.value = isoToLocalInput(currentVal) || currentVal;
      } else if (name === "passengers" || name === "luggage" || name === "hours") {
        input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.value = currentVal;
      } else if (name === "customer_email") {
        input = document.createElement("input");
        input.type = "email";
        input.value = currentVal;
      } else if (name === "customer_phone") {
        input = document.createElement("input");
        input.type = "tel";
        input.value = currentVal;
      } else {
        input = document.createElement("input");
        input.type = "text";
        input.value = currentVal;
      }
      input.className = "gyl-chip-input";
      input.setAttribute("data-gyl-chip-input", name);

      var wrap = document.createElement("span");
      wrap.className = "gyl-chip is-editing";
      wrap.innerHTML = '<span class="gyl-chip-label">' + FIELD_LABEL[name] + ':</span> ';
      wrap.appendChild(input);

      chipEl.replaceWith(wrap);
      input.focus();
      if (input.select) try { input.select(); } catch (e) { /* ignore */ }

      function commit() {
        var v = input.value;
        if (name === "trip_type") setRadio("trip_type", v);
        else setVal(name, v);
        renderChips();
        rebuildMissing();
        scheduleTiles();
        // Status: nothing — chip edits are quiet
      }
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); input.blur(); }
        if (e.key === "Escape") { e.preventDefault(); renderChips(); }
      });
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }

    // ========= Missing-field stepper =========
    // After parsing, we hide the full form and show only the missing required
    // fields + always-ask contact fields here. Re-renders on every state change.
    function rebuildMissing() {
      missingGrid.innerHTML = "";
      var tripType = getVal("trip_type") || "one_way";

      var needed = [];
      // Quote-required fields (trip_type-conditional for dropoff)
      if (!getVal("pickup_location")) needed.push("pickup_location");
      if (tripType !== "hourly" && !getVal("dropoff_location")) needed.push("dropoff_location");
      if (!getVal("pickup_at")) needed.push("pickup_at");
      // Always ask for phone so we can reach them about the quote
      ALWAYS_ASK.forEach(function (name) {
        if (!getVal(name)) needed.push(name);
      });

      // If hourly and no hours yet
      if (tripType === "hourly" && !getVal("hours")) needed.push("hours");
      // If two_way and no return, gently suggest (don't require)
      // → skip in the missing card; user can use Edit all to add it.

      if (needed.length === 0) {
        missingCard.hidden = true;
        finalRow.hidden = false;
        ctaLabel.textContent = "Get my quote →";
        return;
      }

      missingTitle.textContent = needed.length === 1
        ? "One last thing"
        : "Almost there — " + needed.length + " more details";

      needed.forEach(function (name) {
        var wrap = document.createElement("label");
        wrap.className = "gyl-missing-field";
        var label = document.createElement("span");
        label.className = "gyl-missing-field-label";
        label.textContent = humanLabel(name);
        wrap.appendChild(label);

        var input = buildInputFor(name);
        input.className = "gyl-missing-input";
        wrap.appendChild(input);

        // Submit on Enter advances to next missing
        input.addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            e.preventDefault();
            input.blur();
          }
        });
        input.addEventListener("change", function () {
          if (name === "trip_type") setRadio("trip_type", input.value);
          else setVal(name, input.value);
          renderChips();
          rebuildMissing();
          // Auto-focus the next missing input if any
          var next = missingGrid.querySelector("input,select,textarea");
          if (next && next !== input) setTimeout(function () { next.focus(); }, 50);
        });
        input.addEventListener("blur", function () {
          if (name === "trip_type") setRadio("trip_type", input.value);
          else setVal(name, input.value);
          renderChips();
          rebuildMissing();
        });

        missingGrid.appendChild(wrap);
      });

      missingCard.hidden = false;
      // Allow submit anyway — but the CTA highlights remaining fields
      finalRow.hidden = false;
      ctaLabel.textContent = "Get my quote →";
    }

    function humanLabel(name) {
      var map = {
        pickup_location: "Where will we pick you up?",
        dropoff_location: "Where to?",
        pickup_at: "When?",
        return_at: "Return time",
        hours: "How many hours?",
        customer_name: "Your name",
        customer_email: "Email",
        customer_phone: "Best phone to reach you",
        trip_type: "Trip type",
      };
      return map[name] || FIELD_LABEL[name] || name.replace(/_/g, " ");
    }

    function buildInputFor(name) {
      var existing = form.querySelector('[name="' + name + '"]:not([type="radio"])');
      var input;
      if (name === "pickup_at" || name === "return_at") {
        input = document.createElement("input");
        input.type = "datetime-local";
        if (existing && existing.value) input.value = existing.value;
      } else if (name === "hours") {
        input = document.createElement("input");
        input.type = "number"; input.min = "1"; input.max = "24"; input.step = "1";
        input.value = "3";
      } else if (name === "customer_email") {
        input = document.createElement("input");
        input.type = "email"; input.placeholder = "you@example.com";
      } else if (name === "customer_phone") {
        input = document.createElement("input");
        input.type = "tel"; input.placeholder = "+1 416 555 0100"; input.autocomplete = "tel";
      } else if (name === "dropoff_location" || name === "pickup_location") {
        input = document.createElement("input");
        input.type = "text"; input.placeholder = "address or landmark";
      } else if (name === "trip_type") {
        input = document.createElement("select");
        ["one_way", "two_way", "hourly"].forEach(function (val) {
          var o = document.createElement("option");
          o.value = val;
          o.textContent = formatChipValue("trip_type", val);
          input.appendChild(o);
        });
      } else {
        input = document.createElement("input");
        input.type = "text";
      }
      if (existing && existing.value && !input.value) input.value = existing.value;
      return input;
    }

    // ========= Parser =========
    function applyParsed(p) {
      var n = 0;
      if (p.trip_type && setRadio("trip_type", p.trip_type)) n++;
      if (p.pickup_location && setVal("pickup_location", p.pickup_location)) n++;
      if (p.dropoff_location && setVal("dropoff_location", p.dropoff_location)) n++;
      if (p.pickup_at_iso && setVal("pickup_at", isoToLocalInput(p.pickup_at_iso))) n++;
      if (p.return_at_iso && setVal("return_at", isoToLocalInput(p.return_at_iso))) n++;
      if (p.hours && setVal("hours", p.hours)) n++;
      if (p.passengers && setVal("passengers", p.passengers)) n++;
      if (p.luggage != null && setVal("luggage", p.luggage)) n++;
      if (p.vehicle_type && setVal("vehicle_type", p.vehicle_type)) n++;
      if (p.flight_number && setVal("flight_number", p.flight_number)) n++;
      if (p.customer_name && setVal("customer_name", p.customer_name)) n++;
      if (p.customer_email && setVal("customer_email", p.customer_email)) n++;
      if (p.customer_phone && setVal("customer_phone", p.customer_phone)) n++;
      if (p.message && setVal("message", p.message)) n++;
      return n;
    }

    function runParser() {
      var text = (smartInput.value || "").trim();
      if (!text) { smartInput.focus(); return; }
      show("Reading…", "loading");
      parseBtn.disabled = true;
      fetch(resolveParseUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text, hint: location.pathname })
      }).then(function (res) {
        return res.json().then(function (json) { return { json: json, status: res.status }; });
      }).then(function (r) {
        var json = r.json;
        if (!json.ok) {
          // Fall back: show the manual stepper anyway so user isn't stuck.
          show((json.error === "llm-not-configured")
            ? "AI is not configured — fill in the form below."
            : ("Couldn't parse: " + (json.message || json.error)), "error");
          missingCard.hidden = false;
          finalRow.hidden = false;
          rebuildMissing();
          return;
        }
        var n = applyParsed(json.parsed || {});
        renderChips();
        rebuildMissing();
        scheduleTiles();
        if (n === 0) {
          show("Didn't catch any details. Try adding pickup, dropoff and a time.", "error");
        } else {
          clearStatus();
        }
      }).catch(function () {
        show("Network hiccup. Fill in the form below to continue.", "error");
        missingCard.hidden = false;
        finalRow.hidden = false;
        rebuildMissing();
      }).then(function () {
        parseBtn.disabled = false;
      });
    }

    // ========= Live vehicle price tiles =========
    // Fetches an estimate as soon as the customer has enough info (pickup +
    // dropoff + datetime, OR hourly + hours + datetime) and renders one tile per
    // vehicle class. Click a tile → sets vehicle_type + updates the CTA label.
    var TILE_LABELS = {
      sedan:    "Sedan",
      suv:      "SUV",
      stretch:  "Stretch",
      sprinter: "Sprinter",
      limo_bus: "Limo Bus",
    };
    var lastEstimateKey = "";
    var estimateTimer = null;
    var lastVehicles = null; // last successful tile data — used by CTA label updates

    function tilesRequirementsMet() {
      var tripType = getVal("trip_type") || "one_way";
      if (!getVal("pickup_location")) return false;
      if (!getVal("pickup_at")) return false;
      if (tripType === "hourly") {
        return !!getVal("hours");
      }
      return !!getVal("dropoff_location");
    }

    function tilesPayload() {
      var tripType = getVal("trip_type") || "one_way";
      var pickupRaw = getVal("pickup_at");
      // datetime-local has no TZ — let the server parse `YYYY-MM-DDTHH:MM`
      var p = {
        trip_type: tripType,
        pickup_location: getVal("pickup_location"),
        pickup_at: pickupRaw,
      };
      if (tripType !== "hourly") {
        p.dropoff_location = getVal("dropoff_location");
      } else {
        p.hours = Number(getVal("hours")) || undefined;
      }
      var pax = Number(getVal("passengers"));
      if (pax > 0) p.passengers = pax;
      return p;
    }

    function renderTilesSkeleton() {
      if (!tilesEl) return;
      tilesEl.hidden = false;
      tilesEl.innerHTML = "";
      for (var i = 0; i < 5; i++) {
        var sk = document.createElement("div");
        sk.className = "gyl-tile gyl-tile-loading";
        sk.innerHTML = '<span class="gyl-tile-name">&nbsp;</span><span class="gyl-tile-price">&nbsp;</span><span class="gyl-tile-sub">&nbsp;</span>';
        tilesEl.appendChild(sk);
      }
    }

    function renderTilesFallback() {
      if (!tilesEl) return;
      tilesEl.hidden = false;
      tilesEl.innerHTML = "";
      var card = document.createElement("div");
      card.className = "gyl-tile gyl-tile-fallback";
      card.innerHTML = '<span class="gyl-tile-name">Live price unavailable</span>' +
        '<span class="gyl-tile-sub">We\'ll calculate the exact price after you submit.</span>';
      tilesEl.appendChild(card);
    }

    function selectTile(key, formatted) {
      setVal("vehicle_type", key);
      Array.prototype.forEach.call(tilesEl.querySelectorAll(".gyl-tile"), function (t) {
        t.classList.toggle("is-selected", t.getAttribute("data-vehicle-key") === key);
      });
      var label = TILE_LABELS[key] || key;
      ctaLabel.textContent = "Confirm " + label + " & book — " + formatted + " →";
      // Reflect chip changes immediately
      renderChips();
    }

    function renderTilesFromVehicles(vehicles) {
      if (!tilesEl) return;
      lastVehicles = vehicles;
      tilesEl.hidden = false;
      tilesEl.innerHTML = "";
      var selectedKey = getVal("vehicle_type");
      vehicles.forEach(function (v) {
        var tile = document.createElement("button");
        tile.type = "button";
        tile.className = "gyl-tile";
        tile.setAttribute("data-vehicle-key", v.key);
        if (v.key === selectedKey) tile.classList.add("is-selected");
        tile.innerHTML =
          '<span class="gyl-tile-name">' + escapeHtml(v.label || TILE_LABELS[v.key] || v.key) + '</span>' +
          '<span class="gyl-tile-price">' + escapeHtml(v.formatted || "") + '</span>' +
          '<span class="gyl-tile-sub">' + escapeHtml(v._sub || "") + '</span>';
        tile.addEventListener("click", function () { selectTile(v.key, v.formatted); });
        tilesEl.appendChild(tile);
      });
      // If a vehicle was already selected, refresh CTA label to match new price
      if (selectedKey) {
        var hit = vehicles.find ? vehicles.find(function (x) { return x.key === selectedKey; }) : null;
        if (hit) {
          ctaLabel.textContent = "Confirm " + (TILE_LABELS[selectedKey] || selectedKey) + " & book — " + hit.formatted + " →";
        }
      }
    }

    function fetchTiles() {
      if (!tilesEl) return;
      if (!tilesRequirementsMet()) {
        tilesEl.hidden = true;
        tilesEl.innerHTML = "";
        lastEstimateKey = "";
        return;
      }
      var payload = tilesPayload();
      var key = JSON.stringify(payload);
      if (key === lastEstimateKey) return;
      lastEstimateKey = key;

      renderTilesSkeleton();
      fetch(resolveEstimateUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }).then(function (res) {
        return res.json().then(function (json) { return { json: json, status: res.status }; });
      }).then(function (r) {
        var json = r.json;
        if (!json || !json.ok || !json.vehicles || !json.vehicles.length) {
          renderTilesFallback();
          return;
        }
        if (json.distance_source === "unknown") {
          renderTilesFallback();
          return;
        }
        // Attach the duration line for each tile (same for all vehicles, but
        // we display it on each card so the row is visually balanced).
        var sub = "";
        if (typeof json.duration_min === "number" && json.duration_min > 0) {
          sub = "≈ " + Math.round(json.duration_min) + " min";
        } else if (typeof json.distance_km === "number" && json.distance_km > 0) {
          sub = Math.round(json.distance_km) + " km";
        }
        json.vehicles.forEach(function (v) { v._sub = sub; });
        renderTilesFromVehicles(json.vehicles);
      }).catch(function () {
        renderTilesFallback();
      });
    }

    function scheduleTiles() {
      if (estimateTimer) clearTimeout(estimateTimer);
      estimateTimer = setTimeout(fetchTiles, 400);
    }

    // Watch the inputs that affect the estimate.
    ["pickup_location", "dropoff_location", "pickup_at", "hours"].forEach(function (name) {
      var els = form.querySelectorAll('[name="' + name + '"]');
      Array.prototype.forEach.call(els, function (el) {
        el.addEventListener("input", scheduleTiles);
        el.addEventListener("change", scheduleTiles);
      });
    });
    form.querySelectorAll('input[name="trip_type"]').forEach(function (r) {
      r.addEventListener("change", scheduleTiles);
    });

    // ========= Trip-type conditional visibility (for the hidden full form) =========
    function updateConditional() {
      var checked = form.querySelector('input[name="trip_type"]:checked');
      var trip = checked ? checked.value : "one_way";
      form.querySelectorAll("[data-gyl-when]").forEach(function (el) {
        var when = el.getAttribute("data-gyl-when");
        var hide = (when === "two_way" && trip !== "two_way")
                || (when === "hourly" && trip !== "hourly")
                || (when === "not-hourly" && trip === "hourly");
        el.hidden = hide;
      });
    }
    form.querySelectorAll('input[name="trip_type"]').forEach(function (r) {
      r.addEventListener("change", function () { updateConditional(); renderChips(); rebuildMissing(); });
    });
    updateConditional();

    // ========= Edit-all expander =========
    editAllBtn && editAllBtn.addEventListener("click", function () {
      fullForm.hidden = false;
      editAllBtn.hidden = true;
      summaryCard.hidden = true;
      missingCard.hidden = true;
      // Scroll into view
      fullForm.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    collapseBtn && collapseBtn.addEventListener("click", function () {
      fullForm.hidden = true;
      if (editAllBtn) editAllBtn.hidden = false;
      renderChips();
      rebuildMissing();
    });

    // ========= Smart bar bindings =========
    smartInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); runParser(); }
    });
    parseBtn.addEventListener("click", runParser);

    // ========= Voice =========
    var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      if (micBtn) micBtn.style.display = "none";
    } else if (micBtn) {
      var rec = new SpeechRec();
      rec.lang = (document.documentElement.lang || "en-US");
      rec.continuous = false;
      rec.interimResults = true;
      var listening = false;
      rec.onresult = function (e) {
        var transcript = "";
        for (var i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
        smartInput.value = transcript;
      };
      rec.onend = function () {
        listening = false;
        micBtn.classList.remove("is-listening");
        if (smartInput.value.trim()) runParser();
      };
      rec.onerror = function () {
        listening = false;
        micBtn.classList.remove("is-listening");
      };
      micBtn.addEventListener("click", function () {
        if (listening) { rec.stop(); return; }
        try {
          smartInput.value = "";
          listening = true;
          micBtn.classList.add("is-listening");
          rec.start();
          show("Listening…", "loading");
        } catch (err) {
          listening = false;
          micBtn.classList.remove("is-listening");
        }
      });
    }

    // ========= Submit =========
    form.addEventListener("submit", function (e) {
      // Preview mode: just flash a status. In production the form posts to /quote.
      if (form.getAttribute("action").indexOf("#preview") === 0) {
        e.preventDefault();
        var s = form.querySelector("[data-gyl-status]");
        s.hidden = false;
        s.textContent = "Preview only — this would submit to /wp-json/gyl-bookings/v1/quote with: " +
          ["trip_type", "pickup_location", "dropoff_location", "pickup_at", "passengers", "vehicle_type", "customer_phone"]
            .map(function (n) { return n + "=" + (getVal(n) || "—"); })
            .join(", ");
        s.className = "gyl-bookings-status gyl-bookings-status-ok";
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
