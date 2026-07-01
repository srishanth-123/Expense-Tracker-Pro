class Heap {
    constructor(comparator) {
        this.data = [];
        // comparator(a, b) should return > 0 if a should go before b in the heap (e.g. for max heap, a > b)
        this.comparator = comparator || ((a, b) => a - b);
    }

    size() {
        return this.data.length;
    }

    isEmpty() {
        return this.data.length === 0;
    }

    peek() {
        if (this.isEmpty()) return null;
        return this.data[0];
    }

    push(val) {
        this.data.push(val);
        this._bubbleUp(this.data.length - 1);
    }

    pop() {
        if (this.isEmpty()) return null;
        const top = this.data[0];
        const bottom = this.data.pop();
        if (this.data.length > 0) {
            this.data[0] = bottom;
            this._sinkDown(0);
        }
        return top;
    }

    _bubbleUp(index) {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.comparator(this.data[index], this.data[parentIndex]) > 0) {
                // Swap
                const temp = this.data[parentIndex];
                this.data[parentIndex] = this.data[index];
                this.data[index] = temp;
                index = parentIndex;
            } else {
                break;
            }
        }
    }

    _sinkDown(index) {
        const length = this.data.length;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            let leftChildIndex = 2 * index + 1;
            let rightChildIndex = 2 * index + 2;
            let swapIndex = null;

            if (leftChildIndex < length) {
                if (this.comparator(this.data[leftChildIndex], this.data[index]) > 0) {
                    swapIndex = leftChildIndex;
                }
            }

            if (rightChildIndex < length) {
                if (
                    (swapIndex === null && this.comparator(this.data[rightChildIndex], this.data[index]) > 0) ||
                    (swapIndex !== null && this.comparator(this.data[rightChildIndex], this.data[leftChildIndex]) > 0)
                ) {
                    swapIndex = rightChildIndex;
                }
            }

            if (swapIndex === null) break;

            const temp = this.data[index];
            this.data[index] = this.data[swapIndex];
            this.data[swapIndex] = temp;
            index = swapIndex;
        }
    }
}

module.exports = Heap;
