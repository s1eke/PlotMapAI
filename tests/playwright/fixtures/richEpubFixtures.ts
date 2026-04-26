import JSZip from 'jszip';

interface FixtureFilePayload {
  buffer: Buffer;
  mimeType: string;
  name: string;
}

interface RichEpubFixtureChapter {
  bodyHtml: string;
  id: string;
  title: string;
}

interface RichEpubFixtureImage {
  content: string;
  encoding?: 'base64' | 'utf-8';
  mediaType: string;
  path: string;
}

export interface RichEpubFixtureDefinition {
  chapters: RichEpubFixtureChapter[];
  fileName: string;
  id: string;
  images?: RichEpubFixtureImage[];
  title: string;
}

function buildSceneSvg(title: string, primary: string, secondary: string): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800">',
    '<defs>',
    '<linearGradient id="bg" x1="0%" x2="100%" y1="0%" y2="100%">',
    `<stop offset="0%" stop-color="${primary}" />`,
    `<stop offset="100%" stop-color="${secondary}" />`,
    '</linearGradient>',
    '</defs>',
    '<rect width="1200" height="800" fill="url(#bg)" rx="48" />',
    '<circle cx="240" cy="220" r="120" fill="rgba(255,255,255,0.18)" />',
    '<circle cx="930" cy="260" r="150" fill="rgba(255,255,255,0.12)" />',
    '<path d="M120 620 C280 470 470 510 640 420 C820 330 980 360 1110 250" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="18" stroke-linecap="round" />',
    `<text x="90" y="710" fill="white" font-family="Georgia, serif" font-size="72" font-weight="700">${title}</text>`,
    '</svg>',
  ].join('');
}

function buildWideSceneSvg(title: string, primary: string, secondary: string): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 360">',
    '<defs>',
    '<linearGradient id="bg" x1="0%" x2="100%" y1="0%" y2="100%">',
    `<stop offset="0%" stop-color="${primary}" />`,
    `<stop offset="100%" stop-color="${secondary}" />`,
    '</linearGradient>',
    '</defs>',
    '<rect width="1600" height="360" fill="url(#bg)" rx="32" />',
    '<path d="M96 274 C260 150 430 204 612 124 C768 58 994 90 1200 148 C1340 188 1470 178 1540 104" fill="none" stroke="rgba(255,255,255,0.46)" stroke-width="18" stroke-linecap="round" />',
    '<circle cx="280" cy="102" r="72" fill="rgba(255,255,255,0.12)" />',
    '<circle cx="1270" cy="198" r="94" fill="rgba(255,255,255,0.15)" />',
    `<text x="96" y="312" fill="white" font-family="Georgia, serif" font-size="72" font-weight="700">${title}</text>`,
    '</svg>',
  ].join('');
}

function createParagraphSeries(prefix: string, count: number): string {
  return Array.from({ length: count }, (_, index) => (
    `<p>${prefix} ${index + 1}. The lantern-lit avenue folded into another rumor, and every footstep stretched the silence a little further.</p>`
  )).join('\n');
}

const SHARED_IMAGES: RichEpubFixtureImage[] = [
  {
    content: buildSceneSvg('Harbor Atlas', '#28536b', '#c2948a'),
    mediaType: 'image/svg+xml',
    path: 'images/harbor-atlas.svg',
  },
  {
    content: buildSceneSvg('Signal Garden', '#466365', '#c4a35a'),
    mediaType: 'image/svg+xml',
    path: 'images/signal-garden.svg',
  },
  {
    content: buildSceneSvg('Archive Bloom', '#7a4d3a', '#d8b26e'),
    mediaType: 'image/svg+xml',
    path: 'images/archive-bloom.svg',
  },
  {
    content: buildWideSceneSvg('Signal Banner', '#51407a', '#db8c58'),
    mediaType: 'image/svg+xml',
    path: 'images/signal-banner.svg',
  },
];

