// A single JSON file as the database: no server, no install, easy to back up or inspect.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { AgentName, Db, Draft, Settings, Task } from './types.ts';

export const DEFAULT_SETTINGS: Settings = {
  arvPercent: 0.7,
  defaultAssignmentFee: 10000,
  // Rough national rehab ranges per square foot; tune these for your market.
  repairCostPerSqft: { turnkey: 5, light: 20, medium: 35, heavy: 55, teardown: 90 },
  companyName: 'Your Company LLC',
  yourName: 'Your Name',
  callbackNumber: '(555) 555-0100',
};

export function emptyDb(): Db {
  return { leads: [], comps: [], buyers: [], drafts: [], tasks: [], activity: [], settings: { ...DEFAULT_SETTINGS } };
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(4).toString('hex')}`;
}

export const now = (): string => new Date().toISOString();

export class Store {
  db: Db;
  readonly path: string | null;

  /** path = null keeps everything in memory (used by tests). */
  constructor(path: string | null) {
    this.path = path;
    this.db = path && existsSync(path) ? { ...emptyDb(), ...JSON.parse(readFileSync(path, 'utf8')) } : emptyDb();
    this.db.settings = { ...DEFAULT_SETTINGS, ...this.db.settings };
  }

  save(): void {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    renameSync(tmp, this.path);
  }

  lead(id: string) {
    const lead = this.db.leads.find((l) => l.id === id);
    if (!lead) throw new Error(`No lead with id ${id}`);
    return lead;
  }

  log(agent: AgentName | 'you', text: string, leadId?: string): void {
    this.db.activity.unshift({ at: now(), agent, leadId, text });
    this.db.activity.length = Math.min(this.db.activity.length, 500);
  }

  addDraft(d: Omit<Draft, 'id' | 'status' | 'createdAt'>): Draft {
    const draft: Draft = { ...d, id: newId('d'), status: 'pending', createdAt: now() };
    this.db.drafts.unshift(draft);
    return draft;
  }

  addTask(t: Omit<Task, 'id' | 'done'>): Task {
    const task: Task = { ...t, id: newId('t'), done: false };
    this.db.tasks.push(task);
    return task;
  }
}
