import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  withCredentials: true,  // Send HttpOnly cookies on every request
  headers: {
    'Content-Type': 'application/json'
  }
});

// Interceptor to attach JWT token to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor to unwrap standard response format { success, message, data }
api.interceptors.response.use(
  (response) => {
    // If the backend returned { success: true, data: ... }, extract the data
    if (response.data && response.data.success !== undefined) {
      if (response.data.data !== undefined) {
        return response.data.data;
      }
      return response.data; // Return the whole response if no data field
    }
    return response.data; // Fallback for old endpoints if any missed
  },
  (error) => {
    if (error.response && error.response.data && error.response.data.success === false) {
      // It's a structured error, propagate the message
      return Promise.reject({
        response: error.response,
        message: error.response.data.message || error.message
      });
    }
    return Promise.reject(error);
  }
);
export default api;
