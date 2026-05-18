class TrieNode {
    constructor() {
        this.children = {};
        this.isEndOfWord = false;
        this.items = []; // Store the items: { id, text, type }
    }
}

class Trie {
    constructor() {
        this.root = new TrieNode();
    }

    insert(word, item) {
        if (!word) return;
        let node = this.root;
        const lowerWord = word.toLowerCase();
        
        for (let char of lowerWord) {
            if (!node.children[char]) {
                node.children[char] = new TrieNode();
            }
            node = node.children[char];
        }
        node.isEndOfWord = true;
        
        // Prevent duplicate insertions
        if (!node.items.find(i => i.id.toString() === item.id.toString())) {
            node.items.push(item);
        }
    }

    remove(word, id) {
        if (!word) return;
        let node = this.root;
        const lowerWord = word.toLowerCase();
        
        for (let char of lowerWord) {
            if (!node.children[char]) return;
            node = node.children[char];
        }
        
        if (node.isEndOfWord) {
            node.items = node.items.filter(i => i.id.toString() !== id.toString());
            if (node.items.length === 0) {
                node.isEndOfWord = false;
            }
        }
    }

    searchPrefix(prefix, limit = 10) {
        if (!prefix) return [];
        let node = this.root;
        const lowerPrefix = prefix.toLowerCase();
        
        for (let char of lowerPrefix) {
            if (!node.children[char]) return [];
            node = node.children[char];
        }
        
        const results = [];
        this._collect(node, results, limit);
        return results;
    }

    _collect(node, results, limit) {
        if (results.length >= limit) return;
        if (node.isEndOfWord) {
            results.push(...node.items);
        }
        for (let char in node.children) {
            this._collect(node.children[char], results, limit);
        }
    }
}

class SearchRegistry {
    constructor() {
        this.userTries = new Map();
    }

    getTrie(userId) {
        const idStr = userId.toString();
        if (!this.userTries.has(idStr)) {
            this.userTries.set(idStr, new Trie());
        }
        return this.userTries.get(idStr);
    }

    async initializeTrie() {
        try {
            const Category = require('../models/category');
            const Transaction = require('../models/Transaction');

            // Load Categories
            const categories = await Category.find({});
            categories.forEach(cat => {
                if (cat.name && cat.user) {
                    this.getTrie(cat.user).insert(cat.name, {
                        id: cat._id,
                        text: cat.name,
                        type: 'category'
                    });
                }
            });

            // Load Transactions
            const transactions = await Transaction.find({ description: { $ne: null, $ne: '' } });
            transactions.forEach(txn => {
                if (txn.description && txn.user) {
                    this.getTrie(txn.user).insert(txn.description, {
                        id: txn._id,
                        text: txn.description,
                        type: 'transaction'
                    });
                }
            });

            console.log('Trie loaded with existing categories and transactions successfully.');
        } catch (error) {
            console.error('Failed to initialize Trie:', error);
        }
    }
}

const searchRegistry = new SearchRegistry();
module.exports = searchRegistry;
