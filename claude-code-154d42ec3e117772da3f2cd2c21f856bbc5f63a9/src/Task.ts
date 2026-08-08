
                    Task.ts
                       │
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
     TaskType       TaskStatus      TaskState
        │              │              │
     是什么？        到哪一步？      保存什么？
        │              │              │
   bash/agent/...  pending/running   id
                   completed/...     type
                                     status
                                     time
                                     output
generateTaskId()
        ↓
给 Task 一个唯一 ID

createTaskStateBase()
        ↓
创建 Task 的初始状态

isTerminalTaskStatus()
        ↓
判断 Task 是否已经彻底结束


import { randomBytes } from 'crypto'
import type { AppState } from './state/AppState.js'
import type { AgentId } from './types/ids.js'
import { getTaskOutputPath } from './utils/task/diskOutput.js'

export type TaskType =
  | 'local_bash'
  | 'local_agent'
  | 'remote_agent'
  | 'in_process_teammate'
  | 'local_workflow'
  | 'monitor_mcp'
  | 'dream'

export type TaskStatus =   // 生命周期
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'killed'

/**
 * True when a task is in a terminal state and will not transition further.
 * Used to guard against injecting messages into dead teammates, evicting
 * finished tasks from AppState, and orphan-cleanup paths.
 * 任务已经结束，不应该再继续改变状态。
 */ 
export function isTerminalTaskStatus(status: TaskStatus): boolean {    // terminal state
  return status === 'completed' || status === 'failed' || status === 'killed'
}

export type TaskHandle = {
  taskId: string
  cleanup?: () => void
}

export type SetAppState = (f: (prev: AppState) => AppState) => void

export type TaskContext = {
  abortController: AbortController
  getAppState: () => AppState
  setAppState: SetAppState
}

// Base fields shared by all task states
export type TaskStateBase = {
  id: string
  type: TaskType
  status: TaskStatus
  description: string
  toolUseId?: string
  startTime: number
  endTime?: number
  totalPausedMs?: number
  outputFile: string
  outputOffset: number
  notified: boolean
}

export type LocalShellSpawnInput = {
  command: string
  description: string
  timeout?: number
  toolUseId?: string
  agentId?: AgentId
  /** UI display variant: description-as-label, dialog title, status bar pill. */
  kind?: 'bash' | 'monitor'
}

// What getTaskByType dispatches for: kill. spawn/render were never
// called polymorphically (removed in #22546). All six kill implementations
// use only setAppState — getAppState/abortController were dead weight.
export type Task = {
  name: string
  type: TaskType
  kill(taskId: string, setAppState: SetAppState): Promise<void>
}

// Task ID prefixes
const TASK_ID_PREFIXES: Record<string, string> = {
  local_bash: 'b', // Keep as 'b' for backward compatibility
  local_agent: 'a',
  remote_agent: 'r',
  in_process_teammate: 't',
  local_workflow: 'w',
  monitor_mcp: 'm',
  dream: 'd',
}

// Get task ID prefix
function getTaskIdPrefix(type: TaskType): string {
  return TASK_ID_PREFIXES[type] ?? 'x'
}

// 后面再产生随机字符。
// Case-insensitive-safe alphabet (digits + lowercase) for task IDs.
// 36^8 ≈ 2.8 trillion combinations, sufficient to resist brute-force symlink attacks.
const TASK_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

export function generateTaskId(type: TaskType): string {
  const prefix = getTaskIdPrefix(type)
  const bytes = randomBytes(8)
  let id = prefix
  for (let i = 0; i < 8; i++) {
    id += TASK_ID_ALPHABET[bytes[i]! % TASK_ID_ALPHABET.length]
  }
  return id
}
 
// 创建一个新的 Task 的初始状态
// createTaskStateBase(
//   'b12345678',
//   'local_bash',
//   'run npm test'
// )
 export function createTaskStateBase(
  id: string,
  type: TaskType,
  description: string,
  toolUseId?: string,
): TaskStateBase {
  return {
    id,
    type,
    status: 'pending',
    description,
    toolUseId,
    startTime: Date.now(),
    outputFile: getTaskOutputPath(id),
    outputOffset: 0,
    notified: false,
  }
// 得到大概   {
//   id: 'b12345678',
//   type: 'local_bash',
//   status: 'pending',
//   description: 'run npm test',
//   startTime: ...,
//   outputFile: ...,
//   outputOffset: 0,
//   notified: false
// }
}
