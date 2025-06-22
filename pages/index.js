import { useRef, useState } from 'react';
import Head from 'next/head';
import { ethers } from 'ethers';
import contractABI from '../contracts/abi.json';
import Web3Modal from 'web3modal';
import WalletConnectProvider from '@walletconnect/web3-provider';

function getInjectedWallets() {
  const wallets = [];
  if (typeof window !== 'undefined' && window.ethereum) {
    if (window.ethereum.providers) {
      // Multiple providers detected
      window.ethereum.providers.forEach((provider) => {
        if (provider.isMetaMask) wallets.push({ name: 'MetaMask', provider });
        if (provider.isPhantom) wallets.push({ name: 'Phantom', provider });
        if (provider.isCoinbaseWallet) wallets.push({ name: 'Coinbase Wallet', provider });
        // Add more wallet detections as needed
      });
    } else {
      // Single provider
      if (window.ethereum.isMetaMask) wallets.push({ name: 'MetaMask', provider: window.ethereum });
      if (window.ethereum.isPhantom) wallets.push({ name: 'Phantom', provider: window.ethereum });
      if (window.ethereum.isCoinbaseWallet) wallets.push({ name: 'Coinbase Wallet', provider: window.ethereum });
    }
  }
  return wallets;
}

export default function Home() {
  // State
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [balance, setBalance] = useState('');
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isMinting, setIsMinting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [ipfsHash, setIpfsHash] = useState('');
  const [form, setForm] = useState({
    name: '',
    description: '',
    attr1Name: '',
    attr1Value: '',
  });
  const [showWalletSelect, setShowWalletSelect] = useState(false);
  const [availableWallets, setAvailableWallets] = useState([]);
  const imageInputRef = useRef();

  // Handlers
  const handleConnect = () => {
    const wallets = getInjectedWallets();
    if (wallets.length === 0) {
      alert('No EVM wallet found. Please install MetaMask or another wallet.');
      return;
    }
    if (wallets.length === 1) {
      connectToWallet(wallets[0].provider);
    } else {
      setAvailableWallets(wallets);
      setShowWalletSelect(true);
    }
  };

  const connectToWallet = async (providerObj) => {
    try {
      const provider = new ethers.providers.Web3Provider(providerObj);
      await provider.send('eth_requestAccounts', []);
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      setWalletAddress(address);
      setIsConnected(true);
      setSelectedProvider(providerObj);
      const bal = await provider.getBalance(address);
      setBalance(Number(ethers.utils.formatEther(bal)).toFixed(4));
      setShowWalletSelect(false);
    } catch (err) {
      alert('Failed to connect wallet: ' + (err.message || err));
    }
  };

  const handleImageUpload = (file) => {
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (isMinting) return;
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      handleImageUpload(files[0]);
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleInputChange = (e) => {
    setForm({ ...form, [e.target.id]: e.target.value });
  };

  const validateForm = () => {
    return form.name.trim() && form.description.trim() && selectedImage;
  };

  // Mint NFT with real backend and blockchain interaction
  const handleMint = async (e) => {
    e.preventDefault();
    if (!validateForm() || isMinting) return;
    if (!isConnected || !walletAddress) {
      alert('Please connect your wallet first.');
      return;
    }
    setIsMinting(true);
    setSuccess(false);
    setTxHash('');
    setIpfsHash('');
    try {
      // 1. Upload image to Pinata
      const imageFormData = new FormData();
      imageFormData.append('file', selectedImage);
      const imageRes = await fetch('/api/pinata-upload', {
        method: 'POST',
        body: imageFormData,
      });
      if (!imageRes.ok) throw new Error('Failed to upload image to Pinata');
      const imageData = await imageRes.json();
      const imageCID = imageData.IpfsHash;
      const imageUrl = `ipfs://${imageCID}`;
      setIpfsHash(imageCID);

      // 2. Upload metadata to Pinata
      const metadata = {
        name: form.name,
        description: form.description,
        image: imageUrl,
        attributes: form.attr1Name && form.attr1Value ? [
          { trait_type: form.attr1Name, value: form.attr1Value }
        ] : [],
      };
      const metaRes = await fetch('/api/pinata-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata),
      });
      if (!metaRes.ok) throw new Error('Failed to upload metadata to Pinata');
      const metaData = await metaRes.json();
      const metaCID = metaData.IpfsHash;
      const tokenURI = `ipfs://${metaCID}`;
      setIpfsHash(metaCID);

      // 3. Mint NFT on blockchain using the selected provider
      if (!selectedProvider) throw new Error('No wallet provider selected.');
      const provider = new ethers.providers.Web3Provider(selectedProvider);
      const signer = provider.getSigner();
      const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
      const contract = new ethers.Contract(contractAddress, contractABI, signer);
      const tx = await contract.mint(walletAddress, tokenURI);
      setTxHash(tx.hash);
      await tx.wait();
      setSuccess(true);
      // Reset form
      setForm({ name: '', description: '', attr1Name: '', attr1Value: '' });
      setSelectedImage(null);
      setImagePreview(null);
      if (imageInputRef.current) imageInputRef.current.value = '';
      // Confetti
      createConfetti();
    } catch (error) {
      alert('Minting failed: ' + (error.reason || error.message));
    } finally {
      setIsMinting(false);
    }
  };

  // Confetti effect
  const createConfetti = () => {
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd'];
    for (let i = 0; i < 50; i++) {
      setTimeout(() => {
        const confetti = document.createElement('div');
        confetti.style.position = 'fixed';
        confetti.style.top = '-10px';
        confetti.style.left = Math.random() * window.innerWidth + 'px';
        confetti.style.width = '10px';
        confetti.style.height = '10px';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.borderRadius = '50%';
        confetti.style.pointerEvents = 'none';
        confetti.style.zIndex = '9999';
        confetti.style.animation = 'fall 3s linear forwards';
        document.body.appendChild(confetti);
        setTimeout(() => {
          confetti.remove();
        }, 3000);
      }, i * 100);
    }
    // Add falling animation for confetti
    if (!document.getElementById('fall-keyframes')) {
      const style = document.createElement('style');
      style.id = 'fall-keyframes';
      style.textContent = `@keyframes fall {0% {transform: translateY(-100vh) rotate(0deg);opacity: 1;}100% {transform: translateY(100vh) rotate(360deg);opacity: 0;}}`;
      document.head.appendChild(style);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <Head>
        <title>NFT Minting DApp</title>
        <meta name="description" content="Mint your own NFTs on Sepolia!" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </Head>
      <div className="container mx-auto px-4 py-8">
        {/* Wallet Selection Modal */}
        {showWalletSelect && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-8 max-w-xs w-full text-center">
              <h2 className="text-xl font-bold mb-4">Select a Wallet</h2>
              <div className="space-y-4">
                {availableWallets.map((w, i) => (
                  <button
                    key={w.name + i}
                    className="w-full py-3 px-4 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold hover:from-purple-700 hover:to-blue-700 transition-all"
                    onClick={() => connectToWallet(w.provider)}
                  >
                    {w.name}
                  </button>
                ))}
              </div>
              <button
                className="mt-6 text-gray-500 hover:text-gray-700 text-sm"
                onClick={() => setShowWalletSelect(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            🎨 NFT Minter
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Upload your artwork, store it on IPFS, and mint your NFTs on the Ethereum Sepolia testnet
          </p>
        </div>
        {/* Main Content */}
        <div className="max-w-2xl mx-auto">
          {/* Wallet Connection */}
          {!isConnected && (
            <div className="text-center mb-8" id="connectSection">
              <button
                id="connectBtn"
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-4 px-8 rounded-xl text-lg transition-all duration-300 hover-scale"
                onClick={handleConnect}
                disabled={isConnected}
              >
                {isConnected ? (
                  <span className="flex items-center justify-center">
                    <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white inline-block mr-2"></span>
                    Connecting...
                  </span>
                ) : (
                  <span>🦊 Connect Wallet</span>
                )}
              </button>
              <p className="text-gray-400 mt-4 text-sm">
                This is a demo - wallet connection is simulated
              </p>
            </div>
          )}
          {/* Connected State */}
          {isConnected && (
            <div id="connectedSection">
              {/* Wallet Status */}
              <div className="glass-effect rounded-2xl p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-green-400 font-semibold flex items-center">
                      <span className="w-3 h-3 bg-green-400 rounded-full mr-2 pulse"></span>
                      Connected: <span id="walletAddress">{walletAddress}</span>
                    </p>
                    <p className="text-gray-400 text-sm">Sepolia Testnet</p>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-semibold">Balance</p>
                    <p className="text-gray-400 text-sm">{balance} ETH</p>
                  </div>
                </div>
              </div>
              {/* Success Message */}
              {success && (
                <div className="mb-6 p-6 bg-green-500/20 border border-green-500/50 rounded-xl success-glow">
                  <h3 className="text-green-400 font-bold text-lg mb-2 flex items-center">
                    🎉 NFT Minted Successfully!
                  </h3>
                  <p className="text-white mb-2">Your NFT has been minted and stored on IPFS!</p>
                  <div className="space-y-2">
                    <div>
                      <p className="text-gray-300 text-sm">Transaction Hash:</p>
                      <a
                        href={`https://sepolia.etherscan.io/tx/${txHash}`}
                        className="text-blue-400 hover:text-blue-300 underline break-all text-sm"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {txHash}
                      </a>
                    </div>
                    <div>
                      <p className="text-gray-300 text-sm">IPFS Metadata:</p>
                      <a
                        href={`https://gateway.pinata.cloud/ipfs/${ipfsHash}`}
                        className="text-purple-400 hover:text-purple-300 underline break-all text-sm"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {`https://gateway.pinata.cloud/ipfs/${ipfsHash}`}
                      </a>
                    </div>
                  </div>
                </div>
              )}
              {/* Minting Form */}
              <div className="glass-effect rounded-2xl p-8 border border-white/20">
                <form className="space-y-6" onSubmit={handleMint}>
                  {/* NFT Name */}
                  <div>
                    <label className="block text-white font-semibold mb-2">NFT Name *</label>
                    <input
                      type="text"
                      id="name"
                      placeholder="Enter your NFT name..."
                      className="w-full p-3 rounded-xl bg-white/10 border border-white/30 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                      value={form.name}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  {/* Description */}
                  <div>
                    <label className="block text-white font-semibold mb-2">Description *</label>
                    <textarea
                      id="description"
                      placeholder="Describe your amazing NFT artwork..."
                      rows={4}
                      className="w-full p-3 rounded-xl bg-white/10 border border-white/30 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none transition-all"
                      value={form.description}
                      onChange={handleInputChange}
                      required
                    ></textarea>
                  </div>
                  {/* Image Upload */}
                  <div>
                    <label className="block text-white font-semibold mb-2">Upload Artwork *</label>
                    <div
                      className="file-drop-zone rounded-xl p-8 text-center cursor-pointer transition-all"
                      onClick={() => !isMinting && imageInputRef.current && imageInputRef.current.click()}
                      onDrop={handleDrop}
                      onDragOver={e => e.preventDefault()}
                      onDragLeave={e => e.preventDefault()}
                    >
                      {!imagePreview ? (
                        <div id="uploadPrompt">
                          <div className="text-6xl mb-4 animate-bounce">📸</div>
                          <p className="text-white text-lg mb-2">Click to upload your artwork</p>
                          <p className="text-gray-400 text-sm">PNG, JPG, JPEG up to 10MB</p>
                        </div>
                      ) : (
                        <div id="imagePreview">
                          <img src={imagePreview} className="max-w-full max-h-64 mx-auto rounded-lg mb-4" alt="Preview" />
                          <button type="button" onClick={handleRemoveImage} className="text-red-400 hover:text-red-300 text-sm">
                            Remove Image
                          </button>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        ref={imageInputRef}
                        onChange={e => {
                          if (e.target.files.length > 0) handleImageUpload(e.target.files[0]);
                        }}
                      />
                    </div>
                  </div>
                  {/* Attributes (Optional) */}
                  <div>
                    <label className="block text-white font-semibold mb-2">Attributes (Optional)</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <input
                        type="text"
                        id="attr1Name"
                        placeholder="Trait name (e.g., Color)"
                        className="p-3 rounded-xl bg-white/10 border border-white/30 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        value={form.attr1Name}
                        onChange={handleInputChange}
                      />
                      <input
                        type="text"
                        id="attr1Value"
                        placeholder="Trait value (e.g., Blue)"
                        className="p-3 rounded-xl bg-white/10 border border-white/30 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        value={form.attr1Value}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>
                  {/* Mint Button */}
                  <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 px-6 rounded-xl text-lg transition-all duration-300 hover-scale disabled:scale-100 disabled:cursor-not-allowed"
                    disabled={!validateForm() || isMinting}
                  >
                    {!isMinting ? (
                      <span>🚀 Mint NFT on Sepolia</span>
                    ) : (
                      <span className="flex items-center justify-center space-x-2">
                        <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span>
                        <span>Minting NFT...</span>
                      </span>
                    )}
                  </button>
                  {/* Cost Info */}
                  <div className="text-center text-gray-400 text-sm">
                    <p>Estimated gas fee: ~0.002 ETH</p>
                    <p>IPFS storage: Free with Pinata</p>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
        {/* Footer */}
        <div className="mt-12 text-center text-gray-400">
          <p className="mb-2">⚡ Powered by Ethereum Sepolia Testnet & IPFS</p>
          <p className="text-sm">
            Need test ETH? Visit
            <a href="https://sepoliafaucet.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
              Sepolia Faucet
            </a>
          </p>
          <div className="flex justify-center space-x-6 mt-4 text-xs">
            <a href="#" className="hover:text-white transition-colors">📋 Smart Contract</a>
            <a href="#" className="hover:text-white transition-colors">🔍 View on Etherscan</a>
            <a href="#" className="hover:text-white transition-colors">📁 IPFS Gateway</a>
          </div>
        </div>
      </div>
    </div>
  );
} 