export const RICH_EPUB_FIXTURES = {
  scrollRich: {
    id: 'scroll-rich',
    fileName: 'scroll-rich.epub',
    title: 'Scroll Rich Atlas',
    chapters: [
      {
        id: 'chapter-1',
        title: 'Street Prelude',
        bodyHtml: [
          '<h1>Street Prelude</h1>',
          '<p>The market street woke in copper light and thin smoke.</p>',
          '<blockquote><p>Every witness swore the city moved first, not the people.</p></blockquote>',
          '<ol>',
          '<li><p>Watch the shutters.</p></li>',
          '<li><p>Count the bells.</p></li>',
          '</ol>',
        ].join('\n'),
      },
    ],
  },
  pagedRich: {
    id: 'paged-rich',
    fileName: 'paged-rich.epub',
    title: 'Paged Meridian Ledger',
    chapters: [
      {
        id: 'chapter-1',
        title: 'Meridian Ledger',
        bodyHtml: [
          '<h1>Meridian Ledger</h1>',
          '<p id="signal-note">The observatory ledger kept <strong>revising</strong> itself whenever the eastern shutters sighed.</p>',
          '<p>Each margin hid an <em>echo</em>, and the brass notation would <u>tilt north</u> before the next bell.</p>',
          '<p>The night clerk learned to <a href="#signal-note">return to the signal note</a> whenever the page split in two.</p>',
          createParagraphSeries('The observatory ledger kept revising itself', 21),
        ].join('\n'),
      },
    ],
  },
  semanticShowcase: {
    id: 'semantic-showcase',
    fileName: 'semantic-showcase.epub',
    title: 'Semantic Showcase Atlas',
    images: SHARED_IMAGES,
    chapters: [
      {
        id: 'chapter-1',
        title: 'Signal Grammar',
        bodyHtml: [
          '<h1>Signal Grammar</h1>',
          '<p style="text-indent: 2em;">The first relay note leaned inward, proving the paragraph contract still owns indentation after import.</p>',
          '<blockquote><p>The bridge answered twice, once in brass and once in rain.</p></blockquote>',
          '<ol>',
          '<li><p>Count the shutters.</p></li>',
          '<li><p>Mark the bell.</p></li>',
          '</ol>',
          '<ul>',
          '<li><p>Carry dry ink.</p></li>',
          '<li><p>Return before dawn.</p></li>',
          '</ul>',
          '<p>The relay clerks copied each warning twice so the tower watch could compare the rhythm without touching the original sheet.</p>',
          '<p>Every margin mark arrived with a second instruction, and none of them agreed on which bell truly started the route.</p>',
          '<p>The survey table below keeps the final pass separate from the rehearsal pass so the lower viewport has enough depth to validate scrolling.</p>',
          '<figure>',
          '<img src="images/signal-banner.svg" alt="Signal banner" />',
          '<figcaption>Signal banner stretched low across the relay hall, keeping the gallery block compact but visible.</figcaption>',
          '</figure>',
          '<p id="gate-note">A brass thread tied the route ledger back to the gate note.</p>',
          '<p><a href="#gate-note">Return to the gate note</a> before the clerk seals the margin.</p>',
          '<hr id="relay-divider" />',
          '<table>',
          '<tr><th>Route</th><th>Status</th></tr>',
          '<tr><td>North Lock</td><td>Open</td></tr>',
          '</table>',
          '<aside>Unsupported marginalia: ferry lanterns only after dusk.</aside>',
        ].join('\n'),
      },
    ],
  },
  textPolicyShowcase: {
    id: 'text-policy-showcase',
    fileName: 'text-policy-showcase.epub',
    title: 'Text Policy Glyph Ledger',
    images: SHARED_IMAGES,
    chapters: [
      {
        id: 'chapter-1',
        title: '边界（注释）Alpha 123 🚀 Observatory Signal Ledger',
        bodyHtml: [
          '<h1>边界（注释）Alpha 123 🚀 Observatory Signal Ledger</h1>',
          '<p>第12区Alpha节点在23:59重新上线，<strong>bold signal</strong> and <em>italic relay</em> share one measured line with emoji 🚀✨.</p>',
          '<p>Long URL checkpoint: <a href="https://example.test/archive/supercalifragilisticexpialidocious">https://example.test/archive/supercalifragilisticexpialidocious</a> keeps the rich inline path honest.</p>',
          '<p>Soft hyphen sample: inter&shy;stellar carto&shy;graphy meets zero width<wbr/>breaks without losing the visible text.</p>',
          '<figure>',
          '<img src="images/signal-banner.svg" alt="Signal banner" />',
          '<figcaption>图注 Caption: Signal banner under mixed CJK/Latin light, emoji 🚀, and a compact URL https://example.test/caption.</figcaption>',
          '</figure>',
          '<table>',
          '<tr><th>节点 Node</th><th>状态 Status</th></tr>',
          '<tr><td>东门 Alpha-12 🚀</td><td>连续中文Latin123混排保持稳定</td></tr>',
          '<tr><td>URL</td><td>https://example.test/table/superlongtoken</td></tr>',
          '</table>',
          '<p>Final line preserves ordinary paragraph behavior while policy-specific cases stay isolated in fixtures.</p>',
        ].join('\n'),
      },
    ],
  },
  imageViewer: {
    id: 'image-viewer',
    fileName: 'image-viewer.epub',
    title: 'Image Viewer Atlas',
    images: SHARED_IMAGES,
    chapters: [
      {
        id: 'chapter-1',
        title: 'Harbor Map',
        bodyHtml: [
          '<h1>Harbor Map</h1>',
          '<p>The archivist unfolded a weatherproof chart over the gangway.</p>',
          '<figure>',
          '<img src="images/harbor-atlas.svg" alt="Harbor atlas" />',
          '<figcaption>Harbor atlas, annotated with flood sirens and ferry shadows.</figcaption>',
          '</figure>',
        ].join('\n'),
      },
    ],
  },
  imageCaption: {
    id: 'image-caption',
    fileName: 'image-caption.epub',
    title: 'Caption Garden Ledger',
    images: SHARED_IMAGES,
    chapters: [
      {
        id: 'chapter-1',
        title: 'Signal Garden',
        bodyHtml: [
          '<h1>Signal Garden</h1>',
          '<p>The garden lights pulsed whenever the tower clock missed a breath.</p>',
          '<figure>',
          '<img src="images/signal-garden.svg" alt="Signal garden" />',
          '<figcaption>Signal garden under a brass storm, where each path was marked in rotating semaphore colors.</figcaption>',
          '</figure>',
        ].join('\n'),
      },
    ],
  },
  simpleTable: {
    id: 'simple-table',
    fileName: 'simple-table.epub',
    title: 'Survey Table Ledger',
    chapters: [
      {
        id: 'chapter-1',
        title: 'Survey Table',
        bodyHtml: [
          '<h1>Survey Table</h1>',
          '<p>The quartermaster pinned the latest figures against the wind.</p>',
          '<table>',
          '<tr><th>Route</th><th>Status</th></tr>',
          '<tr><td>North Lock</td><td>Open</td></tr>',
          '<tr><td>Canal Gate</td><td>Delayed</td></tr>',
          '</table>',
          '<aside>Margin note: ferries only after dusk.</aside>',
        ].join('\n'),
      },
    ],
  },
  dirtyStyle: {
    id: 'dirty-style',
    fileName: 'dirty-style.epub',
    title: 'Dirty Style Gazette',
    chapters: [
      {
        id: 'chapter-1',
        title: 'Style Storm',
        bodyHtml: [
          '<h1 style="font-size:44px;color:#ff315c;letter-spacing:0.18em;">Style Storm</h1>',
          '<p style="font-family:cursive;background:linear-gradient(90deg,#121212,#f5b971);padding:10px;color:white;">',
          '<span style="font-weight:900;text-transform:uppercase;">Neon rain</span>',
          ' skated across the archive ceiling while the headline kept widening.',
          '</p>',
          '<p style="text-align:right;text-indent:3em;color:#0f766e;">Even the footnotes wanted to perform tonight.</p>',
        ].join(''),
      },
    ],
  },
  longChapter: {
    id: 'long-chapter',
    fileName: 'long-chapter.epub',
    title: 'Long Chapter Register',
    chapters: [
      {
        id: 'chapter-1',
        title: 'Register of Weather',
        bodyHtml: ['<h1>Register of Weather</h1>', createParagraphSeries('The register kept a second memory for every squall', 48)].join('\n'),
      },
    ],
  },
  analysisLinked: {
    id: 'analysis-linked',
    fileName: 'analysis-linked.epub',
    title: 'Analysis Bridge Novel',
    chapters: [
      {
        id: 'chapter-1',
        title: 'Bridge Chapter',
        bodyHtml: [
          '<h1>Bridge Chapter</h1>',
          '<p>Mara waited beneath the eastern bridge until the city answered in echoes.</p>',
        ].join('\n'),
      },
    ],
  },
  linkedStructures: {
    id: 'linked-structures',
    fileName: 'linked-structures.epub',
    title: 'Linked Survey Register',
    chapters: [
      {
        id: 'chapter-1',
        title: 'Linked Survey',
        bodyHtml: [
          '<h1>Linked Survey</h1>',
          '<p id="intro">The harbor watch began at the tide gate, where every lantern carried a second set of instructions.</p>',
          '<p><a href="#intro">Return to the gate note</a> before the route ledger resumed.</p>',
          '<hr id="divider" />',
          '<table>',
          '<tr><th>Route</th><th>Status</th></tr>',
          '<tr><td>North Lock</td><td>Open</td></tr>',
          '<tr><td>Canal Gate</td><td>Delayed</td></tr>',
          '</table>',
          '<p>The survey clerks copied each change twice so the bridge runners could compare them at dawn.</p>',
        ].join('\n'),
      },
    ],
  },
  multiImage: {
    id: 'multi-image',
    fileName: 'multi-image.epub',
    title: 'Gallery Relay Album',
    images: SHARED_IMAGES,
    chapters: [
      {
        id: 'chapter-1',
        title: 'Relay Album',
        bodyHtml: [
          '<h1>Relay Album</h1>',
          '<figure><img src="images/archive-bloom.svg" alt="Archive bloom" /><figcaption>Archive bloom in evening amber.</figcaption></figure>',
          '<p>The second image arrived folded inside the first dispatch.</p>',
          '<figure><img src="images/harbor-atlas.svg" alt="Harbor atlas" /><figcaption>Harbor atlas lit from below.</figcaption></figure>',
        ].join('\n'),
      },
    ],
  },
  multiChapterRich: {
    id: 'multi-chapter-rich',
    fileName: 'multi-chapter-rich.epub',
    title: 'Multi Chapter Compass',
    chapters: [
      {
        id: 'chapter-1',
        title: 'The Observatory',
        bodyHtml: [
          '<h1>The Observatory</h1>',
          '<p>ANCHOR_OBSERVATORY: The telescope keeper adjusted the brass ring before the next meridian crossed.</p>',
          createParagraphSeries('The observatory clock kept a second rhythm for every star', 14),
        ].join('\n'),
      },
      {
        id: 'chapter-2',
        title: 'The Archive',
        bodyHtml: [
          '<h1>The Archive</h1>',
          '<p>ANCHOR_ARCHIVE: The filing clerk turned the index wheel until the copper tabs aligned with the morning dispatch.</p>',
          createParagraphSeries('The archive shelves remembered more than the clerks who tended them', 14),
        ].join('\n'),
      },
      {
        id: 'chapter-3',
        title: 'The Signal',
        bodyHtml: [
          '<h1>The Signal</h1>',
          '<p>ANCHOR_SIGNAL: The relay station hummed twice before the lantern grid acknowledged the eastern tower.</p>',
          createParagraphSeries('The signal path bent around every hill the surveyors had forgotten', 14),
        ].join('\n'),
      },
    ],
  },
} as const satisfies Record<string, RichEpubFixtureDefinition>;

