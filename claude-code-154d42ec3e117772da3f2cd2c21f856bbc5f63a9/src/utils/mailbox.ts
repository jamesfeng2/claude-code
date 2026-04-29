import { createSignal } from './signal.js'

export type MessageSource = 'user' | 'teammate' | 'system' | 'tick' | 'task'

export type Message = {
  id: string
  source: MessageSource
  content: string
  from?: string
  color?: string
  timestamp: string
}

type Waiter = {
  fn: (msg: Message) => boolean // Filter predicate
  resolve: (msg: Message) => void //fullfilll promise履行承诺callback with msg 
}

export class Mailbox {
  private queue: Message[] = []
  private waiters: Waiter[] = []
  private changed = createSignal()
  private _revision = 0

  get length(): number {
    return this.queue.length
  }

  get revision(): number {
    return this._revision
  }
// mailbox.send({ source: 'user', content: 'Hello' })   
  
  send(msg: Message): void {  
    this._revision++
    const idx = this.waiters.findIndex(w => w.fn(msg))
    if (idx !== -1) {
      const waiter = this.waiters.splice(idx, 1)[0]  // Remove Matched Waiter
      if (waiter) {
        waiter.resolve(msg)
        this.notify()
        return
      }
    }
    this.queue.push(msg)
    this.notify()
  }

  poll(fn: (msg: Message) => boolean = () => true): Message | undefined {
    const idx = this.queue.findIndex(fn)
    if (idx === -1) return undefined
    return this.queue.splice(idx, 1)[0] Remove Matched Message
  }
// const userMessagespromise = mailbox.receive(
//   (msg) => msg.source === 'user'  // fn: filter function
// )

  // const msg = await userMessagespromise  // ⏳ Waiting...
  receive(fn: (msg: Message) => boolean = () => true): Promise<Message> {
    const idx = this.queue.findIndex(fn)
    if (idx !== -1) {
      const msg = this.queue.splice(idx, 1)[0] Remove Matched Message
      if (msg) { 从队列中移除消息 返回那个消息给调用者
        this.notify()
        return Promise.resolve(msg)
      }
    }
    return new Promise<Message>(resolve => {
      this.waiters.push({ fn, resolve })
    })
  }

  subscribe = this.changed.subscribe

  private notify(): void {
    this.changed.emit()
  }
}


// signal version

import { signal, computed } from '@angular/core'

export type MessageSource = 'user' | 'teammate' | 'system' | 'tick' | 'task'

export type Message = {
  id: string
  source: MessageSource
  content: string
  from?: string
  color?: string
  timestamp: string
}

type Waiter = {
  fn: (msg: Message) => boolean
  resolve: (msg: Message) => void
}

export class Mailbox {
  private queue = signal<Message[]>([])
  private waiters = signal<Waiter[]>([])
  private _revision = signal(0)

  // Computed properties - automatically track dependencies
  length = computed(() => this.queue().length)
  revision = computed(() => this._revision())
  isEmpty = computed(() => this.queue().length === 0)
  isFull = computed(() => this.queue().length > 100) // Example threshold

  send(msg: Message): void {
    this._revision.update(v => v + 1)
    
    const idx = this.waiters().findIndex(w => w.fn(msg))
    if (idx !== -1) {
      const waiter = this.waiters()[idx]
      this.waiters.update(ws => ws.filter((_, i) => i !== idx))
      
      if (waiter) {
        waiter.resolve(msg)
        return
      }
    }
    
    this.queue.update(q => [...q, msg])
  }

  poll(fn: (msg: Message) => boolean = () => true): Message | undefined {
    const queue = this.queue()
    const idx = queue.findIndex(fn)
    
    if (idx === -1) return undefined
    
    const msg = queue[idx]
    this.queue.update(q => q.filter((_, i) => i !== idx))
    return msg
  }

  receive(fn: (msg: Message) => boolean = () => true): Promise<Message> {
    const queue = this.queue()
    const idx = queue.findIndex(fn)
    
    if (idx !== -1) {
      const msg = queue[idx]
      this.queue.update(q => q.filter((_, i) => i !== idx))
      return Promise.resolve(msg)
    }
    
    return new Promise<Message>(resolve => {
      this.waiters.update(ws => [...ws, { fn, resolve }])
    })
  }
}
