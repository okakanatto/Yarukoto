import { useState, useEffect } from 'react';

export function useMasterData() {
    const [masters, setMasters] = useState({ importance: [], urgency: [], status: [] });
    const [tags, setTags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let mounted = true;

        const fetchData = async () => {
            try {
                const { getDb } = await import('@/lib/db');
                const db = await getDb();

                const [importance, urgency, status, tagsData] = await Promise.all([
                    db.select('SELECT * FROM importance_master ORDER BY level'),
                    db.select('SELECT * FROM urgency_master ORDER BY level'),
                    db.select('SELECT * FROM status_master ORDER BY sort_order, code'),
                    db.select('SELECT * FROM tags ORDER BY sort_order, id')
                ]);

                if (mounted) {
                    setMasters({ importance, urgency, status });
                    setTags(tagsData);
                    setLoading(false);
                }
            } catch (err) {
                if (mounted) {
                    console.error('Failed to fetch master data from Tauri SQLite:', err);
                    setError(err);
                    setLoading(false);
                }
            }
        };

        fetchData();

        return () => { mounted = false; };
    }, []);

    return { masters, tags, loading, error };
}
