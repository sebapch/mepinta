'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, addDays, startOfToday, eachDayOfInterval, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Check, Sun, Sunset, Moon, Coffee, Zap, Loader2, LucideIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Moment {
    id: string;
    label: string;
    hours: string;
    icon: LucideIcon;
    color: string;
}

const MOMENTS: Moment[] = [
    { id: 'morning', label: 'Mañana', hours: '08:00 - 12:00', icon: Coffee, color: 'from-orange-400 to-yellow-500' },
    { id: 'afternoon', label: 'Tarde', hours: '12:00 - 19:00', icon: Sun, color: 'from-pink-500 to-rose-500' },
    { id: 'evening', label: 'Noche', hours: '19:00 - 00:00', icon: Sunset, color: 'from-purple-600 to-indigo-600' },
    { id: 'late', label: 'Madrugada', hours: '00:00 - 04:00', icon: Moon, color: 'from-slate-700 to-zinc-900' },
];

interface Selection {
    [day: string]: string[]; // day string -> array of moment ids
}

interface Props {
    onSaved?: () => void;
}

export default function AvailabilitySelector({ onSaved }: Props) {
    const today = startOfToday();
    const week = eachDayOfInterval({ start: today, end: addDays(today, 6) });

    const [selectedDay, setSelectedDay] = useState(today);
    const [selection, setSelection] = useState<Selection>({});
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const saveAvailability = async () => {
        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const dayStr = format(selectedDay, 'yyyy-MM-dd');
            const moments = selection[dayStr] || [];

            const { error } = await supabase
                .from('availability')
                .upsert({
                    user_id: user.id,
                    day: dayStr,
                    moments: moments
                }, { onConflict: 'user_id,day' });

            if (error) throw error;
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
            onSaved?.();
        } catch (error: any) {
            console.error('Error saving availability:', error);
            alert('Error al guardar: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const dayStr = format(selectedDay, 'yyyy-MM-dd');
    const currentSelection = selection[dayStr] || [];

    const toggleMoment = (momentId: string) => {
        setSelection(prev => {
            const moments = prev[dayStr] || [];
            const newMoments = moments.includes(momentId)
                ? moments.filter(m => m !== momentId)
                : [...moments, momentId];
            return { ...prev, [dayStr]: newMoments };
        });
    };

    return (
        <div className="flex flex-col h-full max-h-[80vh]">
            {/* Day Selector - Horizontal Pills */}
            <div className="flex gap-3 overflow-x-auto pb-6 scrollbar-hide px-1">
                {week.map((day) => {
                    const isSelected = isSameDay(day, selectedDay);
                    const hasData = (selection[format(day, 'yyyy-MM-dd')] || []).length > 0;

                    return (
                        <button
                            key={day.toString()}
                            onClick={() => setSelectedDay(day)}
                            className={`
                flex flex-col items-center min-w-[70px] py-4 rounded-3xl transition-all duration-300 relative
                ${isSelected
                                    ? 'bg-white text-black scale-105 shadow-xl shadow-white/10'
                                    : 'bg-white/5 text-zinc-500 hover:bg-white/10'}
              `}
                        >
                            <span className="text-[10px] font-bold uppercase tracking-tighter opacity-60">
                                {format(day, 'EEE', { locale: es })}
                            </span>
                            <span className="text-xl font-black">{format(day, 'd')}</span>

                            {hasData && !isSelected && (
                                <div className="absolute top-2 right-2 w-2 h-2 bg-pink-500 rounded-full animate-pulse" />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Moments Grid - Large, Easy-to-tap cards */}
            <div className="flex-1 grid grid-cols-2 gap-4">
                {MOMENTS.map((moment) => {
                    const isSelected = currentSelection.includes(moment.id);

                    return (
                        <button
                            key={moment.id}
                            onClick={() => toggleMoment(moment.id)}
                            className={`
                relative overflow-hidden rounded-[32px] p-6 text-left transition-all duration-300 group
                ${isSelected
                                    ? `bg-gradient-to-br ${moment.color} scale-95 shadow-lg`
                                    : 'bg-white/5 border border-white/5 hover:bg-white/10'}
              `}
                        >
                            {/* Icon & Accent */}
                            <div className={`
                w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-colors
                ${isSelected ? 'bg-white/20' : 'bg-white/5 group-hover:bg-white/10'}
              `}>
                                {React.createElement(moment.icon, {
                                    size: 24,
                                    className: isSelected ? 'text-white' : 'text-zinc-500'
                                })}
                            </div>

                            <div>
                                <h4 className={`font-black text-lg ${isSelected ? 'text-white' : 'text-zinc-200'}`}>
                                    {moment.label}
                                </h4>
                                <p className={`text-xs font-medium ${isSelected ? 'text-white/70' : 'text-zinc-500'}`}>
                                    {moment.hours}
                                </p>
                            </div>

                            {/* Selection Checkmark */}
                            <AnimatePresence>
                                {isSelected && (
                                    <motion.div
                                        initial={{ scale: 0, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0, opacity: 0 }}
                                        className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white flex items-center justify-center text-black"
                                    >
                                        <Check size={16} strokeWidth={4} />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </button>
                    );
                })}
            </div>

            {/* Quick Summary Footer */}
            <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center text-pink-500">
                        <Zap size={20} fill="currentColor" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Estado hoy</p>
                        <p className="text-sm font-bold text-white">
                            {currentSelection.length > 0
                                ? `${currentSelection.length} momentos marcados`
                                : 'Sin actividad'}
                        </p>
                    </div>
                </div>

                <button
                    onClick={saveAvailability}
                    disabled={saving}
                    className="px-8 py-3 bg-white text-black font-black rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {saving ? <Loader2 className="animate-spin" size={18} /> : saved ? '¡Guardado! 🎉' : 'CONFIRMAR'}
                </button>
            </div>
        </div>
    );
}
