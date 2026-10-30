// Electrosparkzz billing: everything runs in the browser, saved in localStorage.
(() => {
  const KEY = { biz: "es-billing:biz", draft: "es-billing:draft", counter: "es-billing:counter", history: "es-billing:history" };
  const HISTORY_MAX = 100;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const store = {
    get(k, fallback) {
      try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const fmt = (n) => round2(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rs = (n) => (n < 0 ? "−₹" : "₹") + fmt(Math.abs(n));
  const fmtDate = (s) => {
    if (!s) return "";
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  // ---------- state ----------
  const biz = Object.assign(
    { name: "Electrosparkzz", address: "", phone: "", email: "", website: "electrosparkzz.in", prefix: "ES", payment: "" },
    store.get(KEY.biz, {})
  );
  let counter = store.get(KEY.counter, 0);
  let history = store.get(KEY.history, []);

  const nextNumber = () => `${biz.prefix || "ES"}-${new Date().getFullYear()}-${String(counter + 1).padStart(3, "0")}`;
  const blankItem = () => ({ desc: "", qty: "1", unit: "", rate: "" });
  const blankBill = () => ({
    number: nextNumber(), date: today(), due: "", status: "Unpaid",
    custName: "", custPhone: "", custAddress: "",
    items: [blankItem()], discount: "", discountType: "amt", paid: "", notes: "",
  });

  let bill = Object.assign(blankBill(), store.get(KEY.draft, {}));
  if (!bill.items?.length) bill.items = [blankItem()];
  let dirty = store.get(KEY.draft, null) != null && hasContent(bill);

  function hasContent(b) {
    return !!(b.custName || b.items.some((it) => it.desc || num(it.rate)));
  }

  function totals(b) {
    const lines = b.items.map((it) => round2(num(it.qty) * num(it.rate)));
    const sub = round2(lines.reduce((a, n) => a + n, 0));
    let disc = b.discountType === "pct" ? sub * num(b.discount) / 100 : num(b.discount);
    disc = round2(Math.min(Math.max(disc, 0), sub));
    const grand = round2(sub - disc);
    const paid = round2(Math.max(num(b.paid), 0));
    return { lines, sub, disc, grand, paid, due: round2(grand - paid) };
  }

  // ---------- amount in words (Indian system) ----------
  const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
    "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : ""));
  const three = (n) => {
    const h = Math.floor(n / 100), r = n % 100;
    return [h ? ONES[h] + " Hundred" : "", r ? two(r) : ""].filter(Boolean).join(" ");
  };
  function intWords(n) {
    if (n === 0) return "Zero";
    const parts = [];
    const crore = Math.floor(n / 1e7); n %= 1e7;
    const lakh = Math.floor(n / 1e5); n %= 1e5;
    const thousand = Math.floor(n / 1e3); n %= 1e3;
    if (crore) parts.push(intWords(crore) + " Crore");
    if (lakh) parts.push(two(lakh) + " Lakh");
    if (thousand) parts.push(two(thousand) + " Thousand");
    if (n) parts.push(three(n));
    return parts.join(" ");
  }
  function amountWords(amount) {
    const rupees = Math.floor(amount);
    const paise = Math.round((amount - rupees) * 100);
    let s = "Indian Rupees " + intWords(rupees);
    if (paise) s += " and " + two(paise) + " Paise";
    return s + " Only";
  }

  // ---------- rendering ----------
  const itemsEl = $("#items");
  const tpl = $("#itemTpl");

  function renderItems() {
    itemsEl.textContent = "";
    bill.items.forEach((it, i) => {
      const li = tpl.content.firstElementChild.cloneNode(true);
      li.dataset.i = i;
      $(".num", li).textContent = i + 1;
      $$("[data-f]", li).forEach((inp) => { inp.value = it[inp.dataset.f] ?? ""; });
      itemsEl.append(li);
    });
    updateTotals();
  }

  function updateTotals() {
    const t = totals(bill);
    $$(".item", itemsEl).forEach((li, i) => { $(".amt", li).textContent = fmt(t.lines[i] || 0); });
    $("#tSub").textContent = rs(t.sub);
    $("#tGrand").textContent = rs(t.grand);
    $("#barTotal").textContent = rs(t.grand);
    $("#tWords").textContent = t.grand ? amountWords(t.grand) : "";
    $("#tDueRow").hidden = !t.paid;
    $("#tDue").textContent = rs(t.due);
  }

  function fillForm() {
    $$("[data-biz]").forEach((el) => { el.value = biz[el.dataset.biz] ?? ""; });
    $$("[data-bill]").forEach((el) => { el.value = bill[el.dataset.bill] ?? ""; });
    bizSummary();
    renderItems();
    renderHistory();
  }

  function bizSummary() {
    const bits = [biz.name, biz.phone].filter(Boolean);
    $("#bizSummary").textContent = bits.length > 1 ? bits.join(" · ") : "Name, address, phone, payment details";
  }

  function renderHistory() {
    const ul = $("#history");
    ul.textContent = "";
    $("#historyCard").hidden = !history.length;
    history.forEach((h, idx) => {
      const li = document.createElement("li");
      li.innerHTML = `<div class="meta"><b></b><span></span></div><span class="amt"></span>
        <button type="button" class="btn ghost" data-open>Open</button>`;
      $(".meta b", li).textContent = h.custName || "No name";
      $(".meta span", li).textContent = `${h.number} · ${fmtDate(h.date)} · ${h.status}`;
      $(".amt", li).textContent = rs(totals(h).grand);
      $("[data-open]", li).addEventListener("click", () => {
        if (dirty && hasContent(bill) && !confirm("Replace the bill you're editing?")) return;
        bill = structuredClone(history[idx]);
        dirty = false;
        saveDraft();
        fillForm();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      ul.append(li);
    });
  }

  const saveDraft = () => store.set(KEY.draft, bill);
  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  // ---------- events ----------
  $$("[data-biz]").forEach((el) => el.addEventListener("input", () => {
    biz[el.dataset.biz] = el.value;
    store.set(KEY.biz, biz);
    bizSummary();
  }));
  $$("[data-bill]").forEach((el) => el.addEventListener("input", () => {
    bill[el.dataset.bill] = el.value;
    dirty = true;
    saveDraft();
    updateTotals();
  }));

  itemsEl.addEventListener("input", (e) => {
    const inp = e.target.closest("[data-f]");
    if (!inp) return;
    bill.items[+inp.closest(".item").dataset.i][inp.dataset.f] = inp.value;
    dirty = true;
    saveDraft();
    updateTotals();
  });
  itemsEl.addEventListener("click", (e) => {
    const del = e.target.closest(".del");
    if (!del) return;
    bill.items.splice(+del.closest(".item").dataset.i, 1);
    if (!bill.items.length) bill.items.push(blankItem());
    dirty = true;
    saveDraft();
    renderItems();
  });
  // Enter in the last row adds a new item.
  itemsEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !e.target.matches("[data-f]")) return;
    e.preventDefault();
    const i = +e.target.closest(".item").dataset.i;
    if (i === bill.items.length - 1) addItem();
    else $(`.item[data-i="${i + 1}"] [data-f=desc]`, itemsEl)?.focus();
  });

  function addItem() {
    bill.items.push(blankItem());
    saveDraft();
    renderItems();
    $(".item:last-child [data-f=desc]", itemsEl).focus();
  }
  $("#addItem").addEventListener("click", addItem);

  $("#newBill").addEventListener("click", () => {
    if (dirty && hasContent(bill) && !confirm("Start a new bill? The current one hasn't been downloaded.")) return;
    bill = blankBill();
    dirty = false;
    saveDraft();
    fillForm();
    $("[data-bill=custName]").focus();
  });

  $("#download").addEventListener("click", download);
  $("#download2").addEventListener("click", download);

  // ---------- PDF ----------
  const cache = {};
  function fetchB64(url) {
    return (cache[url] ??= fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.arrayBuffer();
    }).then((buf) => {
      const bytes = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    }));
  }

  const C = {
    ink: [43, 34, 56], muted: [111, 99, 128], line: [236, 222, 230], soft: [253, 245, 249],
    orange: [249, 115, 22], rose: [236, 72, 153], violet: [139, 92, 246],
  };
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const gradAt = (t) => (t < 0.52 ? mix(C.orange, C.rose, t / 0.52) : mix(C.rose, C.violet, (t - 0.52) / 0.48));

  function gradientBar(doc, x, y, w, h) {
    const steps = 80;
    for (let i = 0; i < steps; i++) {
      doc.setFillColor(...gradAt(i / (steps - 1)));
      doc.rect(x + (w * i) / steps, y, w / steps + 0.2, h, "F");
    }
  }

  async function buildPdf(b) {
    const { jsPDF } = window.jspdf;
    const [reg, bold, logo] = await Promise.all([
      fetchB64("assets/fonts/NotoSans-Regular.ttf"),
      fetchB64("assets/fonts/NotoSans-Bold.ttf"),
      fetchB64("assets/es-mark.png"),
    ]);
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.addFileToVFS("NotoSans-Regular.ttf", reg);
    doc.addFont("NotoSans-Regular.ttf", "Noto", "normal");
    doc.addFileToVFS("NotoSans-Bold.ttf", bold);
    doc.addFont("NotoSans-Bold.ttf", "Noto", "bold");

    const W = 210, H = 297, M = 14, R = W - M;
    const t = totals(b);
    const set = (size, style = "normal", color = C.ink) => {
      doc.setFont("Noto", style); doc.setFontSize(size); doc.setTextColor(...color);
    };

    gradientBar(doc, 0, 0, W, 3);

    // Seller (left)
    doc.addImage("data:image/png;base64," + logo, "PNG", M, 12, 24, 11.2);
    let y = 31;
    set(13, "bold");
    doc.text(biz.name || "Electrosparkzz", M, y);
    y += 5;
    set(8.5, "normal", C.muted);
    const sellerLines = [
      ...(biz.address ? doc.splitTextToSize(biz.address, 95) : []),
      [biz.phone, biz.email].filter(Boolean).join("  ·  "),
      biz.website,
    ].filter(Boolean);
    sellerLines.forEach((l) => { doc.text(l, M, y); y += 4; });

    // Title + meta (right)
    set(20, "bold");
    doc.text("BILL", R, 20, { align: "right" });
    let ry = 29;
    const meta = [["Bill No.", b.number], ["Date", fmtDate(b.date)], ["Due date", fmtDate(b.due)], ["Status", b.status]];
    meta.filter(([, v]) => v).forEach(([k, v]) => {
      set(8.5, "normal", C.muted); doc.text(k, R - 38, ry, { align: "right" });
      set(9.5, "bold"); doc.text(String(v), R, ry, { align: "right" });
      ry += 5;
    });

    // Bill to
    y = Math.max(y, ry) + 4;
    const custLines = [
      ...(b.custAddress ? doc.splitTextToSize(b.custAddress, W - 2 * M - 12) : []),
      b.custPhone && "Phone: " + b.custPhone,
    ].filter(Boolean);
    const boxH = 13 + custLines.length * 4.2;
    doc.setFillColor(...C.soft);
    doc.roundedRect(M, y, W - 2 * M, boxH, 2.5, 2.5, "F");
    doc.setFillColor(...C.rose);
    doc.rect(M, y, 1.2, boxH, "F");
    set(7.5, "bold", C.rose);
    doc.text("BILL TO", M + 6, y + 5.5);
    set(11, "bold");
    doc.text(b.custName || "—", M + 6, y + 10.5);
    set(8.5, "normal", C.muted);
    custLines.forEach((l, i) => doc.text(l, M + 6, y + 15 + i * 4.2));
    y += boxH + 6;

    // Items
    const rows = b.items
      .map((it, i) => ({ it, amt: t.lines[i] }))
      .filter(({ it }) => it.desc || num(it.rate))
      .map(({ it, amt }, i) => [i + 1, it.desc, String(num(it.qty)), it.unit || "", fmt(num(it.rate)), fmt(amt)]);
    doc.autoTable({
      startY: y,
      margin: { left: M, right: M, bottom: 22 },
      head: [["#", "Description", "Qty", "Unit", "Rate (₹)", "Amount (₹)"]],
      body: rows,
      theme: "plain",
      styles: { font: "Noto", fontSize: 9, cellPadding: { top: 2.6, bottom: 2.6, left: 2.5, right: 2.5 }, textColor: C.ink, lineColor: C.line },
      headStyles: { fillColor: C.ink, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
      alternateRowStyles: { fillColor: C.soft },
      bodyStyles: { lineWidth: { bottom: 0.2 } },
      columnStyles: {
        0: { cellWidth: 9, textColor: C.muted },
        2: { cellWidth: 16, halign: "right" },
        3: { cellWidth: 16 },
        4: { cellWidth: 28, halign: "right" },
        5: { cellWidth: 32, halign: "right", fontStyle: "bold" },
      },
      didParseCell: (d) => { if (d.section === "head" && d.column.index >= 4) d.cell.styles.halign = "right"; if (d.section === "head" && d.column.index === 2) d.cell.styles.halign = "right"; },
    });
    y = doc.lastAutoTable.finalY + 6;

    // Totals (right) and words/notes (left)
    const tRows = [["Subtotal", rs(t.sub)]];
    if (t.disc) tRows.push([b.discountType === "pct" ? `Discount (${num(b.discount)}%)` : "Discount", "- " + rs(t.disc)]);
    const notesW = 100;
    const wordsLines = doc.splitTextToSize(amountWords(t.grand), notesW);
    const payLines = biz.payment ? doc.splitTextToSize(biz.payment, notesW) : [];
    const noteLines = b.notes ? doc.splitTextToSize(b.notes, notesW) : [];
    const leftH = 9 + wordsLines.length * 4.2 + (payLines.length ? 9 + payLines.length * 4.2 : 0) + (noteLines.length ? 9 + noteLines.length * 4.2 : 0);
    const rightH = tRows.length * 6 + 12 + (t.paid ? 12 : 0);
    if (y + Math.max(leftH, rightH) > H - 24) { doc.addPage(); y = 18; }

    const tx = 128;
    let ty = y + 2;
    tRows.forEach(([k, v]) => {
      set(9, "normal", C.muted); doc.text(k, tx, ty);
      set(9.5, "normal"); doc.text(v, R, ty, { align: "right" });
      ty += 6;
    });
    ty -= 1;
    gradientBar(doc, tx - 3, ty, R - tx + 3, 10);
    set(10.5, "bold", [255, 255, 255]);
    doc.text("Grand total", tx, ty + 6.6);
    doc.text(rs(t.grand), R - 2, ty + 6.6, { align: "right" });
    ty += 16;
    if (t.paid) {
      set(9, "normal", C.muted); doc.text("Amount paid", tx, ty);
      set(9.5, "normal"); doc.text(rs(t.paid), R, ty, { align: "right" }); ty += 6;
      set(9.5, "bold", C.muted); doc.text("Balance due", tx, ty);
      set(10, "bold"); doc.text(rs(t.due), R, ty, { align: "right" });
    }

    let ly = y + 2;
    const block = (label, lines, style = "normal") => {
      set(7.5, "bold", C.rose); doc.text(label, M, ly); ly += 4.6;
      set(9, style, style === "bold" ? C.ink : C.muted);
      lines.forEach((l) => { doc.text(l, M, ly); ly += 4.2; });
      ly += 4.4;
    };
    block("AMOUNT IN WORDS", wordsLines, "bold");
    if (payLines.length) block("PAYMENT DETAILS", payLines);
    if (noteLines.length) block("NOTES", noteLines);

    // Footer on every page
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      if (p > 1) gradientBar(doc, 0, 0, W, 3);
      doc.setDrawColor(...C.line); doc.setLineWidth(0.3);
      doc.line(M, H - 16, R, H - 16);
      set(7.5, "normal", C.muted);
      doc.text("This is a computer-generated bill.", M, H - 11);
      if (biz.website) doc.text(biz.website, W / 2, H - 11, { align: "center" });
      doc.text(`Page ${p} of ${pages}`, R, H - 11, { align: "right" });
    }
    return doc;
  }

  async function download() {
    if (!bill.items.some((it) => it.desc || num(it.rate))) { toast("Add at least one item first"); return; }
    if (!window.jspdf) { toast("PDF tool is still loading — try again"); return; }
    const btns = [$("#download"), $("#download2")];
    btns.forEach((b) => { b.disabled = true; b.textContent = "Making PDF…"; });
    try {
      const doc = await buildPdf(bill);
      const safe = (s) => s.replace(/[\\/:*?"<>|]+/g, "").trim();
      doc.save(`${safe(bill.number || "Bill")}${bill.custName ? " - " + safe(bill.custName) : ""}.pdf`);

      // Remember it: keep history and move the counter past this number.
      const n = parseInt((bill.number.match(/(\d+)\s*$/) || [])[1], 10);
      if (n > counter) { counter = n; store.set(KEY.counter, counter); }
      history = [structuredClone(bill), ...history.filter((h) => h.number !== bill.number)].slice(0, HISTORY_MAX);
      store.set(KEY.history, history);
      dirty = false;
      renderHistory();
      toast("Bill downloaded");
    } catch (err) {
      console.error(err);
      toast("Couldn't make the PDF: " + err.message);
    } finally {
      btns.forEach((b) => { b.disabled = false; b.textContent = "Download PDF"; });
    }
  }

  // First visit: open the business section so it gets filled in.
  $("#bizDetails").open = !biz.address && !biz.phone;
  fillForm();
})();
