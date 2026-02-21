import React from 'react';

export const GlassCard = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
    <div className={`glass-card p-6 ${className}`}>
        {children}
    </div>
);

export const StatusBadge = ({ active }: { active: boolean }) => (
    <div className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 ${active ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
        }`}>
        <div className={`w-2 h-2 rounded-full ${active ? 'bg-green-400 animate-pulse' : 'bg-zinc-500'}`} />
        {active ? 'Activo ahora' : 'Inactivo'}
    </div>
);
