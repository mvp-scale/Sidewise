/**
 * The README's two story screens: docs/assets/story-mak.svg (MAK³: view, class, replay) and docs/assets/story-mdl.svg
 * (MDL³: scan, drill, loop), one row each of the Know / Judge / Prove grid, plus docs/assets/story-ledger.svg (the ledger:
 * one JSONL file, then what about 10, 20 and 50 runs of it give you). Each screen plays its three cards left to right:
 * the card lights up, its picture acts out the move, its line lands, and a pulse drops a record into the bar underneath,
 * then the finished frame holds until the loop restarts. Motion is SMIL on one shared loop (the same approach as
 * build-strip.ts); a second, frozen copy of the finished frame sits under it for readers who ask for no motion.
 * Hand-authored copy and pictures, no ledger data: free, no network, no browser.
 */
import { writeFileSync } from 'node:fs';

const C = { bg: '#050914', line: '#24344f', dim: '#7f93b0', ink: '#e6edf7', white: '#f5f8ff', blue: '#9bdcff', green: '#b7ff83', amber: '#ffcd57', red: '#ff8d85', panel: '#0b1424', card: '#101b2e', node: '#1a2740' };
const SANS = "Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif";
const MONO = "ui-monospace,SFMono-Regular,'JetBrains Mono',Menlo,Consolas,monospace";
const W = 900, H = 500, CW = 268, CY = 104, CH = 300, LY = 424;
const X = [18, 316, 614];
export const STORY_T = 19; // one loop, seconds
const A = [1.0, 6.2, 11.4]; // when each card becomes active

type KF = [t: number, v: string | number];
const f = (v: number): string => String(Math.round(v * 1000) / 1000);

/** Drawing and SMIL helpers for one screen; with `motion` false every helper draws the finished frame and no animation. */
function kit(motion: boolean, T: number) {
  const kt = (ts: number[]): string => ts.map((x) => f(Math.min(1, Math.max(0, x / T)))).join(';');
  /** Keyframes held flat between, looped over T. */
  const norm = (kfs: KF[]): [number[], string[]] => {
    const k: KF[] = [[0, kfs[0]![1]], ...kfs.filter(([t]) => t > 0)];
    if (k.at(-1)![0] < T) k.push([T, k.at(-1)![1]]);
    const ts: number[] = [], vs: string[] = [];
    for (const [t, v] of k) { ts.push(ts.length ? Math.max(t, ts.at(-1)! + 0.001) : 0); vs.push(String(v)); }
    ts[ts.length - 1] = T;
    return [ts, vs];
  };
  const anim = (attr: string, kfs: KF[]): string => {
    if (!motion) return '';
    const [ts, vs] = norm(kfs);
    return `<animate attributeName="${attr}" dur="${f(T)}s" repeatCount="indefinite" calcMode="linear" values="${vs.join(';')}" keyTimes="${kt(ts)}"/>`;
  };
  const move = (kfs: KF[]): string => {
    if (!motion) return '';
    const [ts, vs] = norm([[0, kfs[0]![1]], ...kfs]);
    return `<animateTransform attributeName="transform" type="translate" dur="${f(T)}s" repeatCount="indefinite" values="${vs.join(';')}" keyTimes="${kt(ts)}"/>`;
  };
  const appear = (t: number, fade = 0.35, base = 0): string => anim('opacity', [[0, base], [t, base], [t + fade, 1], [T - 0.6, 1], [T - 0.1, base]]);
  /** A group that fades in at `t` (always visible in the frozen frame). */
  const g = (inner: string, t?: number, fade = 0.35, base = 0): string => (t === undefined || !motion ? `<g>${inner}</g>` : `<g opacity="${base}">${inner}${appear(t, fade, base)}</g>`);
  const tx = (x: number, y: number, s: string, size = 12, fill = C.ink, w = 400, anchor = 'start', fam = SANS, extra = ''): string =>
    `<text x="${f(x)}" y="${f(y)}" font-size="${size}" font-weight="${w}" fill="${fill}" text-anchor="${anchor}" font-family="${fam}" ${extra}>${s}</text>`;
  const circ = (x: number, y: number, r: number, fill: string, stroke?: string, dash = false, op = 0.85, inner = ''): string =>
    `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${fill}" fill-opacity="${op}"${stroke ? ` stroke="${stroke}" stroke-width="1.5"` : ''}${dash ? ' stroke-dasharray="3 3"' : ''}>${inner}</circle>`;
  const ln = (x1: number, y1: number, x2: number, y2: number, c = C.line, w = 1.5, dash = false): string =>
    `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${c}" stroke-width="${w}"${dash ? ' stroke-dasharray="3 3"' : ''}/>`;
  const chip = (x: number, y: number, s: string, c: string, wd = s.length * 7 + 16): string =>
    `<rect x="${f(x - wd / 2)}" y="${f(y - 11)}" width="${f(wd)}" height="20" rx="10" fill="${c}" fill-opacity=".14" stroke="${c}" stroke-opacity=".6"/>` + tx(x, y + 3, s, 11, c, 600, 'middle');
  const known = (x: number, y: number, r: number, c: string, inner = ''): string => circ(x, y, r, c, c, false, 0.85, inner);
  const grey = (x: number, y: number, r: number): string => circ(x, y, r, C.node, C.line, false, 1);
  const arrow = (x: number, y: number, c: string): string => `<path d="M${f(x)} ${f(y - 4)}l6 4l-6 4z" fill="${c}"/>`;

  return { kt, anim, move, appear, g, tx, circ, ln, chip, known, grey, arrow };
}

