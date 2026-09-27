"""Reference-photo pipeline: discover → triage → fetch → review → rebuild.

Every downloaded file lands in research/buildings/<NNN>/photos/ and gets an
audit record (source page, exact image URL, SHA-256, perceptual hash, EXIF
capture date). Candidates rejected from search thumbnails are never
downloaded, but the rejection and its reason stay in candidates.json so the
search itself can be reviewed. Requires Pillow (hashing, EXIF, sheets).

  python3 research/refs.py discover 8 "서울대 두산인문관" "서울대 8동" [--pages 2]
  python3 research/refs.py sheet 8 [--from candidates|pending] [--out DIR]
  python3 research/refs.py skip 8 <cid,...> "사유"
  python3 research/refs.py fetch 8 <cid,...>
  python3 research/refs.py review 8 <file> accepted|excluded|duplicate "관찰" [--views 정면,측면]
  python3 research/refs.py rebuild
"""
from pathlib import Path
import argparse, datetime, hashlib, html, io, json, re, subprocess, sys, urllib.parse
from PIL import Image, ImageDraw, ImageFont, ImageOps

R = Path(__file__).resolve().parent
ROOT = R.parent
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
TODAY = datetime.date.today().isoformat()
VIEWS = ['정면', '측면', '후면', '지붕', '출입부', '세부', '원경', '조감']

def load(p, default=None):
    return json.loads(p.read_text()) if p.exists() else default
def save(p, d):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
def folder(number): return R / 'buildings' / str(number).zfill(3)
def cid(url): return hashlib.sha1(url.encode()).hexdigest()[:8]

def curl(url, referer=None, timeout=40):
    cmd = ['curl', '-sL', '--fail', '--max-time', str(timeout), '-A', UA]
    if referer: cmd += ['-e', referer]
    for attempt in range(4):
        out = subprocess.run(cmd + [url], capture_output=True)
        if not out.returncode: return out.stdout
        if out.returncode not in (7, 28, 35, 52, 56): break
        __import__('time').sleep(2 + attempt * 3)
    raise RuntimeError(f'curl {out.returncode}: {url}')

def dhash(img, size=8):
    g = ImageOps.exif_transpose(img).convert('L').resize((size + 1, size), Image.LANCZOS)
    px = list(g.get_flattened_data() if hasattr(g, "get_flattened_data") else g.getdata()); bits = 0
    for row in range(size):
        for col in range(size):
            bits = (bits << 1) | (px[row*(size+1)+col] > px[row*(size+1)+col+1])
    return f'{bits:016x}'
def hamming(a, b): return bin(int(a, 16) ^ int(b, 16)).count('1')

def exif_date(img):
    try:
        ex = img.getexif(); raw = ex.get_ifd(0x8769).get(36867) or ex.get(306)
        return raw.replace(':', '-', 2) if raw else None
    except Exception: return None

# --- discover ---------------------------------------------------------------
def naver_images(query, page):
    start = 1 + (page - 1) * 50
    url = 'https://search.naver.com/search.naver?where=image&query=' + urllib.parse.quote(query) + f'&start={start}'
    text = curl(url).decode('utf8', 'ignore')
    items = []
    for m in re.finditer(r'\{"type":"image"', text):
        end = json_object_end(text, m.start())
        if end is None: continue
        try: item = json.loads(text[m.start():end])
        except json.JSONDecodeError: continue
        if item.get('originalUrl'): items.append(item)
    return items

def json_object_end(text, start):
    depth, in_str, escape = 0, False, False
    for i in range(start, min(len(text), start + 40000)):
        ch = text[i]
        if in_str:
            if escape: escape = False
            elif ch == '\\': escape = True
            elif ch == '"': in_str = False
        elif ch == '"': in_str = True
        elif ch == '{': depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0: return i + 1
    return None

