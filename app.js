import { campus as data, profiles, photos } from './data/map-data.js?v=20261117-b';
import { CampusRenderer } from './renderer.js?v=20261117-b';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let viewer, selected, scope = 'all', photoIndex = 0;
let renderedId = null, closing = null, enterTimer = 0;

/* ---------- motion helpers ---------- */
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const mobile = matchMedia('(max-width: 760px)');
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const icon = path => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
const ICON = { close: 'M6 6l12 12M18 6 6 18', prev: 'M14.5 6l-6 6 6 6', next: 'M9.5 6l6 6-6 6', out: 'M8 16 16 8M9 8h7v7', focus: 'M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5' };

function animate(el, keyframes, options) {
  if (!el || reduceMotion.matches || !el.animate) return null;
  return el.animate(keyframes, { easing: EASE_OUT, ...options });
}
function replay(el, className) {
  el.classList.remove(className); void el.offsetWidth; el.classList.add(className);
}

/* ---------- segmented controls: sliding pill ---------- */
function syncPill(seg, animated = true) {
  const pill = seg.querySelector('.seg-pill'), active = seg.querySelector('button.active');
  if (!pill || !active || !seg.clientWidth) return;
  const left = active.offsetLeft, right = seg.clientWidth - left - active.offsetWidth;
  const previous = parseFloat(pill.style.left);
  if (!animated || Number.isNaN(previous)) pill.classList.add('no-anim');
  else pill.dataset.dir = left > previous ? 'right' : 'left';
  pill.style.left = `${left}px`; pill.style.right = `${right}px`;
  if (pill.classList.contains('no-anim')) { void pill.offsetWidth; pill.classList.remove('no-anim'); }
}
function initSegments() {
  const observer = new ResizeObserver(entries => entries.forEach(entry => syncPill(entry.target, false)));
  $$('.segments').forEach(seg => {
    const pill = document.createElement('span');
    pill.className = 'seg-pill'; pill.setAttribute('aria-hidden', 'true');
    seg.prepend(pill); seg.classList.add('has-pill'); syncPill(seg, false); observer.observe(seg);
  });
}
function setSegment(attribute, value) {
  $$(`[data-${attribute}]`).forEach(el => {
    const on = el.dataset[attribute] === value;
    el.classList.toggle('active', on); el.setAttribute('aria-pressed', on);
  });
  const seg = $(`[data-${attribute}]`).closest('.segments');
  syncPill(seg);
}

/* ---------- building list ---------- */
function displayNumber(b) { return b.number ? b.number.padStart(2, '0') : '—'; }
function filteredBuildings() {
  const q = $('#search').value.trim().toLowerCase().replace(/동$/, '');
  return data.buildings.filter(b => (scope === 'all' || b.review) && (!q || (/^\d+(?:-\d+)?$/.test(q) ? b.number === q : `${b.number} ${b.name}`.toLowerCase().includes(q))));
}
function listBuildings(entering = false) {
  const filtered = filteredBuildings(), list = $('#building-list'), count = `${filtered.length}개`;
  if ($('#result-count').textContent !== count) { $('#result-count').textContent = count; replay($('#result-count'), 'is-changed'); }
  $('#list-title').textContent = scope === 'review' ? '외관 검토 대상' : '건물 목록';
  $('#clear-search').hidden = !$('#search').value;
  list.innerHTML = filtered.length ? filtered.map((b, i) => `<button class="building-row${b.id === selected ? ' active' : ''}" style="--i:${Math.min(i, 14)}" data-id="${escapeHtml(b.id)}" aria-label="${escapeHtml(b.number ? b.number + '동 ' : '')}${escapeHtml(b.name)}" ${b.id === selected ? 'aria-current="true"' : ''}><span class="num">${escapeHtml(displayNumber(b))}</span><span class="row-name">${escapeHtml(b.name)}</span>${b.review ? '<span class="dot" title="외관 추정 대상"></span>' : b.geometryStatus === 'schematic' ? '<span class="dot schematic" title="위치만 확인 · 윤곽 미확인"></span>' : ''}</button>`).join('') : '<p class="empty"><strong>검색한 건물이 없습니다.</strong><span>건물 번호나 이름을 다시 확인해 주세요.</span></p>';
  clearTimeout(enterTimer);
  list.classList.toggle('is-entering', entering);
  if (entering) { list.scrollTop = 0; enterTimer = setTimeout(() => list.classList.remove('is-entering'), 1200); }
}
function markActive(reveal = false) {
  for (const row of $$('#building-list .building-row')) {
    const on = row.dataset.id === selected;
    row.classList.toggle('active', on);
    if (on) { row.setAttribute('aria-current', 'true'); if (reveal) row.scrollIntoView({ block: 'nearest' }); }
    else row.removeAttribute('aria-current');
  }
}

