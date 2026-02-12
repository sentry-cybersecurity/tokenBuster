'use client';



export default function Footer() {
  return (
    <footer className="dark:bg-dark-500 dark:text-white font-tinos mt-auto border-t border-white/10 shadow-inner shadow-black/10">
      <div className="max-w-screen-xl mx-auto px-4 py-6 flex flex-col md:flex-row justify-between items-center text-sm">
        {/* Left */}
        <div className="mb-4 md:mb-0 text-center md:text-left">
          <span className="block">&copy; {new Date().getFullYear()} TokenBuster. All rights reserved.</span>
        </div>

        {/* Center */}

        {/* Right */}
        <div className="text-center md:text-right dark:text-white/40">
          Made with <span className="text-amber-400">❤</span> by Sentry
        </div>
      </div>
    </footer>
  );
}
