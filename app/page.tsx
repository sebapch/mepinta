'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users2, Plus, Share2, CheckCircle, LogOut, Zap,
  Coffee, Sun, Sunset, Moon, Check, Loader2, X,
  MessageSquare, Flame, CalendarCheck
} from 'lucide-react';
import { format, addDays, startOfToday, eachDayOfInterval, isSameDay, parseISO, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '../lib/supabase';
import { useRouter } from 'next/navigation';

// ── Constants ──────────────────────────────────────────────────────
const MOMENTS = [
  { id: 'morning', label: 'Mañana', hours: '08–12', icon: Coffee, color: 'from-orange-400 to-amber-500' },
  { id: 'afternoon', label: 'Tarde', hours: '12–19', icon: Sun, color: 'from-pink-500 to-rose-500' },
  { id: 'evening', label: 'Noche', hours: '19–00', icon: Sunset, color: 'from-purple-600 to-violet-700' },
  { id: 'latenight', label: 'Madrugada', hours: '00–04', icon: Moon, color: 'from-slate-600 to-zinc-800' },
];

const MOMENT_LABEL: Record<string, string> = {
  morning: '🌅 Mañana', afternoon: '☀️ Tarde', evening: '🌙 Noche', latenight: '🌃 Madrugada',
};

// ── Helpers ────────────────────────────────────────────────────────
function computeGroupMetrics(availabilities: any[], groupMembers: any[]) {
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

  let activityLabel = '😴 Sin actividad';
  let activityColor = 'text-zinc-500';
  if (pintaPercent >= 75) { activityLabel = '🔥 Todos tienen pinta'; activityColor = 'text-orange-400'; }
  else if (pintaPercent >= 50) { activityLabel = '⚡ Mucha pinta'; activityColor = 'text-pink-400'; }
  else if (pintaPercent >= 25) { activityLabel = '✨ Algo está cocinando'; activityColor = 'text-purple-400'; }
  else if (membersWithPinta > 0) { activityLabel = '🌱 Arrancando'; activityColor = 'text-blue-400'; }

  return { membersWithPinta, totalMembers, pintaPercent, bestDay, totalSlots, activityLabel, activityColor };
}

function computeMemberMetrics(userId: string, availabilities: any[]) {
  const mine = availabilities.filter(a => a.user_id === userId);
  const totalDays = mine.length;
  const totalMoments = mine.reduce((sum, a) => sum + (a.moments?.length || 0), 0);
  return { totalDays, totalMoments };
}

// ── Main Page ──────────────────────────────────────────────────────
export default function Home() {
  const router = useRouter();
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

  const [selectedDay, setSelectedDay] = useState(today);
  const [mySelection, setMySelection] = useState<Record<string, string[]>>({});
  const [myNotes, setMyNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    const { data } = await supabase
      .from('groups')
      .select('*, group_members!inner(*)')
      .eq('group_members.user_id', user.id);
    const fetched = data || [];
    setGroups(fetched);
    if (fetched.length > 0 && !selectedGroup) setSelectedGroup(fetched[0]);
  };

  useEffect(() => {
    if (selectedGroup) fetchGroupData();
  }, [selectedGroup]);

  const fetchGroupData = async () => {
    const { data: members } = await supabase
      .from('group_members').select('profiles(*)')
      .eq('group_id', selectedGroup.id);
    if (!members) return;
    const profiles = members.map((m: any) => m.profiles).filter(Boolean);
    setGroupMembers(profiles);
    const ids = profiles.map((p: any) => p.id);
    if (!ids.length) return;
    const { data: avails } = await supabase
      .from('availability').select('*')
      .in('user_id', ids)
      .gte('day', format(today, 'yyyy-MM-dd'))
      .order('day');
    setAvailabilities(avails || []);
  };

  const saveAvailability = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const ds = format(selectedDay, 'yyyy-MM-dd');
    const moments = mySelection[ds] || [];
    const note = myNotes[ds] || null;
    const { error } = await supabase
      .from('availability')
      .upsert({ user_id: user.id, day: ds, moments, note }, { onConflict: 'user_id,day' });
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      if (selectedGroup) fetchGroupData();
    }
  };

  const toggleMoment = (momentId: string) => {
    const ds = format(selectedDay, 'yyyy-MM-dd');
    setMySelection(prev => {
      const cur = prev[ds] || [];
      return { ...prev, [ds]: cur.includes(momentId) ? cur.filter(m => m !== momentId) : [...cur, momentId] };
    });
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingGroup(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: group, error } = await supabase
      .from('groups').insert({ name: newGroupName, created_by: user.id }).select().single();
    if (!error) {
      await supabase.from('group_members').insert({ group_id: group.id, user_id: user.id });
      setIsGroupModalOpen(false);
      setNewGroupName('');
      await fetchGroups();
      setSelectedGroup(group);
    }
    setCreatingGroup(false);
  };

  const handleCopyLink = (id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/join/${id}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── Derived
  const dayStr = format(selectedDay, 'yyyy-MM-dd');
  const currentMoments = mySelection[dayStr] || [];
  const currentNote = myNotes[dayStr] || '';
  const groupMetrics = useMemo(() => computeGroupMetrics(availabilities, groupMembers), [availabilities, groupMembers]);

  // Group availability by day for agenda
  const availByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    availabilities.forEach(slot => {
      if (!map[slot.day]) map[slot.day] = [];
      map[slot.day].push(slot);
    });
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
          MePinta
        </h1>
        <div className="flex items-center gap-2">
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
            title="Cerrar sesión"
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
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Mis Grupos</h2>
            <button
              onClick={() => setIsGroupModalOpen(true)}
              className="w-7 h-7 rounded-full bg-white/5 hover:bg-pink-500/20 hover:text-pink-400 flex items-center justify-center text-zinc-500 transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>

          {groups.length === 0 ? (
            <button
              onClick={() => setIsGroupModalOpen(true)}
              className="w-full py-6 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center gap-2 hover:border-pink-500/30 hover:bg-pink-500/5 transition-all group"
            >
              <Plus size={20} className="text-zinc-600 group-hover:text-pink-500 transition-colors" />
              <span className="text-xs text-zinc-600 group-hover:text-zinc-400 font-bold">Crear primer grupo</span>
            </button>
          ) : (
            groups.map(group => {
              const isSelected = selectedGroup?.id === group.id;
              return (
                <div
                  key={group.id}
                  onClick={() => setSelectedGroup(group)}
                  className={`rounded-2xl p-3 cursor-pointer transition-all border ${isSelected ? 'bg-pink-500/10 border-pink-500/30' : 'bg-white/3 border-transparent hover:bg-white/5'
                    }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isSelected ? 'bg-pink-500 text-white' : 'bg-white/10 text-zinc-500'}`}>
                      <Users2 size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold text-sm truncate ${isSelected ? 'text-white' : 'text-zinc-300'}`}>{group.name}</p>
                      {isSelected && groupMetrics ? (
                        <p className={`text-[10px] font-bold ${groupMetrics.activityColor}`}>{groupMetrics.activityLabel}</p>
                      ) : (
                        <p className="text-[10px] text-zinc-600 font-medium">Grupo privado</p>
                      )}
                    </div>
                    {isSelected && <div className="w-2 h-2 rounded-full bg-pink-500 animate-pulse shrink-0" />}
                  </div>

                  {isSelected && (
                    <>
                      {/* Group metrics */}
                      {groupMetrics && (
                        <>
                          <div className="mt-3 grid grid-cols-3 gap-1.5">
                            <div className="bg-white/5 rounded-xl p-2 text-center">
                              <p className="text-base font-black text-white">{groupMetrics.pintaPercent}%</p>
                              <p className="text-[9px] text-zinc-500 font-bold uppercase leading-tight mt-0.5">Tienen pinta</p>
                            </div>
                            <div className="bg-white/5 rounded-xl p-2 text-center">
                              <p className="text-base font-black text-white">{groupMetrics.totalSlots}</p>
                              <p className="text-[9px] text-zinc-500 font-bold uppercase leading-tight mt-0.5">Momentos</p>
                            </div>
                            <div className="bg-white/5 rounded-xl p-2 text-center">
                              <p className="text-base font-black text-white">{groupMetrics.membersWithPinta}/{groupMetrics.totalMembers}</p>
                              <p className="text-[9px] text-zinc-500 font-bold uppercase leading-tight mt-0.5">Activos</p>
                            </div>
                          </div>
                          {groupMetrics.bestDay && (
                            <div className="mt-2 flex items-center gap-1.5 bg-pink-500/5 rounded-xl px-2.5 py-1.5">
                              <CalendarCheck size={11} className="text-pink-400 shrink-0" />
                              <p className="text-[10px] text-zinc-400">
                                Mejor día: <span className="font-bold text-pink-300 capitalize">
                                  {format(parseISO(groupMetrics.bestDay[0]), "EEEE d/M", { locale: es })}
                                </span>
                                <span className="text-zinc-600 ml-1">({groupMetrics.bestDay[1].size} pibes)</span>
                              </p>
                            </div>
                          )}
                        </>
                      )}

                      {/* Invite link */}
                      <button
                        onClick={e => { e.stopPropagation(); handleCopyLink(group.id); }}
                        className={`mt-2.5 w-full py-1.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all border ${copiedId === group.id
                            ? 'bg-green-500/10 text-green-400 border-green-500/20'
                            : 'bg-white/5 text-zinc-400 border-white/5 hover:bg-pink-500/10 hover:text-pink-400 hover:border-pink-500/20'
                          }`}
                      >
                        {copiedId === group.id ? <><CheckCircle size={12} /> ¡Link copiado!</> : <><Share2 size={12} /> Invitar amigos</>}
                      </button>

                      {/* Members */}
                      {groupMembers.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/8">
                          <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-2">Miembros</p>
                          <div className="space-y-2">
                            {groupMembers.map(m => {
                              const stats = computeMemberMetrics(m.id, availabilities);
                              const isMe = m.id === user.id;
                              return (
                                <div key={m.id} className="flex items-center gap-2">
                                  <img src={m.avatar_url} alt={m.full_name} className="w-6 h-6 rounded-full border border-white/10 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] text-zinc-300 font-semibold leading-tight truncate">
                                      {isMe ? 'Vos' : m.full_name?.split(' ')[0]}
                                    </p>
                                    <p className="text-[9px] text-zinc-600 leading-tight">
                                      {stats.totalDays > 0
                                        ? `${stats.totalDays} día${stats.totalDays > 1 ? 's' : ''} · ${stats.totalMoments} momento${stats.totalMoments > 1 ? 's' : ''}`
                                        : 'Sin pinta marcada'}
                                    </p>
                                  </div>
                                  {stats.totalMoments >= 4 && (
                                    <Flame size={12} className="text-orange-400 shrink-0" />
                                  )}
                                </div>
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
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Mi Disponibilidad</h2>
            <p className="text-[10px] text-zinc-700 mt-0.5">Marcá cuándo tenés tiempo libre esta semana</p>
          </div>

          {/* Day selector */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {week.map(day => {
              const ds = format(day, 'yyyy-MM-dd');
              const isSel = isSameDay(day, selectedDay);
              const hasData = (mySelection[ds] || []).length > 0;
              return (
                <button
                  key={ds}
                  onClick={() => setSelectedDay(day)}
                  className={`flex flex-col items-center min-w-[52px] py-3 rounded-2xl transition-all relative ${isSel ? 'bg-white text-black shadow-lg' : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                    }`}
                >
                  <span className="text-[9px] font-bold uppercase tracking-tight opacity-60 mb-0.5">
                    {format(day, 'EEE', { locale: es })}
                  </span>
                  <span className="text-lg font-black leading-none">{format(day, 'd')}</span>
                  {hasData && !isSel && <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-pink-500 rounded-full" />}
                </button>
              );
            })}
          </div>

          {/* Moment cards */}
          <div className="grid grid-cols-2 gap-3 flex-1">
            {MOMENTS.map(({ id, label, hours, icon: Icon, color }) => {
              const isOn = currentMoments.includes(id);
              return (
                <button
                  key={id}
                  onClick={() => toggleMoment(id)}
                  className={`relative rounded-3xl p-4 text-left transition-all duration-200 ${isOn ? `bg-gradient-to-br ${color} shadow-lg scale-[0.98]` : 'bg-white/5 hover:bg-white/8 border border-white/5'
                    }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${isOn ? 'bg-white/20' : 'bg-white/5'}`}>
                    <Icon size={18} className={isOn ? 'text-white' : 'text-zinc-500'} />
                  </div>
                  <p className={`font-black text-sm ${isOn ? 'text-white' : 'text-zinc-300'}`}>{label}</p>
                  <p className={`text-[10px] ${isOn ? 'text-white/60' : 'text-zinc-600'}`}>{hours}</p>
                  <AnimatePresence>
                    {isOn && (
                      <motion.div
                        initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                        className="absolute top-3 right-3 w-6 h-6 bg-white rounded-full flex items-center justify-center"
                      >
                        <Check size={12} strokeWidth={3} className="text-black" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              );
            })}
          </div>

          {/* Note field */}
          <div className="relative">
            <MessageSquare size={14} className="absolute left-3.5 top-3.5 text-zinc-600 pointer-events-none" />
            <input
              type="text"
              value={currentNote}
              onChange={e => setMyNotes(prev => ({ ...prev, [dayStr]: e.target.value }))}
              placeholder='Ej: "vamos al parque 🌳"'
              maxLength={80}
              className="w-full bg-white/5 border border-white/8 rounded-2xl pl-9 pr-4 py-3 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-pink-500/50 transition-colors"
            />
          </div>

          {/* Save */}
          <button
            onClick={saveAvailability}
            disabled={saving || currentMoments.length === 0}
            className="w-full py-3.5 premium-gradient text-white font-black rounded-2xl shadow-lg shadow-pink-500/20 hover:scale-[1.01] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <Loader2 size={18} className="animate-spin" />
            ) : saved ? (
              <><CheckCircle size={18} /> ¡Pinta confirmada!</>
            ) : (
              <><Zap size={18} fill="currentColor" /> Confirmar pinta</>
            )}
          </button>
        </section>

        {/* ══ COL 3: AGENDA */}
        <section className="p-4 md:p-6 flex flex-col gap-4 overflow-y-auto">
          {!selectedGroup ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
              <Users2 size={28} className="text-zinc-700 mb-3" />
              <p className="font-bold text-zinc-500">Seleccioná un grupo para ver la agenda</p>
            </div>
          ) : (
            <>
              <div>
                <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.2em]">Agenda de</p>
                <div className="flex items-center justify-between">
                  <h2 className="font-black text-xl uppercase italic">{selectedGroup.name}</h2>
                  <button
                    onClick={fetchGroupData}
                    className="text-[10px] font-bold text-zinc-700 hover:text-zinc-400 uppercase tracking-wider transition-colors"
                  >
                    Actualizar
                  </button>
                </div>
              </div>

              {availabilities.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center border border-dashed border-white/8 rounded-3xl py-12 gap-3">
                  <Coffee size={32} className="text-zinc-700" />
                  <div>
                    <p className="font-bold text-zinc-500 text-sm">Nadie marcó pinta todavía</p>
                    <p className="text-[11px] text-zinc-700 mt-1">Confirmá tu disponibilidad en el panel de al lado.</p>
                  </div>
                </div>
              ) : (
                /* ── Grouped by day ── */
                <div className="space-y-6">
                  {Object.entries(availByDay).map(([day, slots]) => {
                    const isToday = day === format(today, 'yyyy-MM-dd');
                    const uniqueCount = new Set(slots.map((s: any) => s.user_id)).size;
                    return (
                      <motion.div key={day} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                        {/* Day header */}
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`rounded-xl px-3 py-1.5 text-center min-w-[48px] ${isToday ? 'bg-pink-500 text-white' : 'bg-white/8 text-zinc-300'}`}>
                            <p className="text-[9px] font-black uppercase tracking-widest opacity-70 leading-none">
                              {isToday ? 'HOY' : format(parseISO(day), 'EEE', { locale: es }).toUpperCase()}
                            </p>
                            <p className="text-xl font-black leading-tight">{format(parseISO(day), 'd')}</p>
                            <p className="text-[9px] font-bold opacity-60 capitalize leading-none">{format(parseISO(day), 'MMM', { locale: es })}</p>
                          </div>
                          <div className="flex-1 border-t border-white/8" />
                          {/* Avatar stack + count */}
                          <div className="flex items-center gap-1.5 bg-white/5 rounded-full px-2.5 py-1 shrink-0">
                            <div className="flex -space-x-2">
                              {slots.slice(0, 4).map((s: any) => {
                                const m = groupMembers.find(gm => gm.id === s.user_id);
                                return m ? <img key={s.id} src={m.avatar_url} className="w-5 h-5 rounded-full border-2 border-black" alt="" /> : null;
                              })}
                            </div>
                            <span className="text-[10px] font-bold text-zinc-400">{uniqueCount} pibe{uniqueCount !== 1 ? 's' : ''}</span>
                          </div>
                        </div>

                        {/* Member cards for this day */}
                        <div className="space-y-2 ml-1">
                          {slots.map((slot: any) => {
                            const member = groupMembers.find(m => m.id === slot.user_id);
                            if (!member) return null;
                            const isMe = member.id === user.id;
                            const stats = computeMemberMetrics(member.id, availabilities);
                            return (
                              <div
                                key={slot.id}
                                className={`rounded-2xl p-3.5 border-l-[3px] ${isMe ? 'bg-purple-500/5 border-l-purple-500' : 'bg-white/3 border-l-pink-500/50'
                                  }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <img src={member.avatar_url} alt={member.full_name} className="w-8 h-8 rounded-full border border-white/10 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="font-bold text-sm">{isMe ? 'Vos' : member.full_name?.split(' ')[0]}</p>
                                      {stats.totalMoments >= 4 && <Flame size={12} className="text-orange-400" />}
                                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${isMe ? 'bg-purple-500/15 text-purple-400' : 'bg-pink-500/10 text-pink-400'
                                        }`}>
                                        {stats.totalDays} día{stats.totalDays !== 1 ? 's' : ''} esta semana
                                      </span>
                                    </div>
                                    {/* Moment pills */}
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                      {slot.moments?.map((m: string) => (
                                        <span key={m} className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isMe ? 'bg-purple-500/15 text-purple-300' : 'bg-pink-500/10 text-pink-300'
                                          }`}>
                                          {MOMENT_LABEL[m] || m}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                                {/* Note */}
                                {slot.note && (
                                  <div className="mt-2 flex items-start gap-2 bg-white/5 rounded-xl px-3 py-2">
                                    <MessageSquare size={11} className="text-zinc-500 shrink-0 mt-0.5" />
                                    <p className="text-[11px] text-zinc-300 italic">"{slot.note}"</p>
                                  </div>
                                )}
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

      {/* ── CREATE GROUP MODAL */}
      <AnimatePresence>
        {isGroupModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsGroupModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
              className="relative w-full max-w-md bg-zinc-900 rounded-3xl p-6 border border-white/10 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h2 className="text-xl font-black italic">NUEVO GRUPO 🤝</h2>
                  <p className="text-zinc-500 text-xs mt-0.5">Tu grupo tendrá un link único para invitar amigos</p>
                </div>
                <button onClick={() => setIsGroupModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleCreateGroup} className="space-y-4">
                <input
                  type="text" autoFocus required
                  value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                  placeholder='Ej: "Los del Parque 🌳"'
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder-zinc-600 focus:outline-none focus:border-pink-500 transition-colors"
                />
                <button
                  type="submit"
                  disabled={creatingGroup || !newGroupName.trim()}
                  className="w-full py-3.5 premium-gradient text-white font-black rounded-2xl shadow-xl shadow-pink-500/20 transition-all disabled:opacity-40"
                >
                  {creatingGroup ? 'Creando...' : 'CREAR GRUPO'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
