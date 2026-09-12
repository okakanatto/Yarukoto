// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DataPanel from '@/app/settings/_components/DataPanel';

const native = vi.hoisted(() => ({
    open: vi.fn(), copyFile: vi.fn(), relaunch: vi.fn(), closeDb: vi.fn(),
    execute: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: native.open, save: vi.fn() }));
vi.mock('@tauri-apps/plugin-fs', () => ({ copyFile: native.copyFile, exists: async () => false, remove: vi.fn() }));
vi.mock('@tauri-apps/api/path', () => ({ appDataDir: async () => '/app', join: async (...parts) => parts.join('/') }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: native.relaunch }));
vi.mock('@/lib/utils', () => ({ fetchDb: async () => ({ execute: native.execute }) }));
vi.mock('@/lib/db', () => ({ closeDb: native.closeDb }));

const draftKey = 'yarukoto:task-input-draft:v1:global';
const draftValue = JSON.stringify({ title: '元DBの仕事', pendingTask: { id: 1 } });

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem(draftKey, draftValue);
    native.open.mockResolvedValue('/selected.db');
    native.copyFile.mockResolvedValue(undefined);
    native.relaunch.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('DB復元時の下書き隔離', () => {
    it('コピー完了までは下書きを保ち、再起動前に元本文を退避してactiveキーを外す', async () => {
        const flash = vi.fn();
        native.copyFile.mockImplementation(async () => {
            expect(localStorage.getItem(draftKey)).toBe(draftValue);
        });
        native.relaunch.mockImplementation(async () => {
            expect(localStorage.getItem(draftKey)).toBeNull();
            expect(Object.keys(localStorage).some(key => key.startsWith('yarukoto:db-restore-draft-backup:v1:'))).toBe(true);
        });
        render(<DataPanel flash={flash} />);
        fireEvent.click(screen.getByRole('button', { name: '復元', exact: true }));
        await waitFor(() => expect(native.relaunch).toHaveBeenCalledOnce());
        expect(localStorage.getItem(draftKey)).toBeNull();
        const backups = Object.keys(localStorage).filter(key => key.startsWith('yarukoto:db-restore-draft-backup:v1:'));
        expect(backups).toHaveLength(1);
        expect(JSON.parse(localStorage.getItem(backups[0])).entries).toEqual([{ key: draftKey, value: draftValue }]);
        expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('入力中の下書きは退避します'));
        expect(flash).not.toHaveBeenCalled();
    });

    it('退避先へ書けない場合はDBを自動バックアップへ戻し、再起動せずエラーを示す', async () => {
        const flash = vi.fn();
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
        render(<DataPanel flash={flash} />);
        fireEvent.click(screen.getByRole('button', { name: '復元', exact: true }));
        await waitFor(() => expect(flash).toHaveBeenCalledWith('err', expect.stringContaining('元に戻しました')));
        expect(native.copyFile).toHaveBeenLastCalledWith(expect.stringMatching(/^\/app\/tasks\.backup-.*\.db$/), '/app/tasks.db');
        expect(native.relaunch).not.toHaveBeenCalled();
        expect(localStorage.getItem(draftKey)).toBe(draftValue);
        expect(console.error).not.toHaveBeenCalled();
    });

    it('選択DBのコピーが失敗した場合は下書きを動かさない', async () => {
        const flash = vi.fn();
        native.copyFile.mockImplementation(async source => { if (source === '/selected.db') throw new Error('copy failed'); });
        render(<DataPanel flash={flash} />);
        fireEvent.click(screen.getByRole('button', { name: '復元', exact: true }));
        await waitFor(() => expect(flash).toHaveBeenCalledWith('err', '復元に失敗しました'));
        expect(localStorage.getItem(draftKey)).toBe(draftValue);
        expect(Object.keys(localStorage)).toEqual([draftKey]);
        expect(native.relaunch).not.toHaveBeenCalled();
    });
});
