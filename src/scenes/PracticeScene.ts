import { SCENES } from '@/config/constants';
import { GameplayScene, type GameplaySceneData } from './GameplayScene';

/**
 * Practice mode.
 *
 * Practice is not a different game, only a different set of rules about
 * checkpoints and what counts toward a record, so it is the gameplay scene
 * registered under a second key with the practice flag forced on. Sharing the
 * implementation is what guarantees a level plays identically in both modes,
 * which is the entire point of practising it.
 */
export class PracticeScene extends GameplayScene {
  constructor() {
    super(SCENES.PRACTICE);
  }

  override init(data: GameplaySceneData): void {
    super.init({ ...data, practice: true });
  }
}
