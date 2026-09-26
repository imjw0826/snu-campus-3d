"""Build a reproducible local-metre map from the downloaded OSM snapshot.
No invented building footprints; baseline boxes are minimum oriented bounds.
"""
import json, math, re, xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'research/source/osm-campus-full.xml'
r = ET.parse(SRC).getroot()
nodes = {n.attrib['id']: [float(n.attrib['lon']), float(n.attrib['lat'])] for n in r.findall('node')}
def tags(e): return {t.attrib['k']: t.attrib['v'] for t in e.findall('tag')}
ways = {w.attrib['id']: {'id':w.attrib['id'], 'tags':tags(w), 'refs':[n.attrib['ref'] for n in w.findall('nd')]} for w in r.findall('way')}
origin = [126.9545, 37.458]
sx = 111320 * math.cos(math.radians(origin[1])); sy = 111132
def local(p): return [round((p[0]-origin[0])*sx,2),round(-(p[1]-origin[1])*sy,2)]
def join(parts):
    parts = [p[:] for p in parts if p]
    rings = []
    while parts:
        chain = parts.pop(0)
        while chain[0] != chain[-1]:
            found = False
            for i,p in enumerate(parts):
                if chain[-1] == p[0]: chain += p[1:]
                elif chain[-1] == p[-1]: chain += list(reversed(p[:-1]))
                elif chain[0] == p[-1]: chain = p[:-1]+chain
                elif chain[0] == p[0]: chain = list(reversed(p[1:]))+chain
                else: continue
                parts.pop(i); found = True; break
            if not found: break
        if chain[0] == chain[-1]: rings.append(chain)
    return rings
def ring_points(refs): return [local(nodes[x]) for x in refs if x in nodes]
campus_rel = next(e for e in r.findall('relation') if tags(e).get('name') == '서울대학교 관악캠퍼스')
campus_refs = join([ways[m.attrib['ref']]['refs'] for m in campus_rel.findall('member') if m.attrib['type']=='way' and m.attrib['role']=='outer' and m.attrib['ref'] in ways])
assert campus_refs, 'Campus boundary is incomplete'
boundary = [ring_points(p) for p in campus_refs]
official_path = ROOT/'research/source/official-building-list-utf8.json'
official_records = json.loads(official_path.read_text())['rows'] if official_path.exists() else []
official_points = [local([float(x['lon_val']),float(x['lat_val'])]) for x in official_records]
def inside(p,poly):
    x,y=p; c=False
    for a,b in zip(poly,poly[1:]+poly[:1]):
        if (a[1]>y)!=(b[1]>y) and x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]: c=not c
    return c
def area(p): return abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(p,p[1:]+p[:1]))/2)
def centroid(p):
    p=p[:-1] if p[0]==p[-1] else p
    k=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(p,p[1:]+p[:1]))
    if abs(k)<.01:return [sum(x[0] for x in p)/len(p),sum(x[1] for x in p)/len(p)]
    return [sum((a[j]+b[j])*(a[0]*b[1]-b[0]*a[1]) for a,b in zip(p,p[1:]+p[:1]))/(3*k) for j in (0,1)]
def hull(points):
    p=sorted(set(tuple(x) for x in points))
    def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    lower=[];upper=[]
    for x in p:
        while len(lower)>1 and cross(lower[-2],lower[-1],x)<=0:lower.pop()
        lower.append(x)
    for x in reversed(p):
        while len(upper)>1 and cross(upper[-2],upper[-1],x)<=0:upper.pop()
        upper.append(x)
    return lower[:-1]+upper[:-1]
def obb(p):
    h=hull(p); best=None
    for a,b in zip(h,h[1:]+h[:1]):
        angle=math.atan2(b[1]-a[1],b[0]-a[0]); c=math.cos(angle);s=math.sin(angle)
        q=[(x*c+y*s,-x*s+y*c) for x,y in h]
        lo=[min(x[j] for x in q) for j in (0,1)];hi=[max(x[j] for x in q) for j in (0,1)]
        w,d=hi[0]-lo[0],hi[1]-lo[1]
        if best is None or w*d<best[0]:
            u,v=(hi[0]+lo[0])/2,(hi[1]+lo[1])/2
            best=(w*d,{'center':[round(u*c-v*s,2),round(u*s+v*c,2)],'width':round(w,2),'depth':round(d,2),'angle':round(angle,6)})
    return best[1]
