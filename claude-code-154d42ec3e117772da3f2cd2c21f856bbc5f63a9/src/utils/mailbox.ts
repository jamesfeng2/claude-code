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
                                      // 暴露信号的订阅方法
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
    
    const idx = this.waiters().findIndex(w => w.fn(msg))  // 第一步：检查是否有人等这个消息
    if (idx !== -1) {
      const waiter = this.waiters()[idx]                      // 找到了！移除这个等待者
      this.waiters.update(ws => ws.filter((_, i) => i !== idx))  
      
      if (waiter) {                    // 直接给他消息，完成Promise
        waiter.resolve(msg)           // send data to complete fullfillment promise chain
        return
      }
    }
                                            // 第二步：没人等，就放进队列
    this.queue.update(q => [...q, msg])      // If no waiter matched, queue it
                                            // ❌ No return needed - function ends naturally
  }
                                           // 轮询获取（同步）用途： 快速检查"有没有符合条件的消��"
  poll(fn: (msg: Message) => boolean = () => true): Message | undefined {
    const queue = this.queue()
    const idx = queue.findIndex(fn)
    
    if (idx === -1) return undefined
    
    const msg = queue[idx]
    this.queue.update(q => q.filter((_, i) => i !== idx))   //This is a destructive operation - mached message is no longer in the mailbox after poll().
    return msg
  }
                                  //  - 异步等待（高效）  
  receive(fn: (msg: Message) => boolean = () => true): Promise<Message> {
    const queue = this.queue()                
    const idx = queue.findIndex(fn)
    
    if (idx !== -1) {
      const msg = queue[idx]
      this.queue.update(q => q.filter((_, i) => i !== idx))
      return Promise.resolve(msg)
    }
    
    return new Promise<Message>(resolve => {    // 第二步：没有就注册等待 //等着，直到 send() 匹配了才会执行 resolve(msg)
      this.waiters.update(ws => [...ws, { fn, resolve }])
    })
  }

// poll() - Synchronous, immediate consumption: Fire-and-forget - doesn't create promises or hold state
// receive() - Asynchronous, waiting consumption:

  // Typical polling pattern - sync is essential: // 每100毫秒检查一次 ← 很浪费！
while (shouldKeepGoing) {            
  const msg = mailbox.poll(msg => msg.source === 'user')
  
  if (msg) {
    processMessage(msg)
  } else {
    // Do other work while waiting
    doSomeOtherTask()
  }
                    // ❌ 浪费资源的轮询方式
  await sleep(100)  // Explicit delay, not inside poll() 
}

  
  // Two async tasks both waiting for user messages // - 异步等待（高效
Promise.all([
  mailbox.receive(msg => msg.source === 'user'),  // Task A waits
  mailbox.receive(msg => msg.source === 'user'),  // Task B waits
]).then(([msgA, msgB]) => {
  console.log('Task A got:', msgA)
  console.log('Task B got:', msgB)
  // Without removal, both would get the same message!
})

mailbox.send({ source: 'user', content: 'First' })   // Task A wakes up
mailbox.send({ source: 'user', content: 'Second' })  // Task B wakes up
}
