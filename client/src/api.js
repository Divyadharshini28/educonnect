import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000',
  headers: {
    'Content-Type': 'application/json'
  }
});

let tokenGetter = () => localStorage.getItem('educonnect_token');

export function setAuthTokenGetter(getter) {
  tokenGetter = getter;
}

// Interceptor to inject verified Firebase ID token
api.interceptors.request.use(async (config) => {
  try {
    const token = await tokenGetter();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (err) {
    console.error('Error retrieving auth token for request:', err);
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default api;
