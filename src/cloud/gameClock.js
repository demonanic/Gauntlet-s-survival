// The game's clock for story mode's countdown: this device's time, corrected
// to the server's once signed in (cloudSave.js serverClockOffset), so moving
// the phone's clock can't stretch the countdown. Everything else in the game
// keeps using the device clock.
let offset = 0;

export function setClockOffset(ms) {
  offset = Number.isFinite(ms) ? ms : 0;
}

export function gameNow() {
  return Date.now() + offset;
}
