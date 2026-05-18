# Comprehensive API Testing Guide & Reference

This document serves as your complete API Reference Guide and Postman Testing Guide. Below, I've listed **every single backend endpoint** along with the HTTP Method, URL, necessary URL parameters/queries, and fully formatted JSON body examples.

---

## Postman Setup 
You can test all of these easily using the `Complete_Postman_Collection.json`.
1. **Import** the JSON file into Postman.
2. Under your new Collection, Postman handles the `{{authToken}}`, `{{categoryId}}`, and `{{transactionId}}` assignments automatically when you execute creation routes.
3. Every protected route inherits `Bearer {{authToken}}` from the parent collection settings automatically. So you don't have to manually attach your token to each request!

---

## 1. Authentication Routes

### 1.1 Register User
Registers a new user in the system. The `{{authToken}}` will be automatically generated and saved by Postman if you use the collection.
- **Method:** `POST`
- **URL:** `/api/auth/register`
- **Headers:** `Content-Type: application/json`
- **Body:**
```json
{
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "Password123"
}
```

### 1.2 Login User
Logs in an existing user and retrieves a new session token.
- **Method:** `POST`
- **URL:** `/api/auth/login`
- **Headers:** `Content-Type: application/json`
- **Body:**
```json
{
    "email": "jane@example.com",
    "password": "Password123"
}
```

---

## 2. Category Routes
Transactions and budgets *must* be linked to a Category, so testing this section is required before testing transactions!

### 2.1 Create Category
Creates a new expense/income category. The `{{categoryId}}` is auto-saved in Postman.
- **Method:** `POST`
- **URL:** `/api/categories`
- **Headers:** `Authorization: Bearer {{token}}`
- **Body:**
```json
{
    "name": "Groceries"
}
```

### 2.2 Get All Categories
Retrieves all categories associated with the logged-in user.
- **Method:** `GET`
- **URL:** `/api/categories`
- **Headers:** `Authorization: Bearer {{token}}`
- **Body:** None

### 2.3 Delete Category
Deletes a specific category.
- **Method:** `DELETE`
- **URL:** `/api/categories/{{categoryId}}`
- **Headers:** `Authorization: Bearer {{token}}`
- **Body:** None

---

## 3. Transaction Routes

### 3.1 Create Transaction
Adds a new transaction. Needs an existing Category ID. The `{{transactionId}}` gets saved automatically in Postman.
- **Method:** `POST`
- **URL:** `/api/transactions`
- **Headers:** `Authorization: Bearer {{token}}`
- **Body:**
```json
{
    "amount": 250.75,
    "type": "expense",
    "category": "{{categoryId}}",
    "description": "Weekly grocery run",
    "date": "2024-03-25"
}
```

### 3.2 Get All Transactions
Fetches the user's transactions with support for pagination, sorting, and filtering.
- **Method:** `GET`
- **URL:** `/api/transactions` (Optional query params can be attached)
- **Headers:** `Authorization: Bearer {{token}}`
- **Query Parameters (Optional):**
  - `page`: e.g. `1`
  - `limit`: e.g. `10`
  - `type`: `income` or `expense`
  - `category`: Category ID
  - `startDate`: e.g. `2024-01-01`
  - `endDate`: e.g. `2024-12-31`
  - `sortBy`: e.g. `amount` or `date`
  - `sortOrder`: `asc` or `desc`
- **Example URL:** `/api/transactions?type=expense&limit=5&sortBy=amount&sortOrder=desc`
- **Body:** None

### 3.3 Get Single Transaction
Retrieves details of a specific transaction by its ID.
- **Method:** `GET`
- **URL:** `/api/transactions/{{transactionId}}`
- **Headers:** `Authorization: Bearer {{token}}`
- **Body:** None

### 3.4 Update Transaction
Modifies an existing transaction. You only need to send the fields you wish to update.
- **Method:** `PUT`
- **URL:** `/api/transactions/{{transactionId}}`
- **Headers:** `Authorization: Bearer {{token}}`
- **Body (Partial Updates Allowed):**
```json
{
    "amount": 300.50,
    "description": "Updated grocery expense"
}
```

### 3.5 Delete Transaction
Removes a specific transaction.
- **Method:** `DELETE`
- **URL:** `/api/transactions/{{transactionId}}`
- **Headers:** `Authorization: Bearer {{token}}`
- **Body:** None

---

## 4. Budget Routes

### 4.1 Set Monthly Budget
Sets a numerical restriction/budget for a specific category for a specific month.
- **Method:** `POST`
- **URL:** `/api/budgets`
- **Headers:** `Authorization: Bearer {{token}}`
- **Body:**
```json
{
    "category": "{{categoryId}}",
    "limit": 500.00,
    "month": 3,
    "year": 2024
}
```

### 4.2 Get All Budgets
Retrieves all budget configurations tied to the user.
- **Method:** `GET`
- **URL:** `/api/budgets`
- **Headers:** `Authorization: Bearer {{token}}`
- **Body:** None

### 4.3 Check Budget Status
Returns the user's spending against their set limits to see if they've exceeded their budget.
- **Method:** `GET`
- **URL:** `/api/budgets/check`
- **Headers:** `Authorization: Bearer {{token}}`
- **Query Parameters (Required):**
  - `month`: Numerical representation of the month (1-12)
  - `year`: The year (e.g., 2024)
- **Example URL:** `/api/budgets/check?month=3&year=2024`
- **Body:** None

---

## 5. Analytics Routes

### 5.1 Monthly Income/Expense Summary
Aggregates total absolute earnings and expenses for the logged-in user.
- **Method:** `GET`
- **URL:** `/api/analytics/summary`
- **Headers:** `Authorization: Bearer {{token}}`
- **Body:** None

### 5.2 Category Breakdown
Calculates exactly how much was spent grouped by each category (only returns type "expense").
- **Method:** `GET`
- **URL:** `/api/analytics/category`
- **Headers:** `Authorization: Bearer {{token}}`
- **Body:** None

### 5.3 Search Transactions by Description
Searches the user's transactions based on fuzzy text matching of the transaction `description`.
- **Method:** `GET`
- **URL:** `/api/analytics/search`
- **Headers:** `Authorization: Bearer {{token}}`
- **Query Parameters (Required):**
  - `keyword`: The string you want to search.
- **Example URL:** `/api/analytics/search?keyword=grocery`
- **Body:** None

### 5.4 Exact Monthly Report
Pulls the total income and expense explicitly constrained to a specific given month/year pairing.
- **Method:** `GET`
- **URL:** `/api/analytics/report`
- **Headers:** `Authorization: Bearer {{token}}`
- **Query Parameters (Required):**
  - `month`: Numerical month (1-12)
  - `year`: Year (e.g., 2024)
- **Example URL:** `/api/analytics/report?month=3&year=2024`
- **Body:** None
