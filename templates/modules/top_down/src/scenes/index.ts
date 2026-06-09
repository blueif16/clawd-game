/**
 * Scenes — Game scene hierarchy for top-down games.
 *
 * Architecture (two-layer inheritance):
 *
 *   BaseGameScene       ← shared: groups, collisions, Y-sort, input, hooks,
 *                          NET-NEW: markReady() + registry status seam
 *     ├── BaseLevelScene  ← level mode: programmatic floor/walls OR tilemap,
 *     │                     camera follow, wall collisions, kill-all win
 *     └── BaseArenaScene  ← arena mode: scrolling bg, screen bounds, wave spawner
 *
 * The in-game HUD (UIScene) and all menu/end-screen scenes are provided by
 * `templates/core/` — this module does NOT ship its own UIScene.
 *
 * Template files (_Template*) are NOT exported — they are meant to be COPIED
 * and renamed by W4.
 */

export { BaseGameScene, type PlayerClassMap } from './BaseGameScene';
export { BaseLevelScene } from './BaseLevelScene';
export { BaseArenaScene } from './BaseArenaScene';
