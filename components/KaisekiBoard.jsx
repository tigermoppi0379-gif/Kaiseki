"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, ChefHat, Check, Settings, ListChecks, Plus, X, Clock } from "./icons";

const ALLERGENS = ["乳", "卵", "小麦", "そば", "落花生", "えび", "かに", "ナッツ"];
const ALLERGEN_COLOR = {
  "乳": "#F4C95D", "卵": "#F4A259", "小麦": "#E07A5F", "そば": "#9D8189",
  "落花生": "#BC4749", "えび": "#D08C60", "かに": "#D08C60", "ナッツ": "#A47148",
};
const START_TIMES = ["18:00", "18:15", "18:30"];

const COURSE_NAMES = {
  c1: "①前菜",
  c2: "②焼き物",
  c3: "③メイン",
  c4: "④デザート",
};
const COURSE_ORDER = ["c1", "c2", "c3", "c4"];

// serve (完成) times per start-time group
const DEFAULT_COURSE_TIMES = {
  "18:00": { c1: "17:45", c2: "18:10", c3: "18:30", c4: "19:05" },
  "18:15": { c1: "18:00", c2: "18:25", c3: "18:45", c4: "19:15" },
  "18:30": { c1: "18:15", c2: "18:40", c3: "19:25", c4: "19:55" },
};

// default alarm lead time (minutes before serve) per course
const DEFAULT_LEAD = { c1: 5, c2: 10, c3: 10, c4: 5 };

const ROOM_NAMES = ["セリ", "ナズナ", "ゴギョウ", "ハコベ", "ホトケノザ", "スズナ"];
const ROOM_COLORS = {
  "セリ": { main: "#DC2626", soft: "#FEF2F2", border: "#FCA5A5" },       // 赤
  "ナズナ": { main: "#16A34A", soft: "#F0FDF4", border: "#86EFAC" },     // 緑
  "ゴギョウ": { main: "#2563EB", soft: "#EFF6FF", border: "#93C5FD" },   // 青
  "ハコベ": { main: "#92400E", soft: "#FDF6EC", border: "#D9B68C" },     // 茶
  "ホトケノザ": { main: "#7E22CE", soft: "#FAF5FF", border: "#D8B4FE" }, // 紫
  "スズナ": { main: "#6B7280", soft: "#FAFAFA", border: "#D1D5DB" },     // 白(グレーで縁取り)
};
const STORAGE_KEY = "kaiseki-board-v2";
const DATE_KEY = "kaiseki-board-v2-date";

function pad(n) { return n.toString().padStart(2, "0"); }
function fmtTime(d) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
// "2026-07-03" のような日付文字列（日付が変わったかどうかの判定に使う）
function todayStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseTimeToday(hhmm, now) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d;
}
function diffLabel(ms) {
  const totalMin = Math.round(ms / 60000);
  const sign = totalMin < 0 ? "-" : "";
  const a = Math.abs(totalMin);
  const h = Math.floor(a / 60), m = a % 60;
  if (h > 0) return `${sign}${h}時間${m}分`;
  return `${sign}${m}分`;
}

function defaultRooms() {
  return ROOM_NAMES.map((name, i) => ({
    id: `room${i + 1}`,
    name,
    active: false,
    guests: "",
    mealType: "通常", // 通常 or 連泊
    start: "18:00",
    allergens: [],
    overrides: [], // [{courseId, dish, leadMin}]
  }));
}

