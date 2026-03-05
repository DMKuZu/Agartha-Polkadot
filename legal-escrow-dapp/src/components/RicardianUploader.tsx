'use client';

import { useState } from 'react';
import CryptoJS from 'crypto-js';

export function RicardianUploader({ onHashGenerated }: { onHashGenerated: (hash: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState<string>('');
  const [isHashing, setIsHashing] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setIsHashing(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      const arrayBuffer = event.target?.result as ArrayBuffer;
      
      // Convert ArrayBuffer to WordArray for crypto-js
      const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer as any);
      const hash = CryptoJS.SHA256(wordArray).toString(CryptoJS.enc.Hex);

      // Add the "0x" prefix standard for blockchain hex strings
      const formattedHash = `0x${hash}`;
      
      setFileHash(formattedHash);
      onHashGenerated(formattedHash);
      setIsHashing(false);
    };
    
    reader.readAsArrayBuffer(uploadedFile);
  };

  return (
    <div className="mt-8 p-6 bg-slate-50 rounded-lg border border-slate-200 text-left">
      <h2 className="text-xl font-semibold mb-2 text-slate-700">1. Upload Legal Document</h2>
      <p className="text-sm text-slate-500 mb-6">
        Upload the PDF settlement agreement. We generate a cryptographic hash locally to embed into the smart contract, permanently linking the prose to the code.
      </p>
      
      <input 
        type="file" 
        accept=".pdf" 
        onChange={handleFileUpload}
        className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 transition-colors cursor-pointer"
      />

      {isHashing && <p className="mt-4 text-amber-600 text-sm font-medium">Generating cryptographic fingerprint...</p>}

      {fileHash && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
          <p className="text-sm font-semibold text-green-800 mb-1">Ricardian Hash Generated Successfully:</p>
          <p className="text-xs font-mono text-green-900 break-all">{fileHash}</p>
        </div>
      )}
    </div>
  );
}