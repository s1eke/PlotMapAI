import{n as e}from"./debug-_Ggyvqv4.js";var t=6e3,n=12e3,r=12e4,i=4e3,a=3,o=class extends Error{constructor(e){super(e),this.name=`AnalysisConfigError`}},s=class extends Error{constructor(e){super(e),this.name=`AnalysisExecutionError`}},c=class extends Error{constructor(e){super(e),this.name=`ChunkingError`}},l=[[`父女`,[`父女`]],[`父子`,[`父子`]],[`母女`,[`母女`]],[`母子`,[`母子`]],[`兄妹`,[`兄妹`]],[`姐弟`,[`姐弟`]],[`姐妹`,[`姐妹`]],[`兄弟`,[`兄弟`]],[`夫妻`,[`夫妻`,`夫妇`]],[`恋人`,[`恋人`,`情侣`,`爱人`,`相恋`,`相爱`]],[`亲情`,[`亲情`,`家人`,`亲人`,`血亲`,`骨肉`]],[`师徒`,[`师徒`,`师生`]],[`君臣`,[`君臣`,`忠臣`,`臣子`,`臣属`]],[`主仆`,[`主仆`,`仆从`,`侍从`]],[`盟友`,[`盟友`,`同盟`]],[`同伴`,[`同伴`,`伙伴`,`搭档`]],[`朋友`,[`朋友`,`友人`,`友情`]],[`对立`,[`对立`,`敌对`,`宿敌`,`仇敌`,`仇人`,`敌人`,`死敌`]],[`利用`,[`利用`,`操控`]],[`暧昧`,[`暧昧`]]];function u(e){return e?e.length<=8?`*`.repeat(e.length):`${e.slice(0,4)}${`*`.repeat(Math.max(4,e.length-8))}${e.slice(-4)}`:``}function d(e){if(!e)throw new o(`请先在设置中完成 AI 接口配置。`);if(!X(e.apiBaseUrl))throw new o(`AI 接口地址不能为空。`);if(!X(e.apiKey))throw new o(`AI Token 未配置，请先在设置中保存。`);if(!X(e.modelName))throw new o(`AI 模型名称不能为空。`);if(Z(e.contextSize,n)<n)throw new o(`上下文大小不能小于 ${n}。`)}async function f(e){let t={model:e.modelName,temperature:0,max_tokens:16,messages:[{role:`system`,content:`你是连通性测试助手。请简短回复。`},{role:`user`,content:`如果你能看到这条消息，只回复：连接成功`}]};return{message:`AI 接口连接测试成功。`,preview:X(await S(e.apiBaseUrl,e.apiKey,t),80)||`连接成功`}}function p(e,r){if(r<n)throw new c(`上下文大小过小，至少需要 ${n}。`);let i=r-t;if(i<=0)throw new c(`上下文大小不足以容纳分析提示词，请增大上下文大小。`);let a=[],o=[],s=0;for(let t of e){let e=D(t),n=$(e);if(n>i)throw new c(`第 ${t.chapterIndex+1} 章《${t.title||`未命名章节`}》长度超过当前上下文预算，请增大上下文大小后重试。`);o.length>0&&s+n>i&&(a.push(E(a.length,o,s)),o.length=0,s=0),o.push({chapterIndex:t.chapterIndex,title:t.title,content:t.content,text:e,length:n}),s+=n}return o.length>0&&a.push(E(a.length,o,s)),a}async function m(e,t,n,r){let a=O(t,n,r),o={model:e.modelName,temperature:.2,max_tokens:i,messages:[{role:`system`,content:`你是一个严谨的小说结构分析器。你必须只返回 JSON 对象，不允许返回 markdown、解释文本或多余前后缀。`},{role:`user`,content:a}]};return M(`第 ${n.chunkIndex+1} 块章节分析`,async()=>C(await x(e.apiBaseUrl,e.apiKey,o),n))}async function h(e,t,n){let r=k(t,n),a={model:e.modelName,temperature:.2,max_tokens:i,messages:[{role:`system`,content:`你是一个严谨的小说结构分析器。你必须只返回 JSON 对象，不允许返回 markdown、解释文本或多余前后缀。`},{role:`user`,content:r}]};return M(`第 ${n.chapterIndex+1} 章单章分析`,async()=>A(await x(e.apiBaseUrl,e.apiKey,a),n))}async function g(e,t,n,r){if(n.length<r)throw new s(`章节分析尚未全部完成，无法生成全书概览。`);let a=T(n),o=j(t,a,r,e.contextSize),c={model:e.modelName,temperature:.2,max_tokens:i,messages:[{role:`system`,content:`你是一个严谨的小说全书分析器。你必须只返回 JSON 对象，不允许返回 markdown、解释文本或多余前后缀。`},{role:`user`,content:o}]};return M(`全书概览分析`,async()=>w(await x(e.apiBaseUrl,e.apiKey,c),a,r))}function _(e){return!e||!X(e.summary,400)?!1:[e.keyPoints,e.characters,e.relationships,e.tags].every(J)}function v(e,t){return!e||t<=0||!X(e.bookIntro,400)||!X(e.globalSummary,2e3)||e.analyzedChapters<t||e.totalChapters<t?!1:[e.themes,e.characterStats,e.relationshipGraph].every(J)}function y(e){return e?{bookIntro:e.bookIntro,globalSummary:e.globalSummary,themes:q(e.themes),characterStats:q(e.characterStats),relationshipGraph:q(e.relationshipGraph),totalChapters:e.totalChapters,analyzedChapters:e.analyzedChapters,updatedAt:e.updatedAt}:null}function b(e,t,n){let r=e.length,i=y(n),a=t.length>0?T(t):{allCharacterStats:[],relationshipGraph:[],analyzedChapters:0},o=new Map;for(let e of a.allCharacterStats){let t=X(e.name,80);t&&o.set(t,e)}let s=i?.characterStats||[],c=i?.relationshipGraph||[],l=new Map;for(let e of s){let t=X(e.name,80);t&&l.set(t,e)}let u=(a.relationshipGraph||[]).filter(e=>typeof e==`object`),d=B(u),f=V(c),p=[...c,...u],m=H(a.allCharacterStats||[],s,p),h=new Set(m),g=[];for(let e of p){let t=L(e.source,e.target);!t||g.some(e=>e[0]===t[0]&&e[1]===t[1])||g.push(t)}let _=[];for(let[e,t]of g){if(!h.has(e)||!h.has(t))continue;let n=`${e}::${t}`,r=f.get(n)||{},i=d.get(n)||{},a=R(r.relationTags,r.type,i.relationTags,i.type)||[`未分类`],o=Number(i.chapterCount)||0,s=Number(i.mentionCount)||0;_.push({id:`${e}::${t}`,source:e,target:t,type:a[0],relationTags:a,description:X(r.description,280)||W(e,t,a,o,s),weight:Math.round((Number(i.weight)||0)*100)/100,mentionCount:s,chapterCount:o,chapters:i.chapters||[]})}_.sort((e,t)=>t.weight-e.weight||t.mentionCount-e.mentionCount);let b=new Map;for(let e of m)b.set(e,[]);for(let e of _){let t=e.source,n=e.target;b.get(t)?.push(e),b.get(n)?.push(e)}let x=[];for(let e of m){let t=o.get(e)||{},n=l.get(e)||{},r=X(n.role,80)||X(t.role,80),i=Math.round((Number(n.sharePercent||t.sharePercent)||0)*100)/100,a=Number(t.chapterCount)||0,s=X(n.description,220);s||=U(e,r,i,a,b.get(e)||[]),x.push({id:e,name:e,role:r,description:s,weight:Math.round((Number(t.weight)||0)*100)/100,sharePercent:i,chapterCount:a,chapters:t.chapters||[],isCore:l.has(e)})}let S=n?.updatedAt||null;return!S&&t.length>0&&(S=t.reduce((e,t)=>t.updatedAt&&(!e||t.updatedAt>e)?t.updatedAt:e,null)),{nodes:x,edges:_,meta:{totalChapters:r,analyzedChapters:a.analyzedChapters||0,nodeCount:x.length,edgeCount:_.length,hasOverview:!!i,hasData:x.length>0||_.length>0,isComplete:v(n,r),generatedAt:S}}}async function x(e,t,n){return G(await S(e,t,n))}async function S(t,n,i){let a=`${t.replace(/\/+$/,``)}/chat/completions`,o=new AbortController,c=setTimeout(()=>o.abort(),r);e(`AI`,`POST ${a} model=${i.model} maxTokens=${i.max_tokens}`);let l;try{l=await fetch(a,{method:`POST`,headers:{"Content-Type":`application/json`,Authorization:`Bearer ${n}`},body:JSON.stringify(i),signal:o.signal})}catch(e){throw clearTimeout(c),e instanceof DOMException&&e.name===`AbortError`?new s(`AI 接口请求超时，请稍后重试。`):new s(`AI 接口连接失败：${e instanceof Error?e.message:String(e)}`)}if(clearTimeout(c),!l.ok){let e=await l.text().catch(()=>``);throw new s(`AI 接口返回错误（HTTP ${l.status}）：${K(e)}`)}let u=await l.text();e(`AI`,`response HTTP ${l.status} contentLen=${u.length}`);let d;try{d=JSON.parse(u)}catch{throw new s(`AI 接口返回的不是合法 JSON 响应。`)}if(typeof d!=`object`||!d)throw new s(`AI 接口返回格式无效。`);let f=d.choices;if(!Array.isArray(f)||f.length===0)throw new s(`AI 接口返回内容为空。`);let p=f[0].message?.content;if(Array.isArray(p)&&(p=p.map(e=>typeof e==`object`&&e.text||``).join(``)),typeof p!=`string`||!p.trim())throw new s(`AI 接口未返回有效文本内容。`);return p}function C(e,t){let n=e.chapterAnalyses;if(!Array.isArray(n))throw new s(`AI 返回缺少 chapterAnalyses 数组。`);let r=new Set(t.chapters.map(e=>e.chapterIndex)),i=new Map;for(let e of n){if(typeof e!=`object`||!e)throw new s(`AI 返回的 chapterAnalyses 项不是对象。`);let t=Number(e.chapterIndex);if(!Number.isInteger(t))throw new s(`AI 返回的 chapterIndex 不是有效整数。`);if(!r.has(t))throw new s(`AI 返回了不属于当前块的章节索引：${t}。`);if(i.has(t))throw new s(`AI 返回了重复的章节索引：${t}。`);i.set(t,e)}let a=[];for(let e of t.chapters){let t=e.chapterIndex,n=i.get(t);if(!n)throw new s(`AI 返回缺少第 ${t+1} 章的分析结果。`);if(!X(n.summary,400))throw new s(`AI 返回的第 ${t+1} 章 summary 为空。`);for(let e of[`keyPoints`,`tags`,`characters`,`relationships`])if(!Array.isArray(n[e]))throw new s(`AI 返回的第 ${t+1} 章缺少有效的 ${e} 数组。`);a.push({chapterIndex:t,title:X(n.title,256)||e.title,summary:X(n.summary,400),keyPoints:F(n.keyPoints,8,120),tags:F(n.tags,8,40),characters:N(n.characters),relationships:P(n.relationships)})}return{chunkSummary:X(e.chunkSummary,500)||`该章节块分析已完成。`,chapterAnalyses:a}}function w(e,t,n){let r=X(e.bookIntro,400),i=X(e.globalSummary,2400);if(!r)throw new s(`AI 返回的 bookIntro 为空。`);if(!i)throw new s(`AI 返回的 globalSummary 为空。`);if(!Array.isArray(e.themes))throw new s(`AI 返回缺少有效的 themes 数组。`);if(!Array.isArray(e.characterStats))throw new s(`AI 返回缺少有效的 characterStats 数组。`);if(!Array.isArray(e.relationshipGraph))throw new s(`AI 返回缺少有效的 relationshipGraph 数组。`);let a=new Map,o=t.allCharacterStats||t.characterStats;for(let e of o)e.name&&a.set(e.name,e);let c=V(t.allRelationshipGraph||[]),l=[],u=new Set,d=[];for(let t of e.characterStats.slice(0,8)){if(typeof t!=`object`||!t)throw new s(`AI 返回的 characterStats 项不是对象。`);let e=t,n=X(e.name,80);if(!n)throw new s(`AI 返回的核心角色缺少 name。`);if(u.has(n))continue;let r=a.get(n);if(!r)throw new s(`AI 返回了未在章节分析中出现的核心角色：${n}。`);let i=Q(e.sharePercent);if(i<=0)throw new s(`AI 返回的核心角色 ${n} 缺少有效的 sharePercent。`);u.add(n),d.push(i),l.push({name:n,role:X(e.role,80)||r.role,description:X(e.description,200)||r.description,weight:r.weight,sharePercent:i,chapters:r.chapters,chapterCount:r.chapterCount})}if(a.size>0&&l.length===0)throw new s(`AI 返回的核心角色列表为空。`);let f=I(d);for(let e=0;e<f.length;e++)l[e].sharePercent=f[e];l.sort((e,t)=>t.sharePercent-e.sharePercent||t.weight-e.weight||String(e.name).localeCompare(String(t.name)));let p=[],m=new Set;for(let t of e.relationshipGraph.slice(0,24)){if(typeof t!=`object`||!t)throw new s(`AI 返回的 relationshipGraph 项不是对象。`);let e=t,n=L(e.source,e.target);if(!n)continue;let r=`${n[0]}::${n[1]}`;if(m.has(r))continue;let[i,o]=n;if([i,o].filter(e=>!a.has(e)).length>0)continue;let l=c.get(r)||{},u=R(e.relationTags,e.type);if(u||=R(l.relationTags,l.type),!u)throw new s(`AI 返回的关系 ${i} / ${o} 缺少有效的 relationTags。`);let d=X(e.description,280)||X(l.description,280);p.push({source:i,target:o,type:u[0],relationTags:u.slice(0,6),description:d}),m.add(r)}return{bookIntro:r,globalSummary:i,themes:F(e.themes,12,40),characterStats:l,relationshipGraph:p,totalChapters:n,analyzedChapters:t.analyzedChapters}}function T(e){let t=new Map,n=new Map,r=new Map,i=[];for(let a of e){let e=q(a.tags),o=q(a.characters),s=q(a.relationships),c=q(a.keyPoints);i.push({chapterIndex:a.chapterIndex,chapterTitle:a.chapterTitle,summary:a.summary,keyPoints:c,tags:e,characters:o,relationships:s});for(let n of e)typeof n==`string`&&n.trim()&&t.set(n.trim(),(t.get(n.trim())||0)+1);for(let e of o){if(typeof e!=`object`||!e)continue;let t=e,r=X(t.name,80);if(!r)continue;let i=Q(t.weight),o=X(t.role,80),s=X(t.description,200),c=n.get(r);if(c||(c={name:r,weight:0,chapters:new Set,roles:new Map,descriptions:[]},n.set(r,c)),c.weight+=i,c.chapters.add(a.chapterIndex),o){let e=c.roles;e.set(o,(e.get(o)||0)+Math.max(i,1))}s&&!c.descriptions.includes(s)&&c.descriptions.length<6&&c.descriptions.push(s)}for(let e of s){if(typeof e!=`object`||!e)continue;let t=e,n=X(t.source,80),i=X(t.target,80),o=R(t.relationTags,t.type)||[`未分类`];if(!n||!i||n===i)continue;let[s,c]=[n,i].sort(),l=`${s}::${c}`,u=Q(t.weight),d=r.get(l);d||(d={source:s,target:c,weight:0,mentionCount:0,descriptions:[],chapters:new Set,relationTypes:new Map},r.set(l,d)),d.weight+=u,d.mentionCount+=1,d.chapters.add(a.chapterIndex);for(let e of o){let t=d.relationTypes;t.set(e,(t.get(e)||0)+Math.max(u,1))}let f=X(t.description,160);f&&!d.descriptions.includes(f)&&d.descriptions.length<6&&d.descriptions.push(f)}}let a=Array.from(n.values()).reduce((e,t)=>e+t.weight,0)||1,o=Array.from(n.values()).map(e=>{let t=[...e.roles.entries()].sort((e,t)=>t[1]-e[1]||e[0].localeCompare(t[0]))[0];return{name:e.name,role:t?.[0]||``,description:e.descriptions[0]||``,descriptionFragments:e.descriptions.slice(0,4),weight:Math.round(e.weight*100)/100,sharePercent:Math.round(e.weight/a*1e4)/100,chapters:[...e.chapters].sort((e,t)=>e-t),chapterCount:e.chapters.size}}).sort((e,t)=>t.weight-e.weight||e.name.localeCompare(t.name)),s=Array.from(r.values()).map(e=>{let t=[...e.relationTypes.entries()].sort((e,t)=>t[1]-e[1]||e[0].localeCompare(t[0])).slice(0,6).map(e=>e[0]);return{source:e.source,target:e.target,type:t[0]||`未分类`,relationTags:t,weight:Math.round(e.weight*100)/100,mentionCount:e.mentionCount,chapterCount:e.chapters.size,chapters:[...e.chapters].sort((e,t)=>e-t),description:e.descriptions.slice(0,3).join(`；`),descriptionFragments:e.descriptions.slice(0,4)}}).sort((e,t)=>t.weight-e.weight||e.source.localeCompare(t.source)||e.target.localeCompare(t.target));return{chapters:i,themes:[...t.entries()].sort((e,t)=>t[1]-e[1]).slice(0,12).map(e=>e[0]),characterStats:o.slice(0,20),allCharacterStats:o,allRelationshipGraph:s,relationshipGraph:s.slice(0,30),analyzedChapters:e.length}}function E(e,t,n){return{chunkIndex:e,chapterIndices:t.map(e=>e.chapterIndex),startChapterIndex:t[0].chapterIndex,endChapterIndex:t[t.length-1].chapterIndex,contentLength:n,chapters:t,text:t.map(e=>e.text).join(`

`)}}function D(e){return`[章节索引]${e.chapterIndex}\n[章节标题]${e.title||`未命名章节`}\n[章节正文]\n${e.content||``}`}function O(e,t,n){let r=t.chapters.map(e=>`${e.chapterIndex}:${e.title||`未命名章节`}`).join(`, `);return`请分析小说《${e}》的以下章节块。当前是第 ${t.chunkIndex+1}/${n} 个块。

分析目标：
1. 为每一章生成剧情梗概；
2. 提取每一章的关键剧情点；
3. 识别该章角色，并为每个角色给出 role、description、weight；其中 weight 为 0~100 的数值，表示该角色在本章的篇幅/存在感权重；
4. 提取本章中明确出现的人物关系；
5. 给出该章标签 tags。

返回要求：
- 只能返回 JSON 对象；
- 不要遗漏输入中的任何章节，也不要输出额外章节；
- chapterIndex 必须与输入一致，且每章都必须有独立结果；
- 每章都必须返回非空 summary；
- keyPoints、characters、relationships、tags 四个字段必须始终存在，哪怕没有内容也要返回空数组；
- 不要编造未在正文中出现的人物关系；
- 每章 summary 尽量控制在 120 字以内；
- relationship 中 weight 为 0~100 数值，source/target 为人物名；
- characters 中必须尽量覆盖本章核心角色；
- 权重请使用相对占比，便于后续统计人物篇幅。

JSON 结构示例：
{
  "chunkSummary": "该块总体概括",
  "chapterAnalyses": [
    {
      "chapterIndex": 0,
      "title": "章节标题",
      "summary": "章节梗概",
      "keyPoints": ["事件1", "事件2"],
      "tags": ["冲突", "成长"],
      "characters": [
        {"name": "角色名", "role": "角色定位", "description": "本章作用", "weight": 78}
      ],
      "relationships": [
        {"source": "角色A", "target": "角色B", "type": "盟友", "description": "关系变化", "weight": 65}
      ]
    }
  ]
}

当前块包含章节：${r}

章节正文如下：
${t.text}`.trim()}function k(e,t){let n=D(t);return`请分析小说《${e}》的第 ${t.chapterIndex+1} 章《${t.title||`未命名章节`}》。

分析目标：
1. 生成该章的剧情梗概；
2. 提取关键剧情点；
3. 识别该章角色，并为每个角色给出 role、description、weight；其中 weight 为 0~100 的数值，表示该角色在本章的篇幅/存在感权重；
4. 提取本章中明确出现的人物关系；
5. 给出该章标签 tags。

返回要求：
- 只能返回 JSON 对象；
- chapterIndex 必须与输入一致；
- 必须返回非空 summary；
- keyPoints、characters、relationships、tags 四个字段必须始终存在，哪怕没有内容也要返回空数组；
- 不要编造未在正文中出现的人物关系；
- summary 尽量控制在 120 字以内；
- relationship 中 weight 为 0~100 数值，source/target 为人物名；
- characters 中必须尽量覆盖本章核心角色；
- 权重请使用相对占比，便于后续统计人物篇幅。

JSON 结构示例：
{
  "chapterAnalyses": [
    {
      "chapterIndex": 0,
      "title": "章节标题",
      "summary": "章节梗概",
      "keyPoints": ["事件1", "事件2"],
      "tags": ["冲突", "成长"],
      "characters": [
        {"name": "角色名", "role": "角色定位", "description": "本章作用", "weight": 78}
      ],
      "relationships": [
        {"source": "角色A", "target": "角色B", "type": "盟友", "description": "关系变化", "weight": 65}
      ]
    }
  ]
}

章节正文如下：
${n}`.trim()}function A(e,t){let n=e.chapterAnalyses;if(!Array.isArray(n)||n.length===0)throw new s(`AI 返回缺少 chapterAnalyses 数组。`);let r=n[0];if(!Number.isInteger(Number(r.chapterIndex))||Number(r.chapterIndex)!==t.chapterIndex)throw new s(`AI 返回的 chapterIndex (${r.chapterIndex}) 与请求的 (${t.chapterIndex}) 不一致。`);if(!X(r.summary,400))throw new s(`AI 返回的 summary 为空。`);for(let e of[`keyPoints`,`tags`,`characters`,`relationships`])if(!Array.isArray(r[e]))throw new s(`AI 返回缺少有效的 ${e} 数组。`);return{chunkSummary:`单章分析`,chapterAnalyses:[{chapterIndex:t.chapterIndex,title:X(r.title,256)||t.title,summary:X(r.summary,400),keyPoints:F(r.keyPoints,8,120),tags:F(r.tags,8,40),characters:N(r.characters),relationships:P(r.relationships)}]}}function j(e,n,r,i){let a={totalChapters:r,chapterAnalyses:n.chapters,localThemes:n.themes,localCharacterStats:n.characterStats,localRelationshipGraph:n.relationshipGraph},o=JSON.stringify(a),s=i-t;if(s<=0||$(o)>s)throw new c(`全部章节分析数据超过当前上下文预算，请增大上下文大小后继续分析。`);return`以下是小说《${e}》全部章节的 AI 分析数据，请基于这些现成分析结果统一汇总简介、全书概览、主题标签和核心角色篇幅占比，不要逐章罗列，不要回退成章节摘要拼接，也不要机械照搬局部统计结果。

输出目标：
1. bookIntro：用于书籍详情页简介的文字，80~160 字，更像读者在详情页看到的导读或封底文案，重点交代故事设定、主角关系与核心悬念，尽量不要展开结局；
2. globalSummary：全书概览，220~500 字，完整概括主线推进、关键冲突、人物变化与结局走向，避免逐章列清单；
3. themes：3~12 个主题标签，应体现整本书的核心主题，而不是单纯重复高频章节标签；
4. characterStats：最多 8 个核心角色，必须复用输入 localCharacterStats 中已统计的角色名称，并输出 name、role、description、sharePercent；其中 sharePercent 为 0~100 的数值，表示该角色在整本书中的篇幅/存在感占比，请基于全部章节分析统一判断。
5. relationshipGraph：输出 6~24 条人物关系，只保留真正重要、稳定或对主线关键的关系；请综合章节 summary、characters、relationships 与 localRelationshipGraph 重新判断，不要简单照抄局部标签。

返回要求：
- 只能返回 JSON 对象；
- bookIntro 和 globalSummary 必须为非空字符串；
- bookIntro 和 globalSummary 必须明显区分层级，不能只是长短不同的同一段改写；
- bookIntro 应该更短、更像导读；globalSummary 才负责完整展开剧情与人物变化；
- themes、characterStats、relationshipGraph 必须为数组；
- characterStats 中不要输出未在 localCharacterStats 里出现的角色；
- 每个 characterStats 项都必须包含非空 name 和有效的 sharePercent；
- sharePercent 建议保留 1~2 位小数，全部角色的 sharePercent 总和不要超过 100；
- relationshipGraph 中的 source / target 必须来自输入里已出现的人物；
- relationshipGraph 每项都必须包含 source、target、relationTags、description；
- relationTags 为 1~4 个短标签，例如"师徒""盟友""对立""亲情""利用""暧昧"；
- relationTags 必须使用已经读完全书后的明确关系，不要写"疑似父女""父女（承认）""父女感应"这类阶段性或变体标签；如果最终关系明确为"父女"，就统一写"父女"；
- 优先保留能代表全书结构的关系，不要把同一对人物拆成多条；
- 不要输出 weight、chapters、chapterCount 等额外字段；
- characterStats.description 和 relationshipGraph.description 都要写成面向普通读者的自然表达，突出人物在剧情中的位置、冲突和变化；
- description 不要出现"在全书已分析内容中""覆盖X章""提及X次""篇幅占比约X%"这类系统口吻或统计口吻；
- 不要输出 markdown、解释文字或代码块。

JSON 结构示例：
{
  "bookIntro": "简介文本",
  "globalSummary": "全书概览文本",
  "themes": ["江湖", "成长", "家国"],
  "characterStats": [
    {"name": "紫薇", "role": "核心主角", "description": "推动主线与情感冲突的关键人物", "sharePercent": 28.5}
  ],
  "relationshipGraph": [
    {"source": "紫薇", "target": "小燕子", "relationTags": ["同伴", "姐妹情谊"], "description": "两人长期并肩推进主线，并在身份与情感压力中互相扶持。"}
  ]
}

全部分析数据如下：
${o}`.trim()}async function M(t,n){let r=[];for(let i=1;i<=a;i++)try{return await n()}catch(n){if(!(n instanceof s))throw n;if(r.push(`第 ${i} 次：${n.message}`),e(`AI`,`retry ${i}/${a} for "${t}": ${n instanceof Error?n.message:String(n)}`),i>=a)throw new s(`${t}已重试 ${a} 次仍失败。${r.join(`；`)}`)}throw new s(`${t}执行失败。`)}function N(e){return Array.isArray(e)?e.slice(0,20).filter(e=>typeof e==`object`&&!!e).map(e=>{let t=e,n=X(t.name,80);return n?{name:n,role:X(t.role,80),description:X(t.description,200),weight:Q(t.weight)}:null}).filter(Boolean):[]}function P(e){return Array.isArray(e)?e.slice(0,20).filter(e=>typeof e==`object`&&!!e).map(e=>{let t=e,n=X(t.source,80),r=X(t.target,80);return!n||!r||n===r?null:{source:n,target:r,type:X(t.type,80)||`未分类`,description:X(t.description,160),weight:Q(t.weight)}}).filter(Boolean):[]}function F(e,t,n){if(!Array.isArray(e))return[];let r=[];for(let i of e.slice(0,t)){let e=X(i,n);e&&!r.includes(e)&&r.push(e)}return r}function I(e){if(!e.length)return[];let t=e.map(e=>Math.max(0,Math.min(e,100))),n=t.reduce((e,t)=>e+t,0);if(n<=0)return t.map(()=>0);if(n<=100)return t.map(e=>Math.round(e*100)/100);let r=100/n,i=t.map(e=>Math.round(e*r*100)/100),a=Math.round((100-i.reduce((e,t)=>e+t,0))*100)/100;return i.length>0&&a!==0&&(i[0]=Math.round(Math.max(0,Math.min(100,i[0]+a))*100)/100),i}function L(e,t){let n=X(e,80),r=X(t,80);return!n||!r||n===r?null:[n,r].sort()}function R(...e){let t=[];for(let n of e){let e=Array.isArray(n)?n:[n];for(let n of e){let e=X(n,80);if(!e)continue;let r=e.split(/[\\/|｜；;，,、]+/).map(e=>X(e,80)).filter(Boolean);for(let e of r){let n=z(e);n&&!t.includes(n)&&t.push(n)}}}return t.length>0?t:null}function z(e){let t=X(e.replace(/[(（][^)）]{0,20}[)）]/g,``),80);t=t.replace(/^(疑似|疑为|疑|可能是|可能为|可能|似乎是|似乎|或为|像是|看似|表面上)/,``);let n=t.replace(/\s+/g,``);if(!n)return``;for(let[e,t]of l)if(t.some(e=>n.includes(e)))return e;return n}function B(e){let t=new Map;for(let n of e){let e=L(n.source,n.target);e&&t.set(`${e[0]}::${e[1]}`,n)}return t}function V(e){let t=new Map;for(let n of e){let e=L(n.source,n.target);if(!e)continue;let r=`${e[0]}::${e[1]}`,i=t.get(r);i||(i={source:e[0],target:e[1],relationTags:[],description:``},t.set(r,i));for(let e of R(n.relationTags,n.type)||[])!i.relationTags.includes(e)&&i.relationTags.length<6&&i.relationTags.push(e);let a=X(n.description,280);a&&a.length>i.description.length&&(i.description=a)}return t}function H(e,t,n,r=14){let i=[],a=e=>{let t=X(e,80);!t||i.includes(t)||i.length>=r||i.push(t)};for(let e of t.slice(0,8))typeof e==`object`&&e&&a(e.name);for(let e of n){if(i.length>=r)break;typeof e!=`object`||!e||(a(e.source),a(e.target))}for(let t of e){if(i.length>=r)break;typeof t==`object`&&t&&a(t.name)}return i}function U(e,t,n,r,i){let a=[],o=[];for(let t of i.sort((e,t)=>t.weight-e.weight)){let n=X(t.source===e?t.target:t.source,80);n&&!a.includes(n)&&a.length<3&&a.push(n);for(let e of R(t.relationTags,t.type)||[])!o.includes(e)&&o.length<4&&o.push(e)}let s=[`${e}${t?`以${t}身份参与主要剧情`:`在故事里占有一席之地`}`];return n>=15?s.push(`是推动主线的重要人物`):n>=7?s.push(`会持续影响关键情节的发展`):n>0&&s.push(`会在重要情节里带来明显影响`),a.length>0&&(o.length>0?s.push(`与${a.join(`、`)}之间的${o.join(`、`)}，构成了最值得关注的关系线`):s.push(`与${a.join(`、`)}的互动是理解这个人物的关键`)),X(`${s.join(`，`)}。`,220)}function W(e,t,n,r,i){let a=[`${e}和${t}之间的关系是故事里的重要线索`];return n.length>0?a.push(`整体更接近${n.join(`、`)}`):a.push(`会持续影响彼此的选择`),i>=8?a.push(`这条关系会在多段情节中反复推动剧情`):i>=3?a.push(`这条关系会在关键时刻左右剧情走向`):a.push(`这条关系会对人物冲突和选择产生影响`),X(`${a.join(`，`)}。`,260)}function G(e){let t=e.trim();t.startsWith("```")&&(t=t.replace(/^```(?:json)?\s*/,``).replace(/\s*```$/,``));try{let e=JSON.parse(t);if(typeof e==`object`&&e&&!Array.isArray(e))return e}catch{}let n=t.match(/\{[\s\S]*\}/);if(n)try{let e=JSON.parse(n[0]);if(typeof e==`object`&&e&&!Array.isArray(e))return e}catch{}throw new s(`AI 返回内容不是合法 JSON。`)}function K(e){try{let t=JSON.parse(e);if(typeof t==`object`&&t){if(typeof t.error==`object`&&t.error!==null)return t.error.message||e;if(t.error)return String(t.error)}}catch{}return e.slice(0,300)||`未知错误`}function q(e){if(!e)return[];try{let t=JSON.parse(e);return Array.isArray(t)?t:[]}catch{return[]}}function J(e){if(!e)return!1;try{let t=JSON.parse(e);return Array.isArray(t)}catch{return!1}}function Y(e){let t=X(e,512);if(!t)return``;if(!/^https?:\/\//i.test(t))throw new o(`AI 接口地址必须以 http:// 或 https:// 开头。`);return t.replace(/\/+$/,``)}function X(e,t){if(e==null)return``;let n=String(e).trim();return n=n.replace(/\s+/g,` `),t!==void 0&&(n=n.slice(0,t)),n}function Z(e,t){let n=Number(e);if(!Number.isFinite(n))throw new o(`上下文大小必须是整数。`);return n||t}function Q(e){let t=Number(e);return Number.isFinite(t)?Math.max(0,Math.min(t,100)):0}function $(e){return new TextEncoder().encode(e).length}export{b as a,v as c,m as d,g as f,d as h,p as i,u as l,f as m,s as n,X as o,h as p,c as r,_ as s,o as t,Y as u};