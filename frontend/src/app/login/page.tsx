"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import { ApiError, login } from "@/lib/api";
import { useDashboardStore } from "@/store/dashboard-store";

function getLoginError(error: unknown): string {
  if (error instanceof ApiError) return `${error.message} (HTTP ${error.status})`;
  if (error instanceof Error) return error.message;
  return "Invalid credentials provided.";
}

function FlowingPattern() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = canvas.width = canvas.offsetWidth;
    let h = canvas.height = canvas.offsetHeight;

    interface Pill {
      x: number;
      y: number;
      width: number;
      length: number;
      speed: number;
      isWhite: boolean;
    }

    let pills: Pill[] = [];
    const colWidth = 32;

    const initPills = () => {
      pills = [];
      const columns = Math.ceil(w / colWidth);
      for (let c = 0; c < columns; c++) {
        const numPills = 4 + Math.random() * 6; // 4 to 10 pills per column
        for (let i = 0; i < numPills; i++) {
          pills.push({
            x: c * colWidth + colWidth / 2,
            y: Math.random() * h * 2 - h,
            width: colWidth * 0.65, // ~20px
            length: 40 + Math.random() * 160,
            speed: 0.5 + Math.random() * 0.9,
            isWhite: Math.random() > 0.45 // Instead of white, this will trigger different shades of theme color
          });
        }
      }
    };
    initPills();

    let animationId: number;

    const render = () => {
      // background
      ctx.fillStyle = "#1a1a2e"; // Dark indigo background
      ctx.fillRect(0, 0, w, h);

      pills.forEach(p => {
        p.y += p.speed;
        if (p.y > h + 150) {
          p.y = -p.length - Math.random() * 100;
        }

        ctx.beginPath();
        ctx.lineCap = "round";
        ctx.lineWidth = p.width;
        ctx.strokeStyle = p.isWhite ? "#b39ddb" : "#6c5ce7"; // Purple pill shades
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y + p.length);
        ctx.stroke();
      });

      animationId = requestAnimationFrame(render);
    };
    render();

    const handleResize = () => {
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
      initPills();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}

export default function LoginPage() {
  const router = useRouter();
  const setCredentials = useDashboardStore((state) => state.setCredentials);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("auth_token");
    if (token) router.replace("/dashboard");
  }, [router]);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const response = await login(username, password);
      setCredentials(response.access_token, response.role, username);
      router.push("/dashboard");
    } catch (loginError: unknown) {
      setError(getLoginError(loginError));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden font-sans">

      {/* ── Full-screen animated background ── */}
      <FlowingPattern />

      {/* ── Centered form card ── */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-[420px] rounded-[2rem] border border-white/10 bg-[#12122a]/80 px-8 py-10 shadow-2xl backdrop-blur-xl"
        >
          {/* Logo */}
          <div className="mb-6 text-white">
            <svg width="36" height="36" viewBox="0 0 40 40" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 4L4 12V28L20 36L36 28V12L20 4ZM20 18L10 13L20 8L30 13L20 18Z" />
              <path d="M20 32L10 27V17L20 22L30 17V27L20 32Z" />
            </svg>
          </div>

          {/* Back Button */}
          <button
            onClick={() => router.push("/")}
            className="mb-6 flex items-center gap-2 text-sm font-semibold text-white/80 hover:text-white transition-colors w-fit"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </button>

          {/* Headings */}
          <div>
            <h1 className="mb-2 text-2xl font-black tracking-tight text-white">Welcome back</h1>
            <p className="mb-8 text-xs font-semibold text-white/70">
              Sign in to continue to the decision intelligence workspace.
            </p>
          </div>

          {/* Form */}
          <motion.form
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            onSubmit={handleLogin}
            className="space-y-4"
          >
            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[13px] text-red-300 font-medium">
                {error}
              </div>
            )}

            {/* Username */}
            <div>
              <label className="mb-1.5 block text-xs font-bold text-white/90">Username *</label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-white outline-none transition-all placeholder:text-white/45 focus:border-[#7c6ef5] focus:ring-4 focus:ring-[#5e42f5]/20"
                placeholder="Enter your username"
                required
              />
            </div>

            {/* Password */}
            <div>
              <label className="mb-1.5 block text-xs font-bold text-white/90">Password *</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 pr-10 text-sm text-white outline-none transition-all placeholder:text-white/45 focus:border-[#7c6ef5] focus:ring-4 focus:ring-[#5e42f5]/20"
                  placeholder="Enter password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/60 hover:text-[#a29bfe] transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between py-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="h-4 w-4 rounded border-white/20 text-[#5e42f5] focus:ring-[#5e42f5]/30 cursor-pointer" />
                <span className="text-xs font-bold text-white/80">Remember me</span>
              </label>
              <a href="#" className="text-xs font-bold text-[#a29bfe] hover:underline">Forgot your password?</a>
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="mt-4 w-full rounded-xl bg-[#5e42f5] px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#5e42f5]/30 transition-all hover:bg-[#4d35db] hover:shadow-xl hover:shadow-[#5e42f5]/50 active:scale-[0.98] disabled:opacity-70"
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </button>

            {/* Divider */}
            <div className="relative py-4 flex items-center justify-center">
              <div className="absolute inset-x-0 border-t border-white/10" />
              <span className="relative bg-[#12122a] px-4 text-xs font-semibold text-white/60">Alternative sign-in</span>
            </div>

            {/* Google Button */}
            <button
              type="button"
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/90 transition-all hover:bg-white/10 active:scale-[0.98]"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
                <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                  <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/>
                  <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/>
                  <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/>
                  <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/>
                </g>
              </svg>
              Continue with Google
            </button>

            <div className="pt-4 text-center">
              <p className="text-xs font-bold text-white/65">
                Need access? <a href="#" className="text-[#a29bfe] hover:underline">Contact your administrator</a>
              </p>
            </div>
          </motion.form>
        </motion.div>
      </div>

    </div>
  );
}
