// Run: npm test. Checks the "Cerca de ti" ranking that decides which options a rider sees.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dist, rankNearby, type Candidate, type LngLat } from "./geo.ts";

const at: LngLat = [2.17, 41.39];
// About 1 m east per 1.2e-5 degrees of longitude here.
const east = (m: number): LngLat => [at[0] + m / 83500, at[1]];
const seg = (m: number): LngLat[] => [east(m), [east(m)[0], at[1] + 0.00005]];

test("dist is metric", () => assert.ok(Math.abs(dist(at, east(100)) - 100) < 1));

test("bays first, then allowed pieces by distance, one per curb", () => {
  const c: Candidate[] = [
    { kind: "piece", id: "7-0", st: "paralelo", line: seg(40) },
    { kind: "piece", id: "7-1", st: "paralelo", line: seg(30) },
    { kind: "piece", id: "8-0", st: "semibateria", line: seg(20) },
    { kind: "piece", id: "9-0", st: "prohibido", line: seg(5) },
    { kind: "piece", id: "10-0", st: "senal", line: seg(6) },
    { kind: "bay", id: "b1", line: seg(250) },
    { kind: "bay", id: "b1", line: seg(260) },
    { kind: "bay", id: "far", line: seg(400) },
  ];
  const r = rankNearby(at, c);
  assert.deepEqual(r.map((o) => o.id), ["b1", "8-0", "7-1"]);
  assert.ok(Math.abs(r[0].d - 250) < 2);
});

test("inverted reserve names read as people say them", async () => {
  const { streetName } = await import("./model.ts");
  assert.equal(streetName("BAILEN, C., DE"), "Carrer de Bailen");
  assert.equal(streetName("CONSELL DE CENT, C., DEL"), "Carrer del Consell de Cent");
  assert.equal(streetName("ESCULTOR RAMIR ROCAMORA, PL., DE L'"), "Plaça de l'Escultor Ramir Rocamora");
  assert.equal(streetName("Carrer de Mallorca"), "Carrer de Mallorca");
});
