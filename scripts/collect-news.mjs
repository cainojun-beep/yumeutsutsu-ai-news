import { XMLParser } from 'fast-xml-parser';
import OpenAI from 'openai';
import { mkdir, writeFile } from 'node:fs/promises';

const feeds = [
  ['OpenAI','https://openai.com/news/rss.xml'],
  ['Google AI','https://blog.google/technology/ai/rss/'],
  ['Microsoft AI','https://blogs.microsoft.com/ai/feed/'],
  ['MIT AI','https://news.mit.edu/rss/topic/artificial-intelligence2']
];
const cutoff = Date.now()-24*60*60*1000;
const parser = new XMLParser({ignoreAttributes:false});
const items=[];
for(const [source,url] of feeds){try{const xml=await (await fetch(url,{headers:{'user-agent':'AI-FRONTIER/1.0'}})).text();const data=parser.parse(xml);const raw=data?.rss?.channel?.item??data?.feed?.entry??[];for(const x of (Array.isArray(raw)?raw:[raw])){const published=new Date(x.pubDate??x.published??x.updated??0);const link=typeof x.link==='string'?x.link:(x.link?.['@_href']??'');if(published.valueOf()>=cutoff&&link)items.push({source,title:x.title?.['#text']??x.title,link,publishedAt:published.toISOString(),summary:String(x.description??x.summary?.['#text']??'').replace(/<[^>]+>/g,' ').slice(0,1200)});}}catch(e){console.warn(`feed skipped: ${source}`,e.message)}}
if(!items.length) throw new Error('直近24時間の記事が見つかりませんでした。');
if(!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY が必要です。');
const client=new OpenAI();
const response=await client.responses.create({model:process.env.OPENAI_MODEL??'gpt-5-mini',input:`次の候補から日本語読者に重要なAIニュースを最大7件選び、1本のデイリーダイジェスト記事を作成してください。事実と推測を分け、情報源にないことを加えないでください。JSONで title, description, category, bodyMarkdown, selectedSourceUrls を返してください。候補: ${JSON.stringify(items)}`,text:{format:{type:'json_schema',name:'daily_ai_news',strict:true,schema:{type:'object',additionalProperties:false,required:['title','description','category','bodyMarkdown','selectedSourceUrls'],properties:{title:{type:'string'},description:{type:'string'},category:{type:'string'},bodyMarkdown:{type:'string'},selectedSourceUrls:{type:'array',items:{type:'string'}}}}}}});
const article=JSON.parse(response.output_text);const selected=items.filter(x=>article.selectedSourceUrls.includes(x.link));const now=new Date();const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(now);const slug=`${day}-ai-digest`;const yamlSources=selected.map(x=>`  - name: "${String(x.source).replaceAll('"','\\"')}"
    url: "${x.link}"`).join('\n');const md=`---\ntitle: "${article.title.replaceAll('"','\\"')}"\ndescription: "${article.description.replaceAll('"','\\"')}"\npublishedAt: ${now.toISOString()}\ncategory: "${article.category.replaceAll('"','\\"')}"\nfeatured: true\nsources:\n${yamlSources}\n---\n\n${article.bodyMarkdown}\n`;await mkdir('src/content/news',{recursive:true});await writeFile(`src/content/news/${slug}.md`,md);console.log(`created ${slug}.md from ${selected.length} sources`);
