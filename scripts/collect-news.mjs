import { XMLParser } from 'fast-xml-parser';
import OpenAI from 'openai';
import { mkdir, writeFile } from 'node:fs/promises';

const feeds = [
  { source: 'OpenAI', url: 'https://openai.com/news/rss.xml' },
  { source: 'Google', url: 'https://blog.google/rss/', filterAi: true },
  { source: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml' },
  { source: 'Microsoft Research', url: 'https://www.microsoft.com/en-us/research/feed/', filterAi: true },
  { source: 'MIT AI', url: 'https://news.mit.edu/topic/mitartificial-intelligence2-rss.xml' },
  { source: 'NVIDIA Blog', url: 'https://blogs.nvidia.com/feed/', filterAi: true },
  { source: 'NVIDIA Developer', url: 'https://developer.nvidia.com/blog/feed/', filterAi: true },
  { source: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml' }
];

const cutoff = Date.now() - 24 * 60 * 60 * 1000;
const parser = new XMLParser({ ignoreAttributes: false });
const items = [];
const aiTerms = /\b(ai|artificial intelligence|machine learning|deep learning|neural|llm|language model|generative|agentic|agent|copilot|gpu|inference|training|transformer|robotics?)\b/i;

function textValue(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(' ');
  return textValue(value['#text'] ?? value['@_href'] ?? value['@_url'] ?? '');
}

function itemLink(item) {
  const links = Array.isArray(item.link) ? item.link : [item.link];
  for (const link of links) {
    const value = textValue(link);
    if (value.startsWith('http')) return value;
  }
  const guid = textValue(item.guid ?? item.id);
  return guid.startsWith('http') ? guid : '';
}

for (const { source, url, filterAi = false } of feeds) {
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'AI-FRONTIER/1.1 (+https://yumeutsutsu-ai-news.pages.dev/)' }
    });
    const contentType = response.headers.get('content-type') ?? '';
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!/(xml|rss|atom)/i.test(contentType)) throw new Error(`RSSではない応答: ${contentType || 'unknown'}`);

    const data = parser.parse(await response.text());
    const raw = data?.rss?.channel?.item ?? data?.feed?.entry ?? [];
    const entries = Array.isArray(raw) ? raw : [raw];
    let recentCount = 0;

    for (const entry of entries) {
      const title = textValue(entry.title);
      const summary = textValue(entry.description ?? entry.summary ?? entry.content)
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1200);
      const link = itemLink(entry);
      const published = new Date(entry.pubDate ?? entry.published ?? entry.updated ?? entry['dc:date'] ?? 0);
      if (!Number.isFinite(published.valueOf()) || published.valueOf() < cutoff || !link) continue;
      if (filterAi && !aiTerms.test(`${title} ${summary}`)) continue;

      items.push({ source, title, link, publishedAt: published.toISOString(), summary });
      recentCount++;
    }

    const newest = entries
      .map((entry) => new Date(entry.pubDate ?? entry.published ?? entry.updated ?? entry['dc:date'] ?? 0))
      .filter((date) => Number.isFinite(date.valueOf()))
      .sort((a, b) => b - a)[0];
    console.log(`feed ok: ${source} | entries=${entries.length} | recent-ai=${recentCount} | newest=${newest?.toISOString() ?? 'unknown'}`);
  } catch (error) {
    console.warn(`feed failed: ${source} | ${url} | ${error.message}`);
  }
}

const uniqueItems = [...new Map(items.map((item) => [item.link, item])).values()]
  .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

if (!uniqueItems.length) {
  console.log('直近24時間のAI関連記事はありません。記事生成をスキップします。');
  process.exit(0);
}
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY が必要です。');

console.log(`candidate articles: ${uniqueItems.length}`);
const client = new OpenAI();
const response = await client.responses.create({
  model: process.env.OPENAI_MODEL ?? 'gpt-5-mini',
  input: `次の候補から日本語読者に重要なAIニュースを最大7件選び、1本のデイリーダイジェスト記事を作成してください。事実と推測を分け、情報源にないことを加えないでください。本文中でも出典を明示してください。JSONで title, description, category, bodyMarkdown, selectedSourceUrls を返してください。候補: ${JSON.stringify(uniqueItems)}`,
  text: {
    format: {
      type: 'json_schema',
      name: 'daily_ai_news',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description', 'category', 'bodyMarkdown', 'selectedSourceUrls'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string' },
          bodyMarkdown: { type: 'string' },
          selectedSourceUrls: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }
});

const article = JSON.parse(response.output_text);
const selected = uniqueItems.filter((item) => article.selectedSourceUrls.includes(item.link));
if (!selected.length) throw new Error('生成記事に有効な出典URLがありません。');

const now = new Date();
const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(now);
const slug = `${day}-ai-digest`;
const escapeYaml = (value) => String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
const yamlSources = selected
  .map((item) => `  - name: "${escapeYaml(item.source)}"\n    url: "${escapeYaml(item.link)}"`)
  .join('\n');
const md = `---
title: "${escapeYaml(article.title)}"
description: "${escapeYaml(article.description)}"
publishedAt: ${now.toISOString()}
category: "${escapeYaml(article.category)}"
featured: true
sources:
${yamlSources}
---

${article.bodyMarkdown}
`;

await mkdir('src/content/news', { recursive: true });
await writeFile(`src/content/news/${slug}.md`, md);
console.log(`created ${slug}.md from ${selected.length} sources`);
