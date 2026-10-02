import crypto from "crypto";

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const NUMBERS = "23456789";
const SPECIAL = "!@#$%^&*_-+=";
const ALL = UPPER + LOWER + NUMBERS + SPECIAL;

function pick(source: string): string {
  return source[crypto.randomInt(source.length)];
}

export function generateTemporaryPassword(length = 20): string {
  if (length < 12) throw new Error("Temporary passwords must contain at least 12 characters.");
  const characters = [pick(UPPER), pick(LOWER), pick(NUMBERS), pick(SPECIAL)];
  while (characters.length < length) characters.push(pick(ALL));
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join("");
}