export type RichEpubFixtureId = keyof typeof RICH_EPUB_FIXTURES;

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function renderChapterXhtml(chapter: RichEpubFixtureChapter): string {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<html xmlns="http://www.w3.org/1999/xhtml">',
    '<head>',
    `<title>${escapeXml(chapter.title)}</title>`,
    '<meta charset="utf-8" />',
    '<style>body{font-family:Georgia,serif;line-height:1.7;padding:0 8px;}img{max-width:100%;height:auto;}figure{margin:1.5rem 0;}figcaption{font-size:0.95rem;color:#555;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #999;padding:6px 8px;}blockquote{border-left:3px solid #999;padding-left:12px;color:#444;}</style>',
    '</head>',
    '<body>',
    chapter.bodyHtml,
    '</body>',
    '</html>',
  ].join('');
}

function renderContainerXml(): string {
  return [
    '<?xml version="1.0"?>',
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">',
    '<rootfiles>',
    '<rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>',
    '</rootfiles>',
    '</container>',
  ].join('');
}

function renderContentOpf(fixture: RichEpubFixtureDefinition): string {
  const chapterItems = fixture.chapters.map((chapter) => (
    `<item id="${chapter.id}" href="${chapter.id}.xhtml" media-type="application/xhtml+xml"/>`
  )).join('\n');
  const imageItems = (fixture.images ?? []).map((image, index) => (
    `<item id="asset-${index}" href="${image.path}" media-type="${image.mediaType}"/>`
  )).join('\n');
  const spine = fixture.chapters.map((chapter) => (
    `<itemref idref="${chapter.id}"/>`
  )).join('\n');

  return [
    '<?xml version="1.0"?>',
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">',
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '<dc:title id="bookid">',
    escapeXml(fixture.title),
    '</dc:title>',
    '<dc:language>en</dc:language>',
    '</metadata>',
    '<manifest>',
    chapterItems,
    imageItems,
    '</manifest>',
    '<spine>',
    spine,
    '</spine>',
    '</package>',
  ].join('\n');
}

async function buildFixtureArchive(
  fixture: RichEpubFixtureDefinition,
): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('META-INF/container.xml', renderContainerXml());
  zip.file('content.opf', renderContentOpf(fixture));

  for (const chapter of fixture.chapters) {
    zip.file(`${chapter.id}.xhtml`, renderChapterXhtml(chapter));
  }

  for (const image of fixture.images ?? []) {
    zip.file(image.path, image.content, image.encoding === 'base64' ? { base64: true } : undefined);
  }

  return zip.generateAsync({ type: 'uint8array' });
}

export async function buildRichEpubFixtureFile(
  fixtureId: RichEpubFixtureId,
): Promise<FixtureFilePayload> {
  const fixture = RICH_EPUB_FIXTURES[fixtureId];

  return {
    name: fixture.fileName,
    mimeType: 'application/epub+zip',
    buffer: Buffer.from(await buildFixtureArchive(fixture)),
  };
}
