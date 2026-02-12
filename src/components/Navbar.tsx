'use client';

import { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="bg-white dark:bg-gray-900 dark:text-white fixed top-0 left-0 right-0 w-full z-50 shadow-md shadow-gray/10 dark:shadow-white/10">
      <div className="flex justify-between items-center h-14 px-4">
        <div className="text-2xl font-bold group navbar hover:text-red-500">
          <Link href="/">Token<span className='text-red-500 dark:group-hover:text-white group-hover:text-black transition '>Buster</span></Link>
        </div>
      </div>
    </nav>
  );
}
