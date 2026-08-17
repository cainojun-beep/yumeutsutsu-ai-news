import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const news = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishedAt: z.coerce.date(),
    category: z.string(),
    sources: z.array(z.object({ name: z.string(), url: z.string().url() })),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false)
  })
});

export const collections = { news };
