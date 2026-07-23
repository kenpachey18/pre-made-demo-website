(function () {
  "use strict";
  const STORE = { bookings: "dinkside_bookings", blocked: "dinkside_blocked", rate: "dinkside_rate" };
  const OPEN = 7, CLOSE = 27;
  const state = { court: 1, viewingDate: today(), bookingCourt: 1, bookingDate: today(), selected: [], rate: Number(localStorage.getItem(STORE.rate) || 350), step: 0, animateSchedule: true };
  const $ = (selector) => document.querySelector(selector);
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
  function addDays(date, amount) { const d = new Date(date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + amount); return d.toISOString().slice(0, 10); }
  function dateObj(date) { return new Date(date + "T00:00:00+08:00"); }
  function longDate(date) { return new Intl.DateTimeFormat("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Manila" }).format(dateObj(date)); }
  function shortDate(date) { return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }).format(dateObj(date)); }
  function weekday(date) { return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Manila" }).format(dateObj(date)).toUpperCase(); }
  function month(date) { return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "Asia/Manila" }).format(dateObj(date)).toUpperCase(); }
  function hourLabel(hour) { const h = hour % 24, suffix = h >= 12 ? "PM" : "AM"; return `${h % 12 || 12}:00 ${suffix}`; }
  function actualDate(date, hour) { return addDays(date, Math.floor(hour / 24)); }
  function bookingDates(date, start, end) { const a = actualDate(date, start), b = actualDate(date, end); return a === b ? longDate(a) : `${longDate(a)} → ${longDate(b)}`; }
  function money(value) { return `₱${Number(value).toLocaleString("en-PH")}`; }
  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c])); }
  function bookings() { return read(STORE.bookings, []); }
  function blocked() { return read(STORE.blocked, []); }
  function slotHasStarted(date, hour) { return dateObj(date).getTime() + hour * 60 * 60 * 1000 <= Date.now(); }

  function slotStatus(date, hour, court = state.court) {
    if (slotHasStarted(date, hour)) return "unavailable";
    const block = blocked().find(item => item.date === date && item.hour === hour && Number(item.court || 1) === court);
    if (block) return block.status;
    const booking = bookings().find(item => item.date === date && Number(item.court || 1) === court && item.status !== "cancelled" && item.status !== "rejected" && hour >= item.start && hour < item.end);
    return booking ? (booking.status === "confirmed" ? "booked" : booking.status === "pending" ? "pending" : "available") : "available";
  }

  function renderDates() {
    const row = $("#date-row"); row.innerHTML = "";
    for (let index = 0; index < 7; index++) {
      const date = addDays(today(), index), button = document.createElement("button");
      button.className = `date-card ${state.viewingDate === date ? "selected" : ""}`;
      button.innerHTML = `<span>${index === 0 ? "TODAY" : weekday(date)}</span><strong>${Number(date.slice(8))}</strong><small>${month(date)}</small>`;
      button.addEventListener("click", () => changeDate(date)); row.appendChild(button);
    }
    $("#date-picker").min = today(); $("#date-picker").max = addDays(today(), 90); $("#date-picker").value = state.viewingDate;
  }

  function changeDate(date) { state.viewingDate = date; state.animateSchedule = true; renderAll(); }

  function renderSlots() {
    $("#schedule-date").textContent = longDate(state.viewingDate);
    const note = $("#preserved-note");
    if (state.selected.length && state.bookingDate !== state.viewingDate) { note.classList.remove("hidden"); note.innerHTML = `<b>Your booking is preserved.</b> You are viewing ${longDate(state.viewingDate)}. Selecting an hour starts a new booking.`; } else note.classList.add("hidden");
    const grid = $("#slot-grid");
    if (state.animateSchedule) { grid.classList.remove("is-refreshing"); void grid.offsetWidth; }
    grid.innerHTML = `<div class="slot-matrix-head"><span>Time</span><span>Court 1</span><span>Court 2</span><span>Court 3</span></div>`;
    for (let hour = OPEN; hour < CLOSE; hour++) {
      const row = document.createElement("div"); row.className = "slot-matrix-row"; row.style.setProperty("--row-index", hour - OPEN);
      row.innerHTML = `<div class="matrix-time"><strong>${hourLabel(hour)}</strong><small>${hourLabel(hour + 1)}${hour >= 24 ? " · Next day" : ""}</small></div>`;
      [1,2,3].forEach(court => {
        const status = slotStatus(state.viewingDate, hour, court), selected = state.bookingCourt === court && state.bookingDate === state.viewingDate && state.selected.includes(hour), button = document.createElement("button");
        button.className = `court-slot ${status} ${selected ? "selected" : ""}`; button.disabled = status !== "available";
        button.dataset.court = String(court); button.dataset.hour = String(hour); button.dataset.status = status;
        button.setAttribute("aria-label", `Court ${court}, ${hourLabel(hour)} to ${hourLabel(hour + 1)}, ${status}`);
        button.innerHTML = `<span class="slot-status">${selected ? "✓ Selected" : `● ${status}`}</span><small>${status === "available" ? money(state.rate) : status === "booked" ? "Reserved" : status}</small>`;
        button.addEventListener("click", () => chooseHour(court, hour)); row.appendChild(button);
      });
      grid.appendChild(row);
    }
    if (state.animateSchedule) { grid.classList.add("is-refreshing"); state.animateSchedule = false; }
  }

  function updateSlotSelection() {
    document.querySelectorAll(".court-slot").forEach(button => {
      const court = Number(button.dataset.court), hour = Number(button.dataset.hour), status = button.dataset.status;
      const selected = state.bookingCourt === court && state.bookingDate === state.viewingDate && state.selected.includes(hour);
      button.classList.toggle("selected", selected);
      button.innerHTML = `<span class="slot-status">${selected ? "✓ Selected" : `● ${status}`}</span><small>${status === "available" ? money(state.rate) : status === "booked" ? "Reserved" : status}</small>`;
      button.setAttribute("aria-label", `Court ${court}, ${hourLabel(hour)} to ${hourLabel(hour + 1)}, ${selected ? "selected" : status}`);
    });
  }

  function chooseHour(court, hour) {
    state.court = court;
    if (!state.selected.length || state.bookingDate !== state.viewingDate || state.bookingCourt !== court) { state.bookingCourt = court; state.bookingDate = state.viewingDate; state.selected = [hour]; updateSlotSelection(); renderSummary(); return; }
    const sorted = [...state.selected].sort((a,b) => a-b), first = sorted[0], last = sorted[sorted.length - 1];
    if (sorted.includes(hour)) { if (sorted.length === 1) state.selected = []; else if (hour === first) state.selected = sorted.slice(1); else if (hour === last) state.selected = sorted.slice(0,-1); else state.selected = [hour]; }
    else if (hour === last + 1) state.selected = [...sorted, hour]; else if (hour === first - 1) state.selected = [hour, ...sorted]; else state.selected = [hour];
    updateSlotSelection(); renderSummary();
  }

  function renderSummary() {
    const start = state.selected.length ? Math.min(...state.selected) : null, end = state.selected.length ? Math.max(...state.selected) + 1 : null, total = state.selected.length * state.rate;
    $("#summary-title").textContent = state.selected.length ? "Ready to dink?" : "Choose your hours.";
    $("#summary-date").textContent = start === null ? longDate(state.viewingDate) : bookingDates(state.bookingDate, start, end);
    $("#summary-time").textContent = start === null ? "No hours selected" : `${hourLabel(start)} – ${hourLabel(end)}`;
    $("#summary-court").textContent = `Pickleball Court ${String(start === null ? state.court : state.bookingCourt).padStart(2,"0")}`;
    $("#summary-duration").textContent = `${state.selected.length} ${state.selected.length === 1 ? "hour" : "hours"}`;
    $("#summary-rate").textContent = `${money(state.rate)} / hour`; $("#summary-total").textContent = money(total); $("#hero-rate").textContent = `${money(state.rate)} / hour`;
    $("#continue-booking").disabled = !state.selected.length;
  }
  function renderAll() { renderDates(); renderSlots(); renderSummary(); }

  function openCheckout() { state.step = 1; $("#booking-modal").classList.remove("hidden"); renderCheckout(); }
  function closeCheckout() { $("#booking-modal").classList.add("hidden"); }
  function renderCheckout(error = "") {
    [1,2,3].forEach(n => $("#step-" + n + "-label").classList.toggle("active", state.step >= n));
    const content = $("#checkout-content"), total = state.selected.length * state.rate;
    if (state.step === 1) content.innerHTML = `<span class="eyebrow dark">STEP 1 OF 2</span><h2 id="modal-title">Your details</h2><p>We’ll use these details for booking updates and confirmation.</p><label class="field">Full name *<input id="customer-name" maxlength="100" placeholder="Juan Dela Cruz"></label><label class="field">Mobile number *<input id="customer-mobile" type="tel" inputmode="numeric" maxlength="11" placeholder="09171234567"><small>11 digits only</small></label><label class="check"><input id="terms" type="checkbox"> I agree to the terms, facility rules, and cancellation policy.</label>${error ? `<p class="form-error">${escapeHtml(error)}</p>` : ""}<button id="to-payment" class="lime-button full">Continue to payment →</button>`;
    if (state.step === 2) content.innerHTML = `<span class="eyebrow dark">STEP 2 OF 2</span><h2 id="modal-title">Pay & submit proof</h2><p>Pay the exact amount, then attach your receipt for review.</p><div class="payment-box"><span>AMOUNT DUE</span><strong>${money(total)}</strong></div><label class="field">Payment method<select id="payment-method"><option>GCash</option><option>Bank Transfer</option></select></label><div class="qr-options" aria-label="Payment QR codes"><article class="qr-card"><span>GCash</span><div class="qr-placeholder" aria-label="GCash QR code placeholder"><b>QR</b><small>Add GCash QR code</small></div></article><article class="qr-card"><span>Bank transfer</span><div class="qr-placeholder" aria-label="Bank transfer QR code placeholder"><b>QR</b><small>Add bank QR code</small></div></article></div><p class="qr-note">Replace these placeholders with the venue's payment QR codes.</p><label class="field">Transaction reference (optional)<input id="transaction-ref" placeholder="Enter reference if available"></label><label class="field">Proof of payment *<input id="payment-proof" type="file" accept="image/*,application/pdf"></label>${error ? `<p class="form-error">${escapeHtml(error)}</p>` : ""}<button id="submit-booking" class="lime-button full">Submit booking for review →</button>`;
    if (state.step === 3) content.innerHTML = `<span class="eyebrow dark">BOOKING RECEIVED</span><h2 id="modal-title">What happens next.</h2><div class="received-list"><div><b>01</b><span><strong>Payment review</strong>We review payment during operating hours. Please allow at least one hour.</span></div><div><b>02</b><span><strong>Text confirmation</strong>We’ll send a confirmation text to your number.</span></div><div><b>03</b><span><strong>Track your status</strong>Check the booking status anytime in My Bookings.</span></div></div><div class="reference-box"><small>SAVE YOUR BOOKING REFERENCE</small><strong>${escapeHtml(state.reference)}</strong></div><button id="check-status" class="lime-button full">Check my booking status</button>`;
    bindCheckout();
  }

  function bindCheckout() {
    $("#customer-mobile")?.addEventListener("input", event => event.target.value = event.target.value.replace(/\D/g, "").slice(0,11));
    $("#to-payment")?.addEventListener("click", () => { const name=$("#customer-name").value.trim(), mobile=$("#customer-mobile").value; if(!name || !/^09\d{9}$/.test(mobile) || !$("#terms").checked){renderCheckout("Complete your name, valid 11-digit mobile number, and agreement.");return;} state.customer={name,mobile}; state.step=2; renderCheckout(); });
    $("#submit-booking")?.addEventListener("click", submitBooking);
    $("#check-status")?.addEventListener("click", () => { closeCheckout(); $("#lookup-mobile").value=state.customer.mobile; lookup(state.customer.mobile); showMyBookings(); });
  }

  function submitBooking() {
    const proof = $("#payment-proof").files[0]; if (!proof) { renderCheckout("Please attach your payment proof."); return; }
    const start=Math.min(...state.selected), end=Math.max(...state.selected)+1, reference=`PB-C${state.bookingCourt}-${state.bookingDate.slice(5).replace("-","")}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
    const finish = proofData => { const list=bookings(); list.unshift({id:crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),reference,court:state.bookingCourt,date:state.bookingDate,start,end,hours:end-start,rate:state.rate,total:(end-start)*state.rate,name:state.customer.name,mobile:state.customer.mobile,payment:$("#payment-method").value,transaction:$("#transaction-ref").value.trim()||"N/A",proofName:proof.name,proofData,status:"pending",created:new Date().toISOString()}); write(STORE.bookings,list); state.reference=reference; state.selected=[]; state.step=3; renderCheckout(); renderAll(); };
    if(proof.size<=900000 && proof.type.startsWith("image/")){const reader=new FileReader();reader.onload=()=>finish(reader.result);reader.readAsDataURL(proof);}else finish("");
  }

  function lookup(mobile) {
    const result=bookings().filter(item=>item.mobile===mobile), container=$("#lookup-results"); container.innerHTML=""; $("#lookup-message").textContent=result.length?"":"No bookings found for this mobile number.";
    result.forEach(item=>{const article=document.createElement("article");article.className="booking-ticket";article.innerHTML=`<div class="ticket-date"><span>${weekday(item.date)}</span><strong>${Number(item.date.slice(8))}</strong><small>${month(item.date)} ${item.date.slice(0,4)}</small></div><div class="ticket-main"><span class="status-pill ${item.status}">${item.status}</span><h3>${hourLabel(item.start)} – ${hourLabel(item.end)}</h3><p>Pickleball Court ${String(item.court||1).padStart(2,"0")} · ${item.hours}h · ${money(item.total)}</p></div><div class="ticket-ref"><small>BOOKING REFERENCE</small><strong>${escapeHtml(item.reference)}</strong><span>${escapeHtml(item.payment)}</span></div>`;container.appendChild(article);});
  }

  function showBookingSection() {
    $("#bookings").classList.add("hidden");
    $("#reserve").classList.remove("hidden");
    requestAnimationFrame(() => $("#reserve").scrollIntoView());
  }

  function showMyBookings() {
    $("#reserve").classList.add("hidden");
    $("#bookings").classList.remove("hidden");
    requestAnimationFrame(() => $("#bookings").scrollIntoView());
  }

  document.querySelectorAll("[data-scroll='reserve']").forEach(button=>button.addEventListener("click",showBookingSection));
  $("#show-bookings").addEventListener("click",showMyBookings); $("#footer-bookings").addEventListener("click",showMyBookings);
  $("#date-picker").addEventListener("change",event=>event.target.value&&changeDate(event.target.value)); $("#continue-booking").addEventListener("click",openCheckout); $("#close-modal").addEventListener("click",closeCheckout); $("#booking-modal").addEventListener("mousedown",event=>{if(event.target.id==="booking-modal")closeCheckout();});
  $("#lookup-mobile").addEventListener("input",event=>event.target.value=event.target.value.replace(/\D/g,"").slice(0,11)); $("#lookup-form").addEventListener("submit",event=>{event.preventDefault();const mobile=$("#lookup-mobile").value;if(!/^09\d{9}$/.test(mobile)){ $("#lookup-message").textContent="Enter a valid 11-digit Philippine mobile number.";return;}lookup(mobile);});
  renderAll();
  window.setInterval(renderSlots, 60 * 1000);
})();
