/***** =========================
 *  experiment.js  (jsPsych v6.3.1)
 *  - PC限定（モバイルはメッセージのみ表示）
 *  - 同意クリックで静かにフルスクリーン
 *  - 練習2本 → 本番（stimuli/manifest.json 優先）
 *  - 各試行：注視点(1000ms) → 再生(Canvas) → 1ページ5件法（リッカート＋SD）＋自由記述
 *    ・各項目は「〇—〇—〇—〇—〇」（端で線が止まる／はみ出し無し）
 *    ・選択ドットは薄いグレー（SELECT_COLORで調整可）
 *  - IMC：本番の最後のページのみ、リッカート末尾に“しれっと”1行追加（左から4番目が正答）
 *  - 問順：リッカート＝生物性→意図性→かわいい（帰属→審美）
 * ========================== */

/***** 0) PC限定（UA判定：モバイルはここで終了） *****/
const isMobile = /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent);
if (isMobile) {
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f6f7fb;padding:24px;box-sizing:border-box">
      <div style="max-width:720px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;text-align:center;line-height:1.9">
        <h2 style="margin:0 0 12px">パソコン専用の調査です</h2>
        <p>この調査は <strong>PCのみ</strong> でご参加いただけます。<br>
           スマートフォン／タブレットではご参加いただけません。</p>
        <p style="color:#6b7280;font-size:.95rem">PCから再度アクセスしてください。</p>
      </div>
    </div>`;
  throw new Error("Mobile blocked");
}

/***** 送信ユーティリティ（参加者は待つだけ・自動再試行） *****/
const QUEUE_KEY = 'pending_submission_v1';

function showSendingScreen(msg){
  const host = (jsPsych?.getDisplayElement?.() || document.body);
  host.innerHTML = `
    <style>
      @keyframes spin { to { transform: rotate(360deg); } }
      .send-wrap{
        min-height: 70vh; display:flex; flex-direction:column;
        align-items:center; justify-content:center; gap:16px;
        font-size: 1.05rem; color:#111827; text-align:center;
      }
      .spinner{
        width:38px; height:38px; border-radius:50%;
        border:3px solid #cbd5e1; border-top-color:#4b5563;
        animation: spin 0.9s linear infinite;
      }
      .send-note{ color:#6b7280; font-size:.9rem; line-height:1.8; }
    </style>
    <div class="send-wrap" id="send-wrap">
      <div class="spinner" aria-label="送信中"></div>
      <div>${msg || 'データを送信中です…'}</div>
      <div class="send-note">通信が不安定な場合でも、自動で再送を続けます。<br>このままお待ちください。</div>
    </div>
  `;
}

async function postOnce(payload, timeoutMs=15000){
  const controller = new AbortController();
  const t = setTimeout(()=>controller.abort(), timeoutMs);
  try{
    const res = await fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        "form-name": "experiment-data",
        "data": JSON.stringify(payload)
      }),
      signal: controller.signal
    });
    clearTimeout(t);
    if (!res.ok) throw new Error('HTTP '+res.status);
    return true;
  }catch(e){
    clearTimeout(t);
    return false;
  }
}

// 失敗時：ローカルに一時保存し、ページを開いている間は一定間隔で再送を続ける。
// ページを閉じた後でも、次回アクセス時に自動再送（attemptResendPendingOnLoad）が働く。
function queuePending(payload){
  try{ localStorage.setItem(QUEUE_KEY, JSON.stringify(payload)); }catch(e){}
}

function startAutoRetryLoop(payload, onSuccess){
  // すぐ1回試す
  (async ()=>{
    const ok = await postOnce(payload, 15000);
    if (ok){ localStorage.removeItem(QUEUE_KEY); onSuccess(); return; }
    // 以降、15秒間隔で静かに再試行
    const iv = setInterval(async ()=>{
      const ok2 = await postOnce(payload, 15000);
      if (ok2){
        clearInterval(iv);
        localStorage.removeItem(QUEUE_KEY);
        onSuccess();
      }
    }, 15000);
    // オンライン復帰イベントでも即座に1回試す
    const onOnline = async ()=>{
      const ok3 = await postOnce(payload, 15000);
      if (ok3){
        window.removeEventListener('online', onOnline);
        localStorage.removeItem(QUEUE_KEY);
        onSuccess();
      }
    };
    window.addEventListener('online', onOnline);
  })();
}

// 再訪時に未送信があれば黙って再送（UIは出さない）
async function attemptResendPendingOnLoad(){
  const raw = localStorage.getItem(QUEUE_KEY);
  if (!raw) return;
  let payload = null;
  try{ payload = JSON.parse(raw); }catch(e){}
  if (!payload) return;
  // バックグラウンドで静かに再送
  const ok = await postOnce(payload, 12000);
  if (ok){ localStorage.removeItem(QUEUE_KEY); return; }
  // だめなら短時間ループで再試行
  startAutoRetryLoop(payload, ()=>{ /* 成功しても何も表示しない */ });
}
attemptResendPendingOnLoad();


/***** 1) ユーティリティ／定数 *****/
function pid(len = 10){
  const s='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({length:len},()=>s[Math.floor(Math.random()*s.length)]).join('');
}
const PID = pid();
const FIX_MS = 1000;  // 注視点

// ★ 選択色（薄いグレー）。青に戻すなら → '#2563eb' / 'rgba(37,99,235,.22)'
const SELECT_COLOR = '#bfc7d1';
const SELECT_RING  = 'rgba(191,199,209,.22)';

// === 5件法・左＝ポジティブ ===
const LIKERT_POINTS = 5;

// ★ リッカートの尺度ラベル
const SCALE_LABELS_LIKERT = [
  '当てはまる',
  'やや当てはまる',
  'どちらでもない',
  'あまり当てはまらない',
  '当てはまらない'
];

// ★ SDの尺度ラベル
const SCALE_LABELS_SD = [
  '非常に',
  'やや',
  'どちらでもない',
  'やや',
  '非常に'
];

function getLikertLabels(){ return SCALE_LABELS_LIKERT.slice(); }
function getSDLabels(){ return SCALE_LABELS_SD.slice(); }

/***** 2) 質問定義（固定順・左＝ポジティブ） *****/
// リッカート（3項目）※順序＝生物性→意図性→かわいい
const QUESTIONS_LIKERT_BASE = [
  { kind:'likert', name:'ANIMACY', label:'●は生き物のように感じましたか' },
  { kind:'likert', name:'INTENT',  label:'●は目的（意図）をもって動いているように感じましたか' },
  { kind:'likert', name:'KAWAII',  label:'●をかわいいと感じましたか' }
];

// SD（4項目）
const QUESTIONS_SD = [
  { kind:'sd', name:'VALENCE',  label:'快‐不快',     left:'快い',         right:'不快だ' },
  { kind:'sd', name:'APPROACH', label:'接近‐回避',   left:'近づきたい',   right:'避けたい' },
  { kind:'sd', name:'SMOOTH',   label:'ぎこちなさ', left:'洗練された',   right:'ぎこちない' },
  { kind:'sd', name:'PREDICT',  label:'予測性',       left:'予測しやすい', right:'予測しにくい' }
];

// IMCを“しれっと”行として差し込む（本番の最後のページだけ）
function buildLikertItems(includeIMC_silent){
  const arr = [...QUESTIONS_LIKERT_BASE];
  if (includeIMC_silent) {
    arr.push({
      kind:'likert_imc', name:'IMC_silent',
      // 通常色・通常サイズ（目立たない）。正解＝左から4番目
      label:'この項目に限り、左から4番目を選んでください'
    });
  }
  return arr;
}

/***** 3) 質問ページ（各行＝バー 〇—〇—〇—〇—〇） *****/
function makeSurveyPage(opts, file=null, index1=null){
  const o = Object.assign(
    { includeIMC:false, allowFreeText:true, phase:'main' },
    opts
  );

  const labelsLikert = getLikertLabels();
  const labelsSD     = getSDLabels();

  const itemsLikert = buildLikertItems(o.includeIMC);
  const itemsSD     = QUESTIONS_SD;

  const css = `
  <style>
    .page-wrap{ max-width:920px; margin:0 auto; }
    .blk{ margin: 14px 0; }
    .section-title{ margin: 8px 0 4px; color:#111827; font-weight:700; font-size:1.05rem }

    /* ===================== Likert（質問文＋バー） ===================== */
    .lm-wrap{ width:100%; }
    .lm-head{
      display:grid; grid-template-columns:minmax(220px,1.05fr) 1fr; gap:10px;
      margin-bottom:4px; color:#6b7280; font-size:.95rem;
    }
    .lm-scale-head{
      display:grid; grid-template-columns:repeat(${LIKERT_POINTS},1fr); gap:10px; text-align:center;
      align-items:end;
    }
    .lm-scale-head > div{
      display:flex; align-items:flex-end; justify-content:center; line-height:1.05; padding-bottom:2px;
    }
    .lm-row{
      display:grid; grid-template-columns:minmax(220px,1.05fr) 1fr; align-items:center; gap:10px;
      background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:10px 12px; margin:10px 0;
    }
    .lm-label{ font-weight:600; line-height:1.55; color:#374151; } /* ← SD左右アンカーと色を合わせる */

    .lm-strip{
      position:relative; display:grid; grid-template-columns:repeat(${LIKERT_POINTS},1fr);
      gap:10px; align-items:center;
    }
    /* ★ 半分線（端では描かない）— 背面・クリック非干渉 */
    .lm-cell{ position:relative; display:flex; justify-content:center; }
    .lm-cell::before, .lm-cell::after{
      content:""; position:absolute; top:50%; transform:translateY(-50%);
      height:2px; width:calc(50% + 5px);
      background:#d1d5db; z-index:0; pointer-events:none;
    }
    .lm-cell::before{ left:-5px; }
    .lm-cell::after{  right:-5px; }
    .lm-cell:first-child::before{ display:none; }
    .lm-cell:last-child::after{  display:none; }

    .lm-cell input{ position:absolute; opacity:0; inset:0; cursor:pointer; z-index:2; }
    .lm-cell span{
      position:relative; z-index:1;
      width:20px; height:20px; border-radius:50%;
      border:2px solid #cbd5e1; background:#fff; display:inline-block; transition:all .12s ease;
    }
    .lm-cell:hover span{ border-color:#b6c1cd; }
    .lm-cell input:checked + span{
      background:${SELECT_COLOR}; border-color:${SELECT_COLOR}; box-shadow:0 0 0 2px ${SELECT_RING};
    }

    /* ===================== SD（左右アンカー＋バー） ===================== */
    .sd-wrap{ width:100%; }
    .sd-head{
      display:grid; grid-template-columns:minmax(110px,.9fr) 1fr minmax(110px,.9fr); gap:10px;
      margin-bottom:4px; color:#6b7280; font-size:.95rem;
    }
    .sd-scale-head{
      display:grid; grid-template-columns:repeat(${LIKERT_POINTS},1fr); gap:10px; text-align:center;
      align-items:end;
    }
    .sd-scale-head > div{
      display:flex; align-items:flex-end; justify-content:center; line-height:1.05; padding-bottom:2px;
    }

    .sd-row{
      display:grid; grid-template-columns:minmax(110px,.9fr) 1fr minmax(110px,.9fr); align-items:center; gap:10px;
      background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:10px 12px; margin:10px 0;
    }
    .sd-anch{ text-align:center; font-weight:600; color:#374151; } /* ← Likert質問文と色を統一 */

    .sd-strip{
      position:relative; display:grid; grid-template-columns:repeat(${LIKERT_POINTS},1fr);
      gap:10px; align-items:center;
    }
    .sd-cell{ position:relative; display:flex; justify-content:center; }
    .sd-cell::before, .sd-cell::after{
      content:""; position:absolute; top:50%; transform:translateY(-50%);
      height:2px; width:calc(50% + 5px);
      background:#d1d5db; z-index:0; pointer-events:none;
    }
    .sd-cell::before{ left:-5px; }
    .sd-cell::after{  right:-5px; }
    .sd-cell:first-child::before{ display:none; }
    .sd-cell:last-child::after{  display:none; }

    .sd-cell input{ position:absolute; opacity:0; inset:0; cursor:pointer; z-index:2; }
    .sd-cell span{
      position:relative; z-index:1;
      width:20px; height:20px; border-radius:50%;
      border:2px solid #cbd5e1; background:#fff; display:inline-block; transition:all .12s ease;
    }
    .sd-cell:hover span{ border-color:#b6c1cd; }
    .sd-cell input:checked + span{
      background:${SELECT_COLOR}; border-color:${SELECT_COLOR}; box-shadow:0 0 0 2px ${SELECT_RING};
    }

    /* 自由記述 */
    .free{ width:100%; min-height:80px; }
  </style>`;

  // 1) リッカート・ブロック（上部尺度ラベル＋各行バー）
  const likertHeader = `
    <div class="lm-head">
      <div></div>
      <div class="lm-scale-head">
        ${labelsLikert.map(l=>`<div>${l}</div>`).join('')}
      </div>
    </div>`;
  const likertRows = itemsLikert.map(q=>{
    const cells = labelsLikert.map((lab,i)=>{
      return `<label class="lm-cell">
                <input type="radio" name="${q.name}" value="${i+1}" required aria-label="${lab}">
                <span></span>
              </label>`;
    }).join('');
    return `<div class="lm-row">
              <div class="lm-label">${q.label}</div>
              <div class="lm-strip">${cells}</div>
            </div>`;
  }).join('');

  // 2) SD・ブロック（左右アンカー＋上部尺度ラベル＋各行バー）
  const sdHeader = `
    <div class="sd-head">
      <div></div>
      <div class="sd-scale-head">
        ${labelsSD.map(l=>`<div>${l}</div>`).join('')}
      </div>
      <div></div>
    </div>`;
  const sdRows = itemsSD.map(q=>{
    const cells = labelsSD.map((lab,i)=>{
      return `<label class="sd-cell">
                <input type="radio" name="${q.name}" value="${i+1}" required aria-label="${lab}">
                <span></span>
              </label>`;
    }).join('');
    return `<div class="sd-row">
              <div class="sd-anch">${q.left}</div>
              <div class="sd-strip">${cells}</div>
              <div class="sd-anch">${q.right}</div>
            </div>`;
  }).join('');

  // 自由記述
  const free = o.allowFreeText
    ? `<div class="blk"><div class="section-title">自由記述（任意）</div>
         <textarea name="free_text" class="free" placeholder="気づいた点があればご記入ください"></textarea>
       </div>`
    : ``;

  // ページHTML
  const html = `${css}
    <div class="page-wrap">
      <div class="blk">
        <div class="section-title">評価（リッカート：5件法・左＝ポジティブ）</div>
        <div class="lm-wrap">
          ${likertHeader}
          ${likertRows}
        </div>
      </div>
      <div class="blk">
        <div class="section-title">評価（SD法：5件法・左＝ポジティブ）</div>
        <div class="sd-wrap">
          ${sdHeader}
          ${sdRows}
        </div>
      </div>
      ${free}
    </div>`;

  return {
    type:'survey-html-form',
    preamble:'<h3>質問にお答えください</h3>',
    html,
    button_label:'次へ',
    on_finish: (d)=>{
      // v6: responses は JSON文字列。なければ空。
      const resp = (d && typeof d.response === 'object' && d.response !== null)
        ? d.response
        : (d && typeof d.responses === 'string' ? JSON.parse(d.responses) : {});
      d.participant_id = PID;
      d.block = o.phase==='practice' ? 'practice' : 'main';
      d.stimulus_file = file || null;
      d.trial_index1 = index1 || null;

      // しれっとIMC（最後のページのみ includeIMC=true で呼ばれる）
      if (o.includeIMC) {
        const v = resp['IMC_silent'];            // '1'..'5'
        d.imc_silent = v ?? null;
        d.imc_silent_pass = (v === '4') ? 1 : 0; // ★ 左から4番目が正解（変更するならここ）
      }
    }
  };
}

/***** 4) 注視点（1000ms・大きめプラス） *****/
function makeFixation(ms=1000){
  return {
    type:'html-keyboard-response',
    stimulus:'<div style="font-size:120px;line-height:1;text-align:center;">+</div>',
    choices: jsPsych.NO_KEYS,
    trial_duration: ms
  };
}

/***** 5) 刺激の再生（Canvas／旧・新フォーマット両対応） *****/
function normalizeStim(raw){
  // 旧: ball.positions = [[x,y],...]
  if (raw?.ball && Array.isArray(raw.ball.positions)) {
    return {
      W: raw.canvas?.width ?? 800,
      H: raw.canvas?.height ?? 600,
      BG: raw.canvas?.background ?? '#ffffff',
      R: raw.parameters?.radius ?? 30,
      goal: raw.goal || null,
      obstacle: raw.obstacle || null,
      positions: raw.ball.positions.map(([x,y]) => ({x,y})),
      color: raw.ball?.color ?? '#333333'
    };
  }
  // 新: frames = [{x,y,...},...], settings に各種パラメータ
  if (Array.isArray(raw?.frames) && raw?.settings) {
    return {
      W: raw.settings.W ?? 800,
      H: raw.settings.H ?? 600,
      BG: '#ffffff',
      R: raw.settings.R ?? 30,
      goal: raw.settings.USE_GOAL ? raw.settings.GOAL || null : null,
      obstacle: raw.settings.USE_OBSTACLE ? raw.settings.OBSTACLE || null : null,
      positions: raw.frames.map(f => ({x:f.x, y:f.y})),
      color: '#333333'
    };
  }
  // 不明形式
  return { W:800, H:600, BG:'#fff', R:30, positions:[] };
}

function makePlayback(file){
  return {
    type:'html-keyboard-response',
    stimulus:'<canvas id="cv" width="800" height="600" style="display:block;margin:0 auto;"></canvas>',
    choices: jsPsych.NO_KEYS,
    on_load: async function(){
      try{
        const root = (jsPsych.getDisplayElement && jsPsych.getDisplayElement()) || document;
        let cv = root.querySelector('#cv') || root.querySelector('canvas');
        if (!cv) {
          const host = root.querySelector('#jspsych-html-keyboard-response-stimulus') || root;
          cv = document.createElement('canvas'); cv.id='cv'; cv.width=800; cv.height=600;
          host.appendChild(cv);
        }
        const ctx = cv.getContext('2d');

        const r = await fetch(file);
        if (!r.ok) throw new Error(`fetch failed ${file} [${r.status}]`);
        const raw = await r.json();
        const data = normalizeStim(raw);

        cv.width = data.W; cv.height = data.H;

        let f = 0;
        function drawFrame(){
          const p = data.positions[f++];
          if (!p) { jsPsych.finishTrial(); return; }
          // 背景
          ctx.fillStyle = data.BG; ctx.fillRect(0,0,data.W,data.H);
          // goal
          if (data.goal){
            ctx.fillStyle = data.goal.color || '#ff6666';
            ctx.beginPath(); ctx.arc(data.goal.x, data.goal.y, data.goal.radius||15, 0, Math.PI*2); ctx.fill();
          }
          // obstacle
          if (data.obstacle){
            ctx.fillStyle = data.obstacle.color || 'gray';
            ctx.fillRect(data.obstacle.x, data.obstacle.y, data.obstacle.width, data.obstacle.height);
          }
          // ball
          ctx.fillStyle = data.color || '#333';
          ctx.beginPath(); ctx.arc(p.x, p.y, data.R, 0, Math.PI*2); ctx.fill();

          requestAnimationFrame(drawFrame);
        }
        requestAnimationFrame(drawFrame);
      }catch(e){
        console.error(e);
        jsPsych.finishTrial(); // 失敗時も止まらず次へ
      }
    },
    on_finish:(d)=>{ d.block='stim'; d.stimulus_file=file; }
  };
}

/***** 6) 刺激リスト（manifest 優先 → trial_001..040 へフォールバック） *****/
async function preloadStimuliList(){
  try {
    const r = await fetch('stimuli/manifest.json', { cache: 'no-store' });
    if (r.ok) {
      const m = await r.json();
      if (Array.isArray(m.main) && m.main.length) {
        return m.main.map(n => encodeURI(`stimuli/${n}`)); // スペース・日本語名にも耐える
      }
    }
  } catch (e) {
    console.warn('manifest 読み込みに失敗:', e);
  }
  const arr = [];
  for (let i=1;i<=40;i++){
    const k = String(i).padStart(3,'0');
    arr.push(`stimuli/trial_${k}.json`);
  }
  return arr;
}

/***** 7) タイムライン *****/
const timeline = [];

// 同意（同意のクリックと同じジェスチャでフルスクリーン要求）
timeline.push({
  type: 'html-button-response',
  stimulus: `
    <h2>図形の動きに対する印象アンケート</h2>
    <p>この研究の目的は、図形の動きに対する印象（かわいさ／生物性／意図性 等）を調べることです。</p>
    <p>所要時間は約20分です。PCのみ参加可能です。途中での中断はご遠慮ください。</p>
  `,
  choices: ['同意する','同意しない'],
  on_load: () => {
    const btns = document.querySelectorAll('.jspsych-btn');
    if (btns[0]) btns[0].addEventListener('click', () => {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) {
        el.requestFullscreen().catch(()=>{ /* 失敗しても無視 */ });
      }
    }, { once:true });
  },
  on_finish: (d)=>{ if (d.button_pressed === '1') { jsPsych.endExperiment('同意が得られませんでした。'); } }
});

// 操作説明
timeline.push({
  type: 'html-button-response',
  stimulus: `
    <h3>操作説明</h3>
    <p>図形のアニメーションを見て、続いて表示される質問（1ページ）にお答えください。</p>
    <p><strong>5件法・左＝ポジティブ</strong>です。注意チェックは最後のページに1問だけ含まれます。</p>
  `,
  choices: ['練習を始める']
});

// 練習（2本）
const practiceFiles = [
  'stimuli/st_m_g_01.json',
  'stimuli/st_m_g_02.json'
];
for (let i=0;i<practiceFiles.length;i++){
  timeline.push(makeFixation(FIX_MS));
  timeline.push(makePlayback(practiceFiles[i]));
  timeline.push(makeSurveyPage({ includeIMC:false, allowFreeText:true, phase:'practice' }));
}

/***** 8) 本番ブロックを非同期で構築 → jsPsych.init *****/
async function main(){
  const stimFiles = await preloadStimuliList();

  // ★ 練習→本番のブリッジ（ここからが本番です）
  timeline.push({
    type: 'html-button-response',
    stimulus: `
      <h3>本番開始</h3>
      <p>ここからが本番です。先ほどと同じ形式でアニメーションが表示されます。</p>
      <p>アニメーションの後に表示される質問に回答してください。</p>
    `,
    choices: ['開始する']
  });

  const order = jsPsych.randomization.shuffle(stimFiles); // 刺激順ランダム（必要なら固定可）

  order.forEach((file, idx)=>{
    timeline.push(makeFixation(FIX_MS));
    timeline.push(makePlayback(file));

    const n = idx + 1;
    const isLast = (n === order.length);     // ★ 最後のページだけ IMC（しれっと行）を含める

    timeline.push(makeSurveyPage({
      includeIMC: isLast,
      allowFreeText: true,
      phase: 'main'
    }, file, n));
  });

  // 終了アンケート（年齢・性別）
  timeline.push({
    type: 'survey-html-form',
    preamble: '<h3>最後に、年齢と性別をお聞かせください。</h3>',
    html: `
      <p>年齢：<input name="age" type="number" min="18" max="100" required style="width:6em"></p>
      <p>性別：
        <label><input type="radio" name="gender" value="female" required>女性</label>
        <label><input type="radio" name="gender" value="male">男性</label>
        <label><input type="radio" name="gender" value="other">その他</label>
        <label><input type="radio" name="gender" value="noanswer">回答しない</label>
      </p>
    `,
    button_label: '次へ',
    on_finish:(d)=>{ d.participant_id = PID; d.block='demographics'; }
  });

  // 最終自由記述（任意）
  timeline.push({
    type: 'survey-html-form',
    preamble:'<h3>ご意見・ご感想（任意）</h3><p>実験全体を通して気づいたことがあればご記入ください。</p>',
    html:`<textarea name="comment" rows="4" style="width:100%"></textarea>`,
    button_label: '送信へ',
    on_finish:(d)=>{ d.participant_id = PID; d.block='final_comment'; }
  });

  // 完了画面（全画面解除して終了）
  timeline.push({
    type:'html-button-response',
    stimulus:'<h2>これで終了です。ご協力ありがとうございました！</h2>',
    choices:['完了'],
    on_finish: () => { if (document.fullscreenElement) document.exitFullscreen?.(); }
  });

  // jsPsych 初期化（Netlify POST つき）
  jsPsych.init({
    display_element: 'jspsych-target',
    timeline: timeline,
    on_finish: async function(){
  // 送信中の待機画面（参加者は待つだけ）
  showSendingScreen('データを送信中です…');

  // ペイロード（metaはあなたの追記分を踏襲）
  const payload = {
    id: PID,
    when: new Date().toISOString(),
    meta: {
      site: location.host,
      ver: "2025-10-04a",
      ua: navigator.userAgent,
      vp: { w: innerWidth, h: innerHeight },
      // order は main() 内で定義済みなので参照可能
      stim_order: (typeof order !== 'undefined') ? order : null
    },
    data: JSON.parse(jsPsych.data.get().json())
  };

  // まず1〜2回だけ即時試行（短時間で決まるケースを拾う）
  let ok = await postOnce(payload, 15000);
  if (!ok) ok = await postOnce(payload, 15000);

  if (ok){
    if (document.fullscreenElement) document.exitFullscreen?.();
    jsPsych.endExperiment('データを送信しました。ご参加ありがとうございました。<br><br>このウィンドウを閉じて終了してください。');
    return;
  }

  // ここに来たら通信不安定：一時保存し、参加者には「送信中」のまま待ってもらいながら自動再試行
  queuePending(payload);
  startAutoRetryLoop(payload, ()=>{
    if (document.fullscreenElement) document.exitFullscreen?.();
    jsPsych.endExperiment('データを送信しました。ご参加ありがとうございました。<br><br>このウィンドウを閉じて終了してください。');
  });
}

  });
}

main();
