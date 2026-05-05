/* ========================================
   シラバス外部レビューデータベース — SPA
   ======================================== */
'use strict';

// ========================================
// 状態管理
// ========================================
const state = {
  token:   localStorage.getItem('token'),
  user:    JSON.parse(localStorage.getItem('user') || 'null'),
  masters: {},
};

// ========================================
// 共通ユーティリティ
// ========================================

/**
 * API 呼び出しラッパー
 * token があれば Authorization ヘッダーを付与する
 */
async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;

  try {
    const res = await fetch(path, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) {
      return { error: data.error || `HTTPエラー: ${res.status}` };
    }
    return data;
  } catch (err) {
    console.error('API エラー:', err);
    return { error: 'ネットワークエラーが発生しました' };
  }
}

/** localStorage にトークン・ユーザー情報を保存し state を更新する */
function setAuth(token, user) {
  state.token = token;
  state.user  = user;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

/** ログアウト: localStorage をクリアしてログイン画面へ */
function clearAuth() {
  state.token = null;
  state.user  = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  location.hash = '#/login';
}

/** マスターデータを取得して state.masters に保存する */
async function loadMasters() {
  const res = await api('GET', '/api/masters');
  if (!res.error) {
    state.masters = res.data || {};
  }
}

// ========================================
// 評価ラベル → バッジクラスのマッピング
// ========================================
const EVAL_BADGE = { '秀': 'badge-s', '優': 'badge-a', '良': 'badge-b', '可': 'badge-c', '不可': 'badge-d' };

function evalBadgeHtml(label) {
  if (!label) return '';
  const cls = EVAL_BADGE[label] || 'badge-muted';
  const span = document.createElement('span');
  span.className = 'badge ' + cls;
  span.textContent = label;
  return span.outerHTML;
}

// ========================================
// ナビゲーション描画
// ========================================
function renderNav() {
  const hash = location.hash || '#/';
  const isActive = (path) => hash.startsWith(path) ? 'active' : '';

  const adminNav = state.user && state.user.role === 'admin'
    ? `<a class="nav-item ${isActive('#/admin')}" href="#/admin">
         <span class="nav-icon">⚙️</span>管理画面
       </a>`
    : '';

  const authSection = state.user
    ? `<div class="user-info">
         <div class="user-name">${escT(state.user.display_name || state.user.username)}</div>
         <div class="user-role">${state.user.role === 'admin' ? '管理者' : '教員'}</div>
       </div>
       <button class="btn-logout" id="btn-logout">ログアウト</button>`
    : `<button class="btn-login-nav" id="btn-login-nav">ログイン</button>`;

  const sidebarHtml = `
    <aside class="sidebar">
      <div class="sidebar-logo">
        <div class="logo-title">シラバス外部<br>レビューDB</div>
        <div class="logo-sub">Syllabus Review Database</div>
      </div>
      <nav class="sidebar-nav">
        <div class="nav-section-label">メニュー</div>
        <a class="nav-item ${isActive('#/syllabi') || isActive('#/')}" href="#/syllabi">
          <span class="nav-icon">📋</span>シラバスレビュー
        </a>
        <a class="nav-item ${isActive('#/koma')}" href="#/koma">
          <span class="nav-icon">📅</span>コマシラバス
        </a>
        <a class="nav-item ${isActive('#/assignments')}" href="#/assignments">
          <span class="nav-icon">📝</span>課題レビュー
        </a>
        ${adminNav}
      </nav>
      <div class="sidebar-footer">
        ${authSection}
      </div>
    </aside>`;

  // 既存サイドバーを差し替え（または初回挿入）
  const existing = document.querySelector('.sidebar');
  if (existing) {
    existing.outerHTML = sidebarHtml;
  }

  // ログアウトボタンのイベント
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) btnLogout.addEventListener('click', clearAuth);

  const btnLogin = document.getElementById('btn-login-nav');
  if (btnLogin) btnLogin.addEventListener('click', () => { location.hash = '#/login'; });
}

