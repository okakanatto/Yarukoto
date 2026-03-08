'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error('Global Application Error:', error);
    }, [error]);

    return (
        <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'var(--font-sans, sans-serif)', color: 'var(--color-text)', backgroundColor: 'var(--color-background)' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--color-danger)' }}>
                システムエラーが発生しました
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '2rem', lineHeight: 1.5 }}>
                データベースのロードに失敗したか、予期せぬエラーが発生しました。<br />
                アプリを再起動するか、以下のボタンからもう一度お試しください。
            </p>
            <button
                onClick={() => reset()}
                className="btn-primary"
                style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem' }}
            >
                再読み込み
            </button>
        </div>
    );
}
