import { useState, useRef } from 'react';
import Head from 'next/head';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useBalance, useWriteContract } from 'wagmi';
import contractABI from '../contracts/abi.json';

export default function Home() {
  const { address, isConnected } = useAccount();
  const { data: balance } = useBalance({ address });
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', attr1Name: '', attr1Value: '' });
  const [isMinting, setIsMinting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [ipfsHash, setIpfsHash] = useState('');
  const imageInputRef = useRef();

  // Wagmi contract write hook
  const { writeContract, isPending, isSuccess, data: txData, error } = useWriteContract();

  // Image upload and form handlers
  const handleImageUpload = (file) => {
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target.result);
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

  // Mint NFT with Pinata and on-chain
  const handleMint = async (e) => {
    e.preventDefault();
    if (!validateForm() || isMinting) return;
    if (!isConnected || !address) {
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

      // 2. Upload metadata to PinataAdd commentMore actions
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

      // 3. Mint NFT on blockchain using wagmi (tokenURI is the image IPFS URL)
      writeContract({
        address: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
        abi: contractABI,
        functionName: 'mint',
        args: [address, tokenURI],
        chainId: 11155111, // Sepolia
      });

      // Reset form
      setForm({ name: '', description: '', attr1Name: '', attr1Value: '' });
      setSelectedImage(null);
      setImagePreview(null);
      if (imageInputRef.current) imageInputRef.current.value = '';
    } catch (error) {
      alert('Minting failed: ' + (error.reason || error.message));
    } finally {
      setIsMinting(false);
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
        <ConnectButton />
        {isConnected && (
          <div className="text-green-400 font-semibold">
            Connected: {address.slice(0, 6)}...{address.slice(-4)} ({balance?.formatted} {balance?.symbol})
          </div>
        )}
        <form onSubmit={handleMint}>
          {/* NFT Name */}
          <input
            type="text"
            id="name"
            placeholder="NFT Name"
            value={form.name}
            onChange={handleInputChange}
            required
          />
          {/* Description */}
          <textarea
            id="description"
            placeholder="Description"
            value={form.description}
            onChange={handleInputChange}
            required
          />
          {/* Image Upload */}
          <input
            type="file"
            accept="image/*"
            ref={imageInputRef}
            onChange={e => e.target.files.length > 0 && handleImageUpload(e.target.files[0])}
          />
          {imagePreview && (
            <div>
              <img src={imagePreview} alt="Preview" style={{ maxWidth: 200 }} />
              <button type="button" onClick={handleRemoveImage}>Remove</button>
            </div>
          )}
          {/* Optional Attribute */}
          <input
            type="text"
            id="attr1Name"
            placeholder="Trait name (optional)"
            value={form.attr1Name}
            onChange={handleInputChange}
          />
          <input
            type="text"
            id="attr1Value"
            placeholder="Trait value (optional)"
            value={form.attr1Value}
            onChange={handleInputChange}
          />
          <button type="submit" disabled={!validateForm() || isMinting}>
            {isMinting ? 'Minting...' : 'Mint NFT'}
          </button>
        </form>
        {isSuccess && txData && (
          <div>
            <p>NFT Minted!</p>
            <a
              href={`https://sepolia.etherscan.io/tx/${txData}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#4F46E5', textDecoration: 'underline' }}
            >
              View Transaction on Etherscan
            </a>
          </div>
        )}
        {error && <div style={{ color: 'red' }}>{error.message}</div>}
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