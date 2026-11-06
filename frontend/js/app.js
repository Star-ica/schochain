/* SchoChain shared core — vanilla JS + ethers.js v6. No backend. */
(function () {
  "use strict";
  const D = window.SCHO_DEPLOY;
  const ABI = window.SCHO_ABI;
  const ZERO = "0x0000000000000000000000000000000000000000";
  const NETS = {
    968: { chainId: "0x3c8", chainName: "BOT Chain Testnet", rpcUrls: ["https://rpc.bohr.life"], nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 }, blockExplorerUrls: [D.explorer] },
    677: { chainId: "0x2a5", chainName: "BOT Chain", rpcUrls: ["https://rpc.botchain.ai"], nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 }, blockExplorerUrls: [D.explorer] },
  };
  const ERC20 = ["function symbol() view returns (string)", "function decimals() view returns (uint8)", "function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"];
  const STATUS = ["None", "Submitted", "Under review", "Approved", "Rejected", "Claimed", "Withdrawn", "Expired", "Cancelled"];
  const STATUS_CLASS = ["", "info", "warn", "ok", "bad", "ok", "", "bad", "bad"];
  const STATE = ["Open", "Closed", "Cancelled"];
  const deployed = D.addresses.factory !== ZERO;

  const S = { account: null, signer: null, browser: null };
  const ro = new ethers.JsonRpcProvider(D.rpcUrl, D.chainId, { staticNetwork: true });

  // ───────── safe rendering
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");
  const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const qs = (k) => new URLSearchParams(location.search).get(k);
  const isAddr = (a) => { try { return ethers.isAddress(a); } catch { return false; } };

  // ───────── contracts
  const prov = () => S.signer || ro;
  const C = {
    registry: (w) => new ethers.Contract(D.addresses.providerRegistry, ABI.ProviderRegistry, w ? S.signer : ro),
    appReg: (w) => new ethers.Contract(D.addresses.applicationRegistry, ABI.ApplicationRegistry, w ? S.signer : ro),
    factory: (w) => new ethers.Contract(D.addresses.factory, ABI.ScholarshipFactory, w ? S.signer : ro),
    program: (a, w) => new ethers.Contract(a, ABI.ScholarshipProgram, w ? S.signer : ro),
    erc20: (a, w) => new ethers.Contract(a, ERC20, w ? S.signer : ro),
  };

  // ───────── tokens & formatting
  const tokCache = {};
  async function tokenInfo(addr) {
    if (!addr || addr === ZERO) return { symbol: "BOT", decimals: 18, address: ZERO };
    if (tokCache[addr]) return tokCache[addr];
    let symbol = "USDT", decimals = 6;
    try { const t = C.erc20(addr); [symbol, decimals] = await Promise.all([t.symbol(), t.decimals()]); } catch {}
    return (tokCache[addr] = { symbol, decimals: Number(decimals), address: addr });
  }
  const fmtAmt = (v, t) => {
    const n = ethers.formatUnits(v, t.decimals);
    const [i, f = ""] = n.split(".");
    return Number(i).toLocaleString() + (f && Number(f) ? "." + f.slice(0, 4).replace(/0+$/, "") : "") + " " + t.symbol;
  };
  const fmtDate = (ts) => new Date(Number(ts) * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  const fmtDateTime = (ts) => new Date(Number(ts) * 1000).toLocaleString();
  const now = () => Math.floor(Date.now() / 1000);
  function timeLeft(ts) {
    const d = Number(ts) - now();
    if (d <= 0) return "Closed";
    const days = Math.floor(d / 86400);
    if (days >= 1) return days + (days === 1 ? " day left" : " days left");
    const h = Math.floor(d / 3600);
    return h >= 1 ? h + "h left" : Math.max(1, Math.floor(d / 60)) + "m left";
  }

  // ───────── hashing (documents never leave the browser)
  const toHex = (buf) => "0x" + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  async function sha256File(file) { return toHex(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())); }
  async function bundleHash(files) {
    const hashes = [];
    for (const f of files) hashes.push(await sha256File(f));
    if (hashes.length === 1) return { hash: hashes[0], hashes };
    const joined = [...hashes].sort().join("");
    const bytes = new TextEncoder().encode(joined);
    return { hash: toHex(await crypto.subtle.digest("SHA-256", bytes)), hashes };
  }
  const textHash = (t) => (t && t.trim() ? ethers.id(t.trim()) : ethers.ZeroHash);

  // ───────── UI helpers
  function toast(msg, kind = "") {
    let box = $("#toasts");
    if (!box) { box = document.createElement("div"); box.id = "toasts"; box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
    const t = document.createElement("div");
    t.className = "toast " + kind; t.textContent = msg; box.appendChild(t);
    setTimeout(() => t.remove(), kind === "err" ? 8000 : 4500);
  }
  function errMsg(e) {
    const m = e?.reason || e?.shortMessage || e?.info?.error?.message || e?.message || String(e);
    if (/user rejected|ACTION_REJECTED/i.test(m + (e?.code || ""))) return "Transaction cancelled in wallet.";
    return m.replace(/^execution reverted: /, "").slice(0, 220);
  }
  async function send(label, fn, btn) {
    if (!S.signer) { toast("Connect your wallet first.", "err"); throw new Error("no wallet"); }
    const old = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "Confirm in wallet…"; }
    try {
      const tx = await fn();
      toast(label + " — submitted, waiting for confirmation…");
      const rc = await tx.wait();
      toast(label + " — confirmed.", "ok");
      return rc;
    } catch (e) { toast(errMsg(e), "err"); throw e; }
    finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
  }
  const loading = (el, text = "Loading…") => { el.innerHTML = `<div class="empty"><span class="spinner"></span> ${esc(text)}</div>`; };
  const statusChip = (s) => `<span class="chip ${STATUS_CLASS[s]}">${STATUS[s]}</span>`;
  const stateChip = (o) => {
    const st = Number(o.state);
    if (st === 2) return '<span class="chip bad">Cancelled</span>';
    if (st === 1) return '<span class="chip">Closed</span>';
    return Number(o.deadline) < now() ? '<span class="chip warn">Applications closed</span>' : '<span class="chip ok">Open</span>';
  };
  const bit = (mask, i) => ((BigInt(mask) >> BigInt(i)) & 1n) === 1n;

  // ───────── wallet
  async function ensureChain(eth) {
    const want = NETS[D.chainId];
    const cur = await eth.request({ method: "eth_chainId" });
    if (cur === want.chainId) return;
    try { await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: want.chainId }] }); }
    catch (e) {
      if (e.code === 4902 || /Unrecognized chain/i.test(e.message || "")) await eth.request({ method: "wallet_addEthereumChain", params: [want] });
      else throw e;
    }
  }
  async function connect(silent) {
    const eth = window.ethereum;
    if (!eth) { if (!silent) toast("No wallet found. Install MetaMask or another EVM wallet.", "err"); return null; }
    try {
      const accounts = await eth.request({ method: silent ? "eth_accounts" : "eth_requestAccounts" });
      if (!accounts.length) return null;
      await ensureChain(eth);
      S.browser = new ethers.BrowserProvider(eth);
      S.signer = await S.browser.getSigner();
      S.account = ethers.getAddress(accounts[0]);
      renderWallet();
      return S.account;
    } catch (e) { if (!silent) toast(errMsg(e), "err"); return null; }
  }
  function renderWallet() {
    const b = $("#wallet-btn"); if (!b) return;
    b.textContent = S.account ? short(S.account) : "Connect wallet";
    b.className = "btn " + (S.account ? "secondary" : "") + " sm";
  }

  // ───────── layout
  function layout(active) {
    const links = [["index.html", "Home"], ["explorer.html", "Scholarships"], ["student.html", "Student"], ["provider.html", "Provider"], ["reviewer.html", "Reviewer"], ["admin.html", "Admin"]];
    const h = document.createElement("header");
    h.className = "site-header";
    h.innerHTML = `<div class="wrap"><a class="brand" href="index.html"><span class="mark" aria-hidden="true">🎓</span><span class="t">SchoChain</span></a>
      <nav class="nav" aria-label="Main">${links.map(([u, t]) => `<a href="${u}" class="${u === active ? "active" : ""}">${t}</a>`).join("")}</nav>
      <button id="wallet-btn" class="btn sm" type="button">Connect wallet</button></div>`;
    document.body.prepend(h);
    if (!deployed) {
      const b = document.createElement("div"); b.className = "banner";
      b.textContent = "Contracts are not deployed yet — run the deploy script (see README) to enable live data.";
      document.body.prepend(b);
    }
    const f = document.createElement("footer");
    f.className = "site-footer";
    f.innerHTML = `<div class="wrap"><p><strong>Privacy notice.</strong> Everything written to a blockchain is public and permanent. SchoChain stores only wallet addresses, application status, public eligibility declarations and document <em>hashes</em>. A hash proves a file was not altered — it does not hide, encrypt or store the file. Never put personal data in any text field.</p>
      <p>SchoChain · BOT Chain · <a href="${esc(D.explorer)}" rel="noopener" target="_blank">Explorer</a></p></div>`;
    document.body.appendChild(f);
    $("#wallet-btn").addEventListener("click", () => connect(false).then(() => window.dispatchEvent(new Event("scho:wallet"))));
    if (window.ethereum) {
      window.ethereum.on?.("accountsChanged", () => location.reload());
      window.ethereum.on?.("chainChanged", () => location.reload());
    }
  }

  // ───────── data loaders
  async function loadProgram(addr) {
    const p = C.program(addr);
    const o = await p.overview();
    const t = await tokenInfo(o.token);
    return { address: addr, o, t, criteria: null };
  }
  async function loadAllPrograms() {
    if (!deployed) return [];
    const addrs = await C.factory().allPrograms();
    return (await Promise.all(addrs.map((a) => loadProgram(a).catch(() => null)))).filter(Boolean).reverse();
  }
  function programCard(pr) {
    const { o, t } = pr;
    const funded = o.totalFunded - o.totalPaid - o.totalRefunded;
    const need = o.awardAmount * BigInt(o.maxAwards);
    const pct = need === 0n ? 0 : Math.min(100, Number((funded * 100n) / need));
    return `<article class="card sch-card">
      <div class="inline" style="justify-content:space-between">${stateChip(o)}<span class="small muted">${esc(timeLeft(o.deadline))}</span></div>
      <div><h3><a href="scholarship.html?p=${pr.address}" style="color:inherit;text-decoration:none">${esc(o.title)}</a></h3>
      <p class="muted small" style="margin:0">${esc(o.summary).slice(0, 140) || "No summary provided."}</p></div>
      <div class="meta"><div class="kv">Award<b>${esc(fmtAmt(o.awardAmount, t))}</b></div><div class="kv">Awards<b>${Number(o.awardCount)} / ${Number(o.maxAwards)}</b></div>
      <div class="kv">Deadline<b>${esc(fmtDate(o.deadline))}</b></div><div class="kv">Applicants<b>${Number(o.applicationCount)}</b></div></div>
      <div><div class="progress" role="img" aria-label="Pool funded ${pct}%"><i style="width:${pct}%"></i></div><div class="small muted" style="margin-top:4px">Pool ${pct}% funded for all awards</div></div>
      <a class="btn secondary" href="scholarship.html?p=${pr.address}">View details</a></article>`;
  }
  function timeline(status, decisionPublished) {
    const steps = ["Submitted", "Under review", "Decision", "Paid"];
    let idx = { 1: 0, 2: 1, 3: 2, 4: 2, 5: 3, 6: 0, 7: 2, 8: 0 }[status] ?? 0;
    const bad = [4, 6, 7, 8].includes(status);
    return `<div class="timeline" aria-label="Application progress">${steps.map((s, i) => {
      let c = i < idx ? "done" : i === idx ? (bad ? "bad" : status === 5 ? "done" : "now") : "";
      if (status === 3 && i === 2) c = "done";
      if (status === 5) c = "done";
      return `<div class="step ${c}">${s}</div>`;
    }).join("")}</div>`;
  }

  window.SCHO = { D, ABI, ZERO, S, ro, C, esc, safeUrl, short, $, $$, qs, isAddr, tokenInfo, fmtAmt, fmtDate, fmtDateTime, now, timeLeft, sha256File, bundleHash, textHash, toast, errMsg, send, loading, statusChip, stateChip, bit, connect, layout, loadProgram, loadAllPrograms, programCard, timeline, STATUS, STATE, deployed };
})();
