// 论文中两幅 TikZ 结构图的 SVG 重绘。坐标沿用 TikZ 原稿（单位 cm，y 轴向上）。
const U = 58; // 1cm → px
const BW = 200; // 方框宽
const BH = 60; // 方框高
const W = 940;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function svg({ title, top, bottom, nodes, edges, note }) {
  const X = (x) => W / 2 + x * U;
  const Y = (y) => (top - y) * U;
  const H = (top - bottom) * U;
  const N = Object.fromEntries(nodes.map((n) => [n.id, { ...n, cx: X(n.x), cy: Y(n.y) }]));
  // 线段与方框边界的交点
  const clip = (a, b) => {
    const dx = b.cx - a.cx, dy = b.cy - a.cy;
    const t = Math.min(dx ? (BW / 2 + 4) / Math.abs(dx) : Infinity, dy ? (BH / 2 + 4) / Math.abs(dy) : Infinity);
    return [a.cx + dx * t, a.cy + dy * t];
  };
  const text = (lines, x, y, cls) => {
    const arr = lines.split('\n');
    const y0 = y - ((arr.length - 1) * 20) / 2;
    return `<text class="${cls}" x="${x.toFixed(1)}" y="${y0.toFixed(1)}">${arr.map((l, i) => `<tspan x="${x.toFixed(1)}" dy="${i ? 20 : 0}">${esc(l)}</tspan>`).join('')}</text>`;
  };
  let out = '';
  for (const e of edges) {
    let pts;
    if (e.pts) pts = e.pts.map(([x, y]) => [X(x), Y(y)]);
    else { const a = N[e.from], b = N[e.to]; pts = [clip(a, b), clip(b, a)]; }
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    out += `<path class="edge${e.dashed ? ' dashed' : ''}" d="${d}" marker-end="url(#arr)"${e.bi ? ' marker-start="url(#arr)"' : ''}/>`;
    if (e.label) {
      let lx, ly;
      if (e.at) { lx = X(e.at[0]); ly = Y(e.at[1]); }
      else { lx = (pts[0][0] + pts[pts.length - 1][0]) / 2; ly = (pts[0][1] + pts[pts.length - 1][1]) / 2; }
      out += text(e.label, lx, ly, 'elabel');
    }
  }
  for (const n of Object.values(N)) {
    out += `<rect class="node${n.focus ? ' focus' : ''}" x="${(n.cx - BW / 2).toFixed(1)}" y="${(n.cy - BH / 2).toFixed(1)}" width="${BW}" height="${BH}" rx="6"/>`;
    out += text(n.label, n.cx, n.cy, 'nlabel');
  }
  if (note) out += text(note.text, X(0), Y(note.y), 'dnote');
  return `<svg class="diagram-svg" viewBox="0 0 ${W} ${H.toFixed(0)}" role="img" aria-label="${esc(title)}">
<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1L10 5L0 9z" class="arrowhead"/></marker></defs>
<text class="dtitle" x="24" y="30">${esc(title)}</text>
${out}
</svg>`;
}

const hb = BH / 2 / U + 0.07; // 方框半高（cm）
const hw = BW / 2 / U + 0.07;

