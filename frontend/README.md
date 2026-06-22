# Expense Tracker Pro — Frontend Documentation

This is the client-side single-page application (SPA) for **Expense Tracker Pro**, built using **React 19, Vite, and Vanilla CSS**.

It features premium HSL-themed UI styles, real-time WebSocket integrations, a dynamic stateful AI chat panel, and advanced rendering performance optimizations.

---

## 🎨 Visual System & Premium Aesthetics

1. **High-Blur Glassmorphism**:
   - Authentication pages (Login, Register) leverage custom neon glowing finance backdrops (`/auth_background.png`) coupled with glass card overlays (`backdrop-filter: blur(20px)` and semi-transparent borders).
   - High contrast styling, dark themes, and HSL variable mappings support system-wide dark/light mode toggles.
2. **Numeric Input Scroll Protection**:
   - Implemented a custom React hook `useNumericInputScrollFix` that prevents users from accidentally incrementing or decrementing numeric field inputs when using mouse scroll wheels.
3. **Animated Wallet Balance Ring**:
   - The digital wallet dashboard uses animated SVG progress meters with `framer-motion` to smoothly transition and display funds, credit/debit transaction logs, and payout requests.
4. **Interactive Budgets Progress**:
   - Displays real-time category budget consumptions using animated circular progress meters that transition dynamically from Indigo (<80%) to Orange (80-90%) and Crimson Red (>=100%).

---

## 🔄 Core Frontend Contexts & State Management

The frontend orchestrates application states using 4 dedicated React Context providers:

* **[AuthContext](file:///src/context/AuthContext.jsx)**:
  - Manages JWT sessions, user profiles, login locks, and real-time wallet balances.
  - Implements a 500ms debounced refresh wrapper on socket triggers to prevent excessive backend API calls.
* **[SocketContext](file:///src/context/SocketContext.jsx)**:
  - Spawns and manages the persistent `socket.io-client` client instance.
  - Anchored strictly to the stable `user?._id` reference string to eliminate redundant connection re-handshakes and socket loops.
* **[ChatContext](file:///src/context/ChatContext.jsx)**:
  - Manages user sessions and rolling state history for the **FinPilot AI Assistant**.
  - Restores active sessions eagerly upon login based on a stable user identity.
* **[ThemeContext](file:///src/context/ThemeContext.jsx)**:
  - Toggles between light and dark modes by dynamically updating CSS custom properties (variables) on the document root element.

---

## 🛠️ Optimizations & Rendering Performance

1. **Eager Page Loading**:
   - Switched post-login routes (Login, Register, Dashboard) from dynamic lazy imports (`React.lazy`) to eager static imports. This eliminates Suspense-based chunk spinners and speeds up redirection times.
2. **Silent Background Synchronization**:
   - Data fetching hooks across Dashboard, Analytics, Wallet, Budgets, and Transactions support a `silent` option. When background webhooks or socket notifications trigger updates, the UI refetches data silently without resetting states or showing full-page skeleton loaders.
3. **Stabilized Effect Dependency Arrays**:
   - Removed unstable object-reference dependencies from react triggers, replacing them with stable strings like `userId` (`user?._id`).
4. **Category Dropdown Synchronizer**:
   - Configured `BudgetForm` to monitor categories loading asynchronously, automatically selecting the first resolved category element instead of leaving the form field blank.

---

## 🚀 Getting Started

### Installation
1. Ensure the parent backend server is running.
2. Install client dependencies:
   ```bash
   npm install
   ```
3. Set your environment variables in `.env`:
   ```env
   VITE_API_URL=http://localhost:5000
   ```
4. Start the Vite hot-reloading development server:
   ```bash
   npm run dev
   ```

### Production Bundle Build
Generate highly optimized CSS/JS production assets:
```bash
npm run build
```
Production assets compile inside the `dist/` directory.
