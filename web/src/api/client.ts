import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

client.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    const message = error.response?.data?.error || error.message || 'Unknown error occurred';
    return Promise.reject(new Error(message));
  }
);

export default client;