export const diagrams = {
  'world_structure.tex': {
    id: 'world_structure',
    title: '提瓦特世界结构的功能关系及历史改造',
    caption: '实线表示运行联系，虚线表示具有先后顺序的改造或职能接续。三界关系据渊下宫对白；边界据古月记录与霜月回归；信息及权能关系据世界树说明、那维莱特记忆、夜神之国与阿如事件。',
    evidence: ['W002', 'W003', 'A009', 'W008', 'W036', 'W004', 'A007', 'W013', 'D036', 'D037'],
    svgs: [
      svg({
        title: 'Ⅰ　三界与世界边界', top: 1.5, bottom: -5.9,
        nodes: [
          { id: 'out', x: 0, y: 0, label: '外部宇宙与月体', focus: true },
          { id: 'veil', x: 0, y: -1.85, label: '虚假之天／边界', focus: true },
          { id: 'light', x: -5.45, y: -4, label: '光界\n原始元素生命' },
          { id: 'human', x: 0, y: -4, label: '人界\n生命与共同体' },
          { id: 'void', x: 5.45, y: -4, label: '虚无界\n深渊力量' },
        ],
        edges: [
          { from: 'out', to: 'veil', bi: true, label: '穿越、观测与通讯', at: [1.9, -0.92] },
          { from: 'veil', to: 'human', label: '隔绝、遮蔽与开放', at: [1.9, -2.6] },
          { from: 'light', to: 'human', dashed: true, label: '光界力分化\n为元素力', at: [-2.72, -3.36] },
          { from: 'void', to: 'human', label: '黑雾侵入与\n环境冲突', at: [2.72, -3.36] },
        ],
        note: { y: -5.2, text: '三界表示生命与力量条件；图中排列表示功能关系。三种力量可在渊下宫同一地点发生作用。' },
      }),
      svg({
        title: 'Ⅱ　权能、信息与地方修复', top: 1.5, bottom: -8.9,
        nodes: [
          { id: 'rule', x: 0, y: 0, label: '天理与四影\n生态安排及规则权限', focus: true },
          { id: 'tree', x: -4.5, y: -2.1, label: '世界树与地脉\n记忆、记录与魂灵循环' },
          { id: 'fate', x: 4.5, y: -2.1, label: '星空、命座与神之眼\n个人愿望及权能分授' },
          { id: 'people', x: 0, y: -4.35, label: '人界生命与共同体', focus: true },
          { id: 'night', x: -4.5, y: -6.7, label: '夜神之国\n受损地脉的地方重构' },
          { id: 'aaru', x: 4.5, y: -6.7, label: '阿如\n当代信息职能接续' },
        ],
        edges: [
          { pts: [[-hw, 0], [-4.5, 0], [-4.5, -2.1 + hb]], dashed: true, label: '改造成普遍记录装置', at: [-3.9, 0.32] },
          { pts: [[hw, 0], [4.5, 0], [4.5, -2.1 + hb]], dashed: true, label: '战后分授权能', at: [3.6, 0.32] },
          { from: 'tree', to: 'people', bi: true, label: '记录与魂灵归返', at: [-2.0, -3.02] },
          { from: 'fate', to: 'people', bi: true, label: '愿望与命星', at: [2.0, -3.02] },
          { from: 'tree', to: 'night', dashed: true, label: '战后整合\n地脉残片', at: [-5.55, -4.4] },
          { from: 'night', to: 'people', bi: true, label: '古名、记忆与还魂', at: [-2.0, -5.75] },
          { from: 'aaru', to: 'people', label: '保存信息与存在关联', at: [2.0, -5.75] },
          { pts: [[-4.5 - hw, -2.1], [-7.2, -2.1], [-7.2, -8.1], [4.5, -8.1], [4.5, -6.7 - hb]], dashed: true, label: '世界树焚烧后，阿如承接主要职能', at: [-1.2, -8.42] },
        ],
      }),
    ],
  },
  'columbina_time.tex': {
    id: 'columbina_time',
    title: '哥伦比娅的跨时因果与载体路径',
    caption: '上图标示权能转交、身体转化和归来条件；下图以虚线标出这些行动对人物已经历的引导与回应所产生的作用。三月神的历史经验、哥伦比娅的亲历顺序以及同伴所处的当代，由不同路径相接。',
    evidence: ['A003', 'A008', 'W021', 'W022', 'W036'],
    svgs: [
      svg({
        title: 'Ⅰ　权能交接、载体分离与当代归来', top: 1.5, bottom: -6.7,
        nodes: [
          { id: 'moons', x: -5.2, y: 0, label: '囚牢中的三月神\n获知战争的未来结局' },
          { id: 'visitor', x: 0, y: 0, label: '来自未来的哥伦比娅\n经历月宫会面', focus: true },
          { id: 'anchor', x: 5.2, y: 0, label: '预先留在未来的\n小部分灵魂' },
          { id: 'body', x: -5.2, y: -3, label: '身体散为月光' },
          { id: 'soul', x: 0, y: -3, label: '神格／灵魂\n留存在囚牢' },
          { id: 'allies', x: 5.2, y: -3, label: '同伴合力拉回霜月\n霜月穿越天幕' },
          { id: 'force', x: -5.2, y: -5.8, label: '挪德卡莱的月矩力\n经历漫长岁月' },
          { id: 'return', x: 0, y: -5.8, label: '三月女神\n重临提瓦特', focus: true },
        ],
        edges: [
          { from: 'moons', to: 'visitor', label: '移交权能', at: [-2.6, 0.32] },
          { from: 'visitor', to: 'soul', label: '神格留存', at: [0.95, -1.5] },
          { from: 'visitor', to: 'body', label: '散出身体', at: [-2.9, -1.2] },
          { from: 'body', to: 'force', label: '进入土地\n长期留存', at: [-6.3, -4.4] },
          { from: 'anchor', to: 'soul', label: '未来锚点', at: [2.9, -1.2] },
          { from: 'soul', to: 'return', label: '灵魂召回', at: [0.95, -4.4] },
          { pts: [[5.2, -3 - hb], [5.2, -5.8], [hw, -5.8]], label: '共同完成归来', at: [3.5, -5.48] },
        ],
      }),
      svg({
        title: 'Ⅱ　后来的行动参与形成此前的经历', top: 1.4, bottom: -2.7,
        nodes: [
          { id: 's', x: -5.2, y: 0, label: '留在囚牢的灵魂', focus: true },
          { id: 'g', x: 0, y: 0, label: '金色力量', focus: true },
          { id: 'pastg', x: 5.2, y: 0, label: '此前指引\n自己的来路', focus: true },
          { id: 'b', x: -5.2, y: -1.8, label: '化作月光的身体', focus: true },
          { id: 'l', x: 0, y: -1.8, label: '挪德卡莱月矩力', focus: true },
          { id: 'pastl', x: 5.2, y: -1.8, label: '此前回应\n自己的灵魂', focus: true },
        ],
        edges: [
          { from: 's', to: 'g', dashed: true }, { from: 'g', to: 'pastg', dashed: true },
          { from: 'b', to: 'l', dashed: true }, { from: 'l', to: 'pastl', dashed: true },
        ],
      }),
    ],
  },
};