// ========================================
// ルーティング
// ========================================
async function router() {
  const hash = location.hash || '#/';

  // ログイン画面: サイドバーなし
  if (hash === '#/login') {
    document.getElementById('app').innerHTML = '';
    renderLogin();
    return;
  }

  // 共通レイアウト確保（サイドバー + メインコンテンツ）
  const app = document.getElementById('app');
  if (!app.querySelector('.sidebar')) {
    app.innerHTML = '<aside class="sidebar"></aside><main class="main-content" id="main"></main>';
  }
  renderNav();

  const main = document.getElementById('main');
  if (!main) return;

  // パターンマッチ
  if (hash === '#/' || hash === '#/syllabi') {
    await renderSyllabusList(main);
  } else if (hash === '#/syllabi/new') {
    await renderSyllabusForm(main, null);
  } else if (/^#\/syllabi\/(\d+)\/edit$/.test(hash)) {
    const id = hash.match(/^#\/syllabi\/(\d+)\/edit$/)[1];
    await renderSyllabusForm(main, id);
  } else if (/^#\/syllabi\/(\d+)$/.test(hash)) {
    const id = hash.match(/^#\/syllabi\/(\d+)$/)[1];
    await renderSyllabusDetail(main, id);
  } else if (hash === '#/koma') {
    await renderKomaList(main);
  } else if (hash === '#/assignments') {
    await renderAssignmentList(main);
  } else if (hash === '#/admin') {
    await renderAdmin(main);
  } else {
    main.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>ページが見つかりません</p></div>`;
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('load', async () => {
  // CDNライブラリのロード確認（コンソールに出力）
  console.log('[CDN check] marked:', typeof marked, typeof marked !== 'undefined' ? (typeof marked.parse) : 'N/A');
  console.log('[CDN check] DOMPurify:', typeof DOMPurify);
  await loadMasters();
  router();
});

// ========================================
// テキストエスケープ（XSS防止: textContent 代替として属性値等に使用）
// ========================================
function escT(str) {
  if (str == null) return '';
  return String(str);
}

// ========================================
// Markdownレンダリング（DOMPurify必須）
// ========================================
function renderMd(text) {
  if (!text) return '';
  try {
    // marked は関数またはオブジェクトとして提供される場合がある
    const parseFn = (typeof marked !== 'undefined')
      ? (typeof marked.parse === 'function' ? marked.parse.bind(marked) : marked)
      : null;
    const sanitizeFn = (typeof DOMPurify !== 'undefined')
      ? DOMPurify.sanitize.bind(DOMPurify)
      : null;

    if (parseFn && sanitizeFn) {
      const parsed = parseFn(text);
      // marked v5+ は同期で string を返す。Promise が返った場合はフォールバック
      if (typeof parsed === 'string') {
        return sanitizeFn(parsed);
      }
    }
  } catch (e) {
    console.warn('renderMd error:', e);
  }
  // フォールバック: 改行を <br> に変換して安全にエスケープして表示
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// ========================================
// Markdownタブフィールドを生成するヘルパー
// fieldId: 一意のID文字列、value: 初期値、readonly: 読み取り専用か
// ========================================
function createMdField(fieldId, value, readonly) {
  const wrap = document.createElement('div');
  wrap.className = 'md-field';

  if (readonly) {
    // 読み取り専用: プレビューのみ
    const previewDiv = document.createElement('div');
    previewDiv.className = 'md-preview-area active md-content md-readonly';
    previewDiv.innerHTML = renderMd(value);
    wrap.appendChild(previewDiv);
  } else {
    // 編集モード: タブ・テキストエリア・プレビューを個別に生成
    // ---- タブバー ----
    const tabBar = document.createElement('div');
    tabBar.className = 'md-tabs';
    const tabEdit    = document.createElement('button');
    tabEdit.type     = 'button';
    tabEdit.className = 'md-tab active';
    tabEdit.textContent = '編集';
    const tabPreview  = document.createElement('button');
    tabPreview.type   = 'button';
    tabPreview.className = 'md-tab';
    tabPreview.textContent = 'プレビュー';
    tabBar.appendChild(tabEdit);
    tabBar.appendChild(tabPreview);
    wrap.appendChild(tabBar);

    // ---- 編集エリア ----
    const editArea = document.createElement('div');
    editArea.className = 'md-edit-area active';
    const textarea = document.createElement('textarea');
    textarea.className = 'form-control';
    textarea.dataset.mdField = fieldId;   // getMdValue で参照するためのマーカー
    textarea.value = value || '';          // .value で設定（innerHTML 不使用）
    editArea.appendChild(textarea);
    wrap.appendChild(editArea);

    // ---- プレビューエリア ----
    const previewArea = document.createElement('div');
    previewArea.className = 'md-preview-area md-content';
    wrap.appendChild(previewArea);

    // ---- タブ切り替え（wrap スコープで参照） ----
    tabEdit.addEventListener('click', () => {
      tabEdit.classList.add('active');    tabPreview.classList.remove('active');
      editArea.classList.add('active');   previewArea.classList.remove('active');
    });
    tabPreview.addEventListener('click', () => {
      tabPreview.classList.add('active'); tabEdit.classList.remove('active');
      previewArea.classList.add('active'); editArea.classList.remove('active');
      try {
        previewArea.innerHTML = renderMd(textarea.value);
      } catch(e) {
        previewArea.innerHTML = renderMd(textarea.value); // renderMd内で処理済み
      }
    });
  }

  return wrap;
}

/** Markdownタブフィールドの値を取得する */
function getMdValue(fieldId) {
  const ta = document.querySelector(`[data-md-field="${fieldId}"]`);
  return ta ? ta.value : '';
}

// ========================================
// チップ選択UIを生成するヘルパー
// ========================================
function createChipGroup(options, selectedIds, readonly) {
  const wrap = document.createElement('div');
  wrap.className = 'chip-group';

  const displayOptions = readonly
    ? options.filter(o => selectedIds.includes(o.id))
    : options;

  if (displayOptions.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'text-muted';
    empty.textContent = '（なし）';
    wrap.appendChild(empty);
    return wrap;
  }

  displayOptions.forEach(opt => {
    const chip = document.createElement('span');
    chip.className = 'chip' + (selectedIds.includes(opt.id) ? ' selected' : '') + (readonly ? ' readonly' : '');
    chip.textContent = opt.label;
    chip.dataset.id = opt.id;
    if (!readonly) {
      chip.addEventListener('click', () => chip.classList.toggle('selected'));
    }
    wrap.appendChild(chip);
  });

  return wrap;
}

/** チップグループから選択済みIDを取得する */
function getChipSelectedIds(container) {
  return Array.from(container.querySelectorAll('.chip.selected')).map(c => parseInt(c.dataset.id, 10));
}

// ========================================
// 評価選択UIを生成するヘルパー
// ========================================
function createEvalOpts(options, selectedId, readonly) {
  const wrap = document.createElement('div');
  wrap.className = 'eval-opts';

  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'eval-opt' + (opt.id === selectedId ? ' selected' : '') + (readonly ? ' readonly' : '');
    btn.dataset.id    = opt.id;
    btn.dataset.label = opt.label;
    btn.setAttribute('data-label', opt.label);
    btn.textContent   = opt.label;
    if (!readonly) {
      btn.addEventListener('click', () => {
        wrap.querySelectorAll('.eval-opt').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    }
    wrap.appendChild(btn);
  });

  return wrap;
}

/** 評価UIから選択済みIDを取得する */
function getEvalSelectedId(container) {
  const sel = container.querySelector('.eval-opt.selected');
  return sel ? parseInt(sel.dataset.id, 10) : null;
}

// ========================================
// ローディング表示
// ========================================
function showLoading(container) {
  container.innerHTML = `<div class="loading"><div class="spinner"></div>読み込み中…</div>`;
}

// ========================================
// エラー表示
// ========================================
function showError(container, message) {
  const div = document.createElement('div');
  div.className = 'form-error';
  div.textContent = message;
  container.appendChild(div);
}

// ========================================
// スタブ（後続プロンプトで実装）
// ========================================
// ========================================
// シラバスレビュー一覧画面
// ========================================
async function renderSyllabusList(main) {
  main.innerHTML = '';

  // ページヘッダー
  const header = document.createElement('div');
  header.className = 'page-header';

  const titleEl = document.createElement('h1');
  titleEl.className = 'page-title';
  titleEl.textContent = 'シラバスレビュー一覧';
  header.appendChild(titleEl);

  if (state.user) {
    const btnNew = document.createElement('button');
    btnNew.className = 'btn btn-primary';
    btnNew.textContent = '＋ 新規作成';
    btnNew.addEventListener('click', () => { location.hash = '#/syllabi/new'; });
    header.appendChild(btnNew);
  }
  main.appendChild(header);

  // フィルターバー
  const filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';

  // 年度プルダウン（データ取得後に動的生成）
  const yearGroup = document.createElement('div');
  yearGroup.className = 'form-group';
  yearGroup.innerHTML = '<label class="form-label">年度</label>';
  const yearSel = document.createElement('select');
  yearSel.className = 'form-control';
  yearSel.id = 'filter-year';
  yearSel.innerHTML = '<option value="">すべての年度</option>';
  yearGroup.appendChild(yearSel);
  filterBar.appendChild(yearGroup);

  // 学部名プルダウン
  const deptGroup = document.createElement('div');
  deptGroup.className = 'form-group';
  deptGroup.innerHTML = '<label class="form-label">学部名</label>';
  const deptSel = document.createElement('select');
  deptSel.className = 'form-control';
  deptSel.id = 'filter-dept';
  deptSel.innerHTML = '<option value="">すべての学部</option>';
  (state.masters.department || []).forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = d.label;
    deptSel.appendChild(opt);
  });
  deptGroup.appendChild(deptSel);
  filterBar.appendChild(deptGroup);

  // 科目名テキスト検索
  const keywordGroup = document.createElement('div');
  keywordGroup.className = 'form-group';
  keywordGroup.innerHTML = '<label class="form-label">科目名</label>';
  const keywordInput = document.createElement('input');
  keywordInput.type = 'text';
  keywordInput.className = 'form-control';
  keywordInput.id = 'filter-keyword';
  keywordInput.placeholder = 'キーワードで検索…';
  keywordGroup.appendChild(keywordInput);
  filterBar.appendChild(keywordGroup);

  main.appendChild(filterBar);

  // テーブルエリア
  const card = document.createElement('div');
  card.className = 'card';
  main.appendChild(card);

  // テーブル描画関数
  async function loadList() {
    const year    = yearSel.value;
    const deptId  = deptSel.value;
    const keyword = keywordInput.value.trim();

    const params = new URLSearchParams();
    if (year)    params.set('year', year);
    if (deptId)  params.set('department_id', deptId);
    if (keyword) params.set('keyword', keyword);

    card.innerHTML = '<div class="loading"><div class="spinner"></div>読み込み中…</div>';

    const res = await api('GET', '/api/syllabi?' + params.toString());

    if (res.error) {
      card.innerHTML = '';
      showError(card, res.error);
      return;
    }

    const rows = res.data || [];

    // 年度プルダウンを初回のみ構築（全件から一意の年度を抽出）
    if (yearSel.options.length === 1) {
      const yearsRes = await api('GET', '/api/syllabi?' + (deptId ? `department_id=${deptId}` : ''));
      const allRows  = (yearsRes.data || []);
      const years    = [...new Set(allRows.map(r => r.academic_year))].sort((a, b) => b - a);
      years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y + '年度';
        if (String(y) === year) opt.selected = true;
        yearSel.appendChild(opt);
      });
    }

    card.innerHTML = '';

    if (rows.length === 0) {
      card.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>該当するシラバスレビューがありません</p></div>`;
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';

    const table = document.createElement('table');
    table.innerHTML = `
      <thead>
        <tr>
          <th>科目名</th>
          <th>年度</th>
          <th>学部名</th>
          <th>評価</th>
          <th>公開状態</th>
          <th>作成者</th>
          <th></th>
        </tr>
      </thead>`;

    const tbody = document.createElement('tbody');
    rows.forEach(row => {
      const tr = document.createElement('tr');

      // 科目名
      const tdName = document.createElement('td');
      tdName.className = 'td-overflow';
      tdName.style.maxWidth = '200px';
      tdName.textContent = row.subject_name;
      tr.appendChild(tdName);

      // 年度
      const tdYear = document.createElement('td');
      tdYear.textContent = row.academic_year + '年度';
      tr.appendChild(tdYear);

      // 学部名バッジ
      const tdDept = document.createElement('td');
      if (row.department) {
        const badge = document.createElement('span');
        badge.className = 'badge badge-info';
        badge.textContent = row.department;
        tdDept.appendChild(badge);
      }
      tr.appendChild(tdDept);

      // 評価バッジ
      const tdEval = document.createElement('td');
      if (row.evaluation) {
        const cls = EVAL_BADGE[row.evaluation] || 'badge-muted';
        const badge = document.createElement('span');
        badge.className = 'badge ' + cls;
        badge.textContent = row.evaluation;
        tdEval.appendChild(badge);
      }
      tr.appendChild(tdEval);

      // 公開状態バッジ
      const tdPub = document.createElement('td');
      const pubBadge = document.createElement('span');
      pubBadge.className = row.is_published ? 'badge badge-published' : 'badge badge-draft';
      pubBadge.textContent = row.is_published ? '公開' : '非公開';
      tdPub.appendChild(pubBadge);
      tr.appendChild(tdPub);

      // 作成者
      const tdAuthor = document.createElement('td');
      tdAuthor.textContent = row.created_by_name || '';
      tr.appendChild(tdAuthor);

      // 詳細ボタン
      const tdBtn = document.createElement('td');
      tdBtn.style.textAlign = 'right';
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary btn-sm';
      btn.textContent = '詳細';
      btn.addEventListener('click', () => { location.hash = '#/syllabi/' + row.id; });
      tdBtn.appendChild(btn);
      tr.appendChild(tdBtn);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    card.appendChild(wrap);
  }

  // フィルター変更時に再ロード（keyword はデバウンス）
  let debounceTimer = null;
  yearSel.addEventListener('change', loadList);
  deptSel.addEventListener('change', loadList);
  keywordInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadList, 350);
  });

  await loadList();
}
// ========================================
// シラバスレビュー詳細画面
// ========================================
async function renderSyllabusDetail(main, id) {
  showLoading(main);

  await loadMasters(); // 常に最新マスターを取得

  const res = await api('GET', '/api/syllabi/' + id);
  if (res.error) {
    main.innerHTML = '';
    showError(main, res.error);
    return;
  }
  const d = res.data;

  // 権限: 自分のデータ or admin
  const canEdit = state.user && (state.user.role === 'admin' || state.user.id === d.created_by);

  main.innerHTML = '';

  // ページヘッダー
  const header = document.createElement('div');
  header.className = 'page-header';
  const titleWrap = document.createElement('div');
  const titleEl = document.createElement('h1');
  titleEl.className = 'page-title';
  titleEl.textContent = d.subject_name;
  const subEl = document.createElement('div');
  subEl.className = 'text-muted mt-8';
  subEl.textContent = d.academic_year + '年度' + (d.department ? '　' + d.department : '');
  titleWrap.appendChild(titleEl);
  titleWrap.appendChild(subEl);
  header.appendChild(titleWrap);

  const btnGroup = document.createElement('div');
  btnGroup.style.display = 'flex';
  btnGroup.style.gap = '8px';
  if (canEdit) {
    const btnEdit = document.createElement('button');
    btnEdit.className = 'btn btn-primary';
    btnEdit.textContent = '✏️ 編集';
    btnEdit.addEventListener('click', () => { location.hash = '#/syllabi/' + id + '/edit'; });
    btnGroup.appendChild(btnEdit);

    const btnDel = document.createElement('button');
    btnDel.className = 'btn btn-danger';
    btnDel.textContent = '削除';
    btnDel.addEventListener('click', async () => {
      if (!confirm('このシラバスレビューを削除しますか？')) return;
      const r = await api('DELETE', '/api/syllabi/' + id);
      if (r.error) { alert(r.error); return; }
      location.hash = '#/syllabi';
    });
    btnGroup.appendChild(btnDel);
  }
  const btnBack = document.createElement('button');
  btnBack.className = 'btn btn-secondary';
  btnBack.textContent = '← 一覧に戻る';
  btnBack.addEventListener('click', () => { location.hash = '#/syllabi'; });
  btnGroup.appendChild(btnBack);
  header.appendChild(btnGroup);
  main.appendChild(header);

  // PDF エリア
  const pdfCard = document.createElement('div');
  pdfCard.className = 'card';
  const pdfTitle = document.createElement('div');
  pdfTitle.className = 'section-header';
  pdfTitle.textContent = 'PDFレビュー資料';
  pdfCard.appendChild(pdfTitle);

  if (d.pdf_path) {
    // 科目名ラベル（PDFビューアのツールバー文字化け対策）
    const pdfLabel = document.createElement('div');
    pdfLabel.style.cssText = 'font-size:12px;color:#4a6fa5;margin-bottom:6px;font-weight:600;';
    pdfLabel.textContent = d.subject_name + '（' + d.academic_year + '年度）';
    pdfCard.appendChild(pdfLabel);

    const wrap = document.createElement('div');
    wrap.className = 'pdf-preview-wrap';
    const iframe = document.createElement('iframe');
    iframe.src = '/api/syllabi/' + id + '/pdf#toolbar=0';
    iframe.title = d.subject_name;
    wrap.appendChild(iframe);
    pdfCard.appendChild(wrap);
    // 権限ありの場合: PDFアップロードボタンを表示
    if (canEdit) {
      const btnUpload = document.createElement('button');
      btnUpload.className = 'btn btn-secondary btn-sm mt-8';
      btnUpload.textContent = '📄 PDFをアップロード';
      btnUpload.addEventListener('click', () => {
        pdfLabel.remove();
        wrap.remove();
        btnUpload.remove();
        pdfCard.appendChild(buildPdfDropArea(id, pdfCard));
      });
      pdfCard.appendChild(btnUpload);
    }
  } else if (canEdit) {
    pdfCard.appendChild(buildPdfDropArea(id, pdfCard));
  } else {
    const msg = document.createElement('p');
    msg.className = 'text-muted';
    msg.textContent = 'PDFが登録されていません';
    pdfCard.appendChild(msg);
  }
  main.appendChild(pdfCard);

  // 基本情報カード
  const infoCard = document.createElement('div');
  infoCard.className = 'card';

  // 公開状態
  const pubBadge = document.createElement('span');
  pubBadge.className = d.is_published ? 'badge badge-published' : 'badge badge-draft';
  pubBadge.textContent = d.is_published ? '公開' : '非公開';
  infoCard.appendChild(pubBadge);
  infoCard.appendChild(document.createElement('br'));
  infoCard.appendChild(document.createElement('br'));

  // 選択チップ群（読み取り専用）
  const chipFields = [
    { key: 'game_element',       label: 'ゲーム要素の導入' },
    { key: 'consultation_method', label: '教員への相談方法' },
    { key: 'ai_usage_scope',     label: 'AIの使用範囲' },
  ];
  chipFields.forEach(({ key, label }) => {
    const sec = document.createElement('div');
    sec.className = 'form-group';
    const lbl = document.createElement('div');
    lbl.className = 'form-label';
    lbl.textContent = label;
    sec.appendChild(lbl);
    const selectedIds = (d.selections[key] || []).map(s => s.id);
    const opts = (state.masters[key] || []);
    sec.appendChild(createChipGroup(opts, selectedIds, true));
    infoCard.appendChild(sec);
  });

  main.appendChild(infoCard);

  // キャリア形成情報カード
  const careerCard = document.createElement('div');
  careerCard.className = 'card';
  const careerHdr = document.createElement('div');
  careerHdr.className = 'section-header';
  careerHdr.textContent = 'キャリア形成情報';
  careerCard.appendChild(careerHdr);

  // 業種・職種チップ
  ['industry', 'occupation'].forEach((key) => {
    const labels = { industry: '授業内容が役立つ業種', occupation: '授業内容が役立つ職種' };
    const grp = document.createElement('div');
    grp.className = 'form-group';
    const lbl = document.createElement('div');
    lbl.className = 'form-label';
    lbl.textContent = labels[key];
    grp.appendChild(lbl);
    const selectedIds = (d.selections[key] || []).map(s => s.id);
    grp.appendChild(createChipGroup(state.masters[key] || [], selectedIds, true));
    careerCard.appendChild(grp);
  });

  // Markdownフィールド（読み取り専用）
  const mdCareerFields = [
    { key: 'knowledge_skills',  label: '習得できる知識・技能' },
    { key: 'ai_skills',         label: '磨けるAI活用能力' },
    { key: 'non_ict_value',     label: '情報通信業以外で役立つこと' },
  ];
  mdCareerFields.forEach(({ key, label }) => {
    const grp = document.createElement('div');
    grp.className = 'form-group';
    const lbl = document.createElement('div');
    lbl.className = 'form-label';
    lbl.textContent = label;
    grp.appendChild(lbl);
    grp.appendChild(createMdField('detail-' + key, d[key], true));
    careerCard.appendChild(grp);
  });
  main.appendChild(careerCard);

  // シラバス外部評価カード
  const evalCard = document.createElement('div');
  evalCard.className = 'card';
  const evalHdr = document.createElement('div');
  evalHdr.className = 'section-header';
  evalHdr.textContent = 'シラバス外部評価';
  evalCard.appendChild(evalHdr);

  // 評価ボタン（読み取り専用 - 常に表示）
  const evalGrp = document.createElement('div');
  evalGrp.className = 'form-group';
  const evalLbl = document.createElement('div');
  evalLbl.className = 'form-label';
  evalLbl.textContent = '評価';
  evalGrp.appendChild(evalLbl);
  const evalOpts = state.masters.evaluation || [];
  if (evalOpts.length > 0) {
    evalGrp.appendChild(createEvalOpts(evalOpts, d.evaluation_id, true));
  } else if (d.evaluation) {
    // マスターが未ロードの場合はバッジで代替表示
    const badge = document.createElement('span');
    badge.className = 'badge ' + (EVAL_BADGE[d.evaluation] || 'badge-muted');
    badge.style.fontSize = '14px';
    badge.style.padding = '4px 16px';
    badge.textContent = d.evaluation;
    evalGrp.appendChild(badge);
  } else {
    const msg = document.createElement('span');
    msg.className = 'text-muted';
    msg.textContent = '（未設定）';
    evalGrp.appendChild(msg);
  }
  evalCard.appendChild(evalGrp);

  // 評価コメント・大学生のうちに学んでほしいこと（Markdownレンダリング）
  const mdEvalFields = [
    { key: 'evaluation_comment',  label: '評価コメント' },
    { key: 'university_learning', label: '大学生のうちに学んでほしいこと' },
  ];
  mdEvalFields.forEach(({ key, label }) => {
    const grp = document.createElement('div');
    grp.className = 'form-group';
    const lbl = document.createElement('div');
    lbl.className = 'form-label';
    lbl.textContent = label;
    grp.appendChild(lbl);
    grp.appendChild(createMdField('detail-eval-' + key, d[key], true));
    evalCard.appendChild(grp);
  });
  main.appendChild(evalCard);

  // 下部タブ（コマシラバス / 課題レビュー）
  const tabCard = document.createElement('div');
  tabCard.className = 'card';
  const tabBar = document.createElement('div');
  tabBar.className = 'tab-bar';
  const tabKoma = document.createElement('button');
  tabKoma.className = 'tab-btn active';
  tabKoma.textContent = `コマシラバス（${d.koma_count}件）`;
  const tabAssign = document.createElement('button');
  tabAssign.className = 'tab-btn';
  tabAssign.textContent = `課題レビュー（${d.assignment_count}件）`;
  tabBar.appendChild(tabKoma);
  tabBar.appendChild(tabAssign);
  tabCard.appendChild(tabBar);

  const panelKoma   = document.createElement('div');
  panelKoma.className = 'tab-panel active';
  const panelAssign = document.createElement('div');
  panelAssign.className = 'tab-panel';
  tabCard.appendChild(panelKoma);
  tabCard.appendChild(panelAssign);
  main.appendChild(tabCard);

  tabKoma.addEventListener('click', () => {
    tabKoma.classList.add('active'); tabAssign.classList.remove('active');
    panelKoma.classList.add('active'); panelAssign.classList.remove('active');
  });
  tabAssign.addEventListener('click', () => {
    tabAssign.classList.add('active'); tabKoma.classList.remove('active');
    panelAssign.classList.add('active'); panelKoma.classList.remove('active');
  });

  await loadKomaPanel(panelKoma, id, canEdit);
  await loadAssignPanel(panelAssign, id, canEdit);
}

// ========================================
// PDFドラッグ&ドロップエリア
// ========================================
function buildPdfDropArea(syllabusId, pdfCard) {
  const area = document.createElement('div');
  area.className = 'pdf-drop-area';
  area.innerHTML = `<div class="drop-icon">📄</div>
    <p>PDFをドラッグ&ドロップ</p>
    <p style="font-size:11px;margin-top:4px;">または</p>`;

  const fileBtn = document.createElement('button');
  fileBtn.className = 'btn btn-secondary btn-sm';
  fileBtn.style.marginTop = '8px';
  fileBtn.textContent = 'ファイルを選択';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/pdf';
  fileInput.style.display = 'none';
  area.appendChild(fileBtn);
  area.appendChild(fileInput);

  const statusEl = document.createElement('div');
  statusEl.style.marginTop = '8px';
  statusEl.style.fontSize = '12px';
  area.appendChild(statusEl);

  async function uploadFile(file) {
    if (!file || file.type !== 'application/pdf') {
      statusEl.className = 'form-error';
      statusEl.textContent = 'PDFファイルを選択してください';
      return;
    }
    statusEl.className = '';
    statusEl.textContent = 'アップロード中…';
    const form = new FormData();
    form.append('pdf', file);
    try {
      const headers = {};
      if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
      const r = await fetch('/api/syllabi/' + syllabusId + '/pdf', { method: 'POST', headers, body: form });
      const data = await r.json();
      if (!r.ok) { statusEl.className = 'form-error'; statusEl.textContent = data.error || 'アップロード失敗'; return; }
      // プレビューに差し替え
      const wrap = document.createElement('div');
      wrap.className = 'pdf-preview-wrap';
      const iframe = document.createElement('iframe');
      iframe.src = '/api/syllabi/' + syllabusId + '/pdf#toolbar=0';
      iframe.title = 'PDFプレビュー';
      wrap.appendChild(iframe);
      pdfCard.replaceChild(wrap, area);
    } catch (e) {
      statusEl.className = 'form-error';
      statusEl.textContent = 'ネットワークエラーが発生しました';
    }
  }

  fileBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) uploadFile(fileInput.files[0]); });
  area.addEventListener('dragover', (e) => { e.preventDefault(); area.classList.add('dragover'); });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', (e) => { e.preventDefault(); area.classList.remove('dragover'); uploadFile(e.dataTransfer.files[0]); });

  return area;
}

