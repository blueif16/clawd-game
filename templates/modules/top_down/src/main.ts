import Phaser from 'phaser';
import gameConfig from './gameConfig.json';
import { installGameHook } from './hook';

// Core engine scenes (KEEP).
import { Preloader } from './scenes/Preloader';
import { TitleScreen } from './scenes/TitleScreen';
import UIScene from './scenes/UIScene';
import { PauseUIScene } from './scenes/PauseUIScene';
import { VictoryUIScene } from './scenes/VictoryUIScene';
import { GameCompleteUIScene } from './scenes/GameCompleteUIScene';
import { GameOverUIScene } from './scenes/GameOverUIScene';

// Top-down level scenes.
import { Level1Scene } from './scenes/Level1Scene';
// TODO-W4: import additional level scenes here.
// import { Level2Scene } from './scenes/Level2Scene';

/**
 * main.ts — the SINGLE bootstrap point (KEEP — engine seam; W4 only adds
 * level-scene registrations below the marked line).
 *
 * Top-down: Arcade physics with NO global gravity (free 8-direction movement).
 * window.__GAME__ is installed here, ONCE, per template-contract.md §3.
 */

const { screenSize, debugConfig, renderConfig } = gameConfig as any;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: screenSize.width.value,
  height: screenSize.height.value,
  backgroundColor: '#1a1a2e',
  parent: 'game-container',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      // Top-down: NO world gravity. Entities also set setAllowGravity(false).
      gravity: { x: 0, y: 0 },
      debug: debugConfig.debug.value,
    },
  },
  pixelArt: renderConfig.pixelArt.value,
};

const game = new Phaser.Game(config);

// Seed the registry so the hook reports sane defaults before the first level.
game.registry.set('score', 0);
game.registry.set('ready', false);
game.registry.set('status', 'booting');

// Install the read-only test hook (window.__GAME__) per the contract.
installGameHook(game);

// ── scene registration (order: Preloader → TitleScreen → levels → UI) ───────
game.scene.add('Preloader', Preloader, true);
game.scene.add('TitleScreen', TitleScreen);

// Level scenes. LEVEL_ORDER[0] must match the first level key.
game.scene.add('Level1Scene', Level1Scene);
// TODO-W4: register additional levels here, e.g.
// game.scene.add('Level2Scene', Level2Scene);

// UI / end-screen scenes.
game.scene.add('UIScene', UIScene);
game.scene.add('PauseUIScene', PauseUIScene);
game.scene.add('VictoryUIScene', VictoryUIScene);
game.scene.add('GameCompleteUIScene', GameCompleteUIScene);
game.scene.add('GameOverUIScene', GameOverUIScene);