export default function KaisekiBoard() {
  const [now, setNow] = useState(new Date());
  const [rooms, setRooms] = useState(defaultRooms());
  const [courseTimes, setCourseTimes] = useState(DEFAULT_COURSE_TIMES);
  const [leadTimes, setLeadTimes] = useState(DEFAULT_LEAD);
  const [doneSet, setDoneSet] = useState({});
  const [delayMap, setDelayMap] = useState({}); // roomId -> delayMin (number)
  const [view, setView] = useState("setup"); // setup | board | delay
  const [showCourseSettings, setShowCourseSettings] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  // 15秒ごとに現在時刻を更新。あわせて「日付が変わっていないか」も毎回チェックする。
  useEffect(() => {
    const t = setInterval(() => {
      setNow(new Date());
      checkDateAndResetIfNeeded();
    }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 保存データを全部初期状態に戻す（日付が変わった時／手動リセットの両方で使う）
  function resetAllData(newDateStr) {
    const next = {
      rooms: defaultRooms(),
      courseTimes: DEFAULT_COURSE_TIMES,
      leadTimes: DEFAULT_LEAD,
      doneSet: {},
      delayMap: {},
    };
    setRooms(next.rooms);
    setCourseTimes(next.courseTimes);
    setLeadTimes(next.leadTimes);
    setDoneSet(next.doneSet);
    setDelayMap(next.delayMap);
    persist(next);
    try {
      window.localStorage.setItem(DATE_KEY, newDateStr);
    } catch (e) {
      // ignore
    }
  }

  // 保存されている日付と「今日」を比較し、違っていればデータを初期化する
  function checkDateAndResetIfNeeded() {
    const todaysDate = todayStr(new Date());
    try {
      const savedDate = window.localStorage.getItem(DATE_KEY);
      if (savedDate && savedDate !== todaysDate) {
        resetAllData(todaysDate);
      } else if (!savedDate) {
        window.localStorage.setItem(DATE_KEY, todaysDate);
      }
    } catch (e) {
      // localStorage が使えない環境では何もしない
    }
  }

  useEffect(() => {
    try {
      const todaysDate = todayStr(new Date());
      const savedDate = window.localStorage.getItem(DATE_KEY);

      if (savedDate && savedDate !== todaysDate) {
        // 前回保存された日付と今日が違う → 日付をまたいだので全部リセット
        resetAllData(todaysDate);
      } else {
        if (!savedDate) window.localStorage.setItem(DATE_KEY, todaysDate);
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          if (data.rooms) setRooms(data.rooms);
          if (data.courseTimes) setCourseTimes(data.courseTimes);
          if (data.leadTimes) setLeadTimes(data.leadTimes);
          if (data.doneSet) setDoneSet(data.doneSet);
          if (data.delayMap) setDelayMap(data.delayMap);
        }
      }
    } catch (e) {
      // nothing saved yet
    } finally {
      setLoaded(true);
    }
  }, []);

  function persist(next) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      setError("保存エラー");
    }
  }

  function save(partial) {
    const next = {
      rooms: partial.rooms ?? rooms,
      courseTimes: partial.courseTimes ?? courseTimes,
      leadTimes: partial.leadTimes ?? leadTimes,
      doneSet: partial.doneSet ?? doneSet,
      delayMap: partial.delayMap ?? delayMap,
    };
    if (partial.rooms) setRooms(partial.rooms);
    if (partial.courseTimes) setCourseTimes(partial.courseTimes);
    if (partial.leadTimes) setLeadTimes(partial.leadTimes);
    if (partial.doneSet) setDoneSet(partial.doneSet);
    if (partial.delayMap) setDelayMap(partial.delayMap);
    persist(next);
  }

  function updateRoom(id, patch) {
    save({ rooms: rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  }

  function toggleRoomAllergen(id, a) {
    const room = rooms.find((r) => r.id === id);
    const allergens = room.allergens.includes(a)
      ? room.allergens.filter((x) => x !== a)
      : [...room.allergens, a];
    updateRoom(id, { allergens });
  }

  function addOverride(roomId) {
    const room = rooms.find((r) => r.id === roomId);
    const next = [...room.overrides, { courseId: "c1", dish: "", leadMin: "" }];
    updateRoom(roomId, { overrides: next });
  }
  function updateOverride(roomId, idx, patch) {
    const room = rooms.find((r) => r.id === roomId);
    const next = room.overrides.map((o, i) => (i === idx ? { ...o, ...patch } : o));
    updateRoom(roomId, { overrides: next });
  }
  function removeOverride(roomId, idx) {
    const room = rooms.find((r) => r.id === roomId);
    updateRoom(roomId, { overrides: room.overrides.filter((_, i) => i !== idx) });
  }

  function updateCourseTime(start, courseId, value) {
    save({ courseTimes: { ...courseTimes, [start]: { ...courseTimes[start], [courseId]: value } } });
  }
  function updateLead(courseId, value) {
    save({ leadTimes: { ...leadTimes, [courseId]: Number(value) || 0 } });
  }

  function toggleDone(key) {
    save({ doneSet: { ...doneSet, [key]: !doneSet[key] } });
  }

  function setDelay(roomId, value) {
    const min = parseInt(value) || 0;
    save({ delayMap: { ...delayMap, [roomId]: min } });
  }

  // ボードの進行状況（提供完了チェック・遅延）だけをリセットする。
  // 部屋の設定（人数・料理内容など）はそのまま残る。
  function resetProgress() {
    const ok = window.confirm("提供完了のチェックと遅延設定をすべてリセットします。よろしいですか？");
    if (!ok) return;
    save({ doneSet: {}, delayMap: {} });
  }

  // ---- build task list ----
  // All courses for active rooms are shown from the start (no waiting on a
  // previous course to be checked off). "次の便" highlighting still shows
  // which one is most urgent, but everything stays visible until checked.
  const activeRooms = rooms.filter((r) => r.active);
  const tasks = [];
  activeRooms.forEach((room) => {
    const delayMin = delayMap[room.id] || 0;
    COURSE_ORDER.forEach((courseId, idx) => {
      const timeStr = courseTimes[room.start]?.[courseId];
      if (!timeStr) return;
      const override = room.overrides.find((o) => o.courseId === courseId);
      const baseServe = parseTimeToday(timeStr, now);
      const key = `${room.id}-${courseId}`;
      const done = !!doneSet[key];
      // apply delay only to not-yet-done courses
      const serve = done ? baseServe : new Date(baseServe.getTime() + delayMin * 60000);
      const dishLabel = override && override.dish ? override.dish : COURSE_NAMES[courseId];

      tasks.push({
        key, room, courseId, courseIdx: idx, courseName: COURSE_NAMES[courseId], dishLabel,
        serve, baseServe, delayMin, isOverride: !!override, done,
      });
    });
  });

  const computed = tasks.map((t) => {
    const status = t.done ? "done" : "active";
    return { ...t, status };
  });

  // all not-done courses for active rooms, shown together
  const activeList = computed
    .filter((c) => c.status === "active")
    .sort((a, b) => a.serve - b.serve);
  const doneList = computed.filter((c) => c.status === "done")
    .sort((a, b) => b.serve - a.serve);

  // ---- group for board display ----
  // Tasks that share the same courseId, serve time, no override, no delay → merged card
  // Otherwise → individual card
  const groupMap = {};
  activeList.forEach((c) => {
    const canMerge = !c.isOverride && (delayMap[c.room.id] || 0) === 0;
    // Also key by mealType so 通常 and 連泊 never share a card
    const groupKey = canMerge ? `${c.courseId}-${c.serve.getTime()}-${c.room.mealType}` : c.key;
    if (!groupMap[groupKey]) groupMap[groupKey] = [];
    groupMap[groupKey].push(c);
  });

  const boardGroups = Object.values(groupMap).sort((a, b) => a[0].serve - b[0].serve);

  // earliest serve time among active groups = "next up" → highlight
  const nextServeTime = boardGroups.length > 0 ? boardGroups[0][0].serve.getTime() : null;

  // ---- people count per course+time slot, split by mealType ----
  // (independent of the merge/override grouping above, since override rooms
  // still count toward the slot total even though they get their own card)
  function parseGuestCount(str) {
    if (!str) return 0;
    const m = String(str).match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
  }
  const slotTotals = {}; // `${courseId}-${serveTime}` -> { 通常: n, 連泊: n }
  activeList.forEach((c) => {
    const slotKey = `${c.courseId}-${c.serve.getTime()}`;
    if (!slotTotals[slotKey]) slotTotals[slotKey] = { "通常": 0, "連泊": 0 };
    slotTotals[slotKey][c.room.mealType] += parseGuestCount(c.room.guests);
  });
  function slotSummary(c) {
    const t = slotTotals[`${c.courseId}-${c.serve.getTime()}`];
    if (!t) return null;
    const parts = [];
    if (t["通常"] > 0) parts.push(`通常${t["通常"]}名`);
    if (t["連泊"] > 0) parts.push(`連泊${t["連泊"]}名`);
    return parts.length > 0 ? parts.join("　") : null;
  }

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes urgent-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(217,119,6,0.4), inset 0 0 0 0 rgba(217,119,6,0); }
          50% { box-shadow: 0 0 18px 4px rgba(217,119,6,0.25), inset 0 0 0 0 rgba(217,119,6,0); }
        }
        @keyframes pulse-red {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.4); }
          50% { box-shadow: 0 0 0 8px rgba(220,38,38,0); }
        }
        * { box-sizing: border-box; }
        ::selection { background: #D97706; color: #fff; }
      `}</style>

      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <ChefHat size={26} color="#D97706" />
          <div>
            <h1 style={styles.h1}>部屋出し懐石 仕込みボード</h1>
            <div style={styles.sub}>チーム共有</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={styles.tabs}>
            <button
              style={{ ...styles.tabBtn, ...(view === "setup" ? styles.tabBtnActive : {}) }}
              onClick={() => setView("setup")}
            >
              <Settings size={14} /> 事前設定
            </button>
            <button
              style={{ ...styles.tabBtn, ...(view === "board" ? styles.tabBtnActive : {}) }}
              onClick={() => setView("board")}
            >
              <ListChecks size={14} /> ボード
            </button>
            <button
              style={{ ...styles.tabBtn, ...(view === "delay" ? styles.tabBtnActive : {}) }}
              onClick={() => setView("delay")}
            >
              <Clock size={14} /> 遅延管理
            </button>
          </div>
        </div>
      </header>

      <div style={styles.nowClockBox}>
        <Clock size={22} color="#D97706" />
        <span style={styles.nowClockText}>{fmtTime(now)}</span>
        <span style={styles.nowClockLabel}>現在時刻</span>
      </div>

      {error && <div style={styles.errorBar}>{error}</div>}
      {!loaded && <div style={{ color: "#6B7280", padding: 20 }}>読み込み中…</div>}

      {/* ================= SETUP VIEW ================= */}
      {view === "setup" && loaded && (
        <div style={styles.list}>
          <div style={styles.card}>
            <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 10 }}>
              各便の完成(提供)時間とアラーム基本リードタイムを設定できます。アレルギー対応・連泊で個別に変わる便は、各お部屋のカードで上書きしてください。
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={styles.ghostBtn} onClick={() => setShowCourseSettings((s) => !s)}>
                便の完成時間 / 基本リードタイムを編集
              </button>
              <button style={{ ...styles.ghostBtn, color: "#DC2626", borderColor: "#DC2626" }} onClick={resetProgress}>
                ボードの進行状況をリセット
              </button>
            </div>
            {showCourseSettings && (
              <div style={{ marginTop: 12, overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={styles.th}></th>
                      {START_TIMES.map((s) => <th key={s} style={styles.th}>{s}〜 完成時間</th>)}
                      <th style={styles.th}>基本リード(分前)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COURSE_ORDER.map((cid) => (
                      <tr key={cid}>
                        <td style={styles.td}>{COURSE_NAMES[cid]}</td>
                        {START_TIMES.map((s) => (
                          <td key={s} style={styles.td}>
                            <input type="time" style={styles.inputSmall} value={courseTimes[s]?.[cid] || ""}
                              onChange={(e) => updateCourseTime(s, cid, e.target.value)} />
                          </td>
                        ))}
                        <td style={styles.td}>
                          <input type="number" style={styles.inputSmall} value={leadTimes[cid]}
                            onChange={(e) => updateLead(cid, e.target.value)} /> 分
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {rooms.map((room) => (
            <div key={room.id} style={{ ...styles.card, ...(room.active ? styles.cardActive : {}) }}>
              <div style={styles.roomHeadRow}>
                <label style={styles.roomToggle}>
                  <input type="checkbox" checked={room.active}
                    onChange={(e) => updateRoom(room.id, { active: e.target.checked })}
                    style={{ width: 16, height: 16 }} />
                  <span style={{ ...styles.roomColorDot, background: ROOM_COLORS[room.name]?.main, border: room.name === "スズナ" ? "1px solid #D1D5DB" : "none" }} />
                  <span style={{ ...styles.roomNameLabel, color: ROOM_COLORS[room.name]?.main }}>{room.name}</span>
                </label>
                <select value={room.start} onChange={(e) => updateRoom(room.id, { start: e.target.value })} style={styles.select}>
                  {START_TIMES.map((t) => <option key={t} value={t}>{t}〜</option>)}
                </select>
              </div>

              <div style={{ ...styles.formGrid3, gridTemplateColumns: "1fr 1fr" }}>
                <label style={styles.label}>
                  人数
                  <select style={styles.input} value={room.guests}
                    onChange={(e) => updateRoom(room.id, { guests: e.target.value })}>
                    <option value="">未選択</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={`${n}名`}>{n}名</option>
                    ))}
                  </select>
                </label>
                <label style={styles.label}>
                  料理の種類
                  <select style={styles.input} value={room.mealType} onChange={(e) => updateRoom(room.id, { mealType: e.target.value })}>
                    <option value="通常">通常料理（1泊目）</option>
                    <option value="連泊">連泊料理（2泊目）</option>
                  </select>
                </label>
              </div>

              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>
                  変更になる便（アレルギー対応・連泊など料理内容が変わる場合）
                </div>
                {room.overrides.map((o, idx) => (
                  <div key={idx} style={styles.overrideRow}>
                    <select style={styles.inputSmall} value={o.courseId}
                      onChange={(e) => updateOverride(room.id, idx, { courseId: e.target.value })}>
                      {COURSE_ORDER.map((cid) => <option key={cid} value={cid}>{COURSE_NAMES[cid]}</option>)}
                    </select>
                    <input style={{ ...styles.inputSmall, flex: 1, minWidth: 140 }} placeholder="変更後の料理名（例：アレルギー対応膳）"
                      value={o.dish} onChange={(e) => updateOverride(room.id, idx, { dish: e.target.value })} />
                    <button style={styles.iconBtn} onClick={() => removeOverride(room.id, idx)}><X size={14} /></button>
                  </div>
                ))}
                <button style={styles.ghostBtnSmall} onClick={() => addOverride(room.id)}>
                  <Plus size={13} /> 変更便を追加
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ================= BOARD VIEW ================= */}
      {view === "board" && loaded && (
        <>
          <div style={styles.sectionLabel}>現在の便（各部屋の次のタスク）</div>
          <div style={styles.list}>
            {boardGroups.length === 0 && (
              <div style={styles.empty}>「事前設定」で部屋にチェックを入れると、ここに本日の便が表示されます。</div>
            )}
            {(() => {
              // bucket boardGroups by serve time so we can show one people-count
              // summary line per time slot, above all cards sharing that time
              const byTime = [];
              const seenTimes = new Set();
              boardGroups.forEach((group) => {
                const t = group[0].serve.getTime();
                if (!seenTimes.has(t)) {
                  seenTimes.add(t);
                  byTime.push({ time: t, groups: boardGroups.filter((g) => g[0].serve.getTime() === t) });
                }
              });
              return byTime.map(({ time, groups }) => {
                const summary = slotSummary(groups[0][0]);
                const isNext = time === nextServeTime;
                return (
                  <div key={time} style={{ marginBottom: 4 }}>
                    {summary && (
                      <div style={{ ...styles.slotSummary, color: isNext ? "#92400E" : "#9CA3AF" }}>
                        {summary}
                      </div>
                    )}
                    <div style={styles.list}>
                      {groups.map((group) => {
                        if (group.length === 1) {
                          const c = group[0];
                          return <TaskCard key={c.key} c={c} onToggle={() => toggleDone(c.key)}
                            delay={delayMap[c.room.id] || 0}
                            onDelayChange={(val) => setDelay(c.room.id, val)}
                            isNext={isNext} />;
                        }
                        return (
                          <MergedCard key={group.map(c => c.key).join("-")} group={group}
                            onToggle={(key) => toggleDone(key)}
                            delayMap={delayMap} onDelayChange={setDelay}
                            isNext={isNext} />
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {doneList.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={styles.sectionLabel}>提供完了</div>
              <div style={styles.list}>
                {doneList.map((c) => (
                  <div key={c.key} style={{ ...styles.itemCard, ...styles.itemDone }}>
                    <div style={styles.itemTop}>
                      <div style={{ ...styles.itemName, textDecoration: "line-through", opacity: 0.6, color: ROOM_COLORS[c.room.name]?.main }}>
                        {c.room.name}　{c.dishLabel}
                      </div>
                      <button style={styles.doneBtn} onClick={() => toggleDone(c.key)} title="未完了に戻す">↺</button>
                    </div>
                    <div style={{ fontSize: 12, color: "#9CA3AF" }}>提供 {fmtTime(c.serve)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ================= DELAY MANAGEMENT VIEW ================= */}
      {view === "delay" && loaded && (
        <div style={styles.list}>
          <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 4 }}>
            部屋ごとに今日の遅延を設定できます。まだ提供していない便の時刻に反映されます。
          </div>
          {activeRooms.length === 0 && (
            <div style={styles.empty}>「事前設定」で部屋にチェックを入れると、ここに表示されます。</div>
          )}
          {activeRooms.map((room) => {
            const roomDelay = delayMap[room.id] || 0;
            return (
              <div key={room.id} style={styles.card}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ ...styles.roomNameLabel, fontWeight: 800, color: ROOM_COLORS[room.name]?.main }}>{room.name}</span>
                    {room.guests && <span style={styles.guestTag}>{room.guests}</span>}
                    {room.mealType === "連泊" && <span style={styles.renpakuTag}>連泊</span>}
                  </div>
                  <div style={styles.delayRow}>
                    <button style={styles.delayBtn} onClick={() => setDelay(room.id, Math.max(0, roomDelay - 5))}>－5</button>
                    <button style={styles.delayBtn} onClick={() => setDelay(room.id, Math.max(0, roomDelay - 1))}>－1</button>
                    <span style={{ ...styles.delayNum, fontSize: 18, color: roomDelay > 0 ? "#D97706" : "#9CA3AF" }}>{roomDelay}分</span>
                    <button style={styles.delayBtn} onClick={() => setDelay(room.id, roomDelay + 1)}>＋1</button>
                    <button style={styles.delayBtn} onClick={() => setDelay(room.id, roomDelay + 5)}>＋5</button>
                    {roomDelay > 0 && (
                      <button style={{ ...styles.delayBtn, color: "#DC2626", borderColor: "#DC2626" }} onClick={() => setDelay(room.id, 0)}>リセット</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MergedCard({ group, onToggle, delayMap, onDelayChange, isNext }) {
  const [expanded, setExpanded] = useState(false);
  const rep = group[0];

  const cardStyle = {
    ...styles.itemCard,
    ...(isNext ? styles.itemNext : styles.itemQueued),
  };

  return (
    <div style={cardStyle}>
      <div style={styles.mergedHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={styles.mergedTime}>
            {fmtTime(rep.serve)}
          </span>
        </div>
      </div>

      <div style={styles.mergedRooms}>
        {group.map((c) => {
          const roomDelay = delayMap[c.room.id] || 0;
          return (
            <div key={c.key} style={styles.simpleRow}>
              <div style={styles.simpleRowMain}>
                <span style={{ ...styles.simpleRoomName, color: ROOM_COLORS[c.room.name]?.main }}>{c.room.name}</span>
                {c.room.mealType === "連泊" && <span style={styles.renpakuTag}>連泊</span>}
                <span style={styles.simpleDish}>{c.courseName}</span>
                {roomDelay > 0 && <span style={styles.delayTag}>+{roomDelay}分</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button style={styles.moreBtn} onClick={() => setExpanded((s) => !s)} title="詳細">⋯</button>
                <button style={isNext ? styles.doneBtnNext : styles.doneBtn} onClick={() => onToggle(c.key)} title="提供完了">
                  <Check size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {expanded && (
        <div style={styles.detailBox}>
          {group.map((c) => {
            const roomDelay = delayMap[c.room.id] || 0;
            return (
              <div key={c.key} style={styles.detailGroup}>
                <div style={styles.detailLine}>
                  <span style={{ color: ROOM_COLORS[c.room.name]?.main, fontWeight: 700 }}>{c.room.name}</span>
                  {c.room.guests && <span> ・ {c.room.guests}</span>}
                  <span> ・ {c.room.mealType}</span>
                  {roomDelay > 0 && <span style={{ color: "#D97706", fontWeight: 700 }}> ・ +{roomDelay}分遅れ</span>}
                </div>
                <div style={styles.delayRow}>
                  <span style={styles.delayLabel}>遅延</span>
                  <button style={styles.delayBtn} onClick={() => onDelayChange(c.room.id, Math.max(0, roomDelay - 5))}>－5</button>
                  <button style={styles.delayBtn} onClick={() => onDelayChange(c.room.id, Math.max(0, roomDelay - 1))}>－1</button>
                  <span style={{ ...styles.delayNum, color: roomDelay > 0 ? "#D97706" : "#9CA3AF" }}>{roomDelay}分</span>
                  <button style={styles.delayBtn} onClick={() => onDelayChange(c.room.id, roomDelay + 1)}>＋1</button>
                  <button style={styles.delayBtn} onClick={() => onDelayChange(c.room.id, roomDelay + 5)}>＋5</button>
                  {roomDelay > 0 && (
                    <button style={{ ...styles.delayBtn, color: "#DC2626", borderColor: "#DC2626" }} onClick={() => onDelayChange(c.room.id, 0)}>リセット</button>
                  )}
                </div>
              </div>
            );
          })}
          <div style={styles.detailLine}>第{rep.courseIdx + 1}便（{rep.courseName}）</div>
        </div>
      )}
    </div>
  );
}

function TaskCard({ c, onToggle, delay, onDelayChange, isNext }) {
  const [expanded, setExpanded] = useState(false);
  const isOverride = c.isOverride;

  const cardStyle = {
    ...styles.itemCard,
    ...(isOverride ? styles.itemOverrideCard : isNext ? styles.itemNext : styles.itemQueued),
  };

  return (
    <div style={cardStyle}>
      <div style={styles.simpleRow}>
        <div style={styles.simpleRowMain}>
          <span style={styles.simpleTime}>{fmtTime(c.serve)}</span>
          <span style={{ ...styles.simpleRoomName, color: ROOM_COLORS[c.room.name]?.main }}>{c.room.name}</span>
          {c.room.mealType === "連泊" && <span style={styles.renpakuTag}>連泊</span>}
          <span style={styles.simpleDish}>{c.courseName}</span>
          {isOverride && <AlertTriangle size={22} color="#9333EA" strokeWidth={2.5} />}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button style={styles.moreBtn} onClick={() => setExpanded((s) => !s)} title="詳細">⋯</button>
          <button style={isNext ? styles.doneBtnNext : styles.doneBtn} onClick={onToggle} title="提供完了にする">
            <Check size={16} />
          </button>
        </div>
      </div>

      {expanded && (
        <div style={styles.detailBox}>
          <div style={styles.detailLine}>第{c.courseIdx + 1}便　提供 {fmtTime(c.serve)}</div>
          {c.room.guests && <div style={styles.detailLine}>人数：{c.room.guests}</div>}
          <div style={styles.detailLine}>料理：{c.room.mealType}</div>
          {isOverride && (
            <div style={styles.overrideDetailBox}>
              <AlertTriangle size={14} color="#9333EA" style={{ marginRight: 4, verticalAlign: "middle" }} />
              <strong style={{ color: "#9333EA" }}>変更あり：</strong>
              <span style={{ color: "#9333EA", fontWeight: 700 }}>{c.dishLabel}</span>
              <span style={{ color: "#6B7280" }}>（通常：{c.courseName}）</span>
            </div>
          )}
          {delay > 0 && <div style={styles.detailLine}>遅延：+{delay}分（元 {fmtTime(c.baseServe)}）</div>}

          <div style={styles.delayRow}>
            <span style={styles.delayLabel}>この部屋の遅延</span>
            <button style={styles.delayBtn} onClick={() => onDelayChange(Math.max(0, delay - 5))}>－5</button>
            <button style={styles.delayBtn} onClick={() => onDelayChange(Math.max(0, delay - 1))}>－1</button>
            <span style={{ ...styles.delayNum, color: delay > 0 ? "#D97706" : "#9CA3AF" }}>{delay}分</span>
            <button style={styles.delayBtn} onClick={() => onDelayChange(delay + 1)}>＋1</button>
            <button style={styles.delayBtn} onClick={() => onDelayChange(delay + 5)}>＋5</button>
            {delay > 0 && (
              <button style={{ ...styles.delayBtn, color: "#DC2626", borderColor: "#DC2626" }} onClick={() => onDelayChange(0)}>リセット</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#FFFFFF", color: "#1A1A1A", fontFamily: "'Helvetica Neue', Arial, sans-serif", padding: "16px", paddingBottom: 60 },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  h1: { fontSize: 17, margin: 0, letterSpacing: 0.5, fontWeight: 700, color: "#1A1A1A" },
  sub: { fontSize: 12, color: "#6B7280", marginTop: 2, fontFamily: "monospace" },
  nowClockBox: { display: "flex", alignItems: "baseline", gap: 10, background: "#FFFBEB", border: "2px solid #D97706", borderRadius: 12, padding: "10px 18px", marginBottom: 16, width: "fit-content" },
  nowClockText: { fontSize: 44, fontWeight: 800, fontFamily: "monospace", color: "#1A1A1A", letterSpacing: -1, lineHeight: 1 },
  nowClockLabel: { fontSize: 12, color: "#92400E", fontWeight: 700 },
  errorBar: { background: "#DC2626", color: "#fff", padding: "8px 12px", borderRadius: 8, marginBottom: 12, fontSize: 13 },
  alertBanner: { display: "flex", gap: 10, alignItems: "flex-start", background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B", padding: "12px 14px", borderRadius: 10, marginBottom: 16, animation: "pulse-red 2s infinite" },
  card: { background: "#FFFFFF", borderRadius: 12, padding: 16, border: "1px solid #E5E7EB" },
  cardActive: { borderColor: "#D97706" },
  th: { textAlign: "left", padding: "6px 8px", color: "#6B7280", fontWeight: 600, borderBottom: "1px solid #E5E7EB" },
  td: { padding: "6px 8px", borderBottom: "1px solid #E5E7EB" },
  tabs: { display: "flex", gap: 4, background: "#F3F4F6", borderRadius: 8, padding: 3, border: "1px solid #E5E7EB" },
  tabBtn: { display: "flex", alignItems: "center", gap: 6, background: "transparent", color: "#6B7280", border: "none", borderRadius: 6, padding: "7px 12px", cursor: "pointer", fontSize: 13 },
  tabBtnActive: { background: "#D97706", color: "#fff", fontWeight: 700 },
  ghostBtn: { display: "flex", alignItems: "center", gap: 6, background: "transparent", color: "#374151", border: "1px solid #D1D5DB", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13 },
  ghostBtnSmall: { display: "flex", alignItems: "center", gap: 4, background: "transparent", color: "#D97706", border: "1px dashed #D1D5DB", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12, marginTop: 6 },
  iconBtn: { background: "transparent", border: "none", color: "#9CA3AF", cursor: "pointer", display: "flex", alignItems: "center" },
  testToggle: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#D97706", border: "1px solid #D1D5DB", borderRadius: 8, padding: "8px 12px", cursor: "pointer" },
  roomHeadRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  roomToggle: { display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 },
  roomNameLabel: { fontSize: 16 },
  roomColorDot: { width: 12, height: 12, borderRadius: "50%", display: "inline-block", flexShrink: 0 },
  formGrid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 },
  label: { display: "flex", flexDirection: "column", fontSize: 12, color: "#6B7280", gap: 4 },
  input: { background: "#FFFFFF", border: "1px solid #D1D5DB", borderRadius: 8, padding: "8px 10px", color: "#1A1A1A", fontSize: 14, outline: "none" },
  inputSmall: { background: "#FFFFFF", border: "1px solid #D1D5DB", borderRadius: 6, padding: "5px 6px", color: "#1A1A1A", fontSize: 13 },
  select: { background: "#FFFFFF", border: "1px solid #D1D5DB", borderRadius: 6, color: "#1A1A1A", fontSize: 12, padding: "5px 6px" },
  tagSmallBtn: { border: "1px solid #D1D5DB", borderRadius: 999, padding: "3px 10px", fontSize: 12, cursor: "pointer", fontWeight: 600 },
  tagSmall: { borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700 },
  overrideRow: { display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" },
  sectionLabel: { fontSize: 12, color: "#6B7280", marginBottom: 8, letterSpacing: 1, fontWeight: 600 },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  empty: { color: "#9CA3AF", fontSize: 14, padding: "30px 10px", textAlign: "center", border: "1px dashed #D1D5DB", borderRadius: 12 },
  itemCard: { borderRadius: 12, padding: "14px 16px" },
  itemNext: { background: "#FFFBEB", border: "2px solid #D97706", boxShadow: "0 0 14px rgba(217,119,6,0.18)", animation: "urgent-glow 2.5s ease-in-out infinite" },
  itemQueued: { background: "#FAFAFA", border: "1px solid #E5E7EB", opacity: 0.65 },
  itemOverrideCard: { background: "#FAF5FF", border: "2px solid #A855F7", boxShadow: "0 0 10px rgba(168,85,247,0.15)" },
  itemOverdue: { background: "#FFFFFF", border: "2px solid #DC2626", boxShadow: "inset 4px 0 0 #DC2626", animation: "pulse-red 1.8s infinite" },
  itemDone: { opacity: 0.55 },
  nextBadge: { fontSize: 11, fontWeight: 700, background: "#D97706", color: "#fff", borderRadius: 999, padding: "3px 10px", letterSpacing: 0.5 },
  itemTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 },
  itemRoomName: { fontSize: 15, fontWeight: 700 },
  itemDish: { fontSize: 14, color: "#1A1A1A" },
  itemDishOverride: { fontSize: 15, fontWeight: 700, color: "#9333EA" },
  originalDish: { fontSize: 12, color: "#9CA3AF", fontStyle: "italic" },
  changeLabel: { display: "inline-flex", alignItems: "center", background: "#7C3AED", color: "#fff", fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "2px 8px" },
  itemName: { fontSize: 15, fontWeight: 700 },
  guestTag: { fontSize: 12, fontWeight: 400, color: "#6B7280" },
  renpakuTag: { fontSize: 14, fontWeight: 800, background: "#E5E7EB", color: "#374151", borderRadius: 6, padding: "1px 5px" },
  overrideTag: { fontSize: 11, fontWeight: 700, background: "#A855F7", color: "#fff", borderRadius: 999, padding: "2px 8px", marginLeft: 6 },
  doneBtnDark: { background: "#1A1A1A", border: "none", borderRadius: 999, width: 32, height: 32, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  itemTimes: { display: "flex", flexDirection: "column", gap: 4, marginTop: 8, fontSize: 13 },
  timeBlock: { display: "flex", alignItems: "center", gap: 6, fontFamily: "monospace", color: "#374151" },
  doneBtn: { background: "#F3F4F6", border: "1px solid #D1D5DB", borderRadius: 999, width: 28, height: 28, color: "#374151", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  doneBtnNext: { background: "#D97706", border: "none", borderRadius: 999, width: 30, height: 30, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 },
  delayRow: { display: "flex", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap" },
  delayLabel: { fontSize: 11, color: "#9CA3AF", marginRight: 2 },
  delayBtn: { background: "#FFFFFF", border: "1px solid #D1D5DB", borderRadius: 6, color: "#374151", padding: "3px 8px", fontSize: 12, cursor: "pointer" },
  delayNum: { fontSize: 13, fontWeight: 700, minWidth: 36, textAlign: "center" },
  delayTag: { fontSize: 11, fontWeight: 700, background: "#FEF3C7", color: "#92400E", border: "1px solid #D97706", borderRadius: 999, padding: "2px 8px" },
  mergedHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  mergedCourse: { fontSize: 15, fontWeight: 700 },
  mergedTime: { fontSize: 22, fontWeight: 800, fontFamily: "monospace", color: "#1A1A1A", letterSpacing: -0.5 },
  mergedRooms: { display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid #E5E7EB", paddingTop: 10 },
  mergedRoomRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "4px 0" },
  mergedRoomName: { fontSize: 14, fontWeight: 700 },
  simpleRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "4px 0" },
  simpleRowMain: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flex: 1 },
  simpleTime: { fontSize: 22, fontWeight: 800, fontFamily: "monospace", color: "#1A1A1A", minWidth: 70, letterSpacing: -0.5 },
  simpleRoomName: { fontSize: 16, fontWeight: 700 },
  simpleDish: { fontSize: 14, color: "#1A1A1A" },
  simpleDishOverride: { fontSize: 14, fontWeight: 700, color: "#9333EA" },
  moreBtn: { background: "transparent", border: "1px solid #D1D5DB", borderRadius: 6, color: "#6B7280", width: 28, height: 28, cursor: "pointer", fontSize: 16, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" },
  detailBox: { marginTop: 10, paddingTop: 10, borderTop: "1px solid #E5E7EB", display: "flex", flexDirection: "column", gap: 4 },
  detailGroup: { display: "flex", flexDirection: "column", gap: 4, paddingBottom: 8, marginBottom: 4, borderBottom: "1px dashed #E5E7EB" },
  detailLine: { fontSize: 12, color: "#4B5563" },
  overrideDetailBox: { fontSize: 13, background: "#FAF5FF", border: "1px solid #D8B4FE", borderRadius: 8, padding: "8px 10px" },
  overdueBadge: { fontSize: 11, fontWeight: 700, background: "#DC2626", color: "#fff", borderRadius: 999, padding: "3px 10px" },
  bulkDelayBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 14px", marginBottom: 16 },
  bulkDelayLabel: { fontSize: 13, fontWeight: 700, color: "#92400E" },
  slotSummary: { fontSize: 12, fontWeight: 700, padding: "0 4px 6px 4px", letterSpacing: 0.3 },
};
