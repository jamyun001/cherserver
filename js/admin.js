/* 관리자 페이지 동작 — 보통은 고칠 필요 없어요 */
if (!window.PREREG_CONFIG) {
  const p = document.createElement("p");
  p.className = "demo";
  p.textContent = "config.js 에 오류가 있어요. 따옴표(\"), 쉼표(,)가 빠지지 않았는지 확인해 주세요.";
  document.body.prepend(p);
  throw new Error("config.js 를 불러오지 못했어요");
}
{
/* 설정은 ../config.js 에 있어요 */
const CONFIG = window.PREREG_CONFIG;

const SOURCES = { friend: "친구 추천", youtube: "유튜브", discord: "디스코드", server_list: "서버 홍보 사이트", community: "커뮤니티·카페", etc: "기타" };
const PAGE = 50;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num = v => Math.max(0, Math.floor(Number(v) || 0));
const NICK = /^[A-Za-z0-9_ ]{3,16}$/;
const API = String(CONFIG.SUPABASE_URL).replace(/\/+$/, "");
const demo = !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(API) || !CONFIG.SUPABASE_ANON_KEY;
const SKEY = "prereg_admin_session";
let session = null, rows = [], closed = false, shown = PAGE, editId = null, delId = null;

$("demo").hidden = !demo;
$("title").textContent = CONFIG.SERVER_NAME + " 관리자";
$("loginSub").textContent = CONFIG.SERVER_NAME + " 사전예약 관리 페이지예요.";
document.title = CONFIG.SERVER_NAME + " 관리자";
$("fSource").innerHTML = `<option value="">경로 전체</option>` + Object.entries(SOURCES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");

/* ---------- 세션 (탭을 닫으면 로그아웃) ---------- */
const saveSession = s => { session = s; try { s ? sessionStorage.setItem(SKEY, JSON.stringify(s)) : sessionStorage.removeItem(SKEY); } catch {} };
try { session = JSON.parse(sessionStorage.getItem(SKEY)); } catch { session = null; }

const authFetch = async (path, body, token) => {
  const headers = { "Content-Type": "application/json", apikey: CONFIG.SUPABASE_ANON_KEY };
  if (token) headers.Authorization = "Bearer " + token;
  const r = await fetch(API + path, { method: "POST", headers, body: JSON.stringify(body || {}), credentials: "omit", cache: "no-store" });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw { status: r.status, code: j?.code, message: j?.message };
  return j;
};
const toSession = j => ({ at: j.access_token, rt: j.refresh_token, exp: j.expires_at ? j.expires_at * 1000 : Date.now() + num(j.expires_in) * 1000 });

const token = async () => {
  if (!session) throw { status: 401 };
  if (Date.now() > session.exp - 60000) {
    try { saveSession(toSession(await authFetch("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.rt }))); }
    catch { saveSession(null); throw { status: 401 }; }
  }
  return session.at;
};

const rpc = async (fn, body) => {
  try { return await authFetch("/rest/v1/rpc/" + fn, body, await token()); }
  catch (e) {
    if (e.status === 401) { showLogin("로그인이 만료됐어요. 다시 로그인해 주세요."); }
    throw e;
  }
};
const errText = e => (e?.code === "P0001" || e?.code === "42501") && e.message ? e.message : "요청에 실패했어요. 잠시 후 다시 시도해 주세요.";

/* ---------- 데모 데이터 ---------- */
const demoRows = (() => {
  const names = ["BlockKing","MinerSoo","CreeperHan","DiaJun","Steve kr","PixelMin","RedstoneHo","EnderYu","LavaJin","OakTree_7","SnowFox","GoldRush","NightOwl","BeeKeeper","CaveDiver","SkyBuild","IronJae","SlimeBall","TNT_Boom","RiverLee","MoonStone","CopperKid","AxolotlLv","BambooPan"];
  const src = ["youtube","friend","discord","friend","server_list","community","friend","etc"];
  const now = Date.now();
  return names.map((n, i) => {
    const s = i < 3 ? ["youtube","discord","server_list"][i] : src[i % src.length];
    const ref = s === "friend" ? names[[0, 0, 1, 0, 2, 1][i % 6]] : null;
    return { id: i + 1, nickname: n, source: s, referrer: ref === n ? null : ref, created_at: new Date(now - (names.length - i) * 13 * 3600e3).toISOString(), verified: i % 3 === 0 };
  });
})();
const withRefs = list => {
  const c = {}, v = {};
  list.forEach(r => { if (r.referrer) { const k = r.referrer.toLowerCase(); c[k] = (c[k] || 0) + 1; if (r.verified) v[k] = (v[k] || 0) + 1; } });
  return list.map(r => ({ ...r, refs: c[r.nickname.toLowerCase()] || 0, vrefs: v[r.nickname.toLowerCase()] || 0 }));
};

/* ---------- 화면 전환 ---------- */
const showLogin = m => {
  saveSession(null);
  $("appView").hidden = true; $("loginView").hidden = false;
  $("loginMsg").textContent = m || "";
};
const showApp = () => { $("loginView").hidden = true; $("appView").hidden = false; };

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("email").value.trim(), pw = $("pw").value;
  if (!email || !pw) return $("loginMsg").textContent = "이메일과 비밀번호를 입력해 주세요.";
  $("loginBtn").disabled = true; $("loginMsg").textContent = "";
  try {
    if (demo) saveSession({ at: "demo", rt: "demo", exp: Date.now() + 36e5 });
    else saveSession(toSession(await authFetch("/auth/v1/token?grant_type=password", { email, password: pw })));
    $("pw").value = "";
    await load();
  } catch (err) {
    showLogin(err?.status === 400 ? "이메일 또는 비밀번호가 틀렸어요." : err?.status === 429 ? "시도가 너무 많아요. 잠시 후 다시 해 주세요." : "로그인에 실패했어요.");
  } finally { $("loginBtn").disabled = false; }
});

$("logoutBtn").addEventListener("click", async () => {
  if (!demo && session) { try { await authFetch("/auth/v1/logout", {}, session.at); } catch {} }
  rows = []; showLogin("로그아웃했어요.");
});

/* ---------- 데이터 ---------- */
const load = async () => {
  $("reloadBtn").disabled = true;
  try {
    let d;
    if (demo) d = { closed, rows: withRefs(demoRows) };
    else d = await rpc("admin_list");
    rows = Array.isArray(d?.rows) ? d.rows : [];
    closed = d?.closed === true;
    shown = PAGE;
    showApp(); renderAll();
    $("loadedAt").textContent = "불러온 시각 " + new Date().toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
  } catch (err) {
    if (err?.code === "42501") showLogin("이 계정은 관리자로 등록되어 있지 않아요.");
    else if (err?.status !== 401) { showApp(); $("topMsg").textContent = errText(err); $("topMsg").className = "msg err"; }
  } finally { $("reloadBtn").disabled = false; }
};
$("reloadBtn").addEventListener("click", load);

const recount = () => {
  const c = {}, v = {};
  rows.forEach(r => { if (r.referrer) { const k = r.referrer.toLowerCase(); c[k] = (c[k] || 0) + 1; if (r.verified) v[k] = (v[k] || 0) + 1; } });
  rows.forEach(r => { r.refs = c[r.nickname.toLowerCase()] || 0; r.vrefs = v[r.nickname.toLowerCase()] || 0; });
};

/* ---------- 그리기 ---------- */
const dayKey = d => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; };
const fmt = d => { const x = new Date(d); return isNaN(x) ? "-" : x.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }); };

const renderAll = () => { renderKpis(); renderSwitch(); renderSources(); renderDays(); renderRank(); renderList(); };

const renderKpis = () => {
  const total = rows.length, today = dayKey(Date.now());
  const t = rows.filter(r => dayKey(r.created_at) === today).length;
  const f = rows.filter(r => r.source === "friend").length;
  const v = rows.filter(r => r.verified).length;
  const pct = n => total ? Math.round(n / total * 100) + "%" : "0%";
  $("kpis").innerHTML = [
    ["총 예약", total, "명"], ["오늘 예약", t, "명"], ["친구 추천으로 온 사람", f, pct(f)], ["서버 접속 확인", v, pct(v)]
  ].map(([k, n, s]) => `<div class="kpi"><small>${k}</small><b>${n.toLocaleString("ko-KR")}</b><span>${s}</span></div>`).join("");
};

const renderSwitch = () => {
  $("openState").textContent = closed ? "마감됨" : "받는 중";
  $("openState").className = "st " + (closed ? "off" : "on");
  $("toggleBtn").textContent = closed ? "다시 열기" : "예약 마감하기";
  $("toggleBtn").className = "btn" + (closed ? "" : " danger");
};

const renderSources = () => {
  const c = {}; rows.forEach(r => c[r.source] = (c[r.source] || 0) + 1);
  const max = Math.max(1, ...Object.values(c));
  $("sources").innerHTML = Object.entries(SOURCES).sort((a, b) => (c[b[0]] || 0) - (c[a[0]] || 0)).map(([k, v]) =>
    `<div class="hrow"><span>${esc(v)}</span><div class="tr"><i style="width:${(c[k] || 0) / max * 100}%"></i></div><span class="v">${c[k] || 0}명</span></div>`).join("");
};

const renderDays = () => {
  const c = {}; rows.forEach(r => { const k = dayKey(r.created_at); c[k] = (c[k] || 0) + 1; });
  const list = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i); list.push([d, c[dayKey(d)] || 0]); }
  const max = Math.max(1, ...list.map(x => x[1]));
  $("days").innerHTML = list.map(([d, n]) =>
    `<div class="d" title="${d.getMonth() + 1}/${d.getDate()} ${n}명"><b>${n || ""}</b><i style="height:${n / max * 100}%"></i><span>${d.getMonth() + 1}/${d.getDate()}</span></div>`).join("");
};

