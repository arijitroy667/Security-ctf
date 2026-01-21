import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Crypto Mixer CTF - Ignition Deployment Module
 * 
 * Deploys:
 * 1. TimingVulnerableMixer - The vulnerable mixer contract
 * 2. TimingAnalyzer - The exploit analyzer contract
 */
const CryptoMixerModule = buildModule("CryptoMixer", (m) => {
  // Deploy the vulnerable mixer
  const mixer = m.contract("TimingVulnerableMixer", [], { id: "TimingVulnerableMixer" });

  // Deploy the analyzer, linked to the mixer
  const analyzer = m.contract("TimingAnalyzer", [mixer], { id: "TimingAnalyzer" });

  return { mixer, analyzer };
});

export default CryptoMixerModule;
