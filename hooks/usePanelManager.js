import { useState, useCallback } from 'react';

/**
 * Settings パネル共通の CRUD 操作を提供するカスタムフック。
 * TagsPanel / StatusPanel / ProjectsPanel で共通のパターンを集約する。
 *
 * @param {Object} options
 * @param {any[]} options.items - 現在のアイテム配列
 * @param {function} options.setItems - ステートセッター (fn: (prev) => next) => void
 * @param {string} [options.idField='id'] - 主キーフィールド名 ('id' or 'code')
 * @param {boolean} [options.supportsArchive=false] - アーカイブ機能の有無
 * @param {function} [options.isArchived] - (item) => boolean, アーカイブ判定関数
 * @param {function} options.flash - (type: 'ok'|'err', message: string) => void
 * @returns {Object}
 */
export function usePanelManager({
    items,
    setItems,
    idField = 'id',
    supportsArchive = false,
    isArchived = () => false,
    flash,
}) {
    const [openPalette, setOpenPalette] = useState(null);
    const [saving, setSaving] = useState(false);

    /** パレット開閉トグル */
    const togglePalette = useCallback((key) => {
        setOpenPalette(prev => prev === key ? null : key);
    }, []);

    /** ステートのみ更新（DB保存は別途） */
    const updateItem = useCallback((id, field, value) => {
        setItems(prev => prev.map(item => item[idField] === id ? { ...item, [field]: value } : item));
    }, [setItems, idField]);

    /** ステートからアイテムを削除 */
    const removeItem = useCallback((id) => {
        setItems(prev => prev.filter(item => item[idField] !== id));
    }, [setItems, idField]);

    /** ステートにアイテムを追加（supportsArchive時はアクティブ末尾に挿入） */
    const appendItem = useCallback((newItem) => {
        if (supportsArchive) {
            setItems(prev => {
                const active = prev.filter(item => !isArchived(item));
                const archived = prev.filter(item => isArchived(item));
                return [...active, newItem, ...archived];
            });
        } else {
            setItems(prev => [...prev, newItem]);
        }
    }, [setItems, supportsArchive, isArchived]);

    /** 配列内の位置swap（supportsArchive時はアクティブ配列内でswap） */
    const moveItem = useCallback((index, direction) => {
        setItems(prev => {
            if (supportsArchive) {
                const active = prev.filter(item => !isArchived(item));
                const archived = prev.filter(item => isArchived(item));
                const newIndex = index + direction;
                if (newIndex < 0 || newIndex >= active.length) return prev;
                const arr = [...active];
                [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
                return [...arr, ...archived];
            } else {
                const newIndex = index + direction;
                if (newIndex < 0 || newIndex >= prev.length) return prev;
                const arr = [...prev];
                [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
                return arr;
            }
        });
    }, [setItems, supportsArchive, isArchived]);

    /**
     * sort_order の一括DB保存（saving状態管理付き）
     * @param {function} saveFn - async () => void, 実際のDB保存処理
     */
    const saveAllOrder = useCallback(async (saveFn) => {
        setSaving(true);
        try {
            await saveFn();
            flash('ok', '保存しました');
        } catch (e) {
            console.error(e);
            flash('err', '保存に失敗しました');
        } finally {
            setSaving(false);
        }
    }, [flash]);

    return {
        openPalette,
        togglePalette,
        updateItem,
        removeItem,
        appendItem,
        moveItem,
        saving,
        saveAllOrder,
    };
}
