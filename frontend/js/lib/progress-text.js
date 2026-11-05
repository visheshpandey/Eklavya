// Small wording rules for the Progress numbers, kept pure so they can be tested.

/** The grey line under a locked badge. The exam badge counts a score, so it says "best score 0% of 80%" (or "Not yet"), not "(0 of 80)". */
export function badgeProgressText(badge) {
  if (badge.earned) return 'Earned';
  if (badge.id === 'mock-80') {
    return badge.progress > 0
      ? `${badge.description}: best score ${badge.progress}% of ${badge.goal}%`
      : `${badge.description}: not yet`;
  }
  return `${badge.description} (${badge.progress} of ${badge.goal})`;
}

/** A count shown as a plain number everywhere (no leading zeros): 0, 1, 12. */
export const plainCount = (n) => String(Math.max(0, Math.round(Number(n) || 0)));

/** What the mastery percentage means, for the tooltip and the help line next to it. */
export const MASTERY_HELP = 'How well you know this topic. It drops over time if you do not revise (the forgetting curve).';
/** What the flashcard boxes mean (NEW, 1D, 3D, 7D, 14D, 30D). */
export const BOXES_HELP = 'Cards move right when you get them right, so you see them less often. A card you miss goes back to NEW.';
