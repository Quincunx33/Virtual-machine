export interface TerminalStyle {
  fg: string | null;
  bg: string | null;
  bold: boolean;
  dim: boolean;
}

export interface TerminalSpan {
  text: string;
  fg: string | null;
  bg: string | null;
  bold: boolean;
  dim: boolean;
}

export interface TerminalLine {
  cells: Array<{ char: string; style: TerminalStyle }>;
}

const ANSI_FG_COLORS: Record<number, string> = {
  30: '#2E1E21',
  31: '#F87171',
  32: '#4ADE80',
  33: '#FACC15',
  34: '#60A5FA',
  35: '#F472B6',
  36: '#22D3EE',
  37: '#F9ECEE',
  90: '#8F6F74',
  91: '#FCA5A5',
  92: '#86EFAC',
  93: '#FDE047',
  94: '#93C5FD',
  95: '#F9A8D4',
  96: '#67E8F9',
  97: '#FFFFFF',
};

const ANSI_BG_COLORS: Record<number, string> = {
  40: '#180D0F',
  41: '#7F1D1D',
  42: '#14532D',
  43: '#713F12',
  44: '#1E3A8A',
  45: '#831843',
  46: '#164E63',
  47: '#E5D3D5',
  100: '#3D2428',
  101: '#B91C1C',
  102: '#15803D',
  103: '#A16207',
  104: '#1D4ED8',
  105: '#BE185D',
  106: '#0E7490',
  107: '#FFF8F8',
};

function cloneStyle(s: TerminalStyle): TerminalStyle {
  return { fg: s.fg, bg: s.bg, bold: s.bold, dim: s.dim };
}

function stylesEqual(a: TerminalStyle, b: TerminalStyle): boolean {
  return a.fg === b.fg && a.bg === b.bg && a.bold === b.bold && a.dim === b.dim;
}

export class SerialTerminalBuffer {
  public lines: TerminalLine[] = [{ cells: [] }];
  public cursorRow = 0;
  public cursorCol = 0;
  public readonly maxLines: number;
  private style: TerminalStyle = { fg: null, bg: null, bold: false, dim: false };
  private escState: 'none' | 'esc' | 'csi' | 'osc' = 'none';
  private escBuffer = '';

  constructor(maxLines = 800) {
    this.maxLines = Math.max(50, maxLines);
  }

  clear(): void {
    this.lines = [{ cells: [] }];
    this.cursorRow = 0;
    this.cursorCol = 0;
    this.escState = 'none';
    this.escBuffer = '';
  }

  write(chunk: string): void {
    for (let i = 0; i < chunk.length; i++) {
      this.writeChar(chunk[i]);
    }
  }

  private ensureLine(row: number): TerminalLine {
    while (this.lines.length <= row) {
      this.lines.push({ cells: [] });
    }
    while (this.lines.length > this.maxLines) {
      this.lines.shift();
      this.cursorRow = Math.max(0, this.cursorRow - 1);
      row = Math.max(0, row - 1);
    }
    return this.lines[Math.min(row, this.lines.length - 1)];
  }

  private putChar(ch: string): void {
    const line = this.ensureLine(this.cursorRow);
    while (line.cells.length < this.cursorCol) {
      line.cells.push({ char: ' ', style: { fg: null, bg: null, bold: false, dim: false } });
    }
    line.cells[this.cursorCol] = { char: ch, style: cloneStyle(this.style) };
    this.cursorCol++;
  }

  private writeChar(ch: string): void {
    const code = ch.charCodeAt(0);

    if (this.escState === 'esc') {
      if (ch === '[') {
        this.escState = 'csi';
        this.escBuffer = '';
      } else if (ch === ']') {
        this.escState = 'osc';
        this.escBuffer = '';
      } else {
        this.escState = 'none';
      }
      return;
    }

    if (this.escState === 'osc') {
      if (code === 0x07 || (this.escBuffer.endsWith('\x1b') && ch === '\\')) {
        this.escState = 'none';
        this.escBuffer = '';
      } else {
        this.escBuffer += ch;
        if (this.escBuffer.length > 256) {
          this.escState = 'none';
          this.escBuffer = '';
        }
      }
      return;
    }

    if (this.escState === 'csi') {
      if (code >= 0x40 && code <= 0x7e) {
        this.handleCsi(ch, this.escBuffer);
        this.escState = 'none';
        this.escBuffer = '';
      } else {
        this.escBuffer += ch;
        if (this.escBuffer.length > 64) {
          this.escState = 'none';
          this.escBuffer = '';
        }
      }
      return;
    }

    if (code === 0x1b) {
      this.escState = 'esc';
      return;
    }

    if (ch === '\r') {
      this.cursorCol = 0;
      return;
    }

    if (ch === '\n') {
      this.cursorRow++;
      this.cursorCol = 0;
      this.ensureLine(this.cursorRow);
      return;
    }

    if (ch === '\b' || code === 0x7f) {
      if (this.cursorCol > 0) {
        this.cursorCol--;
      }
      return;
    }

    if (ch === '\t') {
      const spaces = 4 - (this.cursorCol % 4);
      for (let s = 0; s < spaces; s++) {
        this.putChar(' ');
      }
      return;
    }

    if (code < 0x20) {
      return;
    }

    this.putChar(ch);
  }

