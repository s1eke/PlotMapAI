var e=`- externalId: 1
  name: 首行缩进(两格)
  group: 段落排版
  pattern: '(^|\\n)[ \\t　]*(?=\\S)'
  replacement: '$1　　'
  isRegex: true
  isEnabled: true
  order: 0
  targetScope: all
  executionStage: post-ast
  exclusiveGroup: indentation
  timeoutMs: 3000

- externalId: 2
  name: 首行顶格(无缩进)
  group: 段落排版
  pattern: '(^|\\n)[ \\t　]+(?=\\S)'
  replacement: '$1'
  isRegex: true
  isEnabled: false
  order: 1
  targetScope: all
  executionStage: post-ast
  exclusiveGroup: indentation
  timeoutMs: 3000

- externalId: 3
  name: 删除网址
  group: 内容清理
  pattern: '(?i)(?:https?://|www\\.)[^\\s]+'
  replacement: ''
  isRegex: true
  isEnabled: true
  order: 10
  targetScope: all
  executionStage: post-ast
  timeoutMs: 3000
`;export{e as default};