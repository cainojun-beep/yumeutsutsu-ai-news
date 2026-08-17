import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://yumeutsutsu-ai-news.pages.dev',
  output: 'static',
  build: { format: 'directory' }
});
