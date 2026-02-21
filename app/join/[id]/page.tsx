'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { motion } from 'framer-motion';
import { Users2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { GlassCard } from '../../../components/UI';

import { useLanguage } from '../../../components/LanguageContext';

export default function JoinGroupPage() {
    const { t } = useLanguage();
    const router = useRouter();
    const { id } = useParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [group, setGroup] = useState<any>(null);
    const [joining, setJoining] = useState(false);

    useEffect(() => {
        const checkGroup = async () => {
            const { data, error } = await supabase
                .from('groups')
                .select('*')
                .eq('id', id)
                .single();

            if (error || !data) {
                setError(t.join.error);
                setLoading(false);
                return;
            }

            setGroup(data);

            // Check if user is logged in
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                // Save invite to localStorage to join after login
                localStorage.setItem('pending_invite', id as string);
                router.push('/login');
                return;
            }

            setLoading(false);
        };

        if (id) checkGroup();
    }, [id, router, t]);

    const handleJoin = async () => {
        setJoining(true);
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return;

        const { error: joinError } = await supabase
            .from('group_members')
            .upsert({ group_id: id, user_id: user.id });

        if (joinError) {
            setError(t.join.error);
            setJoining(false);
        } else {
            router.push('/');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black">
                <Loader2 className="animate-spin text-pink-500" size={40} />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-black">
                <GlassCard className="max-w-md w-full text-center py-12">
                    <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
                    <h2 className="text-xl font-bold mb-2">¡Uy! Algo salió mal</h2>
                    <p className="text-zinc-500 mb-8">{error}</p>
                    <button
                        onClick={() => router.push('/')}
                        className="px-8 py-3 premium-gradient rounded-2xl font-bold text-white"
                    >
                        VOLVER AL INICIO
                    </button>
                </GlassCard>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-black">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="max-w-md w-full"
            >
                <GlassCard className="text-center py-10 !p-8 border-pink-500/20">
                    <div className="w-20 h-20 bg-pink-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 text-pink-500">
                        <Users2 size={40} />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-pink-500 mb-2">{t.join.title}</p>
                    <h1 className="text-3xl font-black mb-2 uppercase italic">{group?.name}</h1>
                    <p className="text-zinc-400 mb-10">{t.join.description}</p>

                    <button
                        onClick={handleJoin}
                        disabled={joining}
                        className="w-full py-4 premium-gradient rounded-2xl font-black text-lg shadow-xl shadow-pink-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                    >
                        {joining ? <Loader2 className="animate-spin" size={24} /> : (
                            <>
                                <CheckCircle2 size={24} />
                                {t.join.joinBtn}
                            </>
                        )}
                    </button>
                </GlassCard>
            </motion.div>
        </div>
    );
}
