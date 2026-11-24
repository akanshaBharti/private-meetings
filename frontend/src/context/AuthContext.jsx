import { createContext, useEffect, useMemo, useState } from "react";
import apiClient from "utilities/apiClient";
import { API_ENDPOINTS } from "utilities/api";

export const AuthContext = createContext({
  user: null,
  isAuthenticated: false,
  isBootstrapping: true,
  hasResolvedSession: false,
  login: async () => {},
  signup: async () => {},
  loginUser: () => {},
  logoutUser: async () => {},
  setUser: () => {},
});

const storedUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(storedUser);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      setUserState(null);
      setIsBootstrapping(false);
      return;
    }

    apiClient
      .get(API_ENDPOINTS.AUTH.GET_SESSION)
      .then((response) => {
        const nextUser = response.data?.user || null;
        setUserState(nextUser);
        if (nextUser) localStorage.setItem("user", JSON.stringify(nextUser));
      })
      .catch(() => {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("user");
        setUserState(null);
      })
      .finally(() => setIsBootstrapping(false));
  }, []);

  const saveSession = (payload) => {
    const nextUser = payload?.user || null;
    if (payload?.token) localStorage.setItem("auth_token", payload.token);
    if (nextUser) localStorage.setItem("user", JSON.stringify(nextUser));
    setUserState(nextUser);
    return nextUser;
  };

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user && localStorage.getItem("auth_token")),
      isBootstrapping,
      hasResolvedSession: !isBootstrapping,
      login: async (credentials) => {
        const response = await apiClient.post(API_ENDPOINTS.AUTH.LOGIN, credentials);
        return saveSession(response.data);
      },
      signup: async (credentials) => {
        const response = await apiClient.post(API_ENDPOINTS.AUTH.SIGNUP, credentials);
        return saveSession(response.data);
      },
      loginUser: saveSession,
      setUser: (nextUser) => {
        setUserState(nextUser || null);
        if (nextUser) localStorage.setItem("user", JSON.stringify(nextUser));
        else localStorage.removeItem("user");
      },
      logoutUser: async () => {
        try {
          if (localStorage.getItem("auth_token")) {
            await apiClient.post(API_ENDPOINTS.AUTH.LOGOUT);
          }
        } finally {
          localStorage.removeItem("auth_token");
          localStorage.removeItem("user");
          setUserState(null);
        }
      },
    }),
    [user, isBootstrapping],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
