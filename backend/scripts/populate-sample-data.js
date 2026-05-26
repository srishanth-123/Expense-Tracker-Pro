const mongoose = require('mongoose');
const Transaction = require('../models/transaction');
const Category = require('../models/category');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/expense-tracker';

const sampleData = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const userId = '6a152fc406564dca2cbe12d4'; // Test user ID

    // Get or create Food category
    let category = await Category.findOne({ name: 'Food', user: userId });
    if (!category) {
      category = await Category.create({
        name: 'Food',
        type: 'expense',
        icon: '🍔',
        color: '#FF6B6B',
        user: userId
      });
      console.log('Created Food category');
    }

    // Sample transactions
    const transactions = [
      // Expenses
      { type: 'expense', amount: 450, description: 'Grocery shopping', category: category._id, user: userId, date: new Date('2026-05-20') },
      { type: 'expense', amount: 120, description: 'Uber ride', category: category._id, user: userId, date: new Date('2026-05-20') },
      { type: 'expense', amount: 2500, description: 'New clothes', category: category._id, user: userId, date: new Date('2026-05-19') },
      { type: 'expense', amount: 350, description: 'Movie tickets', category: category._id, user: userId, date: new Date('2026-05-19') },
      { type: 'expense', amount: 1500, description: 'Electricity bill', category: category._id, user: userId, date: new Date('2026-05-18') },
      { type: 'expense', amount: 500, description: 'Doctor consultation', category: category._id, user: userId, date: new Date('2026-05-18') },
      { type: 'expense', amount: 2000, description: 'Online course', category: category._id, user: userId, date: new Date('2026-05-17') },
      { type: 'expense', amount: 300, description: 'Lunch at restaurant', category: category._id, user: userId, date: new Date('2026-05-17') },
      { type: 'expense', amount: 80, description: 'Bus pass', category: category._id, user: userId, date: new Date('2026-05-16') },
      { type: 'expense', amount: 800, description: 'Shoes', category: category._id, user: userId, date: new Date('2026-05-16') },
      { type: 'expense', amount: 450, description: 'Netflix subscription', category: category._id, user: userId, date: new Date('2026-05-15') },
      { type: 'expense', amount: 1200, description: 'Internet bill', category: category._id, user: userId, date: new Date('2026-05-15') },
      { type: 'expense', amount: 350, description: 'Medicine', category: category._id, user: userId, date: new Date('2026-05-14') },
      { type: 'expense', amount: 1500, description: 'Books', category: category._id, user: userId, date: new Date('2026-05-14') },
      { type: 'expense', amount: 600, description: 'Dinner with friends', category: category._id, user: userId, date: new Date('2026-05-13') },
      { type: 'expense', amount: 150, description: 'Taxi', category: category._id, user: userId, date: new Date('2026-05-13') },
      { type: 'expense', amount: 1200, description: 'Electronics', category: category._id, user: userId, date: new Date('2026-05-12') },
      { type: 'expense', amount: 800, description: 'Concert tickets', category: category._id, user: userId, date: new Date('2026-05-12') },
      { type: 'expense', amount: 2000, description: 'Water bill', category: category._id, user: userId, date: new Date('2026-05-11') },
      { type: 'expense', amount: 450, description: 'Gym membership', category: category._id, user: userId, date: new Date('2026-05-11') },
      // Income
      { type: 'income', amount: 50000, description: 'Monthly salary', category: category._id, user: userId, date: new Date('2026-05-15') },
      { type: 'income', amount: 15000, description: 'Freelance project', category: category._id, user: userId, date: new Date('2026-05-18') },
      { type: 'income', amount: 5000, description: 'Stock dividend', category: category._id, user: userId, date: new Date('2026-05-20') },
      { type: 'income', amount: 8000, description: 'Freelance consulting', category: category._id, user: userId, date: new Date('2026-05-10') },
      { type: 'income', amount: 3000, description: 'Investment return', category: category._id, user: userId, date: new Date('2026-05-05') }
    ];

    const created = await Transaction.insertMany(transactions);
    console.log(`Created ${created.length} transactions`);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    console.log('Refresh your browser to see the beautiful dashboard!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

sampleData();
