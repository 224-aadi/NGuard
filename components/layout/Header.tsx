import React from 'react';

export default function Header() {
    return (
        <header className="mb-8 text-center no-print">
            <div className="inline-flex items-center justify-center p-3 mb-4 rounded-full bg-blue-50">
                <span className="text-4xl">🛡️</span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl mb-2">
                N-Guard
            </h1>
            <p className="text-lg text-slate-600 font-medium max-w-2xl mx-auto">
                Nitrogen decision support for practical field planning
            </p>
        </header>
    );
}
