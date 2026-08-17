import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
export async function GET(context){const posts=(await getCollection('news',({data})=>!data.draft)).sort((a,b)=>b.data.publishedAt-a.data.publishedAt);return rss({title:'AI FRONTIER',description:'世界のAIニュースを日本語で',site:context.site,items:posts.map(p=>({title:p.data.title,description:p.data.description,pubDate:p.data.publishedAt,link:`/news/${p.id}/`}))});}
