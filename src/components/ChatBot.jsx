import React, { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import { useStorm } from "../state";
import { answer, STARTERS } from "../lib/chatbot";


const HELLO = { from: "bot", text: "Hello, I am the CycloneX assistant. I answer only from the data in CycloneX. Pick a question below or type your own.", next: STARTERS };

export default function ChatBot() {
  const { alerts, sid } = useStorm();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([HELLO]);
  const [text, setText] = useState("");
  const end = useRef(null), input = useRef(null);

  useEffect(() => { if (open) { end.current?.scrollIntoView({ block: "end" }); input.current?.focus(); } }, [open, msgs]);
  useEffect(() => { const k = (e) => e.key === "Escape" && setOpen(false); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);

  const ask = (q) => {
    const t = (q ?? text).trim();
    if (!t) return;
    let r;
    try { r = answer(t, alerts); } catch (e) { console.error("CycloneX assistant failed:", e); r = { text: "Sorry, I could not work that out. Please try another question.", next: STARTERS.slice(0, 4) }; }
    setMsgs((m) => [...m, { from: "user", text: t }, { from: "bot", text: r.text, next: r.next }]);
    setText("");
  };
  const last = msgs[msgs.length - 1];

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Open the CycloneX assistant" className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-brand px-4 py-3 text-[14px] font-medium text-white shadow-lg hover:bg-brand-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
          <MessageCircle className="h-5 w-5" /> Ask CycloneX
        </button>
      )}
      {open && (
        <section role="dialog" aria-label="CycloneX assistant" className="fixed inset-x-3 bottom-3 z-50 flex max-h-[80vh] flex-col border border-line bg-ink-950 shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[390px]" style={{ height: "min(620px, 80vh)" }}>
          <header className="flex items-center justify-between border-b border-line bg-panel px-4 py-3">
            <div><div className="font-display text-[12px] font-bold uppercase tracking-[0.16em] text-white">CycloneX assistant</div><div className="text-[11px] text-slate-400">Answers only from CycloneX data, selected: {sid}</div></div>
            <button onClick={() => setOpen(false)} aria-label="Close the assistant" className="p-1 text-slate-300 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"><X className="h-5 w-5" /></button>
          </header>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={m.from === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[88%] whitespace-pre-line px-3 py-2 text-[13px] leading-relaxed ${m.from === "user" ? "bg-brand text-white" : "bg-panel text-slate-200"}`}>{m.text}</div>
              </div>
            ))}
            {last.from === "bot" && last.next && last.next.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {last.next.map((q) => <button key={q} onClick={() => ask(q)} className="border border-brand/60 px-2.5 py-1 text-left text-[12px] text-slate-200 hover:bg-brand/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">{q}</button>)}
              </div>
            )}
            <div ref={end} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex gap-2 border-t border-line bg-panel p-3">
            <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about the cyclone, alerts, forecast..." aria-label="Your question" className="min-w-0 flex-1 border border-line bg-ink-950 px-3 py-2 text-[13px] text-white placeholder:text-slate-500 focus:border-brand focus:outline-none" />
            <button type="submit" aria-label="Send" className="bg-brand px-3 text-white hover:bg-brand-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-white"><Send className="h-4 w-4" /></button>
          </form>
        </section>
      )}
    </>
  );
}