/** Builds one row screen; `motion` false gives the frozen, finished frame. */
function screen(s: Screen, motion: boolean): string {
  const T = STORY_T;
  const { anim, move, appear, g, tx, circ, ln, chip, known, grey, arrow } = kit(motion, T);
  // ------------------------------------------------ pictures: (card centre x, top y, start time)
  const pictures: Record<string, (cx: number, y: number, a: number) => string> = {
    view(cx, y, a) {
      const o: string[] = [];
      const x0 = cx - 116;
      const tags = [['goal', 'depth', 'where'], ['concerns', 'decisions'], ['why', 'area', 'stage', '+3']];
      const cols = [C.blue, C.blue, C.green];
      let k = 0;
      tags.forEach((row, r) => {
        let xx = x0;
        for (const tg of row) {
          const w = tg.length * 6.6 + 12;
          o.push(g(`<rect x="${f(xx)}" y="${f(y + 4 + r * 22)}" width="${f(w)}" height="17" rx="4" fill="${cols[r]}" fill-opacity=".12" stroke="${cols[r]}" stroke-opacity=".55"/>` + tx(xx + w / 2, y + 16.5 + r * 22, tg, 10.5, cols[r]!, 600, 'middle', MONO), a + 0.2 + k * 0.12, 0.25));
          xx += w + 5;
          k++;
        }
      });
      o.push(g(`<path d="M${f(cx + 44)} ${f(y + 37)}h8" stroke="${C.dim}" stroke-width="1.5"/>` + arrow(cx + 52, y + 37, C.dim), a + 1.5));
      const grid = ['ggr-', 'gagg', 'rg-a', 'ggg-'];
      const hue: Record<string, string> = { g: C.green, r: C.red, a: C.amber };
      const gx = cx + 58, cs = 15;
      let n = 0;
      grid.forEach((row, i) => [...row].forEach((c, j) => {
        const xx = gx + j * (cs + 3), yy = y + 2 + i * (cs + 4);
        const cell = c === '-'
          ? `<rect x="${f(xx)}" y="${f(yy)}" width="${cs}" height="${cs}" rx="3" fill="none" stroke="${C.dim}" stroke-dasharray="3 2"/>`
          : `<rect x="${f(xx)}" y="${f(yy)}" width="${cs}" height="${cs}" rx="3" fill="${hue[c]}" fill-opacity=".8"/>`;
        o.push(g(cell, a + 1.8 + n++ * 0.06, 0.12));
      }));
      o.push(g(tx(x0, y + 96, 'every field, every run', 10.5, C.dim) + tx(cx + 120, y + 96, 'place × concern', 10.5, C.dim, 400, 'end'), a + 0.2));
      return o.join('');
    },
    class(cx, y, a) {
      const o: string[] = [];
      const claim: [number, number] = [cx - 96, y + 50];
      const rows = [y + 16, y + 50, y + 84];
      const dots = [[C.green, C.green, C.green], [C.green, C.red, C.red], [C.green, C.green, C.green]];
      const v: [number, number] = [cx + 92, y + 50];
      o.push(g(circ(...claim, 10, C.node, C.white, false, 1) + tx(claim[0], y + 80, 'claim', 10.5, C.dim, 400, 'middle'), a + 0.2));
      rows.forEach((ry, i) => {
        o.push(g(ln(...claim, cx - 40, ry) + known(cx - 40, ry, 6, C.blue), a + 0.6 + i * 0.2));
        for (let j = 0; j < 3; j++) o.push(g(known(cx - 14 + j * 14, ry, 4, dots[i]![j]!), a + 1.3 + i * 0.25 + j * 0.1, 0.2));
        o.push(g(ln(cx + 32, ry, v[0] - 30, v[1]), a + 2.4));
      });
      o.push(g(chip(...v, 'verdict', C.blue, 56), a + 2.7));
      o.push(g(tx(cx, y + 106, '3 angles each', 10.5, C.dim, 400, 'middle'), a + 1.3));
      return o.join('');
    },
    replay(cx, y, a) {
      const o: string[] = [];
      const b: [number, number] = [cx - 80, y + 34], af: [number, number] = [cx + 80, y + 34];
      let ruler = `<rect x="${f(cx - 52)}" y="${f(y + 26)}" width="104" height="16" rx="3" fill="${C.card}" stroke="${C.dim}"/>`;
      for (let i = 1; i < 13; i++) ruler += ln(cx - 52 + i * 8, y + 26, cx - 52 + i * 8, y + (i % 3 ? 33 : 37), C.dim, 1);
      o.push(g(motion ? `<g>${ruler}${move([[a + 0.8, '-70 0'], [a + 1.6, '0 0'], [a + 2.4, '70 0'], [a + 2.8, '0 0']])}</g>` : ruler, a + 0.3));
      o.push(g(known(...b, 11, C.red) + tx(b[0], y + 66, 'before', 11, C.dim, 400, 'middle'), a + 0.3));
      const flip = motion ? `<animate attributeName="fill" dur="${f(T)}s" repeatCount="indefinite" calcMode="discrete" values="${C.red};${C.green};${C.green}" keyTimes="0;${f((a + 2.4) / T)};1"/>` : '';
      o.push(g(circ(...af, 11, C.green, C.dim, false, 0.85, flip) + tx(af[0], y + 66, 'after', 11, C.dim, 400, 'middle'), a + 0.3));
      o.push(g(chip(cx - 78, y + 90, 'fixed', C.green), a + 2.9), g(chip(cx, y + 90, 'still', C.amber), a + 3.1), g(chip(cx + 84, y + 90, 'regressed', C.red), a + 3.3));
      return o.join('');
    },
    scan(cx, y, a) {
      const o: string[] = [];
      const R: [number, number] = [cx, y + 12];
      const files: [number, number, string][] = [[-110, 6, C.green], [-82, 5, C.green], [-54, 11, C.red], [-24, 4, C.green], [6, 8, C.amber], [36, 5, C.green], [66, 12, C.red], [96, 6, C.amber], [118, 4, C.green]];
      o.push(g(files.map(([dx]) => ln(...R, cx + dx, y + 62, C.line, 1)).join('') + grey(...R, 9), a + 0.2));
      files.forEach(([dx, r, c], i) => {
        o.push(g(grey(cx + dx, y + 62, r), a + 0.3));
        o.push(g(known(cx + dx, y + 62, r, c), a + 0.9 + i * 0.22, 0.15));
      });
      if (motion) o.push(`<rect x="${f(cx - 122)}" y="${f(y + 44)}" width="3" height="36" rx="1.5" fill="${C.green}" opacity="0">${anim('opacity', [[a + 0.8, 0], [a + 0.85, 0.9], [a + 2.95, 0.9], [a + 3.1, 0]])}${move([[a + 0.8, '0 0'], [a + 2.9, '246 0']])}</rect>`);
      [...files].sort((p, q) => q[1] - p[1]).slice(0, 3).forEach(([dx, r], i) => o.push(g(tx(cx + dx, y + 62 - r - 6, String(i + 1), 11, C.white, 700, 'middle'), a + 3.2 + i * 0.2)));
      o.push(g(tx(cx, y + 98, 'same questions, every file', 10.5, C.dim, 400, 'middle'), a + 0.2));
      return o.join('');
    },
    drill(cx, y, a) {
      const o: string[] = [];
      const p: [number, number] = [cx - 92, y + 50];
      const kids: [number, number][] = [[cx - 20, y + 18], [cx - 20, y + 50], [cx - 20, y + 82]];
      const pill: [number, number] = [cx + 72, y + 50];
      const pulse = motion ? `<animate attributeName="r" dur="${f(T)}s" repeatCount="indefinite" values="13;13;16;13;16;13;13" keyTimes="0;${[0.4, 0.7, 1.0, 1.3, 1.6].map((d) => f((a + d) / T)).join(';')};1"/>` : '';
      o.push(g(known(...p, 13, C.red, pulse) + tx(p[0], y + 86, 'flag', 10.5, C.dim, 400, 'middle'), a + 0.2));
      kids.forEach((k, i) => o.push(g(ln(...p, ...k) + known(...k, i === 1 ? 7 : 6, [C.green, C.red, C.amber][i]!), a + 1.6 + i * 0.2)));
      o.push(g(ln(...kids[1]!, pill[0] - 40, pill[1], C.red, 1.5), a + 2.4));
      o.push(g(`<rect x="${f(pill[0] - 40)}" y="${f(pill[1] - 12)}" width="80" height="24" rx="5" fill="${C.card}" stroke="${C.red}"/>` + tx(pill[0], pill[1] + 4, 'fix target', 11.5, C.white, 600, 'middle', MONO), a + 2.7));
      o.push(g(tx(pill[0], y + 86, '→ class · replay', 10.5, C.dim, 400, 'middle'), a + 3.2));
      return o.join('');
    },
    loop(cx, y, a) {
      const o: string[] = [];
      ([['design', C.green], ['parts', C.green], ['stories', C.red]] as const).forEach(([name, c], i) => {
        const yy = y + 4 + i * 32;
        o.push(g(`<rect x="${f(cx - 96)}" y="${f(yy)}" width="130" height="24" rx="6" fill="none" stroke="${C.dim}" stroke-dasharray="4 3"/>` + tx(cx - 84, yy + 16, name, 11.5, C.ink), a + 0.3 + i * 0.3));
        o.push(g(known(cx + 20, yy + 12, 5, c), a + 1.5 + i * 0.45, 0.2));
      });
      o.push(g(ln(cx + 34, y + 80, cx + 70, y + 80, C.red, 1.5) + arrow(cx + 70, y + 80, C.red) + tx(cx + 82, y + 84, 'drill', 11.5, C.red, 600), a + 3.0));
      o.push(g(tx(cx - 31, y + 112, 'no code yet', 11, C.dim, 400, 'middle'), a + 0.3));
      return o.join('');
    },
  };

  const acc = s.accent;
  const o: string[] = [
    `<rect width="${W}" height="${H}" rx="14" fill="${C.bg}"/>`,
    tx(18, 34, `MM<tspan fill="${C.green}">3</tspan>`, 17, C.white, 700),
    tx(W - 18, 34, s.side, 13, acc, 700, 'end'),
    ln(0, 52, W, 52, C.line, 1),
    g(tx(18, 84, s.sub, 15, C.white, 600), 0.2, 0.5),
  ];
  s.cards.forEach((cd, i) => {
    const x = X[i]!, cx = x + CW / 2, a = A[i]!;
    const body = `<rect x="${x}" y="${CY}" width="${CW}" height="${CH}" rx="10" fill="${C.card}" stroke="${C.line}"/>` +
      tx(x + 18, CY + 28, cd.col, 11, C.dim, 700, 'start', SANS, 'letter-spacing="1.8"') + tx(x + 18, CY + 62, cd.verb, 26, acc, 700, 'start', MONO) +
      `<rect x="${x + 8}" y="${CY}" width="${CW - 16}" height="3" rx="1.5" fill="${acc}"/>`;
    o.push(motion ? `<g opacity=".3">${body}${appear(a, 0.4, 0.3)}</g>` : `<g>${body}</g>`);
    if (motion) o.push(`<rect x="${x}" y="${CY}" width="${CW}" height="${CH}" rx="10" fill="none" stroke="${acc}" stroke-width="1.5" opacity="0">${anim('opacity', [[a, 0], [a + 0.3, 0.9], [a + 4.6, 0.9], [a + 5.0, 0]])}</rect>`);
    o.push(pictures[cd.verb]!(cx, CY + 96, a));
    o.push(g(tx(x + 18, CY + 238, cd.head, 15, C.white, 700) + tx(x + 18, CY + 260, cd.lines[0], 12.5) + tx(x + 18, CY + 278, cd.lines[1], 12.5), a + 3.4, 0.5));
    if (motion) o.push(`<circle cx="${f(cx)}" cy="${CY + CH}" r="4" fill="${acc}" opacity="0">${anim('opacity', [[a + 3.9, 0], [a + 3.95, 1], [a + 4.5, 1], [a + 4.6, 0]])}${move([[a + 3.9, '0 0'], [a + 4.5, '0 20']])}</circle>`);
  });
  for (let i = 0; i < 2; i++) {
    const gx = X[i]! + CW + 15;
    o.push(g(`<path d="M${gx - 5} ${CY + 140}l8 8l-8 8" fill="none" stroke="${C.dim}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`, A[i + 1]! - 0.4));
  }
  o.push(`<rect x="18" y="${LY}" width="${W - 36}" height="52" rx="10" fill="${C.panel}" stroke="${C.line}"/>`);
  s.record.forEach(([top, sub], i) => {
    const cx = X[i]! + CW / 2;
    o.push(ln(cx, CY + CH, cx, LY, acc, 1.5, true) + circ(cx, LY, 3.5, acc, undefined, false, 1));
    o.push(g(tx(cx, LY + 22, top, 12, C.white, 600, 'middle') + tx(cx, LY + 39, sub, 11.5, C.dim, 400, 'middle'), A[i]! + 4.4, 0.3));
  });
  if (motion) o.push(`<rect width="${W}" height="${H}" rx="14" fill="${C.bg}" opacity="0">${anim('opacity', [[0, 1], [0.5, 0], [T - 0.5, 0], [T, 1]])}</rect>`);
  return o.join('\n');
}

