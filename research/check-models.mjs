import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import * as THREE from '../dist/assets/three.module.js';

const dist = new URL('../dist/', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, dist), 'utf8'));
const [campus, photos, profiles] = await Promise.all([
  json('data/campus.json'), json('data/photos.json'), json('data/profiles.json'),
]);
assert.equal(campus.buildings.length, campus.coverage.totalModels);
const review = campus.buildings.filter(b => b.review);
assert.deepEqual(review.map(b => Number(b.number)).sort((a,b) => a-b), Array.from({length:15}, (_,i) => i+1));
let imageCount = 0;
for (const b of review) {
  assert.ok(profiles[b.number], `${b.number}: missing profile`);
  const entry = photos.buildings.find(p => String(p.number) === b.number);
  assert.ok(entry?.images.length, `${b.number}: missing photos`);
  for (const image of entry.images) { await access(new URL(image.path, dist)); imageCount++; }
}
const source = (await readFile(new URL('building-structures.js', dist), 'utf8'))
  .replace("from 'three'", `from '${new URL('assets/three.module.js', dist).href}'`);
const { createBuildingStructure } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
for (const number of ['4', '14']) {
  const b = review.find(b => b.number === number);
  const {group} = createBuildingStructure(b);
  group.updateMatrixWorld(true);
  group.traverse(object => {
    const positions = object.geometry?.attributes.position?.array;
    if (positions) assert.ok(positions.every(Number.isFinite), `${number}: invalid geometry`);
  });
  if (number === '4') {
    const width = name => new THREE.Box3().setFromObject(group.getObjectByName(name)).getSize(new THREE.Vector3()).x;
    assert.ok(width('ground-floor-recessed-glazing') < width('upper-curtain-wall-volume'));
    assert.ok(width('upper-curtain-wall-volume') < width('projecting-roof-soffit'));
  } else {
    // Rays enter the model from the courtyard: a solid facade would fail these void checks.
    for (const [height, minimum] of [[4, 5], [20, 6]]) {
      const origin = group.localToWorld(new THREE.Vector3(0, height, b.box.depth/2+1));
      const direction = new THREE.Vector3(0,0,-1).transformDirection(group.matrixWorld);
      const hits = new THREE.Raycaster(origin, direction).intersectObject(group, true);
      assert.ok(hits.length && hits[0].distance > minimum, `14: closed void at height ${height}`);
    }
  }
}
console.log(`PASS: ${campus.buildings.length} models, 1–15 profiles, ${imageCount} photo files, 4/14 geometry and open-space checks.`);
console.log('This checks implementation consistency, not accuracy against surveyed dimensions.');
