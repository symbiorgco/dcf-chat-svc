import { BusinessDay } from "./types";

export const gameResult = (rng: number): number => {
  const X = 100 / (1.0001 - rng); // Results in practical limit max payout 10.000x
  const result = Math.floor(X);
  return Math.max(1.01, result / 100);
};

export const nextBusinessDay = (time: BusinessDay) => {
  const d = new Date();
  d.setUTCFullYear(time.year);
  d.setUTCMonth(time.month - 1);
  d.setUTCDate(time.day + 1);
  d.setUTCHours(0, 0, 0, 0);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
};
