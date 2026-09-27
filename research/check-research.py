"""Validate provenance, file integrity, duplicates and public progress counts."""
from pathlib import Path
import hashlib, json
R=Path(__file__).resolve().parent
load=lambda p:json.loads(p.read_text())
audit=load(R/'photo-audit.json'); ledger=load(R/'building-ledger.json')
seen=set(); hashes={}
for r in audit['records']:
 p=R/r['path']; assert p.is_file(),p
 assert p.resolve().is_relative_to(R),p
 assert hashlib.sha256(p.read_bytes()).hexdigest()==r['sha256'],p
 assert r['bytes']==p.stat().st_size,p
 # Naver blog originals are only served over http, and only that copy keeps
 # the camera EXIF date, so the exact fetched URL is recorded as-is.
 if r.get('sourceKind')=='user-attachment':
  assert r['sourcePage']==r['path'] and r['imageUrl']==r['path'],p
 else:
  assert r['sourcePage'].startswith('https://') and r['imageUrl'].startswith(('https://','http://')),p
 if r['countsTowardMinimum']: assert r.get('views') ,f'accepted without views: {p}'
 assert r['observations'].strip(),p
 assert r['path'] not in seen,p
 seen.add(r['path'])
 if r['countsTowardMinimum']:
  assert r['reviewed'] and r['decision']=='accepted' and r['reviewDate'],p
  key=(r['building'],r['sha256']);assert key not in hashes,f'Duplicate counted: {p}'
  hashes[key]=p
campus=load(R.parent/'dist/data/campus.json')
assert {b['id'] for b in ledger}=={b['id'] for b in campus['buildings']}
for b in ledger:
 n=sum(number==b['number'] for number,sha in hashes)
 assert b['reviewedPhotos']==n,b
 assert b['researchReady']==(n>=audit['minimum']),b
 assert not b['geometryVerified'] or b['researchReady'],b
assert load(R.parent/'dist/data/research-status.json')['buildings']==ledger
ready=[b['number'] for b in ledger if b['researchReady']]
print(f'PASS: {len(seen)} archived files, {len(ledger)} model records; '
      f'{len(ready)} buildings at >= {audit["minimum"]} reviewed photos {ready}; '
      f'{sum(b["geometryVerified"] for b in ledger)} verified models.')
