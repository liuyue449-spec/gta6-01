// Shops: the two walk-in businesses that take the player's cash. Coral
// Market sells pistol ammo; the Sunset Cafe sells a hot meal that patches
// Alex up. Both work the same way — stand at the door and press B — so the
// HUD hint, the purchase and the feedback all live here, apart from the
// mission logic. Buying is not a crime; even the police allow lunch.
import { ECONOMY, SHOPS } from './config.js';
import { LANDMARKS } from './city.js';
import { ACTION_BUY } from './input.js';

/** The shop whose door the player is standing at, or null. */
export function shopAtDoor(state) {
  for (const key of Object.keys(SHOPS)) {
    const lm = LANDMARKS[key];
    if (Math.hypot(state.player.x - lm.x, state.player.y - lm.y) < SHOPS[key].radius) {
      return { key, landmark: lm, ...SHOPS[key] };
    }
  }
  return null;
}

/** The "press B" line the HUD shows at a shop door, or null anywhere else. */
export function shopHint(state) {
  if (state.inCar) return null;
  const shop = shopAtDoor(state);
  if (!shop) return null;
  if (shop.item === 'meal' && state.player.health >= 100) {
    return `${shop.landmark.name} — you are full. A meal heals ${ECONOMY.mealHeals}.`;
  }
  return `B — ${shop.label} · ${shop.landmark.name}`;
}

/** Handle the B key at a shop door: check the price, hand over the goods. */
export function stepShops(state, actions) {
  if (!(actions & ACTION_BUY) || state.inCar) return;
  const shop = shopAtDoor(state);
  if (!shop) return;
  if (shop.item === 'ammo') {
    if (state.money < ECONOMY.bulletPrice) {
      state.toast = `Ammo costs $${ECONOMY.bulletPrice} — you are short.`;
      state.toastTime = 2.2;
      return;
    }
    state.money -= ECONOMY.bulletPrice;
    state.player.ammo += ECONOMY.ammoPack;
    state.toast = `Ammo +${ECONOMY.ammoPack} — $${ECONOMY.bulletPrice}. Stay dangerous.`;
    state.toastTime = 2.2;
    state.audio.sfx.buy();
    return;
  }
  // The cafe meal.
  if (state.player.health >= 100) {
    state.toast = 'You are full — the cafe meal can wait.';
    state.toastTime = 2.2;
    return;
  }
  if (state.money < ECONOMY.mealPrice) {
    state.toast = `A meal costs $${ECONOMY.mealPrice} — you are short.`;
    state.toastTime = 2.2;
    return;
  }
  state.money -= ECONOMY.mealPrice;
  state.player.health = Math.min(100, state.player.health + ECONOMY.mealHeals);
  state.toast = `Hot meal — +${ECONOMY.mealHeals} health for $${ECONOMY.mealPrice}.`;
  state.toastTime = 2.2;
  state.audio.sfx.buy();
}
