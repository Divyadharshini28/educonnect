import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000',
  headers: {
    'Content-Type': 'application/json'
  }
});

let tokenGetter = () => null;

export function setAuthTokenGetter(getter) {
  tokenGetter = getter;
}

export function clearAuthTokenGetter() {
  tokenGetter = () => null;
}

// Interceptor to inject verified Firebase ID token
api.interceptors.request.use(async (config) => {
  try {
    const token = await tokenGetter();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      delete config.headers.Authorization;
    }
  } catch (err) {
    console.error('Error retrieving auth token for request:', err);
    delete config.headers.Authorization;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default api;
