import { useContext } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthContext, AuthProvider } from "context/AuthContext";
import { MeetingsPage, MeetingRoom, PublicMeetingRoom } from "features/meetings";
import AuthPage from "features/auth/AuthPage";
import HomePage from "features/home/HomePage";

function RequireAuth({ children }) {
  const location = useLocation();
  const { isAuthenticated, isBootstrapping } = useContext(AuthContext);

  if (isBootstrapping) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/" element={<HomePage />} />
        <Route path="/meetings" element={<RequireAuth><MeetingsPage /></RequireAuth>} />
        <Route path="/meetings/:meetingId/room" element={<RequireAuth><MeetingRoom /></RequireAuth>} />
        <Route path="/join/:meetingCode" element={<PublicMeetingRoom />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </AuthProvider>
  );
}
