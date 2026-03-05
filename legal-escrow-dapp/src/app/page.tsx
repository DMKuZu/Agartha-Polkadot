import { ConnectButton } from '@rainbow-me/rainbowkit';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-slate-50">
      <div className="bg-white p-10 rounded-xl shadow-lg text-center max-w-2xl">
        <h1 className="text-4xl font-bold mb-4 text-slate-800">
          Legal Escrow Dashboard
        </h1>
        <p className="text-slate-600 mb-8">
          Secure, automated, and CPRA-compliant settlement architecture.
        </p>
        
        {/* This is the magic button from RainbowKit */}
        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    </main>
  );
}