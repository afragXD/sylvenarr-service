import type { DamageSource } from './damageSources';
import type { HeroGender } from './gender';

export type { HeroGender } from './gender';

export type BattleAction =
  | 'attack'
  | 'defend'
  | 'wait'
  | 'skill'
  | 'ability'
  | 'move'
  | 'item'
  | 'perk_pick'
  | 'perk_skip'
  | 'fair_buy'
  | 'fair_sell'
  | 'fair_sell_all'
  | 'fair_stop';

/** Фаза боя (ярмарка / перки / бой). Старые снимки — нет поля → combat. */
export type BattlePhase = 'combat' | 'perks' | 'fair';

/** Состояние активной ярмарки (CUT-2026-11-03b T12). */
export type FairState = {
  /** Порядковый номер ярмарки в матче (1, 2, …). */
  index: number;
  /** Коды предметов на прилавке. */
  shop: number[];
  /** Чья очередь у прилавка. */
  turnTeam: 0 | 1;
  /** Отряд закончил торги. */
  stopped: [boolean, boolean];
  /** id торговцев [host, guest]. */
  traderIds: [string, string];
};

export type PerkOfferOption = {
  id: string;
  name: string;
  description: string;
  kind: 'item' | 'other';
  /** Уже изучен — нельзя выбрать. */
  learned: boolean;
};

export type PerkOffer = {
  unitId: string;
  playerId: string;
  options: PerkOfferOption[];
  done: boolean;
};

export type AbilitySlot = 1 | 2 | 3 | 4 | 5;

/** Психоз до конца матча (CUT-2026-11-01c AC-1). */
export type MentalIllnessKind =
  | 'paranoia'
  | 'apathy'
  | 'schizophrenia'
  | 'degradation'
  | 'masochism';

export type EffectId =
  | 'GUARDED'
  | 'STRENGTH'
  | 'BLESSED'
  | 'POISON'
  | 'BURNING'
  | 'BLEEDING'
  | 'FATMAN'
  | 'HAPPY'
  | 'CHAINED'
  | 'FEAR'
  | 'VAMPWEAPON'
  | 'REGENHP'
  | 'HASTE'
  | 'CHAMELEON'
  | 'PETRIFIED'
  | 'SLOW'
  | 'STONEFLESH'
  | 'CONTR'
  | 'MARKED'
  | 'DEATHSENTENCE'
  | 'INTERFERENCE'
  | 'SILENCE'
  | 'IMPISH'
  | 'DEFEND'
  | 'POLYMORPH'
  | 'INFECTED'
  | 'FIRESHIELD'
  | 'AIRSHIELD'
  | 'LUCKY'
  | 'FOCUSED'
  | 'STUNNED'
  | 'STUN_IMMUNE'
  | 'WEAKNESS'
  | 'UNLUCKY'
  | 'GALL'
  | 'SANCTUM'
  | 'FIREDWEAPON'
  | 'AIRWEAPON'
  | 'MIND_WARD'
  | 'INVISIBLE'
  | 'INTERDICT'
  | 'MAGIC_SHACKLES'
  | 'ENSLAVED'
  | 'ROW_FORTIFY'
  | 'ASHILLNESS'
  | 'ABSOLUTEPOWER'
  | 'BERSERK'
  | 'IMAGINARY_HEALTH'
  | 'IMMOLATION'
  | 'DEATHWARD'
  /** Скелет-чемпион: 50 % melee-урона атакующему. */
  | 'PAIN_REFLECT'
  /** Воин-призрак: Оковы взаимного терпения (на цели связи). */
  | 'LIFE_FETTERS'
  /** Воин-призрак: Жизнь на нитке (+урон за % потерянного ОЗ). */
  | 'LIFE_THREAD'
  /** Инкуб «Огненный хлыст»: при смерти жжёт союзников (FIRE). */
  | 'ERUPTION'
  /** Перенаправляет дебаффы на случайного врага без Отражения. */
  | 'REFLECTION'
  /** На старте хода: +мана (power). */
  | 'REGENMANA'
  /** На старте хода: −мана (power). */
  | 'KILLMANA'
  /** −точность на время эффекта. */
  | 'DRUNK'
  /** После попадания в ближнем бою — яд цели. */
  | 'POISONEDWEAPON'
  /** После попадания в ближнем бою — разрушение брони цели. */
  | 'BREAKWEAPON';

