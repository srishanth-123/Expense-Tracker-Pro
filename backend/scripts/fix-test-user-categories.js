const mongoose = require('mongoose');
require('dotenv').config();

const Category = require('../models/category');
const Transaction = require('../models/transaction');

const userId = '6a152fc406564dca2cbe12d4';

const transactionCategoryMap = {
  'Monthly salary': 'Salary',
  'Freelance project': 'Freelance',
  'Stock dividend': 'Investment',
  'Freelance consulting': 'Freelance',
  'Investment return': 'Investment',
  'Grocery shopping': 'Food',
  'Lunch at restaurant': 'Food',
  'Dinner with friends': 'Food',
  'Uber ride': 'Transport',
  'Bus pass': 'Transport',
  'Taxi': 'Transport',
  'New clothes': 'Shopping',
  'Shoes': 'Shopping',
  'Electronics': 'Shopping',
  'Movie tickets': 'Entertainment',
  'Netflix subscription': 'Entertainment',
  'Concert tickets': 'Entertainment',
  'Electricity bill': 'Bills',
  'Internet bill': 'Bills',
  'Water bill': 'Bills',
  'Doctor consultation': 'Health',
  'Medicine': 'Health',
  'Gym membership': 'Health',
  'Online course': 'Education',
  'Books': 'Education'
};

const categoryNames = [...new Set(Object.values(transactionCategoryMap))];

async function getOrCreateCategory(name) {
  let category = await Category.findOne({ user: userId, name, isDeleted: false });

  if (!category) {
    category = await Category.create({ user: userId, name });
    console.log(`Created category: ${name}`);
  }

  return category;
}

async function run() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing in backend/.env');
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const categoriesByName = {};
  for (const name of categoryNames) {
    categoriesByName[name] = await getOrCreateCategory(name);
  }

  let updatedCount = 0;

  for (const [description, categoryName] of Object.entries(transactionCategoryMap)) {
    const category = categoriesByName[categoryName];
    const result = await Transaction.updateMany(
      { user: userId, description, isDeleted: false },
      { $set: { category: category._id } }
    );

    if (result.modifiedCount > 0) {
      updatedCount += result.modifiedCount;
      console.log(`Updated ${result.modifiedCount}: ${description} -> ${categoryName}`);
    }
  }

  const summary = await Transaction.find({
    user: userId,
    description: { $in: Object.keys(transactionCategoryMap) },
    isDeleted: false
  })
    .populate('category', 'name')
    .select('description category amount type')
    .sort({ date: -1 });

  console.log('\nCorrected sample transactions:');
  summary.forEach((transaction) => {
    console.log(`- ${transaction.description}: ${transaction.category?.name || 'No category'} (${transaction.type}, Rs.${transaction.amount})`);
  });

  console.log(`\nTotal updated transactions: ${updatedCount}`);
  await mongoose.disconnect();
  console.log('Done. Refresh the frontend page.');
}

run().catch(async (error) => {
  console.error('Fix failed:', error.message);
  await mongoose.disconnect();
  process.exit(1);
});
