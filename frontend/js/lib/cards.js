// The one place the "cards due today" number comes from: the server's count in Today's data. The sidebar badge, Today's review step and chip,
// the stats and the Flashcards header all read it here, so they can never disagree.
import { selectToday } from '../state/selectors.js';

export const dueCount = (state) => selectToday(state)?.cards_due ?? 0;
