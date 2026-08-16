"use client";

import { useState, type FormEvent } from "react";

interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

const STORAGE_KEY = "gyl-todo-items";

function loadItems(): TodoItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveItems(items: TodoItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function TodoPanel() {
  const [items, setItems] = useState<TodoItem[]>(() => loadItems());
  const [input, setInput] = useState("");

  function persist(next: TodoItem[]) {
    setItems(next);
    saveItems(next);
  }

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    const item: TodoItem = { id: crypto.randomUUID(), text, done: false, createdAt: Date.now() };
    persist([item, ...items]);
    setInput("");
  }

  function toggleDone(id: string) {
    persist(items.map(it => it.id === id ? { ...it, done: !it.done } : it));
  }

  function remove(id: string) {
    persist(items.filter(it => it.id !== id));
  }

  const pending = items.filter(it => !it.done);
  const completed = items.filter(it => it.done);

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add a quick to-do..."
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {items.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-sm font-medium text-text">No to-do items yet</p>
          <p className="mt-1 text-xs text-text-muted">Add quick personal reminders above — these stay in your browser.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.length > 0 ? (
            <div className="rounded-lg border border-border bg-surface">
              <div className="border-b border-border px-4 py-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-text-faint">
                  Pending · {pending.length}
                </h3>
              </div>
              <ul className="divide-y divide-border">
                {pending.map(item => (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleDone(item.id)}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-border transition-colors hover:border-accent"
                    />
                    <span className="flex-1 text-sm text-text">{item.text}</span>
                    <button
                      type="button"
                      onClick={() => remove(item.id)}
                      className="shrink-0 text-xs text-text-faint hover:text-danger"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {completed.length > 0 ? (
            <div className="rounded-lg border border-border bg-surface">
              <div className="border-b border-border px-4 py-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-text-faint">
                  Completed · {completed.length}
                </h3>
              </div>
              <ul className="divide-y divide-border">
                {completed.map(item => (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleDone(item.id)}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-accent bg-accent-tint transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M3 6l2.5 2.5L9 4" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <span className="flex-1 text-sm text-text-muted line-through">{item.text}</span>
                    <button
                      type="button"
                      onClick={() => remove(item.id)}
                      className="shrink-0 text-xs text-text-faint hover:text-danger"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
