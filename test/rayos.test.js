import { it, expect } from "vitest";
import { trazo } from "../js/rayos.js";

it("el trazo sale y entra en horizontal y pasa por la mitad entre los dos puntos", () => {
  expect(trazo(100, 20, 300, 120)).toBe("M100 20C200 20 200 120 300 120");
  expect(trazo(0, 50, 80.26, 50)).toBe("M0 50C40.1 50 40.1 50 80.3 50");
});