/* ---------- inspector ---------- */
function closeInspector() {
  const panel = $('#inspector');
  renderedId = null;
  if (panel.hidden || closing) return;
  const done = () => { closing = null; panel.hidden = true; panel.removeAttribute('data-closing'); };
  const exit = animate(panel, mobile.matches
    ? [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(40px)' }]
    : [{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'translateX(16px) scale(.99)', filter: 'blur(2px)' }],
    { duration: 220, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
  if (!exit) return done();
  closing = exit; panel.setAttribute('data-closing', '');
  exit.onfinish = () => { exit.cancel(); done(); };
}
function deselect() {
  selected = null; viewer.select(null); closeInspector(); markActive();
}
function renderInspector() {
  const panel = $('#inspector');
  const b = data.buildings.find(b => b.id === selected);
  if (!b) { closeInspector(); return; }
  const record = photos.buildings.find(p => String(p.number) === b.number && b.review);
  const images = record?.images || [];
  photoIndex = Math.min(photoIndex, Math.max(0, images.length - 1));
  const photo = images[photoIndex], profile = profiles[b.number];
  const detailed = b.review && $('#detail-toggle').checked;
  const height = detailed ? b.detailHeight : b.height;
  const flat = viewer.view === '2d';
  const focusedId = panel.contains(document.activeElement) ? document.activeElement.id : '';
  const scroller = panel.querySelector('.inspector-scroll');
  const keepScroll = renderedId === b.id && scroller ? scroller.scrollTop : 0;
  const wasHidden = panel.hidden || !!closing;
  if (closing) { closing.onfinish = null; closing.cancel(); closing = null; panel.removeAttribute('data-closing'); }

  panel.hidden = false;
  panel.innerHTML = `<div class="inspector-heading"><span class="inspector-number">${escapeHtml(displayNumber(b))}</span><h2>${escapeHtml(b.name)}</h2><button class="icon-button" id="close-inspector" aria-label="건물 정보 닫기">${icon(ICON.close)}</button></div>
<div class="inspector-scroll"><div class="inspector-body">
<div class="inspector-summary${photo ? ' has-photo' : ''}">${photo ? `<div class="photo"><div class="photo-frame"><img src="${escapeHtml(photo.path)}" alt="${escapeHtml(b.number + '동 ' + b.name)} 실제 외관 참고 사진" decoding="async"><span class="photo-count">${photoIndex + 1} / ${images.length}</span></div><div class="photo-nav"><a href="${escapeHtml(photo.sourcePage || record.sourcePage)}" target="_blank" rel="noreferrer"><span>${escapeHtml(photo.sourceName || '서울대학교 공식 자료')}</span>${icon(ICON.out)}</a>${images.length > 1 ? `<div class="photo-buttons"><button id="prev-photo" aria-label="이전 사진">${icon(ICON.prev)}</button><button id="next-photo" aria-label="다음 사진">${icon(ICON.next)}</button></div>` : ''}</div></div>` : ''}<dl class="data-grid"><div><dt>지도 윤곽 면적</dt><dd>${b.area === null ? '윤곽 미확인' : '약 ' + b.area.toLocaleString('ko-KR') + ' m²'}</dd></div><div><dt>모형 높이</dt><dd>${height.toFixed(1)} m <span class="status${b.heightBasis === 'OSM 높이' && !b.review ? ' is-map' : ''}">${b.heightBasis === 'OSM 높이' && !b.review ? '지도 값' : '추정'}</span></dd></div><div><dt>모형</dt><dd>${detailed ? '사진 참고 초안' : '사각형 기본 모형'}</dd></div></dl></div>
<p class="model-note">${escapeHtml(b.geometryStatus === 'schematic' ? '공식 지도에서 위치만 확인했습니다. 윤곽 자료가 없어 16 × 12m 임시 상자로 표시하며, 실제 면적·형태를 뜻하지 않습니다.' : b.review ? profile?.note || '외관을 추정한 모형입니다.' : '건물 윤곽을 감싸는 사각형 모형입니다. ' + b.heightBasis + '를 적용했습니다.')}${b.number === '7' && b.review ? '<strong class="notice">증축 공사 중 · 기존 외관 기준</strong>' : ''}</p>
${profile?.structureFeatures ? `<ul class="structure-features">${profile.structureFeatures.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul><div class="facade-actions"><button class="button outline" id="front-building" ${flat ? 'disabled' : ''}>정면 구조 보기</button><button class="button outline" id="side-building" ${flat ? 'disabled' : ''}>측면 구조 보기</button></div>` : ''}
<div class="model-actions"><button class="button primary" id="focus-building">${icon(ICON.focus)}가까이 보기</button><a class="button outline" href="${escapeHtml(record?.sourcePage || b.officialSource || b.source)}" target="_blank" rel="noreferrer">건물 자료${icon(ICON.out)}</a></div>
</div></div>`;

  /* photo: skeleton sheen until the image has decoded, then cross-fade in */
  const img = panel.querySelector('.photo-frame img');
  if (img) {
    const frame = img.parentElement;
    const reveal = () => requestAnimationFrame(() => frame.classList.add('is-loaded'));
    img.addEventListener('error', () => frame.classList.add('is-error'));
    if (img.complete && img.naturalWidth) reveal(); else img.addEventListener('load', reveal);
  }

  /* motion: panel reveal on open, content swap when another building is picked */
  if (wasHidden) {
    animate(panel, mobile.matches
      ? [{ opacity: 0, transform: 'translateY(100px)' }, { opacity: 1, transform: 'none' }]
      : [{ opacity: 0, transform: 'translateX(30px)', filter: 'blur(2px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
      { duration: 400 });
  } else if (renderedId !== b.id) {
    animate(panel.querySelector('.inspector-body'), [{ opacity: 0, transform: 'translateX(8px)', filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 250 });
    animate(panel.querySelector('.inspector-heading'), [{ opacity: 0 }, { opacity: 1 }], { duration: 250 });
  }
  if (keepScroll) panel.querySelector('.inspector-scroll').scrollTop = keepScroll;
  renderedId = b.id;

  $('#close-inspector').onclick = deselect;
  $('#focus-building').onclick = () => viewer.focus(b, true);
  const showFacade = side => { $('#detail-toggle').checked = true; viewer.setDetail(true); viewer.facade(b, side); renderInspector(); };
  if ($('#front-building')) $('#front-building').onclick = () => showFacade(false);
  if ($('#side-building')) $('#side-building').onclick = () => showFacade(true);
  if ($('#prev-photo')) $('#prev-photo').onclick = () => { photoIndex = (photoIndex + images.length - 1) % images.length; renderInspector(); };
  if ($('#next-photo')) $('#next-photo').onclick = () => { photoIndex = (photoIndex + 1) % images.length; renderInspector(); };
  if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
}

/* ---------- selection, scope, view ---------- */
function selectBuilding(id) {
  selected = id; photoIndex = 0; viewer.select(id); markActive(true); renderInspector();
  const b = data.buildings.find(b => b.id === id);
  viewer.focus(b, true); closeSidebar(false);
}
function setScope(value) {
  const changed = scope !== value || !!$('#search').value;
  scope = value; setSegment('scope', value);
  $('#search').value = ''; selected = null; listBuildings(changed);
  viewer.reset(value);
  $('#map-location').textContent = value === 'review' ? '사진 기반 모델' : '관악캠퍼스 전체';
  viewer.select(null); closeInspector(); closeSidebar(false);
}
function setView(view) {
  setSegment('view', view);
  viewer.setView(view); viewer.select(selected);
  $('#map-help').textContent = view === '2d' ? '드래그 이동 · 스크롤 확대' : '드래그 회전 · 우클릭 이동 · 스크롤 확대';
  $('#detail-toggle').disabled = view === '2d';
  $('#map-description').textContent = view === '2d' ? '지면 윤곽 · 북쪽 기준' : '평면 지형 · 건물 높이 추정';
  renderInspector();
}

/* ---------- mobile sidebar (sheet) ---------- */
function openSidebar() {
  $('#sidebar').classList.add('open'); $('#open-list').setAttribute('aria-expanded', 'true');
  if (mobile.matches) $('#close-list').focus({ preventScroll: true });
}
function closeSidebar(restoreFocus = true) {
  const sidebar = $('#sidebar'), wasOpen = sidebar.classList.contains('open');
  sidebar.classList.remove('open'); $('#open-list').setAttribute('aria-expanded', 'false');
  if (wasOpen && restoreFocus && mobile.matches) $('#open-list').focus({ preventScroll: true });
}

/* ---------- loading and error states ---------- */
function hideLoading() {
  const loading = $('#loading');
  const fade = animate(loading, [{ opacity: 1 }, { opacity: 0 }], { duration: 250, easing: 'ease-in-out', fill: 'forwards' });
  if (!fade) { loading.hidden = true; return; }
  fade.onfinish = () => { loading.hidden = true; fade.cancel(); };
}
function showError() {
  $('#loading').hidden = true;
  $('#building-list').innerHTML = '';
  $('#building-count').textContent = '불러오기 실패';
  const box = $('#map-error');
  box.hidden = false;
  box.innerHTML = '<div class="error-card"><span class="error-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 8v5M12 16.4v.2M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20.2h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg></span><strong>지도를 불러오지 못했습니다.</strong><p>인터넷 연결과 브라우저의 WebGL 지원 여부를 확인한 뒤 새로고침해 주세요.</p><button class="button primary" id="retry">다시 시도</button></div>';
  $('#retry').onclick = () => location.reload();
  animate(box.firstElementChild, [{ opacity: 0, transform: 'translateY(8px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 260 });
}

async function init() {
  for (const rec of photos.buildings) { const b = data.buildings.find(b => b.review && b.number === String(rec.number)); if (b && rec.officialName) b.name = rec.officialName; }
  viewer = new CampusRenderer($('#map'), $('#labels'), data, profiles, selectBuilding);
  $('#building-count').textContent = `${data.buildings.length}개 모형`;
  $('#coverage-note').textContent = `공식 건물 목록 ${data.coverage.officialEntries}개 항목을 모두 대조했습니다. 지도 윤곽 ${data.coverage.mappedFootprints}개와 윤곽이 없는 공식 위치 ${data.coverage.schematicEntries}개를 합쳐 ${data.coverage.totalModels}개 모형을 표시합니다. 주황색 임시 모형은 위치만 확인된 16 × 12m 상자이며 면적·형태는 미확인입니다. 최근 신축·철거·증축은 자료마다 시점이 다를 수 있습니다.`;
  listBuildings(true); hideLoading();
  $('#building-list').addEventListener('click', e => { const row = e.target.closest('[data-id]'); if (row) selectBuilding(row.dataset.id); });
  $('#search').addEventListener('input', () => listBuildings());
  $('#clear-search').onclick = () => { $('#search').value = ''; listBuildings(); $('#search').focus(); };
  $$('[data-scope]').forEach(el => el.onclick = () => setScope(el.dataset.scope));
  $$('[data-view]').forEach(el => el.onclick = () => setView(el.dataset.view));
  $('#detail-toggle').onchange = e => { viewer.setDetail(e.target.checked); viewer.select(selected); renderInspector(); };
  $('#zoom-in').onclick = () => viewer.zoom(1.35);
  $('#zoom-out').onclick = () => viewer.zoom(1 / 1.35);
  $('#north').onclick = () => viewer.north();
  $('#reset-view').onclick = () => setScope('all');
  document.addEventListener('keydown', e => {
    if ($('#sources-dialog').open) return; // the dialog handles its own Escape
    if (e.key === 'Escape') { closeSidebar(); deselect(); }
    else if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) {
      e.preventDefault(); if (mobile.matches) openSidebar(); $('#search').focus(); $('#search').select();
    }
  });
}

initSegments();
$('#sources-button').onclick = () => { $('#sources-dialog').showModal(); $('#sources-dialog').querySelector('.dialog-body').scrollTop = 0; };
$('#close-sources').onclick = () => $('#sources-dialog').close();
$('#sources-dialog').addEventListener('click', e => {
  if (e.target !== $('#sources-dialog')) return;
  const r = e.target.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close();
});
$('#open-list').onclick = openSidebar;
$('#close-list').onclick = () => closeSidebar();
$('#scrim').onclick = () => closeSidebar();
init().catch(error => { console.error(error); showError(); });
