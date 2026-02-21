'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

export default function AuthCallback() {
    const router = useRouter();

    useEffect(() => {
        const handleAuth = async () => {
            const { error } = await supabase.auth.getSession();
            if (!error) {
                // After login, we can create/update the profile in our public.profiles table
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    await supabase.from('profiles').upsert({
                        id: user.id,
                        full_name: user.user_metadata.full_name,
                        avatar_url: user.user_metadata.avatar_url,
                        email: user.email
                    });
                }
                const pendingInvite = localStorage.getItem('pending_invite');
                if (pendingInvite) {
                    localStorage.removeItem('pending_invite');
                    router.push(`/join/${pendingInvite}`);
                } else {
                    router.push('/');
                }
            } else {
                router.push('/login');
            }
        };

        handleAuth();
    }, [router]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-black">
            <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );
}