def discover(a):
    f = folder(a.building) / 'candidates.json'
    data = load(f, {'building': a.building, 'queries': [], 'candidates': []})
    known = {c['originalUrl'] for c in data['candidates']}
    added = 0
    for q in a.queries:
        for page in range(1, a.pages + 1):
            for it in naver_images(q, page):
                url = it.get('originalUrl', '').replace('\\u0026', '&')
                if not url or url in known: continue
                known.add(url); added += 1
                data['candidates'].append(dict(
                    cid=cid(url), originalUrl=url, sourcePage=it.get('link', ''),
                    source=it.get('source', ''), title=html.unescape(it.get('title', '')),
                    publishedDate=(it.get('dateInfo') or '').rstrip('.').replace('.', '-') or None,
                    thumb=it.get('viewerThumb', '').replace('\\u0026', '&'),
                    query=q, status='new', reason=None))
        data['queries'].append(dict(engine='naver-image', query=q, pages=a.pages, date=TODAY))
    save(f, data)
    print(f'{a.building}동: +{added} 후보 (전체 {len(data["candidates"])})')

from concurrent.futures import ThreadPoolExecutor
def load_thumbs(urls, box, referer='https://blog.naver.com/'):
    def one(u):
        try:
            raw = u.read_bytes() if isinstance(u, Path) else curl(u, referer, timeout=25)
            im = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGB'); im.thumbnail(box); return im
        except Exception:
            return Image.new('RGB', (box[0], 40), '#ddd')
    with ThreadPoolExecutor(max_workers=12) as pool: return list(pool.map(one, urls))

# --- contact sheets -----------------------------------------------------------
def font(size):
    for path in ['/System/Library/Fonts/AppleSDGothicNeo.ttc', '/System/Library/Fonts/Supplemental/Arial.ttf']:
        try: return ImageFont.truetype(path, size)
        except OSError: pass
    return ImageFont.load_default()

