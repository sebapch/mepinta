'use client';

import { useEffect, useRef, useCallback } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useLanguage } from './LanguageContext';
import { supabase } from '../lib/supabase';

interface OnboardingTourProps {
    userId?: string;
    hasSeenTour?: boolean;
    onTourComplete: () => void;
}

export default function OnboardingTour({ userId, hasSeenTour, onTourComplete }: OnboardingTourProps) {
    const { t } = useLanguage();
    const driverRef = useRef<any>(null);

    const startTour = useCallback(() => {
        const driverObj = driver({
            showProgress: true,
            animate: true,
            nextBtnText: t.tour.next,
            prevBtnText: t.tour.prev,
            doneBtnText: t.tour.done,
            showButtons: ['next', 'previous'],
            allowClose: true,
            steps: [
                {
                    element: '#tour-header',
                    popover: {
                        title: t.tour.welcomeTitle,
                        description: t.tour.welcomeDesc,
                        side: "bottom",
                        align: 'start'
                    }
                },
                {
                    element: '#tour-groups',
                    popover: {
                        title: t.tour.groupsTitle,
                        description: t.tour.groupsDesc,
                        side: "right",
                        align: 'start'
                    }
                },
                {
                    element: '#tour-availability',
                    popover: {
                        title: t.tour.availabilityTitle,
                        description: t.tour.availabilityDesc,
                        side: "bottom",
                        align: 'start'
                    }
                },
                {
                    element: '#tour-confirm',
                    popover: {
                        title: t.tour.confirmTitle,
                        description: t.tour.confirmDesc,
                        side: "top",
                        align: 'center'
                    }
                },
                {
                    element: '#tour-agenda',
                    popover: {
                        title: t.tour.agendaTitle,
                        description: t.tour.agendaDesc,
                        side: "left",
                        align: 'start'
                    }
                },
                {
                    element: '#tour-game',
                    popover: {
                        title: t.tour.gameTitle,
                        description: t.tour.gameDesc,
                        side: "bottom",
                        align: 'end'
                    }
                }
            ],
            onDestroyed: async () => {
                if (userId && !hasSeenTour) {
                    await supabase
                        .from('profiles')
                        .update({ has_seen_tour: true })
                        .eq('id', userId);
                    onTourComplete();
                }
            }
        });

        driverRef.current = driverObj;
        driverObj.drive();
    }, [userId, hasSeenTour, t, onTourComplete]);

    useEffect(() => {
        if (!userId || hasSeenTour) return;

        // Small delay to ensure layout is ready
        const timer = setTimeout(() => {
            startTour();
        }, 1200);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, hasSeenTour]);

    // Expose startTour to window for the "Help" button to call
    useEffect(() => {
        (window as any).startMepintaTour = startTour;
        return () => { delete (window as any).startMepintaTour; };
    }, [startTour]);

    return null;
}