  private handleCsi(command: string, rawParams: string): void {
    const cleaned = rawParams.replace(/^[?>=]/, '');
    const params = cleaned === '' ? [] : cleaned.split(';').map((p) => parseInt(p, 10) || 0);

    switch (command) {
      case 'm': {
        const codes = params.length === 0 ? [0] : params;
        for (const c of codes) {
          if (c === 0) {
            this.style = { fg: null, bg: null, bold: false, dim: false };
          } else if (c === 1) {
            this.style.bold = true;
          } else if (c === 2) {
            this.style.dim = true;
          } else if (c === 22) {
            this.style.bold = false;
            this.style.dim = false;
          } else if (c === 39) {
            this.style.fg = null;
          } else if (c === 49) {
            this.style.bg = null;
          } else if (ANSI_FG_COLORS[c]) {
            this.style.fg = ANSI_FG_COLORS[c];
          } else if (ANSI_BG_COLORS[c]) {
            this.style.bg = ANSI_BG_COLORS[c];
          }
        }
        break;
      }
      case 'J': {
        const mode = params[0] || 0;
        if (mode === 2 || mode === 3) {
          this.lines = [{ cells: [] }];
          this.cursorRow = 0;
          this.cursorCol = 0;
        } else if (mode === 0) {
          const line = this.ensureLine(this.cursorRow);
          line.cells.length = Math.min(line.cells.length, this.cursorCol);
          this.lines.length = this.cursorRow + 1;
        }
        break;
      }
      case 'K': {
        const mode = params[0] || 0;
        const line = this.ensureLine(this.cursorRow);
        if (mode === 0) {
          line.cells.length = Math.min(line.cells.length, this.cursorCol);
        } else if (mode === 1) {
          for (let i = 0; i < Math.min(this.cursorCol, line.cells.length); i++) {
            line.cells[i] = { char: ' ', style: { fg: null, bg: null, bold: false, dim: false } };
          }
        } else if (mode === 2) {
          line.cells = [];
          this.cursorCol = 0;
        }
        break;
      }
      case 'H':
      case 'f': {
        const row = Math.max(0, (params[0] || 1) - 1);
        const col = Math.max(0, (params[1] || 1) - 1);
        if (row === 0 && col === 0 && this.lines.length > 40) {
          this.cursorRow = this.lines.length - 1;
        } else {
          this.cursorRow = Math.min(row, this.maxLines - 1);
        }
        this.cursorCol = col;
        this.ensureLine(this.cursorRow);
        break;
      }
      case 'C': {
        const n = Math.max(1, params[0] || 1);
        this.cursorCol += n;
        break;
      }
      case 'D': {
        const n = Math.max(1, params[0] || 1);
        this.cursorCol = Math.max(0, this.cursorCol - n);
        break;
      }
      case 'G': {
        const col = Math.max(0, (params[0] || 1) - 1);
        this.cursorCol = col;
        break;
      }
      default:
        break;
    }
  }

  getLineSpans(lineIndex: number): TerminalSpan[] {
    const line = this.lines[lineIndex];
    if (!line || line.cells.length === 0) return [];
    const spans: TerminalSpan[] = [];
    for (const cell of line.cells) {
      const last = spans[spans.length - 1];
      if (last && stylesEqual(last, cell.style)) {
        last.text += cell.char;
      } else {
        spans.push({
          text: cell.char,
          fg: cell.style.fg,
          bg: cell.style.bg,
          bold: cell.style.bold,
          dim: cell.style.dim,
        });
      }
    }
    return spans;
  }

  getPlainText(): string {
    return this.lines
      .map((line) => line.cells.map((c) => c.char).join(''))
      .join('\n')
      .replace(/\n+$/, '');
  }
}

export interface KeyEventLike {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

export function mapKeyEventToSerial(e: KeyEventLike): string | null {
  if (e.metaKey) return null;

  if (e.ctrlKey && e.key.length === 1) {
    const upper = e.key.toUpperCase().charCodeAt(0);
    if (upper >= 65 && upper <= 90) {
      return String.fromCharCode(upper - 64);
    }
  }

  switch (e.key) {
    case 'Enter':
      return '\r';
    case 'Backspace':
      return '\x7f';
    case 'Tab':
      return '\t';
    case 'Escape':
      return '\x1b';
    case 'ArrowUp':
      return '\x1b[A';
    case 'ArrowDown':
      return '\x1b[B';
    case 'ArrowRight':
      return '\x1b[C';
    case 'ArrowLeft':
      return '\x1b[D';
    case 'Home':
      return '\x1b[H';
    case 'End':
      return '\x1b[F';
    case 'Delete':
      return '\x1b[3~';
    default:
      break;
  }

  if (e.key.length === 1 && !e.altKey) {
    return e.key;
  }

  return null;
}
