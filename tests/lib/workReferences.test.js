import { describe, expect, it, vi } from 'vitest';
import { classifyWorkReference, openWorkReference } from '@/lib/workReferences';
const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args) => invoke(...args) }));

describe('user-selected work references', () => {
    it('opens an explicit document path without shell parsing', async () => {
        const path = 'C:\\資料\\比較表 & 方針.xlsx';
        expect(classifyWorkReference(path)).toMatchObject({ kind: 'file', label: '比較表 & 方針.xlsx' });
        await openWorkReference(path);
        expect(invoke).toHaveBeenCalledWith('open_work_reference', { target: path });
    });
    it('keeps ordinary labels and executable schemes inert', () => {
        for (const input of ['会議で聞いたこと', 'javascript:alert(1)', 'C:\\tools\\run.exe', 'C:\\a.pdf:run.exe', '\\\\server\\a.pdf', 'https://name:secret@example.com/', 'file://server/a.pdf']) {
            expect(classifyWorkReference(input).kind).toBe('text');
        }
    });
    it('normalizes local file URLs and public web URLs', () => {
        expect(classifyWorkReference('file:///C:/work/a%20b.pdf')).toMatchObject({ kind: 'file', target: 'C:\\work\\a b.pdf' });
        expect(classifyWorkReference('https://example.com/docs')).toMatchObject({ kind: 'url', target: 'https://example.com/docs' });
    });
});
