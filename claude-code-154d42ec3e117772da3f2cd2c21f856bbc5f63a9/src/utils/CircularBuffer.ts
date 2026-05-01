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


// 创建缓冲区（最多10条日志）
const logs = new CircularBuffer<string>(10)

// 添加数据
logs.addAll(['log1', 'error2', 'warn3', 'info4'])

// 高效遍历
for (const log of logs) {
  console.log(log)  // 无需 toArray()！
}

// 高级查询
const hasError = logs.some(log => log.includes('error'))
const errorLogs = logs.filter(log => log.startsWith('error'))
const upperLogs = logs.map(log => log.toUpperCase())

// 统计信息
console.log(logs.getStats())
// { size: 4, capacity: 10, fillPercentage: 40, ... }

// 范围查询
const recent = logs.slice(-3)  // 最近3条

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


enhance version

class CircularBuffer<T> {
    private buffer: T[];
    private capacity: number;
    private head: number;
    private tail: number;
    private size: number;

    constructor(capacity: number) {
        this.capacity = capacity;
        this.buffer = new Array<T>(capacity);
        this.head = 0;
        this.tail = 0;
        this.size = 0;
    }

    push(item: T): void {
        this.buffer[this.tail] = item;
        this.tail = (this.tail + 1) % this.capacity;
        if (this.size < this.capacity) {
            this.size++;
        } else {
            this.head = (this.head + 1) % this.capacity; // Overwrite older data
        }
    }

    pop(): T | undefined {
        if (this.size === 0) return undefined;
        const item = this.buffer[this.head];
        this.head = (this.head + 1) % this.capacity;
        this.size--;
        return item;
    }

    toArray(): T[] {
        const result: T[] = new Array<T>(this.size);
        for (let i = 0; i < this.size; i++) {
            result[i] = this.buffer[(this.head + i) % this.capacity];
        }
        return result;
    }

    filter(predicate: (value: T) => boolean): T[] {
        return this.toArray().filter(predicate);
    }

    map<U>(mapper: (value: T) => U): U[] {
        return this.toArray().map(mapper);
    }

    reverse(): T[] {
        return this.toArray().reverse();
    }

    forEach(callback: (value: T) => void): void {
        this.toArray().forEach(callback);
    }

    findLast(predicate: (value: T) => boolean): T | undefined {
        for (let i = this.size - 1; i >= 0; i--) {
            const value = this.buffer[(this.head + i) % this.capacity];
            if (predicate(value)) {
                return value;
            }
        }
        return undefined;
    }

    isFull(): boolean {
        return this.size === this.capacity;
    }

    isEmpty(): boolean {
        return this.size === 0;
    }

    getRangeSize(start: number, end: number): number {
        if (start < 0 || end > this.size || start > end) {
            throw new Error('Invalid range');
        }
        return end - start;
    }

    statistics(): { size: number; capacity: number; isEmpty: boolean; isFull: boolean } {
        return {
            size: this.size,
            capacity: this.capacity,
            isEmpty: this.isEmpty(),
            isFull: this.isFull(),
        };
    }
}

