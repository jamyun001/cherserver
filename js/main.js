/* 메인 페이지 동작 — 보통은 고칠 필요 없어요 */
if (!window.PREREG_CONFIG) {
  const p = document.createElement("p");
  p.className = "demo";
  p.textContent = "config.js 에 오류가 있어요. 따옴표(\"), 쉼표(,)가 빠지지 않았는지 확인해 주세요.";
  document.body.prepend(p);
  throw new Error("config.js 를 불러오지 못했어요");
}
{
/* 설정은 config.js 에 있어요 */
const CONFIG = window.PREREG_CONFIG;
const SOURCES = [["friend","친구 추천"],["youtube","유튜브"],["discord","디스코드"],["server_list","서버 홍보 사이트"],["community","커뮤니티·카페"],["etc","기타"]];

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num = v => Math.max(0, Math.floor(Number(v) || 0));
const NICK = /^[A-Za-z0-9_ ]{3,16}$/;
const norm = s => s.trim().replace(/\s+/g, " ");
const API = String(CONFIG.SUPABASE_URL).replace(/\/+$/, "");
const demo = !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(API) || !CONFIG.SUPABASE_ANON_KEY;
const CACHE_KEY = "prereg_status_v1", CACHE_MS = 60000;
let ST = { count: 0, top: [], mine: null, closed: false };

/* 데모용 예시 데이터 */
const D = { count: 137, names: new Set(["blockking","minersoo","creeperhan","diajun","steve kr"]),
  rank: [["BlockKing",12],["MinerSoo",9],["CreeperHan",7],["DiaJun",4],["Steve kr",2]], mine: null };
const demoStatus = () => ({ closed: false, count: D.count, top: [...D.rank].sort((a, b) => b[1] - a[1]).slice(0, 10), mine: D.mine });

/* Supabase 호출: 함수 2개만 사용 (get_status, preregister) */
const rpc = async (fn, body) => {
  const headers = { "Content-Type": "application/json", apikey: CONFIG.SUPABASE_ANON_KEY };
  if (CONFIG.SUPABASE_ANON_KEY.startsWith("eyJ")) headers.Authorization = "Bearer " + CONFIG.SUPABASE_ANON_KEY;
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(body || {}), signal: ctrl.signal, credentials: "omit", cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw { code: j?.code, message: j?.message };
    return j;
  } finally { clearTimeout(t); }
};

const cacheGet = () => { try { const c = JSON.parse(localStorage.getItem(CACHE_KEY)); return c && Date.now() - c.t < CACHE_MS ? c.d : null; } catch { return null; } };
const cacheSet = d => { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d })); } catch {} };

