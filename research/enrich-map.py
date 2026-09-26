"""Cross-reference every numbered entry in SNU's official campus inventory.
Missing outlines remain visibly unverified schematic rectangles; no invented areas.
"""
import json,math
from pathlib import Path
R=Path(__file__).resolve().parents[1]
p=R/'dist/data/campus.json';data=json.loads(p.read_text());records=json.loads((R/'research/source/official-building-list-utf8.json').read_text())['rows'];sx=111320*math.cos(math.radians(data['origin'][1]));sy=111132
def local(r):return [(float(r['lon_val'])-data['origin'][0])*sx,-(float(r['lat_val'])-data['origin'][1])*sy]
def inside(p,poly):
 c=False;x,y=p
 for a,b in zip(poly,poly[1:]+poly[:1]):
  if (a[1]>y)!=(b[1]>y) and x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:c=not c
 return c
def edge_dist(p,poly):
 best=1e9
 for a,b in zip(poly,poly[1:]+poly[:1]):
  vx,vy=b[0]-a[0],b[1]-a[1];t=max(0,min(1,((p[0]-a[0])*vx+(p[1]-a[1])*vy)/(vx*vx+vy*vy or 1)));best=min(best,math.hypot(p[0]-a[0]-t*vx,p[1]-a[1]-t*vy))
 return best
for b in data['buildings']:b['geometryStatus']='mapped';b['officialEntries']=[]
pending=[];assigned=set()
for r in sorted(records,key=lambda x:(not str(x['vil_dong_nm']).isdigit(),int(x['vil_dong_nm']) if str(x['vil_dong_nm']).isdigit() else 999)):
 point=local(r);num=str(r['vil_dong_nm']);name=r['inst_kor_nm'];url=f"https://map.snu.ac.kr/web/facility_detail.action?convinType=Y&inst_seq={r['inst_seq']}&lat_val={r['lat_val']}&lon_val={r['lon_val']}"
 entry={'number':num,'name':name,'source':url,'coordinates':[float(r['lon_val']),float(r['lat_val'])]}
 if num.isdigit() and 1<=int(num)<=15:best=next(b for b in data['buildings'] if b['review'] and b['number']==num)
 else:
  candidates=[]
  for b in data['buildings']:
   if b['review'] or b['id'] in assigned:continue
   in_poly=inside(point,b['footprint']);dist=edge_dist(point,b['footprint'])
   if in_poly or dist<12:candidates.append((0 if in_poly else dist,math.hypot(point[0]-b['center'][0],point[1]-b['center'][1]),b))
  best=min(candidates,key=lambda x:x[:2])[2] if candidates else None
 if best:
  best['number']=num;best['name']=name;best['officialEntries'].append(entry);best['officialSource']=url;assigned.add(best['id'])
 else:pending.append((r,entry,point))
for r,entry,point in pending:
 # A uniform, explicitly schematic box means only its centre is evidenced.
 x,z=point;w,d=16,12;corners=[[round(x-w/2,2),round(z-d/2,2)],[round(x+w/2,2),round(z-d/2,2)],[round(x+w/2,2),round(z+d/2,2)],[round(x-w/2,2),round(z+d/2,2)],[round(x-w/2,2),round(z-d/2,2)]]
 data['buildings'].append({'id':'snu-'+str(r['inst_seq']),'number':entry['number'],'name':entry['name'],'review':False,'center':[round(x,2),round(z,2)],'coordinates':entry['coordinates'],'footprint':corners,'holes':[],'area':None,'box':{'center':[round(x,2),round(z,2)],'width':w,'depth':d,'angle':0},'height':14.4,'floors':None,'heightBasis':'기본 4층 × 3.6m 추정','geometryStatus':'schematic','officialEntries':[entry],'source':entry['source'],'officialSource':entry['source']})
data['buildings'].sort(key=lambda b:(not b['review'],int(b['number'].split('-')[0]) if b['number'].split('-')[0].isdigit() else 9999,b['number']))
data['coverage']={'officialEntries':len(records),'matchedOfficialEntries':len(records)-len(pending),'schematicEntries':len(pending),'mappedFootprints':sum(b['geometryStatus']=='mapped' for b in data['buildings']),'totalModels':len(data['buildings'])}
data['notes'].append('All 237 numbered official inventory entries represented. Orange schematic boxes mark a confirmed official map location with an unverified footprint. Their areas are null and dimensions are arbitrary 16 × 12 m visualization defaults, not measurements.')
p.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
geo=json.loads((R/'dist/data/buildings.geojson').read_text());by_id={b['id']:b for b in data['buildings']}
for f in geo['features']:
 b=by_id[f['id']];f['properties'].update(number=b['number'],name=b['name'],geometryStatus='mapped')
for b in data['buildings']:
 if b['geometryStatus']=='schematic':geo['features'].append({'type':'Feature','id':b['id'],'properties':{k:b[k] for k in ('number','name','area','height','geometryStatus','source')},'geometry':{'type':'Point','coordinates':b['coordinates']}})
(R/'dist/data/buildings.geojson').write_text(json.dumps(geo,ensure_ascii=False,separators=(',',':')))
(R/'research/output/coverage.json').write_text(json.dumps({'coverage':data['coverage'],'unverifiedOutlines':[e for _,e,_ in pending]},ensure_ascii=False,indent=2))
assert sum(len(b['officialEntries']) for b in data['buildings'])==237
print(json.dumps(data['coverage'],ensure_ascii=False))