export type BattleEffect = {
  id: EffectId;
  rounds: number;
  /** Числовой параметр эффекта (урон баффа, % и т.п.). */
  power: number;
  /** Второе числовое значение (BERSERK: снятая броня). */
  extra?: number;
  /**
   * Наложен в текущий ход носителя: end-тик пропускает (self-buffs не теряют ход).
   * Сбрасывается start-тиком в начале следующего хода носителя.
   */
  fresh?: boolean;
};

/** Запись на кладбище для воскрешения. */
export type GraveyardEntry = {
  unitId: string;
  team: 0 | 1;
  heroClassCode: string;
  displayName: string;
  forbiddenResurrect: boolean;
};

export type PromptOption = {
  id: string;
  label: string;
  /** Краткое описание варианта (эволюция и т.п.). */
  description?: string;
};

export type PendingPrompt = {
  unitId: string;
  kind: string;
  /** Слот способности; для предметов может отсутствовать. */
  slot?: AbilitySlot;
  options: PromptOption[];
  /** Сохранённый контекст (targetId, summonCode…). */
  context: Record<string, string>;
  /** Источник промпта; старые снимки без поля = ability. */
  source?: 'ability' | 'item';
  /** Код предмета при source: 'item'. */
  itemCode?: number;
};

export type ResistEntry = {
  value: number;
  /** Полный иммунитет к источнику. */
  immune?: boolean;
  /** Заряды варда (поглощают удар, затем тратятся). */
  wardCharges?: number;
};

export type ResistMap = Partial<Record<DamageSource, ResistEntry>>;

export type { DamageSource };

