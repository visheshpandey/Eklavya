// What each screen fetches when it is opened (pure, so it is tested). Nothing on this list is fetched at page load: the opening screen
// (Today) gets only its own data, so its calls are not queued behind badges, mock exams, groups and the feedback summary.
export const SCREEN_LOADS = Object.freeze({
  ask: ['ask'],
  groups: ['groups', 'challenges', 'demoCircle'],
  progress: ['badges', 'mockExams'],
});

/** The loaders to run when `view` opens. */
export const loadsFor = (view) => SCREEN_LOADS[view] ?? [];