export const LEDGER_T = 29; // the ledger screen's loop, seconds
const LH = 634; // the ledger screen is taller: its bottom panel explains the open mdl: block
/** The ledger screen: one append-only JSONL card ("so what?"), then what about 10, 20 and 50 runs give you, then the
 *  one-line extension and the payoff. Pictures are illustrative shapes, not a real repo's data. */
function ledgerScreen(motion: boolean): string {
  const T = LEDGER_T;
  const { anim, g, tx, circ, ln, known, arrow } = kit(motion, T);
  const w0 = 184, cw = 214, xs = [18, 214, 440, 666];
  const a = [0.8, 4.2, 8.8, 13.4], ext = 18.2, read = 20.4, pay = 22.4;
  const o: string[] = [
    `<rect width="${W}" height="${LH}" rx="14" fill="${C.bg}"/>`,
    tx(18, 34, `MM<tspan fill="${C.green}">3</tspan>`, 17, C.white, 700),
    tx(W - 18, 34, 'the ledger · our favorite part', 13, C.white, 700, 'end'),
    ln(0, 52, W, 52, C.line, 1),
    g(tx(18, 84, 'One append-only JSONL file, filled by runs you were making anyway.', 15, C.white, 600), 0.2, 0.5),
  ];
  const cardBox = (x: number, w: number, t: number, acc: string): string => {
    const body = `<rect x="${x}" y="${CY}" width="${w}" height="${CH}" rx="10" fill="${C.card}" stroke="${C.line}"/><rect x="${x + 8}" y="${CY}" width="${w - 16}" height="3" rx="1.5" fill="${acc}"/>`;
    const glow = motion ? `<rect x="${x}" y="${CY}" width="${w}" height="${CH}" rx="10" fill="none" stroke="${acc}" stroke-width="1.5" opacity="0">${anim('opacity', [[t, 0], [t + 0.3, 0.9], [t + 4.2, 0.9], [t + 4.6, 0]])}</rect>` : '';
    return (motion ? `<g opacity=".3">${body}${anim('opacity', [[0, 0.3], [t, 0.3], [t + 0.4, 1], [T - 0.6, 1], [T - 0.1, 0.3]])}</g>` : `<g>${body}</g>`) + glow;
  };
  // ---- card 0: the file
  {
    const x = xs[0]!, t = a[0]!;
    o.push(cardBox(x, w0, t, C.blue));
    o.push(tx(x + 16, CY + 28, 'APPEND-ONLY', 11, C.dim, 700, 'start', SANS, 'letter-spacing="1.8"'), tx(x + 16, CY + 60, 'log.jsonl', 20, C.blue, 700, 'start', MONO));
    const rows = [['0001', 'view'], ['0002', 'class'], ['0003', 'class'], ['0004', 'replay'], ['0005', 'scan'], ['0006', 'drill'], ['0007', 'class'], ['0008', 'loop'], ['0009', 'scan']];
    const when = [t + 0.3, t + 0.6, t + 0.9, t + 1.2, t + 1.5, a[2]! - 0.2, a[2]!, a[3]! - 0.2, a[3]!];
    rows.forEach(([id, verb], i) => o.push(g(tx(x + 16, CY + 90 + i * 14, `{"id":"MM3-${id}","verb":"${verb}"}`, 8, i % 2 ? C.dim : C.ink, 400, 'start', MONO), when[i], 0.2)));
    const counts: [string, number, number][] = [['10 runs', a[1]!, a[2]!], ['20 runs', a[2]!, a[3]!], ['50 runs', a[3]!, T]];
    if (motion) for (const [label, from, to] of counts) o.push(`<g opacity="0">${tx(x + 16, CY + 240, label, 20, C.white, 700)}${anim('opacity', [[from, 0], [from + 0.2, 1], [Math.min(to, T - 0.6), 1], [Math.min(to, T - 0.6) + 0.2, 0]])}</g>`);
    else o.push(tx(x + 16, CY + 240, '50 runs', 20, C.white, 700));
    o.push(g(tx(x + 16, CY + 264, 'One line per run.', 12.5) + tx(x + 16, CY + 282, 'So what?', 12.5, C.dim, 400, 'start', SANS, 'font-style="italic"'), t + 1.8, 0.4));
  }
  // ---- cards 1-3: what the lines become
  const steps: [string, string, string][] = [['10 runs', 'A layered heat map', 'of your architecture'], ['20 runs', 'Reference architecture', 'with a heat map on every box'], ['50 runs', 'A knowledge graph', 'of your whole system']];
  const box = (x: number, y: number, w: number, h: number, label: string, heat: string | null, dash = false): string =>
    `<rect x="${f(x)}" y="${f(y)}" width="${w}" height="${h}" rx="5" fill="${heat ?? 'none'}" fill-opacity="${heat ? 0.28 : 0}" stroke="${heat ?? C.dim}" stroke-opacity="${heat ? 0.8 : 1}"${dash ? ' stroke-dasharray="4 3"' : ''}/>` + tx(x + w / 2, y + h / 2 + 3.5, label, 10, C.ink, 600, 'middle');
  steps.forEach(([count, head, line], k) => {
    const x = xs[k + 1]!, t = a[k + 1]!, cx = x + cw / 2, y0 = CY + 80;
    o.push(cardBox(x, cw, t, C.green));
    o.push(tx(x + 16, CY + 46, count, 22, C.green, 700, 'start', MONO));
    const p: string[] = [];
    if (k === 0) {
      const bands: [string, string[]][] = [['ui', [C.green, C.green, C.amber]], ['api', [C.green, C.red, C.green, C.amber]], ['data', [C.green, C.red]]];
      bands.forEach(([name, hues], i) => {
        const by = y0 + 4 + i * 42;
        p.push(g(`<rect x="${f(cx - 92)}" y="${f(by)}" width="184" height="34" rx="6" fill="none" stroke="${C.dim}" stroke-dasharray="4 3"/>` + tx(cx - 84, by + 21, name, 10, C.dim, 600, 'start', MONO), t + 0.3 + i * 0.25));
        hues.forEach((h, j) => p.push(g(`<rect x="${f(cx - 50 + j * 34)}" y="${f(by + 8)}" width="28" height="18" rx="3" fill="${h}" fill-opacity=".75"/>`, t + 1.0 + i * 0.35 + j * 0.12, 0.2)));
      });
    } else if (k === 1) {
      const person = `<circle cx="${f(cx - 78)}" cy="${f(y0 + 10)}" r="6" fill="none" stroke="${C.ink}" stroke-width="1.5"/><path d="M${f(cx - 88)} ${f(y0 + 30)}a10 9 0 0 1 20 0" fill="none" stroke="${C.ink}" stroke-width="1.5"/>`;
      p.push(g(person + tx(cx - 78, y0 + 44, 'user', 10, C.dim, 400, 'middle'), t + 0.3));
      p.push(g(ln(cx - 64, y0 + 18, cx - 34, y0 + 16, C.dim) + arrow(cx - 34, y0 + 16, C.dim), t + 0.6));
      p.push(g(box(cx - 30, y0 + 3, 76, 26, 'web app', C.amber), t + 0.8));
      p.push(g(box(cx + 56, y0 + 3, 44, 26, 'quotes', null, true), t + 1.0));
      p.push(g(ln(cx + 8, y0 + 29, cx + 8, y0 + 49, C.dim) + ln(cx + 46, y0 + 16, cx + 56, y0 + 16, C.dim), t + 1.2));
      p.push(g(box(cx - 30, y0 + 49, 76, 26, 'api', C.red), t + 1.4));
      p.push(g(ln(cx + 46, y0 + 62, cx + 56, y0 + 62, C.dim) + box(cx + 56, y0 + 49, 44, 26, 'queue', C.green), t + 1.7));
      const db = `<path d="M${f(cx - 30)} ${f(y0 + 101)}v18a38 6 0 0 0 76 0v-18" fill="${C.green}" fill-opacity=".28" stroke="${C.green}" stroke-opacity=".8"/><ellipse cx="${f(cx + 8)}" cy="${f(y0 + 101)}" rx="38" ry="6" fill="${C.card}" stroke="${C.green}" stroke-opacity=".8"/>` + tx(cx + 8, y0 + 120, 'db', 10, C.ink, 600, 'middle');
      p.push(g(ln(cx + 8, y0 + 75, cx + 8, y0 + 95, C.dim) + db, t + 2.0));
    } else {
      const nodes: [number, number, number, string][] = [[-78, 18, 6, C.green], [-40, 6, 4, C.green], [-6, 26, 7, C.red], [30, 8, 5, C.green], [70, 22, 6, C.amber], [-88, 58, 4, C.green], [-52, 46, 5, C.amber], [-18, 66, 5, C.green], [18, 50, 8, C.red], [56, 62, 4, C.green], [86, 52, 5, C.green], [-70, 96, 5, C.red], [-34, 88, 4, C.green], [2, 104, 6, C.green], [40, 92, 5, C.amber], [76, 100, 4, C.green], [-8, 42, 3, C.green], [52, 38, 3, C.green]];
      const edges = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 2], [2, 16], [16, 8], [8, 3], [8, 17], [17, 4], [4, 10], [8, 9], [9, 10], [6, 7], [7, 8], [5, 11], [11, 12], [12, 7], [12, 13], [13, 14], [14, 8], [14, 15], [15, 10], [7, 13]];
      edges.forEach(([i, j], e) => { const [ax, ay] = nodes[i!]!, [bx, by] = nodes[j!]!; p.push(g(ln(cx + ax, y0 + ay, cx + bx, y0 + by, C.dim, 1).replace('/>', ' stroke-opacity=".55"/>'), t + 0.3 + e * 0.07, 0.25)); });
      nodes.forEach(([nx, ny, r, c], i) => p.push(g(known(cx + nx, y0 + ny, r, c), t + 0.4 + i * 0.1, 0.2)));
    }
    o.push(p.join(''));
    o.push(g(tx(x + 16, CY + 262, head, 14, C.white, 700) + tx(x + 16, CY + 282, line, 12), t + 2.6, 0.5));
  });
  for (let i = 0; i < 3; i++) {
    const gx = (i === 0 ? xs[0]! + w0 : xs[i]! + cw) + 6;
    o.push(g(`<path d="M${gx - 3} ${CY + 140}l6 6l-6 6" fill="none" stroke="${C.dim}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`, a[i + 1]! - 0.4));
  }
  // ---- the open mdl: block: add any field, then read it all back as pictures
  const py = LY, ph = 190;
  o.push(`<rect x="18" y="${py}" width="${W - 36}" height="${ph}" rx="10" fill="${C.panel}" stroke="${C.line}"/>`);
  o.push(g(tx(34, py + 28, 'The mdl: block is yours.', 15, C.white, 700) + tx(34, py + 48, 'Add any field to any request. It’s free: you were classifying anyway.', 12.5, C.ink), ext, 0.5));
  const chipAt = (x: number, y: number, label: string, c: string, dash: boolean): [string, number] => {
    const w = label.length * 7 + 14;
    return [`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="20" rx="5" fill="${dash ? 'none' : c}" fill-opacity=".12" stroke="${c}" stroke-opacity="${dash ? 1 : 0.55}"${dash ? ' stroke-dasharray="4 3"' : ''}/>` + tx(x + w / 2, y + 14, label, 11, c, 600, 'middle', MONO), w];
  };
  let cx0 = 34;
  ['why', 'area', 'stage', 'problem', 'uses', 'touches', 'blast'].forEach((k, i) => { const [el, w] = chipAt(cx0, py + 62, k, C.green, false); o.push(g(el, ext + 0.3 + i * 0.08, 0.2)); cx0 += w + 6; });
  ['+ standard', '+ owner', '+ your field'].forEach((k, i) => { const [el, w] = chipAt(cx0, py + 62, k, C.amber, true); o.push(g(el, ext + 1.2 + i * 0.35, 0.25)); cx0 += w + 6; });
  // the read-back: ledger or index -> your agent -> pictures
  const ry = py + 104;
  const pill = (x: number, label: string, c: string): [string, number] => {
    const w = label.length * 7 + 18;
    return [`<rect x="${f(x)}" y="${f(ry)}" width="${f(w)}" height="24" rx="6" fill="${C.card}" stroke="${c}"/>` + tx(x + w / 2, ry + 16, label, 11.5, C.ink, 600, 'middle', MONO), w];
  };
  const [lg, lw] = pill(34, 'log.jsonl', C.blue);
  const [ix, iw] = pill(34 + lw + 30, 'SQLite index', C.blue);
  const ax = 34 + lw + 30 + iw + 12;
  const [ag, aw] = pill(ax + 30, 'your agent', C.green);
  const icons = ax + 30 + aw + 34;
  const bars = [14, 22, 9, 18].map((h, i) => `<rect x="${f(icons + i * 8)}" y="${f(ry + 24 - h)}" width="6" height="${h}" rx="1" fill="${[C.green, C.red, C.green, C.amber][i]}" fill-opacity=".8"/>`).join('');
  const heat = [...'grgagggr'].map((c, i) => `<rect x="${f(icons + 52 + (i % 4) * 8)}" y="${f(ry + 4 + Math.floor(i / 4) * 9)}" width="7" height="7" rx="1" fill="${c === 'g' ? C.green : c === 'r' ? C.red : C.amber}" fill-opacity=".8"/>`).join('');
  const gpts: [number, number, string][] = [[0, 16, C.green], [12, 4, C.red], [24, 18, C.green], [36, 6, C.amber], [30, 26, C.green]];
  const graph = [[0, 1], [1, 2], [2, 3], [2, 4], [1, 3]].map(([i, j]) => ln(icons + 104 + gpts[i!]![0], ry + gpts[i!]![1], icons + 104 + gpts[j!]![0], ry + gpts[j!]![1], C.dim, 1)).join('') + gpts.map(([x, y, c]) => known(icons + 104 + x, ry + y, 3.5, c)).join('');
  o.push(g(lg + tx(34 + lw + 15, ry + 16, 'or', 11.5, C.dim, 400, 'middle') + ix + tx(34 + lw + 30 + iw / 2, ry + 40, 'milliseconds', 10, C.dim, 400, 'middle'), read, 0.4));
  o.push(g(ln(ax, ry + 12, ax + 22, ry + 12, C.dim) + arrow(ax + 22, ry + 12, C.dim) + ag, read + 0.5, 0.4));
  o.push(g(ln(ax + 30 + aw + 6, ry + 12, ax + 30 + aw + 26, ry + 12, C.dim) + arrow(ax + 30 + aw + 26, ry + 12, C.dim) + bars + heat + graph + tx(icons + 150, ry + 16, 'charts, maps, graphs', 11.5, C.dim), read + 1.0, 0.4));
  o.push(g(tx(34, py + 172, 'Where your agents are strong, and where they’re not.', 15, C.white, 700), pay, 0.6));
  if (motion) o.push(`<rect width="${W}" height="${LH}" rx="14" fill="${C.bg}" opacity="0">${anim('opacity', [[0, 1], [0.5, 0], [T - 0.5, 0], [T, 1]])}</rect>`);
  void circ;
  return o.join('\n');
}

