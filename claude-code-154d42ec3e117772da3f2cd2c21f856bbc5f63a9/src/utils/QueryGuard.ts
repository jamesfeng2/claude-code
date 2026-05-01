
不并发
不重入
不乱序
旧结果不会覆盖新结果。**

它通常被用在：
搜索框
列表刷新
表单提交
队列任务（例如上传）
自动刷新 vs 手动刷新冲突

也就是说：
只要是“异步 + UI + 可能重复触发”的地方，就会用 QueryGuard

if (!guard.reserve()) return;

const g = guard.tryStart();
if (g === null) {
  guard.cancelReservation();
  return;
}

try {
  const result = await doAsyncWork();
  if (g !== guard.generation) return;
  updateUI(result);
} finally {
  guard.end(g);
}


search = 用户主动触发，不需要 isActive()           用户输入多少次，就触发多少次，但只显示最新一次。
refresh = 自动触发，需要 isActive() 来避免重复刷新
refresh(manual = false) {                        手动刷新时 → 永远允许执行
  if (!manual && guard.isActive) return;         自动刷新时，如果正在刷新 → 跳过

/**                                                              
 * Synchronous state machine for the query lifecycle, compatible with // 同步状态机，管理一次查询（query）的生命周期
 * React's `useSyncExternalStore`.                                   // 防止并发查询、防止队列重入
 *                                                                   // 保证：同一时间只有一个 query 在跑
 * Three states:
 *   idle        → no query, safe to dequeue and process
 *   dispatching → an item was dequeued, async chain hasn't reached onQuery yet
 *   running     → onQuery called tryStart(), query is executing
 *
 * Transitions:
 *   idle → dispatching  (reserve)
 *   dispatching → running  (tryStart)
 *   idle → running  (tryStart, for direct user submissions)
 *   running → idle  (end / forceEnd)
 *   dispatching → idle  (cancelReservation, when processQueueIfReady fails)
 *
 * `isActive` returns true for both dispatching and running, preventing
 * re-entry from the queue processor during the async gap.
 *
 * Usage with React:
 *   const queryGuard = useRef(new QueryGuard()).current
 *   const isQueryActive = useSyncExternalStore(
 *     queryGuard.subscribe,
 *     queryGuard.getSnapshot,
 *   )
 */

reserve()：boolean 队列说“我要执行一个任务” 用 state 阻止重复触发
tryStart()：number 真正开始执行            用 state 阻止并发
generation：防止旧任务覆盖新任务
end()：boolean 结束任务，                用 state 恢复 idle
isActive                               用 state 控制 UI

if (!guard.reserve()) return;                     “我要开始一个任务，有没有空位？”
const g = guard.tryStart();                       现在可以真正开始执行
if (g === null) {  guard.cancelReservation();  return;    轮到我了吗？
 ... UI()
 ... fetch()   
 ... if (g !== guard.generation) return;         generation 检查
guard.end(g);                               任务结束，把锁还回去


网络层允许并发 generation 控制，业务层必须串行 state 控制。

import { createSignal } from './signal.js'
                                                            //  查询锁
export class QueryGuard {                                  // 它确保：队列不会重入、查询不会并发、旧查询不会误清理新查询。
  private _status: 'idle' | 'dispatching' | 'running' = 'idle'   // 状态只有三种 indicator for UI/human 需要知道状态 
  private _generation = 0                                  // 并发控制 the result 防止旧查询 清理新查询的状态
  private _changed = createSignal()

  /**
   * Reserve the guard for queue processing. Transitions idle → dispatching.
   * Returns false if not idle (another query or dispatch in progress).
   */
  reserve(): boolean {                                  //   占位防止并发        
    if (this._status !== 'idle') return false
    this._status = 'dispatching'
    this._notify()
    return true
  }

  /**
   * Cancel a reservation when processQueueIfReady had nothing to process.
   * Transitions dispatching → idle.
   */
  cancelReservation(): void {                  // dispatching → idle，撤销占位
    if (this._status !== 'dispatching') return
    this._status = 'idle'
    this._notify()
  }

  /**
   * Start a query. Returns the generation number on success,
   * or null if a query is already running (concurrent guard).
   * Accepts transitions from both idle (direct user submit)
   * and dispatching (queue processor path).
   */
  tryStart(): number | null {                   // dispatching/idle → running，真正开始查询
    if (this._status === 'running') return null
    this._status = 'running'
    ++this._generation                    // 防止旧查询的 finally 覆盖新查询
    this._notify()
    return this._generation
  }

  /**
   * End a query. Returns true if this generation is still current
   * (meaning the caller should perform cleanup). Returns false if a
   * newer query has started (stale finally block from a cancelled query).
   */
  end(generation: number): boolean {          // 仅在 generation 匹配时结束查询
    if (this._generation !== generation) return false
    if (this._status !== 'running') return false
    this._status = 'idle'
    this._notify()
    return true
  }

  /**
   * Force-end the current query regardless of generation.
   * Used by onCancel where any running query should be terminated.
   * Increments generation so stale finally blocks from the cancelled
   * query's promise rejection will see a mismatch and skip cleanup.
   */
  forceEnd(): void {                        // 强制结束并让旧查询自动失效
    if (this._status === 'idle') return
    this._status = 'idle'
    ++this._generation
    this._notify()
  }

  /**
   * Is the guard active (dispatching or running)?
   * Always synchronous — not subject to React state batching delays.
   */
  get isActive(): boolean {
    return this._status !== 'idle'
  }

  get generation(): number {
    return this._generation
  }

  // --
  // useSyncExternalStore interface

  /** Subscribe to state changes. Stable reference — safe as useEffect dep. */
  subscribe = this._changed.subscribe

  /** Snapshot for useSyncExternalStore. Returns `isActive`. */
  getSnapshot = (): boolean => {
    return this._status !== 'idle'
  }

  private _notify(): void {
    this._changed.emit()
  }
}

4 个真实世界场景，全部来自常见前端业务（搜索框、表单提交、数据刷新、队列任务）。
搜索框里连续输入 10 次，后端会收到 10 个请求，UI 会被旧请求覆盖新结果
QueryGuard 的作用：
只允许最新一次查询运行
旧查询的 finally 自动失效（generation 机制）
UI 永远只显示最新结果

一句话：
解决“旧请求覆盖新结果”的经典问题。 generation 机制

- 每次搜索都生成一个新的 generation（版本号）
- 请求回来时检查版本号 如果版本号不是最新 → 丢弃 只有最新版本号的请求能更新 UI
async search(keyword: string) {
    const g = this.generation() + 1;  // each search new number
    this.generation.set(g);          // latest number is what I want
    this.state.set('running');      // for UI

    try {
      const res = await fetch(`/api/search?q=${keyword}`).then(r => r.json());

      // generation 不匹配 → 旧请求 → 自动丢弃
      if (g !== this.generation()) return;

      this.result.set(res.items);
      this.error.set(null);
    } catch (e) {
      if (g !== this.generation()) return;
      this.error.set('搜索失败');
    } finally {
      if (g === this.generation()) this.state.set('idle');
    }
  }

2）表单提交：防止重复点击提交按钮
QueryGuard 的作用：
running 状态时禁止再次 start
UI 可以根据 isActive 禁用按钮
保证一次提交只会触发一次请求
一句话：
解决“重复提交”的业务事故。 
  private running = signal(false);
 async submit(payload: any) {
    if (this.running()) return; // 防重复提交

    this.running.set(true);
    try {
      await fetch('/api/submit', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    } finally {
      this.running.set(false);
    }
 }

3）数据刷新：防止轮询 / 自动刷新 与 手动刷新 冲突
真实问题：  
页面有自动刷新（轮询），用户又手动点“刷新”，两个请求并发，UI 状态乱跳。
QueryGuard 的作用：
自动刷新 reserve → dispatching
手动刷新 tryStart → running
自动刷新被阻止，不会抢占 UI

一句话：
解决“自动刷新 vs 手动刷新”的冲突。

4）任务队列：确保一次只处理一个任务（例如上传队列）
真实问题：  
上传队列中多个任务可能同时触发，导致资源竞争、顺序错乱。
QueryGuard 的作用：
队列先 reserve
真正开始时 tryStart
任务结束后 end → idle → 下一个任务开始

一句话：
让队列严格按顺序执行，不并发、不乱序。




场景 1：搜索框（完整版本：含 UI 状态更新）
const guard = new QueryGuard();

// UI 状态
let loading = false;
let data = [];
let error = null;

function setLoading(v) {
  loading = v;
  render();
}

function setData(v) {
  data = v;
  render();
}

function setError(v) {
  error = v;
  render();
}

async function search(keyword) {
  // 队列占位
  if (!guard.reserve()) return;

  // 真正开始执行
  const g = guard.tryStart();
  if (g === null) {
    guard.cancelReservation();
    return;
  }

  // UI：开始加载
  setLoading(true);
  setError(null);

  try {
    const res = await fetch(`/api/search?q=${keyword}`).then(r => r.json());

    // generation 不匹配 → 旧请求 → 自动丢弃
    if (g !== guard.generation) return;

    // UI：更新数据
    setData(res.items);
  } catch (e) {
    if (g !== guard.generation) return;
    setError('搜索失败');
  } finally {
    // 只有最新 generation 才能结束 loading
    if (g === guard.generation) {
      setLoading(false);
    }
    guard.end(g);
  }
}


angular version 

import { signal, computed, effect } from '@angular/core';

type QueryGuardState = 'idle' | 'dispatching' | 'running';

export class QueryGuardSignal {
  // 内部状态机
  private readonly _state = signal<QueryGuardState>('idle');
  private readonly _generation = signal(0);

  // 对外只读视图
  readonly state = computed(() => this._state());
  readonly generation = computed(() => this._generation());
  readonly isActive = computed(() => this._state() !== 'idle');

  // 订阅（模拟原来的 subscribe）
  private listeners = new Set<() => void>();

  constructor() {
    // 用 effect 把 signal 变化转成回调通知
    effect(() => {
      // 任何依赖 state/generation 的变化都会触发
      this._state();
      this._generation();
      for (const l of this.listeners) l();
    });
  }

  // === 原 API 等价实现 ===

  // idle -> dispatching
  reserve(): boolean {
    if (this._state() !== 'idle') return false;
    this._state.set('dispatching');
    return true;
  }

  // dispatching -> idle
  cancelReservation(): void {
    if (this._state() === 'dispatching') {
      this._state.set('idle');
    }
  }

  // idle/dispatching -> running
  // 返回当前 generation
  tryStart(): number | null {
    const s = this._state();
    if (s === 'idle' || s === 'dispatching') {
      this._state.set('running');
      const g = this._generation() + 1;
      this._generation.set(g);
      return g;
    }
    return null;
  }

  // 只有 generation 匹配时才允许结束
  end(generation: number): void {
    if (generation !== this._generation()) return;
    if (this._state() === 'running') {
      this._state.set('idle');
    }
  }

  // 强制结束当前查询（让旧 finally 全部失效）
  forceEnd(): void {
    if (this._state() !== 'idle') {
      this._state.set('idle');
      this._generation.update(g => g + 1);
    }
  }

  // === 原来的 subscribe / getSnapshot 等价接口 ===

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot() {        
    return {
      state: this._state(),
      generation: this._generation(),
      isActive: this.isActive(),
    };
  }
}

signal usage

const guard = new QueryGuardSignal();

async function search(keyword: string) {
  if (!guard.reserve()) return;

  const g = guard.tryStart();
  if (g === null) {
    guard.cancelReservation();
    return;
  }

  setLoading(true);

  try {
    const res = await fetch(`/api/search?q=${keyword}`).then(r => r.json());
    if (g !== guard.generation()) return;
    setData(res.items);
  } catch {
    if (g !== guard.generation()) return;
    setError('搜索失败');
  } finally {
    if (g === guard.generation()) setLoading(false);
    guard.end(g);
  }
}

