'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy, RotateCcw, Zap } from 'lucide-react';

interface Props {
    onClose: () => void;
    onGameOver: (score: number) => Promise<void>;
    personalBest: number;
}

const W = 360;
const H = 560;
const BIRD_X = 70;
const BIRD_R = 16;
const GRAVITY = 0.45;
const JUMP = -8.5;
const PIPE_W = 52;
const PIPE_GAP = 145;
const PIPE_SPEED = 2.8;
const PIPE_INTERVAL = 100; // frames

type GameState = 'idle' | 'playing' | 'dead';

export default function FlappyBird({ onClose, onGameOver, personalBest }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const stateRef = useRef<{
        gameState: GameState;
        bird: { y: number; vy: number };
        pipes: { x: number; gapY: number }[];
        score: number;
        frame: number;
        particles: { x: number; y: number; vx: number; vy: number; life: number; color: string }[];
    }>({
        gameState: 'idle',
        bird: { y: H / 2, vy: 0 },
        pipes: [],
        score: 0,
        frame: 0,
        particles: [],
    });

    const [gameKey, setGameKey] = useState(0);
    const [displayScore, setDisplayScore] = useState(0);
    const [gameState, setGameState] = useState<GameState>('idle');
    const [finalScore, setFinalScore] = useState(0);
    const [saving, setSaving] = useState(false);
    const animRef = useRef<number | undefined>(undefined);

    const spawnParticles = (x: number, y: number) => {
        const colors = ['#f43f5e', '#a855f7', '#f97316', '#facc15'];
        for (let i = 0; i < 12; i++) {
            const angle = (Math.PI * 2 * i) / 12;
            stateRef.current.particles.push({
                x, y,
                vx: Math.cos(angle) * (2 + Math.random() * 3),
                vy: Math.sin(angle) * (2 + Math.random() * 3),
                life: 1,
                color: colors[Math.floor(Math.random() * colors.length)],
            });
        }
    };

    const reset = useCallback(() => {
        stateRef.current = {
            gameState: 'idle',
            bird: { y: H / 2, vy: 0 },
            pipes: [],
            score: 0,
            frame: 0,
            particles: [],
        };
        setDisplayScore(0);
        setGameState('idle');
        setFinalScore(0);
        setSaving(false);
        setGameKey(k => k + 1); // re-triggers useEffect → fresh game loop
    }, []);

    const jump = useCallback(() => {
        const s = stateRef.current;
        if (s.gameState === 'idle') {
            s.gameState = 'playing';
            setGameState('playing');
        }
        if (s.gameState === 'playing') {
            s.bird.vy = JUMP;
            spawnParticles(BIRD_X, s.bird.y);
        }
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d')!;

        const draw = () => {
            const s = stateRef.current;
            ctx.clearRect(0, 0, W, H);

            // Sky gradient
            const sky = ctx.createLinearGradient(0, 0, 0, H);
            sky.addColorStop(0, '#0a0a1a');
            sky.addColorStop(1, '#1a0a2e');
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, W, H);

            // Stars (static)
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            const starSeeds = [23, 67, 112, 198, 245, 310, 87, 155, 290, 40];
            starSeeds.forEach((seed, i) => {
                const sx = (seed * 37 + i * 53) % W;
                const sy = (seed * 13 + i * 71) % (H * 0.6);
                const sr = 0.5 + ((seed * 7) % 10) / 10;
                ctx.beginPath();
                ctx.arc(sx, sy, sr, 0, Math.PI * 2);
                ctx.fill();
            });

            // Pipes
            s.pipes.forEach(pipe => {
                const topH = pipe.gapY - PIPE_GAP / 2;
                const botY = pipe.gapY + PIPE_GAP / 2;
                const botH = H - botY;

                // Pipe body gradient
                const pg = ctx.createLinearGradient(pipe.x, 0, pipe.x + PIPE_W, 0);
                pg.addColorStop(0, '#a855f7');
                pg.addColorStop(0.5, '#d946ef');
                pg.addColorStop(1, '#7c3aed');

                ctx.fillStyle = pg;
                // Top pipe
                ctx.beginPath();
                ctx.roundRect(pipe.x, 0, PIPE_W, topH - 12, [0, 0, 8, 8]);
                ctx.fill();
                // Top cap
                ctx.fillStyle = '#c026d3';
                ctx.beginPath();
                ctx.roundRect(pipe.x - 4, topH - 20, PIPE_W + 8, 20, 6);
                ctx.fill();

                // Bottom pipe
                ctx.fillStyle = pg;
                ctx.beginPath();
                ctx.roundRect(pipe.x, botY + 12, PIPE_W, botH, [8, 8, 0, 0]);
                ctx.fill();
                // Bottom cap
                ctx.fillStyle = '#c026d3';
                ctx.beginPath();
                ctx.roundRect(pipe.x - 4, botY, PIPE_W + 8, 20, 6);
                ctx.fill();
            });

            // Bird
            const bx = BIRD_X;
            const by = s.bird.y;
            const tilt = Math.max(-0.5, Math.min(0.8, s.bird.vy / 12));

            ctx.save();
            ctx.translate(bx, by);
            ctx.rotate(tilt);

            // Glow
            if (s.gameState === 'playing') {
                const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, BIRD_R + 10);
                glow.addColorStop(0, 'rgba(249,115,22,0.4)');
                glow.addColorStop(1, 'transparent');
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(0, 0, BIRD_R + 10, 0, Math.PI * 2);
                ctx.fill();
            }

            // Body
            const bodyG = ctx.createRadialGradient(-4, -4, 2, 0, 0, BIRD_R);
            bodyG.addColorStop(0, '#fb923c');
            bodyG.addColorStop(0.6, '#f97316');
            bodyG.addColorStop(1, '#c2410c');
            ctx.fillStyle = bodyG;
            ctx.beginPath();
            ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
            ctx.fill();

            // Wing
            ctx.fillStyle = '#fed7aa';
            ctx.beginPath();
            ctx.ellipse(-6, 4 + Math.sin(s.frame * 0.3) * 3, 8, 5, -0.3, 0, Math.PI * 2);
            ctx.fill();

            // Eye
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(7, -5, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#1e293b';
            ctx.beginPath();
            ctx.arc(8, -4, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(9, -5, 1, 0, Math.PI * 2);
            ctx.fill();

            // Beak
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.moveTo(14, -2);
            ctx.lineTo(22, 0);
            ctx.lineTo(14, 3);
            ctx.closePath();
            ctx.fill();

            ctx.restore();

            // Particles
            s.particles.forEach(p => {
                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 3 * p.life, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1;

            // Score HUD
            if (s.gameState === 'playing' || s.gameState === 'dead') {
                ctx.font = 'bold 36px system-ui';
                ctx.textAlign = 'center';
                ctx.fillStyle = 'white';
                ctx.shadowColor = '#f43f5e';
                ctx.shadowBlur = 12;
                ctx.fillText(String(s.score), W / 2, 56);
                ctx.shadowBlur = 0;
            }

            // Idle overlay
            if (s.gameState === 'idle') {
                ctx.fillStyle = 'rgba(0,0,0,0.45)';
                ctx.fillRect(0, 0, W, H);
                ctx.font = 'bold 24px system-ui';
                ctx.textAlign = 'center';
                ctx.fillStyle = 'white';
                ctx.fillText('🐦 Tap para volar', W / 2, H / 2 - 16);
                ctx.font = '14px system-ui';
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.fillText('Espacio o toca la pantalla', W / 2, H / 2 + 16);
            }
        };

        const tick = () => {
            const s = stateRef.current;

            if (s.gameState === 'playing') {
                s.frame++;

                // Bird physics
                s.bird.vy += GRAVITY;
                s.bird.y += s.bird.vy;

                // Spawn pipes
                if (s.frame % PIPE_INTERVAL === 0) {
                    const gapY = 150 + Math.random() * (H - 300);
                    s.pipes.push({ x: W + 10, gapY });
                }

                // Move pipes + score
                s.pipes.forEach(pipe => {
                    pipe.x -= PIPE_SPEED;
                    if (pipe.x + PIPE_W === BIRD_X - 1 || (pipe.x + PIPE_W < BIRD_X && !('passed' in pipe))) {
                        (pipe as any).passed = true;
                        s.score++;
                        setDisplayScore(s.score);
                        spawnParticles(BIRD_X + 20, s.bird.y);
                    }
                });
                s.pipes = s.pipes.filter(p => p.x > -PIPE_W - 10);

                // Update particles
                s.particles.forEach(p => {
                    p.x += p.vx;
                    p.y += p.vy;
                    p.vy += 0.15;
                    p.life -= 0.04;
                });
                s.particles = s.particles.filter(p => p.life > 0);

                // Collision: floor / ceiling
                if (s.bird.y + BIRD_R > H || s.bird.y - BIRD_R < 0) {
                    die();
                    return;
                }

                // Collision: pipes
                for (const pipe of s.pipes) {
                    const birdInX = BIRD_X + BIRD_R > pipe.x && BIRD_X - BIRD_R < pipe.x + PIPE_W;
                    const topEnd = pipe.gapY - PIPE_GAP / 2;
                    const botStart = pipe.gapY + PIPE_GAP / 2;
                    if (birdInX && (s.bird.y - BIRD_R < topEnd || s.bird.y + BIRD_R > botStart)) {
                        die();
                        return;
                    }
                }
            }

            draw();
            animRef.current = requestAnimationFrame(tick);
        };

        const die = async () => {
            const s = stateRef.current;
            s.gameState = 'dead';
            setGameState('dead');
            setFinalScore(s.score);
            if (animRef.current) cancelAnimationFrame(animRef.current);
            draw();

            setSaving(true);
            await onGameOver(s.score);
            setSaving(false);
        };

        animRef.current = requestAnimationFrame(tick);
        return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
        // gameKey intentionally restarts the loop on reset
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onGameOver, gameKey]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); }
            if (e.code === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [jump, onClose]);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/85 backdrop-blur-md"
                onClick={onClose}
            />
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative flex flex-col items-center gap-4"
            >
                {/* Header */}
                <div className="flex items-center justify-between w-full px-1">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">🐦</span>
                        <span className="font-black text-white text-lg italic">FLAPPY PINTA</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 bg-yellow-500/15 rounded-full px-3 py-1">
                            <Trophy size={13} className="text-yellow-400" />
                            <span className="text-[11px] font-black text-yellow-400">Récord: {personalBest}</span>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Canvas */}
                <div className="relative">
                    <canvas
                        ref={canvasRef}
                        width={W}
                        height={H}
                        className="rounded-3xl cursor-pointer border border-white/10 shadow-2xl shadow-purple-500/20"
                        onClick={jump}
                        style={{ touchAction: 'none' }}
                        onTouchStart={e => { e.preventDefault(); jump(); }}
                    />

                    {/* Game Over overlay */}
                    <AnimatePresence>
                        {gameState === 'dead' && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.85 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl bg-black/70 backdrop-blur-sm"
                            >
                                <p className="text-5xl mb-3">💀</p>
                                <p className="text-3xl font-black text-white mb-1">{finalScore}</p>
                                <p className="text-zinc-400 text-sm mb-1">
                                    {finalScore > personalBest ? '🎉 ¡Nuevo récord!' : `Récord: ${personalBest}`}
                                </p>
                                {saving && <p className="text-[11px] text-zinc-500 mb-4">Guardando puntaje...</p>}
                                {!saving && (
                                    <button
                                        onClick={reset}
                                        className="mt-4 flex items-center gap-2 bg-pink-500 hover:bg-pink-400 text-white font-black px-6 py-3 rounded-2xl transition-colors shadow-lg shadow-pink-500/30"
                                    >
                                        <RotateCcw size={16} /> Otra vez
                                    </button>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <p className="text-[11px] text-zinc-600">Espacio / tap para saltar · Esc para salir</p>
            </motion.div>
        </div>
    );
}