const renderRank = () => {
  const top = rows.filter(r => r.refs > 0).sort((a, b) => b.refs - a.refs || b.vrefs - a.vrefs).slice(0, 10);
  $("rankBody").innerHTML = top.length ? top.map((r, i) =>
    `<tr><td class="n" data-l="순위">${i + 1}</td><td data-l="닉네임">${esc(r.nickname)}</td><td class="n" data-l="전체 추천">${num(r.refs)}</td><td class="n" data-l="접속 확인된 추천"><b>${num(r.vrefs)}</b></td></tr>`).join("")
    : `<tr><td colspan="4" class="empty">아직 추천 기록이 없어요.</td></tr>`;
};

const filtered = () => {
  const q = $("q").value.trim().toLowerCase(), s = $("fSource").value, v = $("fVer").value;
  return rows.filter(r =>
    (!q || r.nickname.toLowerCase().includes(q) || (r.referrer || "").toLowerCase().includes(q)) &&
    (!s || r.source === s) && (!v || (v === "y") === !!r.verified)
  ).slice().reverse();
};

const renderList = () => {
  const list = filtered(), part = list.slice(0, shown);
  $("listCount").textContent = `${list.length.toLocaleString("ko-KR")}명`;
  $("empty").hidden = list.length > 0;
  $("moreBtn").hidden = list.length <= shown;
  $("listBody").innerHTML = part.map(r => `<tr>
    <td class="n" data-l="번호">${num(r.id)}</td>
    <td data-l="닉네임"><b>${esc(r.nickname)}</b></td>
    <td data-l="경로"><span class="tag">${esc(SOURCES[r.source] || r.source)}</span></td>
    <td data-l="추천인">${esc(r.referrer || "-")}</td>
    <td class="n" data-l="추천 수">${num(r.refs)}</td>
    <td class="t" data-l="예약 일시">${esc(fmt(r.created_at))}</td>
    <td data-l="접속 확인"><input class="chk" type="checkbox" data-ver="${num(r.id)}" ${r.verified ? "checked" : ""} aria-label="${esc(r.nickname)} 접속 확인"></td>
    <td data-l="관리"><div class="rowacts"><button class="btn ghost" type="button" data-edit="${num(r.id)}">수정</button><button class="btn ghost" type="button" data-del="${num(r.id)}">삭제</button></div></td>
  </tr>`).join("");
};