# Cross-matched to official SNU campus PDF by location, outline and neighbours.
review_ids=['167984624','167983080','167983609','167666702','167983611','238936948','238937021','238937058','148286666','180954536','146155734','238936704','251646340','167609164','185936758']
review_map={k:i+1 for i,k in enumerate(review_ids)}
names={1:'인문관 1',2:'인문관 2',3:'인문관 3',4:'신양인문학술정보관',5:'인문관 5',6:'인문관 6',7:'인문관 7',8:'두산인문관',9:'사범관 9',10:'사범관 10',11:'사범관 11',12:'기초사범교육협력센터',13:'사범관 13',14:'인문관 14',15:'법학관 15'}
buildings=[]; used=set()
def add_building(id,t,outer,holes=None,refs=None):
    if len(outer)<4 or area(outer)<5:return
    center=centroid(outer)
    if not any(inside(center,p) for p in boundary) and not any(inside(p,outer) for p in official_points):return
    number=review_map.get(id)
    if number is None:
        number=t.get('addr:unit')
        if number=='1':number=None
        if not number:
            m=re.search(r'(\d+(?:-\d+)?)동|\((\d+(?:-\d+)?)\)|^(\d+[A-Z]?)$',t.get('name','')+' '+t.get('addr:housename',''))
            number=next((g for g in m.groups() if g),None) if m else None
    floors=t.get('building:levels'); height=t.get('height')
    try: floors=float(floors) if floors else None
    except ValueError: floors=None
    try: height=float(height.replace(' m','')) if height else None
    except ValueError: height=None
    height_basis='OSM 높이' if height else 'OSM 층수 × 3.6m' if floors else '기본 4층 × 3.6m 추정'
    height=height or (floors or 4)*3.6
    a=area(outer)-sum(area(p) for p in (holes or []))
    buildings.append({'id':id,'number':str(number) if number else '', 'review':id in review_map,'name':names.get(review_map.get(id),t.get('name','이름 미등록 건물')),'center':[round(x,2) for x in center], 'coordinates':[round(origin[0]+center[0]/sx,7),round(origin[1]-center[1]/sy,7)],'footprint':outer,'holes':holes or [],'area':round(a),'box':obb(outer),'height':round(height,1),'floors':floors,'heightBasis':height_basis,'source':'https://www.openstreetmap.org/'+('relation/' if id.startswith('r') else 'way/')+id.lstrip('r')})
for rel in r.findall('relation'):
    t=tags(rel)
    if 'building' not in t:continue
    members=[m for m in rel.findall('member') if m.attrib['type']=='way' and m.attrib['ref'] in ways]
    outers=join([ways[m.attrib['ref']]['refs'] for m in members if m.attrib['role']=='outer'])
    inners=join([ways[m.attrib['ref']]['refs'] for m in members if m.attrib['role']=='inner'])
    for outer in outers:
        p=ring_points(outer);holes=[ring_points(q) for q in inners if inside(ring_points(q)[0],p)]
        add_building('r'+rel.attrib['id'],t,p,holes)
    if outers:used.update(m.attrib['ref'] for m in members)
for id,w in ways.items():
    if 'building' in w['tags'] and id not in used and w['refs'][0]==w['refs'][-1]:add_building(id,w['tags'],ring_points(w['refs']))
roads=[];land=[]
for id,w in ways.items():
    t=w['tags'];p=ring_points(w['refs'])
    if len(p)<2:continue
    if not any(any(inside(q,b) for b in boundary) for q in p):continue
    if 'highway' in t:
        typ=t['highway']
        if typ not in ('proposed','construction'):roads.append({'id':id,'type':typ,'name':t.get('name',''),'points':p})
    if w['refs'][0]==w['refs'][-1] and 'building' not in t:
        kind=t.get('natural') or t.get('landuse') or t.get('leisure')
        if kind in ('wood','forest','grass','grassland','scrub','water','pitch','park','garden','recreation_ground'):land.append({'type':kind,'points':p})
buildings.sort(key=lambda b:(not b['review'],int(b['number']) if b['number'].isdigit() else 999,b['name']))
result={'origin':origin,'projection':'Local equirectangular approximation; x east, z south; metres','downloadedAt':'2026-09-20','source':'OpenStreetMap contributors','license':'ODbL 1.0','boundary':boundary,'buildings':buildings,'roads':roads,'land':land,'notes':['Campus boundary and available mapped footprints from OSM, not a surveyed exhaustive building inventory.','Official illustrated map is for number matching; footprint area is calculated from OSM, not illustrated PDF pixels.','Terrain elevation is not modelled.','All heights except direct OSM height tags are estimates; level tags are not interpreted as building floor counts.']}
(ROOT/'dist/data/campus.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')))
features=[]
for b in buildings:
    rings=[b['footprint']]+b['holes'];geo=[[[round(origin[0]+x/sx,7),round(origin[1]-z/sy,7)] for x,z in p] for p in rings]
    features.append({'type':'Feature','id':b['id'],'properties':{k:b[k] for k in ('number','name','area','height','heightBasis','source')},'geometry':{'type':'Polygon','coordinates':geo}})
(ROOT/'dist/data/buildings.geojson').write_text(json.dumps({'type':'FeatureCollection','features':features},ensure_ascii=False,separators=(',',':')))
assert len([b for b in buildings if b['review']])==15
print(json.dumps({'buildings':len(buildings),'review':15,'roads':len(roads),'land':len(land),'boundaryRings':len(boundary),'reviewBuildings':[{k:b[k] for k in ('number','name','area','coordinates')} for b in buildings if b['review']]},ensure_ascii=False,indent=2))
