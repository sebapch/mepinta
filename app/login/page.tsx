'use client';

import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { Zap, Chrome } from 'lucide-react';
import { GlassCard } from '../../components/UI';

export default function LoginPage() {
    const handleLogin = async () => {
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
            },
        });
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-pink-500/20 blur-[120px] rounded-full animate-float" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/20 blur-[120px] rounded-full animate-float" style={{ animationDelay: '2s' }} />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md"
            >
                <div className="text-center mb-10">
                    <div className="w-20 h-20 bg-gradient-to-br from-pink-500 to-purple-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-pink-500/20">
                        <Zap size={40} className="text-white" fill="currentColor" />
                    </div>
                    <h1 className="text-5xl font-black italic tracking-tighter text-white mb-2">MePinta</h1>
                    <p className="text-zinc-500 font-medium">¿Qué sale hoy con los pibes?</p>
                </div>

                <GlassCard className="!p-8 border-white/5 shadow-2xl">
                    <p className="text-center text-zinc-400 text-sm mb-8">
                        Conectate con Google para ver la agenda de tus grupos y marcar cuándo tenés pinta.
                    </p>

                    <button
                        onClick={handleLogin}
                        className="w-full py-4 bg-white text-black font-black rounded-2xl flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl"
                    >
                        <Chrome size={20} />
                        ENTRAR CON GOOGLE
                    </button>

                    <p className="text-[10px] text-center text-zinc-600 mt-8 uppercase tracking-widest font-bold">
                        Privado • Seguro • Entre Amigos
                    </p>
                </GlassCard>
            </motion.div>
        </div>
    );
}