["q", "fSource", "fVer"].forEach(id => $(id).addEventListener("input", () => { shown = PAGE; renderList(); }));
$("moreBtn").addEventListener("click", () => { shown += PAGE; renderList(); });

const topMsg = (t, err) => { $("topMsg").textContent = t; $("topMsg").className = "msg" + (err ? " err" : ""); };
const byId = id => rows.find(r => r.id === id);

/* ---------- 동작 ---------- */
$("listBody").addEventListener("change", async e => {
  const id = num(e.target.dataset.ver); if (!id) return;
  const r = byId(id); if (!r) return;
  const val = e.target.checked; e.target.disabled = true;
  try {
    if (!demo) await rpc("admin_update", { p_id: id, p_verified: val });
    r.verified = val; recount(); renderKpis(); renderRank();
  } catch (err) { e.target.checked = !val; topMsg(errText(err), true); }
  finally { e.target.disabled = false; }
});

$("listBody").addEventListener("click", e => {
  const ed = num(e.target.dataset.edit), dl = num(e.target.dataset.del);
  if (ed) { const r = byId(ed); if (!r) return; editId = ed; $("editNick").value = r.nickname; $("editMsg").textContent = ""; $("editDlg").showModal(); $("editNick").focus(); }
  if (dl) { const r = byId(dl); if (!r) return; delId = dl; $("delText").textContent = `${r.nickname} 님의 예약을 삭제할까요?`; $("delMsg").textContent = ""; $("delDlg").showModal(); }
});
document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => b.closest("dialog").close()));

