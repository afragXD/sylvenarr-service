import { Elysia, t } from 'elysia';
import { join } from 'node:path';

import { isDev } from '../utils/isDev';

/**
 * Dev-only: сохранить скриншот сцены в client/public/scenes.
 */
export const devScenesController = isDev
	? new Elysia({ tags: ['Dev'] }).post(
			'/dev/scenes/:name',
			async ({ params, body, status }) => {
				const name = params.name;
				if (!/^[a-z][a-z0-9_-]*\.(webp|png|jpg|jpeg)$/i.test(name)) {
					return status(400, { message: 'Некорректное имя файла' });
				}
				const target = join(import.meta.dir, '../../../sylvenarr-client/public/scenes', name);
				const bytes = Buffer.from(body.data, 'base64');
				await Bun.write(target, bytes);
				return { ok: true, bytes: bytes.length, name };
			},
			{
				params: t.Object({ name: t.String() }),
				body: t.Object({ data: t.String() }),
				detail: { summary: 'Dev-only: загрузить файл сцены (base64)' },
			},
		)
	: new Elysia();
