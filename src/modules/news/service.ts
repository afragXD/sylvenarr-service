import { prisma } from '../../shared/db';
import type { NewsModel } from './model';

type NewsRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  category: NewsModel.category;
  coverUrl: string | null;
  publishedAt: Date | null;
  authorId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const mapItem = (row: NewsRow): NewsModel.newsItem => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  summary: row.summary,
  body: row.body,
  category: row.category,
  coverUrl: row.coverUrl,
  publishedAt: row.publishedAt?.toISOString() ?? null,
  authorId: row.authorId,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const mapSummary = (row: NewsRow): NewsModel.newsSummary => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  summary: row.summary,
  category: row.category,
  coverUrl: row.coverUrl,
  publishedAt: row.publishedAt?.toISOString() ?? null,
});

const parseDate = (value: string | null | undefined): Date | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === '') {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Некорректная дата публикации');
  }
  return date;
};

export abstract class NewsService {
  /**
   * Публичный список: только опубликованные (publishedAt <= now).
   */
  static async listPublished(options: {
    limit: number;
    cursor?: string | null;
  }): Promise<NewsModel.listResponse> {
    const now = new Date();
    const take = Math.min(Math.max(options.limit, 1), 50);
    const rows = await prisma.news.findMany({
      where: {
        publishedAt: { not: null, lte: now },
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(options.cursor
        ? {
            cursor: { id: options.cursor },
            skip: 1,
          }
        : {}),
    });

    const page = rows.slice(0, take);
    const next = rows.length > take ? (page[page.length - 1]?.id ?? null) : null;

    return {
      items: page.map(mapSummary),
      nextCursor: next,
    };
  }

  /**
   * Публичная карточка по slug.
   */
  static async getPublishedBySlug(slug: string): Promise<NewsModel.newsItem | null> {
    const now = new Date();
    const row = await prisma.news.findFirst({
      where: {
        slug,
        publishedAt: { not: null, lte: now },
      },
    });
    return row ? mapItem(row) : null;
  }

  /**
   * Админский список: все, включая черновики.
   */
  static async listAll(): Promise<NewsModel.newsItem[]> {
    const rows = await prisma.news.findMany({
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(mapItem);
  }

  static async getById(id: string): Promise<NewsModel.newsItem | null> {
    const row = await prisma.news.findUnique({ where: { id } });
    return row ? mapItem(row) : null;
  }

  static async create(
    body: NewsModel.createBody,
    authorId: string
  ): Promise<{ ok: true; item: NewsModel.newsItem } | { ok: false; status: 409; message: string }> {
    const existing = await prisma.news.findUnique({ where: { slug: body.slug } });
    if (existing) {
      return { ok: false, status: 409, message: 'Новость с таким slug уже есть' };
    }

    let publishedAt: Date | null;
    try {
      publishedAt = parseDate(body.publishedAt) ?? null;
    } catch {
      return { ok: false, status: 409, message: 'Некорректная дата публикации' };
    }

    const row = await prisma.news.create({
      data: {
        slug: body.slug,
        title: body.title,
        summary: body.summary,
        body: body.body,
        category: body.category ?? 'devlog',
        coverUrl: body.coverUrl ?? null,
        publishedAt,
        authorId,
      },
    });
    return { ok: true, item: mapItem(row) };
  }

  static async update(
    id: string,
    body: NewsModel.updateBody
  ): Promise<
    | { ok: true; item: NewsModel.newsItem }
    | { ok: false; status: 404 | 409; message: string }
  > {
    const current = await prisma.news.findUnique({ where: { id } });
    if (!current) {
      return { ok: false, status: 404, message: 'Новость не найдена' };
    }

    if (body.slug && body.slug !== current.slug) {
      const clash = await prisma.news.findUnique({ where: { slug: body.slug } });
      if (clash) {
        return { ok: false, status: 409, message: 'Новость с таким slug уже есть' };
      }
    }

    let publishedAt: Date | null | undefined;
    try {
      publishedAt = parseDate(body.publishedAt);
    } catch {
      return { ok: false, status: 409, message: 'Некорректная дата публикации' };
    }

    const row = await prisma.news.update({
      where: { id },
      data: {
        ...(body.slug !== undefined ? { slug: body.slug } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.summary !== undefined ? { summary: body.summary } : {}),
        ...(body.body !== undefined ? { body: body.body } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.coverUrl !== undefined ? { coverUrl: body.coverUrl } : {}),
        ...(publishedAt !== undefined ? { publishedAt } : {}),
      },
    });
    return { ok: true, item: mapItem(row) };
  }

  static async remove(
    id: string
  ): Promise<{ ok: true } | { ok: false; status: 404; message: string }> {
    const current = await prisma.news.findUnique({ where: { id } });
    if (!current) {
      return { ok: false, status: 404, message: 'Новость не найдена' };
    }
    await prisma.news.delete({ where: { id } });
    return { ok: true };
  }
}