export type BattleUnit = {
  readonly id: string;
  /** Mutable: Mermaid ENSLAVED flips controller. */
  playerId: string;
  /** Mutable: Mermaid ENSLAVED flips side. */
  team: 0 | 1;
  /** Mutable: Marauder ↔ Werewolf transform. */
  heroClassCode: string;
  displayName: string;
  row: number;
  column: number;
  maxHp: number;
  health: number;
  damage: number;
  armor: number;
  initiative: number;
  dodge: number;
  luck: number;
  accuracy: number;
  power: number;
  mana: number;
  /** Константный потолок маны класса (не растёт в бою). */
  maxMana: number;
  /**
   * DoT уже тикнули в этом логическом ходе (legacy was_effected).
   * Сбрасывается в начале раунда; wait / доп. ход не сбрасывают.
   */
  wasEffected: boolean;
  /** Уровень юнита в бою (legacy Hero.lvl); старт 1. */
  lvl: number;
  /**
   * Скрытый уровень для вех приростов (legacy Hero.hidden_lvl); старт 1.
   * Растёт только при ind > 0; GoblinTrapper не обновляет.
   */
  hiddenLvl: number;
  defending: boolean;
  alive: boolean;
  effects: BattleEffect[];
  /** Сопротивления / варды / иммунитеты по источникам урона. */
  resists: ResistMap;
  isSummon: boolean;
  summonerId: string | null;
  /**
   * Пол юнита (CUT-2026-11-05 BeerElemental + переиспользование).
   * Старые снимки без поля — трактовать через genderForClass(heroClassCode).
   */
  gender?: HeroGender;
  /** Пилотные runtime-флаги. */
  horseIsDead: boolean;
  authority: number;
  maxSummons: number;
  cumRage: number;
  lichGrade: number;
  isLichSummon: boolean;
  /** Заряды ульты (DemonLord / Paladin / Marauder / Patriarch). */
  ultaCharges: number;
  /** Paladin «Разбить душу»: устаревший счётчик кастов (не используется для шанса). */
  soulShatterCasts: number;
  /** Paladin «Разбить душу»: кулдаун в раундах. */
  soulShatterCd: number;
  /** Oracle «Миг могущества»: кулдаун в раундах. */
  momentPowerCd: number;
  /** Assassin: отравленные дротики. */
  darts: number;
  /** Assassin: шанс «тетради» (%). */
  deathNote: number;
  /** Assassin: кулдаун тетради в раундах. */
  deathNoteCd: number;
  /** Demiurge: кулдаун «Помрачение рассудка» в раундах. */
  mindCloudCd: number;
  /** Demiurge: кулдаун «Призыв эктоплазмы» в раундах. */
  ectoplasmCd: number;
  /** Inquisitor: кулдаун «Пыточная молния» в раундах. */
  tortureLightningCd: number;
  /** Inquisitor: кулдаун «Телекинез» в раундах. */
  telekinesisCd: number;
  /** Inquisitor: кулдаун «Любитель кристальных чар» в раундах. */
  crystalCharmsCd: number;
  /** Witch: патроны револьвера. */
  gun: number;
  /** Witch «Превращение»: кулдаун в раундах. */
  impPolymorphCd: number;
  /** Witch «Деградация»: кулдаун в раундах. */
  degradationCd: number;
  /** Specter «Тёмный ритуал»: кулдаун в раундах. */
  darkRitualCd: number;
  /** Specter «Покров тьмы»: кулдаун в раундах. */
  darkVeilCd: number;
  /** Abbess: запрет воскрешения. */
  forbiddenResurrect: boolean;
  /** Witch polymorph: броня до превращения (−1 = нет). */
  polymorphSavedArmor: number;
  /** Код класса до transform (Werewolf → Marauder). */
  transformParentCode: string | null;
  /** BeerElemental: гарант-криты. */
  critBank: number;
  /** DemonLord / перки: доля игнора брони (legacy armor_penetration). */
  armorPenetration: number;
  /** Abbess / перки: банк гарантированных уклонений (legacy dodge_bank). */
  dodgeBank: number;
  /** Mermaid ENSLAVED: исходная команда до порабощения. */
  enslavedOriginTeam: 0 | 1 | null;
  /** Mermaid ENSLAVED: исходный playerId до порабощения. */
  enslavedOriginPlayerId: string | null;
  /** Боевой дух (psycho, бонусы хода, классовые способности). */
  morale: number;
  /** Доп. жизнь за макс. мораль (CUT-2026-11-01c AC-1); кап 1. */
  lives: number;
  /** Уже сработала mental illness в этом бою (порт Hero.illness). */
  illness: boolean;
  /** Какая болезнь активна до конца матча (AC-1); null если нет. */
  illnessKind: MentalIllnessKind | null;
  /**
   * Радиус оружия по колонкам (ближний бой).
   * По умолчанию 1; Knight / DemonLord — 2. В старых снимках поля нет — брать по классу.
   */
  weaponReach?: number;
  /** Изученные перки (id из PERK_CATALOG); старые снимки — нет поля. */
  perks?: string[];
  /** Навык торговли (множитель цен); старые снимки — нет поля. */
  merchant?: number;
  /** Темп предложения перков (по умолчанию 6); старые снимки — нет поля. */
  develop?: number;
  /** hiddenLvl, на котором последний раз предлагали/брали перк. */
  lastPerkHiddenLvl?: number;
  /** LOWHP_EXTRATURN: текущий ход уже «дополнительный». */
  lowHpExtraTurn?: boolean;
  /** Множитель получаемого лечения (по умолчанию 1). */
  healRate?: number;
  /** Наёмный саммон: не исчезает со смертью хозяина. */
  isMercenary?: boolean;
  /** Искусственный юнит (предмет 762); психоз/болезни пропускаются. */
  artificial?: boolean;
  /** Кулдауны слотов в раундах (Antipaladin / Angel / Incub); в старых снимках поля нет. */
  abilityCds?: Partial<Record<AbilitySlot, number>>;
  /** Antipaladin: накопленный нанесённый урон для «Шквала ударов». */
  appliedDamage?: number;
  /** Одноразовая пассивка уже сработала (Titan «Наставник»). */
  passiveUsed?: boolean;
  /**
   * Умер Самопожертвованием (CUT AC-5 Р-1):
   * такого юнита нельзя воскресить другим Самопожертвованием.
   */
  sacrificedSelf?: boolean;
  /**
   * Воин-призрак: id цели Оков взаимного терпения
   * (урон по носителю дублируется цели источником Жизнь).
   */
  fettersTargetId?: string | null;
};

