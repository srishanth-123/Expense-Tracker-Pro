import api from '../api';

// Budget API wrapper. All responses are already unwrapped by the axios
// interceptor in `../api` (returns response.data.data when present).

export const getBudgets = () => api.get('/budgets');

export const getBudgetById = (id) => api.get(`/budgets/${id}`);

export const getBudgetSummary = (month, year) => {
  const params = new URLSearchParams();
  if (month) params.append('month', month);
  if (year) params.append('year', year);
  const qs = params.toString();
  return api.get(`/budgets/summary${qs ? `?${qs}` : ''}`);
};

export const createBudget = (payload) => api.post('/budgets', payload);

export const updateBudget = (id, payload) => api.put(`/budgets/${id}`, payload);

export const deleteBudget = (id) => api.delete(`/budgets/${id}`);

export const restoreBudget = (id) => api.post(`/budgets/${id}/restore`);

export const getCategories = () => api.get('/categories');

export default {
  getBudgets,
  getBudgetById,
  getBudgetSummary,
  createBudget,
  updateBudget,
  deleteBudget,
  restoreBudget,
  getCategories,
};
