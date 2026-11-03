import { Elysia } from 'elysia';
import { ItemsModel } from './model';
import { ItemsService } from './service';

/**
 * Публичные каталоги предметов и перков (кодекс).
 */
export const itemsController = new Elysia({ tags: ['Items'] })
  .get(
    '/items',
    () => {
      return ItemsService.listItems();
    },
    {
      response: {
        200: ItemsModel.itemsResponse,
      },
      detail: {
        summary: 'Каталог предметов',
      },
    }
  )
  .get(
    '/perks',
    () => {
      return ItemsService.listPerks();
    },
    {
      response: {
        200: ItemsModel.perksResponse,
      },
      detail: {
        summary: 'Каталог перков',
      },
    }
  );
