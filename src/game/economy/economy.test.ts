import { describe, expect, test } from 'bun:test';

import type { BattleState } from '../combat/types';
import { economyOn } from './index';

const stateWithRules = (rules: BattleState['rules']): BattleState => ({ rules }) as BattleState;

describe('economyOn', () => {
  test('true только при fairEnabled === true', () => {
    expect(
      economyOn(
        stateWithRules({
          maxTeamSize: 8,
          maxRowSize: 4,
          maxRounds: 20,
          healthBonus: 0.65,
          startingLevel: 1,
          fairEnabled: true,
        })
      )
    ).toBe(true);
  });

  test('false при fairEnabled === false', () => {
    expect(
      economyOn(
        stateWithRules({
          maxTeamSize: 8,
          maxRowSize: 4,
          maxRounds: 20,
          healthBonus: 0.65,
          startingLevel: 1,
          fairEnabled: false,
        })
      )
    ).toBe(false);
  });

  test('false для старого снимка без поля', () => {
    expect(
      economyOn(
        stateWithRules({
          maxTeamSize: 8,
          maxRowSize: 4,
          maxRounds: 20,
          healthBonus: 0.65,
          startingLevel: 1,
        })
      )
    ).toBe(false);
  });
});
