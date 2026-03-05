'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { RicardianUploader } from '../components/RicardianUploader';
import { useState } from 'react';

export default function Home() {
  const [documentHash, setDocumentHash] = useState<string>('');

  // This function captures the hash from our uploader component
  const handleHashGenerated = (hash: string) => {
    setDocumentHash(hash);
};

  return (
    <main className="flex min-h-screen flex-col items-center py-20 px-4 bg-slate-100">
      <div className="bg-white p-10 rounded-xl shadow-lg text-center max-w-3xl w-full border border-slate-200">
        <h1 className="text-3xl font-bold mb-3 text-slate-800">
          Legal Escrow Dashboard
        </h1>
        <p className="text-slate-500 mb-8">
          Secure, automated, and CPRA-compliant settlement architecture.
        </p>
        
        <div className="flex justify-center mb-8">
          <ConnectButton />
        </div>

        <hr className="border-slate-100" />

        {/* The Ricardian Engine Component */}
        <RicardianUploader onHashGenerated={handleHashGenerated} />
        
      </div>
    </main>
  );
}