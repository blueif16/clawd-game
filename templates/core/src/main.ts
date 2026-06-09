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
import { BootScene } from './scenes/BootScene';

/**
 * main.ts — the SINGLE bootstrap point (KEEP — engine seam).
 *
 * This is the CORE main.ts. An archetype module (e.g. platformer) ships its
 * OWN main.ts that overlays this one in the scaffolded project to register the
 * archetype's level + entity scenes. This core version registers only the
 * engine scenes + a minimal default level (BootScene as 'Level1Scene') so the
 * empty CORE template builds green and boots to `ready`.
 *
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
      // gravity is per-entity (set in BasePlayer); world gravity stays 0.
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

// Register scenes in order: Preloader (auto-start), TitleScreen, levels, UI.
game.scene.add('Preloader', Preloader, true);
game.scene.add('TitleScreen', TitleScreen);

// Default level (core standalone). The platformer module's main.ts replaces
// this registration with its real Level1Scene.
game.scene.add('Level1Scene', BootScene);

// UI / end-screen scenes.
game.scene.add('UIScene', UIScene);
game.scene.add('PauseUIScene', PauseUIScene);
game.scene.add('VictoryUIScene', VictoryUIScene);
game.scene.add('GameCompleteUIScene', GameCompleteUIScene);
game.scene.add('GameOverUIScene', GameOverUIScene);
