import axios from "axios";
import { getToken, isTokenExpired, refreshAccessToken, clearTokens } from "./auth";

const PLATFORM_INSTITUTE_ID =
  import.meta.env.VITE_PLATFORM_INSTITUTE_ID || "00000000-0000-0000-0000-000000000001";

const api = axios.create({
  timeout: 30000,
});

api.interceptors.request.use(async (config) => {
  let token = getToken("accessToken");

  if (token && isTokenExpired(token)) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      token = newToken;
    } else {
      clearTokens();
      window.location.href = "/login";
      return Promise.reject(new Error("Session expired"));
    }
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    config.headers["clientId"] = PLATFORM_INSTITUTE_ID;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const status = error.response.status;
      if (status === 401 || status === 511) {
        clearTokens();
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