// ========================================
// コマシラバスパネル（詳細画面の下部タブ）
// ========================================
async function loadKomaPanel(panel, syllabusId, canEdit) {
  panel.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const res = await api('GET', '/api/koma?syllabus_review_id=' + syllabusId);
  panel.innerHTML = '';

  if (canEdit) {
    const btnAdd = document.createElement('button');
    btnAdd.className = 'btn btn-primary btn-sm mb-12';
    btnAdd.textContent = '＋ コマシラバスを追加';
    btnAdd.addEventListener('click', () => openKomaModal(null, syllabusId, () => loadKomaPanel(panel, syllabusId, canEdit)));
    panel.appendChild(btnAdd);
  }

  const rows = res.data || [];
  if (rows.length === 0) {
    const em = document.createElement('div');
    em.className = 'empty-state';
    em.innerHTML = '<div class="empty-icon">📅</div><p>コマシラバスがありません</p>';
    panel.appendChild(em);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  table.innerHTML = `<thead><tr><th>回数</th><th>公開</th><th>学習概要（抜粋）</th><th></th>${canEdit ? '<th></th>' : ''}</tr></thead>`;
  const tbody = document.createElement('tbody');

  rows.forEach(row => {
    const tr = document.createElement('tr');
    const tdNum = document.createElement('td');
    tdNum.textContent = '第' + row.session_number + '回';
    tdNum.style.whiteSpace = 'nowrap';
    tr.appendChild(tdNum);

    const tdPub = document.createElement('td');
    const pubBadge = document.createElement('span');
    pubBadge.className = row.is_published ? 'badge badge-published' : 'badge badge-draft';
    pubBadge.textContent = row.is_published ? '公開' : '非公開';
    tdPub.appendChild(pubBadge);
    tr.appendChild(tdPub);

    // 学習概要（抜粋）
    const tdOv = document.createElement('td');
    tdOv.className = 'td-overflow';
    tdOv.style.maxWidth = '240px';
    tdOv.textContent = (row.learning_overview || '').replace(/[#*`>\-]/g, '').substring(0, 50)
      + ((row.learning_overview || '').length > 50 ? '…' : '');
    tr.appendChild(tdOv);

    // 詳細ボタン（常に表示）
    const tdDetailSyl = document.createElement('td');
    tdDetailSyl.style.whiteSpace = 'nowrap';
    const btnDetailSyl = document.createElement('button');
    btnDetailSyl.className = 'btn btn-secondary btn-sm';
    btnDetailSyl.textContent = '詳細';
    btnDetailSyl.addEventListener('click', () => openKomaDetailModal(row));
    tdDetailSyl.appendChild(btnDetailSyl);
    tr.appendChild(tdDetailSyl);

    if (canEdit) {
      const tdOp = document.createElement('td');
      tdOp.style.textAlign = 'right';
      tdOp.style.whiteSpace = 'nowrap';
      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn btn-secondary btn-sm';
      btnEdit.textContent = '編集';
      btnEdit.addEventListener('click', () => openKomaModal(row, syllabusId, () => loadKomaPanel(panel, syllabusId, canEdit)));
      const btnDel = document.createElement('button');
      btnDel.className = 'btn btn-danger btn-sm';
      btnDel.style.marginLeft = '4px';
      btnDel.textContent = '削除';
      btnDel.addEventListener('click', async () => {
        if (!confirm('第' + row.session_number + '回を削除しますか？')) return;
        const r = await api('DELETE', '/api/koma/' + row.id);
        if (r.error) { alert(r.error); return; }
        loadKomaPanel(panel, syllabusId, canEdit);
      });
      tdOp.appendChild(btnEdit);
      tdOp.appendChild(btnDel);
      tr.appendChild(tdOp);
    }
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  panel.appendChild(wrap);
}

// ========================================
// コマシラバス追加・編集モーダル
// ========================================
function openKomaModal(row, syllabusId, onSaved) {
  const isEdit = !!row;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">${isEdit ? 'コマシラバスを編集' : 'コマシラバスを追加'}</div>
      <button class="modal-close" id="koma-modal-close">✕</button>
    </div>
    <div class="form-group">
      <label class="form-label">回数 <span class="required">*</span></label>
      <input class="form-control" type="number" id="koma-session" min="1" max="15"
             value="${row ? row.session_number : ''}" ${isEdit ? 'readonly' : ''} />
    </div>
    <div class="form-group">
      <label class="form-label">学習概要</label>
      <div id="koma-overview-md-wrap"></div>
    </div>
    <div class="form-group">
      <label class="form-label">学習目標</label>
      <div id="koma-objectives-md-wrap"></div>
    </div>
    <div class="form-group">
      <div class="form-check">
        <input type="checkbox" id="koma-published" ${row && row.is_published ? 'checked' : ''} />
        <label for="koma-published">公開する（チェックなし=非公開）</label>
      </div>
    </div>
    <div id="koma-modal-error"></div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="koma-modal-cancel">キャンセル</button>
      <button class="btn btn-primary" id="koma-modal-save">保存</button>
    </div>`;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Markdownタブフィールドを初期化（innerHTML で生成した後に appendChild）
  modal.querySelector('#koma-overview-md-wrap').appendChild(
    createMdField('koma-overview', row ? row.learning_overview || '' : '', false));
  modal.querySelector('#koma-objectives-md-wrap').appendChild(
    createMdField('koma-objectives', row ? row.learning_objectives || '' : '', false));

  const close = () => document.body.removeChild(overlay);
  modal.querySelector('#koma-modal-close').addEventListener('click', close);
  modal.querySelector('#koma-modal-cancel').addEventListener('click', close);

  modal.querySelector('#koma-modal-save').addEventListener('click', async () => {
    const errEl = modal.querySelector('#koma-modal-error');
    errEl.innerHTML = '';
    const session = parseInt(modal.querySelector('#koma-session').value, 10);
    const overview    = getMdValue('koma-overview');
    const objectives  = getMdValue('koma-objectives');

    let r;
    const isPublished = modal.querySelector('#koma-published').checked ? 1 : 0;
    if (isEdit) {
      r = await api('PUT', '/api/koma/' + row.id, { learning_overview: overview, learning_objectives: objectives, is_published: isPublished });
    } else {
      r = await api('POST', '/api/koma', { syllabus_review_id: syllabusId, session_number: session, learning_overview: overview, learning_objectives: objectives, is_published: isPublished });
    }
    if (r.error) { errEl.className = 'form-error'; errEl.textContent = r.error; return; }
    close();
    onSaved();
  });
}

// ========================================
// 課題レビューパネル（詳細画面の下部タブ）
// ========================================
async function loadAssignPanel(panel, syllabusId, canEdit) {
  panel.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const res = await api('GET', '/api/assignments?syllabus_review_id=' + syllabusId);
  panel.innerHTML = '';

  if (canEdit) {
    const btnAdd = document.createElement('button');
    btnAdd.className = 'btn btn-primary btn-sm mb-12';
    btnAdd.textContent = '＋ 課題レビューを追加';
    btnAdd.addEventListener('click', () => openAssignModal(null, syllabusId, () => loadAssignPanel(panel, syllabusId, canEdit)));
    panel.appendChild(btnAdd);
  }

  const rows = res.data || [];
  if (rows.length === 0) {
    const em = document.createElement('div');
    em.className = 'empty-state';
    em.innerHTML = '<div class="empty-icon">📝</div><p>課題レビューがありません</p>';
    panel.appendChild(em);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  table.innerHTML = `<thead><tr><th>課題番号</th><th>課題名</th><th>公開</th><th>評価</th><th></th>${canEdit ? '<th></th>' : ''}</tr></thead>`;
  const tbody = document.createElement('tbody');

  rows.forEach(row => {
    const tr = document.createElement('tr');
    const tdNum = document.createElement('td');
    tdNum.textContent = row.assignment_number;
    tr.appendChild(tdNum);

    const tdName = document.createElement('td');
    tdName.textContent = row.assignment_name || '';
    tr.appendChild(tdName);

    const tdAPub = document.createElement('td');
    const aPubBadge = document.createElement('span');
    aPubBadge.className = row.is_published ? 'badge badge-published' : 'badge badge-draft';
    aPubBadge.textContent = row.is_published ? '公開' : '非公開';
    tdAPub.appendChild(aPubBadge);
    tr.appendChild(tdAPub);

    const tdEval = document.createElement('td');
    if (row.evaluation) {
      const badge = document.createElement('span');
      badge.className = 'badge ' + (EVAL_BADGE[row.evaluation] || 'badge-muted');
      badge.textContent = row.evaluation;
      tdEval.appendChild(badge);
    }
    tr.appendChild(tdEval);

    // 詳細ボタン（常に表示）
    const tdDetailAP = document.createElement('td');
    tdDetailAP.style.whiteSpace = 'nowrap';
    const btnDetailAP = document.createElement('button');
    btnDetailAP.className = 'btn btn-secondary btn-sm';
    btnDetailAP.textContent = '詳細';
    btnDetailAP.addEventListener('click', () => openAssignDetailModal(row));
    tdDetailAP.appendChild(btnDetailAP);
    tr.appendChild(tdDetailAP);

    if (canEdit) {
      const tdOp = document.createElement('td');
      tdOp.style.textAlign = 'right';
      tdOp.style.whiteSpace = 'nowrap';
      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn btn-secondary btn-sm';
      btnEdit.textContent = '編集';
      btnEdit.addEventListener('click', () => openAssignModal(row, syllabusId, () => loadAssignPanel(panel, syllabusId, canEdit)));
      const btnDel = document.createElement('button');
      btnDel.className = 'btn btn-danger btn-sm';
      btnDel.style.marginLeft = '4px';
      btnDel.textContent = '削除';
      btnDel.addEventListener('click', async () => {
        if (!confirm('課題' + row.assignment_number + 'を削除しますか？')) return;
        const r = await api('DELETE', '/api/assignments/' + row.id);
        if (r.error) { alert(r.error); return; }
        loadAssignPanel(panel, syllabusId, canEdit);
      });
      tdOp.appendChild(btnEdit);
      tdOp.appendChild(btnDel);
      tr.appendChild(tdOp);
    }
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  panel.appendChild(wrap);
}

// ========================================
// 課題レビュー追加・編集モーダル
// ========================================
function openAssignModal(row, syllabusId, onSaved) {
  const isEdit = !!row;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';

  // 評価オプション
  const evalOpts = state.masters.evaluation || [];
  const selectedEvalId = row ? row.evaluation_id : null;

  modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">${isEdit ? '課題レビューを編集' : '課題レビューを追加'}</div>
      <button class="modal-close" id="assign-modal-close">✕</button>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">年度 <span class="required">*</span></label>
        <input class="form-control" type="number" id="assign-year" value="${row ? row.academic_year : new Date().getFullYear()}" />
      </div>
      <div class="form-group">
        <label class="form-label">課題番号 <span class="required">*</span></label>
        <input class="form-control" type="number" id="assign-number" min="1" value="${row ? row.assignment_number : ''}" />
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">課題名</label>
      <input class="form-control" type="text" id="assign-name" value="${row ? escT(row.assignment_name || '') : ''}" />
    </div>
    <div class="form-group">
      <label class="form-label">概要</label>
      <div id="assign-overview-md"></div>
    </div>
    <div class="form-group">
      <label class="form-label">評価</label>
      <div id="assign-eval-opts"></div>
    </div>
    <div class="form-group">
      <label class="form-label">評価コメント</label>
      <div id="assign-comment-md"></div>
    </div>
    <div class="form-group">
      <label class="form-label">大学生のうちに学んでほしいこと</label>
      <div id="assign-learning-md"></div>
    </div>
    <div class="form-group">
      <div class="form-check">
        <input type="checkbox" id="assign-published" ${row && row.is_published ? 'checked' : ''} />
        <label for="assign-published">公開する（チェックなし=非公開）</label>
      </div>
    </div>
    <div id="assign-modal-error"></div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="assign-modal-cancel">キャンセル</button>
      <button class="btn btn-primary" id="assign-modal-save">保存</button>
    </div>`;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // 評価ボタン
  const evalWrap = modal.querySelector('#assign-eval-opts');
  evalWrap.appendChild(createEvalOpts(evalOpts, selectedEvalId, false));

  // Markdownフィールド
  const commentMdWrap  = modal.querySelector('#assign-comment-md');
  const learningMdWrap = modal.querySelector('#assign-learning-md');
  modal.querySelector('#assign-overview-md').appendChild(
    createMdField('assign-overview', row ? row.assignment_overview || '' : '', false));
  commentMdWrap.appendChild(createMdField('assign-comment',  row ? row.evaluation_comment  || '' : '', false));
  learningMdWrap.appendChild(createMdField('assign-learning', row ? row.university_learning || '' : '', false));

  const close = () => document.body.removeChild(overlay);
  modal.querySelector('#assign-modal-close').addEventListener('click', close);
  modal.querySelector('#assign-modal-cancel').addEventListener('click', close);

  modal.querySelector('#assign-modal-save').addEventListener('click', async () => {
    const errEl = modal.querySelector('#assign-modal-error');
    errEl.innerHTML = '';
    const year    = parseInt(modal.querySelector('#assign-year').value, 10);
    const number  = parseInt(modal.querySelector('#assign-number').value, 10);
    const name    = modal.querySelector('#assign-name').value;
    const evalId  = getEvalSelectedId(evalWrap);
    const comment = getMdValue('assign-comment');
    const learning = getMdValue('assign-learning');

    // #assign-published が openAssignModal の正しいID
    const assignPublished = modal.querySelector('#assign-published') ? modal.querySelector('#assign-published').checked ? 1 : 0 : 0;
    let r;
    if (isEdit) {
      r = await api('PUT', '/api/assignments/' + row.id, {
        academic_year: year, assignment_number: number, assignment_name: name,
        evaluation_id: evalId, evaluation_comment: comment, university_learning: learning,
        is_published: assignPublished,
      });
    } else {
      r = await api('POST', '/api/assignments', {
        syllabus_review_id: syllabusId, academic_year: year,
        assignment_number: number, assignment_name: name,
        evaluation_id: evalId, evaluation_comment: comment, university_learning: learning,
        is_published: assignPublished,
      });
    }
    if (r.error) { errEl.className = 'form-error'; errEl.textContent = r.error; return; }
    close();
    onSaved();
  });
}

// ========================================
// シラバスレビュー新規作成 / 編集フォーム
// ========================================
async function renderSyllabusForm(main, id) {
  showLoading(main);

  await loadMasters(); // 常に最新マスターを取得

  const isEdit = !!id;
  let d = null;

  if (isEdit) {
    const res = await api('GET', '/api/syllabi/' + id);
    if (res.error) { main.innerHTML = ''; showError(main, res.error); return; }
    d = res.data;

    // 権限確認
    if (!state.user || (state.user.role !== 'admin' && state.user.id !== d.created_by)) {
      main.innerHTML = '';
      showError(main, '編集権限がありません');
      return;
    }
  } else {
    if (!state.user) { location.hash = '#/login'; return; }
  }

  main.innerHTML = '';

  // ページヘッダー
  const header = document.createElement('div');
  header.className = 'page-header';
  const titleEl = document.createElement('h1');
  titleEl.className = 'page-title';
  titleEl.textContent = isEdit ? 'シラバスレビューを編集' : 'シラバスレビューを新規作成';
  header.appendChild(titleEl);
  const btnGroup = document.createElement('div');
  btnGroup.style.display = 'flex';
  btnGroup.style.gap = '8px';
  const btnSave = document.createElement('button');
  btnSave.className = 'btn btn-primary';
  btnSave.textContent = '💾 保存';
  const btnCancel = document.createElement('button');
  btnCancel.className = 'btn btn-secondary';
  btnCancel.textContent = 'キャンセル';
  btnCancel.addEventListener('click', () => { location.hash = isEdit ? '#/syllabi/' + id : '#/syllabi'; });
  btnGroup.appendChild(btnSave);
  btnGroup.appendChild(btnCancel);
  header.appendChild(btnGroup);
  main.appendChild(header);

  // エラー表示エリア
  const errArea = document.createElement('div');
  errArea.id = 'form-error-area';
  main.appendChild(errArea);

  // PDFカード
  const pdfCard = document.createElement('div');
  pdfCard.className = 'card';
  const pdfHdr = document.createElement('div');
  pdfHdr.className = 'section-header';
  pdfHdr.textContent = 'PDFレビュー資料';
  pdfCard.appendChild(pdfHdr);
  if (isEdit && d) {
    if (d.pdf_path) {
      const pdfWrap = document.createElement('div');
      pdfWrap.className = 'pdf-preview-wrap';
      const iframe = document.createElement('iframe');
      iframe.src = '/api/syllabi/' + id + '/pdf#toolbar=0';
      iframe.title = 'PDFプレビュー';
      pdfWrap.appendChild(iframe);
      pdfCard.appendChild(pdfWrap);
      const btnReplace = document.createElement('button');
      btnReplace.className = 'btn btn-secondary btn-sm mt-8';
      btnReplace.textContent = 'PDFを差し替える';
      btnReplace.addEventListener('click', () => { pdfWrap.remove(); btnReplace.remove(); pdfCard.appendChild(buildPdfDropArea(id, pdfCard)); });
      pdfCard.appendChild(btnReplace);
    } else {
      pdfCard.appendChild(buildPdfDropArea(id, pdfCard));
    }
  } else {
    const pdfMsg = document.createElement('div');
    pdfMsg.style.cssText = 'padding:16px;color:#7a9cc8;font-size:13px;display:flex;align-items:center;gap:10px;';
    const pdfIcon = document.createElement('span');
    pdfIcon.style.fontSize = '24px';
    pdfIcon.textContent = '📄';
    const pdfTxt = document.createElement('span');
    pdfTxt.textContent = '基本情報を保存した後、詳細画面からPDFをアップロードできます。';
    pdfMsg.appendChild(pdfIcon);
    pdfMsg.appendChild(pdfTxt);
    pdfCard.appendChild(pdfMsg);
  }
  main.appendChild(pdfCard);

  // 基本情報カード
  const basicCard = document.createElement('div');
  basicCard.className = 'card';
  const basicHdr = document.createElement('div');
  basicHdr.className = 'section-header';
  basicHdr.textContent = '基本情報';
  basicCard.appendChild(basicHdr);

  // 科目名
  const nameGrp = document.createElement('div');
  nameGrp.className = 'form-group';
  nameGrp.innerHTML = '<label class="form-label">科目名 <span class="required">*</span></label>';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'form-control';
  nameInput.id = 'f-subject-name';
  nameInput.value = d ? d.subject_name : '';
  nameGrp.appendChild(nameInput);
  basicCard.appendChild(nameGrp);

  // 年度・学部名 横並び
  const row1 = document.createElement('div');
  row1.className = 'form-row';

  const yearGrp = document.createElement('div');
  yearGrp.className = 'form-group';
  yearGrp.innerHTML = '<label class="form-label">年度 <span class="required">*</span></label>';
  const yearInput = document.createElement('input');
  yearInput.type = 'number';
  yearInput.className = 'form-control';
  yearInput.id = 'f-year';
  yearInput.value = d ? d.academic_year : new Date().getFullYear();
  yearGrp.appendChild(yearInput);

  const deptGrp = document.createElement('div');
  deptGrp.className = 'form-group';
  deptGrp.innerHTML = '<label class="form-label">学部名</label>';
  const deptSel = document.createElement('select');
  deptSel.className = 'form-control';
  deptSel.id = 'f-dept';
  deptSel.innerHTML = '<option value="">選択してください</option>';
  (state.masters.department || []).forEach(dept => {
    const opt = document.createElement('option');
    opt.value = dept.id;
    opt.textContent = dept.label;
    if (d && d.department_id === dept.id) opt.selected = true;
    deptSel.appendChild(opt);
  });
  deptGrp.appendChild(deptSel);

  row1.appendChild(yearGrp);
  row1.appendChild(deptGrp);
  basicCard.appendChild(row1);

  // 公開設定
  const pubGrp = document.createElement('div');
  pubGrp.className = 'form-group';
  const pubCheck = document.createElement('div');
  pubCheck.className = 'form-check';
  const pubCb = document.createElement('input');
  pubCb.type = 'checkbox';
  pubCb.id = 'f-published';
  pubCb.checked = d ? !!d.is_published : false;
  const pubLabel = document.createElement('label');
  pubLabel.htmlFor = 'f-published';
  pubLabel.textContent = '公開する（チェックなし=非公開）';
  pubCheck.appendChild(pubCb);
  pubCheck.appendChild(pubLabel);
  pubGrp.appendChild(pubCheck);
  basicCard.appendChild(pubGrp);

  main.appendChild(basicCard);

  // 選択チップカード
  const chipCard = document.createElement('div');
  chipCard.className = 'card';
  const chipHdr = document.createElement('div');
  chipHdr.className = 'section-header';
  chipHdr.textContent = '授業の特徴';
  chipCard.appendChild(chipHdr);

  const chipDefs = [
    { key: 'game_element',        label: 'ゲーム要素の導入' },
    { key: 'consultation_method', label: '教員への相談方法' },
    { key: 'ai_usage_scope',      label: 'AIの使用範囲' },
  ];
  const chipRefs = {};
  chipDefs.forEach(({ key, label }) => {
    const grp = document.createElement('div');
    grp.className = 'form-group';
    const lbl = document.createElement('div');
    lbl.className = 'form-label';
    lbl.textContent = label;
    grp.appendChild(lbl);
    const selectedIds = d ? (d.selections[key] || []).map(s => s.id) : [];
    const cg = createChipGroup(state.masters[key] || [], selectedIds, false);
    grp.appendChild(cg);
    chipRefs[key] = cg;
    chipCard.appendChild(grp);
  });
  main.appendChild(chipCard);

  // キャリア形成情報カード
  const careerCard = document.createElement('div');
  careerCard.className = 'card';
  const careerHdr = document.createElement('div');
  careerHdr.className = 'section-header';
  careerHdr.textContent = 'キャリア形成情報';
  careerCard.appendChild(careerHdr);

  const indGrp = document.createElement('div');
  indGrp.className = 'form-group';
  indGrp.innerHTML = '<div class="form-label">授業内容が役立つ業種</div>';
  const selectedInd = d ? (d.selections.industry || []).map(s => s.id) : [];
  const indChips = createChipGroup(state.masters.industry || [], selectedInd, false);
  indGrp.appendChild(indChips);
  chipRefs.industry = indChips;
  careerCard.appendChild(indGrp);

  const occGrp = document.createElement('div');
  occGrp.className = 'form-group';
  occGrp.innerHTML = '<div class="form-label">授業内容が役立つ職種</div>';
  const selectedOcc = d ? (d.selections.occupation || []).map(s => s.id) : [];
  const occChips = createChipGroup(state.masters.occupation || [], selectedOcc, false);
  occGrp.appendChild(occChips);
  chipRefs.occupation = occChips;
  careerCard.appendChild(occGrp);

  const mdCareerDefs = [
    { key: 'knowledge_skills', label: '習得できる知識・技能' },
    { key: 'ai_skills',        label: '磨けるAI活用能力' },
    { key: 'non_ict_value',    label: '情報通信業以外で役立つこと' },
  ];
  mdCareerDefs.forEach(({ key, label }) => {
    const grp = document.createElement('div');
    grp.className = 'form-group';
    const lbl = document.createElement('div');
    lbl.className = 'form-label';
    lbl.textContent = label;
    grp.appendChild(lbl);
    grp.appendChild(createMdField('f-' + key, d ? d[key] || '' : '', false));
    careerCard.appendChild(grp);
  });
  main.appendChild(careerCard);

  // 外部評価カード
  const evalCard = document.createElement('div');
  evalCard.className = 'card';
  const evalHdr = document.createElement('div');
  evalHdr.className = 'section-header';
  evalHdr.textContent = 'シラバス外部評価';
  evalCard.appendChild(evalHdr);

  const evalGrp = document.createElement('div');
  evalGrp.className = 'form-group';
  evalGrp.innerHTML = '<div class="form-label">評価</div>';
  const evalWrap = createEvalOpts(state.masters.evaluation || [], d ? d.evaluation_id : null, false);
  evalGrp.appendChild(evalWrap);
  evalCard.appendChild(evalGrp);

  const mdEvalDefs = [
    { key: 'evaluation_comment',  label: '評価コメント' },
    { key: 'university_learning', label: '大学生のうちに学んでほしいこと' },
  ];
  mdEvalDefs.forEach(({ key, label }) => {
    const grp = document.createElement('div');
    grp.className = 'form-group';
    const lbl = document.createElement('div');
    lbl.className = 'form-label';
    lbl.textContent = label;
    grp.appendChild(lbl);
    grp.appendChild(createMdField('f-' + key, d ? d[key] || '' : '', false));
    evalCard.appendChild(grp);
  });
  main.appendChild(evalCard);

  // 保存処理
  btnSave.addEventListener('click', async () => {
    errArea.innerHTML = '';
    const subjectName  = nameInput.value.trim();
    const academicYear = parseInt(yearInput.value, 10);
    if (!subjectName || !academicYear) {
      errArea.className = 'form-error';
      errArea.textContent = '科目名と年度は必須です';
      window.scrollTo(0, 0);
      return;
    }

    // selections 収集
    const selections = {};
    Object.entries(chipRefs).forEach(([key, cg]) => {
      selections[key] = getChipSelectedIds(cg);
    });

    const payload = {
      subject_name:        subjectName,
      academic_year:       academicYear,
      department_id:       deptSel.value ? parseInt(deptSel.value, 10) : null,
      is_published:        pubCb.checked ? 1 : 0,
      knowledge_skills:    getMdValue('f-knowledge_skills'),
      ai_skills:           getMdValue('f-ai_skills'),
      non_ict_value:       getMdValue('f-non_ict_value'),
      evaluation_id:       getEvalSelectedId(evalWrap),
      evaluation_comment:  getMdValue('f-evaluation_comment'),
      university_learning: getMdValue('f-university_learning'),
      selections,
    };

    btnSave.disabled = true;
    btnSave.textContent = '保存中…';

    const res = isEdit
      ? await api('PUT',  '/api/syllabi/' + id,   payload)
      : await api('POST', '/api/syllabi',           payload);

    btnSave.disabled = false;
    btnSave.textContent = '💾 保存';

    if (res.error) {
      errArea.className = 'form-error';
      errArea.textContent = res.error;
      window.scrollTo(0, 0);
      return;
    }

    const savedId = isEdit ? id : res.data.id;
    location.hash = '#/syllabi/' + savedId;
  });
}
// ========================================
// コマシラバス一覧画面
// ========================================
async function renderKomaList(main) {
  main.innerHTML = '';

  // ページヘッダー
  const header = document.createElement('div');
  header.className = 'page-header';
  const titleEl = document.createElement('h1');
  titleEl.className = 'page-title';
  titleEl.textContent = 'コマシラバス一覧';
  header.appendChild(titleEl);
  if (state.user) {
    const btnAdd = document.createElement('button');
    btnAdd.className = 'btn btn-primary';
    btnAdd.textContent = '＋ コマシラバスを追加';
    btnAdd.addEventListener('click', () => openKomaListModal(null, null, syllabusRows, loadList));
    header.appendChild(btnAdd);
  }
  main.appendChild(header);

  // シラバスレビュー一覧を先取得（フィルタ・モーダルのプルダウン用）
  const syllabusRes = await api('GET', '/api/syllabi');
  const syllabusRows = (syllabusRes.data || []);

  // フィルターバー
  const filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';

  // 関連シラバスレビュー プルダウン
  const srGrp = document.createElement('div');
  srGrp.className = 'form-group';
  srGrp.innerHTML = '<label class="form-label">関連シラバスレビュー</label>';
  const srSel = document.createElement('select');
  srSel.className = 'form-control';
  srSel.innerHTML = '<option value="">すべて</option>';
  syllabusRows.forEach(sr => {
    const opt = document.createElement('option');
    opt.value = sr.id;
    opt.textContent = sr.subject_name + '（' + sr.academic_year + '年度）';
    srSel.appendChild(opt);
  });
  srGrp.appendChild(srSel);
  filterBar.appendChild(srGrp);

  // ソート選択
  const sortGrp = document.createElement('div');
  sortGrp.className = 'form-group';
  sortGrp.innerHTML = '<label class="form-label">ソート</label>';
  const sortSel = document.createElement('select');
  sortSel.className = 'form-control';
  sortSel.innerHTML = `
    <option value="session_number">回数順</option>
    <option value="syllabus_review_id">シラバスレビュー順</option>`;
  sortGrp.appendChild(sortSel);
  filterBar.appendChild(sortGrp);
  main.appendChild(filterBar);

  // テーブルエリア
  const card = document.createElement('div');
  card.className = 'card';
  main.appendChild(card);

  async function loadList() {
    const srId = srSel.value;
    const sort = sortSel.value;
    const params = new URLSearchParams();
    if (srId) params.set('syllabus_review_id', srId);
    params.set('sort', sort);

    card.innerHTML = '<div class="loading"><div class="spinner"></div>読み込み中…</div>';
    const res = await api('GET', '/api/koma?' + params.toString());
    card.innerHTML = '';

    if (res.error) { showError(card, res.error); return; }
    const rows = res.data || [];

    if (rows.length === 0) {
      card.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><p>コマシラバスがありません</p></div>`;
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const table = document.createElement('table');
    table.innerHTML = `
      <thead><tr>
        <th>回数</th><th>公開</th><th>関連シラバスレビュー</th><th>学習概要（抜粋）</th><th></th>
        ${state.user ? '<th></th>' : ''}
      </tr></thead>`;
    const tbody = document.createElement('tbody');

    rows.forEach(row => {
      // 権限: 関連シラバスの作成者 or admin
      const relSyllabus = syllabusRows.find(s => s.id === row.syllabus_review_id);
      const canEdit = state.user && (state.user.role === 'admin' || (relSyllabus && state.user.id === relSyllabus.created_by));

      const tr = document.createElement('tr');

      const tdNum = document.createElement('td');
      tdNum.style.whiteSpace = 'nowrap';
      tdNum.style.fontWeight = '600';
      tdNum.textContent = '第' + row.session_number + '回';
      tr.appendChild(tdNum);

      const tdKPub = document.createElement('td');
      const kPubBadge = document.createElement('span');
      kPubBadge.className = row.is_published ? 'badge badge-published' : 'badge badge-draft';
      kPubBadge.textContent = row.is_published ? '公開' : '非公開';
      tdKPub.appendChild(kPubBadge);
      tr.appendChild(tdKPub);

      const tdSr = document.createElement('td');
      tdSr.style.whiteSpace = 'nowrap';
      const srLink = document.createElement('a');
      srLink.href = '#/syllabi/' + row.syllabus_review_id;
      srLink.style.color = '#4d9ff5';
      srLink.style.cursor = 'pointer';
      srLink.textContent = row.subject_name + '（' + row.academic_year + '年度）';
      tdSr.appendChild(srLink);
      tr.appendChild(tdSr);

      // 学習概要（抜粋テキスト）
      const tdOv = document.createElement('td');
      tdOv.className = 'td-overflow';
      tdOv.style.maxWidth = '260px';
      tdOv.textContent = (row.learning_overview || '').replace(/[#*`>-]/g, '').substring(0, 60) + ((row.learning_overview || '').length > 60 ? '…' : '');
      tr.appendChild(tdOv);

      // 詳細ボタン
      const tdDetail = document.createElement('td');
      tdDetail.style.whiteSpace = 'nowrap';
      const btnDetail = document.createElement('button');
      btnDetail.className = 'btn btn-secondary btn-sm';
      btnDetail.textContent = '詳細';
      btnDetail.addEventListener('click', () => openKomaDetailModal(row));
      tdDetail.appendChild(btnDetail);
      tr.appendChild(tdDetail);

      if (state.user) {
        const tdOp = document.createElement('td');
        tdOp.style.textAlign = 'right';
        tdOp.style.whiteSpace = 'nowrap';
        if (canEdit) {
          const btnEdit = document.createElement('button');
          btnEdit.className = 'btn btn-secondary btn-sm';
          btnEdit.textContent = '編集';
          btnEdit.addEventListener('click', () => openKomaListModal(row, row.syllabus_review_id, syllabusRows, loadList));

          const btnDel = document.createElement('button');
          btnDel.className = 'btn btn-danger btn-sm';
          btnDel.style.marginLeft = '4px';
          btnDel.textContent = '削除';
          btnDel.addEventListener('click', async () => {
            if (!confirm('第' + row.session_number + '回を削除しますか？')) return;
            const r = await api('DELETE', '/api/koma/' + row.id);
            if (r.error) { alert(r.error); return; }
            loadList();
          });
          tdOp.appendChild(btnEdit);
          tdOp.appendChild(btnDel);
        }
        tr.appendChild(tdOp);
      }
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    card.appendChild(wrap);
  }

  srSel.addEventListener('change', loadList);
  sortSel.addEventListener('change', loadList);
  await loadList();
}


// ========================================
// コマシラバス詳細モーダル
// ========================================
function openKomaDetailModal(row) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.maxWidth = '700px';

  // ---- ヘッダー ----
  const header = document.createElement('div');
  header.className = 'modal-header';
  const titleEl = document.createElement('div');
  titleEl.className = 'modal-title';
  titleEl.textContent = '第' + row.session_number + '回　'
    + (row.subject_name || '') + '（' + (row.academic_year || '') + '年度）';
  const btnClose = document.createElement('button');
  btnClose.className = 'modal-close';
  btnClose.textContent = '✕';
  header.appendChild(titleEl);
  header.appendChild(btnClose);
  modal.appendChild(header);

  // ---- 公開バッジ ----
  const pubBadge = document.createElement('span');
  pubBadge.className = row.is_published ? 'badge badge-published' : 'badge badge-draft';
  pubBadge.textContent = row.is_published ? '公開' : '非公開';
  pubBadge.style.cssText = 'margin-bottom:16px;display:inline-block;';
  modal.appendChild(pubBadge);

  // ---- 学習概要・学習目標 (Markdownタブ付き編集不可フィールド) ----
  function addMdSection(label, content) {
    const grp = document.createElement('div');
    grp.className = 'form-group';

    const lbl = document.createElement('div');
    lbl.className = 'form-label';
    lbl.textContent = label;
    grp.appendChild(lbl);

    // Markdownレンダリングで表示
    const div = document.createElement('div');
    div.className = 'md-preview-area active md-content md-readonly';
    div.style.padding = '12px 16px';
    div.style.background = '#f5f7fc';
    div.style.borderRadius = '6px';
    div.style.minHeight = '80px';
    div.style.border = '1px solid #d0d8eb';
    div.innerHTML = content ? renderMd(content) : '<span style="color:#aab4c8;">（未入力）</span>';
    grp.appendChild(div);

    return grp;
  }

  modal.appendChild(addMdSection('学習概要', row.learning_overview));
  modal.appendChild(addMdSection('学習目標', row.learning_objectives));

  // ---- フッター ----
  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  const btnOk = document.createElement('button');
  btnOk.className = 'btn btn-secondary';
  btnOk.textContent = '閉じる';
  footer.appendChild(btnOk);
  modal.appendChild(footer);

  // ---- DOM に追加してから閉じるイベント ----
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = () => {
    if (document.body.contains(overlay)) document.body.removeChild(overlay);
  };
  btnClose.addEventListener('click', close);
  btnOk.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

// ========================================
// コマシラバス一覧用モーダル（独立版）
// ========================================
function openKomaListModal(row, defaultSyllabusId, syllabusRows, onSaved) {
  const isEdit = !!row;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';

  // シラバスプルダウン
  let srOptions = '<option value="">シラバスを選択してください</option>';
  syllabusRows.forEach(sr => {
    const selected = (row ? row.syllabus_review_id : defaultSyllabusId) === sr.id ? 'selected' : '';
    srOptions += `<option value="${sr.id}" ${selected}>${escT(sr.subject_name)}（${sr.academic_year}年度）</option>`;
  });

  modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">${isEdit ? 'コマシラバスを編集' : 'コマシラバスを追加'}</div>
      <button class="modal-close" id="kl-modal-close">✕</button>
    </div>
    <div class="form-group">
      <label class="form-label">関連シラバスレビュー <span class="required">*</span></label>
      <select class="form-control" id="kl-syllabus" ${isEdit ? 'disabled' : ''}>${srOptions}</select>
    </div>
    <div class="form-group">
      <label class="form-label">回数（第N回）<span class="required">*</span></label>
      <input class="form-control" type="number" id="kl-session" min="1" max="15"
             value="${row ? row.session_number : ''}" ${isEdit ? 'readonly' : ''} placeholder="1〜15" />
    </div>
    <div class="form-group">
      <label class="form-label">学習概要</label>
      <div id="kl-overview-md"></div>
    </div>
    <div class="form-group">
      <label class="form-label">学習目標</label>
      <div id="kl-objectives-md"></div>
    </div>
    <div class="form-group">
      <div class="form-check">
        <input type="checkbox" id="kl-published" ${row && row.is_published ? 'checked' : ''} />
        <label for="kl-published">公開する（チェックなし=非公開）</label>
      </div>
    </div>
    <div id="kl-modal-error"></div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="kl-modal-cancel">キャンセル</button>
      <button class="btn btn-primary" id="kl-modal-save">保存</button>
    </div>`;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Markdownタブフィールドを初期化
  modal.querySelector('#kl-overview-md').appendChild(
    createMdField('kl-overview', row ? row.learning_overview || '' : '', false));
  modal.querySelector('#kl-objectives-md').appendChild(
    createMdField('kl-objectives', row ? row.learning_objectives || '' : '', false));

  const close = () => document.body.removeChild(overlay);
  modal.querySelector('#kl-modal-close').addEventListener('click', close);
  modal.querySelector('#kl-modal-cancel').addEventListener('click', close);

  modal.querySelector('#kl-modal-save').addEventListener('click', async () => {
    const errEl = modal.querySelector('#kl-modal-error');
    errEl.innerHTML = '';
    const syllabusId  = parseInt(modal.querySelector('#kl-syllabus').value, 10);
    const session     = parseInt(modal.querySelector('#kl-session').value, 10);
    const overview    = getMdValue('kl-overview');
    const objectives  = getMdValue('kl-objectives');

    if (!syllabusId || !session) {
      errEl.className = 'form-error';
      errEl.textContent = 'シラバスレビューと回数は必須です';
      return;
    }

    let r;
    const klPublished = modal.querySelector('#kl-published').checked ? 1 : 0;
    if (isEdit) {
      r = await api('PUT', '/api/koma/' + row.id, { learning_overview: overview, learning_objectives: objectives, is_published: klPublished });
    } else {
      r = await api('POST', '/api/koma', {
        syllabus_review_id: syllabusId, session_number: session,
        learning_overview: overview, learning_objectives: objectives, is_published: klPublished,
      });
    }
    if (r.error) { errEl.className = 'form-error'; errEl.textContent = r.error; return; }
    close();
    onSaved();
  });
}
// ========================================
// 課題レビュー一覧画面
// ========================================
async function renderAssignmentList(main) {
  main.innerHTML = '';

  // ページヘッダー
  const header = document.createElement('div');
  header.className = 'page-header';
  const titleEl = document.createElement('h1');
  titleEl.className = 'page-title';
  titleEl.textContent = '課題レビュー一覧';
  header.appendChild(titleEl);
  if (state.user) {
    const btnAdd = document.createElement('button');
    btnAdd.className = 'btn btn-primary';
    btnAdd.textContent = '＋ 課題レビューを追加';
    btnAdd.addEventListener('click', () => openAssignListModal(null, null, syllabusRows, loadList));
    header.appendChild(btnAdd);
  }
  main.appendChild(header);

  // シラバスレビュー一覧を先取得（フィルタ・モーダルのプルダウン用）
  const syllabusRes = await api('GET', '/api/syllabi');
  const syllabusRows = (syllabusRes.data || []);

  // フィルターバー
  const filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';

  const srGrp = document.createElement('div');
  srGrp.className = 'form-group';
  srGrp.innerHTML = '<label class="form-label">関連シラバスレビュー</label>';
  const srSel = document.createElement('select');
  srSel.className = 'form-control';
  srSel.innerHTML = '<option value="">すべて</option>';
  syllabusRows.forEach(sr => {
    const opt = document.createElement('option');
    opt.value = sr.id;
    opt.textContent = sr.subject_name + '（' + sr.academic_year + '年度）';
    srSel.appendChild(opt);
  });
  srGrp.appendChild(srSel);
  filterBar.appendChild(srGrp);
  main.appendChild(filterBar);

  // テーブルエリア
  const card = document.createElement('div');
  card.className = 'card';
  main.appendChild(card);

  async function loadList() {
    const srId = srSel.value;
    const params = new URLSearchParams();
    if (srId) params.set('syllabus_review_id', srId);

    card.innerHTML = '<div class="loading"><div class="spinner"></div>読み込み中…</div>';
    const res = await api('GET', '/api/assignments?' + params.toString());
    card.innerHTML = '';

    if (res.error) { showError(card, res.error); return; }
    const rows = res.data || [];

    if (rows.length === 0) {
      card.innerHTML = `<div class="empty-state"><div class="empty-icon">📝</div><p>課題レビューがありません</p></div>`;
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const table = document.createElement('table');
    table.innerHTML = `
      <thead><tr>
        <th>課題番号</th><th>課題名</th><th>公開</th><th>関連シラバスレビュー</th><th>評価</th><th></th>
        ${state.user ? '<th></th>' : ''}
      </tr></thead>`;
    const tbody = document.createElement('tbody');

    rows.forEach(row => {
      // 権限: 関連シラバスの作成者 or admin
      const relSyllabus = syllabusRows.find(s => s.id === row.syllabus_review_id);
      const canEdit = state.user && (state.user.role === 'admin' || (relSyllabus && state.user.id === relSyllabus.created_by));

      const tr = document.createElement('tr');

      const tdNum = document.createElement('td');
      tdNum.style.fontWeight = '600';
      tdNum.textContent = row.assignment_number;
      tr.appendChild(tdNum);

      const tdName = document.createElement('td');
      tdName.className = 'td-overflow';
      tdName.textContent = row.assignment_name || '';
      tr.appendChild(tdName);

      const tdALPub = document.createElement('td');
      const aLPubBadge = document.createElement('span');
      aLPubBadge.className = row.is_published ? 'badge badge-published' : 'badge badge-draft';
      aLPubBadge.textContent = row.is_published ? '公開' : '非公開';
      tdALPub.appendChild(aLPubBadge);
      tr.appendChild(tdALPub);

      const tdSr = document.createElement('td');
      const srLink = document.createElement('a');
      srLink.href = '#/syllabi/' + row.syllabus_review_id;
      srLink.style.color = '#4d9ff5';
      srLink.style.cursor = 'pointer';
      srLink.textContent = row.subject_name + '（' + (row.academic_year || '') + '年度）';
      tdSr.appendChild(srLink);
      tr.appendChild(tdSr);

      const tdEval = document.createElement('td');
      if (row.evaluation) {
        const badge = document.createElement('span');
        badge.className = 'badge ' + (EVAL_BADGE[row.evaluation] || 'badge-muted');
        badge.textContent = row.evaluation;
        tdEval.appendChild(badge);
      }
      tr.appendChild(tdEval);

      // 詳細ボタン（常に表示）
      const tdDetailA = document.createElement('td');
      tdDetailA.style.whiteSpace = 'nowrap';
      const btnDetailA = document.createElement('button');
      btnDetailA.className = 'btn btn-secondary btn-sm';
      btnDetailA.textContent = '詳細';
      btnDetailA.addEventListener('click', () => openAssignDetailModal(row));
      tdDetailA.appendChild(btnDetailA);
      tr.appendChild(tdDetailA);

      if (state.user) {
        const tdOp = document.createElement('td');
        tdOp.style.textAlign = 'right';
        tdOp.style.whiteSpace = 'nowrap';
        if (canEdit) {
          const btnEdit = document.createElement('button');
          btnEdit.className = 'btn btn-secondary btn-sm';
          btnEdit.textContent = '編集';
          btnEdit.addEventListener('click', () => openAssignListModal(row, row.syllabus_review_id, syllabusRows, loadList));

          const btnDel = document.createElement('button');
          btnDel.className = 'btn btn-danger btn-sm';
          btnDel.style.marginLeft = '4px';
          btnDel.textContent = '削除';
          btnDel.addEventListener('click', async () => {
            if (!confirm('課題' + row.assignment_number + 'を削除しますか？')) return;
            const r = await api('DELETE', '/api/assignments/' + row.id);
            if (r.error) { alert(r.error); return; }
            loadList();
          });
          tdOp.appendChild(btnEdit);
          tdOp.appendChild(btnDel);
        }
        tr.appendChild(tdOp);
      }
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    card.appendChild(wrap);
  }

  srSel.addEventListener('change', loadList);
  await loadList();
}

// ========================================
// 課題レビュー詳細モーダル
// ========================================
function openAssignDetailModal(row) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.maxWidth = '700px';

  // ---- ヘッダー ----
  const header = document.createElement('div');
  header.className = 'modal-header';
  const titleEl = document.createElement('div');
  titleEl.className = 'modal-title';
  titleEl.textContent = '課題' + row.assignment_number
    + (row.assignment_name ? '　' + row.assignment_name : '')
    + '　' + (row.subject_name || '') + '（' + (row.academic_year || '') + '年度）';
  const btnClose = document.createElement('button');
  btnClose.className = 'modal-close';
  btnClose.textContent = '✕';
  header.appendChild(titleEl);
  header.appendChild(btnClose);
  modal.appendChild(header);

  // ---- バッジ行（公開状態・評価） ----
  const badgeRow = document.createElement('div');
  badgeRow.style.cssText = 'display:flex;gap:8px;margin-bottom:16px;align-items:center;';

  const pubBadge = document.createElement('span');
  pubBadge.className = row.is_published ? 'badge badge-published' : 'badge badge-draft';
  pubBadge.textContent = row.is_published ? '公開' : '非公開';
  badgeRow.appendChild(pubBadge);

  if (row.evaluation) {
    const evalBadge = document.createElement('span');
    evalBadge.className = 'badge ' + (EVAL_BADGE[row.evaluation] || 'badge-muted');
    evalBadge.textContent = row.evaluation;
    badgeRow.appendChild(evalBadge);
  }
  modal.appendChild(badgeRow);

  // ---- Markdownレンダリングで表示するヘルパー ----
  function addSection(label, content) {
    if (!content) return;
    const grp = document.createElement('div');
    grp.className = 'form-group';
    const lbl = document.createElement('div');
    lbl.className = 'form-label';
    lbl.textContent = label;
    grp.appendChild(lbl);
    const div = document.createElement('div');
    div.className = 'md-preview-area active md-content md-readonly';
    div.style.padding = '12px 16px';
    div.style.background = '#f5f7fc';
    div.style.borderRadius = '6px';
    div.style.minHeight = '80px';
    div.style.border = '1px solid #d0d8eb';
    div.innerHTML = renderMd(content);
    grp.appendChild(div);
    modal.appendChild(grp);
  }

  addSection('概要', row.assignment_overview);
  addSection('評価コメント', row.evaluation_comment);
  addSection('大学生のうちに学んでほしいこと', row.university_learning);

  // すべて未入力の場合
  if (!row.assignment_overview && !row.evaluation_comment && !row.university_learning) {
    const msg = document.createElement('p');
    msg.className = 'text-muted';
    msg.textContent = '（詳細情報はありません）';
    modal.appendChild(msg);
  }

  // ---- フッター ----
  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  const btnOk = document.createElement('button');
  btnOk.className = 'btn btn-secondary';
  btnOk.textContent = '閉じる';
  footer.appendChild(btnOk);
  modal.appendChild(footer);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = () => {
    if (document.body.contains(overlay)) document.body.removeChild(overlay);
  };
  btnClose.addEventListener('click', close);
  btnOk.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

// ========================================
// 課題レビュー一覧用モーダル（独立版）
// ========================================
function openAssignListModal(row, defaultSyllabusId, syllabusRows, onSaved) {
  const isEdit = !!row;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';

  // シラバスプルダウン
  let srOptions = '<option value="">シラバスを選択してください</option>';
  syllabusRows.forEach(sr => {
    const selected = (row ? row.syllabus_review_id : defaultSyllabusId) === sr.id ? 'selected' : '';
    srOptions += `<option value="${sr.id}" ${selected}>${escT(sr.subject_name)}（${sr.academic_year}年度）</option>`;
  });

  modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">${isEdit ? '課題レビューを編集' : '課題レビューを追加'}</div>
      <button class="modal-close" id="al-modal-close">✕</button>
    </div>
    <div class="form-group">
      <label class="form-label">関連シラバスレビュー <span class="required">*</span></label>
      <select class="form-control" id="al-syllabus" ${isEdit ? 'disabled' : ''}>${srOptions}</select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">年度 <span class="required">*</span></label>
        <input class="form-control" type="number" id="al-year" value="${row ? row.academic_year : new Date().getFullYear()}" />
      </div>
      <div class="form-group">
        <label class="form-label">課題番号 <span class="required">*</span></label>
        <input class="form-control" type="number" id="al-number" min="1" value="${row ? row.assignment_number : ''}" />
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">課題名</label>
      <input class="form-control" type="text" id="al-name" value="${row ? escT(row.assignment_name || '') : ''}" />
    </div>
    <div class="form-group">
      <label class="form-label">概要</label>
      <div id="al-overview-md"></div>
    </div>
    <div class="form-group">
      <label class="form-label">評価</label>
      <div id="al-eval-opts"></div>
    </div>
    <div class="form-group">
      <label class="form-label">評価コメント</label>
      <div id="al-comment-md"></div>
    </div>
    <div class="form-group">
      <label class="form-label">大学生のうちに学んでほしいこと</label>
      <div id="al-learning-md"></div>
    </div>
    <div class="form-group">
      <div class="form-check">
        <input type="checkbox" id="al-published" ${row && row.is_published ? 'checked' : ''} />
        <label for="al-published">公開する（チェックなし=非公開）</label>
      </div>
    </div>
    <div id="al-modal-error"></div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="al-modal-cancel">キャンセル</button>
      <button class="btn btn-primary"   id="al-modal-save">保存</button>
    </div>`;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // 評価ボタン
  const evalWrap = modal.querySelector('#al-eval-opts');
  evalWrap.appendChild(createEvalOpts(state.masters.evaluation || [], row ? row.evaluation_id : null, false));

  // Markdownフィールド
  modal.querySelector('#al-overview-md').appendChild(
    createMdField('al-overview', row ? row.assignment_overview || '' : '', false));
  modal.querySelector('#al-comment-md').appendChild(
    createMdField('al-comment',  row ? row.evaluation_comment  || '' : '', false));
  modal.querySelector('#al-learning-md').appendChild(
    createMdField('al-learning', row ? row.university_learning || '' : '', false));

  const close = () => document.body.removeChild(overlay);
  modal.querySelector('#al-modal-close').addEventListener('click', close);
  modal.querySelector('#al-modal-cancel').addEventListener('click', close);

  modal.querySelector('#al-modal-save').addEventListener('click', async () => {
    const errEl = modal.querySelector('#al-modal-error');
    errEl.innerHTML = '';

    const syllabusId = parseInt(modal.querySelector('#al-syllabus').value, 10);
    const year       = parseInt(modal.querySelector('#al-year').value, 10);
    const number     = parseInt(modal.querySelector('#al-number').value, 10);
    const name       = modal.querySelector('#al-name').value;
    const evalId     = getEvalSelectedId(evalWrap);
    const comment    = getMdValue('al-comment');
    const learning   = getMdValue('al-learning');

    if (!syllabusId || !year || !number) {
      errEl.className = 'form-error';
      errEl.textContent = 'シラバスレビュー・年度・課題番号は必須です';
      return;
    }

    const alPublished = modal.querySelector('#al-published') ? (modal.querySelector('#al-published').checked ? 1 : 0) : 0;
    const alOverview = getMdValue('al-overview');
    let r;
    if (isEdit) {
      r = await api('PUT', '/api/assignments/' + row.id, {
        academic_year: year, assignment_number: number, assignment_name: name,
        evaluation_id: evalId, assignment_overview: alOverview,
        evaluation_comment: comment, university_learning: learning,
        is_published: alPublished,
      });
    } else {
      r = await api('POST', '/api/assignments', {
        syllabus_review_id: syllabusId, academic_year: year,
        assignment_number: number, assignment_name: name,
        evaluation_id: evalId, assignment_overview: alOverview,
        evaluation_comment: comment, university_learning: learning,
        is_published: alPublished,
      });
    }
    if (r.error) { errEl.className = 'form-error'; errEl.textContent = r.error; return; }
    close();
    onSaved();
  });
}
// ========================================
// 管理画面
// ========================================
async function renderAdmin(main) {
  // 権限チェック
  if (!state.user || state.user.role !== 'admin') {
    main.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'empty-state';
    div.innerHTML = '<div class="empty-icon">🔒</div><p>アクセス権限がありません</p>';
    main.appendChild(div);
    return;
  }

  main.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'page-header';
  const titleEl = document.createElement('h1');
  titleEl.className = 'page-title';
  titleEl.textContent = '管理画面';
  header.appendChild(titleEl);
  main.appendChild(header);

  // タブバー
  const tabBar = document.createElement('div');
  tabBar.className = 'tab-bar';
  const tabUser   = document.createElement('button');
  tabUser.className   = 'tab-btn active';
  tabUser.textContent = '👥 ユーザー管理';
  const tabMaster = document.createElement('button');
  tabMaster.className   = 'tab-btn';
  tabMaster.textContent = '🗂️ マスターデータ管理';
  tabBar.appendChild(tabUser);
  tabBar.appendChild(tabMaster);
  main.appendChild(tabBar);

  const panelUser   = document.createElement('div');
  panelUser.className   = 'tab-panel active';
  const panelMaster = document.createElement('div');
  panelMaster.className = 'tab-panel';
  main.appendChild(panelUser);
  main.appendChild(panelMaster);

  tabUser.addEventListener('click', () => {
    tabUser.classList.add('active');   tabMaster.classList.remove('active');
    panelUser.classList.add('active'); panelMaster.classList.remove('active');
  });
  tabMaster.addEventListener('click', () => {
    tabMaster.classList.add('active'); tabUser.classList.remove('active');
    panelMaster.classList.add('active'); panelUser.classList.remove('active');
    if (!panelMaster._loaded) { panelMaster._loaded = true; renderMasterPanel(panelMaster); }
  });

  renderUserPanel(panelUser);
}

// ========================================
// ユーザー管理パネル
// ========================================
async function renderUserPanel(panel) {
  panel.innerHTML = '<div class="loading"><div class="spinner"></div>読み込み中…</div>';
  const res = await api('GET', '/api/users');
  panel.innerHTML = '';

  if (res.error) { showError(panel, res.error); return; }
  const users = res.data || [];

  // ユーザー一覧カード
  const listCard = document.createElement('div');
  listCard.className = 'card';
  const listHdr = document.createElement('div');
  listHdr.className = 'section-header';
  listHdr.textContent = 'ユーザー一覧';
  listCard.appendChild(listHdr);

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  table.innerHTML = `<thead><tr><th>ユーザー名</th><th>表示名</th><th>権限</th><th>状態</th><th></th></tr></thead>`;
  const tbody = document.createElement('tbody');

  users.forEach(u => {
    const tr = document.createElement('tr');

    const tdUser = document.createElement('td');
    tdUser.textContent = u.username;
    tr.appendChild(tdUser);

    const tdName = document.createElement('td');
    tdName.textContent = u.display_name || '';
    tr.appendChild(tdName);

    const tdRole = document.createElement('td');
    const roleBadge = document.createElement('span');
    roleBadge.className = u.role === 'admin' ? 'badge badge-admin' : 'badge badge-teacher';
    roleBadge.textContent = u.role === 'admin' ? '管理者' : '教員';
    tdRole.appendChild(roleBadge);
    tr.appendChild(tdRole);

    const tdStatus = document.createElement('td');
    const statusBadge = document.createElement('span');
    statusBadge.className = u.is_disabled ? 'badge badge-danger' : 'badge badge-success';
    statusBadge.textContent = u.is_disabled ? 'ログイン不可' : '有効';
    tdStatus.appendChild(statusBadge);
    tr.appendChild(tdStatus);

    const tdOp = document.createElement('td');
    tdOp.style.textAlign = 'right';
    const btnEdit = document.createElement('button');
    btnEdit.className = 'btn btn-secondary btn-sm';
    btnEdit.textContent = '編集';
    btnEdit.addEventListener('click', () => openUserEditModal(u, () => renderUserPanel(panel)));
    tdOp.appendChild(btnEdit);

    // 自分以外かつデータなしなら削除ボタンも
    if (u.id !== state.user.id) {
      const btnDel = document.createElement('button');
      btnDel.className = 'btn btn-danger btn-sm';
      btnDel.style.marginLeft = '4px';
      btnDel.textContent = '削除';
      btnDel.addEventListener('click', async () => {
        if (!confirm(u.username + ' を削除しますか？')) return;
        const r = await api('DELETE', '/api/users/' + u.id);
        if (r.error) { alert(r.error); return; }
        renderUserPanel(panel);
      });
      tdOp.appendChild(btnDel);
    }
    tr.appendChild(tdOp);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  listCard.appendChild(wrap);
  panel.appendChild(listCard);

  // ユーザー追加フォームカード
  const addCard = document.createElement('div');
  addCard.className = 'card';
  const addHdr = document.createElement('div');
  addHdr.className = 'section-header';
  addHdr.textContent = '新規ユーザー追加';
  addCard.appendChild(addHdr);

  const row1 = document.createElement('div');
  row1.className = 'form-row';
  const fields = [
    { id: 'new-username',     label: 'ユーザー名',  type: 'text',     req: true },
    { id: 'new-displayname',  label: '表示名',       type: 'text',     req: false },
  ];
  fields.forEach(f => {
    const grp = document.createElement('div');
    grp.className = 'form-group';
    grp.innerHTML = `<label class="form-label">${f.label}${f.req ? ' <span class="required">*</span>' : ''}</label>`;
    const inp = document.createElement('input');
    inp.type = f.type;
    inp.className = 'form-control';
    inp.id = f.id;
    grp.appendChild(inp);
    row1.appendChild(grp);
  });
  addCard.appendChild(row1);

  const row2 = document.createElement('div');
  row2.className = 'form-row';

  const pwGrp = document.createElement('div');
  pwGrp.className = 'form-group';
  pwGrp.innerHTML = '<label class="form-label">パスワード <span class="required">*</span></label>';
  const pwInp = document.createElement('input');
  pwInp.type = 'password';
  pwInp.className = 'form-control';
  pwInp.id = 'new-password';
  pwGrp.appendChild(pwInp);

  const roleGrp = document.createElement('div');
  roleGrp.className = 'form-group';
  roleGrp.innerHTML = '<label class="form-label">権限 <span class="required">*</span></label>';
  const roleSel = document.createElement('select');
  roleSel.className = 'form-control';
  roleSel.id = 'new-role';
  roleSel.innerHTML = '<option value="teacher">教員</option><option value="admin">管理者</option>';
  roleGrp.appendChild(roleSel);

  row2.appendChild(pwGrp);
  row2.appendChild(roleGrp);
  addCard.appendChild(row2);

  const addErrEl = document.createElement('div');
  addErrEl.id = 'add-user-error';
  addCard.appendChild(addErrEl);

  const btnAdd = document.createElement('button');
  btnAdd.className = 'btn btn-primary mt-8';
  btnAdd.textContent = '追加';
  btnAdd.addEventListener('click', async () => {
    addErrEl.innerHTML = '';
    const username    = document.getElementById('new-username').value.trim();
    const displayName = document.getElementById('new-displayname').value.trim();
    const password    = document.getElementById('new-password').value;
    const role        = document.getElementById('new-role').value;

    if (!username || !password) {
      addErrEl.className = 'form-error';
      addErrEl.textContent = 'ユーザー名とパスワードは必須です';
      return;
    }
    const r = await api('POST', '/api/users', { username, display_name: displayName, password, role });
    if (r.error) { addErrEl.className = 'form-error'; addErrEl.textContent = r.error; return; }
    renderUserPanel(panel);
  });
  addCard.appendChild(btnAdd);
  panel.appendChild(addCard);
}

// ========================================
// ユーザー編集モーダル
// ========================================
function openUserEditModal(user, onSaved) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">ユーザーを編集：${escT(user.username)}</div>
      <button class="modal-close" id="ue-close">✕</button>
    </div>
    <div class="form-group">
      <label class="form-label">表示名</label>
      <input class="form-control" type="text" id="ue-displayname" value="${escT(user.display_name || '')}" />
    </div>
    <div class="form-group">
      <label class="form-label">権限</label>
      <select class="form-control" id="ue-role">
        <option value="teacher" ${user.role === 'teacher' ? 'selected' : ''}>教員</option>
        <option value="admin"   ${user.role === 'admin'   ? 'selected' : ''}>管理者</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">新しいパスワード（変更する場合のみ）</label>
      <input class="form-control" type="password" id="ue-password" autocomplete="new-password" />
    </div>
    <div class="form-group">
      <div class="form-check">
        <input type="checkbox" id="ue-disabled" ${user.is_disabled ? 'checked' : ''}
               ${user.id === state.user.id ? 'disabled' : ''} />
        <label for="ue-disabled">ログイン不可にする</label>
      </div>
      ${user.id === state.user.id ? '<div class="text-muted" style="font-size:11px;margin-top:4px;">自分自身は無効化できません</div>' : ''}
    </div>
    <div id="ue-error"></div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="ue-cancel">キャンセル</button>
      <button class="btn btn-primary"   id="ue-save">保存</button>
    </div>`;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  const close = () => document.body.removeChild(overlay);
  modal.querySelector('#ue-close').addEventListener('click', close);
  modal.querySelector('#ue-cancel').addEventListener('click', close);

  modal.querySelector('#ue-save').addEventListener('click', async () => {
    const errEl = modal.querySelector('#ue-error');
    errEl.innerHTML = '';
    const payload = {
      display_name: modal.querySelector('#ue-displayname').value.trim(),
      role:         modal.querySelector('#ue-role').value,
      is_disabled:  modal.querySelector('#ue-disabled').checked ? 1 : 0,
    };
    const pw = modal.querySelector('#ue-password').value;
    if (pw) payload.password = pw;

    const r = await api('PUT', '/api/users/' + user.id, payload);
    if (r.error) { errEl.className = 'form-error'; errEl.textContent = r.error; return; }
    close();
    onSaved();
  });
}

// ========================================
// マスターデータ管理パネル
// ========================================
const MASTER_LABELS = {
  department:          '学部名',
  game_element:        'ゲーム要素',
  consultation_method: '相談方法',
  ai_usage_scope:      'AI使用範囲',
  industry:            '業種',
  occupation:          '職種',
  evaluation:          '評価',
};

async function renderMasterPanel(panel) {
  panel.innerHTML = '<div class="loading"><div class="spinner"></div>読み込み中…</div>';
  const res = await api('GET', '/api/masters/all');
  panel.innerHTML = '';

  if (res.error) { showError(panel, res.error); return; }
  const masters = res.data || {};

  Object.entries(MASTER_LABELS).forEach(([fieldType, jpLabel]) => {
    const rows = masters[fieldType] || [];
    const card = document.createElement('div');
    card.className = 'card';
    card.style.marginBottom = '16px';

    const hdr = document.createElement('div');
    hdr.style.display = 'flex';
    hdr.style.justifyContent = 'space-between';
    hdr.style.alignItems = 'center';
    hdr.style.marginBottom = '12px';

    const titleEl = document.createElement('div');
    titleEl.className = 'section-header';
    titleEl.style.margin = '0';
    titleEl.textContent = jpLabel;
    hdr.appendChild(titleEl);
    card.appendChild(hdr);

    // マスター値一覧テーブル
    if (rows.length > 0) {
      const tbl = document.createElement('table');
      tbl.innerHTML = `<thead><tr><th>ラベル</th><th>並び順</th><th>状態</th><th></th></tr></thead>`;
      const tbody = document.createElement('tbody');
      rows.forEach(m => {
        const tr = document.createElement('tr');

        const tdLabel = document.createElement('td');
        tdLabel.textContent = m.label;
        tr.appendChild(tdLabel);

        const tdSort = document.createElement('td');
        tdSort.textContent = m.sort_order;
        tr.appendChild(tdSort);

        const tdStatus = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = m.is_disabled ? 'badge badge-muted' : 'badge badge-success';
        badge.textContent = m.is_disabled ? '無効' : '有効';
        tdStatus.appendChild(badge);
        tr.appendChild(tdStatus);

        const tdOp = document.createElement('td');
        tdOp.style.textAlign = 'right';
        tdOp.style.whiteSpace = 'nowrap';

        const btnEdit = document.createElement('button');
        btnEdit.className = 'btn btn-secondary btn-sm';
        btnEdit.textContent = '編集';
        btnEdit.addEventListener('click', () => openMasterEditModal(m, () => renderMasterPanel(panel)));
        tdOp.appendChild(btnEdit);

        const btnToggle = document.createElement('button');
        btnToggle.className = m.is_disabled ? 'btn btn-primary btn-sm' : 'btn btn-danger btn-sm';
        btnToggle.style.marginLeft = '4px';
        btnToggle.textContent = m.is_disabled ? '有効化' : '無効化';
        btnToggle.addEventListener('click', async () => {
          const r = await api('PUT', '/api/masters/' + m.id, { is_disabled: m.is_disabled ? 0 : 1 });
          if (r.error) { alert(r.error); return; }
          renderMasterPanel(panel);
        });
        tdOp.appendChild(btnToggle);

        const btnDel = document.createElement('button');
        btnDel.className = 'btn btn-danger btn-sm';
        btnDel.style.marginLeft = '4px';
        btnDel.textContent = '削除';
        btnDel.addEventListener('click', async () => {
          if (!confirm(m.label + ' を削除しますか？参照中のデータがある場合は無効化してください。')) return;
          const r = await api('DELETE', '/api/masters/' + m.id);
          if (r.error) { alert(r.error); return; }
          renderMasterPanel(panel);
        });
        tdOp.appendChild(btnDel);

        tr.appendChild(tdOp);
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      card.appendChild(tbl);
    } else {
      const em = document.createElement('p');
      em.className = 'text-muted';
      em.textContent = '登録されていません';
      card.appendChild(em);
    }

    // 追加フォーム（インライン）
    const addRow = document.createElement('div');
    addRow.style.display = 'flex';
    addRow.style.gap = '8px';
    addRow.style.marginTop = '12px';
    addRow.style.alignItems = 'flex-end';

    const addLabelGrp = document.createElement('div');
    addLabelGrp.className = 'form-group';
    addLabelGrp.style.flex = '1';
    addLabelGrp.style.marginBottom = '0';
    addLabelGrp.innerHTML = '<label class="form-label">新しいラベル</label>';
    const addLabelInp = document.createElement('input');
    addLabelInp.type = 'text';
    addLabelInp.className = 'form-control';
    addLabelInp.placeholder = 'ラベルを入力…';
    addLabelGrp.appendChild(addLabelInp);

    const addSortGrp = document.createElement('div');
    addSortGrp.className = 'form-group';
    addSortGrp.style.width = '80px';
    addSortGrp.style.marginBottom = '0';
    addSortGrp.innerHTML = '<label class="form-label">並び順</label>';
    const addSortInp = document.createElement('input');
    addSortInp.type = 'number';
    addSortInp.className = 'form-control';
    addSortInp.value = rows.length > 0 ? Math.max(...rows.map(r => r.sort_order)) + 1 : 1;
    addSortGrp.appendChild(addSortInp);

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary';
    addBtn.style.marginBottom = '0';
    addBtn.textContent = '追加';
    addBtn.addEventListener('click', async () => {
      const label = addLabelInp.value.trim();
      if (!label) { alert('ラベルを入力してください'); return; }
      const r = await api('POST', '/api/masters', {
        field_type: fieldType,
        label,
        sort_order: parseInt(addSortInp.value, 10) || 0,
      });
      if (r.error) { alert(r.error); return; }
      renderMasterPanel(panel);
    });

    addRow.appendChild(addLabelGrp);
    addRow.appendChild(addSortGrp);
    addRow.appendChild(addBtn);
    card.appendChild(addRow);

    panel.appendChild(card);
  });
}

// ========================================
// マスターデータ編集モーダル
// ========================================
function openMasterEditModal(master, onSaved) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">マスターデータを編集</div>
      <button class="modal-close" id="me-close">✕</button>
    </div>
    <div class="form-group">
      <label class="form-label">ラベル <span class="required">*</span></label>
      <input class="form-control" type="text" id="me-label" value="${escT(master.label)}" />
    </div>
    <div class="form-group">
      <label class="form-label">並び順</label>
      <input class="form-control" type="number" id="me-sort" value="${master.sort_order}" />
    </div>
    <div id="me-error"></div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="me-cancel">キャンセル</button>
      <button class="btn btn-primary"   id="me-save">保存</button>
    </div>`;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  const close = () => document.body.removeChild(overlay);
  modal.querySelector('#me-close').addEventListener('click', close);
  modal.querySelector('#me-cancel').addEventListener('click', close);

  modal.querySelector('#me-save').addEventListener('click', async () => {
    const errEl = modal.querySelector('#me-error');
    errEl.innerHTML = '';
    const label = modal.querySelector('#me-label').value.trim();
    const sort  = parseInt(modal.querySelector('#me-sort').value, 10);
    if (!label) { errEl.className = 'form-error'; errEl.textContent = 'ラベルは必須です'; return; }
    const r = await api('PUT', '/api/masters/' + master.id, { label, sort_order: sort });
    if (r.error) { errEl.className = 'form-error'; errEl.textContent = r.error; return; }
    close();
    onSaved();
  });
}
// ========================================
// ログイン画面
// ========================================
function renderLogin() {
  // すでにログイン済みの場合はシラバス一覧へ
  if (state.token && state.user) {
    location.hash = '#/syllabi';
    return;
  }

  const app = document.getElementById('app');

  // ログイン画面はサイドバーなし・全画面レイアウト
  app.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'login-wrap';

  const card = document.createElement('div');
  card.className = 'login-card';
  card.innerHTML = `
    <div class="login-title">シラバス外部レビューDB</div>
    <div class="login-subtitle">教員・管理者ログイン</div>
    <div class="form-group">
      <label class="form-label" for="login-username">ユーザー名</label>
      <input class="form-control" type="text" id="login-username"
             placeholder="ユーザー名を入力" autocomplete="username" />
    </div>
    <div class="form-group">
      <label class="form-label" for="login-password">パスワード</label>
      <input class="form-control" type="password" id="login-password"
             placeholder="パスワードを入力" autocomplete="current-password" />
    </div>
    <div id="login-error"></div>
    <button class="btn btn-primary" id="login-btn" style="width:100%;margin-top:8px;">ログイン</button>
  `;

  wrap.appendChild(card);
  app.appendChild(wrap);

  const usernameEl = card.querySelector('#login-username');
  const passwordEl = card.querySelector('#login-password');
  const errorEl    = card.querySelector('#login-error');
  const loginBtn   = card.querySelector('#login-btn');

  async function doLogin() {
    const username = usernameEl.value.trim();
    const password = passwordEl.value;

    errorEl.innerHTML = '';

    if (!username || !password) {
      errorEl.className = 'form-error';
      errorEl.textContent = 'ユーザー名とパスワードを入力してください';
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'ログイン中…';

    const res = await api('POST', '/api/auth/login', { username, password });

    loginBtn.disabled = false;
    loginBtn.textContent = 'ログイン';

    if (res.error) {
      errorEl.className = 'form-error';
      errorEl.textContent = res.error || '不明なエラーが発生しました';
      return;
    }

    setAuth(res.token, res.user);
    await loadMasters();
    location.hash = '#/syllabi';
  }

  loginBtn.addEventListener('click', doLogin);

  // Enter キーでログイン
  [usernameEl, passwordEl].forEach(el => {
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  });

  // フォーカス
  usernameEl.focus();
}
