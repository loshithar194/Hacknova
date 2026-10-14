import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Bot, Send } from 'lucide-react';
import { Button, Card, Notice, PageHeader, inputCls } from '../components/ui';
import { useApp } from '../lib/store';
import { evaluateAll } from '../lib/matching';
import { answerQuestion } from '../lib/advisor';

const SUGGESTIONS = [
  'What can I build with an Arduino and sensors?',
  'Which of my components are reusable?',
  'How can I reduce the cost of this project?',
  'What components am I missing?',
  'Which project is easiest for a beginner?',
];

interface Msg { role: 'user' | 'assistant'; text: string }

export function Advisor() {
  const { data } = useApp();
  const results = useMemo(() => evaluateAll(data.inventory), [data.inventory]);
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', text: 'Hi! Ask me what you can build, what you are missing, or how to reduce costs. I answer only from your inventory and the project catalog.' },
  ]);
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const ask = (question: string) => {
    const q = question.trim();
    if (!q) return;
    const answer = answerQuestion(q, data.inventory, results);
    setMessages((m) => [...m, { role: 'user', text: q }, { role: 'assistant', text: answer }]);
    setInput('');
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(input);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="AI Advisor" subtitle="Ask about your parts and the project catalog." />

      <Notice tone="warning">
        <strong>Rule-based demo advisor.</strong> No AI API is connected. Answers come from deterministic rules applied to your inventory and the project catalog. They do not verify electrical compatibility.
      </Notice>

      <Card className="flex flex-col p-0">
        <div className="max-h-[480px] min-h-[300px] space-y-4 overflow-y-auto p-5">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
              {m.role === 'assistant' && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Bot className="h-4 w-4" />
                </div>
              )}
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === 'user' ? 'bg-emerald-700 text-white' : 'bg-stone-100 text-stone-800'
              }`}>
                {m.text}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div className="border-t border-stone-100 p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => ask(s)} className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50">
                {s}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="flex gap-2">
            <input className={inputCls} placeholder="Ask about your inventory or projects" value={input} onChange={(e) => setInput(e.target.value)} />
            <Button type="submit" disabled={!input.trim()}><Send className="h-4 w-4" /> Ask</Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
