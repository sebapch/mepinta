'use client';

import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { Zap, Chrome } from 'lucide-react';
import { GlassCard } from '../../components/UI';
import { useLanguage } from '../../components/LanguageContext';

export default function LoginPage() {
    const { t, language, setLanguage } = useLanguage();
    const handleLogin = async () => {
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
            },
        });
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-black">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-pink-500/10 blur-[120px] rounded-full animate-float" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full animate-float" style={{ animationDelay: '2s' }} />
            </div>

            <div className="absolute top-6 right-6">
                <button
                    onClick={() => setLanguage(language === 'es' ? 'en' : 'es')}
                    className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 font-bold text-xs rounded-full px-4 py-2 transition-all"
                >
                    {language === 'es' ? 'ENGLISH' : 'ESPAÑOL'}
                </button>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md relative z-10"
            >
                <div className="text-center mb-10">
                    <div className="w-20 h-20 bg-premium-gradient rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-pink-500/20">
                        <Zap size={40} className="text-white" fill="currentColor" />
                    </div>
                    <h1 className="text-5xl font-black italic tracking-tighter text-white mb-2">{t.login.title}</h1>
                    <p className="text-zinc-500 font-medium">{t.login.subtitle}</p>
                </div>

                <GlassCard className="!p-8 border-white/5 shadow-2xl">
                    <p className="text-center text-zinc-400 text-sm mb-8">
                        {t.login.description}
                    </p>

                    <button
                        onClick={handleLogin}
                        className="w-full py-4 bg-white text-black font-black rounded-2xl flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl"
                    >
                        <Chrome size={20} />
                        {t.login.googleBtn}
                    </button>

                    <p className="text-[10px] text-center text-zinc-600 mt-8 uppercase tracking-widest font-bold">
                        {t.login.footer}
                    </p>
                </GlassCard>
            </motion.div>
        </div>
    );
}

const premium_gradient_style = `
.bg-premium-gradient {
    background: linear-gradient(135deg, #9d50bb, #ff2d75);
}
`;
