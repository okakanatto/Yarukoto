'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error('Global Application Error:', error);
    }, [error]);

    return (
        <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#dc2626' }}>
                システムエラーが発生しました
            </h2>
            <p style={{ color: '#475569', marginBottom: '2rem', lineHeight: 1.5 }}>
                データベースのロードに失敗したか、予期せぬエラーが発生しました。<br />
                アプリを再起動するか、以下のボタンからもう一度お試しください。
            </p>
            <button
                onClick={() => reset()}
                style={{
                    backgroundColor: '#3b82f6', color: '#fff', border: 'none',
                    padding: '0.75rem 1.5rem', borderRadius: '8px', cursor: 'pointer',
                    fontWeight: 'bold', transition: 'background-color 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.backgroundColor = '#2563eb'}
                onMouseOut={e => e.currentTarget.style.backgroundColor = '#3b82f6'}
            >
                再読み込み
            </button>
        </div>
    );
}