/* 정적 내용 */
$("demo").hidden = !demo;
$("serverName").textContent = $("footName").textContent = CONFIG.SERVER_NAME;
$("tagline").textContent = CONFIG.TAGLINE;
document.title = CONFIG.SERVER_NAME + " 사전예약";
$("infoCards").innerHTML = CONFIG.INFO.map(([k, v]) => `<div class="card"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
$("faq").innerHTML = CONFIG.FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("");

/* 카운트다운 (DB 사용 안 함) */
const open = new Date(CONFIG.OPEN_DATE);
$("openText").textContent = open.toLocaleString("ko-KR", {month:"long", day:"numeric", weekday:"short", hour:"numeric", minute:"2-digit"});
const pad = n => String(n).padStart(2, "0");
const tick = () => {
  const t = Math.max(0, open - Date.now()) / 1000;
  $("cd-d").textContent = pad(Math.floor(t / 86400));
  $("cd-h").textContent = pad(Math.floor(t % 86400 / 3600));
  $("cd-m").textContent = pad(Math.floor(t % 3600 / 60));
  $("cd-s").textContent = pad(Math.floor(t % 60));
};
tick(); setInterval(tick, 1000);

/* 예약자 수 + 달성 보상 */
const renderCount = n => {
  $("total").textContent = n.toLocaleString("ko-KR");
  const max = CONFIG.REWARDS[CONFIG.REWARDS.length - 1][0];
  $("barFill").style.width = Math.min(100, n / max * 100) + "%";
  $("rewards").innerHTML = CONFIG.REWARDS.map(([g, t, d]) =>
    `<li class="rw${n >= g ? " on" : ""}"><div class="goal">${g}명</div><div><strong>${esc(t)}${n >= g ? " · 달성!" : ""}</strong><small>${esc(d)}</small></div></li>`).join("");
};

/* 추천 랭킹 */
const renderRank = rows => {
  $("podium").innerHTML = [1, 0, 2].map(i => {
    const r = rows[i], [prize, desc] = CONFIG.REF_REWARDS[i];
    return `<div class="pd p${i + 1}"><span class="place">${i + 1}등</span>
      <span class="nm">${r ? esc(r[0]) : "비어 있음"}</span>
      <span class="ct">${r ? `추천 ${num(r[1])}명` : "지금 도전해 보세요"}</span>
      <div class="prize"><b>${esc(prize)}</b>${esc(desc)}</div></div>`;
  }).join("");
  const rest = rows.slice(3);
  $("rlist").hidden = !rest.length;
  $("rlist").innerHTML = rest.map((r, i) => `<li><span class="n">${i + 4}</span><span class="who2">${esc(r[0])}</span><span class="c">${num(r[1])}명</span></li>`).join("");
};

/* 예약 폼 */
const viewForm = () => `
  <div class="box">
  <h2>사전예약 신청</h2>
  <form id="form" novalidate>
    <div class="field">
      <label for="nickname">마크 닉네임 (베드락)</label>
      <input type="text" id="nickname" maxlength="16" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Steve 123">
      <div class="hint">게임 안의 닉네임 그대로 적어 주세요. 오픈 보상이 이 닉네임으로 지급돼요.</div>
    </div>
    <div class="field">
      <span class="lab" id="srcLab">어디서 알게 되셨나요?</span>
      <div class="src" role="radiogroup" aria-labelledby="srcLab">
        ${SOURCES.map(([v, t], i) => `<input type="radio" name="source" id="s-${v}" value="${v}"${i ? "" : " checked"}><label for="s-${v}">${esc(t)}</label>`).join("")}
      </div>
    </div>
    <div class="field" id="refField">
      <label for="referrer">추천해 준 친구 닉네임</label>
      <input type="text" id="referrer" maxlength="16" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="친구의 마크 닉네임">
      <div class="hint">친구가 먼저 사전예약을 해 둬야 해요. 친구의 추천 랭킹 점수가 1점 올라가요.</div>
    </div>
    <div class="field">
      <label class="check"><input type="checkbox" id="agree"> 보상 지급과 중복 참여 확인을 위해 마크 닉네임과 접속 정보(IP, 암호화 저장)를 수집하는 데 동의해요.</label>
    </div>
    <button class="btn full" type="submit" id="submitBtn">사전예약 완료하기</button>
    <div class="msg" id="msg" role="status" aria-live="polite"></div>
    <ul class="rules">
      <li>인터넷(IP) 하나당 1번, 닉네임 하나당 1번만 예약할 수 있어요.</li>
      <li>같은 와이파이를 쓰는 가족·친구는 한 명만 예약돼요.</li>
      <li>예약 후에는 수정이나 재예약이 안 돼요.</li>
    </ul>
  </form>
  </div>`;

/* 마감 화면 */
const viewClosed = () => `
  <div class="box">
    <h2>사전예약이 마감됐어요</h2>
    <p>참여해 주셔서 고마워요! 오픈 소식은 디스코드에서 알려 드릴게요.</p>
  </div>`;

/* 예약자 화면 (예약 확인증) */
const viewMine = m => {
  const rankIdx = ST.top.findIndex(r => String(r[0]).toLowerCase() === String(m.nickname).toLowerCase());
  const when = new Date(m.created_at);
  return `
  <div class="ticket" id="ticket">
    <div class="head"><span class="px">RESERVED</span><b>No.${num(m.no)}</b></div>
    <div class="body">
      <h3>${esc(m.nickname)} 님</h3>
      <p class="sub">사전예약이 완료됐어요! 오픈 날 이 닉네임으로 접속하면 보상이 지급돼요.</p>
      <dl class="tk">
        <div><dt>예약 번호</dt><dd>${num(m.no)}번째</dd></div>
        <div><dt>예약 일시</dt><dd>${isNaN(when) ? "-" : esc(when.toLocaleString("ko-KR", {month:"numeric", day:"numeric", hour:"numeric", minute:"2-digit"}))}</dd></div>
        <div><dt>내 추천 수</dt><dd>${num(m.refs)}명</dd></div>
        <div><dt>추천 랭킹</dt><dd>${rankIdx >= 0 ? `${rankIdx + 1}등` : "순위 밖"}</dd></div>
        ${m.referrer ? `<div><dt>나를 추천한 친구</dt><dd>${esc(m.referrer)}</dd></div>` : ""}
      </dl>
      <div class="share">
        <p>친구가 예약할 때 추천인에 <b>${esc(m.nickname)}</b> 을(를) 적으면 내 추천 수가 올라가요.</p>
        <button class="copy" type="button" id="copyBtn">초대 문구 복사</button>
      </div>
      <p class="sub" style="margin-top:14px">이 인터넷(IP)으로 예약된 정보예요.</p>
    </div>
  </div>`;
};

const msg = (t, err) => { const m = $("msg"); if (m) { m.textContent = t; m.className = "msg" + (err ? " err" : ""); } };

const render = () => {
  renderCount(num(ST.count));
  renderRank(Array.isArray(ST.top) ? ST.top : []);
  $("box").outerHTML = `<div id="box">${ST.mine ? viewMine(ST.mine) : ST.closed ? viewClosed() : viewForm()}</div>`;
  $("heroCta").textContent = ST.mine ? "내 예약 확인하기" : ST.closed ? "사전예약 마감" : "사전예약 하기";
  $("copyBtn")?.addEventListener("click", copyInvite);
  const f = $("form");
  if (f) {
    f.addEventListener("submit", submit);
    const sync = () => { $("refField").hidden = f.querySelector("input[name=source]:checked").value !== "friend"; };
    f.querySelectorAll("input[name=source]").forEach(r => r.addEventListener("change", sync));
    sync();
  }
};

const setStatus = d => {
  if (!d || typeof d !== "object") return;
  ST = { closed: d.closed === true, count: num(d.count), top: Array.isArray(d.top) ? d.top : [], mine: d.mine && typeof d.mine === "object" ? d.mine : null };
  render();
};

/* 페이지 열 때 딱 1번 (60초 안에 다시 열면 캐시 사용) */
const load = async () => {
  if (demo) return setStatus(demoStatus());
  const c = cacheGet();
  if (c) return setStatus(c);
  try { const d = await rpc("get_status"); cacheSet(d); setStatus(d); }
  catch { render(); }
};

let busy = false;
const submit = async e => {
  e.preventDefault();
  if (busy) return;
  const nickname = norm($("nickname").value);
  const source = document.querySelector("input[name=source]:checked").value;
  const referrer = source === "friend" ? norm($("referrer").value) : null;
  if (!NICK.test(nickname)) return msg("닉네임은 영문, 숫자, 밑줄(_), 띄어쓰기로 3~16자여야 해요.", true);
  if (source === "friend") {
    if (!referrer) return msg("추천해 준 친구의 닉네임을 적어 주세요.", true);
    if (!NICK.test(referrer)) return msg("친구 닉네임 형식을 다시 확인해 주세요.", true);
    if (referrer.toLowerCase() === nickname.toLowerCase()) return msg("자기 자신은 추천할 수 없어요.", true);
  }
  if (!$("agree").checked) return msg("정보 수집에 동의해야 예약할 수 있어요.", true);

  busy = true; $("submitBtn").disabled = true; msg("예약 중…");
  try {
    let d;
    if (demo) {
      await new Promise(r => setTimeout(r, 400));
      if (D.mine) throw { code: "P0001", message: "이 인터넷(IP)에서는 이미 사전예약을 했어요." };
      if (D.names.has(nickname.toLowerCase())) throw { code: "P0001", message: "이미 사전예약된 닉네임이에요." };
      const row = referrer && D.rank.find(r => r[0].toLowerCase() === referrer.toLowerCase());
      if (referrer && !D.names.has(referrer.toLowerCase())) throw { code: "P0001", message: "추천인 닉네임이 사전예약 명단에 없어요. 친구가 먼저 예약해야 해요." };
      D.names.add(nickname.toLowerCase()); D.count++;
      if (referrer) row ? row[1]++ : D.rank.push([referrer, 1]);
      D.mine = { no: D.count, nickname, referrer: row ? row[0] : referrer, created_at: new Date().toISOString(), refs: 0 };
      d = demoStatus();
    } else {
      d = await rpc("preregister", { p_nickname: nickname, p_source: source, p_referrer: referrer, p_agreed: true });
      cacheSet(d);
    }
    setStatus(d);
    $("signup").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  } catch (err) {
    msg(err?.code === "P0001" && err.message ? err.message : "예약에 실패했어요. 잠시 후 다시 시도해 주세요.", true);
    if (!demo && /마감됐어요/.test(err?.message || "")) { try { localStorage.removeItem(CACHE_KEY); } catch {} load(); }
    if (!demo && /이미 사전예약을 했어요/.test(err?.message || "")) { try { localStorage.removeItem(CACHE_KEY); } catch {} load(); }
  } finally {
    busy = false;
    if ($("submitBtn")) $("submitBtn").disabled = false;
  }
};

const copyInvite = async () => {
  const text = `${CONFIG.SERVER_NAME} 사전예약 같이 하자! 추천인에 "${ST.mine.nickname}" 적어 줘 👉 ${location.origin + location.pathname}`;
  try { await navigator.clipboard.writeText(text); $("copyBtn").textContent = "복사했어요!"; }
  catch { $("copyBtn").textContent = "복사가 안 돼요. 직접 공유해 주세요."; }
};

load();
}