$("editForm").addEventListener("submit", async e => {
  e.preventDefault();
  const r = byId(editId); if (!r) return;
  const nick = $("editNick").value.trim().replace(/\s+/g, " ");
  if (!NICK.test(nick)) return $("editMsg").textContent = "영문, 숫자, 밑줄(_), 띄어쓰기로 3~16자여야 해요.";
  if (rows.some(x => x.id !== r.id && x.nickname.toLowerCase() === nick.toLowerCase())) return $("editMsg").textContent = "이미 있는 닉네임이에요.";
  try {
    if (!demo) await rpc("admin_update", { p_id: r.id, p_nickname: nick });
    const old = r.nickname.toLowerCase();
    rows.forEach(x => { if (x.referrer && x.referrer.toLowerCase() === old) x.referrer = nick; });
    r.nickname = nick; recount(); renderAll();
    $("editDlg").close(); topMsg(`닉네임을 ${nick}(으)로 바꿨어요.`);
  } catch (err) { $("editMsg").textContent = errText(err); }
});

$("delOk").addEventListener("click", async () => {
  const r = byId(delId); if (!r) return;
  $("delOk").disabled = true;
  try {
    if (!demo) await rpc("admin_delete", { p_id: r.id });
    const old = r.nickname.toLowerCase();
    rows = rows.filter(x => x.id !== r.id);
    rows.forEach(x => { if (x.referrer && x.referrer.toLowerCase() === old) x.referrer = null; });
    recount(); renderAll();
    $("delDlg").close(); topMsg(`${r.nickname} 님의 예약을 삭제했어요.`);
  } catch (err) { $("delMsg").textContent = errText(err); }
  finally { $("delOk").disabled = false; }
});

$("toggleBtn").addEventListener("click", async () => {
  const next = !closed; $("toggleBtn").disabled = true;
  try {
    if (!demo) await rpc("admin_set_closed", { p_closed: next });
    closed = next; renderSwitch();
    topMsg(next ? "사전예약을 마감했어요. 메인 페이지는 최대 1분 뒤 반영돼요." : "사전예약을 다시 열었어요.");
  } catch (err) { topMsg(errText(err), true); }
  finally { $("toggleBtn").disabled = false; }
});

/* CSV (엑셀에서 한글 깨짐 방지 BOM 포함) */
$("csvBtn").addEventListener("click", () => {
  const cell = v => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const head = ["번호","닉네임","경로","추천인","추천 수","접속 확인된 추천","접속 확인","예약 일시"];
  const body = rows.map(r => [r.id, r.nickname, SOURCES[r.source] || r.source, r.referrer || "", r.refs, r.vrefs, r.verified ? "O" : "", fmt(r.created_at)]);
  const csv = "﻿" + [head, ...body].map(l => l.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `사전예약_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

/* 시작 */
if (session) load(); else showLogin("");
            }
