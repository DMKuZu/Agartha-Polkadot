'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import CryptoJS from 'crypto-js';

export interface RicardianFormData {
  title: string;
  deliverables: string;
  deadline: string;
  amount: string;
  clientAddress: string;
  freelancerAddress: string;
}

interface Props {
  onGenerated: (data: { documentHash: string; formData: RicardianFormData }) => void;
}

export function buildDocument(f: RicardianFormData): string {
  return [
    'PHILIPPINE FREELANCE SERVICE AGREEMENT',
    '',
    `Date: ${f.deadline || '[deadline not set]'}`,
    '',
    'PARTIES',
    `  Client:     ${f.clientAddress || '[client address]'}`,
    `  Freelancer: ${f.freelancerAddress || '[freelancer address]'}`,
    '',
    'PROJECT',
    `  Title: ${f.title || '[project title]'}`,
    '',
    'DELIVERABLES',
    `  ${f.deliverables || '[deliverables not specified]'}`,
    '',
    'PAYMENT',
    `  Amount: ${f.amount || '0'} PAS`,
    `  Escrow: Funds held in a blockchain-enforced smart contract. Payment released`,
    `  upon 2-of-3 approval by Client, Freelancer, and Arbiter.`,
    '',
    'LEGAL FRAMEWORK',
    `  This Agreement is governed by the laws of the Republic of the Philippines,`,
    `  including Republic Act No. 11032 (Ease of Doing Business and Efficient Government`,
    `  Service Delivery Act) and applicable provisions of the Civil Code.`,
    '',
    'DISPUTE RESOLUTION',
    `  In the event of a dispute, the Arbiter shall review the terms of this Agreement`,
    `  and cast a deciding vote. The Arbiter's decision shall be binding on both parties.`,
    '',
    'SIGNATURES',
    `  Client signature is evidenced by wallet ${f.clientAddress || '[client address]'}.`,
    `  Freelancer signature is evidenced by wallet ${f.freelancerAddress || '[freelancer address]'}.`,
  ].join('\n');
}

export function RicardianGenerator({ onGenerated }: Props) {
  const { address } = useAccount();
  const [form, setForm] = useState<RicardianFormData>({
    title: '',
    deliverables: '',
    deadline: '',
    amount: '',
    clientAddress: '',
    freelancerAddress: '',
  });
  const [preview, setPreview] = useState('');
  const [documentHash, setDocumentHash] = useState('');

  // Auto-fill client address from connected wallet
  useEffect(() => {
    if (address && !form.clientAddress) {
      setForm(prev => ({ ...prev, clientAddress: address }));
    }
  }, [address]);

  const update = (key: keyof RicardianFormData, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const generate = () => {
    const doc = buildDocument(form);
    const hash = '0x' + CryptoJS.SHA256(CryptoJS.enc.Utf8.parse(doc)).toString();
    setPreview(doc);
    setDocumentHash(hash);
    onGenerated({ documentHash: hash, formData: form });
  };

  const isReady =
    form.title &&
    form.deliverables &&
    form.deadline &&
    form.amount &&
    form.clientAddress &&
    form.freelancerAddress;

  return (
    <div className="p-6 bg-slate-50 rounded-lg border border-slate-200">
      <h2 className="text-xl font-semibold mb-1 text-slate-700">1. Create Freelance Agreement</h2>
      <p className="text-sm text-slate-500 mb-5">
        Fill in the project details. A Philippine Freelance Service Agreement will be generated and hashed.
      </p>

      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Project Title</label>
          <input
            type="text"
            placeholder="e.g. Landing page design for TechStartup PH"
            className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black text-sm"
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Deliverables</label>
          <textarea
            rows={3}
            placeholder="Describe the work to be delivered..."
            className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black text-sm resize-y"
            value={form.deliverables}
            onChange={(e) => update('deliverables', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Deadline</label>
            <input
              type="date"
              className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black text-sm"
              min={new Date().toISOString().split('T')[0]}
              value={form.deadline}
              onChange={(e) => update('deadline', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Payment Amount (PAS)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 2.5"
              className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black text-sm"
              value={form.amount}
              onChange={(e) => update('amount', e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Client Wallet Address
            {address && <span className="ml-2 text-xs text-green-600 font-normal">(auto-filled from connected wallet)</span>}
          </label>
          <input
            type="text"
            placeholder="0x..."
            className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black font-mono text-sm"
            value={form.clientAddress}
            onChange={(e) => update('clientAddress', e.target.value.trim())}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Freelancer Wallet Address</label>
          <input
            type="text"
            placeholder="0x..."
            className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black font-mono text-sm"
            value={form.freelancerAddress}
            onChange={(e) => update('freelancerAddress', e.target.value.trim())}
          />
        </div>

        <button
          onClick={generate}
          disabled={!isReady}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-md transition-colors disabled:bg-slate-400"
        >
          Generate Agreement
        </button>
      </div>

      {/* Document preview */}
      {preview && (
        <div className="mt-6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Generated Agreement</p>
          <pre className="bg-white border border-slate-200 rounded-md p-4 text-xs text-slate-700 whitespace-pre-wrap font-mono overflow-auto max-h-64">
            {preview}
          </pre>
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-xs text-green-600 font-semibold mb-1">Document Hash (SHA256)</p>
            <p className="text-xs font-mono text-green-800 break-all">{documentHash}</p>
          </div>
        </div>
      )}
    </div>
  );
}