def sheet(a):
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    if a.source == 'candidates':
        data = load(folder(a.building) / 'candidates.json')
        rows = [(c['cid'], c['title'][:24], c['thumb'], c['sourcePage']) for c in data['candidates'] if c['status'] == 'new']
    else:
        audit = load(R / 'photo-audit.json')
        rows = [(Path(r['path']).stem, Path(r['path']).name[:24], R / r['path'], None)
                for r in audit['records'] if r['building'] == str(a.building) and r['decision'] == 'pending']
    cols, cell, per = a.cols, a.cell, a.cols * a.rows
    f = font(15)
    for s in range(0, len(rows), per):
        chunk = rows[s:s+per]
        rows_n = (len(chunk) + cols - 1) // cols
        board = Image.new('RGB', (cols*cell, rows_n*(cell*3//4+22)), 'white')
        d = ImageDraw.Draw(board)
        thumbs = load_thumbs([src for _, _, src, _ in chunk], (cell-6, cell*3//4-6), 'https://search.naver.com/')
        for i, ((key, label, src, ref), im) in enumerate(zip(chunk, thumbs)):
            x, y = (i % cols)*cell, (i // cols)*(cell*3//4+22)
            board.paste(im, (x+3, y+3))
            d.rectangle([x, y+cell*3//4, x+cell, y+cell*3//4+22], fill='#222')
            d.text((x+4, y+cell*3//4+2), f'{key} {label}', fill='white', font=f)
        name = out / f'{a.building}-{a.source}-{s//per+1:02}.jpg'
        board.save(name, quality=82); print(name)

def skip(a):
    f = folder(a.building) / 'candidates.json'; data = load(f)
    ids = set(a.ids.split(','))
    for c in data['candidates']:
        if c['cid'] in ids or (a.ids == 'rest' and c['status'] == 'new'):
            c.update(status='skipped', reason=a.reason, triageDate=TODAY)
    save(f, data)

# --- fetch ------------------------------------------------------------------
def fetch(a):
    f = folder(a.building) / 'candidates.json'; data = load(f)
    audit = load(R / 'photo-audit.json')
    mine = [r for r in audit['records'] if r['building'] == str(a.building)]
    photos = folder(a.building) / 'photos'; photos.mkdir(parents=True, exist_ok=True)
    for c in data['candidates']:
        if c['cid'] not in a.ids.split(','): continue
        try:
            raw = curl(c['originalUrl'], c['sourcePage'] or 'https://blog.naver.com/')
            im = Image.open(io.BytesIO(raw)); im.load()
        except Exception as e:
            c.update(status='failed', reason=str(e)[:120]); print('실패', c['cid'], e); continue
        ext = {'JPEG': 'jpg', 'PNG': 'png', 'GIF': 'gif', 'WEBP': 'webp'}.get(im.format, 'jpg')
        path = photos / f'n-{c["cid"]}.{ext}'
        path.write_bytes(raw)
        sha = hashlib.sha256(raw).hexdigest(); dh = dhash(im)
        rec = dict(building=str(a.building), path=str(path.relative_to(R)), sourcePage=c['sourcePage'],
                   imageUrl=c['originalUrl'], sourceName=f'{c["source"]} · {c["title"]}'.strip(' ·'),
                   decision='pending', reviewed=False, countsTowardMinimum=False,
                   observations='다운로드 완료, 검토 대기.', captureDate=exif_date(im),
                   publishedDate=c['publishedDate'], sha256=sha, bytes=len(raw), reviewDate=None,
                   pixels=list(im.size), dhash=dh, views=[], discoveredBy=c['query'],
                   **({'identifiedBy': c['identifiedBy']} if c.get('identifiedBy') else {}))
        twin = next((r for r in mine if r['sha256'] == sha or (r.get('dhash') and hamming(r['dhash'], dh) <= 5)), None)
        if twin:
            rec.update(decision='duplicate', reviewed=True, reviewDate=TODAY,
                       observations=f'{Path(twin["path"]).name}와 동일하거나 크기만 다른 사진(해시 비교). 중복 계수 제외.')
        audit['records'].append(rec); mine.append(rec)
        c.update(status='fetched', path=rec['path'])
        print(c['cid'], path.name, im.size, rec['captureDate'] or '-', '중복' if twin else '')
    audit['updatedAt'] = TODAY
    save(R / 'photo-audit.json', audit); save(f, data)

# --- review -----------------------------------------------------------------
def review(a):
    audit = load(R / 'photo-audit.json')
    hit = [r for r in audit['records'] if r['building'] == str(a.building) and Path(r['path']).name.startswith(a.file)]
    if len(hit) != 1: sys.exit(f'{a.file}: {len(hit)}건 일치')
    r = hit[0]; views = [v for v in (a.views or '').split(',') if v]
    bad = [v for v in views if v not in VIEWS]
    if bad: sys.exit(f'알 수 없는 시점 {bad}; 허용 {VIEWS}')
    if a.decision == 'accepted' and not views: sys.exit('채택 사진은 확인한 시점(--views)을 적어야 합니다')
    if a.decision == 'accepted':
        same = [x for x in audit['records'] if x is not r and x['building'] == r['building'] and x['countsTowardMinimum'] and x['sha256'] == r['sha256']]
        if same: sys.exit(f'동일 파일이 이미 계수됨: {same[0]["path"]}')
    r.update(decision=a.decision, reviewed=True, reviewDate=TODAY, observations=a.note,
             countsTowardMinimum=a.decision == 'accepted', views=views)
    if a.captured: r['captureDate'] = a.captured
    audit['updatedAt'] = TODAY
    save(R / 'photo-audit.json', audit)
    n = len({x['sha256'] for x in audit['records'] if x['building'] == r['building'] and x['countsTowardMinimum']})
    print(f'{r["building"]}동 {Path(r["path"]).name}: {a.decision} → 인정 {n}/{audit["minimum"]}')

# --- campus-walk posts: one post, many buildings ------------------------------
# A walk through a precinct photographs neighbouring buildings from angles a
# per-building keyword search never returns. Images go to a shared pool first;
# only after visual identification are they assigned to a building.
POOL = R / 'pool.json'
def naver_post(url):
    m = re.search(r'blog\.naver\.com/(?:PostView\.naver\?blogId=)?([A-Za-z0-9_-]+)(?:/|&logNo=)(\d+)', url)
    if not m: sys.exit(f'네이버 블로그 글 주소가 아닙니다: {url}')
    blog, no = m.groups()
    page = f'https://blog.naver.com/{blog}/{no}'
    text = curl(f'https://blog.naver.com/PostView.naver?blogId={blog}&logNo={no}').decode('utf8', 'ignore')
    return page, f'{blog}-{no}', text

def harvest(a):
    page, slug, text = naver_post(a.url)
    title = html.unescape((re.search(r'<meta property="og:title" content="([^"]*)"', text) or re.search(r'<title>([^<]*)', text)).group(1)).strip()
    date = re.search(r'se_publishDate[^>]*>\s*([0-9]{4})\.\s*([0-9]{1,2})\.\s*([0-9]{1,2})', text)
    date = f'{date.group(1)}-{int(date.group(2)):02}-{int(date.group(3)):02}' if date else None
    pool = load(POOL, {'posts': [], 'candidates': []})
    known = {c['originalUrl'] for c in pool['candidates']}
    caption, added, order = '', 0, 0
    for m in re.finditer(r'data-lazy-src="([^"]+)"|<span[^>]*class="[^"]*se-fs[^"]*"[^>]*>([^<]{2,})</span>', text):
        if m.group(2): caption = html.unescape(m.group(2)).strip(); continue
        thumb = html.unescape(m.group(1)); order += 1
        path = re.sub(r'^https?://(?:post|blog)files\.pstatic\.net/|\?.*$', '', thumb)
        if 'pstatic.net' not in thumb or path == thumb: continue
        url = 'http://blogfiles.naver.net/' + path
        if url in known: continue
        known.add(url); added += 1
        pool['candidates'].append(dict(cid=cid(url), post=slug, order=order, originalUrl=url, sourcePage=page,
            source='네이버 블로그', title=title, publishedDate=date, thumb=re.sub(r'\?.*$', '?type=w966', thumb),
            context=caption[:120], query=f'post:{slug}', status='new', building=None, reason=None))
    pool['posts'] = [x for x in pool['posts'] if x['slug'] != slug] + [dict(slug=slug, url=page, title=title, publishedDate=date, harvested=TODAY)]
    save(POOL, pool)
    print(f'{slug} ({date}) {title[:40]}: 이미지 {order}, 새 후보 {added}')

def find_posts(a):
    """Naver blog search → post URLs; harvest each unseen post into the pool."""
    pool = load(POOL, {'posts': [], 'candidates': []})
    done = {x['url'] for x in pool['posts']}
    found = []
    for q in a.queries:
        for page in range(a.pages):
            url = ('https://search.naver.com/search.naver?ssc=tab.blog.all&query=' + urllib.parse.quote(q) + f'&start={1 + page*30}')
            text = curl(url).decode('utf8', 'ignore')
            for m in re.finditer(r'https://blog\.naver\.com/([A-Za-z0-9_-]+)/(\d{9,})', text):
                u = f'https://blog.naver.com/{m.group(1)}/{m.group(2)}'
                if u not in done and u not in found: found.append(u)
    print(f'새 글 {len(found)}개')
    for u in found[:a.limit]:
        try: harvest(argparse.Namespace(url=u))
        except Exception as e: print('실패', u, e)

def pool_sheet(a):
    pool = load(POOL)
    rows = [c for c in pool['candidates'] if c['status'] == 'new' and (not a.post or c['post'] == a.post)]
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True); f = font(15)
    cols, cell, per = a.cols, a.cell, a.cols * a.rows
    for s in range(0, len(rows), per):
        chunk = rows[s:s+per]; rn = (len(chunk)+cols-1)//cols; h = cell*3//4
        board = Image.new('RGB', (cols*cell, rn*(h+40)), 'white'); d = ImageDraw.Draw(board)
        thumbs = load_thumbs([c['thumb'] for c in chunk], (cell-6, h-6))
        for i, (c, im) in enumerate(zip(chunk, thumbs)):
            x, y = (i % cols)*cell, (i//cols)*(h+40); board.paste(im, (x+3, y+3))
            d.rectangle([x, y+h, x+cell, y+h+40], fill='#222')
            d.text((x+4, y+h+1), f'{c["cid"]} #{c["order"]}', fill='#9fe39b', font=f)
            d.text((x+4, y+h+20), c['context'][:34], fill='white', font=f)
        name = out / f'pool-{a.post or "all"}-{s//per+1:02}.jpg'; board.save(name, quality=85); print(name)

def assign(a):
    pool = load(POOL); ids = a.ids.split(',')
    target = folder(a.building) / 'candidates.json'
    data = load(target, {'building': a.building, 'queries': [], 'candidates': []})
    known = {c['originalUrl'] for c in data['candidates']}
    for c in pool['candidates']:
        if c['cid'] not in ids: continue
        c.update(status='assigned', building=str(a.building), reason=a.why, triageDate=TODAY)
        if c['originalUrl'] not in known:
            data['candidates'].append({**{k: c[k] for k in ('cid','originalUrl','sourcePage','source','title','publishedDate','thumb','query')},
                                       'status': 'new', 'reason': None, 'identifiedBy': a.why, 'context': c['context']})
    save(POOL, pool); save(target, data)
    a.ids = ','.join(ids); fetch(a)

def pool_skip(a):
    pool = load(POOL); ids = set(a.ids.split(','))
    for c in pool['candidates']:
        if c['status'] == 'new' and (c['cid'] in ids or (a.ids == 'rest' and (not a.post or c['post'] == a.post))):
            c.update(status='skipped', reason=a.reason, triageDate=TODAY)
    save(POOL, pool)

# --- rebuild ledger, public status and review page -----------------------------
STATUS = {'accepted': '구조 참고', 'excluded': '제외', 'pending': '검토 대기', 'duplicate': '중복'}
def esc(x): return html.escape(str(x), quote=True)

def prune_rejected(audit):
    """Keep rejection provenance, not rejected binaries or stale candidate paths."""
    removed = load(R / 'rejected-photos.json', [])
    paths = {x['path'] for x in removed}
    for rec in audit['records']:
        if rec['decision'] not in ('excluded', 'duplicate'): continue
        path = (R / rec['path']).resolve()
        if not path.is_relative_to((R / 'buildings').resolve()):
            raise ValueError(f'Photo outside building archive: {path}')
        if path.exists(): path.unlink()
        if rec['path'] not in paths:
            removed.append(dict(rec, fileRemovedAt=TODAY)); paths.add(rec['path'])
    audit['records'] = [r for r in audit['records'] if r['decision'] not in ('excluded', 'duplicate')]
    save(R / 'rejected-photos.json', removed)
    save(R / 'photo-audit.json', audit)
    for p in (R / 'buildings').glob('*/candidates.json'):
        data = load(p)
        for c in data['candidates']:
            if c.get('path') in paths:
                c.pop('path', None)
                c.update(status='skipped', reason='검토에서 제외 또는 중복 판정. 파일 삭제, rejected-photos.json에 근거 보존.')
        save(p, data)

def rebuild(_=None):
    audit = load(R / 'photo-audit.json'); campus = load(ROOT / 'dist/data/campus.json')
    prune_rejected(audit)
    previous = {b['id']: b for b in load(R / 'building-ledger.json', [])}
    minimum = audit['minimum']; ledger = []
    for b in campus['buildings']:
        rr = [r for r in audit['records'] if b['number'] and r['building'] == b['number']]
        accepted = {r['sha256'] for r in rr if r['countsTowardMinimum']}
        views = sorted({v for r in rr if r['countsTowardMinimum'] for v in r.get('views', [])}, key=VIEWS.index)
        prev = previous.get(b['id'], {})
        entry = dict(id=b['id'], number=b['number'], name=b['name'], archivedFiles=len(rr),
                     reviewedPhotos=len(accepted), minimum=minimum, researchReady=len(accepted) >= minimum,
                     viewsCovered=views, viewsMissing=[v for v in ['정면', '측면', '후면', '지붕', '출입부'] if v not in views],
                     modelStatus=prev.get('modelStatus', '재검토 필요' if b.get('review') else '기본 모형'),
                     geometryVerified=prev.get('geometryVerified', False),
                     missing=prev.get('missing', ['후면·측면·지붕 시점', '사진 10장 이상 구조 대조', '근거별 형상 수정 및 같은 시점 비교']))
        if entry['geometryVerified'] and not entry['researchReady']: entry['geometryVerified'] = False
        ledger.append(entry)
    save(R / 'building-ledger.json', ledger)
    save(ROOT / 'dist/data/research-status.json', {'updatedAt': audit['updatedAt'], 'minimum': minimum, 'buildings': ledger})
    write_page(audit, ledger)
    print(f'ledger {len(ledger)}; 파일 {len(audit["records"])}; 기준 충족 {sum(b["researchReady"] for b in ledger)}; 검증 {sum(b["geometryVerified"] for b in ledger)}')

def write_page(audit, ledger):
    by = {}
    for r in audit['records']: by.setdefault(r['building'], []).append(r)
    order = sorted(by, key=lambda n: (-sum(r['countsTowardMinimum'] for r in by[n]), int(re.match(r'\d+', n).group()) if re.match(r'\d+', n) else 9999, n))
    name = {b['number']: b['name'] for b in ledger}
    led = {b['number']: b for b in ledger if b['number']}
    css = ('body{font:15px/1.6 system-ui;margin:0;background:#f1f2ef;color:#29352f}main{max-width:1280px;margin:auto;padding:28px}'
           'a{color:#206845}section,details.b{background:#fff;border:1px solid #dce2db;border-radius:16px;padding:18px 20px;margin:14px 0}'
           'summary{cursor:pointer;font-weight:600}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;margin-top:12px}'
           '.grid article{border:1px solid #e4e8e3;border-radius:12px;padding:10px;min-width:0}img{width:100%;height:200px;object-fit:contain;background:#f3f4f1;border-radius:8px}'
           '.tag{display:inline-block;background:#eaf0e6;padding:1px 8px;border-radius:10px;margin-right:4px;font-size:13px}.x{background:#f3e6e3}.bar{height:8px;background:#e5e9e3;border-radius:6px;overflow:hidden}'
           '.bar i{display:block;height:100%;background:#5c9a4d}small{color:#627064}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:7px;border-bottom:1px solid #e3e3e3}'
           'input{font:inherit;padding:10px;border:1px solid #bbc9bc;border-radius:10px;width:min(380px,90%)}')
    def card(r):
        return (f'<article><a href="{esc(r["path"])}"><img loading="lazy" src="{esc(r["path"])}" alt=""></a>'
                f'<p><b>{esc(Path(r["path"]).name)}</b> <span class="tag{" x" if not r["countsTowardMinimum"] else ""}">{STATUS[r["decision"]]}</span>'
                + ''.join(f'<span class="tag">{esc(v)}</span>' for v in r.get('views', [])) +
                f'</p><p>{esc(r["observations"])}</p><small>촬영일 {esc(r.get("captureDate") or "미확인")} · 게시일 {esc(r.get("publishedDate") or "미확인")}'
                f'<br><a href="{esc(r["sourcePage"])}">출처 페이지 ↗</a> · <a href="{esc(r["imageUrl"])}">원본 URL ↗</a></small></article>')
    parts = ['<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
             f'<title>서울대 건물 사진 리서치</title><style>{css}</style><main><h1>건물 사진 리서치</h1>'
             f'<section><b>기준 충족 {sum(b["researchReady"] for b in ledger)} / {len(ledger)} · 정밀 검증 {sum(b["geometryVerified"] for b in ledger)}</b>'
             f'<p>건물마다 서로 다른 실제 사진 {audit["minimum"]}장 이상을 직접 보고 구조를 대조한 뒤 모델을 고칩니다. 다운로드 수는 인정 수가 아닙니다. '
             '동일 사진·크기만 다른 사진·유사 구도·다른 건물·조경·인물 사진은 제외하고, 참고·검토 대기 사진은 출처·원본 URL·SHA-256과 함께 보존합니다. 제외 사진 파일은 정리하고 URL·사유만 남깁니다. '
             '검색 결과에서 썸네일로 걸러낸 후보는 다운로드하지 않고 각 동의 <code>candidates.json</code>에 제외 사유를 남깁니다.</p>'
             f'<p><a href="photo-audit.json">보관 사진 기록</a> · <a href="rejected-photos.json">제외 기록</a> · <a href="building-ledger.json">건물 원장</a></p></section>']
    for n in order:
        rr = by[n]; ok = len({r['sha256'] for r in rr if r['countsTowardMinimum']}); b = led.get(n, {})
        doc = folder(n) / 'ANALYSIS.md'
        head = (f'{esc(n)}동 {esc(name.get(n, ""))} — 인정 {ok} / {audit["minimum"]} · 보관 {len(rr)}'
                + (f' · 확인 시점: {esc(", ".join(b.get("viewsCovered", [])) or "없음")}' if b else ''))
        parts.append(f'<details class="b"{" open" if 0 < ok < audit["minimum"] or ok >= audit["minimum"] else ""}><summary>{head}</summary>'
                     f'<div class="bar"><i style="width:{min(100, ok*100//audit["minimum"])}%"></i></div>'
                     + (f'<p><a href="{esc(doc.relative_to(R))}">구조 분석 메모</a></p>' if doc.exists() else '')
                     + (f'<p><small>부족한 시점: {esc(", ".join(b["viewsMissing"]))}</small></p>' if b.get('viewsMissing') else '')
                     + '<div class="grid">' + ''.join(card(r) for r in sorted(rr, key=lambda r: (not r['countsTowardMinimum'], r['decision'] != 'pending', r['path']))) + '</div></details>')
    parts.append('<section><h2>전체 건물</h2><input id="q" placeholder="동 번호 또는 이름" aria-label="건물 검색"><table><thead><tr><th>동</th><th>이름</th><th>인정 사진</th><th>확인 시점</th><th>모델 상태</th></tr></thead><tbody>')
    parts += [f'<tr><td>{esc(b["number"] or "번호 미상")}</td><td>{esc(b["name"])}</td><td>{b["reviewedPhotos"]} / {b["minimum"]}</td><td>{esc(", ".join(b["viewsCovered"]))}</td><td>{esc(b["modelStatus"])}{" · 검증" if b["geometryVerified"] else ""}</td></tr>' for b in ledger]
    parts.append('</tbody></table></section></main><script>q.oninput=e=>{for(const r of document.querySelectorAll("tbody tr"))r.hidden=!r.textContent.toLowerCase().includes(e.target.value.toLowerCase())}</script></html>')
    (R / 'index.html').write_text(''.join(parts))

if __name__ == '__main__':
    p = argparse.ArgumentParser(); s = p.add_subparsers(dest='cmd', required=True)
    x = s.add_parser('discover'); x.add_argument('building'); x.add_argument('queries', nargs='+'); x.add_argument('--pages', type=int, default=1); x.set_defaults(fn=discover)
    x = s.add_parser('sheet'); x.add_argument('building'); x.add_argument('--from', dest='source', default='candidates', choices=['candidates', 'pending'])
    x.add_argument('--out', default='/tmp/refs-sheets'); x.add_argument('--cols', type=int, default=5); x.add_argument('--rows', type=int, default=4); x.add_argument('--cell', type=int, default=300); x.set_defaults(fn=sheet)
    x = s.add_parser('skip'); x.add_argument('building'); x.add_argument('ids'); x.add_argument('reason'); x.set_defaults(fn=skip)
    x = s.add_parser('fetch'); x.add_argument('building'); x.add_argument('ids'); x.set_defaults(fn=fetch)
    x = s.add_parser('review'); x.add_argument('building'); x.add_argument('file'); x.add_argument('decision', choices=['accepted', 'excluded', 'duplicate'])
    x.add_argument('note'); x.add_argument('--views'); x.add_argument('--captured'); x.set_defaults(fn=review)
    x = s.add_parser('rebuild'); x.set_defaults(fn=rebuild)
    x = s.add_parser('harvest'); x.add_argument('url'); x.set_defaults(fn=harvest)
    x = s.add_parser('find-posts'); x.add_argument('queries', nargs='+'); x.add_argument('--pages', type=int, default=1); x.add_argument('--limit', type=int, default=40); x.set_defaults(fn=find_posts)
    x = s.add_parser('pool-sheet'); x.add_argument('--post'); x.add_argument('--out', default='/tmp/refs-sheets')
    x.add_argument('--cols', type=int, default=3); x.add_argument('--rows', type=int, default=3); x.add_argument('--cell', type=int, default=440); x.set_defaults(fn=pool_sheet)
    x = s.add_parser('assign'); x.add_argument('building'); x.add_argument('ids'); x.add_argument('why'); x.set_defaults(fn=assign)
    x = s.add_parser('pool-skip'); x.add_argument('ids'); x.add_argument('reason'); x.add_argument('--post'); x.set_defaults(fn=pool_skip)
    a = p.parse_args(); a.fn(a)
