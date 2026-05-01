/**
 * A fixed-size circular buffer that automatically evicts the oldest items
 * when the buffer is full. Useful for maintaining a rolling window of data.
 */  
export class CircularBuffer<T> {       就像一个不断循环的待办事项清单   循环缓冲区 = 固定大小的环形队列
  private buffer: T[]
  private head = 0               // 指针：下一个写入的位置
  private size = 0               // 当前有多少个元素

  constructor(private capacity: number) {   // 最大容量（固定）
    this.buffer = new Array(capacity)
  }

  /**
   * Add an item to the buffer. If the buffer is full,
   * the oldest item will be evicted.
   */
  add(item: T): void {
    this.buffer[this.head] = item
    this.head = (this.head + 1) % this.capacity  // head 移到下一个位置（循环）
    if (this.size < this.capacity) {            // 如果还没满
      this.size++
    }                                  这个 % 操作使其循环！capacity = 5: head: 0 → 1 → 2 → 3 → 4 → 0 → 1 → 2...
  }

  /**
   * Add multiple items to the buffer at once.
   */
  addAll(items: T[]): void {
    for (const item of items) {
      this.add(item)
    }
  }

  /**
   * Get the most recent N items from the buffer.
   * Returns fewer items if the buffer contains less than N items.  [F][B][C][D][E]
                                                                        ↑
   */
  getRecent(count: number): T[] {
    const result: T[] = []
    const start = this.size < this.capacity ? 0 : this.head  // 缓冲区没满就从0开始 缓冲区满了就从head开始
    const available = Math.min(count, this.size)            // 取2个，但只有1个就返回1个
                                                            // 起点 就是指针 = start + size - available
    for (let i = 0; i < available; i++) {                  //  (起点 + 往后走 i 步) % 容量
      const index = (start + this.size - available + i) % this.capacity
      result.push(this.buffer[index]!)
    }

    return result
  }

  /**
   * Get all items currently in the buffer, in order from oldest to newest.
   */
  toArray(): T[] {
    if (this.size === 0) return []

    const result: T[] = []
    const start = this.size < this.capacity ? 0 : this.head

    for (let i = 0; i < this.size; i++) {
      const index = (start + i) % this.capacity
      result.push(this.buffer[index]!)
    }

    return result
  }

  /**
   * Clear all items from the buffer.
   */
  clear(): void {
    this.buffer.length = 0
    this.head = 0
    this.size = 0
  }

  /**
   * Get the current number of items in the buffer.
   */
  length(): number {
    return this.size
  }
}

场景：capacity=5, 当前有 [A][B][C][D][E], head=0
      要获取最近3个元素

start = 0 (head指向0，因为满了)
this.size = 5
available = 3
i = 0, 1, 2

i=0: index = (0 + 5 - 3 + 0) % 5 = 2 → buffer[2] = C ✓ (最旧)
i=1: index = (0 + 5 - 3 + 1) % 5 = 3 → buffer[3] = D ✓
i=2: index = (0 + 5 - 3 + 2) % 5 = 4 → buffer[4] = E ✓ (最新)

返回: [C, D, E] ✓
