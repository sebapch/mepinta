'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users2, Plus, Share2, CheckCircle, LogOut, Zap,
  Coffee, Sun, Sunset, Moon, Check, Loader2, X,
  MessageSquare, Flame, CalendarCheck, Send, CornerDownRight, Trophy, Gamepad2
} from 'lucide-react';
import { format, addDays, startOfToday, eachDayOfInterval, isSameDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '../lib/supabase';
import { useRouter } from 'next/navigation';
import FlappyBird from '../components/FlappyBird';
import { useLanguage } from '../components/LanguageContext';

// ── Constants ──────────────────────────────────────────────────────
// ── Constants will be handled inside the component or via helpers to support i18n

// ── Helpers ────────────────────────────────────────────────────────
function computeGroupMetrics(availabilities: any[], groupMembers: any[], t: any) {
  const totalMembers = groupMembers.length;
  if (totalMembers === 0) return null;
  const membersWithPinta = new Set(availabilities.map(a => a.user_id)).size;
  const pintaPercent = Math.round((membersWithPinta / totalMembers) * 100);
  const dayCount: Record<string, Set<string>> = {};
  availabilities.forEach(a => {
    if (!dayCount[a.day]) dayCount[a.day] = new Set();
    dayCount[a.day].add(a.user_id);
  });
  const bestDay = Object.entries(dayCount).sort((a, b) => b[1].size - a[1].size)[0];
  const totalSlots = availabilities.reduce((sum, a) => sum + (a.moments?.length || 0), 0);

  let activityLabel = t.groups.noActivity; let activityColor = 'text-zinc-500';
  if (pintaPercent >= 75) { activityLabel = t.groups.highActivity; activityColor = 'text-orange-400'; }
  else if (pintaPercent >= 50) { activityLabel = t.groups.mediumActivity; activityColor = 'text-pink-400'; }
  else if (pintaPercent >= 25) { activityLabel = t.groups.lowActivity; activityColor = 'text-purple-400'; }
  else if (membersWithPinta > 0) { activityLabel = t.groups.startingActivity; activityColor = 'text-blue-400'; }

  return { membersWithPinta, totalMembers, pintaPercent, bestDay, totalSlots, activityLabel, activityColor };
}

function computeMemberMetrics(userId: string, availabilities: any[]) {
  const mine = availabilities.filter(a => a.user_id === userId);
  return { totalDays: mine.length, totalMoments: mine.reduce((sum, a) => sum + (a.moments?.length || 0), 0) };
}

// Medal helper
function medal(rank: number) {
  if (rank === 0) return '🥇';
  if (rank === 1) return '🥈';
  if (rank === 2) return '🥉';
  return `#${rank + 1}`;
}

// ── Main Page ──────────────────────────────────────────────────────
export default function Home() {
  const { t, language, setLanguage } = useLanguage();
  const router = useRouter();

  const MOMENTS = [
    { id: 'morning', label: t.availability.moments.morning, hours: '08–12', icon: Coffee, color: 'from-orange-400 to-amber-500' },
    { id: 'afternoon', label: t.availability.moments.afternoon, hours: '12–19', icon: Sun, color: 'from-pink-500 to-rose-500' },
    { id: 'evening', label: t.availability.moments.evening, hours: '19–00', icon: Sunset, color: 'from-purple-600 to-violet-700' },
    { id: 'latenight', label: t.availability.moments.latenight, hours: '00–04', icon: Moon, color: 'from-slate-600 to-zinc-800' },
  ];

  const MOMERNT_ICONS: Record<string, string> = {
    morning: '🌅', afternoon: '☀️', evening: '🌙', latenight: '🌃',
  };

  const MOMENT_LABEL: Record<string, string> = {
    morning: `${MOMERNT_ICONS.morning} ${t.availability.moments.morning}`,
    afternoon: `${MOMERNT_ICONS.afternoon} ${t.availability.moments.afternoon}`,
    evening: `${MOMERNT_ICONS.evening} ${t.availability.moments.evening}`,
    latenight: `${MOMERNT_ICONS.latenight} ${t.availability.moments.latenight}`,
  };
  const today = startOfToday();
  const week = eachDayOfInterval({ start: today, end: addDays(today, 6) });

  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [availabilities, setAvailabilities] = useState<any[]>([]);

  // Comments
  const [comments, setComments] = useState<Record<string, any[]>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Availability form
  const [selectedDay, setSelectedDay] = useState(today);
  const [mySelection, setMySelection] = useState<Record<string, string[]>>({});
  const [myNotes, setMyNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Game
  const [isGameOpen, setIsGameOpen] = useState(false);
  const [groupScores, setGroupScores] = useState<any[]>([]); // top scores for current group members
  const [myBest, setMyBest] = useState(0);

  // ── Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) router.push('/login');
      else fetchGroups();
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) router.push('/login');
    });
    return () => subscription.unsubscribe();
  }, [router]);

  const fetchGroups = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('groups').select('*, group_members!inner(*)')
      .eq('group_members.user_id', user.id);
    const fetched = data || [];
    setGroups(fetched);
    if (fetched.length > 0 && !selectedGroup) setSelectedGroup(fetched[0]);
  };

  useEffect(() => { if (selectedGroup) fetchGroupData(); }, [selectedGroup]);

  const fetchGroupData = async () => {
    const { data: members } = await supabase.from('group_members').select('profiles(*)')
      .eq('group_id', selectedGroup.id);
    if (!members) return;
    const profiles = members.map((m: any) => m.profiles).filter(Boolean);
    setGroupMembers(profiles);
    const ids = profiles.map((p: any) => p.id);
    if (!ids.length) return;

    const { data: avails } = await supabase.from('availability').select('*')
      .in('user_id', ids).gte('day', format(today, 'yyyy-MM-dd')).order('day');
    const fetchedAvails = avails || [];
    setAvailabilities(fetchedAvails);

    // Fetch comments
    const availIds = fetchedAvails.map(a => a.id);
    if (availIds.length > 0) {
      const { data: cmts } = await supabase.from('comments').select('*, profiles(*)')
        .in('availability_id', availIds).order('created_at');
      const grouped: Record<string, any[]> = {};
      (cmts || []).forEach((c: any) => {
        if (!grouped[c.availability_id]) grouped[c.availability_id] = [];
        grouped[c.availability_id].push(c);
      });
      setComments(grouped);
    }

    // Fetch scores for group members — best score per user
    const { data: scores } = await supabase.from('scores')
      .select('user_id, score, profiles(*)')
      .in('user_id', ids)
      .order('score', { ascending: false });

    // Deduplicate: keep highest score per user
    const seen = new Set<string>();
    const best: any[] = [];
    (scores || []).forEach((s: any) => {
      if (!seen.has(s.user_id)) { seen.add(s.user_id); best.push(s); }
    });
    setGroupScores(best);
  };

  const fetchMyBest = useCallback(async (userId: string) => {
    const { data } = await supabase.from('scores').select('score')
      .eq('user_id', userId).order('score', { ascending: false }).limit(1).single();
    setMyBest(data?.score || 0);
  }, []);

  const handleGameOver = useCallback(async (score: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('scores').insert({ user_id: user.id, score });
    await fetchMyBest(user.id);
    if (selectedGroup) fetchGroupData();
  }, [selectedGroup, fetchMyBest]);

  useEffect(() => {
    if (session?.user) fetchMyBest(session.user.id);
  }, [session, fetchMyBest]);

  const postReply = async (availabilityId: string) => {
    if (!replyDraft.trim()) return;
    setSendingReply(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('comments').insert({ availability_id: availabilityId, user_id: user.id, content: replyDraft.trim() });
    setReplyDraft('');
    setReplyingTo(null);
    setSendingReply(false);
    const availIds = availabilities.map(a => a.id);
    const { data: cmts } = await supabase.from('comments').select('*, profiles(*)').in('availability_id', availIds).order('created_at');
    const grouped: Record<string, any[]> = {};
    (cmts || []).forEach((c: any) => { if (!grouped[c.availability_id]) grouped[c.availability_id] = []; grouped[c.availability_id].push(c); });
    setComments(grouped);
  };

  const saveAvailability = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const ds = format(selectedDay, 'yyyy-MM-dd');
    const { error } = await supabase.from('availability')
      .upsert({ user_id: user.id, day: ds, moments: mySelection[ds] || [], note: myNotes[ds] || null }, { onConflict: 'user_id,day' });
    setSaving(false);
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2500); if (selectedGroup) fetchGroupData(); }
  };

  const toggleMoment = (id: string) => {
    const ds = format(selectedDay, 'yyyy-MM-dd');
    setMySelection(prev => { const c = prev[ds] || []; return { ...prev, [ds]: c.includes(id) ? c.filter(m => m !== id) : [...c, id] }; });
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault(); setCreatingGroup(true);
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
    const { data: group, error } = await supabase.from('groups').insert({ name: newGroupName, created_by: user.id }).select().single();
    if (!error) {
      await supabase.from('group_members').insert({ group_id: group.id, user_id: user.id });
      setIsGroupModalOpen(false); setNewGroupName('');
      await fetchGroups(); setSelectedGroup(group);
    }
    setCreatingGroup(false);
  };

  const handleCopyLink = (id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/join/${id}`);
    setCopiedId(id); setTimeout(() => setCopiedId(null), 2000);
  };

  // ── Derived
  const dayStr = format(selectedDay, 'yyyy-MM-dd');
  const currentMoments = mySelection[dayStr] || [];
  const currentNote = myNotes[dayStr] || '';
  const groupMetrics = useMemo(() => computeGroupMetrics(availabilities, groupMembers, t), [availabilities, groupMembers, t]);
  const availByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    availabilities.forEach(slot => { if (!map[slot.day]) map[slot.day] = []; map[slot.day].push(slot); });
    return map;
  }, [availabilities]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!session) return null;
  const user = session.user;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">

      {/* ── HEADER */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-black/60 border-b border-white/5 px-4 md:px-8 py-3 flex items-center justify-between">
        <h1 className="text-2xl font-black italic bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent tracking-tight">
          {t.common.appName}
        </h1>
        <div className="flex items-center gap-2">
          {/* Language Switcher */}
          <button
            onClick={() => setLanguage(language === 'es' ? 'en' : 'es')}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 font-bold text-xs rounded-full px-3 py-1.5 transition-all"
          >
            {language === 'es' ? 'EN' : 'ES'}
          </button>

          {/* Jugar button */}
          <button
            onClick={() => setIsGameOpen(true)}
            className="flex items-center gap-2 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/20 text-purple-300 hover:text-purple-200 font-bold text-sm rounded-full px-3.5 py-1.5 transition-all"
          >
            <Gamepad2 size={15} />
            <span className="hidden sm:inline">{t.game.playBtn}</span>
            {myBest > 0 && <span className="text-[10px] bg-purple-500/20 rounded-full px-1.5 font-black">{myBest}</span>}
          </button>

          <div className="flex items-center gap-2 bg-white/5 rounded-full py-1.5 px-3">
            <img
              src={user.user_metadata.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`}
              className="w-6 h-6 rounded-full" alt="yo"
            />
            <span className="text-sm font-semibold text-zinc-300 hidden sm:inline">
              {user.user_metadata.full_name?.split(' ')[0]}
            </span>
          </div>
          <button
            onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}
            className="p-2 rounded-full bg-white/5 hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors"
            title={t.auth.logout}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* ── MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_1fr] min-h-[calc(100vh-57px)]">

        {/* ══ COL 1: GRUPOS */}
        <aside className="border-r border-white/5 p-4 space-y-2 overflow-y-auto">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{t.groups.title}</h2>
            <button onClick={() => setIsGroupModalOpen(true)}
              className="w-7 h-7 rounded-full bg-white/5 hover:bg-pink-500/20 hover:text-pink-400 flex items-center justify-center text-zinc-500 transition-colors">
              <Plus size={14} />
            </button>
          </div>

          {groups.length === 0 ? (
            <button onClick={() => setIsGroupModalOpen(true)}
              className="w-full py-6 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center gap-2 hover:border-pink-500/30 hover:bg-pink-500/5 transition-all group">
              <Plus size={20} className="text-zinc-600 group-hover:text-pink-500 transition-colors" />
              <span className="text-xs text-zinc-600 group-hover:text-zinc-400 font-bold">{t.groups.createFirst}</span>
            </button>
          ) : (
            groups.map(group => {
              const isSelected = selectedGroup?.id === group.id;
              return (
                <div key={group.id} onClick={() => setSelectedGroup(group)}
                  className={`rounded-2xl p-3 cursor-pointer transition-all border ${isSelected ? 'bg-pink-500/10 border-pink-500/30' : 'bg-white/3 border-transparent hover:bg-white/5'}`}>
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isSelected ? 'bg-pink-500 text-white' : 'bg-white/10 text-zinc-500'}`}>
                      <Users2 size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold text-sm truncate ${isSelected ? 'text-white' : 'text-zinc-300'}`}>{group.name}</p>
                      {isSelected && groupMetrics
                        ? <p className={`text-[10px] font-bold ${groupMetrics.activityColor}`}>{groupMetrics.activityLabel}</p>
                        : <p className="text-[10px] text-zinc-600 font-medium">{t.groups.private}</p>}
                    </div>
                    {isSelected && <div className="w-2 h-2 rounded-full bg-pink-500 animate-pulse shrink-0" />}
                  </div>

                  {isSelected && (
                    <>
                      {/* Availability metrics */}
                      {groupMetrics && (
                        <>
                          <div className="mt-3 grid grid-cols-3 gap-1.5">
                            {[
                              { val: `${groupMetrics.pintaPercent}%`, label: t.groups.availabilityLabel },
                              { val: groupMetrics.totalSlots, label: t.groups.timeSlots },
                              { val: `${groupMetrics.membersWithPinta}/${groupMetrics.totalMembers}`, label: t.groups.activeMembers },
                            ].map(({ val, label }) => (
                              <div key={label} className="bg-white/5 rounded-xl p-2 text-center">
                                <p className="text-base font-black text-white">{val}</p>
                                <p className="text-[9px] text-zinc-500 font-bold uppercase leading-tight mt-0.5">{label}</p>
                              </div>
                            ))}
                          </div>
                          {groupMetrics.bestDay && (
                            <div className="mt-2 flex items-center gap-1.5 bg-pink-500/5 rounded-xl px-2.5 py-1.5">
                              <CalendarCheck size={11} className="text-pink-400 shrink-0" />
                              <p className="text-[10px] text-zinc-400">
                                {t.groups.bestDay}:{' '}
                                <span className="font-bold text-pink-300 capitalize">
                                  {format(parseISO(groupMetrics.bestDay[0]), "EEEE d/M", { locale: language === 'es' ? es : undefined })}
                                </span>
                                <span className="text-zinc-600 ml-1">({groupMetrics.bestDay[1].size} {groupMetrics.bestDay[1].size === 1 ? t.agenda.person : t.agenda.pibes})</span>
                              </p>
                            </div>
                          )}
                        </>
                      )}

                      {/* Invite */}
                      <button onClick={e => { e.stopPropagation(); handleCopyLink(group.id); }}
                        className={`mt-2.5 w-full py-1.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all border ${copiedId === group.id ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-white/5 text-zinc-400 border-white/5 hover:bg-pink-500/10 hover:text-pink-400 hover:border-pink-500/20'}`}>
                        {copiedId === group.id ? <><CheckCircle size={12} /> {t.groups.linkCopied}</> : <><Share2 size={12} /> {t.groups.inviteBtn}</>}
                      </button>

                      {/* Members */}
                      {groupMembers.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/8">
                          <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-2">{t.groups.members}</p>
                          <div className="space-y-2">
                            {groupMembers.map(m => {
                              const stats = computeMemberMetrics(m.id, availabilities);
                              const isMe = m.id === user.id;
                              return (
                                <div key={m.id} className="flex items-center gap-2">
                                  <img src={m.avatar_url} alt={m.full_name} className="w-6 h-6 rounded-full border border-white/10 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] text-zinc-300 font-semibold leading-tight truncate">{isMe ? t.common.me : m.full_name?.split(' ')[0]}</p>
                                    <p className="text-[9px] text-zinc-600 leading-tight">
                                      {stats.totalDays > 0 ? `${stats.totalDays} ${stats.totalDays === 1 ? t.agenda.dayThisWeek : t.agenda.daysThisWeek} · ${stats.totalMoments} ${t.groups.timeSlots}` : t.groups.noActivity}
                                    </p>
                                  </div>
                                  {stats.totalMoments >= 4 && <Flame size={12} className="text-orange-400 shrink-0" />}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 🎮 Game Leaderboard */}
                      {groupScores.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-white/8">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-1.5">
                              <Trophy size={14} className="text-yellow-400" />
                              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-yellow-500/90">{t.game.leaderboard.split(' - ')[0]}</p>
                            </div>
                            <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest px-2 py-0.5 bg-white/5 rounded-full">Top 5</span>
                          </div>
                          <div className="space-y-1.5">
                            {groupScores.slice(0, 5).map((s, i) => {
                              const m = s.profiles;
                              const isMe = s.user_id === user.id;
                              return (
                                <motion.div
                                  key={s.user_id}
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: i * 0.1 }}
                                  className={`flex items-center gap-2.5 rounded-2xl px-3 py-2 ${isMe ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-white/3 border border-transparent'}`}
                                >
                                  <span className="text-sm w-5 flex justify-center shrink-0 font-black">{medal(i)}</span>
                                  <img src={m?.avatar_url} className="w-6 h-6 rounded-full border border-white/10 shrink-0" alt="" />
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-[11px] font-bold truncate ${isMe ? 'text-yellow-200' : 'text-zinc-300'}`}>
                                      {isMe ? t.common.me : m?.full_name?.split(' ')[0]}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xs font-black text-yellow-400 leading-none">{s.score}</p>
                                    <p className="text-[8px] font-bold text-zinc-600 uppercase tracking-tighter">pts</p>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}
        </aside>

        {/* ══ COL 2: MI DISPONIBILIDAD */}
        <section className="border-r border-white/5 p-4 md:p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{t.availability.title}</h2>
            <p className="text-[10px] text-zinc-700 mt-0.5">{t.availability.subtitle}</p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {week.map(day => {
              const ds = format(day, 'yyyy-MM-dd');
              const isSel = isSameDay(day, selectedDay);
              const hasData = (mySelection[ds] || []).length > 0;
              return (
                <button key={ds} onClick={() => setSelectedDay(day)}
                  className={`flex flex-col items-center min-w-[52px] py-3 rounded-2xl transition-all relative ${isSel ? 'bg-white text-black shadow-lg' : 'bg-white/5 text-zinc-400 hover:bg-white/10'}`}>
                  <span className="text-[9px] font-bold uppercase tracking-tight opacity-60 mb-0.5">{format(day, 'EEE', { locale: language === 'es' ? es : undefined })}</span>
                  <span className="text-lg font-black leading-none">{format(day, 'd')}</span>
                  {hasData && !isSel && <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-pink-500 rounded-full" />}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3 flex-1">
            {MOMENTS.map(({ id, label, hours, icon: Icon, color }) => {
              const isOn = currentMoments.includes(id);
              return (
                <button key={id} onClick={() => toggleMoment(id)}
                  className={`relative rounded-3xl p-4 text-left transition-all duration-200 ${isOn ? `bg-gradient-to-br ${color} shadow-lg scale-[0.98]` : 'bg-white/5 hover:bg-white/8 border border-white/5'}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${isOn ? 'bg-white/20' : 'bg-white/5'}`}>
                    <Icon size={18} className={isOn ? 'text-white' : 'text-zinc-500'} />
                  </div>
                  <p className={`font-black text-sm ${isOn ? 'text-white' : 'text-zinc-300'}`}>{label}</p>
                  <p className={`text-[10px] ${isOn ? 'text-white/60' : 'text-zinc-600'}`}>{hours}</p>
                  <AnimatePresence>
                    {isOn && (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                        className="absolute top-3 right-3 w-6 h-6 bg-white rounded-full flex items-center justify-center">
                        <Check size={12} strokeWidth={3} className="text-black" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              );
            })}
          </div>
          <div className="relative">
            <MessageSquare size={14} className="absolute left-3.5 top-3.5 text-zinc-600 pointer-events-none" />
            <input type="text" value={currentNote} onChange={e => setMyNotes(prev => ({ ...prev, [dayStr]: e.target.value }))}
              placeholder={t.availability.notePlaceholder} maxLength={80}
              className="w-full bg-white/5 border border-white/8 rounded-2xl pl-9 pr-4 py-3 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-pink-500/50 transition-colors" />
          </div>
          <button onClick={saveAvailability} disabled={saving || currentMoments.length === 0}
            className="w-full py-3.5 premium-gradient text-white font-black rounded-2xl shadow-lg shadow-pink-500/20 hover:scale-[1.01] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {saving ? <Loader2 size={18} className="animate-spin" />
              : saved ? <><CheckCircle size={18} /> {t.availability.confirmed}</>
                : <><Zap size={18} fill="currentColor" /> {t.availability.confirmBtn}</>}
          </button>
        </section>

        {/* ══ COL 3: AGENDA */}
        <section className="p-4 md:p-6 flex flex-col gap-4 overflow-y-auto">
          {!selectedGroup ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
              <Users2 size={28} className="text-zinc-700 mb-3" />
              <p className="font-bold text-zinc-500">{t.agenda.selectGroup}</p>
            </div>
          ) : (
            <>
              <div>
                <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.2em]">{t.agenda.title}</p>
                <div className="flex items-center justify-between">
                  <h2 className="font-black text-xl uppercase italic">{selectedGroup.name}</h2>
                  <button onClick={fetchGroupData} className="text-[10px] font-bold text-zinc-700 hover:text-zinc-400 uppercase tracking-wider transition-colors">{t.common.refresh}</button>
                </div>
              </div>

              {availabilities.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center border border-dashed border-white/8 rounded-3xl py-12 gap-3">
                  <Coffee size={32} className="text-zinc-700" />
                  <div>
                    <p className="font-bold text-zinc-500 text-sm">{t.agenda.emptyState}</p>
                    <p className="text-[11px] text-zinc-700 mt-1">{t.agenda.emptySubtitle}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(availByDay).map(([day, slots]) => {
                    const isToday = day === format(today, 'yyyy-MM-dd');
                    const uniqueCount = new Set(slots.map((s: any) => s.user_id)).size;
                    return (
                      <motion.div key={day} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`rounded-xl px-3 py-1.5 text-center min-w-[48px] ${isToday ? 'bg-pink-500 text-white' : 'bg-white/8 text-zinc-300'}`}>
                            <p className="text-[9px] font-black uppercase tracking-widest opacity-70 leading-none">
                              {isToday ? (language === 'es' ? 'HOY' : 'TODAY') : format(parseISO(day), 'EEE', { locale: language === 'es' ? es : undefined }).toUpperCase()}
                            </p>
                            <p className="text-xl font-black leading-tight">{format(parseISO(day), 'd')}</p>
                            <p className="text-[9px] font-bold opacity-60 capitalize leading-none">{format(parseISO(day), 'MMM', { locale: language === 'es' ? es : undefined })}</p>
                          </div>
                          <div className="flex-1 border-t border-white/8" />
                          <div className="flex items-center gap-1.5 bg-white/5 rounded-full px-2.5 py-1 shrink-0">
                            <div className="flex -space-x-2">
                              {slots.slice(0, 4).map((s: any) => {
                                const m = groupMembers.find(gm => gm.id === s.user_id);
                                return m ? <img key={s.id} src={m.avatar_url} className="w-5 h-5 rounded-full border-2 border-black" alt="" /> : null;
                              })}
                            </div>
                            <span className="text-[10px] font-bold text-zinc-400">{uniqueCount} {uniqueCount === 1 ? t.agenda.person : t.agenda.pibes}</span>
                          </div>
                        </div>

                        <div className="space-y-2 ml-1">
                          {slots.map((slot: any) => {
                            const member = groupMembers.find(m => m.id === slot.user_id);
                            if (!member) return null;
                            const isMe = member.id === user.id;
                            const stats = computeMemberMetrics(member.id, availabilities);
                            const slotComments = comments[slot.id] || [];
                            const isReplying = replyingTo === slot.id;
                            return (
                              <div key={slot.id}
                                className={`rounded-2xl p-3.5 border-l-[3px] ${isMe ? 'bg-purple-500/5 border-l-purple-500' : 'bg-white/3 border-l-pink-500/50'}`}>
                                <div className="flex items-center gap-2.5">
                                  <img src={member.avatar_url} alt={member.full_name} className="w-8 h-8 rounded-full border border-white/10 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="font-bold text-sm">{isMe ? t.common.me : member.full_name?.split(' ')[0]}</p>
                                      {stats.totalMoments >= 4 && <Flame size={12} className="text-orange-400" />}
                                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${isMe ? 'bg-purple-500/15 text-purple-400' : 'bg-pink-500/10 text-pink-400'}`}>
                                        {stats.totalDays} {stats.totalDays === 1 ? t.agenda.dayThisWeek : t.agenda.daysThisWeek}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                      {slot.moments?.map((m: string) => (
                                        <span key={m} className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isMe ? 'bg-purple-500/15 text-purple-300' : 'bg-pink-500/10 text-pink-300'}`}>
                                          {MOMENT_LABEL[m] || m}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                {slot.note && (
                                  <div className="mt-2 flex items-start gap-2 bg-white/5 rounded-xl px-3 py-2">
                                    <MessageSquare size={11} className="text-zinc-500 shrink-0 mt-0.5" />
                                    <p className="text-[11px] text-zinc-300 italic flex-1">"{slot.note}"</p>
                                  </div>
                                )}

                                {slotComments.length > 0 && (
                                  <div className="mt-2 ml-3 space-y-1.5">
                                    {slotComments.map((c: any) => {
                                      const commenter = c.profiles;
                                      const cIsMe = c.user_id === user.id;
                                      return (
                                        <div key={c.id} className="flex items-start gap-2">
                                          <CornerDownRight size={12} className="text-zinc-700 shrink-0 mt-1" />
                                          <img src={commenter?.avatar_url} alt="" className="w-5 h-5 rounded-full border border-white/10 shrink-0" />
                                          <div className={`flex-1 rounded-xl px-2.5 py-1.5 ${cIsMe ? 'bg-purple-500/10' : 'bg-white/5'}`}>
                                            <span className="text-[10px] font-bold text-zinc-400 mr-1.5">{cIsMe ? t.common.me : commenter?.full_name?.split(' ')[0]}</span>
                                            <span className="text-[11px] text-zinc-300">{c.content}</span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                <div className="mt-2 ml-3">
                                  <AnimatePresence>
                                    {isReplying ? (
                                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                        className="flex items-center gap-2">
                                        <CornerDownRight size={12} className="text-zinc-700 shrink-0" />
                                        <input autoFocus type="text" value={replyDraft} onChange={e => setReplyDraft(e.target.value)}
                                          onKeyDown={e => e.key === 'Enter' && postReply(slot.id)}
                                          placeholder={t.agenda.replyPlaceholder} maxLength={200}
                                          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-pink-500/50 transition-colors" />
                                        <button onClick={() => postReply(slot.id)} disabled={sendingReply || !replyDraft.trim()}
                                          className="w-7 h-7 bg-pink-500 hover:bg-pink-400 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 shrink-0">
                                          {sendingReply ? <Loader2 size={12} className="animate-spin text-white" /> : <Send size={12} className="text-white" />}
                                        </button>
                                        <button onClick={() => { setReplyingTo(null); setReplyDraft(''); }}
                                          className="w-7 h-7 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-zinc-500 transition-colors shrink-0">
                                          <X size={12} />
                                        </button>
                                      </motion.div>
                                    ) : (
                                      <button onClick={() => setReplyingTo(slot.id)}
                                        className="flex items-center gap-1.5 text-[10px] text-zinc-600 hover:text-zinc-400 font-bold transition-colors group">
                                        <CornerDownRight size={11} className="group-hover:text-pink-500 transition-colors" />
                                        {t.agenda.reply}{slotComments.length > 0 ? ` (${slotComments.length})` : ''}
                                      </button>
                                    )}
                                  </AnimatePresence>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* ── GAME MODAL */}
      <AnimatePresence>
        {isGameOpen && (
          <FlappyBird
            onClose={() => setIsGameOpen(false)}
            onGameOver={handleGameOver}
            personalBest={myBest}
          />
        )}
      </AnimatePresence>

      {/* ── CREATE GROUP MODAL */}
      <AnimatePresence>
        {isGroupModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsGroupModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
              className="relative w-full max-w-md bg-zinc-900 rounded-3xl p-6 border border-white/10 shadow-2xl">
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h2 className="text-xl font-black italic">{t.groups.newGroup}</h2>
                  <p className="text-zinc-500 text-xs mt-0.5">{t.groups.groupDesc}</p>
                </div>
                <button onClick={() => setIsGroupModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={20} /></button>
              </div>
              <form onSubmit={handleCreateGroup} className="space-y-4">
                <input type="text" autoFocus required value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                  placeholder={t.groups.groupNamePlaceholder}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder-zinc-600 focus:outline-none focus:border-pink-500 transition-colors" />
                <button type="submit" disabled={creatingGroup || !newGroupName.trim()}
                  className="w-full py-3.5 premium-gradient text-white font-black rounded-2xl shadow-xl shadow-pink-500/20 transition-all disabled:opacity-40">
                  {creatingGroup ? t.groups.creating : t.groups.createBtn}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