type Card = { col: string; verb: string; head: string; lines: [string, string] };
type Screen = { side: string; sub: string; accent: string; cards: [Card, Card, Card]; record: [string, string][]; title: string; aria: string };

export const SCREENS: Record<'mak' | 'mdl', Screen> = {
  mak: {
    side: 'MAK³ · make · use what is proven', sub: 'Use what is proven.', accent: C.blue,
    cards: [
      { col: 'KNOW', verb: 'view', head: 'Your codebase’s memory', lines: ['Every past check, searchable', 'in milliseconds, free.'] },
      { col: 'JUDGE', verb: 'class', head: 'A question set you can cite', lines: ['Turns “is this OK?” into something', 'you can measure and reuse.'] },
      { col: 'PROVE', verb: 'replay', head: 'Tests for your judgments', lines: ['Rerun any past check', 'on any two commits.'] },
    ],
    record: [['knows the past', 'free'], ['leaves a question set', 'the next move reuses'], ['proves the change', 'one call']],
    title: 'MM3 make: view, class, replay',
    aria: 'MAK3 make. view: your codebase memory, every past check searchable in milliseconds, free. class: turns is this OK into a question set you can measure, reuse and cite. replay: tests for your judgments, rerun any past check on any two commits.',
  },
  mdl: {
    side: 'MDL³ · model · learn what is missing', sub: 'Learn what is missing.', accent: C.green,
    cards: [
      { col: 'KNOW', verb: 'scan', head: 'A census of the present', lines: ['Same questions, every file,', 'comparable answers.'] },
      { col: 'JUDGE', verb: 'drill', head: 'From flag to fix target', lines: ['Narrows a flag, then hands it', 'back to class and replay.'] },
      { col: 'PROVE', verb: 'loop', head: 'Prove the design first', lines: ['Checks the plan before', 'a line of code exists.'] },
    ],
    record: [['knows the present', 'one sweep'], ['finds the target', 'from the record'], ['proves the future', 'before the code']],
    title: 'MM3 model: scan, drill, loop',
    aria: 'MDL3 model. scan: a census of the present, same questions every file, comparable answers. drill: turns a flag into a fix target and hands it back to class and replay. loop: proves the design before a line of code exists.',
  },
};

