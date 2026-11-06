// Leo's defense scenarios (2026-10-09, from the defense board). Court meters from the hitter's view:
// x from the hitter's left sideline, y from the net. back = z1, z6, z5; front = z2, z3, z4.
import { Tempo } from "./data";
export interface DefenseScenario { note: string; tempos: Tempo[]; tag?: "Spread" | "Bunch" | "triple"; hitterX: number; back: [number, number][]; front: [number, number][] }
export const SCENARIOS: DefenseScenario[] = [
  { note: "high ball outside (4). z4 peels off for defense.", tempos: ["High"], hitterX: 0.8, back: [[0.9, 4.4], [4, 7.7], [7.9, 6.7]], front: [[0.6, 0.6], [1.7, 0.6], [7.5, 2.9]] },
  { note: "fast ball or high ball blocking cross, z4 peels off the net for tip or hard cross.", tempos: ["Fast", "High", "Medium"], hitterX: 0.8, back: [[0.5, 5.9], [5.1, 8], [7.7, 4.8]], front: [[1.6, 0.6], [3, 0.6], [6.1, 1.5]] },
  { note: "fast ball leaving seam open, z6 fills in seam for defense.", tempos: ["Fast"], hitterX: 0.8, back: [[0.5, 5.9], [4.6, 7.1], [7.3, 3.8]], front: [[1, 0.6], [3, 0.6], [6.8, 1.2]] },
  { note: "right side leave line for defender, block seam cross, z2 plays hard cross", tempos: ["High", "Medium"], hitterX: 8.5, back: [[1.3, 5.1], [3.5, 7.7], [8.5, 6]], front: [[1.4, 2.2], [6.3, 0.7], [7.6, 0.7]] },
  { note: "right side block line, defense plays cross", tempos: ["High", "Medium"], hitterX: 8.5, back: [[2, 6.3], [5.1, 7.5], [8.5, 4.5]], front: [[1.6, 2.9], [7.4, 0.8], [8.5, 0.8]] },
  { note: "fast ball has seam, z6 fill seam, right side attack", tempos: ["Fast"], hitterX: 8.4, back: [[1.6, 4.7], [4.4, 7.4], [8.6, 5.8]], front: [[3.5, 2.1], [6, 0.8], [8.1, 0.8]] },
  { note: "middle 1, pins not helping, z6 and z3 pick a side", tempos: ["Fast"], hitterX: 4.7, back: [[1.6, 4.7], [3.2, 7.5], [7.6, 4.4]], front: [[1.7, 0.8], [5.1, 0.8], [7.7, 0.8]] },
  { note: "1 ball but z4 helping on block", tempos: ["Fast"], hitterX: 4.7, back: [[1.6, 4.7], [3.2, 7.5], [7.6, 4.4]], front: [[2.2, 1.3], [4.9, 0.7], [6, 0.7]] },
  { note: "1 ball z2 helping", tempos: ["Fast"], hitterX: 3.9, back: [[1.6, 4.7], [5.3, 7.7], [8.1, 4.2]], front: [[2.5, 0.8], [3.6, 0.8], [7.1, 0.9]] },
  { note: "3 ball, spread block so 1 on 1 against z3, z2 and z4 peel off net, defense shifts.", tempos: ["Fast"], tag: "Spread", hitterX: 2.7, back: [[1.2, 4.7], [2.7, 7.7], [8, 5]], front: [[1.3, 1.2], [3.5, 0.9], [7.9, 1.1]] },
  { note: "bunch block on 3 ball, double block on attacker", tempos: ["Fast"], tag: "Bunch", hitterX: 2.7, back: [[1.2, 4.7], [4.9, 7.7], [7.8, 4.2]], front: [[2.4, 0.9], [3.5, 0.9], [6.4, 1.3]] },
  { note: "32", tempos: ["Medium"], hitterX: 2.2, back: [[0.6, 5.9], [4.9, 7.7], [8.1, 4.9]], front: [[2.3, 0.9], [3.5, 0.9], [6.4, 1.9]] },
  { note: "big block, defenders play off hands, z4 pulls to play off speed", tempos: ["High"], hitterX: 1.2, back: [[0.3, 6.5], [4.5, 8.7], [8.5, 5.6]], front: [[0.9, 0.9], [2, 0.9], [6.4, 1.9]] },
  { note: "triple block, z6 plays off hands, wing defenders play tip and sidelines", tempos: ["High"], tag: "triple", hitterX: 1.2, back: [[1.2, 4.6], [5.8, 8.8], [8.6, 3.8]], front: [[0.6, 0.8], [1.6, 0.8], [2.6, 0.8]] },
];
