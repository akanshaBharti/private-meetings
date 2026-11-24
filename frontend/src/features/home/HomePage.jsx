import { useContext, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconCalendarEvent,
  IconCheck,
  IconClock,
  IconDots,
  IconHistory,
  IconLock,
  IconMicrophone,
  IconPhoneOff,
  IconPlayerPlay,
  IconSparkles,
  IconUsers,
  IconVideo,
} from "@tabler/icons-react";
import { AuthContext } from "context/AuthContext";

const participants = [
  { name: "Ava", image: "/participants/participant-ava.png" },
  { name: "Noah", image: "/participants/participant-noah.png" },
  { name: "Maya", image: "/participants/participant-maya.png" },
];

const steps = [
  {
    id: "schedule",
    label: "Schedule",
    body: "Choose a date and time, add the details, and create a private meeting in seconds.",
    icon: IconCalendarEvent,
    image: "/participants/participant-maya.png",
  },
  {
    id: "join",
    label: "Join",
    body: "Step into your meeting with a single click and have a focused, private conversation.",
    icon: IconVideo,
    image: "/participants/participant-ava.png",
  },
  {
    id: "revisit",
    label: "Revisit",
    body: "Find past meetings, review what was discussed, and pick up where you left off.",
    icon: IconHistory,
    image: "/participants/participant-noah.png",
  },
];

const demoMeetings = {
  scheduled: [
    ["Team sync", "Tue, Jan 28", "10:00 AM"],
    ["Project check-in", "Wed, Jan 29", "2:00 PM"],
    ["Planning session", "Fri, Jan 31", "11:00 AM"],
  ],
  past: [
    ["Client conversation", "Mon, Jan 20", "4:30 PM"],
    ["Design review", "Thu, Jan 16", "11:00 AM"],
    ["Project kickoff", "Tue, Jan 14", "9:30 AM"],
  ],
};

function BrandMark() {
  return <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#321b4d] text-[#f7d8e7] shadow-lg shadow-[#321b4d]/15"><IconVideo size={21} stroke={1.8} /></span>;
}

function SiteHeader({ isAuthenticated }) {
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between border-b border-[#ead7e3]/70 px-5 py-4 lg:px-8">
      <Link to="/" className="flex items-center gap-3 text-[#321b4d]" aria-label="Private Meetings home"><BrandMark /><span className="font-semibold tracking-[-0.03em]">Private Meetings</span></Link>
      <nav className="hidden items-center gap-8 text-sm font-medium text-[#775e7f] md:flex" aria-label="Primary navigation"><a href="#how-it-works" className="transition hover:text-[#321b4d]">How it works</a><a href="#benefits" className="transition hover:text-[#321b4d]">Benefits</a><a href="#questions" className="transition hover:text-[#321b4d]">Questions</a></nav>
      <div className="flex items-center gap-2 sm:gap-3">{isAuthenticated ? <Link to="/meetings" className="button secondary">Open meetings</Link> : <Link to="/login" className="hidden text-sm font-semibold text-[#644b70] transition hover:text-[#321b4d] sm:inline">Log in</Link>}{!isAuthenticated && <Link to="/signup" className="button primary button-shimmer">Sign up</Link>}</div>
    </header>
  );
}

