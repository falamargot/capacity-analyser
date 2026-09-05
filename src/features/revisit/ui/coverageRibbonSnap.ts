/**
 * The click tolerance shared by the ribbon and the lens.
 *
 * Three pixels, because that is roughly what a hand aiming at a 1.1 px tick
 * achieves — measured on a 72 h window across 939 px, where the ribbon's
 * legibility floor is 5.2 min wide and therefore just over one pixel.
 *
 * It lives in its own file so the two surfaces cannot drift: the lens OFFERS
 * the snap in words and the ribbon PERFORMS it, and an offer made under a
 * different tolerance than the action is worse than no offer.
 */
export const SNAP_TOLERANCE_PX = 3;
