/**
 * escCSV / parseCSVLine のユニットテスト
 * DataPanel.js に定義されているが非エクスポートのため、仕様として定義・検証する。
 */
import { describe, it, expect } from 'vitest';

// DataPanel.js の escCSV / parseCSVLine と同一実装をここに写す
const escCSV = (v) => {
    if (v == null || v === '') return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
};

const parseCSVLine = (line) => {
    const cols = [];
    let cur = '', inQ = false, i = 0;
    while (i < line.length) {
        const ch = line[i];
        if (inQ) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    cur += '"'; i += 2;
                } else { inQ = false; i++; }
            } else { cur += ch; i++; }
        } else {
            if (ch === '"') { inQ = true; i++; }
            else if (ch === ',') { cols.push(cur); cur = ''; i++; }
            else { cur += ch; i++; }
        }
    }
    cols.push(cur);
    return cols;
};

describe('escCSV', () => {
    it('null / undefined / 空文字は空文字を返す', () => {
        expect(escCSV(null)).toBe('');
        expect(escCSV(undefined)).toBe('');
        expect(escCSV('')).toBe('');
    });

    it('特殊文字なしの文字列はそのまま返す', () => {
        expect(escCSV('hello')).toBe('hello');
        expect(escCSV(42)).toBe('42');
    });

    it('カンマを含む場合はダブルクォートで囲む', () => {
        expect(escCSV('a,b')).toBe('"a,b"');
    });

    it('ダブルクォートを含む場合はエスケープして囲む', () => {
        expect(escCSV('he said "hi"')).toBe('"he said ""hi"""');
    });

    it('改行を含む場合はダブルクォートで囲む', () => {
        expect(escCSV('line1\nline2')).toBe('"line1\nline2"');
    });

    it('カンマとダブルクォート両方含む場合も正しく処理する', () => {
        const result = escCSV('a,b"c');
        expect(result).toBe('"a,b""c"');
    });
});

describe('parseCSVLine', () => {
    it('単純なカンマ区切り行をパースできる', () => {
        expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    it('クォートされたフィールドを正しく処理する', () => {
        expect(parseCSVLine('"hello world",foo')).toEqual(['hello world', 'foo']);
    });

    it('クォート内のカンマは区切りとして扱わない', () => {
        expect(parseCSVLine('"a,b",c')).toEqual(['a,b', 'c']);
    });

    it('エスケープされたダブルクォート（""）を正しく処理する', () => {
        expect(parseCSVLine('"say ""hi"""')).toEqual(['say "hi"']);
    });

    it('空フィールドを正しく処理する', () => {
        expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c']);
    });

    it('先頭・末尾が空フィールドでも正しく処理する', () => {
        expect(parseCSVLine(',b,')).toEqual(['', 'b', '']);
    });

    it('escCSV でエスケープした値を parseCSVLine で復元できる（ラウンドトリップ）', () => {
        const values = ['hello', 'a,b', 'say "hi"', 'line1\nline2', '', 'normal'];
        const line = values.map(escCSV).join(',');
        const parsed = parseCSVLine(line);
        expect(parsed).toEqual(values);
    });
});
