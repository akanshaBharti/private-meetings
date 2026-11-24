import { useContext, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { IconCheck, IconLock, IconVideo } from "@tabler/icons-react";
import { AuthContext } from "context/AuthContext";

function getFormError(error) {
  const responseData = error?.response?.data;
  if (typeof responseData === "string") return responseData;
  if (responseData?.detail) return responseData.detail;
  if (responseData && typeof responseData === "object") {
    const firstError = Object.values(responseData).flat()[0];
    if (firstError) return String(firstError);
  }
  return error?.message || "Please check your details and try again.";
}

export default function AuthPage({ mode = "login" }) {
  const isSignup = mode === "signup";
  const navigate = useNavigate();
  const location = useLocation();
  const { login, signup } = useContext(AuthContext);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const from = location.state?.from?.pathname || "/meetings";

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await (isSignup ? signup(form) : login({ email: form.email, password: form.password }));
      navigate(from, { replace: true });
    } catch (requestError) {
      setError(getFormError(requestError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#fff9fc] px-4 py-5 text-[#321b4d] sm:px-6 lg:px-8"><header className="mx-auto flex max-w-6xl items-center justify-between"><Link to="/" className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#321b4d] text-[#f7d8e7]"><IconVideo size={21} /></span><span className="font-semibold tracking-[-0.03em]">Private Meetings</span></Link><div className="flex items-center gap-4"><Link to="/" className="hidden text-sm font-semibold text-[#775e7f] hover:text-[#321b4d] sm:inline">Back to home</Link>{isSignup ? <Link to="/login" className="button secondary">Log in</Link> : <Link to="/signup" className="button primary button-shimmer">Sign up</Link>}</div></header><section className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-12 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-24"><div className="relative hidden min-h-[560px] overflow-hidden rounded-[2rem] bg-[#f4e5f5] p-8 lg:flex lg:flex-col lg:justify-between"><div className="absolute right-[-12%] top-[-10%] h-80 w-80 rounded-full bg-[#ffd6e6]/80 blur-3xl ambient-drift" /><div className="absolute bottom-[-12%] left-[-10%] h-80 w-80 rounded-full bg-[#e2d2ff]/80 blur-3xl ambient-drift" /><div className="relative"><p className="text-sm font-bold uppercase tracking-[0.18em] text-[#a1588b]">{isSignup ? "A calmer way to meet" : "Welcome back"}</p><h1 className="mt-5 max-w-lg text-5xl font-semibold leading-[1.02] tracking-[-0.06em]">{isSignup ? "Make space for better conversations." : "Your next important conversation starts here."}</h1><p className="mt-6 max-w-md text-lg leading-8 text-[#775e7f]">{isSignup ? "Create your private workspace and keep every meeting easy to start, simple to join, and clear to revisit." : "Log in to see what is scheduled, start a room, and keep your day moving with less friction."}</p></div><div className="relative grid gap-3 text-sm text-[#60486d]"><div className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/60 px-4 py-3 backdrop-blur"><IconCheck size={17} className="text-[#bc618f]" /> A focused room for every conversation</div><div className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/60 px-4 py-3 backdrop-blur"><IconCheck size={17} className="text-[#bc618f]" /> Scheduled and past meetings in one view</div><div className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/60 px-4 py-3 backdrop-blur"><IconLock size={17} className="text-[#8561ad]" /> Private by design</div></div></div><div className="mx-auto w-full max-w-md rounded-[1.75rem] border border-[#ead7e3] bg-white p-7 shadow-[0_24px_70px_rgba(78,40,108,0.1)] sm:p-10 motion-rise"><div className="mb-8"><p className="text-sm font-bold uppercase tracking-[0.18em] text-[#a1588b]">Private Meetings</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">{isSignup ? "Create your account" : "Welcome back"}</h2><p className="mt-3 text-sm leading-6 text-[#8a718a]">{isSignup ? "Create an account to start and manage your meetings." : "Log in to create and join your private meetings."}</p></div>{error && <div className="mb-5 rounded-xl border border-[#efc7d2] bg-[#fff2f5] px-3 py-3 text-sm text-[#a23e59]">{error}</div>}<form className="space-y-4" onSubmit={submit}>{isSignup && <label className="block text-sm font-medium text-[#60486d]">Name<input name="name" value={form.name} onChange={updateField} autoComplete="name" required className="field" /></label>}<label className="block text-sm font-medium text-[#60486d]">Email<input name="email" type="email" value={form.email} onChange={updateField} autoComplete="email" required className="field" /></label><label className="block text-sm font-medium text-[#60486d]">Password<input name="password" type="password" value={form.password} onChange={updateField} autoComplete={isSignup ? "new-password" : "current-password"} minLength={isSignup ? 8 : undefined} required className="field" /></label>{isSignup && <p className="text-xs text-[#9b8299]">Use at least 8 characters.</p>}<button type="submit" disabled={isSubmitting} className="button primary button-shimmer w-full rounded-xl py-3.5">{isSubmitting ? "Please wait…" : isSignup ? "Create account" : "Log in"}</button></form><p className="mt-6 text-center text-sm text-[#8a718a]">{isSignup ? "Already have an account?" : "New to Private Meetings?"}{" "}<Link to={isSignup ? "/login" : "/signup"} state={{ from: location.state?.from }} className="font-semibold text-[#92527d] hover:text-[#321b4d]">{isSignup ? "Log in" : "Create an account"}</Link></p></div></section></main>
  );
}
