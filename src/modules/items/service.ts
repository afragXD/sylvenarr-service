import { ITEM_CATALOG } from '../../game/items/catalog';
import { PERK_CATALOG } from '../../game/perks/catalog';
import type { ItemsModel } from './model';

/**
 * Публичные каталоги предметов и перков для кодекса.
 */
export class ItemsService {
  static listItems(): ItemsModel.itemsResponse {
    return {
      items: ITEM_CATALOG.map((item) => ({
        code: item.code,
        name: item.name,
        description: item.description,
        cost: item.cost,
        category: item.category,
        tier: item.tier,
        target: item.target,
        sellOnly: item.sellOnly,
      })),
    };
  }

  static listPerks(): ItemsModel.perksResponse {
    return {
      items: PERK_CATALOG.map((perk) => ({
        id: perk.id,
        name: perk.name,
        description: perk.description,
        kind: perk.kind,
        ...(perk.category !== undefined ? { category: perk.category } : {}),
      })),
    };
  }
}