/** Кошелёк и инвентарь отряда (CUT-2026-11-03b T3). */
export type BattleTeamEconomy = {
  gold: number;
  /** Коды предметов; T3 — пустой массив. */
  inventory: number[];
};

/** Активные правила боя из Match.rules. */
export type BattleRules = {
  readonly maxTeamSize: number;
  readonly maxRowSize: number;
  readonly maxRounds: number;
  readonly healthBonus: number;
  /** Стартовый уровень юнитов (1–30). */
  readonly startingLevel: number;
  /** Ярмарка, перки и предметы (старые снимки — нет поля). */
  readonly fairEnabled?: boolean;
  /** Ярмарка раз в N раундов. */
  readonly fairFrequency?: number;
  /** Товаров на прилавке. */
  readonly shopSize?: number;
  /** Множитель стартового золота. */
  readonly goldBonus?: number;
};

export type BattleState = {
  readonly matchId: string;
  readonly hostPlayerId: string;
  readonly guestPlayerId: string;
  /** Каталог статов классов для саммонов. */
  catalog: Record<string, HeroClassStats>;
  /** Лимиты матча (снимок при старте боя). */
  readonly rules: BattleRules;
  /**
   * Кошельки отрядов [host=0, guest=1].
   * В старых снимках поля нет — migrateLegacyTeamGold при загрузке.
   */
  teams?: [BattleTeamEconomy, BattleTeamEconomy];
  stage: number;
  units: BattleUnit[];
  doneIds: string[];
  delayedIds: string[];
  /** true после flush delayedIds — вторая попытка в раунде; сбрасывается с новым раундом. */
  delayedPhase: boolean;
  activeUnitId: string | null;
  turnPlayerId: string | null;
  log: string[];
  outcome: 'ongoing' | 'host_win' | 'guest_win' | 'draw';
  winnerPlayerId: string | null;
  pendingPrompt: PendingPrompt | null;
  /** Кто предложил ничью (ожидает ответа соперника). */
  drawOfferByPlayerId: string | null;
  /** id юнитов, для которых preChoice уже сработал в этом «заходе» хода. */
  preChoiceDoneIds: string[];
  /** Мёртвые не-саммоны для воскрешения. */
  graveyard: GraveyardEntry[];
  /** Счётчик seq для sfxEvents (в старых снимках боя поля нет). */
  sfxSeq?: number;
  /** Звуковые события для клиентов (хвост, как у log). */
  sfxEvents?: BattleSfxEvent[];
  /** Фаза: бой / выбор перков / ярмарка. */
  phase?: BattlePhase;
  /** Активные предложения перков (фаза perks). */
  perkOffers?: PerkOffer[] | null;
  /** Активная ярмарка (фаза fair). */
  fair?: FairState | null;
};

export type BattleSfxEvent = {
  seq: number;
  unitId: string;
  heroClassCode: string;
  kind: 'ability' | 'death';
  slot?: AbilitySlot;
};

export type HeroClassStats = {
  readonly code: string;
  readonly displayName: string;
  readonly health: number;
  readonly damage: number;
  readonly armor: number;
  readonly initiative: number;
  readonly dodge: number;
  readonly luck: number;
  readonly accuracy: number;
  readonly power: number;
  readonly mana: number;
  /** Потолок маны; если не задан в тестах — берётся mana. */
  readonly maxMana?: number;
  readonly gold: number;
  readonly size: number;
  /** Боевой дух (опционально в тестах; из БД приходит всегда). */
  readonly morale?: number;
};

export type DraftPickSeed = {
  readonly id: string;
  readonly playerId: string;
  readonly heroClassCode: string;
  readonly row: number;
  readonly pickOrder: number;
};

export type AbilityInfo = {
  slot: AbilitySlot;
  label: string;
  needsTarget: boolean;
  disabledReason: string | null;
  legalTargetIds: string[];
  /** Тип урона слота (для превью на клиенте); null — слот без прямого урона. */
  attackKind?: 'melee' | 'ranged' | 'magic' | null;
  /** CUT AC-13: параметры превью при наведении на цель. */
  previewDamageMult?: number;
  previewArmorIgnore?: number;
  previewSource?: string;
  previewAccuracyPenalty?: number;
  previewHealMin?: number;
  previewHealMax?: number;
};