/** One story screen as a complete SVG: the frozen finished frame for reduced motion, the animated loop for everyone else. */
export const LEDGER_ARIA = 'The MM3 ledger. One append-only JSONL file, filled by runs you were making anyway. The same 10 runs give you a layered heat map of your architecture; 20, a reference architecture with a heat map; 50, a knowledge graph of your whole system. The mdl block is yours: add any field to any request, such as standard or owner, for free. Your agent reads the log or the SQLite index in milliseconds and paints charts, maps and graphs. Where your agents are strong, and where they are not.';

/** One story screen as a complete SVG: the frozen finished frame for reduced motion, the animated loop for everyone else. */
export function buildStory(which: 'mak' | 'mdl' | 'ledger'): string {
  const h = which === 'ledger' ? LH : H;
  const [aria, title, body] = which === 'ledger'
    ? [LEDGER_ARIA, 'MM3 ledger', (m: boolean): string => ledgerScreen(m)]
    : [SCREENS[which].aria, SCREENS[which].title, (m: boolean): string => screen(SCREENS[which], m)];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" role="img" aria-label="${aria}"><title>${title}</title>`,
    '<style>.still{display:none}@media (prefers-reduced-motion:reduce){.motion{display:none}.still{display:inline}}</style>',
    `<g class="still">${body(false)}</g>`,
    `<g class="motion">${body(true)}</g>`,
    `<rect x=".5" y=".5" width="${W - 1}" height="${h - 1}" rx="14" fill="none" stroke="${C.line}"/></svg>`,
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const w of ['mak', 'mdl', 'ledger'] as const) writeFileSync(`docs/assets/story-${w}.svg`, buildStory(w) + '\n');
  console.log(`story: docs/assets/story-{mak,mdl,ledger}.svg (loops ${STORY_T} s, ${LEDGER_T} s)`);
}