function MeetingPreview() {
  const [activeTab, setActiveTab] = useState("scheduled");
  return (
    <div className="relative rounded-[2rem] border border-white/80 bg-white/65 p-2 shadow-[0_24px_80px_rgba(78,40,108,0.15)] backdrop-blur-xl motion-rise motion-delay-3">
      <div className="rounded-[1.6rem] border border-[#efddea] bg-white/80 p-4 sm:p-5">
        <div className="flex items-center justify-between border-b border-[#ecdce6] pb-4"><div className="flex items-center gap-2 text-sm font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f0d9e9] text-[#7350b2]"><IconVideo size={15} /></span>Private Meetings <span className="mx-1 text-[#d6bfd0]">/</span><span className="font-normal text-[#876c87]">Team sync</span></div><span className="rounded-full bg-[#f5e7f0] px-2.5 py-1 text-xs font-semibold text-[#94527f]">12:34</span></div>
        <div className="mt-4 grid grid-cols-[1.45fr_0.75fr] gap-2.5">
          <img src={participants[0].image} alt="A participant smiling in the meeting" className="h-52 w-full rounded-2xl object-cover sm:h-64" />
          <div className="grid gap-2.5"><img src={participants[1].image} alt="A participant in the meeting" className="h-full min-h-24 w-full rounded-2xl object-cover" /><img src={participants[2].image} alt="Another participant in the meeting" className="h-full min-h-24 w-full rounded-2xl object-cover" /></div>
        </div>
        <div className="mt-4 flex items-center justify-center gap-2 text-[#684d74]"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f6edf4]"><IconMicrophone size={16} /></span><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f6edf4]"><IconVideo size={16} /></span><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f6edf4]"><IconUsers size={16} /></span><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f6edf4]"><IconDots size={16} /></span><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#d85f83] text-white"><IconPhoneOff size={16} /></span></div>
      </div>
      <div className="mt-3 rounded-[1.4rem] border border-[#ecdce6] bg-white/70 p-3"><div className="relative flex rounded-xl bg-[#f8edf5] p-1"><span className={`absolute bottom-1 top-1 w-[calc(50%-0.25rem)] rounded-lg bg-white shadow-sm transition-transform duration-300 ${activeTab === "past" ? "translate-x-full" : "translate-x-0"}`} />{["scheduled", "past"].map((tab) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`relative z-10 flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${activeTab === tab ? "text-[#321b4d]" : "text-[#997d98]"}`}>{tab === "scheduled" ? "Scheduled Meetings" : "Past Meetings"}</button>)}</div><div className="mt-3 grid gap-2">{demoMeetings[activeTab].map(([title, date, time], index) => <div key={title} className="flex items-center justify-between rounded-xl border border-[#f0e2eb] bg-white/85 px-3.5 py-3 text-sm motion-rise" style={{ animationDelay: `${index * 80}ms` }}><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f4e5ef] text-[#8756a1]"><IconCalendarEvent size={16} /></span><span className="font-semibold text-[#4d3659]">{title}</span></div><span className="hidden text-xs text-[#937a91] sm:inline">{date} · {time}</span><IconDots size={17} className="text-[#b795ad]" /></div>)}</div></div>
    </div>
  );
}

