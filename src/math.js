export function baseLog(base, number) {
  return Math.log(number) / Math.log(base);
}

// Get a random integer between 0 (incl.) and n (excl.)
export function randomInt(n) {
  return Math.floor(Math.random() * n);
}
