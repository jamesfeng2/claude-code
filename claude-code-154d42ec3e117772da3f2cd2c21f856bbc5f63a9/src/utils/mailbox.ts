import { createSignal } from './signal.js'
// Waiters  	Async coordination, filtered subscribers	Efficient, decoupled	More complex
// RxJS Observable	Multiple subscribers, reactive chains	Powerful operators, well-tested	Dependency overhead
// EventEmitter	Simple pub/sub	Familiar pattern	No filtering, message loss
// Generator/async iterator	Sequential consumption	Natural async syntax	Single consumer
// Queue + polling	Simple cases	Easy to understand	Wasteful, blocking

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
      const waiter = this.waiters.splice(idx, 1)[0]  // Remove Matched Waiter // destructring [waiter] //.at(0)
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
    return this.queue.splice(idx, 1)[0]         // Remove Matched Message
  }

// Without waiters - consumer must poll:
while (true) {
  const msg = mailbox.poll(msg => msg.source === 'user')
  if (msg) break
  await sleep(100)  // Wasteful polling
}

// With waiters - consumer suspends efficiently:
const msg = await mailbox.receive(msg => msg.source === 'user')  // Clean, efficient
  
// const userMessagespromise = mailbox.receive(
//   (msg) => msg.source === 'user'  // fn: filter function
// )

  // const msg = await userMessagespromise  // ⏳ Waiting...
  receive(fn: (msg: Message) => boolean = () => true): Promise<Message> {
    const idx = this.queue.findIndex(fn)
    if (idx !== -1) {
      const msg = this.queue.splice(idx, 1)[0]         Remove Matched Message
      if (msg) {                             从队列中移除消息 返回那个消息给调用者
        this.notify()
        return Promise.resolve(msg)
      }
    }
    return new Promise<Message>(resolve => {
      this.waiters.push({ fn, resolve })
    })
  }

  subscribe = this.changed.subscribe // Manual notification subscription // when the mailbox state changed (message added/removed).
                                     // It provided external notifications when the mailbox state changed (message added/removed). 
  private notify(): void {     // To notify external listeners:
    this.changed.emit()       // Must explicitly emit
  }
}

// External code could subscribe to mailbox changes:
mailbox.subscribe(() => {            
  console.log('Mailbox changed!')
  console.log('New length:', mailbox.length)
})

// decoupling producer/consumer timing
// Consumer waits first, producer sends later
const msgPromise = mailbox.receive(msg => msg.source === 'user')
// ... do other work ...
mailbox.send({ source: 'user', content: 'Hi' })  // ✅ Promise resolves
const msg = await msgPromise

// usage multiple independent consumers
const userMsg = mailbox.receive(msg => msg.source === 'user')
const sysMsg = mailbox.receive(msg => msg.source === 'system')
const teamMsg = mailbox.receive(msg => msg.source === 'teammate')
// Each waits independently, gets notified when matching message arrives




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

// waiter pattern implements a producer-consumer queue 
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
        waiter.resolve(msg)           // send data to complete fullfillment promise chain
        return
      }
    }
    
    this.queue.update(q => [...q, msg])      // If no waiter matched, queue it
                                            // ❌ No return needed - function ends naturally
  }

  poll(fn: (msg: Message) => boolean = () => true): Message | undefined {
    const queue = this.queue()
    const idx = queue.findIndex(fn)
    
    if (idx === -1) return undefined
    
    const msg = queue[idx]
    this.queue.update(q => q.filter((_, i) => i !== idx))   //This is a destructive operation - mached message is no longer in the mailbox after poll().
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