export default function HomePage() {
  const { isAuthenticated } = useContext(AuthContext);
  const [activeStep, setActiveStep] = useState("schedule");
  const selectedStep = steps.find((step) => step.id === activeStep) || steps[0];
  const StepIcon = selectedStep.icon;

  return (
    <main className="min-h-screen overflow-hidden bg-[#fff9fc] text-[#321b4d]">
      <section className="relative"><div className="pointer-events-none absolute left-[-10%] top-[-10%] h-[460px] w-[460px] rounded-full bg-[#eadbff]/70 blur-3xl ambient-drift" /><div className="pointer-events-none absolute right-[-8%] top-[8%] h-[420px] w-[420px] rounded-full bg-[#ffd8e8]/65 blur-3xl ambient-drift" /><SiteHeader isAuthenticated={isAuthenticated} /><div className="relative z-[1] mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-16 lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:px-8 lg:pb-24 lg:pt-20"><div><p className="motion-rise inline-flex items-center gap-2 rounded-full border border-[#e7cde0] bg-white/70 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[#9b5686]"><IconSparkles size={14} /> A simple flow for private meetings</p><h1 className="motion-rise motion-delay-1 mt-6 max-w-xl text-5xl font-semibold leading-[0.98] tracking-[-0.065em] text-[#321b4d] sm:text-6xl lg:text-7xl">Make space for better conversations.</h1><p className="motion-rise motion-delay-2 mt-7 max-w-lg text-lg leading-8 text-[#775e7f]">A calm, private place to schedule and host video meetings — for the conversations that matter.</p><div className="motion-rise motion-delay-3 mt-9 flex flex-wrap items-center gap-3"><Link to={isAuthenticated ? "/meetings" : "/signup"} className="button primary button-shimmer cta-pulse rounded-xl px-5 py-3.5">{isAuthenticated ? "Open your meetings" : "Create your free account"}</Link><a href="#how-it-works" className="button secondary flex items-center gap-2 rounded-xl px-5 py-3.5"><IconPlayerPlay size={16} /> See how it works</a></div><div className="motion-rise motion-delay-4 mt-9 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#8f7690]"><span className="flex items-center gap-2"><IconCheck size={16} className="text-[#c979a3]" /> Invite-only rooms</span><span className="flex items-center gap-2"><IconCheck size={16} className="text-[#c979a3]" /> Schedule ahead</span></div></div><MeetingPreview /></div></section>

      <section id="benefits" className="relative z-[1] mx-auto max-w-6xl border-y border-[#ead7e3] px-5 py-8 lg:px-8"><div className="grid gap-6 md:grid-cols-3 md:gap-0"><div className="flex items-start gap-4 md:border-r md:border-[#ead7e3] md:pr-8"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f3e4f5] text-[#8159ae]"><IconLock size={21} /></span><div><h2 className="font-semibold">Truly private</h2><p className="mt-1 text-sm leading-6 text-[#8a718a]">Meet with confidence in a focused, invite-only space.</p></div></div><div className="flex items-start gap-4 md:px-8 md:border-r md:border-[#ead7e3]"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f9e1ed] text-[#bd5d88]"><IconCalendarEvent size={21} /></span><div><h2 className="font-semibold">Easy scheduling</h2><p className="mt-1 text-sm leading-6 text-[#8a718a]">Set a time, invite your people, and keep everything in one place.</p></div></div><div className="flex items-start gap-4 md:pl-8"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#eee6fb] text-[#7650a7]"><IconVideo size={21} /></span><div><h2 className="font-semibold">High-quality meetings</h2><p className="mt-1 text-sm leading-6 text-[#8a718a]">A simple, reliable video experience for productive conversations.</p></div></div></div></section>

      <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-8 px-5 py-20 lg:px-8 lg:py-28"><div className="mx-auto max-w-3xl text-center"><p className="text-sm font-bold uppercase tracking-[0.2em] text-[#a1588b]">How it works</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">A simple flow for private meetings.</h2><p className="mt-5 text-lg leading-8 text-[#8a718a]">Schedule, join, and revisit your conversations without adding more noise to your day.</p></div><div className="mt-12 grid gap-5 lg:grid-cols-[0.82fr_1.18fr] lg:items-center"><div className="grid gap-3">{steps.map((step, index) => { const Step = step.icon; return <button key={step.id} type="button" onClick={() => setActiveStep(step.id)} className={`group flex items-start gap-4 rounded-2xl border p-5 text-left transition duration-300 ${activeStep === step.id ? "border-[#c979a3] bg-[#fff4fa] shadow-lg shadow-[#b55d8f]/10" : "border-transparent hover:border-[#ead7e3] hover:bg-white"}`}><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${activeStep === step.id ? "bg-[#f2c9dc] text-[#7e3d68]" : "bg-[#f4e9f2] text-[#9a6c96]"}`}>{index + 1}</span><span><span className="flex items-center gap-2 text-lg font-semibold"><Step size={18} className="text-[#b45c8c]" />{step.label}</span><span className="mt-2 block text-sm leading-6 text-[#8a718a]">{step.body}</span></span></button>; })}</div><div className="relative overflow-hidden rounded-[2rem] border border-[#ecd9e5] bg-[#fff7fb] p-3 shadow-[0_24px_80px_rgba(78,40,108,0.1)]"><div className="absolute right-[-15%] top-[-18%] h-64 w-64 rounded-full bg-[#eddcff]/80 blur-3xl" /><div className="relative grid gap-4 rounded-[1.5rem] border border-white/80 bg-white/75 p-4 backdrop-blur sm:grid-cols-[1fr_0.8fr] sm:p-5"><img key={selectedStep.image} src={selectedStep.image} alt="A participant in a private meeting" className="h-64 w-full rounded-2xl object-cover motion-rise sm:h-80" /><div className="flex flex-col justify-between py-2"><div><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f2d8e9] text-[#8b4f86]"><StepIcon size={23} /></span><p className="mt-8 text-sm font-bold uppercase tracking-[0.16em] text-[#ae618f]">Step {steps.findIndex((step) => step.id === activeStep) + 1}</p><h3 className="mt-3 text-3xl font-semibold tracking-[-0.045em]">{selectedStep.label}</h3><p className="mt-4 text-sm leading-7 text-[#8a718a]">{selectedStep.body}</p></div><div className="mt-8 flex items-center gap-2 text-sm font-semibold text-[#7b4a76]"><IconClock size={17} /> Keep the flow moving</div></div></div></div></div></section>

      <section id="questions" className="mx-5 mb-10 overflow-hidden rounded-[2rem] bg-[#f4e5f5] lg:mx-auto lg:max-w-6xl"><div className="relative grid gap-8 px-7 py-12 sm:px-12 lg:grid-cols-[1fr_auto] lg:items-center lg:px-16 lg:py-16"><div className="absolute right-[-5%] top-[-65%] h-80 w-80 rounded-full bg-[#ffd2e5]/70 blur-3xl" /><div className="relative"><p className="text-sm font-bold uppercase tracking-[0.18em] text-[#a1588b]">Make space for better work</p><h2 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-[-0.055em] sm:text-5xl">Your next good conversation is one click away.</h2></div><Link to={isAuthenticated ? "/meetings" : "/signup"} className="button primary button-shimmer relative w-fit rounded-xl px-5 py-3.5">{isAuthenticated ? "Open meetings" : "Join Private Meetings"}</Link></div></section>

      <footer className="mx-auto flex max-w-6xl flex-col gap-3 px-5 pb-10 text-sm text-[#9b8299] sm:flex-row sm:items-center sm:justify-between lg:px-8"><Link to="/" className="font-semibold text-[#65456e]">Private Meetings</Link><span>Focused rooms for important conversations.</span></footer>
    </main>
  );
}
