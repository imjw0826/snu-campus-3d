"""Download only photo URLs returned by SNU's public campus-search API."""
import json, subprocess, shutil
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).resolve().parents[1]
records={}
for path in (ROOT/'research/source').glob('search-*.json'):
    raw=path.read_bytes()
    try: data=json.loads(raw.decode('utf8'))
    except UnicodeDecodeError: data=json.loads(raw.decode('cp949'))
    for x in data['search_list']:
        if x.get('con_type')=='F' and str(x.get('vil_dong_nm')) in map(str,range(1,16)):
            records[str(x['vil_dong_nm'])]=x
def download(item):
    number,x=item;url='https://map.snu.ac.kr/api'+x['img_url'];file=f'{int(number):02}-official.jpg';target=ROOT/'dist/assets/photos'/file
    subprocess.run(['curl','-sSL','--fail','--max-time','60','-A','Mozilla/5.0','-e','https://map.snu.ac.kr/',url,'-o',str(target)],check=True)
    return {'number':int(number),'officialName':x['name'],'latitude':float(x['lat_val']),'longitude':float(x['lon_val']),'sourcePage':f"https://map.snu.ac.kr/web/facility_detail.action?lat_val={x['lat_val']}&lon_val={x['lon_val']}&convinType=Y&inst_seq={x['seq']}",'images':[{'path':'./assets/photos/'+file,'imageUrl':url,'sourceName':'서울대학교 공식 지도','confidence':'high','captureDate':None}]}
with ThreadPoolExecutor(max_workers=4) as pool: buildings=list(pool.map(download,records.items()))
manifest=ROOT/'research/photo-research/manifest.json'
old=json.loads(manifest.read_text())
for n,name in [(8,'08-chio-official.jpg'),(14,'14-history-official.jpg')]:
    previous=next(b for b in old['buildings'] if b['number']==n);source=next(i for i in previous['images'] if Path(i['localPath']).name==name)
    shutil.copy(manifest.parent/source['localPath'],ROOT/'dist/assets/photos'/name)
    current=next(b for b in buildings if b['number']==n);current['images'].append({'path':'./assets/photos/'+name,'imageUrl':source['imageUrl'],'sourcePage':source['sourcePage'],'sourceName':'서울대학교 공식 자료','confidence':'high','observations':source.get('observations')})
supplemental=ROOT/'research/source/supplemental-photos.json'
if supplemental.exists():
    for record in json.loads(supplemental.read_text()):
        image=record['image']; target=ROOT/'dist'/image['path']
        subprocess.run(['curl','-sSL','--fail','--max-time','60',image['imageUrl'],'-o',str(target)],check=True)
        next(b for b in buildings if b['number']==record['number'])['images'].append(image)
buildings.sort(key=lambda x:x['number'])
output={'researchDate':'2026-09-20','reuse':'Photo copyright remains with the respective source. No open reuse licence was identified.','buildings':buildings}
(ROOT/'dist/data/photos.json').write_text(json.dumps(output,ensure_ascii=False,indent=2))
(ROOT/'research/output/official-targets.json').write_text(json.dumps(list(records.values()),ensure_ascii=False,indent=2))
print(json.dumps({'buildings':[b['number'] for b in buildings],'photos':sum(len(b['images']) for b in buildings)},ensure_ascii=False))
